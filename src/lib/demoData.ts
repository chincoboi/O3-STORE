import {
  UserProfile,
  StockSection,
  StockBatch,
  Sale,
  DamageReport,
  CashSession,
  Expense,
  InventoryMovement,
} from '../types/database';

export const DEMO_OWNER: UserProfile = {
  id: 'demo-owner-001',
  email: 'owner@o3varieties.ng',
  full_name: 'Olumide Oladipo (Store Owner)',
  username: 'olumide_owner',
  role: 'super_admin',
  is_active: true,
  created_at: '2026-01-15T08:00:00Z',
};

export const DEMO_STAFF: UserProfile = {
  id: 'demo-staff-002',
  email: 'chidinma@o3varieties.ng',
  full_name: 'Chidinma Eze (Cashier / Floor Staff)',
  username: 'chidinma_cashier',
  role: 'staff',
  is_active: true,
  created_at: '2026-02-01T09:00:00Z',
};

export const DEMO_STAFF_2: UserProfile = {
  id: 'demo-staff-003',
  email: 'babatunde@o3varieties.ng',
  full_name: 'Babatunde Adeleke (Floor Staff / Shift 2)',
  username: 'babatunde_cashier',
  role: 'staff',
  is_active: true,
  created_at: '2026-02-15T09:00:00Z',
};

export const DEMO_SECTIONS: StockSection[] = [
  {
    id: 'sec-1',
    section_code: 'SEC-001',
    name: "Men's Corporate Shirts",
    category: 'Men',
    selling_price_kobo: 450000, // ₦4,500.00
    low_stock_threshold: 15,
    is_active: true,
    physical_stock: 45,
    reserved_stock: 2, // 2 items pending damage review (dmg-001)
    available_stock: 43, // 45 - 2 = 43 pcs available for sale
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-2',
    section_code: 'SEC-002',
    name: "Men's Chinos & Denim Trousers",
    category: 'Men',
    selling_price_kobo: 600000, // ₦6,000.00
    low_stock_threshold: 12,
    is_active: true,
    physical_stock: 28,
    reserved_stock: 0,
    available_stock: 28,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-3',
    section_code: 'SEC-003',
    name: "Men's Round Neck & Polos",
    category: 'Men',
    selling_price_kobo: 350000, // ₦3,500.00
    low_stock_threshold: 20,
    is_active: true,
    physical_stock: 42,
    reserved_stock: 0,
    available_stock: 42,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-4',
    section_code: 'SEC-004',
    name: "Women's Chiffon & Silk Tops",
    category: 'Women',
    selling_price_kobo: 400000, // ₦4,000.00
    low_stock_threshold: 15,
    is_active: true,
    physical_stock: 56,
    reserved_stock: 3, // 3 items pending damage review (dmg-002)
    available_stock: 53, // 56 - 3 = 53 pcs available for sale
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-5',
    section_code: 'SEC-005',
    name: "Women's Denim & Palazzo Pants",
    category: 'Women',
    selling_price_kobo: 550000, // ₦5,500.00
    low_stock_threshold: 15,
    is_active: true,
    physical_stock: 34,
    reserved_stock: 0,
    available_stock: 34,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-6',
    section_code: 'SEC-006',
    name: 'Vintage & Corporate Dresses',
    category: 'Women',
    selling_price_kobo: 750000, // ₦7,500.00
    low_stock_threshold: 10,
    is_active: true,
    physical_stock: 22,
    reserved_stock: 0,
    available_stock: 22,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-7',
    section_code: 'SEC-007',
    name: "Women's Skirts & Gowns",
    category: 'Women',
    selling_price_kobo: 350000, // ₦3,500.00
    low_stock_threshold: 10,
    is_active: true,
    physical_stock: 19,
    reserved_stock: 0,
    available_stock: 19,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'sec-8',
    section_code: 'SEC-008',
    name: "Children's Variety Wear",
    category: 'Children',
    selling_price_kobo: 250000, // ₦2,500.00
    low_stock_threshold: 20,
    is_active: true,
    physical_stock: 50,
    reserved_stock: 0,
    available_stock: 50,
    created_at: '2026-01-20T10:00:00Z',
  },
];

export const DEMO_BATCHES: StockBatch[] = [
  {
    id: 'batch-001',
    batch_code: 'BAL-2026-OCT-01',
    supplier: 'Cotonou Direct Importers',
    purchase_date: '2026-10-18',
    purchase_cost_kobo: 32000000, // ₦320,000.00
    additional_costs_kobo: 4500000, // ₦45,000.00 (freight & offloading)
    total_cost_kobo: 36500000, // ₦365,000.00
    allocated_cost_kobo: 36500000,
    unallocated_cost_kobo: 0,
    status: 'active',
    notes: 'Grade A UK First Selection Bale - 180 pcs total',
    created_by: 'demo-owner-001',
    created_at: '2026-10-18T14:30:00Z',
  },
  {
    id: 'batch-002',
    batch_code: 'BAL-2026-OCT-02',
    supplier: 'Alaba International Bale Merchant',
    purchase_date: '2026-10-22',
    purchase_cost_kobo: 28000000, // ₦280,000.00
    additional_costs_kobo: 3000000, // ₦30,000.00
    total_cost_kobo: 31000000, // ₦310,000.00
    allocated_cost_kobo: 20000000,
    unallocated_cost_kobo: 11000000, // ₦110,000.00 still unallocated
    status: 'active',
    notes: "Women's Chiffon Tops Bale - Sorting in progress",
    created_by: 'demo-owner-001',
    created_at: '2026-10-22T11:15:00Z',
  },
];

export const DEMO_SALES: Sale[] = [
  {
    id: 'sale-101',
    receipt_number: 'O3-20261024-001',
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    sale_date: '2026-10-24T09:30:00Z',
    subtotal_kobo: 1500000, // ₦15,000.00
    discount_kobo: 0,
    total_kobo: 1500000,
    status: 'completed',
    items_count: 3,
    notes: 'Customer paid with split: Cash + Bank Transfer',
    created_at: '2026-10-24T09:30:00Z',
  },
  {
    id: 'sale-102',
    receipt_number: 'O3-20261024-002',
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    sale_date: '2026-10-24T10:45:00Z',
    subtotal_kobo: 2250000, // ₦22,500.00
    discount_kobo: 100000, // ₦1,000.00
    total_kobo: 2150000,
    status: 'completed',
    items_count: 4,
    notes: 'POS transaction confirmed',
    created_at: '2026-10-24T10:45:00Z',
  },
  {
    id: 'sale-103',
    receipt_number: 'O3-20261024-003',
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    sale_date: '2026-10-24T11:20:00Z',
    subtotal_kobo: 900000, // ₦9,000.00
    discount_kobo: 0,
    total_kobo: 900000,
    status: 'completed',
    items_count: 2,
    notes: 'Cash payment',
    created_at: '2026-10-24T11:20:00Z',
  },
  {
    id: 'sale-104',
    receipt_number: 'O3-20261024-004',
    staff_id: 'demo-staff-003',
    staff_name: 'Babatunde Adeleke',
    sale_date: '2026-10-24T12:05:00Z',
    subtotal_kobo: 1800000, // ₦18,000.00
    discount_kobo: 0,
    total_kobo: 1800000,
    status: 'completed',
    items_count: 3,
    notes: 'Bank transfer (Moniepoint)',
    created_at: '2026-10-24T12:05:00Z',
  },
  {
    id: 'sale-105',
    receipt_number: 'O3-20261024-005',
    staff_id: 'demo-staff-003',
    staff_name: 'Babatunde Adeleke',
    sale_date: '2026-10-24T13:30:00Z',
    subtotal_kobo: 2000000, // ₦20,000.00
    discount_kobo: 0,
    total_kobo: 2000000,
    status: 'completed',
    items_count: 3,
    notes: 'Cash payment',
    created_at: '2026-10-24T13:30:00Z',
  },
];

export const DEMO_DAMAGE_REPORTS: DamageReport[] = [
  {
    id: 'dmg-001',
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    section_id: 'sec-1',
    section_name: "Men's Corporate Shirts",
    quantity: 2,
    damage_type: 'tear',
    description: 'Armpit sleeve seam torn on two checked shirts during hanger display',
    status: 'pending',
    created_at: '2026-10-24T09:10:00Z',
  },
  {
    id: 'dmg-002',
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    section_id: 'sec-4',
    section_name: "Women's Chiffon & Silk Tops",
    quantity: 3,
    damage_type: 'stain',
    description: 'Heavy grease stain near collar, found inside newly opened bale',
    status: 'pending',
    created_at: '2026-10-24T09:40:00Z',
  },
  {
    id: 'dmg-003',
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    section_id: 'sec-3',
    section_name: "Men's Round Neck & Polos",
    quantity: 1,
    damage_type: 'burn',
    description: 'Small iron burn hole on front chest',
    status: 'approved',
    reviewed_by: 'demo-owner-001',
    reviewer_name: 'Olumide Oladipo',
    reviewed_at: '2026-10-23T16:00:00Z',
    created_at: '2026-10-23T14:00:00Z',
  },
];

export const DEMO_CASH_SESSION: CashSession = {
  id: 'sess-today',
  staff_id: 'demo-staff-002',
  staff_name: 'Chidinma Eze',
  opened_at: '2026-10-24T08:00:00Z',
  opening_cash_kobo: 1000000, // ₦10,000.00 float
  expected_cash_kobo: 2200000, // ₦10,000 float + ₦12,000 cash sales
  status: 'open',
  created_at: '2026-10-24T08:00:00Z',
};

export const DEMO_EXPENSES: Expense[] = [
  {
    id: 'exp-01',
    description: 'Generator Diesel (20 Litres)',
    category: 'utilities',
    amount_kobo: 2400000, // ₦24,000.00
    expense_date: '2026-10-24',
    recorded_by: 'demo-owner-001',
    recorder_name: 'Olumide Oladipo',
    status: 'approved',
    created_at: '2026-10-24T08:30:00Z',
  },
  {
    id: 'exp-02',
    description: 'Packaging bags (Custom O3 nylon)',
    category: 'supplies',
    amount_kobo: 1500000, // ₦15,000.00
    expense_date: '2026-10-23',
    recorded_by: 'demo-owner-001',
    recorder_name: 'Olumide Oladipo',
    status: 'approved',
    created_at: '2026-10-23T12:00:00Z',
  },
];

export const DEMO_MOVEMENTS: InventoryMovement[] = [
  {
    id: 'mov-1',
    section_id: 'sec-1',
    section_name: "Men's Corporate Shirts",
    movement_type: 'bale_allocation',
    quantity_change: 45,
    resulting_balance: 45,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
  {
    id: 'mov-sec-2',
    section_id: 'sec-2',
    section_name: "Men's Chinos & Denim Trousers",
    movement_type: 'bale_allocation',
    quantity_change: 28,
    resulting_balance: 28,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
  {
    id: 'mov-sec-3-alloc',
    section_id: 'sec-3',
    section_name: "Men's Round Neck & Polos",
    movement_type: 'bale_allocation',
    quantity_change: 43,
    resulting_balance: 43,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
  {
    id: 'mov-sec-3-dmg',
    section_id: 'sec-3',
    section_name: "Men's Round Neck & Polos",
    movement_type: 'damage_deduction',
    quantity_change: -1,
    resulting_balance: 42,
    reference_id: 'dmg-003',
    reference_type: 'damage_report',
    notes: 'Approved damage write-off (Dmg #dmg-003: burn)',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-23T16:00:00Z',
  },
  {
    id: 'mov-sec-4',
    section_id: 'sec-4',
    section_name: "Women's Chiffon & Silk Tops",
    movement_type: 'bale_allocation',
    quantity_change: 56,
    resulting_balance: 56,
    notes: 'Allocated from bale BAL-2026-OCT-02',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-22T14:00:00Z',
  },
  {
    id: 'mov-sec-5',
    section_id: 'sec-5',
    section_name: "Women's Denim & Palazzo Pants",
    movement_type: 'bale_allocation',
    quantity_change: 34,
    resulting_balance: 34,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
  {
    id: 'mov-sec-6',
    section_id: 'sec-6',
    section_name: 'Vintage & Corporate Dresses',
    movement_type: 'bale_allocation',
    quantity_change: 22,
    resulting_balance: 22,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
  {
    id: 'mov-sec-7',
    section_id: 'sec-7',
    section_name: "Women's Skirts & Gowns",
    movement_type: 'bale_allocation',
    quantity_change: 19,
    resulting_balance: 19,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
  {
    id: 'mov-sec-8',
    section_id: 'sec-8',
    section_name: "Children's Variety Wear",
    movement_type: 'bale_allocation',
    quantity_change: 50,
    resulting_balance: 50,
    notes: 'Allocated from bale BAL-2026-OCT-01',
    created_by: 'demo-owner-001',
    creator_name: 'Olumide Oladipo',
    created_at: '2026-10-18T16:00:00Z',
  },
];
