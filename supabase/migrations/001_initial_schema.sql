-- ==============================================================================
-- O3 VARIETIES INVENTORY & ACCOUNTABILITY SYSTEM
-- MIGRATION 001: Initial Core Schema, RLS Policies, Functions and Constraints
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CUSTOM ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'staff');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE damage_type AS ENUM ('tear', 'stain', 'burn', 'dent', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE damage_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE batch_status AS ENUM ('active', 'depleted', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('completed', 'refunded', 'reversed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'pos_card', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('open', 'closed', 'flagged');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM (
    'bale_allocation',
    'sale',
    'damage_deduction',
    'damage_reservation',
    'damage_release',
    'return',
    'reversal',
    'audit_adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'staff',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. STOCK SECTIONS (Clothing sections sold by unit price)
CREATE TABLE IF NOT EXISTS public.stock_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  selling_price_kobo BIGINT NOT NULL CHECK (selling_price_kobo >= 0),
  low_stock_threshold INT NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. STOCK BATCHES (Bales purchased - Owner only access)
CREATE TABLE IF NOT EXISTS public.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,
  supplier TEXT NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purchase_cost_kobo BIGINT NOT NULL CHECK (purchase_cost_kobo >= 0),
  additional_costs_kobo BIGINT NOT NULL DEFAULT 0 CHECK (additional_costs_kobo >= 0),
  status batch_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. BATCH SECTION ALLOCATIONS (Sorted bale items assigned to sections)
CREATE TABLE IF NOT EXISTS public.batch_section_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.stock_batches(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.stock_sections(id) ON DELETE RESTRICT,
  quantity_allocated INT NOT NULL CHECK (quantity_allocated > 0),
  allocated_cost_kobo BIGINT NOT NULL CHECK (allocated_cost_kobo >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. SALES
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  staff_id UUID NOT NULL REFERENCES public.profiles(id),
  sale_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  subtotal_kobo BIGINT NOT NULL CHECK (subtotal_kobo >= 0),
  discount_kobo BIGINT NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0),
  total_kobo BIGINT NOT NULL CHECK (total_kobo >= 0),
  status sale_status NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. SALE ITEMS (Snapshots exact historical price and cost)
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.stock_sections(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_kobo BIGINT NOT NULL CHECK (unit_price_kobo >= 0),
  cost_snapshot_kobo BIGINT DEFAULT 0 CHECK (cost_snapshot_kobo >= 0),
  line_total_kobo BIGINT NOT NULL CHECK (line_total_kobo >= 0)
);

-- 9. SALE PAYMENTS (Supports split payments)
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. DAMAGE REPORTS
CREATE TABLE IF NOT EXISTS public.damage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id),
  section_id UUID NOT NULL REFERENCES public.stock_sections(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  damage_type damage_type NOT NULL,
  description TEXT NOT NULL,
  photo_storage_path TEXT,
  status damage_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. INVENTORY MOVEMENTS (Immutable Ledger)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.stock_sections(id) ON DELETE RESTRICT,
  movement_type movement_type NOT NULL,
  quantity_change INT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. STOCK COUNTS (Physical count & variance reconciliation)
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.stock_sections(id),
  expected_quantity INT NOT NULL,
  counted_quantity INT NOT NULL,
  variance INT GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
  counted_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. CASH SESSIONS
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  opening_cash_kobo BIGINT NOT NULL DEFAULT 0 CHECK (opening_cash_kobo >= 0),
  expected_cash_kobo BIGINT NOT NULL DEFAULT 0,
  counted_cash_kobo BIGINT,
  variance_kobo BIGINT,
  status session_status NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 14. RECONCILIATION ENTRIES
CREATE TABLE IF NOT EXISTS public.reconciliation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  expected_amount_kobo BIGINT NOT NULL DEFAULT 0,
  actual_amount_kobo BIGINT NOT NULL DEFAULT 0,
  variance_kobo BIGINT GENERATED ALWAYS AS (actual_amount_kobo - expected_amount_kobo) STORED
);

-- 15. EXPENSES (Owner Only)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 16. AUDIT LOGS (Append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 17. SECURITY DEFINER HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 18. ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_section_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 19. RLS POLICIES

-- PROFILES
DROP POLICY IF EXISTS "Active users can view basic profiles" ON public.profiles;
CREATE POLICY "Active users can view basic profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Super admin can manage profiles" ON public.profiles;
CREATE POLICY "Super admin can manage profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- STOCK SECTIONS
DROP POLICY IF EXISTS "Active staff can view stock sections" ON public.stock_sections;
CREATE POLICY "Active staff can view stock sections"
  ON public.stock_sections FOR SELECT
  TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS "Super admin can manage stock sections" ON public.stock_sections;
CREATE POLICY "Super admin can manage stock sections"
  ON public.stock_sections FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- STOCK BATCHES (Owner ONLY - Staff must NEVER access bale costs)
DROP POLICY IF EXISTS "Super admin only stock batches" ON public.stock_batches;
CREATE POLICY "Super admin only stock batches"
  ON public.stock_batches FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- BATCH SECTION ALLOCATIONS (Owner ONLY)
DROP POLICY IF EXISTS "Super admin only batch allocations" ON public.batch_section_allocations;
CREATE POLICY "Super admin only batch allocations"
  ON public.batch_section_allocations FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- SALES: Staff can ONLY view their own sales; Super Admin views the overall store sales board
DROP POLICY IF EXISTS "Active staff can view sales" ON public.sales;
DROP POLICY IF EXISTS "Staff can view own sales or super admin view all" ON public.sales;
CREATE POLICY "Staff can view own sales or super admin view all"
  ON public.sales FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin() OR (auth.uid() = staff_id AND public.is_active_staff())
  );

DROP POLICY IF EXISTS "Active staff can create sales" ON public.sales;
CREATE POLICY "Active staff can create sales"
  ON public.sales FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_staff() AND auth.uid() = staff_id);

DROP POLICY IF EXISTS "Super admin can manage sales" ON public.sales;
CREATE POLICY "Super admin can manage sales"
  ON public.sales FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- SALE ITEMS: Staff can only view line items for their own sales; Super Admin views all
DROP POLICY IF EXISTS "Active staff can view sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Staff can view own sale items or super admin view all" ON public.sale_items;
CREATE POLICY "Staff can view own sale items or super admin view all"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin() OR
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.staff_id = auth.uid()
        AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "Active staff can insert sale items" ON public.sale_items;
CREATE POLICY "Active staff can insert sale items"
  ON public.sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.staff_id = auth.uid()
        AND public.is_active_staff()
    )
  );

-- SALE PAYMENTS: Staff can only view and manage payments for their own sales; Super Admin views all
DROP POLICY IF EXISTS "Active staff can view and insert payments" ON public.sale_payments;
DROP POLICY IF EXISTS "Staff can view own payments or super admin view all" ON public.sale_payments;
CREATE POLICY "Staff can view own payments or super admin view all"
  ON public.sale_payments FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin() OR
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_payments.sale_id
        AND s.staff_id = auth.uid()
        AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "Staff can insert own sale payments" ON public.sale_payments;
CREATE POLICY "Staff can insert own sale payments"
  ON public.sale_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin() OR
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_payments.sale_id
        AND s.staff_id = auth.uid()
        AND public.is_active_staff()
    )
  );

-- DAMAGE REPORTS
DROP POLICY IF EXISTS "Staff can view damage reports" ON public.damage_reports;
CREATE POLICY "Staff can view damage reports"
  ON public.damage_reports FOR SELECT
  TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS "Staff can submit damage reports" ON public.damage_reports;
CREATE POLICY "Staff can submit damage reports"
  ON public.damage_reports FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_staff() AND auth.uid() = staff_id AND status = 'pending');

DROP POLICY IF EXISTS "Super admin can review damage reports" ON public.damage_reports;
CREATE POLICY "Super admin can review damage reports"
  ON public.damage_reports FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- INVENTORY MOVEMENTS (Ledger)
DROP POLICY IF EXISTS "Active staff can view movements" ON public.inventory_movements;
CREATE POLICY "Active staff can view movements"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (public.is_active_staff());

DROP POLICY IF EXISTS "Active staff can record authorized movements" ON public.inventory_movements;
CREATE POLICY "Active staff can record authorized movements"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_staff());

-- CASH SESSIONS
DROP POLICY IF EXISTS "Staff can view and manage their own cash session" ON public.cash_sessions;
CREATE POLICY "Staff can view and manage their own cash session"
  ON public.cash_sessions FOR ALL
  TO authenticated
  USING (public.is_super_admin() OR auth.uid() = staff_id)
  WITH CHECK (public.is_super_admin() OR auth.uid() = staff_id);

-- EXPENSES (Super Admin Only)
DROP POLICY IF EXISTS "Super admin only expenses" ON public.expenses;
CREATE POLICY "Super admin only expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- AUDIT LOGS (Super Admin view, authenticated append)
DROP POLICY IF EXISTS "Super admin can view audit logs" ON public.audit_logs;
CREATE POLICY "Super admin can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- 20. SEED INITIAL SAMPLE DATA (Can be executed safely without requiring ON CONFLICT constraint)
-- Insert standard initial clothing sections for O3 Varieties if they do not already exist
INSERT INTO public.stock_sections (name, category, selling_price_kobo, low_stock_threshold)
SELECT s.name, s.category, s.selling_price_kobo, s.low_stock_threshold
FROM (
  VALUES
    ('Men''s Corporate Shirts', 'Men', 450000, 10),
    ('Men''s Chinos & Jeans', 'Men', 600000, 10),
    ('Men''s Round Neck / Polos', 'Men', 350000, 12),
    ('Women''s Chiffon & Silk Tops', 'Women', 400000, 15),
    ('Women''s Denim Trousers', 'Women', 550000, 10),
    ('Vintage & Corporate Dresses', 'Women', 750000, 8),
    ('Women''s Skirts', 'Women', 350000, 10),
    ('Children''s Variety Wear', 'Children', 250000, 15)
) AS s(name, category, selling_price_kobo, low_stock_threshold)
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_sections existing WHERE existing.name = s.name
);

