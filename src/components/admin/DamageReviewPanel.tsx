import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  X,
  ShieldAlert,
  Loader2,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { DamageReport, DamageStatus, DamageType, StockSection } from '../../types/database';
import { formatDateTime } from '../../lib/formatters';
import { reviewDamageReport } from '../../lib/damageService';
import { extractErrorMessage } from '../../lib/inventoryService';

interface DamageReviewPanelProps {
  damageReports: DamageReport[];
  sections: StockSection[];
  currentUserId: string;
  onReportReviewed: (updatedReport: DamageReport) => void;
  showToast: (msg: string) => void;
}

const QUICK_REJECTION_REASONS = [
  'Item is washable / cleaned on site with stain remover',
  'Minor wrinkle / steam pressed back into sellable grade',
  'Repaired zipper / button replaced by store staff',
  'Wear & tear within normal thrift standard / acceptable grade',
  'Duplicate submission / false report',
];

export const DamageReviewPanel: React.FC<DamageReviewPanelProps> = ({
  damageReports,
  sections,
  currentUserId,
  onReportReviewed,
  showToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | DamageStatus>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Rejection modal state
  const [rejectingReport, setRejectingReport] = useState<DamageReport | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isProcessingReject, setIsProcessingReject] = useState<boolean>(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Approval state
  const [approvingReportId, setApprovingReportId] = useState<string | null>(null);

  // Photo Lightbox modal state
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);

  // Calculate status counts
  const pendingCount = damageReports.filter((r) => r.status === 'pending').length;
  const approvedCount = damageReports.filter((r) => r.status === 'approved').length;
  const rejectedCount = damageReports.filter((r) => r.status === 'rejected').length;

  // Filtered reports
  const filteredReports = damageReports
    .filter((r) => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesSection = sectionFilter === 'all' || r.section_id === sectionFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        r.section_name.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term) ||
        (r.staff_name && r.staff_name.toLowerCase().includes(term)) ||
        r.damage_type.toLowerCase().includes(term);

      return matchesStatus && matchesSection && matchesSearch;
    })
    .sort((a, b) => {
      // Prioritize pending reports at top
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Handle Approval
  const handleApprove = async (report: DamageReport) => {
    setApprovingReportId(report.id);

    try {
      const res = await reviewDamageReport(currentUserId, report.id, 'approved');
      setApprovingReportId(null);

      if (res.success && res.data) {
        showToast(`Report #${report.id.substring(0, 7)} APPROVED: ${report.quantity} pcs permanently deducted from store physical inventory.`);
        onReportReviewed(res.data);
      } else {
        showToast(res.error || 'Failed to approve damage report.');
      }
    } catch (err) {
      setApprovingReportId(null);
      const msg = extractErrorMessage(err);
      showToast(`Approval error: ${msg}`);
    }
  };

  // Open Rejection Dialog
  const handleOpenReject = (report: DamageReport) => {
    setRejectingReport(report);
    setRejectionReason('');
    setRejectError(null);
  };

  // Confirm Rejection
  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingReport) return;

    if (!rejectionReason.trim()) {
      setRejectError('A specific rejection reason is strictly required to release the reservation.');
      return;
    }

    setIsProcessingReject(true);
    setRejectError(null);

    try {
      const res = await reviewDamageReport(
        currentUserId,
        rejectingReport.id,
        'rejected',
        rejectionReason.trim()
      );
      setIsProcessingReject(false);

      if (res.success && res.data) {
        showToast(`Report #${rejectingReport.id.substring(0, 7)} REJECTED: ${rejectingReport.quantity} pcs released back to available sales floor.`);
        onReportReviewed(res.data);
        setRejectingReport(null);
      } else {
        setRejectError(res.error || 'Failed to reject damage report.');
      }
    } catch (err) {
      setIsProcessingReject(false);
      const msg = extractErrorMessage(err);
      setRejectError(`Rejection error: ${msg}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Overview & Rule Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Damage Submissions Review</h3>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
                {pendingCount} Pending Action
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Only the <strong>Super Admin</strong> can approve or reject damage reports. When staff submit a report, garments are held in reservation (preventing POS overselling). Approving permanently deducts physical stock. Rejecting releases reservation back to floor availability.
          </p>
        </div>

        {/* Quick metrics */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center min-w-[70px]">
            <div className="text-xs font-bold text-amber-900">{pendingCount}</div>
            <div className="text-[10px] text-amber-700 font-semibold uppercase">Pending</div>
          </div>
          <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-center min-w-[70px]">
            <div className="text-xs font-bold text-emerald-900">{approvedCount}</div>
            <div className="text-[10px] text-emerald-700 font-semibold uppercase">Approved</div>
          </div>
          <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-center min-w-[70px]">
            <div className="text-xs font-bold text-rose-900">{rejectedCount}</div>
            <div className="text-[10px] text-rose-700 font-semibold uppercase">Rejected</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#0B193C] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Reports ({damageReports.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending ({pendingCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approved ({approvedCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected ({rejectedCount})</span>
          </button>
        </div>

        {/* Search & Section Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search damage reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C] w-48 sm:w-56"
            />
          </div>

          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none bg-white font-medium focus:ring-1 focus:ring-[#0B193C]"
          >
            <option value="all">All Sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.section_code ? `[${s.section_code}] ` : ''}{s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-3.5">
        {filteredReports.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
            <div className="p-3 bg-slate-100 text-slate-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-700">No damage reports found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no reports matching the selected status or section filter.
            </p>
          </div>
        ) : (
          filteredReports.map((report) => (
            <div
              key={report.id}
              className={`p-5 rounded-2xl border bg-white shadow-xs transition-all ${
                report.status === 'pending'
                  ? 'border-amber-400 ring-1 ring-amber-300/50'
                  : report.status === 'approved'
                  ? 'border-slate-200 bg-slate-50/30'
                  : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Left details */}
                <div className="flex items-start gap-4">
                  {/* Quantity & Type Badge */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold shrink-0 ${
                      report.status === 'pending'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : report.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}
                  >
                    <span className="text-sm font-mono leading-none">{report.quantity}x</span>
                    <span className="text-[9px] font-semibold uppercase mt-0.5 opacity-80">pcs</span>
                  </div>

                  {/* Section & Info */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        {report.section_name}
                      </h4>
                      <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {report.damage_type}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          report.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : report.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {report.status === 'pending' ? 'Pending Review' : report.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-normal bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                      &quot;{report.description}&quot;
                    </p>

                    {/* Metadata line */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span>
                        Reported by <strong className="text-slate-700">{report.staff_name}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>{formatDateTime(report.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Actions & Photo Thumbnail */}
                <div className="flex flex-row lg:flex-col items-end justify-between lg:justify-start gap-3 shrink-0">
                  {/* Photo Preview Thumbnail */}
                  {report.photo_url || report.photo_storage_path ? (
                    <div
                      onClick={() => setActivePhotoUrl(report.photo_url || null)}
                      className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-300 w-16 h-16 bg-slate-100 flex items-center justify-center shrink-0"
                      title="Click to view full photo evidence"
                    >
                      {report.photo_url ? (
                        <img
                          src={report.photo_url}
                          alt="Damage evidence"
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      ) : (
                        <div className="text-[10px] text-slate-500 text-center font-semibold p-1">
                          Photo Evidence
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                        <Eye className="w-4 h-4" />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">No photo attached</span>
                  )}

                  {/* Actions for Pending Reports */}
                  {report.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenReject(report)}
                        disabled={approvingReportId === report.id}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject &amp; Release</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApprove(report)}
                        disabled={approvingReportId === report.id}
                        className="px-3.5 py-1.5 bg-[#0B193C] hover:bg-[#14285D] text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        {approvingReportId === report.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span>Approve &amp; Deduct</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Decision Footnote */}
              {report.reviewed_at && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] gap-2">
                  <div className="text-slate-600 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      Decision recorded by <strong>{report.reviewer_name || 'Store Owner'}</strong> on {formatDateTime(report.reviewed_at)}
                    </span>
                  </div>

                  {report.status === 'rejected' && report.rejection_reason && (
                    <div className="text-rose-700 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong>Rejection Reason:</strong> &quot;{report.rejection_reason}&quot; (Stock released)
                      </span>
                    </div>
                  )}

                  {report.status === 'approved' && (
                    <div className="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 font-medium">
                      ✓ Physical stock ledger deducted atomically
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* REJECTION REASON MODAL */}
      {rejectingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
            <div className="bg-rose-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-300" />
                <h3 className="text-base font-bold">Reject Damage Report</h3>
              </div>
              <button
                onClick={() => setRejectingReport(null)}
                className="p-1 text-rose-200 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Rejecting this report will immediately <strong>release {rejectingReport.quantity} pcs</strong> back to available sales floor stock. A specific rejection reason is strictly required.
              </p>

              {rejectError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  {rejectError}
                </div>
              )}

              {/* Quick suggestion pills */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  Quick Select Reason
                </label>
                <div className="space-y-1">
                  {QUICK_REJECTION_REASONS.map((reason, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setRejectionReason(reason)}
                      className="w-full text-left px-2.5 py-1.5 text-[11px] bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-700 transition border border-slate-200"
                    >
                      &bull; {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Rejection Reason / Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this damage report is rejected and how the garment was verified..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-rose-800 text-slate-800"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectingReport(null)}
                  disabled={isProcessingReject}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingReject || !rejectionReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isProcessingReject ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Releasing Stock...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Confirm Rejection &amp; Release</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHOTO LIGHTBOX MODAL */}
      {activePhotoUrl && (
        <div
          onClick={() => setActivePhotoUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2 flex flex-col"
          >
            <div className="flex items-center justify-between p-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">Damage Photo Evidence</span>
              <button
                onClick={() => setActivePhotoUrl(null)}
                className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center max-h-[80vh]">
              <img
                src={activePhotoUrl}
                alt="Full damage evidence"
                className="max-h-[75vh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
