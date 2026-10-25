import React, { useState } from 'react';
import {
  Printer,
  Copy,
  Check,
  X,
  Receipt,
  Clock,
  User,
  AlertCircle,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { Sale } from '../../types/database';
import { formatNaira, formatDateTime } from '../../lib/formatters';

interface ReceiptModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
  onCancelOrRefundClick?: (sale: Sale) => void;
  isOwner?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  isOpen,
  onClose,
  onCancelOrRefundClick,
  isOwner = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !sale) return null;

  const isCancelledOrRefunded = sale.status === 'cancelled' || sale.status === 'refunded' || sale.status === 'reversed';

  const handleCopyText = () => {
    const lines = [
      '========================================',
      '           O3 VARIETIES STORE           ',
      '   Unique Thrift & Quality Garments    ',
      '      Lagos State, Nigeria             ',
      '========================================',
      `Receipt #:   ${sale.receipt_number}`,
      `Date & Time: ${formatDateTime(sale.sale_date)}`,
      `Cashier:     ${sale.staff_name || 'Staff'}`,
      `Status:      ${sale.status.toUpperCase()}`,
      '----------------------------------------',
      'ITEMS PURCHASED:',
    ];

    if (sale.items && sale.items.length > 0) {
      sale.items.forEach((item) => {
        lines.push(
          `${item.quantity}x ${item.section_name} @ ${formatNaira(item.unit_price_kobo)} = ${formatNaira(
            item.line_total_kobo
          )}`
        );
      });
    } else {
      lines.push(`${sale.items_count || 1} item(s) total`);
    }

    lines.push('----------------------------------------');
    lines.push(`Subtotal:    ${formatNaira(sale.subtotal_kobo)}`);
    if (sale.discount_kobo > 0) {
      lines.push(`Discount:   -${formatNaira(sale.discount_kobo)}`);
    }
    lines.push(`TOTAL PAID:  ${formatNaira(sale.total_kobo)}`);
    lines.push('----------------------------------------');
    lines.push('PAYMENT METHOD(S):');

    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach((pay) => {
        const methodLabel =
          pay.payment_method === 'bank_transfer'
            ? 'Bank Transfer'
            : pay.payment_method === 'pos_card'
            ? 'POS / Card'
            : pay.payment_method === 'cash'
            ? 'Cash'
            : 'Other';
        const refStr = pay.reference ? ` (${pay.reference})` : '';
        lines.push(`• ${methodLabel}: ${formatNaira(pay.amount_kobo)}${refStr}`);
      });
    } else {
      lines.push(`• ${sale.notes || 'Payment Confirmed'}`);
    }

    if (sale.cancellation_reason) {
      lines.push('----------------------------------------');
      lines.push(`[${sale.status.toUpperCase()}] Reason: ${sale.cancellation_reason}`);
      if (sale.cancelled_at) {
        lines.push(`Restored on: ${formatDateTime(sale.cancelled_at)}`);
      }
    }

    lines.push('========================================');
    lines.push('   Thank you for shopping at O3 Varieties!   ');
    lines.push('   All sales subject to store return policy. ');
    lines.push('========================================');

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Control Bar */}
        <div className="bg-[#0B193C] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold tracking-wider uppercase">Official Transaction Receipt</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="p-6 text-slate-800 bg-white" id="printable-receipt">
          {/* Status Watermark if Cancelled/Refunded */}
          {isCancelledOrRefunded && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-rose-900 uppercase">
                  This transaction was {sale.status}
                </span>
                {sale.cancellation_reason && (
                  <p className="text-rose-800 mt-0.5">
                    <strong>Reason:</strong> {sale.cancellation_reason}
                  </p>
                )}
                {sale.cancelled_at && (
                  <p className="text-rose-700 text-[11px] mt-0.5">
                    Authorised on {formatDateTime(sale.cancelled_at)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Store Header */}
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#0B193C] text-amber-400 mb-2 font-black text-sm tracking-widest shadow-xs">
              O3
            </div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">O3 VARIETIES STORE</h2>
            <p className="text-xs text-slate-600 font-medium">Unique Thrift &amp; Quality Garments</p>
            <p className="text-[11px] text-slate-600">Lagos State, Nigeria &bull; +234 (0) 800-O3-THRIFT</p>
          </div>

          {/* Metadata Grid */}
          <div className="py-3 border-b border-dashed border-slate-300 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[11px] text-slate-600 font-medium">Receipt Number:</span>
              <div className="font-mono font-bold text-slate-900 text-sm tracking-wide">
                {sale.receipt_number}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-600 font-medium">Status:</span>
              <div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    isCancelledOrRefunded
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {sale.status}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-600 font-medium">Date &amp; Time:</span>
              <div className="text-slate-800 font-medium">{formatDateTime(sale.sale_date)}</div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-600 font-medium">Cashier / Staff:</span>
              <div className="text-slate-800 font-semibold">{sale.staff_name || 'Staff Member'}</div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="py-3 border-b border-dashed border-slate-300">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 border-b border-slate-200">
                  <th className="text-left pb-1.5 font-semibold">Qty &bull; Item Section</th>
                  <th className="text-right pb-1.5 font-semibold">Unit Price</th>
                  <th className="text-right pb-1.5 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.items && sale.items.length > 0 ? (
                  sale.items.map((item) => (
                    <tr key={item.id} className="py-1.5">
                      <td className="py-1.5 text-slate-900 font-medium">
                        <span className="font-bold text-slate-900">{item.quantity}x</span>{' '}
                        <span>{item.section_name}</span>
                        {item.section_code && (
                          <span className="ml-1.5 font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                            {item.section_code}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-mono text-slate-700">
                        {formatNaira(item.unit_price_kobo)}
                      </td>
                      <td className="py-1.5 text-right font-mono font-bold text-slate-900">
                        {formatNaira(item.line_total_kobo)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-2 text-center text-slate-600 italic">
                      {sale.items_count || 1} item(s) purchased
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Calculations */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-700">
              <span>Subtotal:</span>
              <span className="font-mono font-medium">{formatNaira(sale.subtotal_kobo)}</span>
            </div>

            {sale.discount_kobo > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>Permitted Discount:</span>
                <span className="font-mono font-semibold">-{formatNaira(sale.discount_kobo)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
              <span>TOTAL AMOUNT PAID:</span>
              <span className="font-mono text-base text-[#0B193C]">{formatNaira(sale.total_kobo)}</span>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="py-3 border-b border-dashed border-slate-300 text-xs">
            <div className="font-bold text-slate-900 mb-1.5 flex items-center justify-between">
              <span>Settlement Breakdown:</span>
              {sale.payments && sale.payments.length > 1 && (
                <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-bold">
                  SPLIT PAYMENT
                </span>
              )}
            </div>

            {sale.payments && sale.payments.length > 0 ? (
              <div className="space-y-1">
                {sale.payments.map((p) => {
                  const label =
                    p.payment_method === 'bank_transfer'
                      ? 'Bank Transfer'
                      : p.payment_method === 'pos_card'
                      ? 'POS / Card'
                      : p.payment_method === 'cash'
                      ? 'Cash'
                      : 'Other';
                  return (
                    <div key={p.id} className="flex justify-between items-center text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0B193C]" />
                        <span className="font-medium">{label}</span>
                        {p.reference && <span className="text-[10px] text-slate-600 font-mono">({p.reference})</span>}
                      </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {formatNaira(p.amount_kobo)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-600 italic">
                {sale.notes || 'Paid in full via cashier terminal'}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="text-center pt-3 text-[11px] text-slate-600 space-y-0.5">
            <p className="font-semibold text-slate-700">Thank you for patronizing O3 Varieties!</p>
            <p>Exchange allowed within 24 hours with original undamaged receipt.</p>
            <p className="font-mono text-[10px] text-slate-600 mt-1">ID: {sale.id}</p>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B193C] text-white text-xs font-bold rounded-lg hover:bg-[#14285D] transition shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Receipt</span>
            </button>

            <button
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Owner Refund/Cancel Trigger */}
            {isOwner && !isCancelledOrRefunded && onCancelOrRefundClick && (
              <button
                onClick={() => {
                  onClose();
                  onCancelOrRefundClick(sale);
                }}
                className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg hover:bg-rose-100 transition"
              >
                Authorise Refund / Cancel
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
