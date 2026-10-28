import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  User,
  Calendar,
  DollarSign,
  Maximize2,
  ShieldAlert,
  FileText,
  Clock,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { DamageReport, StockSection } from '../../types/database';
import { reviewDamageReport, getDamagePhotoSignedUrl } from '../../lib/damageService';
import { formatNaira, formatDateTime } from '../../lib/formatters';

interface DamageReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DamageReport | null;
  section?: StockSection;
  reviewerId: string;
  reviewerName?: string;
  reviewerRole: 'super_admin' | 'staff';
  onReviewSuccess: (updatedReport: DamageReport) => void;
}

export const DamageReviewModal: React.FC<DamageReviewModalProps> = ({
  isOpen,
  onClose,
  report,
  section,
  reviewerId,
  reviewerName,
  reviewerRole,
  onReviewSuccess,
}) => {
  const [activeAction, setActiveAction] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState<string | null>(null);
  const [isPhotoEnlarged, setIsPhotoEnlarged] = useState(false);

  // Load photo signed URL if needed
  useEffect(() => {
    if (report?.photo_url) {
      setResolvedPhotoUrl(report.photo_url);
    } else if (report?.photo_storage_path) {
      getDamagePhotoSignedUrl(report.photo_storage_path).then((url) => {
        if (url) setResolvedPhotoUrl(url);
      });
    } else {
      setResolvedPhotoUrl(null);
    }
    setActiveAction('idle');
    setRejectionReason('');
    setErrorMessage(null);
    setIsPhotoEnlarged(false);
  }, [report, isOpen]);

  if (!isOpen || !report) return null;

  const unitPriceKobo = section ? section.selling_price_kobo : 0;
  const totalLossKobo = unitPriceKobo * report.quantity;

  const handleConfirmReview = async (action: 'approve' | 'reject') => {
    setErrorMessage(null);

    if (action === 'reject' && !rejectionReason.trim()) {
      setErrorMessage('A rejection reason is mandatory when rejecting a damage report.');
      return;
    }

    setIsSubmitting(true);
    const result = await reviewDamageReport({
      report_id: report.id,
      reviewer_id: reviewerId,
      reviewer_name: reviewerName,
      reviewer_role: reviewerRole,
      action,
      rejection_reason: action === 'reject' ? rejectionReason.trim() : undefined,
    });
    setIsSubmitting(false);

    if (result.success && result.data) {
      onReviewSuccess(result.data);
      onClose();
    } else {
      setErrorMessage(result.error || `Failed to ${action} damage report.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#0B193C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/30">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Review Damage Report</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    report.status === 'pending'
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                      : report.status === 'approved'
                      ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-rose-400/20 text-rose-300 border border-rose-400/30'
                  }`}
                >
                  {report.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Report #{report.id.substring(0, 8)} &bull; Super Admin Quality Control
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-medium leading-snug">{errorMessage}</span>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Section & Financial Impact Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Garment Section
              </span>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                <Package className="w-4 h-4 text-[#0B193C]" />
                <span>{report.section_name}</span>
                {section?.section_code && (
                  <span className="text-[11px] font-mono text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                    {section.section_code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Category: <strong>{section?.category || 'Clothing'}</strong>
              </p>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Financial Impact
              </span>
              <div className="mt-1 text-sm font-bold font-mono text-rose-700">
                {report.quantity} pcs &times; {formatNaira(unitPriceKobo)} = {formatNaira(totalLossKobo)}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Retail selling value of reported damaged pieces
              </p>
            </div>
          </div>

          {/* Submission Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Reported By
              </span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">{report.staff_name || 'Staff Member'}</span>
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Damage Category
              </span>
              <div className="inline-block uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                {report.damage_type}
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Submitted At
              </span>
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatDateTime(report.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Description Box */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Staff Observation / Defect Details
            </span>
            <p className="text-xs text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
              &ldquo;{report.description}&rdquo;
            </p>
          </div>

          {/* Photo Evidence Preview */}
          {resolvedPhotoUrl ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700">Photo Evidence (Private Vault)</span>
                <button
                  type="button"
                  onClick={() => setIsPhotoEnlarged(!isPhotoEnlarged)}
                  className="text-[11px] text-[#0B193C] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" />
                  {isPhotoEnlarged ? 'Shrink' : 'Enlarge Photo'}
                </button>
              </div>

              <div
                className={`relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 flex items-center justify-center transition-all ${
                  isPhotoEnlarged ? 'h-80' : 'h-48'
                }`}
              >
                <img
                  src={resolvedPhotoUrl}
                  alt="Garment damage evidence"
                  className="w-full h-full object-contain"
                />
                <span className="absolute bottom-2 left-2 text-[9px] bg-black/70 text-white font-mono px-2 py-0.5 rounded backdrop-blur-xs">
                  Signed Vault Token Active
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
              No photo evidence was attached with this report.
            </div>
          )}

          {/* Existing Review Info if Already Reviewed */}
          {report.status !== 'pending' && (
            <div
              className={`p-4 rounded-xl border text-xs ${
                report.status === 'approved'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 text-sm">
                {report.status === 'approved' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Report Approved &amp; Deducted from Physical Stock</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Report Rejected &amp; Released back to Available Floor Stock</span>
                  </>
                )}
              </div>
              <p className="mt-1 text-[11px] opacity-90">
                Reviewed by <strong>{report.reviewer_name || 'Super Admin'}</strong>
                {report.reviewed_at && <> on {formatDateTime(report.reviewed_at)}</>}
              </p>
              {report.rejection_reason && (
                <div className="mt-2.5 p-2.5 bg-white/80 rounded-lg border border-rose-200 text-rose-800 text-xs">
                  <strong>Rejection Reason:</strong> &ldquo;{report.rejection_reason}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Pending Review Actions */}
          {report.status === 'pending' && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              {activeAction === 'idle' && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveAction('reject')}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Reject &amp; Release Reservation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAction('approve')}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-4 bg-[#0B193C] hover:bg-[#14285D] text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    <span>Approve &amp; Deduct Physical Stock</span>
                  </button>
                </div>
              )}

              {/* Approve Confirmation Step */}
              {activeAction === 'approve' && (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3">
                  <div className="flex items-start gap-2.5 text-emerald-900 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-sm font-bold">
                        Confirm Physical Stock Deduction
                      </strong>
                      Approving this report will permanently deduct{' '}
                      <strong>{report.quantity} piece(s)</strong> from the physical inventory of{' '}
                      <strong>{report.section_name}</strong> and log an immutable ledger movement.
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-200/60">
                    <button
                      type="button"
                      onClick={() => setActiveAction('idle')}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmReview('approve')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Deducting Stock...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm Approval (-{report.quantity} pcs)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Reject Confirmation Step with Required Reason */}
              {activeAction === 'reject' && (
                <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-3">
                  <div className="flex items-start gap-2.5 text-rose-900 text-xs">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-sm font-bold">
                        Reject Damage &amp; Release Reservation
                      </strong>
                      Rejecting releases the {report.quantity} piece(s) reservation immediately,
                      restoring them to sale availability on the POS without altering physical inventory.
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-rose-900 mb-1">
                      Mandatory Rejection Reason <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="e.g. Garment was successfully dry-cleaned; spot removed on floor."
                      className="w-full px-3 py-2 text-xs border border-rose-300 rounded-lg outline-none bg-white font-medium focus:ring-2 focus:ring-rose-500"
                      required
                    />
                    <p className="text-[10px] text-rose-700 mt-1">
                      Staff will see this reason in their shift logs so they understand why the piece was returned to sales.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-200/60">
                    <button
                      type="button"
                      onClick={() => setActiveAction('idle')}
                      disabled={isSubmitting}
                      className="px-3.5 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmReview('reject')}
                      disabled={isSubmitting || !rejectionReason.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Releasing Reservation...</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Confirm Rejection &amp; Release</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer close button for already reviewed reports */}
          {report.status !== 'pending' && (
            <div className="pt-3 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#0B193C] text-white text-xs font-semibold rounded-xl hover:bg-[#14285D] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
