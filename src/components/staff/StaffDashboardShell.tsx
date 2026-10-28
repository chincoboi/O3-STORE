import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  Receipt,
  Search,
  CheckCircle,
  Eye,
  Plus,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Shield,
  Bell,
} from 'lucide-react';
import { formatNaira, formatDateTime } from '../../lib/formatters';
import { DEMO_SECTIONS, DEMO_CASH_SESSION, DEMO_OWNER } from '../../lib/demoData';
import { StockSection, Sale, DamageReport } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import { getStockSections } from '../../lib/inventoryService';
import { getSalesHistory } from '../../lib/salesService';
import { getDamageReports } from '../../lib/damageService';
import { FastPOSModal } from '../pos/FastPOSModal';
import { ReceiptModal } from '../pos/ReceiptModal';
import { DamageReportModal } from './DamageReportModal';
import { PhotoViewerModal } from '../common/PhotoViewerModal';

export const StaffDashboardShell: React.FC = () => {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [sections, setSections] = useState<StockSection[]>(DEMO_SECTIONS);
  const [sales, setSales] = useState<Sale[]>([]);
  const [damageReports, setDamageReports] = useState<DamageReport[]>([]);
  const [damageFilterStatus, setDamageFilterStatus] = useState<
    'all' | 'owner' | 'my' | 'pending' | 'approved' | 'rejected'
  >('all');
  const [receiptSearchTerm, setReceiptSearchTerm] = useState('');

  // POS & Receipt Modals State
  const [isPOSOpen, setIsPOSOpen] = useState(false);
  const [selectedSectionForPOS, setSelectedSectionForPOS] = useState<StockSection | null>(null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);

  // Phase 4 Damage Reporting & Photo Lightbox State
  const [isDamageModalOpen, setIsDamageModalOpen] = useState(false);
  const [selectedSectionForDamage, setSelectedSectionForDamage] = useState<StockSection | null>(null);
  const [photoViewerState, setPhotoViewerState] = useState<{
    isOpen: boolean;
    url?: string | null;
    title?: string;
    subtitle?: string;
  }>({ isOpen: false });

  const loadData = useCallback(async () => {
    const secRes = await getStockSections();
    if (secRes.success && secRes.data) {
      setSections(secRes.data);
    }
    // Sales isolation: staff only retrieves their own sales transactions
    const salesRes = await getSalesHistory({ staffId: profile?.id }, profile || undefined);
    if (salesRes.success && salesRes.data) {
      setSales(salesRes.data);
    }
    // Store floor inventory synchronization: fetch store damage reports so owner notices & holds reflect for all staff
    const dmgRes = await getDamageReports();
    if (dmgRes.success && dmgRes.data) {
      setDamageReports(dmgRes.data);
    }
  }, [profile]);

  useEffect(() => {
    loadData();
    const handleSync = () => {
      loadData();
    };
    window.addEventListener('o3:inventory_updated', handleSync);
    return () => {
      window.removeEventListener('o3:inventory_updated', handleSync);
    };
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
  const totalReservedStock = sections.reduce((acc, s) => acc + s.reserved_stock, 0);

  // Pending damages across store
  const storePendingDamageCount = damageReports.filter((d) => d.status === 'pending').length;

  // Active pending reports submitted by the Owner / Super Admin
  const ownerActiveDamages = damageReports.filter(
    (d) =>
      d.status === 'pending' &&
      (d.is_owner_report ||
        d.reporter_role === 'super_admin' ||
        d.staff_id === DEMO_OWNER.id ||
        d.staff_name?.toLowerCase().includes('owner'))
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
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

  const handleDamageReportSuccess = (newReport: DamageReport) => {
    showToast(`Damage report submitted! ${newReport.quantity} pc(s) reserved from sale availability.`);
    loadData();
  };

  // Filter damage reports according to selected tab
  const filteredDamages = damageReports.filter((d) => {
    const isOwner =
      d.is_owner_report ||
      d.reporter_role === 'super_admin' ||
      d.staff_id === DEMO_OWNER.id ||
      d.staff_name?.toLowerCase().includes('owner');

    if (damageFilterStatus === 'all') return true;
    if (damageFilterStatus === 'owner') return isOwner;
    if (damageFilterStatus === 'my') return d.staff_id === profile?.id;
    return d.status === damageFilterStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0B193C] text-white px-4 py-3 rounded-lg shadow-xl text-xs font-medium border border-amber-400/30 flex items-center gap-2 animate-in slide-in-from-bottom-2">
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
                onClick={() => {
                  setSelectedSectionForDamage(null);
                  setIsDamageModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg hover:bg-rose-100 transition cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Report Damage</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Staff Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Real-Time Owner Damage Alert Notice Banner */}
        {ownerActiveDamages.length > 0 && (
          <div className="bg-amber-50/95 border-2 border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-200/70 text-amber-900 rounded-lg shrink-0 mt-0.5">
                <Shield className="w-5 h-5 text-purple-900" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1">
                    <span>Store Owner Damage Notice</span>
                    <span className="text-[10px] bg-rose-600 text-white font-extrabold px-1.5 py-0.2 rounded uppercase">
                      DO NOT SELL
                    </span>
                  </h3>
                  <span className="text-xs text-amber-800 font-medium">
                    &bull; {ownerActiveDamages.length} item(s) reported by Store Owner Olumide Oladipo
                  </span>
                </div>
                <p className="text-xs text-amber-900 mt-1">
                  The Store Owner reported damaged garments. These are <strong>automatically held and subtracted</strong> from your POS checkout:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ownerActiveDamages.map((dmg) => (
                    <div
                      key={dmg.id}
                      className="inline-flex items-center gap-2 bg-white border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs"
                    >
                      <span className="text-purple-950 font-bold font-mono">
                        {dmg.quantity}x {dmg.section_name}
                      </span>
                      <span className="uppercase text-[10px] font-extrabold bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded">
                        {dmg.damage_type}
                      </span>
                      <span className="text-slate-600 font-normal italic text-[11px]">
                        &quot;{dmg.description}&quot;
                      </span>
                      {dmg.photo_url || dmg.photo_storage_path ? (
                        <button
                          onClick={() =>
                            setPhotoViewerState({
                              isOpen: true,
                              url: dmg.photo_url || dmg.photo_storage_path,
                              title: `Owner Damage: ${dmg.section_name} (${dmg.damage_type})`,
                              subtitle: `Reported by Store Owner &bull; ${dmg.quantity} pc(s) held from sale`,
                            })
                          }
                          className="text-[10px] text-blue-700 underline font-bold ml-1 cursor-pointer"
                        >
                          View Photo
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setDamageFilterStatus('owner')}
              className="text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-200/80 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition shrink-0 cursor-pointer text-center"
            >
              View Owner Holds &rarr;
            </button>
          </div>
        )}

        {/* Metric Cards: Strictly Staff's OWN sales + Store-Wide Damage Holds */}
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
                Store Damaged Holds
              </span>
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold text-amber-700 tracking-tight">
              {totalReservedStock}{' '}
              <span className="text-xs font-normal text-slate-500">reserved pcs</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {storePendingDamageCount} pending report(s)
              {ownerActiveDamages.length > 0 ? ` (${ownerActiveDamages.length} from Owner)` : ''}
            </p>
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
                  Verify unit selling price and available quantities before billing &bull; Damaged goods are automatically reserved
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
                  <th className="py-3 px-4 text-center">Actions</th>
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
                        <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded text-[10px] border border-amber-200 inline-flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                          <span>{sec.reserved_stock} reserved</span>
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
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedSectionForPOS(sec);
                            setIsPOSOpen(true);
                          }}
                          disabled={sec.available_stock === 0}
                          className="px-2.5 py-1 bg-[#0B193C] hover:bg-[#14285D] text-white font-semibold rounded-lg text-[11px] transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Add item to POS cart"
                        >
                          + Sale
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSectionForDamage(sec);
                            setIsDamageModalOpen(true);
                          }}
                          disabled={sec.available_stock === 0}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium rounded-lg text-[11px] transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Report damaged piece in this section"
                        >
                          <AlertTriangle className="w-3 h-3 text-rose-600 inline mr-0.5" />
                          <span>Damage</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Phase 4: Floor Damage Submissions & Owner Reservation Notices */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Store Floor Damage Submissions &amp; Reservations
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Real-time sync: damages reported by the Store Owner or staff are automatically held from POS checkout
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setDamageFilterStatus('all')}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  damageFilterStatus === 'all'
                    ? 'bg-[#0B193C] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Holds ({damageReports.length})
              </button>

              <button
                onClick={() => setDamageFilterStatus('owner')}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                  damageFilterStatus === 'owner'
                    ? 'bg-purple-900 text-white'
                    : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
                }`}
              >
                <Shield className="w-3 h-3 text-purple-700" />
                <span>
                  Owner Holds ({
                    damageReports.filter(
                      (d) =>
                        d.is_owner_report ||
                        d.reporter_role === 'super_admin' ||
                        d.staff_id === DEMO_OWNER.id ||
                        d.staff_name?.toLowerCase().includes('owner')
                    ).length
                  })
                </span>
              </button>

              <button
                onClick={() => setDamageFilterStatus('my')}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  damageFilterStatus === 'my'
                    ? 'bg-[#0B193C] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                My Submissions ({damageReports.filter((d) => d.staff_id === profile?.id).length})
              </button>

              <button
                onClick={() => setDamageFilterStatus('pending')}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  damageFilterStatus === 'pending'
                    ? 'bg-amber-800 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                Pending ({damageReports.filter((d) => d.status === 'pending').length})
              </button>

              <button
                onClick={() => {
                  setSelectedSectionForDamage(null);
                  setIsDamageModalOpen(true);
                }}
                className="ml-2 inline-flex items-center gap-1 px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3 h-3" />
                <span>Report Damage</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredDamages.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No damage reports under this filter.</p>
                <p className="text-slate-400 mt-0.5">
                  Click &quot;Report Damage&quot; if you find stained, torn, burnt, or dented garments on the floor racks.
                </p>
              </div>
            ) : (
              filteredDamages.map((report) => {
                const isOwner =
                  report.is_owner_report ||
                  report.reporter_role === 'super_admin' ||
                  report.staff_id === DEMO_OWNER.id ||
                  report.staff_name?.toLowerCase().includes('owner');

                return (
                  <div
                    key={report.id}
                    className={`p-4 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                      isOwner && report.status === 'pending'
                        ? 'bg-purple-50/40 border-l-4 border-l-purple-600'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          report.status === 'pending'
                            ? isOwner
                              ? 'bg-purple-100 text-purple-900 border border-purple-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                            : report.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {report.quantity}x
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs">{report.section_name}</span>
                          {report.section_code && (
                            <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                              {report.section_code}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              report.damage_type === 'dent'
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {report.damage_type}
                          </span>

                          {isOwner && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1 shrink-0">
                              <Shield className="w-3 h-3 text-purple-700" />
                              <span>Store Owner Hold</span>
                            </span>
                          )}

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              report.status === 'pending'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : report.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                : 'bg-rose-100 text-rose-900 border border-rose-200'
                            }`}
                          >
                            {report.status === 'pending'
                              ? 'Pending Hold'
                              : report.status === 'approved'
                              ? 'Approved & Deducted'
                              : 'Rejected & Released'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 mt-1">{report.description}</p>

                        <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1.5 flex-wrap">
                          <span>
                            Reported by <strong>{isOwner ? `${report.staff_name || 'Store Owner (Super Admin)'}` : report.staff_name}</strong> on{' '}
                            {formatDateTime(report.created_at)}
                          </span>
                          {report.reviewed_at && (
                            <span>
                              &bull; Decision by {report.reviewer_name || 'Owner'} on {formatDateTime(report.reviewed_at)}
                            </span>
                          )}
                        </div>

                        {report.rejection_reason && (
                          <div className="mt-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg flex items-start gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong>Owner Rejection Reason:</strong> &quot;{report.rejection_reason}&quot; (Stock released back to rack).
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Photo Evidence button */}
                    {(report.photo_url || report.photo_storage_path) && (
                      <button
                        onClick={() =>
                          setPhotoViewerState({
                            isOpen: true,
                            url: report.photo_url || report.photo_storage_path,
                            title: `Evidence: ${report.section_name} (${report.damage_type.toUpperCase()})`,
                            subtitle: `Reported by ${report.staff_name} &bull; ${report.quantity} piece(s) held`,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer shrink-0"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>View Photo</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
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
                Staff Privacy Protection: Only transactions billed under your account are visible here
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search receipt #..."
                value={receiptSearchTerm}
                onChange={(e) => setReceiptSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C] w-48"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredMySales.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No shift receipts recorded yet.</p>
                <p className="text-slate-400 mt-0.5">Click &quot;New Sale (POS)&quot; to begin billing customers.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Receipt #</th>
                    <th className="py-2.5 px-4">Time</th>
                    <th className="py-2.5 px-4 text-center">Items</th>
                    <th className="py-2.5 px-4 text-right">Amount (₦)</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filteredMySales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{sale.receipt_number}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDateTime(sale.sale_date)}</td>
                      <td className="py-3 px-4 text-center text-slate-700">{sale.items_count || '-'}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {formatNaira(sale.total_kobo)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
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

      {/* Phase 4 Damage Reporting Modal */}
      {isDamageModalOpen && (
        <DamageReportModal
          isOpen={isDamageModalOpen}
          onClose={() => {
            setIsDamageModalOpen(false);
            setSelectedSectionForDamage(null);
          }}
          sections={sections}
          initialSection={selectedSectionForDamage}
          onSuccess={handleDamageReportSuccess}
        />
      )}

      {/* Photo Lightbox Modal */}
      {photoViewerState.isOpen && (
        <PhotoViewerModal
          isOpen={photoViewerState.isOpen}
          imageUrl={photoViewerState.url}
          title={photoViewerState.title}
          subtitle={photoViewerState.subtitle}
          onClose={() => setPhotoViewerState({ isOpen: false })}
        />
      )}
    </div>
  );
};
