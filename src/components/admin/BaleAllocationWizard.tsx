import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Package,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Info,
  TrendingUp,
  Tag,
  Sparkles,
} from 'lucide-react';
import { formatNaira, nairaToKobo } from '../../lib/formatters';
import { StockBatch, StockSection } from '../../types/database';
import { allocateBaleStock, saveStockSection, SectionAllocationItem } from '../../lib/inventoryService';

export interface AllocationRow {
  id: string;
  isNewSection: boolean;
  section_id: string;
  customName: string;
  category: string;
  sellingPriceNaira: string;
  quantity: number;
  cost_naira: string;
}

interface BaleAllocationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  batches: StockBatch[];
  sections: StockSection[];
  onSuccess: () => void;
  currentUserId: string;
  currentUserName: string;
  preselectedBatchId?: string;
}

const CATEGORY_OPTIONS = [
  'Tops & Shirts',
  'Trousers & Pants',
  'Dresses & Gowns',
  'Skirts & Bottoms',
  'Men',
  'Women',
  'Children',
  'Unisex',
  'Jackets & Outerwear',
  'Variety',
];

export const BaleAllocationWizard: React.FC<BaleAllocationWizardProps> = ({
  isOpen,
  onClose,
  batches,
  sections,
  onSuccess,
  currentUserId,
  currentUserName,
  preselectedBatchId,
}) => {
  const activeBatches = batches
    .filter((b) => b.status === 'active')
    .sort(
      (a, b) =>
        new Date(b.created_at || b.purchase_date).getTime() -
        new Date(a.created_at || a.purchase_date).getTime()
    );
  const availableSections = sections
    .filter((s) => s.is_active)
    .sort(
      (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    );

  const [selectedBatchId, setSelectedBatchId] = useState<string>(
    preselectedBatchId ||
      batches.find((b) => b.status === 'active' && b.unallocated_cost_kobo > 0)?.id ||
      activeBatches[0]?.id ||
      ''
  );
  const [allocationMode, setAllocationMode] = useState<'proportional' | 'custom'>('proportional');
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  const unallocatedCostKobo = selectedBatch ? selectedBatch.unallocated_cost_kobo : 0;

  // Pure helper to distribute unallocated bale costs proportionally by piece count
  const computeProportionalRows = (
    currentRows: AllocationRow[],
    batch: StockBatch | undefined
  ): AllocationRow[] => {
    if (!batch) return currentRows;
    const unalloc = batch.unallocated_cost_kobo;
    const pieces = currentRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    if (pieces <= 0) return currentRows;

    let accumulatedKobo = 0;
    return currentRows.map((r, index) => {
      const isLast = index === currentRows.length - 1;
      let rowCostKobo = 0;

      if (isLast) {
        rowCostKobo = Math.max(0, unalloc - accumulatedKobo);
      } else {
        const ratio = (Number(r.quantity) || 0) / pieces;
        rowCostKobo = Math.round(unalloc * ratio);
        accumulatedKobo += rowCostKobo;
      }

      return {
        ...r,
        cost_naira: (rowCostKobo / 100).toString(),
      };
    });
  };

  // Reset & recompute every time modal opens or a different bale is clicked
  useEffect(() => {
    if (isOpen) {
      const targetBatchId =
        preselectedBatchId ||
        batches.find((b) => b.status === 'active' && b.unallocated_cost_kobo > 0)?.id ||
        activeBatches[0]?.id ||
        '';

      setSelectedBatchId(targetBatchId);
      setAllocationMode('proportional');
      setErrorMessage(null);
      setIsSubmitting(false);

      const batch = batches.find((b) => b.id === targetBatchId);
      const unalloc = batch ? batch.unallocated_cost_kobo : 0;

      const firstSec = availableSections[0];
      const initialRows: AllocationRow[] = [
        {
          id: `row-${Date.now()}-1`,
          isNewSection: false,
          section_id: firstSec?.id || '',
          customName: '',
          category: firstSec?.category || 'Tops & Shirts',
          sellingPriceNaira: firstSec ? (firstSec.selling_price_kobo / 100).toString() : '2000',
          quantity: 20,
          cost_naira: (unalloc / 100).toString(),
        },
      ];
      setRows(initialRows);
    }
  }, [isOpen, preselectedBatchId]);

  if (!isOpen) return null;

  const totalPieces = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  const handleBatchSelectChange = (newBatchId: string) => {
    setSelectedBatchId(newBatchId);
    const newBatch = batches.find((b) => b.id === newBatchId);
    if (allocationMode === 'proportional') {
      setRows((prev) => computeProportionalRows(prev, newBatch));
    }
  };

  const handleSwitchMode = (mode: 'proportional' | 'custom') => {
    setAllocationMode(mode);
    if (mode === 'proportional') {
      setRows((prev) => computeProportionalRows(prev, selectedBatch));
    }
  };

  const handleAddRow = (preset?: { name: string; category: string; priceNaira: string; qty: number }) => {
    const defaultSec = availableSections[0];
    const newRow: AllocationRow = {
      id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isNewSection: !!preset,
      section_id: defaultSec?.id || '',
      customName: preset?.name || '',
      category: preset?.category || 'Tops & Shirts',
      sellingPriceNaira: preset?.priceNaira || (defaultSec ? (defaultSec.selling_price_kobo / 100).toString() : '2000'),
      quantity: preset?.qty || 10,
      cost_naira: '0',
    };

    setRows((prev) => {
      const updated = [...prev, newRow];
      if (allocationMode === 'proportional') {
        return computeProportionalRows(updated, selectedBatch);
      }
      return updated;
    });
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length === 1) return;
    setRows((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      if (allocationMode === 'proportional') {
        return computeProportionalRows(updated, selectedBatch);
      }
      return updated;
    });
  };

  const handleRowChange = (id: string, updates: Partial<AllocationRow>) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        const modified = { ...r, ...updates };

        // When user changes the selected existing section, automatically sync the default selling price & category
        if (updates.section_id && !modified.isNewSection) {
          const matchedSec = availableSections.find((s) => s.id === updates.section_id);
          if (matchedSec) {
            modified.sellingPriceNaira = (matchedSec.selling_price_kobo / 100).toString();
            modified.category = matchedSec.category;
          }
        }
        return modified;
      });

      if ('quantity' in updates && allocationMode === 'proportional') {
        return computeProportionalRows(updated, selectedBatch);
      }
      return updated;
    });
  };

  // Quick preset helper for sorting typical mixed bales (e.g. 190 pieces of Round Neck, Armless Top, Polo)
  const applyPresetScenario = () => {
    const presetRows: AllocationRow[] = [
      {
        id: `preset-${Date.now()}-1`,
        isNewSection: true,
        section_id: '',
        customName: 'Round Neck T-Shirt',
        category: 'Tops & Shirts',
        sellingPriceNaira: '2000',
        quantity: 90,
        cost_naira: '0',
      },
      {
        id: `preset-${Date.now()}-2`,
        isNewSection: true,
        section_id: '',
        customName: 'Armless Top',
        category: 'Tops & Shirts',
        sellingPriceNaira: '1500',
        quantity: 30,
        cost_naira: '0',
      },
      {
        id: `preset-${Date.now()}-3`,
        isNewSection: true,
        section_id: '',
        customName: 'Polo Shirt',
        category: 'Tops & Shirts',
        sellingPriceNaira: '3000',
        quantity: 70,
        cost_naira: '0',
      },
    ];

    if (allocationMode === 'proportional') {
      setRows(computeProportionalRows(presetRows, selectedBatch));
    } else {
      setRows(presetRows);
    }
  };

  // Calculate totals
  const totalAllocatedKobo = rows.reduce((sum, r) => {
    const kobo = nairaToKobo(r.cost_naira || '0');
    return sum + kobo;
  }, 0);

  const totalProjectedRetailKobo = rows.reduce((sum, r) => {
    const priceKobo = nairaToKobo(r.sellingPriceNaira || '0');
    const qty = Number(r.quantity) || 0;
    return sum + qty * priceKobo;
  }, 0);

  const estimatedGrossProfitKobo = totalProjectedRetailKobo - totalAllocatedKobo;
  const markupPercentage =
    totalAllocatedKobo > 0 ? Math.round((estimatedGrossProfitKobo / totalAllocatedKobo) * 100) : 0;

  const differenceKobo = unallocatedCostKobo - totalAllocatedKobo;
  const isOverAllocated = differenceKobo < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedBatch) {
      setErrorMessage('Please select an active bale to allocate from.');
      return;
    }
    if (rows.length === 0) {
      setErrorMessage('Add at least one section allocation row.');
      return;
    }

    // Validate quantities
    for (const r of rows) {
      if (r.isNewSection) {
        if (!r.customName.trim()) {
          setErrorMessage('Please provide a name for all custom clothing sections.');
          return;
        }
        const priceKobo = nairaToKobo(r.sellingPriceNaira || '0');
        if (priceKobo <= 0) {
          setErrorMessage(`Please enter a valid retail selling price (₦) for "${r.customName.trim()}".`);
          return;
        }
      } else {
        if (!r.section_id) {
          setErrorMessage('All allocation rows must have a selected clothing section.');
          return;
        }
      }

      if (Number(r.quantity) <= 0) {
        setErrorMessage('All garment quantities must be at least 1 piece.');
        return;
      }
    }

    if (isOverAllocated) {
      setErrorMessage(
        `Total allocated cost (${formatNaira(totalAllocatedKobo)}) exceeds the bale's available unallocated balance (${formatNaira(unallocatedCostKobo)}).`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payloadAllocations: SectionAllocationItem[] = [];

      for (const r of rows) {
        let finalSectionId = r.section_id;
        const retailPriceKobo = nairaToKobo(r.sellingPriceNaira || '0');

        if (r.isNewSection) {
          const trimmedName = r.customName.trim();
          // Check if an existing section matches case-insensitively and by category
          const existing = availableSections.find(
            (s) =>
              s.name.toLowerCase() === trimmedName.toLowerCase() &&
              (!r.category || s.category.toLowerCase() === r.category.trim().toLowerCase())
          );

          if (existing) {
            finalSectionId = existing.id;
            // Update selling price if user modified it
            if (retailPriceKobo > 0 && existing.selling_price_kobo !== retailPriceKobo) {
              await saveStockSection({
                id: existing.id,
                name: existing.name,
                category: r.category.trim() || existing.category,
                selling_price_kobo: retailPriceKobo,
              });
            }
          } else {
            // Save newly created section
            const newSecRes = await saveStockSection({
              name: trimmedName,
              category: r.category.trim() || 'Tops & Shirts',
              selling_price_kobo: retailPriceKobo,
              low_stock_threshold: 5,
            });

            if (!newSecRes.success || !newSecRes.data) {
              setErrorMessage(newSecRes.error || `Failed to create new clothing section "${trimmedName}".`);
              setIsSubmitting(false);
              return;
            }
            finalSectionId = newSecRes.data.id;
          }
        } else {
          // If user updated the selling price for an existing section, sync it to database
          const existing = availableSections.find((s) => s.id === r.section_id);
          if (existing && retailPriceKobo > 0 && existing.selling_price_kobo !== retailPriceKobo) {
            await saveStockSection({
              id: existing.id,
              name: existing.name,
              category: existing.category,
              selling_price_kobo: retailPriceKobo,
            });
          }
        }

        payloadAllocations.push({
          section_id: finalSectionId,
          quantity: Number(r.quantity),
          allocated_cost_kobo: nairaToKobo(r.cost_naira || '0'),
        });
      }

      const result = await allocateBaleStock({
        batch_id: selectedBatch.id,
        allocations: payloadAllocations,
        actor_id: currentUserId,
        actor_name: currentUserName,
      });

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(result.error || 'Failed to finalize bale allocation.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Error processing bale allocation: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="bg-[#0B193C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-lg text-amber-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Allocate Bale Stock to Sections</h3>
              <p className="text-xs text-slate-300">
                Sort garments into custom price sections &amp; distribute attributable purchase cost
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Select Bale */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                1. Select Source Bale / Batch
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                {activeBatches.length} active bale(s) available
              </span>
            </div>

            <select
              value={selectedBatchId}
              onChange={(e) => handleBatchSelectChange(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white outline-none font-semibold text-slate-800 focus:ring-1 focus:ring-[#0B193C]"
              required
            >
              {activeBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code} &bull; {b.supplier} &bull; Unallocated:{' '}
                  {formatNaira(b.unallocated_cost_kobo)} of {formatNaira(b.total_cost_kobo)}
                </option>
              ))}
            </select>

            {selectedBatch && (
              <>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block">Total Bale Cost</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {formatNaira(selectedBatch.total_cost_kobo)}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block">Allocated So Far</span>
                    <span className="text-xs font-mono font-bold text-emerald-700">
                      {formatNaira(selectedBatch.allocated_cost_kobo)}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase block">Remaining To Allocate</span>
                    <span className="text-xs font-mono font-bold text-amber-700">
                      {formatNaira(selectedBatch.unallocated_cost_kobo)}
                    </span>
                  </div>
                </div>

                {selectedBatch.unallocated_cost_kobo === 0 && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Bale Purchase Cost is 100% Fully Allocated</p>
                      <p className="text-[11px] text-blue-700 mt-0.5">
                        All <strong>{formatNaira(selectedBatch.total_cost_kobo)}</strong> has been distributed. Any additional pieces entered below will be received to sales floor stock with ₦0.00 attributable cost (pure margin).
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 2. Allocation Header & Mode Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                2. Sorted Clothing Sections &amp; Price Tiers
              </span>
              <p className="text-[11px] text-slate-500">
                Choose existing sections or type custom names with retail selling prices for cashier POS.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyPresetScenario}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition"
                title="Populate 90 Round Neck (₦2k), 30 Armless (₦1.5k), 70 Polo (₦3k)"
              >
                <Sparkles className="w-3 h-3 text-indigo-600" />
                <span>Preset: 190 Mixed Tops</span>
              </button>

              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('proportional')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    allocationMode === 'proportional'
                      ? 'bg-white text-[#0B193C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Proportional
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('custom')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    allocationMode === 'custom'
                      ? 'bg-white text-[#0B193C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Custom Cost
                </button>
              </div>
            </div>
          </div>

          {/* Allocation Rows Cards */}
          <div className="space-y-3">
            {rows.map((row, index) => {
              const rowCostKobo = nairaToKobo(row.cost_naira || '0');
              const qty = Number(row.quantity) || 0;
              const unitCostKobo = qty > 0 ? Math.round(rowCostKobo / qty) : 0;
              const unitSellingPriceKobo = nairaToKobo(row.sellingPriceNaira || '0');
              const rowProjectedRevenueKobo = qty * unitSellingPriceKobo;
              const rowMarginKobo = rowProjectedRevenueKobo - rowCostKobo;

              return (
                <div
                  key={row.id}
                  className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3 shadow-xs transition hover:border-slate-300"
                >
                  {/* Row Top Bar: Section Mode Switch + Delete */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#0B193C] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="flex bg-white p-0.5 rounded-lg border border-slate-200 text-xs">
                        <button
                          type="button"
                          onClick={() => handleRowChange(row.id, { isNewSection: false })}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                            !row.isNewSection
                              ? 'bg-[#0B193C] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Select Existing Section
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRowChange(row.id, { isNewSection: true })}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                            row.isNewSection
                              ? 'bg-[#0B193C] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          + Type Custom / New Section
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      disabled={rows.length === 1}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-30"
                      title="Remove Row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Section Identification Inputs */}
                  {row.isNewSection ? (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-white p-3 rounded-lg border border-slate-200">
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Custom Section Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={row.customName}
                          onChange={(e) => handleRowChange(row.id, { customName: e.target.value })}
                          placeholder="e.g. Round Neck, Armless Top, Polo"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-semibold text-slate-800 focus:ring-1 focus:ring-[#0B193C]"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Category
                        </label>
                        <select
                          value={row.category}
                          onChange={(e) => handleRowChange(row.id, { category: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-[#0B193C]"
                        >
                          {CATEGORY_OPTIONS.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Retail Unit Price (₦) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">
                            ₦
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            required
                            value={row.sellingPriceNaira}
                            onChange={(e) =>
                              handleRowChange(row.id, { sellingPriceNaira: e.target.value })
                            }
                            placeholder="e.g. 2000"
                            className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-bold text-emerald-700 focus:ring-1 focus:ring-[#0B193C]"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-white p-3 rounded-lg border border-slate-200">
                      <div className="sm:col-span-8">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Select Registered Section
                        </label>
                        <select
                          value={row.section_id}
                          onChange={(e) => handleRowChange(row.id, { section_id: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-[#0B193C]"
                        >
                          {availableSections.map((s) => (
                            <option key={s.id} value={s.id}>
                              [{s.section_code || 'SEC'}] {s.name} ({s.category}) &bull; Stock: {s.available_stock} pcs &bull; Retail: {formatNaira(s.selling_price_kobo)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                          Retail Price (₦)
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">
                            ₦
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.sellingPriceNaira}
                            onChange={(e) =>
                              handleRowChange(row.id, { sellingPriceNaira: e.target.value })
                            }
                            className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-bold text-emerald-700 focus:ring-1 focus:ring-[#0B193C]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quantity, Cost & Projected Revenue Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Sorted Pieces (Qty)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) =>
                          handleRowChange(
                            row.id,
                            { quantity: Math.max(1, parseInt(e.target.value) || 0) }
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-bold text-slate-900 text-center bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Allocated Bale Cost (₦)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        readOnly={allocationMode === 'proportional'}
                        value={row.cost_naira}
                        onChange={(e) => handleRowChange(row.id, { cost_naira: e.target.value })}
                        placeholder="0.00"
                        className={`w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none font-mono font-semibold ${
                          allocationMode === 'proportional'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-white text-slate-900'
                        }`}
                      />
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Unit Cost:</span>
                      <span className="text-xs font-mono font-semibold text-slate-700">
                        {formatNaira(unitCostKobo)} / pc
                      </span>
                    </div>

                    <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block font-medium">
                        Projected Retail:
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-emerald-800">
                          {formatNaira(rowProjectedRevenueKobo)}
                        </span>
                        {rowMarginKobo > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1 py-0.2 rounded">
                            +{formatNaira(rowMarginKobo)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Preset Chips & Add Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleAddRow()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0B193C] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Section</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Quick Add:</span>
              <button
                type="button"
                onClick={() =>
                  handleAddRow({
                    name: 'Round Neck T-Shirt',
                    category: 'Tops & Shirts',
                    priceNaira: '2000',
                    qty: 90,
                  })
                }
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 transition"
              >
                + 90 Round Neck @ ₦2,000
              </button>
              <button
                type="button"
                onClick={() =>
                  handleAddRow({
                    name: 'Armless Top',
                    category: 'Tops & Shirts',
                    priceNaira: '1500',
                    qty: 30,
                  })
                }
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 transition"
              >
                + 30 Armless Top @ ₦1,500
              </button>
              <button
                type="button"
                onClick={() =>
                  handleAddRow({
                    name: 'Polo Shirt',
                    category: 'Tops & Shirts',
                    priceNaira: '3000',
                    qty: 70,
                  })
                }
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 transition"
              >
                + 70 Polo @ ₦3,000
              </button>
            </div>
          </div>

          {/* Business Owner Intelligence & Reconciliation Bar */}
          <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3 border border-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <TrendingUp className="w-4 h-4" />
                <span>Owner Net Worth &amp; Profit Forecast</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Visible only to Super Admin (Store Owner)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase">Total Pieces</span>
                <span className="text-sm font-bold text-white">{totalPieces} pcs</span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase">Allocated Cost</span>
                <span className="text-sm font-mono font-bold text-amber-400">
                  {formatNaira(totalAllocatedKobo)}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase">Retail Value</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {formatNaira(totalProjectedRetailKobo)}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase">Gross Margin</span>
                <span className="text-sm font-mono font-bold text-emerald-300">
                  +{formatNaira(estimatedGrossProfitKobo)} ({markupPercentage}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-300">Cost Balance Reconciliation:</span>
              {differenceKobo === 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  100% Fully Reconciled
                </span>
              ) : isOverAllocated ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/60 px-2.5 py-0.5 rounded border border-rose-500/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Over-Allocated by {formatNaira(Math.abs(differenceKobo))}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-500/30">
                  <Info className="w-3.5 h-3.5" />
                  {formatNaira(differenceKobo)} Unallocated Remainder
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOverAllocated || totalPieces === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#0B193C] hover:bg-[#14285D] rounded-lg shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Processing &amp; Receiving Stock...</span>
                </>
              ) : (
                <>
                  <Package className="w-4 h-4 text-amber-400" />
                  <span>Confirm &amp; Commit Bale Receipt</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
