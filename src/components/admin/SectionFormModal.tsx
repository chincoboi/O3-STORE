import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  DollarSign,
  AlertCircle,
  Loader2,
  CheckCircle2,
  RotateCw,
  Archive,
  ShieldCheck,
} from 'lucide-react';
import { formatNaira, nairaToKobo } from '../../lib/formatters';
import { StockSection } from '../../types/database';
import { saveStockSection, getNextSectionCode } from '../../lib/inventoryService';

interface SectionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (saved: StockSection) => void;
  sectionToEdit?: StockSection | null;
  existingSections?: StockSection[];
}

export const SectionFormModal: React.FC<SectionFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  sectionToEdit,
  existingSections,
}) => {
  const [name, setName] = useState('');
  const [sectionCode, setSectionCode] = useState('');
  const [category, setCategory] = useState('Men');
  const [sellingPriceNaira, setSellingPriceNaira] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (sectionToEdit) {
      setName(sectionToEdit.name);
      setSectionCode(sectionToEdit.section_code || '');
      setCategory(sectionToEdit.category);
      setSellingPriceNaira((sectionToEdit.selling_price_kobo / 100).toString());
      setLowStockThreshold(sectionToEdit.low_stock_threshold.toString());
      setIsActive(sectionToEdit.is_active);
    } else {
      setName('');
      // Auto-generate unique section code/SKU by default from live sections list
      setSectionCode(getNextSectionCode(existingSections));
      setCategory('Men');
      setSellingPriceNaira('');
      setLowStockThreshold('10');
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [sectionToEdit, isOpen, existingSections]);

  if (!isOpen) return null;

  const sellingPriceKobo = nairaToKobo(sellingPriceNaira || '0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter a section name.');
      return;
    }
    if (sellingPriceKobo <= 0) {
      setErrorMessage('Selling price per piece must be greater than ₦0.');
      return;
    }

    setIsSubmitting(true);
    const result = await saveStockSection({
      id: sectionToEdit?.id,
      section_code: sectionCode.trim().toUpperCase() || undefined,
      name,
      category,
      selling_price_kobo: sellingPriceKobo,
      low_stock_threshold: parseInt(lowStockThreshold, 10) || 5,
      is_active: isActive,
    });
    setIsSubmitting(false);

    if (result.success && result.data) {
      onSuccess(result.data);
      onClose();
    } else {
      setErrorMessage(result.error || 'Failed to save section.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0B193C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {sectionToEdit ? 'Edit Clothing Section' : 'Add New Clothing Section'}
              </h3>
              <p className="text-xs text-slate-300">
                Configure unique section identifier, retail selling price &amp; minimum floor threshold
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Section Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Polo Shirt, Corporate Shirts"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-semibold focus:ring-1 focus:ring-[#0B193C]"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Section Code / SKU
                </label>
                <button
                  type="button"
                  onClick={() => setSectionCode(getNextSectionCode(existingSections))}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5"
                  title="Generate new unique code"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                  Auto
                </button>
              </div>
              <input
                type="text"
                value={sectionCode}
                onChange={(e) => setSectionCode(e.target.value.toUpperCase())}
                placeholder="Auto (SEC-XXX)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono font-bold text-blue-900 bg-blue-50/40 focus:bg-white focus:ring-1 focus:ring-[#0B193C] uppercase"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Auto-assigned unique identifier to distinguish from same-named sections.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Store Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none bg-white font-medium focus:ring-1 focus:ring-[#0B193C]"
              required
            >
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Children">Children</option>
              <option value="Accessories">Accessories</option>
              <option value="Variety">Variety / Mixed</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Selling Price (₦) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={sellingPriceNaira}
                onChange={(e) => setSellingPriceNaira(e.target.value)}
                placeholder="e.g. 4500"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono font-bold focus:ring-1 focus:ring-[#0B193C]"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {sellingPriceKobo > 0 ? formatNaira(sellingPriceKobo) : 'Fixed unit retail price'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Low Stock Alert Threshold
              </label>
              <input
                type="number"
                min="0"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-bold text-center focus:ring-1 focus:ring-[#0B193C]"
              />
              <p className="text-[11px] text-slate-500 mt-1">Trigger alert when available &le; pcs</p>
            </div>
          </div>

          {/* Section Status & Ledger Safety */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-[#0B193C] rounded border-slate-300 focus:ring-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Active on Store Floor
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-200 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {isActive ? 'Available' : 'Archived / Inactive'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {isActive
                      ? 'Garments are available for Fast POS sales and new bale sorting allocations.'
                      : 'Retired from POS sales and bale sorting dropdowns. Past sales receipts, historical bale counts, and stock audit trails remain completely preserved.'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200 text-[11px] text-amber-900 leading-tight flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Audit Ledger Integrity:</strong> To prevent breaking past bale batch reconciliations and historical receipt line-items, sections are safely archived/deactivated rather than permanently deleted.
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#0B193C] hover:bg-[#14285D] text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Section...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{sectionToEdit ? 'Save Changes' : 'Create Section'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
