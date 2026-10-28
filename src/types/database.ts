export type UserRole = 'super_admin' | 'staff';

export type DamageType = 'tear' | 'stain' | 'burn' | 'dent' | 'other';
export type DamageStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'pos_card' | 'other';
export type BatchStatus = 'active' | 'depleted' | 'archived';
export type SaleStatus = 'completed' | 'refunded' | 'reversed' | 'cancelled';
export type SessionStatus = 'open' | 'closed' | 'flagged';
export type MovementType =
  | 'bale_allocation'
  | 'sale'
  | 'damage_deduction'
  | 'damage_reservation'
  | 'damage_release'
  | 'return'
  | 'reversal'
  | 'audit_adjustment';

export interface UserProfile {
  id: string;
  email?: string;
  full_name: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface StockSection {
  id: string;
  section_code?: string; // Unique section identifier/SKU (e.g. SEC-001, SEC-POLO-01)
  name: string;
  category: string;
  selling_price_kobo: number; // Stored in kobo (integer)
  low_stock_threshold: number;
  is_active: boolean;
  physical_stock: number; // Total physical items counted in store
  reserved_stock: number; // Reserved due to pending damage reports (deducted from available_stock)
  approved_damage_stock?: number; // Total approved written-off damaged garments
  total_damaged_stock?: number; // Total damaged garments across board (pending + approved)
  available_stock: number; // physical_stock - reserved_stock
  created_at: string;
  updated_at?: string;
}

export interface StockBatch {
  id: string;
  batch_code: string;
  supplier: string;
  purchase_date: string;
  purchase_cost_kobo: number; // Owner only
  additional_costs_kobo: number; // Owner only: freight, clearing, sorting, etc.
  total_cost_kobo: number; // Owner only: purchase + additional
  allocated_cost_kobo: number; // Owner only: total cost allocated so far
  unallocated_cost_kobo: number; // Owner only: remaining cost to distribute
  status: BatchStatus;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface BatchSectionAllocation {
  id: string;
  batch_id: string;
  section_id: string;
  section_name?: string;
  quantity_allocated: number;
  allocated_cost_kobo: number; // Owner only
  created_at: string;
}

export interface Sale {
  id: string;
  receipt_number: string;
  staff_id: string;
  staff_name?: string;
  sale_date: string;
  subtotal_kobo: number;
  discount_kobo: number;
  total_kobo: number;
  status: SaleStatus;
  notes?: string;
  items_count?: number;
  idempotency_key?: string;
  items?: SaleItem[];
  payments?: SalePayment[];
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  canceller_name?: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  section_id: string;
  section_code?: string;
  section_name: string;
  quantity: number;
  unit_price_kobo: number; // Exact historical price snapshot
  cost_snapshot_kobo?: number; // Owner only: cost snapshot at time of sale
  line_total_kobo: number;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  payment_method: PaymentMethod;
  amount_kobo: number;
  reference?: string;
  status: 'confirmed' | 'pending' | 'failed';
  created_at: string;
}

// Phase 3 POS Input & Working Types
export interface CartItem {
  section: StockSection;
  quantity: number;
  unit_price_kobo: number;
  line_total_kobo: number;
}

export interface SplitPaymentEntry {
  method: PaymentMethod;
  amount_kobo: number;
  reference?: string;
}

export interface CreateSalePayload {
  staff_id: string;
  staff_name?: string;
  items: { section_id: string; quantity: number }[];
  payments: SplitPaymentEntry[];
  discount_kobo?: number;
  notes?: string;
  idempotency_key?: string;
}

export interface SaleCancellationPayload {
  sale_id: string;
  actor_id: string;
  actor_name?: string;
  reason: string;
  action_type: 'cancelled' | 'refunded';
}

export interface DamageReport {
  id: string;
  staff_id: string;
  staff_name?: string;
  section_id: string;
  section_code?: string;
  section_name: string;
  quantity: number;
  damage_type: DamageType;
  description: string;
  photo_storage_path?: string;
  photo_url?: string;
  status: DamageStatus;
  reviewed_by?: string;
  reviewer_name?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  idempotency_key?: string;
  reporter_role?: UserRole;
  is_owner_report?: boolean;
  created_at: string;
}

export interface SubmitDamagePayload {
  staff_id: string;
  staff_name?: string;
  reporter_role?: UserRole;
  is_owner_report?: boolean;
  section_id: string;
  quantity: number;
  damage_type: DamageType;
  description: string;
  photo_storage_path?: string;
  photo_file?: File;
  photo_url?: string;
  idempotency_key?: string;
}

export interface ReviewDamagePayload {
  report_id: string;
  actor_id?: string;
  actor_role?: UserRole;
  actor_name?: string;
  // Aliases for component and script compatibility
  reviewer_id?: string;
  reviewer_role?: UserRole;
  reviewer_name?: string;
  action: 'approve' | 'reject';
  rejection_reason?: string;
}

export interface InventoryMovement {
  id: string;
  section_id: string;
  section_name: string;
  movement_type: MovementType;
  quantity_change: number; // e.g. -2 for sale, +50 for bale allocation
  resulting_balance?: number;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_by: string;
  creator_name?: string;
  created_at: string;
}

export interface CashSession {
  id: string;
  staff_id: string;
  staff_name?: string;
  opened_at: string;
  closed_at?: string;
  opening_cash_kobo: number;
  expected_cash_kobo: number;
  counted_cash_kobo?: number;
  variance_kobo?: number;
  status: SessionStatus;
  notes?: string;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  category: 'rent' | 'utilities' | 'transport' | 'supplies' | 'repairs' | 'staff_welfare' | 'other';
  amount_kobo: number; // Owner only
  expense_date: string;
  recorded_by: string;
  recorder_name?: string;
  approved_by?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name?: string;
  action: string;
  entity: string;
  entity_id?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}
