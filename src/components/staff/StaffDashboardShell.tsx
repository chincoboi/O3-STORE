import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  Receipt,
  Search,
  CheckCircle,
  Clock,
  Layers,
  ArrowRight,
  Info,
  Eye,
  Plus,
} from 'lucide-react';
import { formatNaira, formatDateTime } from '../../lib/formatters';
import { DEMO_SECTIONS, DEMO_CASH_SESSION, DEMO_DAMAGE_REPORTS } from '../../lib/demoData';
import { StockSection, Sale } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import { getStockSections } from '../../lib/inventoryService';
import { getSalesHistory } from '../../lib/salesService';
import { FastPOSModal } from '../pos/FastPOSModal';
import { ReceiptModal } from '../pos/ReceiptModal';

export const StaffDashboardShell: React.FC = () => {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeModal, setActiveModal] = useState<'damage' | 'till' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [sections, setSections] = useState<StockSection[]>(DEMO_SECTIONS);
  const [sales, setSales] = useState<Sale[]>([]);
  const [receiptSearchTerm, setReceiptSearchTerm] = useState('');

  // POS & Receipt Modals State
  const [isPOSOpen, setIsPOSOpen] = useState(false);
  const [selectedSectionForPOS, setSelectedSectionForPOS] = useState<StockSection | null>(null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);

  const loadData = useCallback(async () => {
    const secRes = await getStockSections();
    if (secRes.success && secRes.data) {
      setSections(secRes.data);
    }
    const salesRes = await getSalesHistory({ staffId: profile?.id }, profile || undefined);
    if (salesRes.success && salesRes.data) {
      setSales(salesRes.data);
    }
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // STRICT PRIVACY: Staff can ONLY view their own sales records, never store-wide or other staff's sales (sorted newest to oldest)
  const filteredMySales = sales
    .filter((s) => {
      if (!receiptSearchTerm) return true;
      const term = receiptSearchTerm.toLowerCase();
      return (
        s.receipt_number.toLowerCase().includes(term) ||
        (s.notes && s.notes.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());

  const mySalesTodayKobo = sales.reduce((acc, s) => acc + s.total_kobo, 0);
  const totalAvailableStock = sections.reduce((acc, s) => acc + s.available_stock, 0);
  const totalPhysicalStock = sections.reduce((acc, s) => acc + s.physical_stock, 0);
  const myPendingDamageCount = DEMO_DAMAGE_REPORTS.filter(
    (d) => d.staff_id === profile?.id && d.status === 'pending'
  ).length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sort sections newest to oldest so newly registered goods always appear on top
  const filteredSections = sections
    .filter((sec) => {
      if (sec.is_active === false) return false;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        sec.name.toLowerCase().includes(term) ||
        sec.category.toLowerCase().includes(term) ||
        (sec.section_code && sec.section_code.toLowerCase().includes(term));
      const matchesCategory =
        selectedCategory === 'all' || sec.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());

  const handleSaleSuccess = (newSale: Sale) => {
    showToast(`Sale ${newSale.receipt_number} completed (${formatNaira(newSale.total_kobo)}).`);
    loadData();
    setSelectedSaleForReceipt(newSale);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0B193C] text-white px-4 py-3 rounded-lg shadow-xl text-xs font-medium border border-amber-400/30 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Staff Shift Status Bar */}
      <div className="bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Floor Register &bull; Active Shift
                </h1>
                <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  STAFF TERMINAL
                </span>
                <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-200">
                  Staff Sales Isolation Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Staff: <span className="font-semibold text-slate-700">{profile?.full_name}</span> &bull; Shift opened at {formatDateTime(DEMO_CASH_SESSION.opened_at)}
              </p>
            </div>

            {/* Quick action triggers */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedSectionForPOS(null);
                  setIsPOSOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B193C] text-white text-xs font-bold rounded-lg hover:bg-[#14285D] transition shadow-xs cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>New Sale (POS)</span>
              </button>
              <button
                onClick={() => setActiveModal('damage')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg hover:bg-rose-100 transition"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Report Damage</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Staff Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Metric Cards: Strictly Staff's OWN sales, NO overall store board or other staff's figures */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                My Total Sales Today
              </span>
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 tracking-tight font-mono">
              {formatNaira(mySalesTodayKobo)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Your personal recorded total</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                My Shift Receipts
              </span>
              <div className="p-2 bg-sky-50 text-sky-700 rounded-lg">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900 tracking-tight">
              {sales.length} <span className="text-xs font-normal text-slate-500">transactions</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Billed under your account</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Floor Available Stock
              </span>
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-700 tracking-tight">
              {totalAvailableStock} <span className="text-xs font-normal text-slate-500">sellable</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{totalPhysicalStock} physical in store</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                My Damage Reports
              </span>
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold text-amber-700 tracking-tight">
              {myPendingDamageCount}{' '}
              <span className="text-xs font-normal text-slate-500">pending</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Awaiting owner review</p>
          </div>
        </div>

        {/* Section Stock & Availability Lookup (Core for Shop Floor) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Section Stock &amp; Pricing Directory
                </h3>
                <p className="text-xs text-slate-500">
                  Verify unit selling price and available quantities before billing
                </p>
              </div>

              {/* Search & Category Filter */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search sections..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C] w-48"
                  />
                </div>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium outline-none"
                >
                  <option value="all">All</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Children">Children</option>
                </select>

                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-600 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>New Goods on Top</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">Section Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Selling Price per Piece</th>
                  <th className="py-3 px-4 text-center">Physical Stock</th>
                  <th className="py-3 px-4 text-center">Reserved Damage</th>
                  <th className="py-3 px-4 text-center font-bold text-slate-900">Available For Sale</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSections.map((sec) => (
                  <tr key={sec.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{sec.name}</span>
                        {sec.section_code && (
                          <span className="font-mono text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                            {sec.section_code}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {sec.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {formatNaira(sec.selling_price_kobo)}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-700">{sec.physical_stock}</td>
                    <td className="py-3.5 px-4 text-center">
                      {sec.reserved_stock > 0 ? (
                        <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded text-[10px]">
                          {sec.reserved_stock} reserved
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`font-bold px-2.5 py-0.5 rounded-full text-xs ${
                          sec.available_stock <= sec.low_stock_threshold
                            ? 'bg-rose-100 text-rose-800 font-bold'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {sec.available_stock} pcs
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedSectionForPOS(sec);
                          setIsPOSOpen(true);
                        }}
                        disabled={sec.available_stock === 0}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-[#0B193C] hover:text-white text-slate-700 font-semibold rounded text-[11px] transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        + Add to Sale
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* My Shift Sales Log */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#0B193C]" />
                My Shift Receipts Log
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Showing transactions billed exclusively by <strong className="text-slate-700">{profile?.full_name}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search receipt # / notes..."
                  value={receiptSearchTerm}
                  onChange={(e) => setReceiptSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C] w-48"
                />
              </div>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                {filteredMySales.length} Receipts
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredMySales.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                {receiptSearchTerm
                  ? 'No receipts matched your search query.'
                  : 'No receipts recorded under your account for this shift yet.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Cashier</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4 text-right">Amount (₦)</th>
                    <th className="py-3 px-4">Payment Method / Notes</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMySales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-[#0B193C]">
                        {sale.receipt_number}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatDateTime(sale.sale_date)}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{sale.staff_name}</td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700">
                        {sale.items_count || 1} pcs
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatNaira(sale.total_kobo)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {sale.payments && sale.payments.length > 0 ? (
                              sale.payments.map((p, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                                    p.payment_method === 'cash'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : p.payment_method === 'bank_transfer'
                                      ? 'bg-blue-100 text-blue-800'
                                      : p.payment_method === 'pos_card'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {p.payment_method === 'pos_card'
                                    ? 'POS'
                                    : p.payment_method.replace('_', ' ')}
                                  {p.amount_kobo ? `: ${formatNaira(p.amount_kobo)}` : ''}
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                {sale.notes && sale.notes.toLowerCase().includes('transfer')
                                  ? 'Bank Transfer'
                                  : sale.notes && sale.notes.toLowerCase().includes('pos')
                                  ? 'POS / Card'
                                  : 'Cash'}
                              </span>
                            )}
                          </div>
                          {sale.notes && (
                            <span className="text-[11px] text-slate-500 italic line-clamp-1" title={sale.notes}>
                              {sale.notes}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sale.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedSaleForReceipt(sale)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#0B193C] hover:text-white text-slate-700 font-semibold rounded text-[11px] transition cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* POS Terminal Modal */}
      {isPOSOpen && (
        <FastPOSModal
          isOpen={isPOSOpen}
          onClose={() => {
            setIsPOSOpen(false);
            setSelectedSectionForPOS(null);
          }}
          sections={sections}
          onSaleSuccess={handleSaleSuccess}
          initialSelectedSection={selectedSectionForPOS}
        />
      )}

      {/* Printable / Downloadable Receipt Modal */}
      {selectedSaleForReceipt && (
        <ReceiptModal
          isOpen={Boolean(selectedSaleForReceipt)}
          sale={selectedSaleForReceipt}
          onClose={() => setSelectedSaleForReceipt(null)}
          isOwner={false}
        />
      )}

      {/* Damage Report Preview Modal (For Phase 4) */}
      {activeModal === 'damage' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2 text-rose-700 mb-2 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Report Damaged Garment</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Staff can select clothing section, quantity, damage category (tear, stain, burn, dent, other), description, and optionally upload evidence photos to private Supabase Storage. Submitting immediately reserves stock from sales.
            </p>
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-700 border border-slate-200">
              <strong>Implementation Status:</strong> Scheduled for Phase 4 (Damage reporting, photo uploads &amp; stock reservation).
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-[#0B193C] text-white text-xs font-semibold rounded-lg"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
