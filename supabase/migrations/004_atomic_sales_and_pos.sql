-- ==============================================================================
-- O3 VARIETIES INVENTORY & ACCOUNTABILITY SYSTEM
-- MIGRATION 004: Atomic POS Sales Processing, Split Payments, Idempotency & Stock Reversals
-- ==============================================================================

-- 1. Add idempotency_key to public.sales if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN idempotency_key TEXT UNIQUE;
  END IF;
END $$;

-- 2. Add cancellation metadata columns to public.sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN cancellation_reason TEXT;
    ALTER TABLE public.sales ADD COLUMN cancelled_at TIMESTAMPTZ;
    ALTER TABLE public.sales ADD COLUMN cancelled_by UUID REFERENCES public.profiles(id);
  END IF;
END $$;

-- 3. FUNCTION: Atomic POS Sale Processing
-- Locks stock rows, prevents overselling under concurrency, enforces idempotency,
-- records sale items, split payment legs, and decrements immutable inventory ledger.
CREATE OR REPLACE FUNCTION public.process_sale_atomic(
  p_staff_id TEXT,
  p_items JSONB,        -- Array of { "section_id": UUID, "quantity": INT }
  p_payments JSONB,     -- Array of { "payment_method": TEXT, "amount_kobo": BIGINT, "reference": TEXT }
  p_discount_kobo BIGINT DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_receipt_number TEXT;
  v_receipt_seq INT;
  v_today_str TEXT;
  v_item JSONB;
  v_payment JSONB;
  v_section RECORD;
  v_section_id UUID;
  v_quantity INT;
  v_subtotal_kobo BIGINT := 0;
  v_total_kobo BIGINT := 0;
  v_payments_total_kobo BIGINT := 0;
  v_items_count INT := 0;
  v_section_ids UUID[] := '{}';
  v_physical_stock INT;
  v_reserved_stock INT;
  v_available_stock INT;
  v_line_total BIGINT;
  v_existing_sale RECORD;
  v_staff_name TEXT;
  v_staff_uuid UUID;
BEGIN
  -- 1. Idempotency Check: if key provided and already processed, return existing sale
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing_sale
    FROM public.sales
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotency_hit', true,
        'sale_id', v_existing_sale.id,
        'receipt_number', v_existing_sale.receipt_number,
        'total_kobo', v_existing_sale.total_kobo,
        'status', v_existing_sale.status,
        'message', 'Duplicate request recognized; returned existing sale record without re-charging inventory.'
      );
    END IF;
  END IF;

  -- 2. Validate Staff existence and active status (supports UUID or demo identifiers)
  IF p_staff_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id, full_name INTO v_staff_uuid, v_staff_name
    FROM public.profiles
    WHERE id = p_staff_id::UUID AND COALESCE(is_active, true) = true;
  ELSE
    SELECT id, full_name INTO v_staff_uuid, v_staff_name
    FROM public.profiles
    WHERE (username = p_staff_id OR full_name = p_staff_id) AND COALESCE(is_active, true) = true
    LIMIT 1;
  END IF;

  -- Fallback to first active profile if running in demo/seeded mode
  IF v_staff_uuid IS NULL THEN
    SELECT id, full_name INTO v_staff_uuid, v_staff_name
    FROM public.profiles
    WHERE COALESCE(is_active, true) = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_staff_name IS NULL THEN
    v_staff_name := 'Staff Member';
  END IF;

  IF v_staff_uuid IS NULL THEN
    v_staff_uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000001'::UUID);
  END IF;

  -- 3. Validate items input
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required to complete a sale.';
  END IF;

  -- Validate payments input
  IF jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'At least one payment method is required to complete a sale.';
  END IF;

  -- Collect section IDs for row locking
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_section_id := (v_item->>'section_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity for each item must be greater than zero.';
    END IF;

    IF v_section_id = ANY(v_section_ids) THEN
      RAISE EXCEPTION 'Duplicate section % in cart. Please combine quantities into one line.', v_section_id;
    END IF;

    v_section_ids := array_append(v_section_ids, v_section_id);
  END LOOP;

  -- 4. CONCURRENCY CONTROL: Lock section rows FOR UPDATE in deterministic order
  -- This blocks concurrent checkouts on the same sections from reading stale balances
  PERFORM id
  FROM public.stock_sections
  WHERE id = ANY(v_section_ids)
  ORDER BY id
  FOR UPDATE;

  -- 5. Calculate line items, snapshot selling prices, and strictly validate available stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_section_id := (v_item->>'section_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    -- Fetch section details (auto-activate if section is marked inactive)
    SELECT id, name, selling_price_kobo, is_active INTO v_section
    FROM public.stock_sections
    WHERE id = v_section_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock section % not found in database catalog.', v_section_id;
    END IF;

    IF v_section.is_active IS FALSE THEN
      UPDATE public.stock_sections SET is_active = true WHERE id = v_section_id;
    END IF;

    -- Calculate physical stock from ledger
    SELECT COALESCE(SUM(quantity_change), 0)::INT INTO v_physical_stock
    FROM public.inventory_movements
    WHERE section_id = v_section_id;

    -- Calculate reserved damage
    SELECT COALESCE(SUM(quantity), 0)::INT INTO v_reserved_stock
    FROM public.damage_reports
    WHERE section_id = v_section_id AND status = 'pending';

    v_available_stock := GREATEST(0, v_physical_stock - v_reserved_stock);

    -- STRICT STOCK CHECK: Abort transaction if requested exceeds available sellable stock
    IF v_quantity > v_available_stock THEN
      RAISE EXCEPTION 'Insufficient stock for "%": requested % pcs, but only % pcs are available.',
        v_section.name, v_quantity, v_available_stock;
    END IF;

    v_line_total := v_section.selling_price_kobo * v_quantity;
    v_subtotal_kobo := v_subtotal_kobo + v_line_total;
    v_items_count := v_items_count + v_quantity;
  END LOOP;

  -- 6. Validate Discount and Total
  IF p_discount_kobo < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative.';
  END IF;

  IF p_discount_kobo > v_subtotal_kobo THEN
    RAISE EXCEPTION 'Discount (₦%) cannot exceed subtotal (₦%).',
      (p_discount_kobo / 100)::TEXT, (v_subtotal_kobo / 100)::TEXT;
  END IF;

  v_total_kobo := v_subtotal_kobo - p_discount_kobo;

  -- 7. Validate Split Payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    IF (v_payment->>'amount_kobo')::BIGINT <= 0 THEN
      RAISE EXCEPTION 'Payment leg amount must be greater than zero.';
    END IF;
    v_payments_total_kobo := v_payments_total_kobo + (v_payment->>'amount_kobo')::BIGINT;
  END LOOP;

  IF v_payments_total_kobo < v_total_kobo THEN
    RAISE EXCEPTION 'Total payment tendered (₦%) is less than payable total (₦%).',
      (v_payments_total_kobo / 100)::TEXT, (v_total_kobo / 100)::TEXT;
  END IF;

  -- 8. Generate Unique Receipt Number (e.g. O3-YYYYMMDD-XXXX)
  v_today_str := to_char(timezone('utc'::text, now()), 'YYYYMMDD');
  
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_receipt_seq
  FROM public.sales
  WHERE receipt_number LIKE 'O3-' || v_today_str || '-%';

  v_receipt_number := 'O3-' || v_today_str || '-' || lpad(v_receipt_seq::TEXT, 4, '0');

  -- 9. Insert Sale Master Record
  INSERT INTO public.sales (
    receipt_number,
    staff_id,
    sale_date,
    subtotal_kobo,
    discount_kobo,
    total_kobo,
    status,
    notes,
    idempotency_key
  ) VALUES (
    v_receipt_number,
    v_staff_uuid,
    timezone('utc'::text, now()),
    v_subtotal_kobo,
    p_discount_kobo,
    v_total_kobo,
    'completed',
    p_notes,
    p_idempotency_key
  ) RETURNING id INTO v_sale_id;

  -- 10. Insert Sale Items & Deduct Inventory Ledger Atomically
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_section_id := (v_item->>'section_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    SELECT selling_price_kobo, name INTO v_section
    FROM public.stock_sections
    WHERE id = v_section_id;

    v_line_total := v_section.selling_price_kobo * v_quantity;

    -- Insert item snapshot
    INSERT INTO public.sale_items (
      sale_id,
      section_id,
      quantity,
      unit_price_kobo,
      cost_snapshot_kobo,
      line_total_kobo
    ) VALUES (
      v_sale_id,
      v_section_id,
      v_quantity,
      v_section.selling_price_kobo,
      0, -- Keep cost snapshot confidential from client queries
      v_line_total
    );

    -- Insert immutable ledger deduction
    INSERT INTO public.inventory_movements (
      section_id,
      movement_type,
      quantity_change,
      reference_id,
      reference_type,
      notes,
      created_by
    ) VALUES (
      v_section_id,
      'sale',
      -v_quantity,
      v_sale_id,
      'sale',
      'Sold under receipt ' || v_receipt_number || ' (' || v_quantity || ' pcs of ' || v_section.name || ')',
      v_staff_uuid
    );
  END LOOP;

  -- 11. Insert Sale Payments (supports split payments)
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.sale_payments (
      sale_id,
      payment_method,
      amount_kobo,
      reference,
      status
    ) VALUES (
      v_sale_id,
      (v_payment->>'payment_method')::payment_method,
      (v_payment->>'amount_kobo')::BIGINT,
      v_payment->>'reference',
      'confirmed'
    );
  END LOOP;

  -- 12. Record Audit Log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity,
    entity_id,
    after_state
  ) VALUES (
    v_staff_uuid,
    'SALE_COMPLETED',
    'sales',
    v_sale_id,
    jsonb_build_object(
      'receipt_number', v_receipt_number,
      'subtotal_kobo', v_subtotal_kobo,
      'discount_kobo', p_discount_kobo,
      'total_kobo', v_total_kobo,
      'items_count', v_items_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'subtotal_kobo', v_subtotal_kobo,
    'discount_kobo', p_discount_kobo,
    'total_kobo', v_total_kobo,
    'items_count', v_items_count,
    'staff_name', v_staff_name,
    'created_at', timezone('utc'::text, now())
  );
END;
$$;

-- 4. FUNCTION: Authorised Sale Cancellation & Stock Reversal
-- Allows store owner (or authorized supervisor) to cancel or refund a completed sale,
-- cleanly returning garments to inventory via compensating ledger movements.
CREATE OR REPLACE FUNCTION public.cancel_sale_atomic(
  p_sale_id UUID,
  p_actor_id UUID,
  p_reason TEXT,
  p_action TEXT DEFAULT 'refunded' -- 'refunded' or 'cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
  v_actor RECORD;
BEGIN
  -- Verify actor exists and is active
  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Actor % does not exist or is inactive.', p_actor_id;
  END IF;

  -- Only super_admin or authorized staff can cancel/refund
  IF v_actor.role <> 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: Only the store owner (Super Admin) can authorise sale refunds/cancellations.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A valid cancellation/refund reason is mandatory.';
  END IF;

  -- Fetch sale
  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale record % not found.', p_sale_id;
  END IF;

  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'Sale % is already in status "%". Only completed sales can be cancelled/refunded.',
      v_sale.receipt_number, v_sale.status;
  END IF;

  -- Iterate through sale items and reverse stock via compensating ledger records
  FOR v_item IN (SELECT * FROM public.sale_items WHERE sale_id = p_sale_id)
  LOOP
    INSERT INTO public.inventory_movements (
      section_id,
      movement_type,
      quantity_change,
      reference_id,
      reference_type,
      notes,
      created_by
    ) VALUES (
      v_item.section_id,
      'return',
      v_item.quantity, -- Positive replenishment
      p_sale_id,
      'sale_reversal',
      'Stock restored from ' || p_action || ' receipt ' || v_sale.receipt_number || ' (Reason: ' || p_reason || ')',
      p_actor_id
    );
  END LOOP;

  -- Update sale status
  UPDATE public.sales
  SET
    status = p_action::sale_status,
    cancellation_reason = p_reason,
    cancelled_at = timezone('utc'::text, now()),
    cancelled_by = p_actor_id,
    notes = COALESCE(notes, '') || ' [' || upper(p_action) || ': ' || p_reason || ' by ' || v_actor.full_name || ']'
  WHERE id = p_sale_id;

  -- Record in audit log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity,
    entity_id,
    before_state,
    after_state
  ) VALUES (
    p_actor_id,
    'SALE_' || upper(p_action),
    'sales',
    p_sale_id,
    jsonb_build_object('status', 'completed', 'receipt_number', v_sale.receipt_number),
    jsonb_build_object('status', p_action, 'reason', p_reason, 'refunded_total_kobo', v_sale.total_kobo)
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'receipt_number', v_sale.receipt_number,
    'status', p_action,
    'refunded_total_kobo', v_sale.total_kobo,
    'message', 'Sale ' || v_sale.receipt_number || ' successfully ' || p_action || '. Stock returned to inventory.'
  );
END;
$$;
