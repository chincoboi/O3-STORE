-- ==============================================================================
-- O3 VARIETIES INVENTORY & ACCOUNTABILITY SYSTEM
-- MIGRATION 005: Unique Section Codes, Distinct Identifiers & Anti-Collision
-- ==============================================================================

-- 1. Add section_code column to public.stock_sections if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_sections'
      AND column_name = 'section_code'
  ) THEN
    ALTER TABLE public.stock_sections ADD COLUMN section_code TEXT;
  END IF;
END $$;

-- 2. Populate existing stock sections with distinct, clean unique identifiers (e.g. SEC-001, SEC-002...)
DO $$
DECLARE
  r RECORD;
  i INT := 1;
BEGIN
  FOR r IN SELECT id FROM public.stock_sections WHERE section_code IS NULL OR section_code = '' ORDER BY created_at ASC LOOP
    UPDATE public.stock_sections
    SET section_code = 'SEC-' || LPAD(i::TEXT, 3, '0')
    WHERE id = r.id;
    i := i + 1;
  END LOOP;
END $$;

-- 3. Remove unique constraint on name so duplicate section names (e.g. multiple "Polo Shirt" sections) are permitted
ALTER TABLE public.stock_sections DROP CONSTRAINT IF EXISTS stock_sections_name_key;
ALTER TABLE public.stock_sections DROP CONSTRAINT IF EXISTS stock_sections_name_unique;

-- 4. Recreate View: section_stock_balances to include section_code
-- Postgres requires dropping the view first when column order or names change
DROP VIEW IF EXISTS public.section_stock_balances CASCADE;

CREATE VIEW public.section_stock_balances AS
WITH movement_totals AS (
  SELECT
    section_id,
    COALESCE(SUM(quantity_change), 0)::INT AS physical_stock
  FROM public.inventory_movements
  GROUP BY section_id
),
damage_reservations AS (
  SELECT
    section_id,
    COALESCE(SUM(quantity), 0)::INT AS reserved_stock
  FROM public.damage_reports
  WHERE status = 'pending'
  GROUP BY section_id
)
SELECT
  s.id,
  COALESCE(s.section_code, 'SEC-' || substring(s.id::text, 1, 4)) AS section_code,
  s.name,
  s.category,
  s.selling_price_kobo,
  s.low_stock_threshold,
  COALESCE(s.is_active, true) AS is_active,
  s.created_at,
  s.updated_at,
  COALESCE(m.physical_stock, 0)::INT AS physical_stock,
  COALESCE(d.reserved_stock, 0)::INT AS reserved_stock,
  GREATEST(0, (COALESCE(m.physical_stock, 0) - COALESCE(d.reserved_stock, 0)))::INT AS available_stock
FROM public.stock_sections s
LEFT JOIN movement_totals m ON s.id = m.section_id
LEFT JOIN damage_reservations d ON s.id = d.section_id;

GRANT SELECT ON public.section_stock_balances TO anon, authenticated;

-- Ensure RLS allows operations from web client (anon & authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_sections' AND policyname = 'Public access for stock_sections'
  ) THEN
    CREATE POLICY "Public access for stock_sections" ON public.stock_sections FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Update atomic POS processing to report exact section_code in validation error messages
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
  v_sec_code TEXT;
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

  -- 2. Resolve Staff Profile
  IF p_staff_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT id, full_name INTO v_staff_uuid, v_staff_name
    FROM public.profiles
    WHERE id = p_staff_id::UUID AND is_active = true;
  ELSE
    SELECT id, full_name INTO v_staff_uuid, v_staff_name
    FROM public.profiles
    WHERE is_active = true
    ORDER BY (role = 'staff') DESC, created_at ASC
    LIMIT 1;
  END IF;

  IF v_staff_name IS NULL THEN
    v_staff_name := 'Authorized Floor Staff';
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

    -- Fetch section details
    SELECT id, name, section_code, selling_price_kobo, is_active INTO v_section
    FROM public.stock_sections
    WHERE id = v_section_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock section % not found in database catalog.', v_section_id;
    END IF;

    v_sec_code := COALESCE(v_section.section_code, substring(v_section.id::text, 1, 7));

    -- Auto-activate section if inactive
    IF v_section.is_active IS NULL OR v_section.is_active = false THEN
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
    -- Clearly reports section name AND unique section code
    IF v_quantity > v_available_stock THEN
      RAISE EXCEPTION 'Insufficient stock for "%" [%]: requested % pcs, but only % pcs are available.',
        v_section.name, v_sec_code, v_quantity, v_available_stock;
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

  -- 8. Generate Unique Receipt Number
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
    COALESCE(v_staff_uuid, gen_random_uuid()),
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

    SELECT selling_price_kobo, name, section_code INTO v_section
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
      0,
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
      'sales',
      'Sold via POS Receipt ' || v_receipt_number || ' (' || v_section.name || ' [' || COALESCE(v_section.section_code, substring(v_section_id::text, 1, 7)) || '])',
      v_staff_uuid
    );
  END LOOP;

  -- 11. Insert Split Payment Legs
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

  -- 12. Return completed sale master summary
  RETURN jsonb_build_object(
    'success', true,
    'idempotency_hit', false,
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'total_kobo', v_total_kobo,
    'status', 'completed',
    'items_count', v_items_count,
    'staff_name', v_staff_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale_atomic(TEXT, JSONB, JSONB, BIGINT, TEXT, TEXT) TO anon, authenticated;

-- Ensure web client can select from sales, sale_items, and sale_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sales' AND policyname = 'Public read for sales'
  ) THEN
    CREATE POLICY "Public read for sales" ON public.sales FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sale_items' AND policyname = 'Public read for sale_items'
  ) THEN
    CREATE POLICY "Public read for sale_items" ON public.sale_items FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sale_payments' AND policyname = 'Public read for sale_payments'
  ) THEN
    CREATE POLICY "Public read for sale_payments" ON public.sale_payments FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

