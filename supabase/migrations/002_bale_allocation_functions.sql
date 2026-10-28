-- ==============================================================================
-- O3 VARIETIES INVENTORY & ACCOUNTABILITY SYSTEM
-- MIGRATION 002: Atomic Bale Allocation, Stock Balance Views & Functions
-- ==============================================================================

-- 1. VIEW: Real-time Section Stock Balances
-- Accurately calculates physical stock from inventory_movements ledger
-- and subtracts pending damage reservations to establish available stock.
DROP VIEW IF EXISTS public.section_stock_balances CASCADE;
CREATE OR REPLACE VIEW public.section_stock_balances AS
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
  s.name,
  s.category,
  s.selling_price_kobo,
  s.low_stock_threshold,
  s.is_active,
  s.created_at,
  s.updated_at,
  COALESCE(m.physical_stock, 0)::INT AS physical_stock,
  COALESCE(d.reserved_stock, 0)::INT AS reserved_stock,
  (COALESCE(m.physical_stock, 0) - COALESCE(d.reserved_stock, 0))::INT AS available_stock
FROM public.stock_sections s
LEFT JOIN movement_totals m ON s.id = m.section_id
LEFT JOIN damage_reservations d ON s.id = d.section_id;

-- Grant select on view
GRANT SELECT ON public.section_stock_balances TO anon, authenticated;

-- 2. FUNCTION: Atomic Bale Stock Allocation
-- Allows the store owner to allocate sorted garments from a purchased bale into sections.
-- Atomically creates allocations, records ledger movements, and logs the audit event.
CREATE OR REPLACE FUNCTION public.allocate_bale_stock_atomic(
  p_batch_id UUID,
  p_allocations JSONB, -- Array of { "section_id": UUID, "quantity": INT, "allocated_cost_kobo": BIGINT }
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_item JSONB;
  v_section_id UUID;
  v_quantity INT;
  v_allocated_cost BIGINT;
  v_total_allocated_cost BIGINT := 0;
  v_total_pieces INT := 0;
  v_allocation_id UUID;
  v_allocations_count INT := 0;
  v_existing_allocated_cost BIGINT := 0;
BEGIN
  -- Security check: only super_admin can allocate bale costs & inventory
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Only the store owner (Super Admin) can allocate bale stock and costs.';
  END IF;

  -- 1. Validate Batch
  SELECT * INTO v_batch
  FROM public.stock_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bale batch % not found.', p_batch_id;
  END IF;

  IF v_batch.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot allocate stock from an archived bale batch.';
  END IF;

  IF v_batch.status = 'depleted' THEN
    RAISE EXCEPTION 'Cannot allocate stock from a depleted bale batch.';
  END IF;

  -- Calculate current allocated cost for this batch
  SELECT COALESCE(SUM(allocated_cost_kobo), 0) INTO v_existing_allocated_cost
  FROM public.batch_section_allocations
  WHERE batch_id = p_batch_id;

  -- 2. Validate input array
  IF jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'At least one section allocation is required.';
  END IF;

  -- 3. Iterate through allocations, validate each, and insert
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_section_id := (v_item->>'section_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_allocated_cost := (v_item->>'allocated_cost_kobo')::BIGINT;

    -- Validate quantity and cost
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Allocation quantity for section % must be greater than zero.', v_section_id;
    END IF;

    IF v_allocated_cost < 0 THEN
      RAISE EXCEPTION 'Allocated cost for section % cannot be negative.', v_section_id;
    END IF;

    -- Verify section exists and is active
    IF NOT EXISTS (SELECT 1 FROM public.stock_sections WHERE id = v_section_id AND is_active = true) THEN
      RAISE EXCEPTION 'Stock section % does not exist or is inactive.', v_section_id;
    END IF;

    -- Check if allocation already exists for this batch and section (prevent duplicate allocation)
    SELECT id INTO v_allocation_id
    FROM public.batch_section_allocations
    WHERE batch_id = p_batch_id AND section_id = v_section_id;

    IF FOUND THEN
      -- Update existing allocation
      UPDATE public.batch_section_allocations
      SET
        quantity_allocated = quantity_allocated + v_quantity,
        allocated_cost_kobo = allocated_cost_kobo + v_allocated_cost
      WHERE id = v_allocation_id;
    ELSE
      -- Insert new allocation record
      INSERT INTO public.batch_section_allocations (
        batch_id,
        section_id,
        quantity_allocated,
        allocated_cost_kobo
      ) VALUES (
        p_batch_id,
        v_section_id,
        v_quantity,
        v_allocated_cost
      ) RETURNING id INTO v_allocation_id;
    END IF;

    -- Atomically record stock receipt in immutable inventory ledger
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
      'bale_allocation',
      v_quantity,
      v_allocation_id,
      'batch_section_allocation',
      'Stock received from bale ' || v_batch.batch_code || ' (' || v_quantity || ' pcs)',
      p_actor_id
    );

    v_total_allocated_cost := v_total_allocated_cost + v_allocated_cost;
    v_total_pieces := v_total_pieces + v_quantity;
    v_allocations_count := v_allocations_count + 1;
  END LOOP;

  -- 4. Validate that total allocated cost does not exceed total bale cost
  IF (v_existing_allocated_cost + v_total_allocated_cost) > (v_batch.purchase_cost_kobo + v_batch.additional_costs_kobo) THEN
    RAISE EXCEPTION 'Total allocated cost (₦%) exceeds total purchase cost (₦%).',
      ((v_existing_allocated_cost + v_total_allocated_cost) / 100)::TEXT,
      ((v_batch.purchase_cost_kobo + v_batch.additional_costs_kobo) / 100)::TEXT;
  END IF;

  -- 5. Record audit log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity,
    entity_id,
    before_state,
    after_state
  ) VALUES (
    p_actor_id,
    'BALE_STOCK_ALLOCATED',
    'stock_batches',
    p_batch_id,
    jsonb_build_object('batch_code', v_batch.batch_code),
    jsonb_build_object(
      'total_pieces', v_total_pieces,
      'allocated_cost_kobo', v_total_allocated_cost,
      'allocations_count', v_allocations_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'batch_code', v_batch.batch_code,
    'total_pieces_received', v_total_pieces,
    'total_allocated_cost_kobo', v_total_allocated_cost,
    'allocations_count', v_allocations_count
  );
END;
$$;
