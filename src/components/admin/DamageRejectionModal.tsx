import React, { useState } from 'react';
import { X, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { DamageReport } from '../../types/database';
import { extractErrorMessage } from '../../lib/inventoryService';

interface DamageRejectionModalProps {
  isOpen: boolean;
  report: DamageReport | null;
  onClose: () => void;
  onConfirm: (reportId: string, reason: string) => Promise<void>;
}

const QUICK_REASONS = [
  'Item verified cleanable with spot remover / laundry',
  'Fabric defect handled directly with bale supplier',
  'Minor crease / fold line, not a structural defect',
  'Item repaired and returned to floor rack',
  'Discoloration washable, restored to shop floor',
];

export const DamageRejectionModal: React.FC<DamageRejectionModalProps> = ({
  isOpen,
  report,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !report) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanReason = reason.trim();
    if (!cleanReason) {
      setErrorMessage('A rejection reason is mandatory to reject a damage report.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(report.id, cleanReason);
      setReason('');
      onClose();
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      setErrorMessage(msg || 'Failed to reject damage report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-rose-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl text-rose-300">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Reject Damage &amp; Release Stock</h3>
              <p className="text-xs text-rose-200 mt-0.5">
                Releases {report.quantity} pc(s) of {report.section_name} back for sale
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-rose-200 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Reasons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Select or Customize Rejection Reason
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_REASONS.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => setReason(qr)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition text-left cursor-pointer ${
                    reason === qr
                      ? 'bg-rose-100 border-rose-300 text-rose-900 font-bold'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {qr}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this damage report is rejected (e.g., item verified cleanable, minor fold, or repaired)..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-rose-800"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-bold text-slate-800">Reservation Release Notice:</div>
            <p className="text-[11px] leading-relaxed">
              Rejecting this report removes the stock hold and releases <strong>{report.quantity} pc(s)</strong> back into available sellable stock on the store POS terminal.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Releasing Stock...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Confirm Rejection &amp; Release</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
