import React, { useState } from 'react';
import {
  X,
  Layers,
  Calendar,
  Truck,
  FileText,
  DollarSign,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { formatNaira, nairaToKobo } from '../../lib/formatters';
import { registerStockBatch } from '../../lib/inventoryService';
import { StockBatch } from '../../types/database';

interface BaleRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newBatch: StockBatch) => void;
  currentUserId: string;
}

export const BaleRegistrationModal: React.FC<BaleRegistrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUserId,
}) => {
  const [batchCode, setBatchCode] = useState(
    `BAL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(
      Math.floor(100 + Math.random() * 900)
    )}`
  );
  const [supplier, setSupplier] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseCostNaira, setPurchaseCostNaira] = useState('');
  const [additionalCostNaira, setAdditionalCostNaira] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const purchaseCostKobo = nairaToKobo(purchaseCostNaira);
  const additionalCostKobo = nairaToKobo(additionalCostNaira || '0');
  const totalCostKobo = purchaseCostKobo + additionalCostKobo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!batchCode.trim()) {
      setErrorMessage('Please enter a unique bale / batch code.');
      return;
    }
    if (!supplier.trim()) {
      setErrorMessage('Please enter supplier or merchant name.');
      return;
    }
    if (purchaseCostKobo <= 0) {
      setErrorMessage('Purchase cost must be greater than ₦0.');
      return;
    }

    setIsSubmitting(true);
    const result = await registerStockBatch({
      batch_code: batchCode,
      supplier,
      purchase_date: purchaseDate,
      purchase_cost_kobo: purchaseCostKobo,
      additional_costs_kobo: additionalCostKobo,
      notes,
      created_by: currentUserId,
    });
    setIsSubmitting(false);

    if (result.success && result.data) {
      onSuccess(result.data);
      onClose();
    } else {
      setErrorMessage(result.error || 'Failed to register bale. Please check inputs.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0B193C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Register New Clothing Bale</h3>
              <p className="text-xs text-slate-300">
                Record bale purchase, supplier invoice, and attributable clearing costs
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bale / Batch Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value.toUpperCase())}
                placeholder="e.g. BAL-2026-OCT-03"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono font-semibold focus:ring-1 focus:ring-[#0B193C]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C]"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Supplier / Source Merchant <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Cotonou Direct Importers, Alaba Bale Market"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bale Purchase Cost (₦) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={purchaseCostNaira}
                onChange={(e) => setPurchaseCostNaira(e.target.value)}
                placeholder="e.g. 320000"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono focus:ring-1 focus:ring-[#0B193C]"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {purchaseCostKobo > 0 ? formatNaira(purchaseCostKobo) : 'Base price paid to merchant'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Costs (₦)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={additionalCostNaira}
                onChange={(e) => setAdditionalCostNaira(e.target.value)}
                placeholder="e.g. 45000"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono focus:ring-1 focus:ring-[#0B193C]"
              />
              <p className="text-[11px] text-slate-500 mt-1">Freight, offloading, clearing fees</p>
            </div>
          </div>

          {/* Real-time Attributable Cost Summary Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Base Bale Price:</span>
              <span className="font-mono font-medium">{formatNaira(purchaseCostKobo)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Attributable Logistics:</span>
              <span className="font-mono font-medium">{formatNaira(additionalCostKobo)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
              <span>Total Attributable Bale Cost:</span>
              <span className="font-mono text-[#0B193C] text-sm">{formatNaira(totalCostKobo)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bale Notes / Description (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. UK Grade A first selection men's shirts bale. Estimated 180 pieces."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C]"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B193C] hover:bg-[#14285D] text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering Bale...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Register Bale Batch</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
