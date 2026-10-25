import React, { useState } from 'react';
import { AlertTriangle, X, CheckCircle, RotateCcw, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Sale } from '../../types/database';
import { formatNaira, formatDateTime } from '../../lib/formatters';
import { cancelOrRefundSale } from '../../lib/salesService';
import { useAuth } from '../../contexts/AuthContext';

interface SaleCancellationModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedSale: Sale) => void;
}

export const SaleCancellationModal: React.FC<SaleCancellationModalProps> = ({
  sale,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { profile } = useAuth();
  const [actionType, setActionType] = useState<'refunded' | 'cancelled'>('refunded');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !sale) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason.trim()) {
      setErrorMessage('Please state the mandatory reason for cancelling or refunding this sale.');
      return;
    }

    if (!confirmed) {
      setErrorMessage('You must check the confirmation box to authorize this inventory rollback.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await cancelOrRefundSale(
        {
          sale_id: sale.id,
          actor_id: profile?.id || 'demo-owner-001',
          actor_name: profile?.full_name || 'Store Owner',
          reason: reason.trim(),
          action_type: actionType,
        },
        profile || undefined
      );

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'Failed to cancel or refund the sale.');
        setIsSubmitting(false);
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-rose-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="text-sm font-bold tracking-tight">Authorise Sale Cancellation &amp; Stock Return</h3>
              <p className="text-[11px] text-rose-200">Owner Authorization Required &bull; Atomic Ledger Reversal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-rose-200 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs text-slate-700">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Target Receipt Summary */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Target Receipt:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{sale.receipt_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Billed On:</span>
              <span className="text-slate-800">{formatDateTime(sale.sale_date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Cashier:</span>
              <span className="font-medium text-slate-900">{sale.staff_name || 'Staff'}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
              <span className="font-bold text-slate-900">Total Billed:</span>
              <span className="font-mono font-black text-rose-700 text-sm">{formatNaira(sale.total_kobo)}</span>
            </div>
          </div>

          {/* Garments to Return to Inventory */}
          <div>
            <label className="block font-bold text-slate-900 mb-1.5 flex items-center justify-between">
              <span>Items to be Returned to Stock:</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Automatic Inventory Replenishment
              </span>
            </label>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-32 overflow-y-auto">
              {sale.items && sale.items.length > 0 ? (
                sale.items.map((it) => (
                  <div key={it.id} className="p-2.5 flex items-center justify-between bg-white text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{it.quantity} pcs</span> &bull;{' '}
                      <span className="text-slate-700">{it.section_name}</span>
                    </div>
                    <span className="font-mono text-slate-600 font-semibold">{formatNaira(it.line_total_kobo)}</span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-slate-500 italic">
                  {sale.items_count || 1} item(s) will be restored to store section balance.
                </div>
              )}
            </div>
          </div>

          {/* Action Type */}
          <div>
            <label className="block font-bold text-slate-900 mb-1">Action Type:</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                  actionType === 'refunded'
                    ? 'border-rose-600 bg-rose-50/60 text-rose-950 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="action_type"
                  value="refunded"
                  checked={actionType === 'refunded'}
                  onChange={() => setActionType('refunded')}
                  className="accent-rose-600"
                />
                <div>
                  <div className="text-xs">Refund Sale</div>
                  <div className="text-[10px] font-normal text-slate-500">Money returned to customer</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                  actionType === 'cancelled'
                    ? 'border-rose-600 bg-rose-50/60 text-rose-950 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="action_type"
                  value="cancelled"
                  checked={actionType === 'cancelled'}
                  onChange={() => setActionType('cancelled')}
                  className="accent-rose-600"
                />
                <div>
                  <div className="text-xs">Cancel / Void</div>
                  <div className="text-[10px] font-normal text-slate-500">Erroneous checkout / billing</div>
                </div>
              </label>
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block font-bold text-slate-900 mb-1">
              Mandatory Reason / Notes for Audit Trail <span className="text-rose-600">*</span>:
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer returned unworn shirt within 24h, or cashier rung up wrong section..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-1 focus:ring-rose-600 bg-white"
            />
          </div>

          {/* Confirmation Checkbox */}
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-rose-700 w-4 h-4 rounded"
              />
              <span className="text-xs text-amber-900 font-medium">
                I confirm as Store Owner to reverse receipt <strong>{sale.receipt_number}</strong>. This will
                atomically post positive replenishment entries to the immutable inventory ledger and update audit logs.
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !confirmed || !reason.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Processing Reversal...' : `Confirm ${actionType.toUpperCase()}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
