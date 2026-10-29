import {
  StockSection,
  StockBatch,
  BatchSectionAllocation,
  InventoryMovement,
  DamageReport,
} from '../types/database';
import { getSupabaseClient } from './supabase';
import {
  DEMO_SECTIONS,
  DEMO_BATCHES,
  DEMO_MOVEMENTS,
  DEMO_DAMAGE_REPORTS,
} from './demoData';

// In-memory runtime store for Demo/Fallback mode to persist within session
class InventoryStore {
  sections: StockSection[] = JSON.parse(JSON.stringify(DEMO_SECTIONS));
  batches: StockBatch[] = JSON.parse(JSON.stringify(DEMO_BATCHES));
  allocations: BatchSectionAllocation[] = [
    {
      id: 'alloc-01',
      batch_id: 'batch-001',
      section_id: 'sec-1',
      section_name: "Men's Corporate Shirts",
      quantity_allocated: 45,
      allocated_cost_kobo: 36500000,
      created_at: '2026-10-18T16:00:00Z',
    },
    {
      id: 'alloc-02',
      batch_id: 'batch-002',
      section_id: 'sec-4',
      section_name: "Women's Chiffon & Silk Tops",
      quantity_allocated: 60,
      allocated_cost_kobo: 20000000,
      created_at: '2026-10-22T14:00:00Z',
    },
  ];
  movements: InventoryMovement[] = JSON.parse(JSON.stringify(DEMO_MOVEMENTS));
  damageReports: DamageReport[] = JSON.parse(JSON.stringify(DEMO_DAMAGE_REPORTS));

  recalculateBalances() {
    this.sections = this.sections.map((section, idx) => {
      // Ensure unique section code exists
      const code = section.section_code || `SEC-${String(idx + 1).padStart(3, '0')}`;

      // Sum all physical quantity changes from ledger
      const hasMovements = this.movements.some((m) => m.section_id === section.id);
      const ledgerSum = this.movements
        .filter((m) => m.section_id === section.id)
        .reduce((sum, m) => sum + m.quantity_change, 0);

      // Sum pending damage reservations (only status === 'pending' actively holds stock from sale)
      const reserved = this.damageReports
        .filter((d) => d.section_id === section.id && d.status === 'pending')
        .reduce((sum, d) => sum + d.quantity, 0);

      // Sum approved damaged write-offs
      const approvedDamage = this.damageReports
        .filter((d) => d.section_id === section.id && d.status === 'approved')
        .reduce((sum, d) => sum + d.quantity, 0);

      const totalDamaged = reserved + approvedDamage;

      const safePhysical = hasMovements ? Math.max(0, ledgerSum) : Math.max(0, section.physical_stock || 0);
      const safeReserved = Math.max(0, reserved);
      const available = Math.max(0, safePhysical - safeReserved);

      // Total in-store physical stock (Sellable available + Approved damaged write-offs + Pending holds)
      // Guarantees balanced equation: total_physical_stock = available_stock + approved_damage_stock + reserved_stock
      const totalOnHand = available + approvedDamage + safeReserved;

      return {
        ...section,
        section_code: code,
        physical_stock: safePhysical,
        total_physical_stock: totalOnHand,
        reserved_stock: safeReserved,
        approved_damage_stock: approvedDamage,
        total_damaged_stock: totalDamaged,
        available_stock: available,
        is_active: section.is_active ?? true,
      };
    });
    notifyInventoryUpdated();
  }
}

export function notifyInventoryUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('o3:inventory_updated'));
  }
}

export const localInventoryStore = new InventoryStore();

// Initial calculation
localInventoryStore.recalculateBalances();

/**
 * Generate a unique, clean, human-readable section identifier (e.g. SEC-001, SEC-009, SEC-010)
 */
export function generateSectionCode(
  name: string,
  category?: string,
  existingSections: StockSection[] = []
): string {
  // Find highest index among existing SEC-xxx codes
  let maxSeq = 0;
  for (const s of existingSections) {
    if (s.section_code) {
      const match = s.section_code.match(/SEC-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  // Account for number of sections if higher (e.g. 8 initial sections -> next is SEC-009)
  if (existingSections.length > maxSeq) {
    maxSeq = existingSections.length;
  }

  let nextNum = maxSeq + 1;
  let candidate = `SEC-${String(nextNum).padStart(3, '0')}`;
  while (existingSections.some((s) => s.section_code === candidate)) {
    nextNum++;
    candidate = `SEC-${String(nextNum).padStart(3, '0')}`;
  }
  return candidate;
}

/**
 * Assigns stable, unique section codes chronologically so newly added sections never get SEC-001
 */
function enrichSectionCodes(rawSections: StockSection[]): StockSection[] {
  const knownMap = new Map<string, string>();
  for (const s of localInventoryStore.sections) {
    if (s.section_code) knownMap.set(s.id, s.section_code);
  }

  let maxSeq = 0;
  for (const s of rawSections) {
    const existingCode = s.section_code || knownMap.get(s.id);
    if (existingCode) {
      const m = existingCode.match(/SEC-(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
  }
  if (rawSections.length > maxSeq) maxSeq = rawSections.length;

  // Chronological sort: oldest first so legacy items get 1..N and newest item gets highest number
  const chronological = [...rawSections].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );

  let seqCounter = 1;
  const codeMap = new Map<string, string>();

  // 1. First register rows that already have an explicit code
  for (const s of chronological) {
    const existingCode = s.section_code || knownMap.get(s.id);
    if (existingCode) {
      codeMap.set(s.id, existingCode);
      const m = existingCode.match(/SEC-(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= seqCounter) seqCounter = n + 1;
      }
    }
  }

  // 2. Second pass: for rows without code, assign next sequence in chronological order
  for (const s of chronological) {
    if (!codeMap.has(s.id)) {
      let candidate = `SEC-${String(seqCounter).padStart(3, '0')}`;
      while (Array.from(codeMap.values()).includes(candidate)) {
        seqCounter++;
        candidate = `SEC-${String(seqCounter).padStart(3, '0')}`;
      }
      codeMap.set(s.id, candidate);
      seqCounter++;
    }
  }

  return rawSections.map((s) => ({
    ...s,
    section_code: s.section_code || codeMap.get(s.id) || `SEC-${String(++maxSeq).padStart(3, '0')}`,
    is_active: s.is_active ?? true,
  }));
}

/**
 * 1. Fetch all stock sections with live physical and available stock balances
 */
export async function getStockSections(): Promise<{ success: boolean; data: StockSection[]; error?: string }> {
  const client = getSupabaseClient();

  if (client) {
    try {
      // Try querying the real-time balance view first (newest goods on top)
      const { data: viewData, error: viewError } = await client
        .from('section_stock_balances')
        .select('*')
        .order('created_at', { ascending: false });

      if (!viewError && viewData && viewData.length > 0) {
        const enriched = enrichSectionCodes(viewData as StockSection[]);
        localInventoryStore.sections = enriched;
        return { success: true, data: enriched };
      }

      // Fallback to stock_sections table (newest goods on top)
      const { data, error } = await client
        .from('stock_sections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (data && data.length > 0) {
        // Compute balances from inventory_movements & damage_reports
        const { data: movements } = await client.from('inventory_movements').select('section_id, quantity_change');
        const { data: allDamage } = await client.from('damage_reports').select('section_id, quantity, status');

        const computedWithCodes = enrichSectionCodes(data as StockSection[]);
        const computed = computedWithCodes.map((sec) => {
          const physical = (movements || [])
            .filter((m) => m.section_id === sec.id)
            .reduce((acc, m) => acc + (m.quantity_change || 0), 0);
          const reserved = (allDamage || [])
            .filter((d) => d.section_id === sec.id && d.status === 'pending')
            .reduce((acc, d) => acc + (d.quantity || 0), 0);
          const approved = (allDamage || [])
            .filter((d) => d.section_id === sec.id && d.status === 'approved')
            .reduce((acc, d) => acc + (d.quantity || 0), 0);
          const totalDamaged = reserved + approved;

          const avail = Math.max(0, physical - reserved);
          const totalOnHand = avail + approved + reserved;

          return {
            ...sec,
            physical_stock: Math.max(0, physical),
            total_physical_stock: totalOnHand,
            reserved_stock: Math.max(0, reserved),
            approved_damage_stock: approved,
            total_damaged_stock: totalDamaged,
            available_stock: avail,
          };
        });

        const sortedComputed = [...computed].sort(
          (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        );
        localInventoryStore.sections = sortedComputed;
        return { success: true, data: sortedComputed };
      }
    } catch (err: unknown) {
      console.warn('Supabase section query failed, using local store:', extractErrorMessage(err));
    }
  }

  localInventoryStore.recalculateBalances();
  const sorted = [...localInventoryStore.sections].sort(
    (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
  );
  return { success: true, data: sorted };
}

/**
 * Safely extracts readable error messages from Supabase/PostgREST error objects
 */
export function extractErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error occurred.';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message : '';
    const details = typeof obj.details === 'string' && obj.details ? ` (${obj.details})` : '';
    const hint = typeof obj.hint === 'string' && obj.hint ? ` [Hint: ${obj.hint}]` : '';
    const code = typeof obj.code === 'string' && obj.code ? ` [Code: ${obj.code}]` : '';

    if (msg) {
      if (obj.code === '23505' && msg.includes('stock_sections_name_key')) {
        return 'A clothing section with this name already exists in Supabase. Please run Migration 005 in Supabase to allow duplicate section names with distinct Section Codes.';
      }
      return `${msg}${details}${hint}${code}`;
    }

    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Returns the next auto-generated section code (e.g. SEC-009)
 */
export function getNextSectionCode(existingSections?: StockSection[]): string {
  const list = existingSections && existingSections.length > 0 ? existingSections : localInventoryStore.sections;
  return generateSectionCode('Section', undefined, list);
}

/**
 * 2. Save (create or update) a stock section
 */
export async function saveStockSection(
  section: Partial<StockSection> & { name: string; category: string; selling_price_kobo: number }
): Promise<{ success: boolean; data?: StockSection; error?: string }> {
  if (!section.name.trim()) {
    return { success: false, error: 'Section name cannot be empty.' };
  }
  if (section.selling_price_kobo < 0) {
    return { success: false, error: 'Selling price cannot be negative.' };
  }

  const client = getSupabaseClient();

  if (client) {
    try {
      const existingList = localInventoryStore.sections;
      let code = section.section_code?.trim().toUpperCase();
      if (
        !code ||
        (!section.id &&
          code === 'SEC-001' &&
          existingList.length > 0 &&
          existingList.some((s) => s.section_code === 'SEC-001'))
      ) {
        code = generateSectionCode(section.name, section.category, existingList);
      }

      if (section.id) {
        // Update
        const updatePayload: Record<string, unknown> = {
          name: section.name.trim(),
          category: section.category.trim(),
          selling_price_kobo: section.selling_price_kobo,
          low_stock_threshold: section.low_stock_threshold ?? 5,
          is_active: section.is_active ?? true,
          updated_at: new Date().toISOString(),
        };
        if (section.section_code) {
          updatePayload.section_code = section.section_code.trim().toUpperCase();
        }

        let updateRes = await client
          .from('stock_sections')
          .update(updatePayload)
          .eq('id', section.id)
          .select()
          .single();

        // If section_code column doesn't exist yet in Supabase (before Migration 005 run)
        if (updateRes.error && updateRes.error.message?.includes('section_code')) {
          delete updatePayload.section_code;
          updateRes = await client
            .from('stock_sections')
            .update(updatePayload)
            .eq('id', section.id)
            .select()
            .single();
        }

        if (updateRes.error) throw updateRes.error;
        const saved = {
          ...(updateRes.data as StockSection),
          section_code: (updateRes.data as StockSection).section_code || code,
        };
        const existIdx = localInventoryStore.sections.findIndex((s) => s.id === saved.id);
        if (existIdx !== -1) {
          localInventoryStore.sections[existIdx] = { ...localInventoryStore.sections[existIdx], ...saved };
        } else {
          localInventoryStore.sections.unshift(saved);
        }
        return { success: true, data: saved };
      } else {
        // Create
        let insertPayload: Record<string, unknown> = {
          name: section.name.trim(),
          category: section.category.trim(),
          selling_price_kobo: section.selling_price_kobo,
          low_stock_threshold: section.low_stock_threshold ?? 5,
          is_active: true,
          section_code: code,
        };

        let insertRes = await client
          .from('stock_sections')
          .insert(insertPayload)
          .select()
          .single();

        // If section_code column doesn't exist yet in Supabase table
        if (insertRes.error && insertRes.error.message?.includes('section_code')) {
          delete insertPayload.section_code;
          insertRes = await client
            .from('stock_sections')
            .insert(insertPayload)
            .select()
            .single();
        }

        if (insertRes.error) throw insertRes.error;
        const saved: StockSection = {
          ...(insertRes.data as StockSection),
          section_code: (insertRes.data as StockSection).section_code || code,
          physical_stock: section.physical_stock ?? 0,
          reserved_stock: 0,
          available_stock: section.available_stock ?? (section.physical_stock ?? 0),
          is_active: true,
        };
        const initQty = section.available_stock ?? section.physical_stock ?? 0;
        if (initQty > 0) {
          try {
            await client.from('inventory_movements').insert({
              section_id: (insertRes.data as StockSection).id,
              movement_type: 'bale_allocation',
              quantity_change: initQty,
              reference_id: (insertRes.data as StockSection).id,
              reference_type: 'inventory_initialization',
              notes: `Initial stock intake for ${saved.name} [${saved.section_code}] (+${initQty} pcs)`,
            });
          } catch {
            // Ignore if movement insert fails
          }
        }

        localInventoryStore.sections.unshift(saved);
        return { success: true, data: saved };
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      return { success: false, error: `Failed to save section in Supabase: ${msg}` };
    }
  }


  // Local store execution
  const existingLocalList = localInventoryStore.sections;
  let code = section.section_code?.trim().toUpperCase();
  if (
    !code ||
    (!section.id &&
      code === 'SEC-001' &&
      existingLocalList.length > 0 &&
      existingLocalList.some((s) => s.section_code === 'SEC-001'))
  ) {
    code = generateSectionCode(section.name, section.category, existingLocalList);
  }

  if (section.id) {
    const idx = localInventoryStore.sections.findIndex((s) => s.id === section.id);
    if (idx !== -1) {
      localInventoryStore.sections[idx] = {
        ...localInventoryStore.sections[idx],
        section_code: section.section_code?.trim().toUpperCase() || localInventoryStore.sections[idx].section_code || code,
        name: section.name.trim(),
        category: section.category.trim(),
        selling_price_kobo: section.selling_price_kobo,
        low_stock_threshold: section.low_stock_threshold ?? localInventoryStore.sections[idx].low_stock_threshold,
        is_active: section.is_active ?? localInventoryStore.sections[idx].is_active,
        updated_at: new Date().toISOString(),
      };
      return { success: true, data: localInventoryStore.sections[idx] };
    }
  }

  const initQty = section.available_stock ?? section.physical_stock ?? 0;
  const newSection: StockSection = {
    id: section.id || `sec-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    section_code: code,
    name: section.name.trim(),
    category: section.category.trim(),
    selling_price_kobo: section.selling_price_kobo,
    low_stock_threshold: section.low_stock_threshold ?? 5,
    is_active: true,
    physical_stock: initQty,
    reserved_stock: 0,
    available_stock: initQty,
    created_at: new Date().toISOString(),
  };

  if (initQty > 0) {
    localInventoryStore.movements.unshift({
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      section_id: newSection.id,
      section_name: newSection.name,
      movement_type: 'bale_allocation',
      quantity_change: initQty,
      reference_id: `init-${newSection.id}`,
      reference_type: 'inventory_initialization',
      notes: `Initial stock intake for ${newSection.name} [${newSection.section_code}] (+${initQty} pcs)`,
      created_by: 'system',
      creator_name: 'Initial Stock Count',
      created_at: new Date().toISOString(),
    });
  }

  localInventoryStore.sections.unshift(newSection);
  return { success: true, data: newSection };
}

/**
 * 3. Delete a stock section (Only available from the section edit modal)
 * - Safe foreign key handling: if historical sales/allocations exist, archives/deactivates cleanly to protect ledger integrity
 * - If no dependent records exist, deletes permanently from database and local catalog
 */
export async function deleteStockSection(
  sectionId: string
): Promise<{ success: boolean; error?: string; deactivatedInstead?: boolean }> {
  if (!sectionId) {
    return { success: false, error: 'Section ID is required for deletion.' };
  }

  const client = getSupabaseClient();
  let deactivatedInstead = false;

  if (client) {
    try {
      // First attempt direct deletion
      const { error: deleteError } = await client
        .from('stock_sections')
        .delete()
        .eq('id', sectionId);

      if (deleteError) {
        // Foreign key constraint violation (e.g. historical sales, bale allocations or ledger movements)
        if (
          deleteError.code === '23503' ||
          deleteError.message?.toLowerCase().includes('foreign key') ||
          deleteError.message?.toLowerCase().includes('violates')
        ) {
          // Gracefully archive / deactivate so historical receipts and bale audits remain intact
          const { error: updateError } = await client
            .from('stock_sections')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', sectionId);

          if (updateError) throw updateError;
          deactivatedInstead = true;
        } else {
          throw deleteError;
        }
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      return { success: false, error: `Failed to delete section from database: ${msg}` };
    }
  }

  // Remove from active local catalog
  localInventoryStore.sections = localInventoryStore.sections.filter((s) => s.id !== sectionId);
  localInventoryStore.recalculateBalances();

  return { success: true, deactivatedInstead };
}


/**
 * 3. Fetch all purchased bales/batches with calculated allocated/unallocated costs
 */
export async function getStockBatches(): Promise<{ success: boolean; data: StockBatch[]; error?: string }> {
  const client = getSupabaseClient();

  if (client) {
    try {
      const { data: batches, error: batchErr } = await client
        .from('stock_batches')
        .select('*')
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (batchErr) throw batchErr;

      const { data: allocations, error: allocErr } = await client
        .from('batch_section_allocations')
        .select('batch_id, allocated_cost_kobo');

      if (allocErr) throw allocErr;

      const enriched: StockBatch[] = (batches || []).map((b) => {
        const totalCost = Number(b.purchase_cost_kobo) + Number(b.additional_costs_kobo || 0);
        const allocated = (allocations || [])
          .filter((a) => a.batch_id === b.id)
          .reduce((sum, a) => sum + Number(a.allocated_cost_kobo || 0), 0);
        const unallocated = Math.max(0, totalCost - allocated);

        return {
          id: b.id,
          batch_code: b.batch_code,
          supplier: b.supplier,
          purchase_date: b.purchase_date,
          purchase_cost_kobo: Number(b.purchase_cost_kobo),
          additional_costs_kobo: Number(b.additional_costs_kobo || 0),
          total_cost_kobo: totalCost,
          allocated_cost_kobo: allocated,
          unallocated_cost_kobo: unallocated,
          status: b.status,
          notes: b.notes,
          created_by: b.created_by,
          created_at: b.created_at,
        };
      });

      return { success: true, data: enriched };
    } catch (err: unknown) {
      console.warn('Supabase batch query warning, using local store:', err);
    }
  }

  // Recalculate allocated costs in local store
  localInventoryStore.batches = localInventoryStore.batches.map((b) => {
    const totalCost = b.purchase_cost_kobo + b.additional_costs_kobo;
    const allocated = localInventoryStore.allocations
      .filter((a) => a.batch_id === b.id)
      .reduce((sum, a) => sum + a.allocated_cost_kobo, 0);
    const unallocated = Math.max(0, totalCost - allocated);
    return {
      ...b,
      total_cost_kobo: totalCost,
      allocated_cost_kobo: allocated,
      unallocated_cost_kobo: unallocated,
    };
  });

  const sortedBatches = [...localInventoryStore.batches].sort(
    (a, b) =>
      new Date(b.created_at || b.purchase_date).getTime() -
      new Date(a.created_at || a.purchase_date).getTime()
  );
  return { success: true, data: sortedBatches };
}

/**
 * 4. Register a new bale
 */
export async function registerStockBatch(payload: {
  batch_code: string;
  supplier: string;
  purchase_date: string;
  purchase_cost_kobo: number;
  additional_costs_kobo: number;
  notes?: string;
  created_by: string;
}): Promise<{ success: boolean; data?: StockBatch; error?: string }> {
  if (!payload.batch_code.trim()) {
    return { success: false, error: 'Bale/Batch code is required.' };
  }
  if (!payload.supplier.trim()) {
    return { success: false, error: 'Supplier name is required.' };
  }
  if (payload.purchase_cost_kobo <= 0) {
    return { success: false, error: 'Bale purchase cost must be greater than zero.' };
  }
  if (payload.additional_costs_kobo < 0) {
    return { success: false, error: 'Additional costs cannot be negative.' };
  }

  const client = getSupabaseClient();
  const totalCost = payload.purchase_cost_kobo + payload.additional_costs_kobo;

  if (client) {
    try {
      const { data, error } = await client
        .from('stock_batches')
        .insert({
          batch_code: payload.batch_code.trim().toUpperCase(),
          supplier: payload.supplier.trim(),
          purchase_date: payload.purchase_date,
          purchase_cost_kobo: payload.purchase_cost_kobo,
          additional_costs_kobo: payload.additional_costs_kobo,
          notes: payload.notes?.trim() || null,
          created_by: payload.created_by,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: `Bale code "${payload.batch_code}" already exists in records.` };
        }
        throw error;
      }

      const createdBatch: StockBatch = {
        ...data,
        total_cost_kobo: totalCost,
        allocated_cost_kobo: 0,
        unallocated_cost_kobo: totalCost,
      };

      return { success: true, data: createdBatch };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to register bale in Supabase: ${msg}` };
    }
  }

  // Local store execution
  const existing = localInventoryStore.batches.find(
    (b) => b.batch_code.toLowerCase() === payload.batch_code.trim().toLowerCase()
  );
  if (existing) {
    return { success: false, error: `Bale code "${payload.batch_code}" already exists in records.` };
  }

  const newBatch: StockBatch = {
    id: `batch-${Date.now()}`,
    batch_code: payload.batch_code.trim().toUpperCase(),
    supplier: payload.supplier.trim(),
    purchase_date: payload.purchase_date,
    purchase_cost_kobo: payload.purchase_cost_kobo,
    additional_costs_kobo: payload.additional_costs_kobo,
    total_cost_kobo: totalCost,
    allocated_cost_kobo: 0,
    unallocated_cost_kobo: totalCost,
    status: 'active',
    notes: payload.notes?.trim(),
    created_by: payload.created_by,
    created_at: new Date().toISOString(),
  };

  localInventoryStore.batches.unshift(newBatch);
  return { success: true, data: newBatch };
}

export interface SectionAllocationItem {
  section_id: string;
  quantity: number;
  allocated_cost_kobo: number;
}

/**
 * 5. Atomically allocate sorted bale stock into sections and commit to inventory ledger
 */
export async function allocateBaleStock(payload: {
  batch_id: string;
  allocations: SectionAllocationItem[];
  actor_id: string;
  actor_name: string;
}): Promise<{
  success: boolean;
  total_pieces?: number;
  total_allocated_cost_kobo?: number;
  unallocated_remaining_kobo?: number;
  error?: string;
}> {
  if (payload.allocations.length === 0) {
    return { success: false, error: 'Please specify at least one section allocation.' };
  }

  for (const alloc of payload.allocations) {
    if (alloc.quantity <= 0) {
      return { success: false, error: 'Allocation quantity must be greater than zero.' };
    }
    if (alloc.allocated_cost_kobo < 0) {
      return { success: false, error: 'Allocated cost cannot be negative.' };
    }
  }

  const client = getSupabaseClient();

  if (client) {
    try {
      // Execute the PostgreSQL stored atomic procedure created in Migration 002
      const { data, error } = await client.rpc('allocate_bale_stock_atomic', {
        p_batch_id: payload.batch_id,
        p_allocations: payload.allocations,
        p_actor_id: payload.actor_id,
      });

      if (!error && data?.success) {
        // Mirror in local store movements
        for (const item of payload.allocations) {
          const localSec = localInventoryStore.sections.find((s) => s.id === item.section_id);
          localInventoryStore.movements.unshift({
            id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            section_id: item.section_id,
            section_name: localSec?.name || 'Section',
            movement_type: 'bale_allocation',
            quantity_change: item.quantity,
            reference_id: `rpc-alloc-${Date.now()}`,
            reference_type: 'batch_section_allocation',
            notes: `Stock received from bale (${item.quantity} pcs)`,
            created_by: payload.actor_id,
            created_at: new Date().toISOString(),
          });
        }
        localInventoryStore.recalculateBalances();

        return {
          success: true,
          total_pieces: data.total_pieces_received,
          total_allocated_cost_kobo: data.total_allocated_cost_kobo,
        };
      }
      if (error) {
        console.warn('RPC allocate_bale_stock_atomic error, falling back to multi-step transaction:', error.message);
      }
    } catch (err: unknown) {
      console.warn('RPC invocation failed, trying direct inserts:', err);
    }

    // Direct inserts if RPC is not deployed yet in user's Supabase instance
    try {
      let totalCostAllocated = 0;
      let totalPieces = 0;

      for (const item of payload.allocations) {
        const { data: allocRecord, error: allocErr } = await client
          .from('batch_section_allocations')
          .insert({
            batch_id: payload.batch_id,
            section_id: item.section_id,
            quantity_allocated: item.quantity,
            allocated_cost_kobo: item.allocated_cost_kobo,
          })
          .select()
          .single();

        if (allocErr) throw allocErr;

        const { error: movErr } = await client.from('inventory_movements').insert({
          section_id: item.section_id,
          movement_type: 'bale_allocation',
          quantity_change: item.quantity,
          reference_id: allocRecord.id,
          reference_type: 'batch_section_allocation',
          notes: `Stock received from bale (${item.quantity} pcs)`,
          created_by: payload.actor_id,
        });

        if (movErr) throw movErr;

        totalCostAllocated += item.allocated_cost_kobo;
        totalPieces += item.quantity;

        // Mirror in local store
        const localSec = localInventoryStore.sections.find((s) => s.id === item.section_id);
        localInventoryStore.movements.unshift({
          id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          section_id: item.section_id,
          section_name: localSec?.name || 'Section',
          movement_type: 'bale_allocation',
          quantity_change: item.quantity,
          reference_id: allocRecord.id,
          reference_type: 'batch_section_allocation',
          notes: `Stock received from bale (${item.quantity} pcs)`,
          created_by: payload.actor_id,
          created_at: new Date().toISOString(),
        });
      }

      localInventoryStore.recalculateBalances();

      return {
        success: true,
        total_pieces: totalPieces,
        total_allocated_cost_kobo: totalCostAllocated,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Database allocation error: ${msg}` };
    }
  }

  // Local store execution (with full ledger and balance recalculation)
  const targetBatch = localInventoryStore.batches.find((b) => b.id === payload.batch_id);
  if (!targetBatch) {
    return { success: false, error: 'Target bale batch not found.' };
  }

  if (targetBatch.status === 'archived' || targetBatch.status === 'depleted') {
    return { success: false, error: `Cannot allocate stock from a ${targetBatch.status} bale batch.` };
  }

  const attemptedCost = payload.allocations.reduce((acc, a) => acc + a.allocated_cost_kobo, 0);
  if (targetBatch.allocated_cost_kobo + attemptedCost > targetBatch.total_cost_kobo) {
    return {
      success: false,
      error: `Total allocated cost cannot exceed available bale cost. Attempting to allocate more than remaining unallocated balance.`,
    };
  }

  let totalAllocatedCost = 0;
  let totalPiecesReceived = 0;

  for (const item of payload.allocations) {
    const section = localInventoryStore.sections.find((s) => s.id === item.section_id);
    const allocId = `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Add allocation
    localInventoryStore.allocations.push({
      id: allocId,
      batch_id: payload.batch_id,
      section_id: item.section_id,
      section_name: section?.name || 'Section',
      quantity_allocated: item.quantity,
      allocated_cost_kobo: item.allocated_cost_kobo,
      created_at: new Date().toISOString(),
    });

    // Record in ledger
    localInventoryStore.movements.unshift({
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      section_id: item.section_id,
      section_name: section?.name || 'Section',
      movement_type: 'bale_allocation',
      quantity_change: item.quantity,
      reference_id: allocId,
      reference_type: 'batch_section_allocation',
      notes: `Sorted from ${targetBatch.batch_code} (+${item.quantity} pcs)`,
      created_by: payload.actor_id,
      creator_name: payload.actor_name,
      created_at: new Date().toISOString(),
    });

    totalAllocatedCost += item.allocated_cost_kobo;
    totalPiecesReceived += item.quantity;
  }

  // Recalculate target batch costs
  targetBatch.allocated_cost_kobo += totalAllocatedCost;
  targetBatch.unallocated_cost_kobo = Math.max(0, targetBatch.total_cost_kobo - targetBatch.allocated_cost_kobo);

  // Recalculate section stock balances
  localInventoryStore.recalculateBalances();

  return {
    success: true,
    total_pieces: totalPiecesReceived,
    total_allocated_cost_kobo: totalAllocatedCost,
    unallocated_remaining_kobo: targetBatch.unallocated_cost_kobo,
  };
}

/**
 * 6. Fetch inventory ledger movements with optional section filter
 */
export async function getInventoryMovements(sectionId?: string): Promise<{
  success: boolean;
  data: InventoryMovement[];
  error?: string;
}> {
  const client = getSupabaseClient();

  if (client) {
    try {
      let query = client
        .from('inventory_movements')
        .select(`
          id,
          section_id,
          movement_type,
          quantity_change,
          reference_id,
          reference_type,
          notes,
          created_by,
          created_at,
          stock_sections (name)
        `)
        .order('created_at', { ascending: false });

      if (sectionId && sectionId !== 'all') {
        query = query.eq('section_id', sectionId);
      }

      const { data, error } = await query;
      if (error) throw error;

      interface MovementRow {
        id: string;
        section_id: string;
        movement_type: InventoryMovement['movement_type'];
        quantity_change: number;
        reference_id?: string;
        reference_type?: string;
        notes?: string;
        created_by: string;
        created_at: string;
        stock_sections?: { name?: string } | null;
      }

      const formatted: InventoryMovement[] = ((data as unknown as MovementRow[]) || []).map((m) => ({
        id: m.id,
        section_id: m.section_id,
        section_name: m.stock_sections?.name || 'Section',
        movement_type: m.movement_type,
        quantity_change: m.quantity_change,
        reference_id: m.reference_id,
        reference_type: m.reference_type,
        notes: m.notes,
        created_by: m.created_by,
        creator_name: 'Store Staff / Owner',
        created_at: m.created_at,
      }));

      return { success: true, data: formatted };
    } catch (err: unknown) {
      console.warn('Supabase movements fetch error, using local store:', err);
    }
  }

  let list = localInventoryStore.movements;
  if (sectionId && sectionId !== 'all') {
    list = list.filter((m) => m.section_id === sectionId);
  }

  const sortedMovements = [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return { success: true, data: sortedMovements };
}
