import {
  Sale,
  SaleItem,
  SalePayment,
  PaymentMethod,
  CreateSalePayload,
  SaleCancellationPayload,
  UserRole,
  UserProfile,
  StockSection,
} from '../types/database';
import { getSupabaseClient } from './supabase';
import { DEMO_SALES, DEMO_SECTIONS, DEMO_STAFF, DEMO_STAFF_2, DEMO_OWNER } from './demoData';
import { localInventoryStore } from './inventoryService';

// Initial demo items and payments so existing demo sales can be fully inspected as receipts
const INITIAL_DEMO_SALE_ITEMS: SaleItem[] = [
  {
    id: 'sitem-101-1',
    sale_id: 'sale-101',
    section_id: 'sec-1',
    section_name: "Men's Corporate Shirts",
    quantity: 2,
    unit_price_kobo: 500000,
    line_total_kobo: 1000000,
  },
  {
    id: 'sitem-101-2',
    sale_id: 'sale-101',
    section_id: 'sec-3',
    section_name: 'Round Neck & Vintage Tees',
    quantity: 1,
    unit_price_kobo: 500000,
    line_total_kobo: 500000,
  },
  {
    id: 'sitem-102-1',
    sale_id: 'sale-102',
    section_id: 'sec-4',
    section_name: "Women's Chiffon & Silk Tops",
    quantity: 2,
    unit_price_kobo: 400000,
    line_total_kobo: 800000,
  },
  {
    id: 'sitem-102-2',
    sale_id: 'sale-102',
    section_id: 'sec-2',
    section_name: "Men's Jeans & Chinos",
    quantity: 1,
    unit_price_kobo: 650000,
    line_total_kobo: 650000,
  },
  {
    id: 'sitem-102-3',
    sale_id: 'sale-102',
    section_id: 'sec-6',
    section_name: 'Vintage & Corporate Dresses',
    quantity: 1,
    unit_price_kobo: 750000,
    line_total_kobo: 750000,
  },
  {
    id: 'sitem-103-1',
    sale_id: 'sale-103',
    section_id: 'sec-8',
    section_name: "Children's Variety Wear",
    quantity: 2,
    unit_price_kobo: 250000,
    line_total_kobo: 500000,
  },
  {
    id: 'sitem-103-2',
    sale_id: 'sale-103',
    section_id: 'sec-4',
    section_name: "Women's Chiffon & Silk Tops",
    quantity: 1,
    unit_price_kobo: 400000,
    line_total_kobo: 400000,
  },
  {
    id: 'sitem-104-1',
    sale_id: 'sale-104',
    section_id: 'sec-1',
    section_name: "Men's Corporate Shirts",
    quantity: 2,
    unit_price_kobo: 500000,
    line_total_kobo: 1000000,
  },
  {
    id: 'sitem-104-2',
    sale_id: 'sale-104',
    section_id: 'sec-4',
    section_name: "Women's Chiffon & Silk Tops",
    quantity: 2,
    unit_price_kobo: 400000,
    line_total_kobo: 800000,
  },
  {
    id: 'sitem-105-1',
    sale_id: 'sale-105',
    section_id: 'sec-6',
    section_name: 'Vintage & Corporate Dresses',
    quantity: 2,
    unit_price_kobo: 750000,
    line_total_kobo: 1500000,
  },
  {
    id: 'sitem-105-2',
    sale_id: 'sale-105',
    section_id: 'sec-1',
    section_name: "Men's Corporate Shirts",
    quantity: 1,
    unit_price_kobo: 500000,
    line_total_kobo: 500000,
  },
];

const INITIAL_DEMO_SALE_PAYMENTS: SalePayment[] = [
  {
    id: 'spay-101-1',
    sale_id: 'sale-101',
    payment_method: 'cash',
    amount_kobo: 1000000,
    reference: 'Cash Tendered',
    status: 'confirmed',
    created_at: '2026-10-24T09:30:00Z',
  },
  {
    id: 'spay-101-2',
    sale_id: 'sale-101',
    payment_method: 'bank_transfer',
    amount_kobo: 500000,
    reference: 'TRF-GTB-77281',
    status: 'confirmed',
    created_at: '2026-10-24T09:30:00Z',
  },
  {
    id: 'spay-102-1',
    sale_id: 'sale-102',
    payment_method: 'pos_card',
    amount_kobo: 2150000,
    reference: 'STANBIC-POS-8821',
    status: 'confirmed',
    created_at: '2026-10-24T10:45:00Z',
  },
  {
    id: 'spay-103-1',
    sale_id: 'sale-103',
    payment_method: 'cash',
    amount_kobo: 900000,
    reference: 'Cash Tendered',
    status: 'confirmed',
    created_at: '2026-10-24T11:20:00Z',
  },
  {
    id: 'spay-104-1',
    sale_id: 'sale-104',
    payment_method: 'bank_transfer',
    amount_kobo: 1800000,
    reference: 'MONIEPOINT-399120',
    status: 'confirmed',
    created_at: '2026-10-24T12:05:00Z',
  },
  {
    id: 'spay-105-1',
    sale_id: 'sale-105',
    payment_method: 'cash',
    amount_kobo: 2000000,
    reference: 'Cash Tendered',
    status: 'confirmed',
    created_at: '2026-10-24T13:30:00Z',
  },
];

class SalesStore {
  sales: Sale[] = JSON.parse(JSON.stringify(DEMO_SALES));
  saleItems: SaleItem[] = JSON.parse(JSON.stringify(INITIAL_DEMO_SALE_ITEMS));
  salePayments: SalePayment[] = JSON.parse(JSON.stringify(INITIAL_DEMO_SALE_PAYMENTS));
  idempotencyCache: Map<string, Sale> = new Map();

  // Attach items and payments to sale objects
  populateSale(sale: Sale, userRole?: UserRole): Sale {
    // 1. If sale already has items from Supabase or caller, preserve them; otherwise pull from local store
    const rawItems = Array.isArray(sale.items) && sale.items.length > 0
      ? sale.items
      : this.saleItems.filter((i) => i.sale_id === sale.id);

    // 2. If sale already has payments from Supabase or caller, preserve them; otherwise pull from local store
    const rawPayments = Array.isArray(sale.payments) && sale.payments.length > 0
      ? sale.payments
      : this.salePayments.filter((p) => p.sale_id === sale.id);

    // Enrich section names, section codes from catalog if missing
    const enrichedItems = rawItems.map((item) => {
      const section = localInventoryStore.sections.find((sec) => sec.id === item.section_id);
      const section_name = item.section_name || section?.name || 'Garment Item';
      const section_code = item.section_code || section?.section_code;

      if (userRole === 'staff') {
        const { cost_snapshot_kobo, ...safeItem } = item;
        return { ...safeItem, section_name, section_code } as SaleItem;
      }
      return { ...item, section_name, section_code };
    });

    // Resolve staff name cleanly
    let staffName = sale.staff_name;
    const saleRecord = sale as unknown as Record<string, unknown>;
    const staffRel = saleRecord.staff as { full_name?: string; username?: string } | undefined;
    if (staffRel?.full_name) {
      staffName = staffRel.full_name;
    } else if (staffRel?.username) {
      staffName = staffRel.username;
    } else if (!staffName || staffName === 'Authorized Floor Staff' || staffName === 'Staff Cashier') {
      if (sale.staff_id === DEMO_STAFF.id) {
        staffName = DEMO_STAFF.full_name;
      } else if (sale.staff_id === DEMO_STAFF_2.id) {
        staffName = DEMO_STAFF_2.full_name;
      } else if (sale.staff_id === DEMO_OWNER.id) {
        staffName = DEMO_OWNER.full_name;
      }
    }

    const itemsCount = sale.items_count && sale.items_count > 0
      ? sale.items_count
      : enrichedItems.reduce((acc, i) => acc + (i.quantity || 0), 0);

    return {
      ...sale,
      staff_name: staffName || 'Cashier',
      items: enrichedItems,
      payments: rawPayments,
      items_count: itemsCount,
    };
  }
}

export const localSalesStore = new SalesStore();

/**
 * Helper to generate unique receipt number: O3-YYYYMMDD-XXXX
 */
function generateReceiptNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const todayCount = localSalesStore.sales.filter((s) => s.receipt_number.startsWith(`O3-${dateStr}`)).length + 1;
  const seq = String(todayCount).padStart(4, '0');
  return `O3-${dateStr}-${seq}`;
}

/**
 * 1. Process POS Sale Atomically
 * - Enforces idempotency key protection against double submissions
 * - Validates sellable available stock (physical - reserved) inside transaction
 * - Snapshots current selling price
 * - Supports split payment methods (Cash, Transfer, POS card, etc.)
 * - Atomically inserts sale, sale items, split payment legs, and decrements ledger
 * - Strictly hides sensitive cost data from staff users
 */
export async function processSaleAtomic(
  payload: CreateSalePayload,
  actorProfile?: UserProfile
): Promise<{ success: boolean; data?: Sale; idempotencyHit?: boolean; error?: string }> {
  const { staff_id, items, payments, discount_kobo = 0, notes, idempotency_key } = payload;

  // 1. Idempotency Guard: check cache
  if (idempotency_key) {
    const cached = localSalesStore.idempotencyCache.get(idempotency_key);
    if (cached) {
      return {
        success: true,
        data: localSalesStore.populateSale(cached, actorProfile?.role),
        idempotencyHit: true,
      };
    }
    const existing = localSalesStore.sales.find((s) => s.idempotency_key === idempotency_key);
    if (existing) {
      localSalesStore.idempotencyCache.set(idempotency_key, existing);
      return {
        success: true,
        data: localSalesStore.populateSale(existing, actorProfile?.role),
        idempotencyHit: true,
      };
    }
  }

  // 2. Input Validations
  if (!items || items.length === 0) {
    return { success: false, error: 'At least one garment must be added to cart.' };
  }
  if (!payments || payments.length === 0) {
    return { success: false, error: 'At least one payment method must be specified.' };
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      // Resolve UUID for Supabase if caller passed a demo identifier
      let effectiveStaffId = staff_id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff_id);
      if (!isUuid) {
        const { data: prof } = await client.from('profiles').select('id').limit(1).maybeSingle();
        if (prof?.id) {
          effectiveStaffId = prof.id;
        }
      }

      const { data, error } = await client.rpc('process_sale_atomic', {
        p_staff_id: effectiveStaffId,
        p_items: items,
        p_payments: payments.map((p) => ({
          payment_method: p.method,
          amount_kobo: p.amount_kobo,
          reference: p.reference || '',
        })),
        p_discount_kobo: discount_kobo,
        p_notes: notes || null,
        p_idempotency_key: idempotency_key || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.success) {
        // Fetch full sale
        const fullSale = await getSaleReceipt(data.sale_id || data.receipt_number, actorProfile?.role);
        if (fullSale.success && fullSale.data) {
          if (idempotency_key) {
            localSalesStore.idempotencyCache.set(idempotency_key, fullSale.data);
          }
          // Sync with localSalesStore so all dashboard tabs reflect the sale immediately
          const existIdx = localSalesStore.sales.findIndex((s) => s.id === fullSale.data!.id);
          if (existIdx !== -1) {
            localSalesStore.sales[existIdx] = fullSale.data;
          } else {
            localSalesStore.sales.unshift(fullSale.data);
          }
          if (fullSale.data.items) {
            for (const item of fullSale.data.items) {
              if (!localSalesStore.saleItems.some((i) => i.id === item.id)) {
                localSalesStore.saleItems.push(item);
              }
            }
          }
          if (fullSale.data.payments) {
            for (const p of fullSale.data.payments) {
              if (!localSalesStore.salePayments.some((x) => x.id === p.id)) {
                localSalesStore.salePayments.push(p);
              }
            }
          }
          localInventoryStore.recalculateBalances();
          return { success: true, data: fullSale.data, idempotencyHit: data.idempotency_hit };
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // If error is a business rule, return error cleanly without fallback
      if (
        message.includes('Insufficient stock') ||
        message.includes('exceeds') ||
        message.includes('not found in database catalog')
      ) {
        return { success: false, error: message };
      }
      console.warn('Supabase process_sale_atomic RPC failed or not connected, running local atomic fallback:', message);
    }
  }

  // 3. Robust Local In-Memory Fallback Transaction
  localInventoryStore.recalculateBalances();

  // Validate items and available stock
  let subtotalKobo = 0;
  const processedItems: {
    sectionId: string;
    sectionCode?: string;
    sectionName: string;
    quantity: number;
    unitPriceKobo: number;
    lineTotalKobo: number;
  }[] = [];

  for (const item of items) {
    if (item.quantity <= 0) {
      return { success: false, error: 'Quantity must be greater than zero.' };
    }

    let section = localInventoryStore.sections.find((s) => s.id === item.section_id);

    // If section not found in local store, query Supabase directly
    if (!section && client) {
      try {
        const { data: dbSec } = await client
          .from('stock_sections')
          .select('*')
          .eq('id', item.section_id)
          .maybeSingle();

        if (dbSec) {
          const { data: movements } = await client
            .from('inventory_movements')
            .select('quantity_change')
            .eq('section_id', item.section_id);
          const { data: damages } = await client
            .from('damage_reports')
            .select('quantity')
            .eq('section_id', item.section_id)
            .eq('status', 'pending');

          const physical = (movements || []).reduce((acc, m) => acc + (m.quantity_change || 0), 0);
          const reserved = (damages || []).reduce((acc, d) => acc + (d.quantity || 0), 0);
          const available = Math.max(0, physical - reserved);

          section = {
            ...dbSec,
            physical_stock: Math.max(0, physical),
            reserved_stock: Math.max(0, reserved),
            available_stock: available,
            is_active: dbSec.is_active ?? true,
          } as StockSection;

          localInventoryStore.sections.unshift(section);
        }
      } catch (err) {
        console.warn('Failed to query section from Supabase in fallback:', err);
      }
    }

    if (!section) {
      return { success: false, error: `Stock section ${item.section_id} not found in inventory catalog.` };
    }

    // Auto-activate section if it exists
    if (section.is_active === false) {
      section.is_active = true;
      if (client) {
        client.from('stock_sections').update({ is_active: true }).eq('id', section.id).then();
      }
    }

    // STRICT CONCURRENCY & STOCK VALIDATION:
    // Available stock = physical_stock - reserved_stock
    const codeTag = section.section_code ? ` [${section.section_code}]` : '';
    if (item.quantity > section.available_stock) {
      return {
        success: false,
        error: `Insufficient stock for "${section.name}"${codeTag}: requested ${item.quantity} pcs, but only ${section.available_stock} pcs are available.`,
      };
    }

    const lineTotal = section.selling_price_kobo * item.quantity;
    subtotalKobo += lineTotal;

    processedItems.push({
      sectionId: section.id,
      sectionCode: section.section_code,
      sectionName: section.name,
      quantity: item.quantity,
      unitPriceKobo: section.selling_price_kobo,
      lineTotalKobo: lineTotal,
    });
  }

  // Validate discount
  if (discount_kobo < 0) {
    return { success: false, error: 'Discount cannot be negative.' };
  }
  if (discount_kobo > subtotalKobo) {
    return {
      success: false,
      error: `Discount (₦${discount_kobo / 100}) cannot exceed cart subtotal (₦${subtotalKobo / 100}).`,
    };
  }

  const totalKobo = subtotalKobo - discount_kobo;

  // Validate payments total
  const tenderedKobo = payments.reduce((acc, p) => acc + p.amount_kobo, 0);
  if (tenderedKobo < totalKobo) {
    return {
      success: false,
      error: `Payment tendered (₦${(tenderedKobo / 100).toLocaleString()}) is less than total amount due (₦${(
        totalKobo / 100
      ).toLocaleString()}).`,
    };
  }

  // Determine staff name
  const staffName =
    payload.staff_name ||
    (staff_id === DEMO_STAFF.id
      ? DEMO_STAFF.full_name
      : staff_id === DEMO_STAFF_2.id
      ? DEMO_STAFF_2.full_name
      : actorProfile?.full_name || 'Staff Cashier');

  // Generate Receipt and IDs
  const saleId = `sale-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const receiptNumber = generateReceiptNumber();
  const nowIso = new Date().toISOString();

  // Create Master Sale Record
  const newSale: Sale = {
    id: saleId,
    receipt_number: receiptNumber,
    staff_id,
    staff_name: staffName,
    sale_date: nowIso,
    subtotal_kobo: subtotalKobo,
    discount_kobo,
    total_kobo: totalKobo,
    status: 'completed',
    notes: notes || (payments.length > 1 ? `Split: ${payments.map((p) => p.method).join(' + ')}` : undefined),
    items_count: processedItems.reduce((acc, i) => acc + i.quantity, 0),
    idempotency_key,
    created_at: nowIso,
  };

  // Create Sale Items & Deduct Inventory Ledger
  const newItems: SaleItem[] = [];
  for (const pi of processedItems) {
    const itemId = `sitem-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const saleItem: SaleItem = {
      id: itemId,
      sale_id: saleId,
      section_id: pi.sectionId,
      section_code: pi.sectionCode,
      section_name: pi.sectionName,
      quantity: pi.quantity,
      unit_price_kobo: pi.unitPriceKobo, // Historical price snapshot
      cost_snapshot_kobo: 0, // Staff cannot view cost data
      line_total_kobo: pi.lineTotalKobo,
    };
    newItems.push(saleItem);
    localSalesStore.saleItems.unshift(saleItem);

    // Atomic ledger deduction
    localInventoryStore.movements.unshift({
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      section_id: pi.sectionId,
      section_name: pi.sectionName,
      movement_type: 'sale',
      quantity_change: -pi.quantity,
      reference_id: saleId,
      reference_type: 'sale',
      notes: `Sold on receipt ${receiptNumber} (${pi.quantity} pcs of ${pi.sectionName})`,
      created_by: staff_id,
      creator_name: staffName,
      created_at: nowIso,
    });
  }

  // Create Sale Payments
  const newPayments: SalePayment[] = [];
  for (const pay of payments) {
    const payId = `spay-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const salePayment: SalePayment = {
      id: payId,
      sale_id: saleId,
      payment_method: pay.method,
      amount_kobo: pay.amount_kobo,
      reference: pay.reference,
      status: 'confirmed',
      created_at: nowIso,
    };
    newPayments.push(salePayment);
    localSalesStore.salePayments.unshift(salePayment);
  }

  // Insert master sale (Always kept at top: newest first)
  localSalesStore.sales.unshift(newSale);

  if (idempotency_key) {
    localSalesStore.idempotencyCache.set(idempotency_key, newSale);
  }

  // Recalculate balances after stock deduction
  localInventoryStore.recalculateBalances();

  const fullyPopulated = localSalesStore.populateSale(newSale, actorProfile?.role);
  return {
    success: true,
    data: fullyPopulated,
    idempotencyHit: false,
  };
}

/**
 * 2. Authorised Cancellation / Refund of a Completed Sale
 * - Requires Store Owner (or authorized supervisor) approval
 * - Validates that sale is completed
 * - Records cancellation reason and actor metadata
 * - Atomically inserts compensating inventory movements (+quantity) to return stock to shelves
 * - Updates sale status to 'cancelled' or 'refunded'
 */
export async function cancelOrRefundSale(
  payload: SaleCancellationPayload,
  actorProfile?: UserProfile
): Promise<{ success: boolean; data?: Sale; error?: string }> {
  const { sale_id, actor_id, actor_name, reason, action_type } = payload;

  if (!reason || !reason.trim()) {
    return { success: false, error: 'A clear reason for cancellation or refund is required.' };
  }

  // Authorization check
  const isSuperAdmin = actorProfile?.role === 'super_admin' || actor_id === DEMO_OWNER.id;
  if (!isSuperAdmin) {
    return {
      success: false,
      error: 'Access denied: Only the Store Owner (Super Admin) can authorise receipt cancellations/refunds.',
    };
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.rpc('cancel_sale_atomic', {
        p_sale_id: sale_id,
        p_actor_id: actor_id,
        p_reason: reason.trim(),
        p_action: action_type,
      });

      if (error) throw new Error(error.message);
      if (data && data.success) {
        const fullSale = await getSaleReceipt(sale_id, actorProfile?.role);
        return { success: true, data: fullSale.data };
      }
    } catch (err: unknown) {
      console.warn('Supabase cancel_sale_atomic failed or not connected, running local atomic reversal:', err);
    }
  }

  // Local In-Memory Fallback
  const sale = localSalesStore.sales.find((s) => s.id === sale_id || s.receipt_number === sale_id);
  if (!sale) {
    return { success: false, error: `Sale record ${sale_id} not found.` };
  }

  if (sale.status !== 'completed') {
    return {
      success: false,
      error: `Sale ${sale.receipt_number} is already in status "${sale.status}". Only completed sales can be refunded/cancelled.`,
    };
  }

  const items = localSalesStore.saleItems.filter((i) => i.sale_id === sale.id);
  const nowIso = new Date().toISOString();
  const callerName = actor_name || actorProfile?.full_name || 'Store Owner';

  // Reverse inventory: create positive compensatory movements
  for (const item of items) {
    localInventoryStore.movements.unshift({
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      section_id: item.section_id,
      section_name: item.section_name,
      movement_type: 'return',
      quantity_change: item.quantity, // Positive replenishment
      reference_id: sale.id,
      reference_type: 'sale_reversal',
      notes: `Stock returned from ${action_type} receipt ${sale.receipt_number} (${item.quantity} pcs) - Reason: ${reason}`,
      created_by: actor_id,
      creator_name: callerName,
      created_at: nowIso,
    });
  }

  // Update sale status
  sale.status = action_type;
  sale.cancellation_reason = reason.trim();
  sale.cancelled_at = nowIso;
  sale.cancelled_by = actor_id;
  sale.canceller_name = callerName;
  sale.notes = `${sale.notes ? sale.notes + ' • ' : ''}[${action_type.toUpperCase()}: ${reason.trim()} by ${callerName}]`;

  // Recalculate inventory balances
  localInventoryStore.recalculateBalances();

  const fullyPopulated = localSalesStore.populateSale(sale, actorProfile?.role);
  return {
    success: true,
    data: fullyPopulated,
  };
}

/**
 * 3. Searchable Sales History
 * - Strictly isolates records: Staff can only query their own sales
 * - Owner can query all sales with cashier, payment method, date, and status filters
 * - Always sorted Newest to Oldest
 */
export async function getSalesHistory(
  filter: {
    staffId?: string;
    searchTerm?: string;
    status?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
  } = {},
  actorProfile?: UserProfile
): Promise<{ success: boolean; data: Sale[]; error?: string }> {
  const client = getSupabaseClient();
  const isStaff = actorProfile?.role === 'staff';
  // Staff accounts can NEVER view other staff members' sales
  const effectiveStaffId = isStaff ? actorProfile?.id : filter.staffId;

  if (client) {
    try {
      let query = client
        .from('sales')
        .select('*, staff:profiles(id, full_name, username), items:sale_items(*), payments:sale_payments(*)')
        .order('sale_date', { ascending: false });

      if (effectiveStaffId && effectiveStaffId !== 'all') {
        query = query.eq('staff_id', effectiveStaffId);
      }
      if (filter.status && filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }
      if (filter.startDate) {
        query = query.gte('sale_date', filter.startDate);
      }
      if (filter.endDate) {
        query = query.lte('sale_date', filter.endDate);
      }

      const { data, error } = await query;
      if (!error && data) {
        // Sync fetched sales and related items/payments to localSalesStore so all views and tabs update
        for (const s of data as Sale[]) {
          const populated = localSalesStore.populateSale(s, actorProfile?.role);
          const existingIdx = localSalesStore.sales.findIndex((x) => x.id === s.id);
          if (existingIdx !== -1) {
            localSalesStore.sales[existingIdx] = populated;
          } else {
            localSalesStore.sales.push(populated);
          }

          if (populated.items) {
            for (const item of populated.items) {
              if (!localSalesStore.saleItems.some((i) => i.id === item.id)) {
                localSalesStore.saleItems.push(item);
              }
            }
          }
          if (populated.payments) {
            for (const p of populated.payments) {
              if (!localSalesStore.salePayments.some((x) => x.id === p.id)) {
                localSalesStore.salePayments.push(p);
              }
            }
          }
        }

        let results = (data as Sale[]).map((s) => localSalesStore.populateSale(s, actorProfile?.role));

        if (filter.searchTerm) {
          const term = filter.searchTerm.toLowerCase();
          results = results.filter(
            (s) =>
              s.receipt_number.toLowerCase().includes(term) ||
              s.notes?.toLowerCase().includes(term) ||
              s.staff_name?.toLowerCase().includes(term)
          );
        }

        if (filter.paymentMethod && filter.paymentMethod !== 'all') {
          results = results.filter((s) => s.payments?.some((p) => p.payment_method === filter.paymentMethod));
        }

        results.sort(
          (a, b) => new Date(b.sale_date || b.created_at).getTime() - new Date(a.sale_date || a.created_at).getTime()
        );

        return { success: true, data: results };
      }
    } catch (err: unknown) {
      console.warn('Supabase getSalesHistory query failed, using local store:', err);
    }
  }

  // Local fallback
  let list = [...localSalesStore.sales];

  if (effectiveStaffId && effectiveStaffId !== 'all') {
    list = list.filter((s) => s.staff_id === effectiveStaffId);
  }

  if (filter.status && filter.status !== 'all') {
    list = list.filter((s) => s.status === filter.status);
  }

  if (filter.searchTerm) {
    const term = filter.searchTerm.toLowerCase();
    list = list.filter(
      (s) =>
        s.receipt_number.toLowerCase().includes(term) ||
        s.notes?.toLowerCase().includes(term) ||
        s.staff_name?.toLowerCase().includes(term)
    );
  }

  // Populate items & payments
  let populated = list.map((s) => localSalesStore.populateSale(s, actorProfile?.role));

  if (filter.paymentMethod && filter.paymentMethod !== 'all') {
    populated = populated.filter((s) => s.payments?.some((p) => p.payment_method === filter.paymentMethod));
  }

  // Strictly enforce newest to oldest sorting
  populated.sort(
    (a, b) => new Date(b.sale_date || b.created_at).getTime() - new Date(a.sale_date || a.created_at).getTime()
  );

  return { success: true, data: populated };
}

/**
 * 4. Get Single Sale Receipt by ID or Receipt Number
 */
export async function getSaleReceipt(
  saleIdOrReceiptNumber: string,
  actorRole?: UserRole
): Promise<{ success: boolean; data?: Sale; error?: string }> {
  const client = getSupabaseClient();

  if (client) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saleIdOrReceiptNumber);
      const query = client
        .from('sales')
        .select('*, staff:profiles(id, full_name, username), items:sale_items(*), payments:sale_payments(*)')
        .eq(isUuid ? 'id' : 'receipt_number', saleIdOrReceiptNumber)
        .single();

      const { data, error } = await query;
      if (!error && data) {
        return { success: true, data: localSalesStore.populateSale(data as Sale, actorRole) };
      }
    } catch (err: unknown) {
      console.warn('Supabase getSaleReceipt failed, using local store:', err);
    }
  }

  const sale = localSalesStore.sales.find(
    (s) => s.id === saleIdOrReceiptNumber || s.receipt_number.toLowerCase() === saleIdOrReceiptNumber.toLowerCase()
  );

  if (!sale) {
    return { success: false, error: `Receipt "${saleIdOrReceiptNumber}" not found.` };
  }

  return {
    success: true,
    data: localSalesStore.populateSale(sale, actorRole),
  };
}
