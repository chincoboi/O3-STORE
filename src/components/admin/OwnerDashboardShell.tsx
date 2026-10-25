import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Receipt,
  FileCheck2,
  DollarSign,
  Users,
  Shield,
  Layers,
  ArrowUpRight,
  Database,
  CheckCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  Clock,
  ExternalLink,
  Plus,
  Edit2,
  Calculator,
  History,
} from 'lucide-react';
import { formatNaira, formatDate, formatDateTime } from '../../lib/formatters';
import {
  DEMO_SECTIONS,
  DEMO_BATCHES,
  DEMO_SALES,
  DEMO_DAMAGE_REPORTS,
  DEMO_EXPENSES,
  DEMO_STAFF,
  DEMO_STAFF_2,
  DEMO_OWNER,
  DEMO_MOVEMENTS,
} from '../../lib/demoData';
import { StockSection, StockBatch, DamageReport } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import { BaleRegistrationModal } from './BaleRegistrationModal';
import { BaleAllocationWizard } from './BaleAllocationWizard';
import { SectionFormModal } from './SectionFormModal';
import { StockReceiptHistory } from './StockReceiptHistory';
import { getStockSections, getStockBatches } from '../../lib/inventoryService';
import { getSalesHistory } from '../../lib/salesService';
import { Sale } from '../../types/database';
import { ReceiptModal } from '../pos/ReceiptModal';
import { SaleCancellationModal } from '../pos/SaleCancellationModal';
import { Eye, RotateCcw, Search as SearchIcon } from 'lucide-react';

export const OwnerDashboardShell: React.FC = () => {
  const { user, profile, isDemoMode, setIsSetupModalOpen } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'sales_board' | 'sections' | 'bales' | 'damage' | 'expenses' | 'staff' | 'database'
  >('overview');

  // Phase 2 & 3 state
  const [sections, setSections] = useState<StockSection[]>(DEMO_SECTIONS);
  const [batches, setBatches] = useState<StockBatch[]>(DEMO_BATCHES);
  const [damageReports, setDamageReports] = useState<DamageReport[]>(DEMO_DAMAGE_REPORTS);
  const [sales, setSales] = useState<Sale[]>(DEMO_SALES);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [salesStaffFilter, setSalesStaffFilter] = useState<string>('all');
  const [salesStatusFilter, setSalesStatusFilter] = useState<string>('all');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<string>('all');
  const [salesSearchTerm, setSalesSearchTerm] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isRegisterBaleOpen, setIsRegisterBaleOpen] = useState(false);
  const [isAllocationWizardOpen, setIsAllocationWizardOpen] = useState(false);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [sectionToEdit, setSectionToEdit] = useState<StockSection | null>(null);
  const [selectedBaleForAllocation, setSelectedBaleForAllocation] = useState<string | undefined>(undefined);
  const [baleSubTab, setBaleSubTab] = useState<'inventory' | 'ledger'>('inventory');
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);
  const [saleToCancelOrRefund, setSaleToCancelOrRefund] = useState<Sale | null>(null);

  const reloadInventory = async () => {
    const secRes = await getStockSections();
    if (secRes.success && secRes.data) {
      setSections(secRes.data);
    }
    const batchRes = await getStockBatches();
    if (batchRes.success && batchRes.data) {
      setBatches(batchRes.data);
    }
    const salesRes = await getSalesHistory({}, profile || undefined);
    if (salesRes.success && salesRes.data) {
      setSales(salesRes.data);
    }
  };

  useEffect(() => {
    reloadInventory();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Dynamic Calculations for Overview
  const completedSales = sales.filter((s) => s.status === 'completed');
  const totalSalesTodayKobo = completedSales.reduce((acc, s) => acc + s.total_kobo, 0);
  const totalExpensesTodayKobo = DEMO_EXPENSES.reduce((acc, e) => acc + e.amount_kobo, 0);
  const pendingDamageCount = damageReports.filter((d) => d.status === 'pending').length;
  const totalPhysicalStock = sections.reduce((acc, s) => acc + s.physical_stock, 0);
  const totalAvailableStock = sections.reduce((acc, s) => acc + s.available_stock, 0);
  const totalReservedStock = sections.reduce((acc, s) => acc + s.reserved_stock, 0);
  const lowStockSections = sections.filter((s) => s.available_stock <= s.low_stock_threshold);

  // Bale stats (Owner Only)
  const totalBaleCostKobo = batches.reduce((acc, b) => acc + b.total_cost_kobo, 0);
  const totalUnallocatedCostKobo = batches.reduce((acc, b) => acc + b.unallocated_cost_kobo, 0);

  // Dynamic Cashier Shift Breakdown across both demo and live Supabase staff accounts
  const cashierBreakdown = useMemo(() => {
    const map = new Map<string, { staffId: string; staffName: string; totalKobo: number; count: number; completedCount: number; badge: string }>();

    // Seed default demo shift cashiers
    map.set(DEMO_STAFF.id, { staffId: DEMO_STAFF.id, staffName: DEMO_STAFF.full_name, totalKobo: 0, count: 0, completedCount: 0, badge: 'Shift 1' });
    map.set(DEMO_STAFF_2.id, { staffId: DEMO_STAFF_2.id, staffName: DEMO_STAFF_2.full_name, totalKobo: 0, count: 0, completedCount: 0, badge: 'Shift 2' });

    sales.forEach((s) => {
      let key = s.staff_id;
      let name = s.staff_name || 'Staff Cashier';

      if (name.toLowerCase().includes('chidinma') || key === DEMO_STAFF.id) {
        key = DEMO_STAFF.id;
        name = DEMO_STAFF.full_name;
      } else if (name.toLowerCase().includes('babatunde') || key === DEMO_STAFF_2.id) {
        key = DEMO_STAFF_2.id;
        name = DEMO_STAFF_2.full_name;
      }

      if (!map.has(key)) {
        map.set(key, {
          staffId: key,
          staffName: name,
          totalKobo: 0,
          count: 0,
          completedCount: 0,
          badge: `Cashier`,
        });
      }

      const entry = map.get(key)!;
      entry.count += 1;
      if (s.status === 'completed') {
        entry.totalKobo += s.total_kobo;
        entry.completedCount += 1;
      }
    });

    return Array.from(map.values());
  }, [sales]);

  // Damage Approval Handler (Simulated in Phase 1 demo shell)
  const handleApproveDamage = (reportId: string) => {
    const report = damageReports.find((r) => r.id === reportId);
    if (!report) return;

    setDamageReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              status: 'approved',
              reviewed_by: DEMO_OWNER.id,
              reviewer_name: DEMO_OWNER.full_name,
              reviewed_at: new Date().toISOString(),
            }
          : r
      )
    );

    // Approved damage deducts physical stock exactly once and releases reservation
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === report.section_id) {
          const newPhysical = Math.max(0, s.physical_stock - report.quantity);
          const newReserved = Math.max(0, s.reserved_stock - report.quantity);
          return {
            ...s,
            physical_stock: newPhysical,
            reserved_stock: newReserved,
            available_stock: newPhysical - newReserved,
          };
        }
        return s;
      })
    );

    showToast(`Damage Report #${reportId} APPROVED. ${report.quantity} item(s) deducted from physical inventory.`);
  };

  const handleRejectDamage = (reportId: string) => {
    const report = damageReports.find((r) => r.id === reportId);
    if (!report) return;

    setDamageReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              status: 'rejected',
              rejection_reason: 'Item verified cleanable / repaired on site',
              reviewed_by: DEMO_OWNER.id,
              reviewer_name: DEMO_OWNER.full_name,
              reviewed_at: new Date().toISOString(),
            }
          : r
      )
    );

    // Rejected damage releases reservation back to sale availability
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === report.section_id) {
          const newReserved = Math.max(0, s.reserved_stock - report.quantity);
          return {
            ...s,
            reserved_stock: newReserved,
            available_stock: s.physical_stock - newReserved,
          };
        }
        return s;
      })
    );

    showToast(`Damage Report #${reportId} REJECTED. Reserved stock released back to sales availability.`);
  };

  // Always sort sections newest to oldest so newly registered goods/products appear on top
  const filteredSections = (
    filterCategory === 'all'
      ? sections
      : sections.filter((s) => s.category.toLowerCase() === filterCategory.toLowerCase())
  )
    .slice()
    .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());

  // Always sort batches newest to oldest
  const sortedBatches = [...batches].sort(
    (a, b) =>
      new Date(b.created_at || b.purchase_date).getTime() -
      new Date(a.created_at || a.purchase_date).getTime()
  );

  // Always sort damage reports newest to oldest
  const sortedDamageReports = [...damageReports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Always sort sections for Overview table newest to oldest
  const sortedSections = [...sections].sort(
    (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0B193C] text-white px-4 py-3 rounded-lg shadow-xl text-xs font-medium border border-amber-400/30 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Owner Top Header */}
      <div className="bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Store Owner Command Center
                </h1>
                <span className="bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                  CONFIDENTIAL FINANCIAL VIEW
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Full-scope visibility into bale cost allocations, gross margins, cash variances, and inventory movements.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsSetupModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                <Database className="w-3.5 h-3.5 text-slate-600" />
                <span>Supabase &amp; Migrations</span>
              </button>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex gap-2 overflow-x-auto mt-6 pt-2 border-t border-slate-100 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Store Overview
            </button>
            <button
              onClick={() => setActiveTab('sales_board')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'sales_board'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Overall Sales Board ({DEMO_SALES.length})
            </button>
            <button
              onClick={() => setActiveTab('sections')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'sections'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Sections &amp; Stock Levels ({sections.length})
            </button>
            <button
              onClick={() => setActiveTab('bales')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'bales'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Bales &amp; Cost Allocations
              {totalUnallocatedCostKobo > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('damage')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'damage'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              Damage Approvals
              {pendingDamageCount > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px]">
                  {pendingDamageCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'expenses'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Expenses
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'staff'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Staff &amp; Audit Logs
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`px-3.5 py-2 rounded-lg transition shrink-0 flex items-center gap-1.5 ${
                activeTab === 'database'
                  ? 'bg-[#0B193C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              PostgreSQL Schema (Phase 1)
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Today&apos;s Gross Sales
                  </span>
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">
                    {formatNaira(totalSalesTodayKobo)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span>{completedSales.length} completed transactions</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Physical Garments in Store
                  </span>
                  <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">
                    {totalPhysicalStock} <span className="text-sm font-normal text-slate-500">pcs</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    <span className="font-semibold text-emerald-700">{totalAvailableStock} sellable</span> &bull;{' '}
                    <span className="text-amber-700 font-medium">{totalReservedStock} reserved</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Pending Damage Reviews
                  </span>
                  <div className="p-2 bg-rose-50 text-rose-700 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">
                    {pendingDamageCount}{' '}
                    <span className="text-sm font-normal text-slate-500">reports</span>
                  </div>
                  <div className="text-xs text-rose-600 mt-1 font-medium">
                    {pendingDamageCount > 0 ? 'Requires owner decision' : 'All clear'}
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Unallocated Bale Cost
                  </span>
                  <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">
                    {formatNaira(totalUnallocatedCostKobo)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    From {DEMO_BATCHES.length} registered bales
                  </div>
                </div>
              </div>
            </div>

            {/* Low Stock Banner Alert */}
            {lowStockSections.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      Low Stock Alert: {lowStockSections.map((s) => s.name).join(', ')}
                    </h4>
                    <p className="text-xs text-amber-800">
                      Stock is at or below defined minimum threshold. Allocate new sorted bale items soon.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('sections')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 transition"
                >
                  Inspect Sections
                </button>
              </div>
            )}

            {/* Quick Sections Grid */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Current Stock by Section</h3>
                  <p className="text-xs text-slate-500">
                    Live balance across physical garments, reserved damage, and sellable stock
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('sections')}
                  className="text-xs font-semibold text-[#0B193C] hover:underline flex items-center gap-1"
                >
                  Manage All Sections <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-3 px-4">Section Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Unit Selling Price</th>
                      <th className="py-3 px-4 text-center">Physical Total</th>
                      <th className="py-3 px-4 text-center">Reserved (Damage)</th>
                      <th className="py-3 px-4 text-center">Available For Sale</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedSections.map((sec) => (
                      <tr key={sec.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900">{sec.name}</span>
                            {sec.section_code && (
                              <span className="font-mono text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded shrink-0">
                                {sec.section_code}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {sec.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                          {formatNaira(sec.selling_price_kobo)}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800">
                          {sec.physical_stock}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {sec.reserved_stock > 0 ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-semibold rounded-full text-[10px]">
                              {sec.reserved_stock} reserved
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                              sec.available_stock <= sec.low_stock_threshold
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {sec.available_stock} pcs
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {sec.available_stock <= sec.low_stock_threshold ? (
                            <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Low Stock
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Adequate
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Store Sales Board & Staff Breakdown (Confidential to Owner) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Overall Sales Board by Staff (Confidential)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      OWNER PRIVACY ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Individual staff accounts cannot view each other&apos;s totals or this overall store board. Business turnover is kept strictly confidential to store ownership.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('sales_board')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B193C] text-white text-xs font-semibold rounded-lg hover:bg-[#14285D] transition shrink-0 cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  View All {sales.length} Receipts
                </button>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/50">
                {cashierBreakdown.map((c, idx) => (
                  <div key={c.staffId || idx} className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{c.staffName}</span>
                      <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded uppercase">
                        {c.badge}
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-mono font-bold text-slate-900">
                        {formatNaira(c.totalKobo)}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {c.completedCount} completed ({c.count} total records)
                      </p>
                    </div>
                  </div>
                ))}

                <div className="p-4 bg-[#0B193C] text-white rounded-xl shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">Total Store Turnover</span>
                    <span className="text-[10px] bg-white/20 text-white font-bold px-2 py-0.5 rounded">
                      ALL SALES
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xl font-mono font-bold text-white">
                      {formatNaira(totalSalesTodayKobo)}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {completedSales.length} completed receipts &bull; Net cash: {formatNaira(totalSalesTodayKobo - totalExpensesTodayKobo)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1.5: OVERALL SALES BOARD (Owner Only) */}
        {activeTab === 'sales_board' && (() => {
          const filteredSales = sales
            .filter((s) => {
              const matchesStaff =
                salesStaffFilter === 'all' ||
                s.staff_id === salesStaffFilter ||
                (s.staff_name && s.staff_name.toLowerCase() === salesStaffFilter.toLowerCase());
              const matchesStatus = salesStatusFilter === 'all' || s.status === salesStatusFilter;
              const matchesPayment =
                salesPaymentFilter === 'all' ||
                s.payments?.some((p) => p.payment_method === salesPaymentFilter) ||
                (s.notes && s.notes.toLowerCase().includes(salesPaymentFilter.toLowerCase()));
              const matchesSearch =
                !salesSearchTerm ||
                s.receipt_number.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
                (s.staff_name && s.staff_name.toLowerCase().includes(salesSearchTerm.toLowerCase())) ||
                (s.notes && s.notes.toLowerCase().includes(salesSearchTerm.toLowerCase()));

              return matchesStaff && matchesStatus && matchesPayment && matchesSearch;
            })
            .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime());

          const filteredVolumeKobo = filteredSales.reduce((acc, s) => acc + s.total_kobo, 0);

          return (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">Store-wide Master Sales Board</h3>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300 uppercase">
                        CONFIDENTIAL TO OWNER
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Complete audit of all receipts recorded across all cashier accounts. Staff members are blocked via database RLS from seeing other staffs&apos; transactions.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
                      Total: {filteredSales.length} Receipts &bull; {formatNaira(filteredVolumeKobo)}
                    </span>
                  </div>
                </div>

                {/* Filters Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                  {/* Search Bar */}
                  <div className="relative">
                    <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search receipt # / cashier / notes..."
                      value={salesSearchTerm}
                      onChange={(e) => setSalesSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C] bg-white"
                    />
                  </div>

                  {/* Cashier Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Cashier:</span>
                    <select
                      value={salesStaffFilter}
                      onChange={(e) => setSalesStaffFilter(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium outline-none"
                    >
                      <option value="all">All Cashiers ({sales.length})</option>
                      {cashierBreakdown.map((c) => (
                        <option key={c.staffId} value={c.staffId}>
                          {c.staffName} ({c.count})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Status:</span>
                    <select
                      value={salesStatusFilter}
                      onChange={(e) => setSalesStatusFilter(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium outline-none"
                    >
                      <option value="all">All Statuses</option>
                      <option value="completed">Completed</option>
                      <option value="refunded">Refunded</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  {/* Payment Method Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500 shrink-0">Payment:</span>
                    <select
                      value={salesPaymentFilter}
                      onChange={(e) => setSalesPaymentFilter(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium outline-none"
                    >
                      <option value="all">All Methods</option>
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="pos_card">POS / Card</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Master Sales Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <th className="py-3 px-4">Receipt #</th>
                        <th className="py-3 px-4">Date &amp; Time</th>
                        <th className="py-3 px-4">Cashier Name</th>
                        <th className="py-3 px-4 text-center">Items</th>
                        <th className="py-3 px-4 text-right">Subtotal</th>
                        <th className="py-3 px-4 text-right">Discount</th>
                        <th className="py-3 px-4 text-right">Total Paid (₦)</th>
                        <th className="py-3 px-4">Payment Method / Notes</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSales.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500 italic">
                            No receipts found matching your current filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredSales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-4 font-mono font-bold text-[#0B193C]">
                              {sale.receipt_number}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{formatDateTime(sale.sale_date)}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  sale.status === 'completed' ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              {sale.staff_name}
                            </td>
                            <td className="py-3 px-4 text-center font-medium text-slate-700">
                              {sale.items_count || 1} pcs
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              {formatNaira(sale.subtotal_kobo)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-500">
                              {sale.discount_kobo > 0 ? formatNaira(sale.discount_kobo) : '—'}
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
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setSelectedSaleForReceipt(sale)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#0B193C] hover:text-white text-slate-700 font-semibold rounded text-[11px] transition cursor-pointer"
                                  title="View and print official customer receipt"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Receipt</span>
                                </button>
                                {sale.status === 'completed' && (
                                  <button
                                    onClick={() => setSaleToCancelOrRefund(sale)}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold rounded text-[11px] transition cursor-pointer"
                                    title="Authorise refund and restore garments to stock"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Refund</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600 gap-2">
                  <span>
                    Total Filtered Volume:{' '}
                    <strong className="text-slate-900 font-mono">{formatNaira(filteredVolumeKobo)}</strong> across{' '}
                    <strong>{filteredSales.length}</strong> receipts
                  </span>
                  <span className="text-emerald-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Real-time Atomic Ledger Synchronization Active</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 2: SECTIONS & STOCK LEVELS */}
        {activeTab === 'sections' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Clothing Sections Master</h3>
                <p className="text-xs text-slate-500">
                  Configure store categories, unit retail price per piece, and low-stock alert thresholds.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Category Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">Category:</span>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium outline-none focus:ring-1 focus:ring-[#0B193C]"
                  >
                    <option value="all">All Categories</option>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                    <option value="Children">Children</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Variety">Variety</option>
                  </select>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-600 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Newest Goods on Top</span>
                </div>

                {/* Add Section Button */}
                <button
                  onClick={() => {
                    setSectionToEdit(null);
                    setIsSectionModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B193C] text-white text-xs font-semibold rounded-lg hover:bg-[#14285D] transition shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Section</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-3 px-4">Section Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Selling Price</th>
                      <th className="py-3 px-4 text-center">Low Stock Alert</th>
                      <th className="py-3 px-4 text-center">Physical Count</th>
                      <th className="py-3 px-4 text-center">Damage Reservation</th>
                      <th className="py-3 px-4 text-center font-bold text-slate-900">Sellable Available</th>
                      <th className="py-3 px-4 text-center">Status</th>
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
                        <td className="py-3.5 px-4 text-center font-medium text-slate-600">
                          &le; {sec.low_stock_threshold} pcs
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                          {sec.physical_stock}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {sec.reserved_stock > 0 ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-semibold rounded-full text-[10px]">
                              {sec.reserved_stock} reserved
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                              sec.available_stock <= sec.low_stock_threshold
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {sec.available_stock} pcs
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {sec.is_active ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-semibold">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-semibold">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => {
                              setSectionToEdit(sec);
                              setIsSectionModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-semibold transition"
                          >
                            <Edit2 className="w-3 h-3 text-slate-600" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>
                  Total {sections.length} clothing sections ({sections.filter((s) => s.is_active).length} active on store floor).
                </span>
                <span className="text-[11px] text-slate-500 italic">
                  Historical sales receipts always retain their immutable sale-time snapshot prices.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BALES & COST ALLOCATIONS (Owner Only) */}
        {activeTab === 'bales' && (
          <div className="space-y-6">
            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  Owner-Only Confidential Bale Accounting &amp; Stock Intake
                </h4>
                <p className="text-xs text-amber-900 mt-0.5">
                  Record bale purchases with logistics, sort garments into sections, and execute atomic inventory intake transactions into the physical movement ledger.
                </p>
              </div>
            </div>

            {/* Action Bar & Sub-Tab Switcher */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => setBaleSubTab('inventory')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    baleSubTab === 'inventory'
                      ? 'bg-white text-[#0B193C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bale Batches &amp; Cost Allocations ({batches.length})
                </button>
                <button
                  onClick={() => setBaleSubTab('ledger')}
                  className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                    baleSubTab === 'ledger'
                      ? 'bg-white text-[#0B193C] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Stock Receipt Movement Ledger</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedBaleForAllocation(undefined);
                    setIsAllocationWizardOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B193C] text-white text-xs font-semibold rounded-lg hover:bg-[#14285D] transition shadow-xs"
                >
                  <Calculator className="w-3.5 h-3.5 text-amber-400" />
                  <span>Allocate Bale to Sections</span>
                </button>
                <button
                  onClick={() => setIsRegisterBaleOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register New Bale</span>
                </button>
              </div>
            </div>

            {baleSubTab === 'inventory' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedBatches.map((batch) => {
                  const percentAllocated =
                    batch.total_cost_kobo > 0
                      ? Math.min(
                          100,
                          Math.round((batch.allocated_cost_kobo / batch.total_cost_kobo) * 100)
                        )
                      : 0;

                  return (
                    <div key={batch.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                              {batch.batch_code}
                            </span>
                            <h4 className="text-sm font-semibold text-slate-800 mt-2">{batch.supplier}</h4>
                          </div>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded uppercase">
                            {batch.status}
                          </span>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Purchase Date:</span>
                            <span className="font-medium text-slate-800">{formatDate(batch.purchase_date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Base Purchase Cost:</span>
                            <span className="font-mono font-medium text-slate-800">
                              {formatNaira(batch.purchase_cost_kobo)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Additional Logistics / Offloading:</span>
                            <span className="font-mono font-medium text-slate-800">
                              {formatNaira(batch.additional_costs_kobo)}
                            </span>
                          </div>
                          <div className="flex justify-between font-bold pt-1 border-t border-slate-100">
                            <span className="text-slate-900">Total Attributable Cost:</span>
                            <span className="font-mono text-slate-900">
                              {formatNaira(batch.total_cost_kobo)}
                            </span>
                          </div>

                          <div className="pt-2">
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-slate-500">Cost Distributed to Sections ({percentAllocated}%):</span>
                              <span className="font-mono font-semibold text-emerald-700">
                                {formatNaira(batch.allocated_cost_kobo)}
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  percentAllocated === 100 ? 'bg-emerald-600' : 'bg-amber-500'
                                }`}
                                style={{ width: `${percentAllocated}%` }}
                              />
                            </div>
                          </div>

                          {batch.unallocated_cost_kobo > 0 ? (
                            <div className="p-2.5 bg-amber-50 rounded-lg text-amber-900 text-[11px] flex justify-between items-center font-medium border border-amber-200">
                              <span>Unallocated Cost to be Assigned:</span>
                              <span className="font-mono font-bold text-amber-700">
                                {formatNaira(batch.unallocated_cost_kobo)}
                              </span>
                            </div>
                          ) : (
                            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-900 text-[11px] flex justify-between items-center font-medium border border-emerald-200">
                              <span>Allocation Status:</span>
                              <span className="font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                100% Fully Distributed
                              </span>
                            </div>
                          )}

                          {batch.notes && (
                            <p className="text-[11px] text-slate-500 italic mt-1 pt-1 border-t border-slate-50">
                              &ldquo;{batch.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100">
                        {batch.unallocated_cost_kobo > 0 ? (
                          <button
                            onClick={() => {
                              setSelectedBaleForAllocation(batch.id);
                              setIsAllocationWizardOpen(true);
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#0B193C] text-white text-xs font-semibold rounded-lg hover:bg-[#14285D] transition shadow-xs cursor-pointer"
                          >
                            <Calculator className="w-4 h-4 text-amber-400" />
                            <span>Allocate Garments from this Bale ({formatNaira(batch.unallocated_cost_kobo)} remaining)</span>
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                              <span className="text-emerald-800 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                100% Cost Distributed
                              </span>
                              <button
                                onClick={() => setBaleSubTab('ledger')}
                                className="text-[11px] font-semibold text-[#0B193C] hover:underline flex items-center gap-1"
                              >
                                <History className="w-3 h-3" />
                                View in Ledger
                              </button>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedBaleForAllocation(batch.id);
                                setIsAllocationWizardOpen(true);
                              }}
                              className="w-full text-center text-[11px] text-slate-500 hover:text-slate-800 font-medium py-1 hover:bg-slate-50 rounded transition"
                            >
                              + Intake extra zero-cost pieces from this bale
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <StockReceiptHistory sections={sections} onRefreshNeeded={reloadInventory} />
            )}
          </div>
        )}

        {/* TAB 4: DAMAGE APPROVALS */}
        {activeTab === 'damage' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-base font-bold text-slate-900">Damage Submissions Review</h3>
              <p className="text-xs text-slate-500 mt-1">
                When staff submit damage reports, inventory is automatically <strong>reserved</strong> from sales availability. Approving deducts physical stock permanently. Rejecting releases the stock back for sale.
              </p>
            </div>

            <div className="space-y-3">
              {sortedDamageReports.map((report) => (
                <div
                  key={report.id}
                  className={`p-5 rounded-xl border bg-white shadow-xs transition ${
                    report.status === 'pending'
                      ? 'border-amber-300'
                      : report.status === 'approved'
                      ? 'border-slate-200 opacity-90'
                      : 'border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                          report.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : report.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {report.quantity}x
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{report.section_name}</h4>
                          <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {report.damage_type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{report.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {report.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleRejectDamage(report.id)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200 transition"
                          >
                            Reject &amp; Release
                          </button>
                          <button
                            onClick={() => handleApproveDamage(report.id)}
                            className="px-3 py-1.5 bg-[#0B193C] hover:bg-[#14285D] text-white text-xs font-semibold rounded-lg transition"
                          >
                            Approve &amp; Deduct
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase ${
                            report.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {report.status}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
                    <div>
                      Reported by <strong>{report.staff_name}</strong> on {formatDateTime(report.created_at)}
                    </div>
                    {report.reviewed_at && (
                      <div className="text-slate-600">
                        Decision by <strong>{report.reviewer_name}</strong> &bull; {formatDateTime(report.reviewed_at)}
                        {report.rejection_reason && (
                          <span className="ml-1 text-rose-700 italic">(&quot;{report.rejection_reason}&quot;)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: EXPENSES */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Operating Expenses (Confidential)</h3>
                <p className="text-xs text-slate-500">
                  Track day-to-day store expenses (diesel for generator, packaging bags, shop maintenance).
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Recorded Total:</span>
                <div className="text-lg font-bold font-mono text-slate-900">
                  {formatNaira(totalExpensesTodayKobo)}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Expense Date</th>
                    <th className="py-3 px-4 text-right">Amount (₦)</th>
                    <th className="py-3 px-4">Recorded By</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...DEMO_EXPENSES]
                    .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
                    .map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{exp.description}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase text-[10px] font-bold">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{formatDate(exp.expense_date)}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        {formatNaira(exp.amount_kobo)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{exp.recorder_name}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase">
                          {exp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: STAFF & AUDIT LOGS */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-base font-bold text-slate-900">Staff Accounts &amp; Access Control</h3>
              <p className="text-xs text-slate-500 mt-1">
                Only the Store Owner can invite staff or adjust permissions. Users cannot elevate their own roles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{DEMO_OWNER.full_name}</h4>
                    <span className="text-xs text-slate-500 font-mono">{DEMO_OWNER.email}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold text-[10px] rounded uppercase">
                    SUPER ADMIN
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  Full administrative permissions, overall store sales board, bale cost accounting, financial reports, and approval rights.
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{DEMO_STAFF.full_name}</h4>
                    <span className="text-xs text-slate-500 font-mono">{DEMO_STAFF.email}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold text-[10px] rounded uppercase">
                    STAFF (SHIFT 1)
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  Personal POS sales recording, section stock lookup, damage filing. Strictly restricted to own sales alone.
                </div>
                <div className="mt-2 text-[11px] font-semibold text-slate-700 font-mono">
                  Today&apos;s Sales: {formatNaira(DEMO_SALES.filter(s => s.staff_id === DEMO_STAFF.id).reduce((a, b) => a + b.total_kobo, 0))}
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{DEMO_STAFF_2.full_name}</h4>
                    <span className="text-xs text-slate-500 font-mono">{DEMO_STAFF_2.email}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold text-[10px] rounded uppercase">
                    STAFF (SHIFT 2)
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  Personal POS sales recording, section stock lookup, damage filing. Strictly restricted to own sales alone.
                </div>
                <div className="mt-2 text-[11px] font-semibold text-slate-700 font-mono">
                  Today&apos;s Sales: {formatNaira(DEMO_SALES.filter(s => s.staff_id === DEMO_STAFF_2.id).reduce((a, b) => a + b.total_kobo, 0))}
                </div>
              </div>
            </div>

            {/* Audit Log Preview */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Traceable Inventory Movements Ledger (Audit Sample)
                </h4>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Section</th>
                    <th className="py-2.5 px-4">Movement Type</th>
                    <th className="py-2.5 px-4 text-center">Quantity Change</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {[...DEMO_MOVEMENTS]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-600">{formatDateTime(m.created_at)}</td>
                      <td className="py-2.5 px-4 font-sans font-semibold text-slate-900">{m.section_name}</td>
                      <td className="py-2.5 px-4 font-sans uppercase text-[10px] font-bold text-slate-700">
                        {m.movement_type}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-center font-bold ${
                          m.quantity_change > 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-700">{m.creator_name}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-500">{m.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: POSTGRESQL SCHEMA (Phase 1) */}
        {activeTab === 'database' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Database Schema &amp; Security Validation</h3>
                <p className="text-xs text-slate-500">
                  Phase 1 establishes the normalised 14-table PostgreSQL schema with strict Row Level Security (RLS).
                </p>
              </div>
              <button
                onClick={() => setIsSetupModalOpen(true)}
                className="px-4 py-2 bg-[#0B193C] text-white text-xs font-semibold rounded-lg hover:bg-[#14285D] transition"
              >
                Open Connection Manager
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                { name: 'profiles', desc: 'Auth user link, role, active status' },
                { name: 'stock_sections', desc: 'Clothing sections, retail prices, stock thresholds' },
                { name: 'stock_batches', desc: 'Purchased bales, supplier, costs (Owner Only)' },
                { name: 'batch_section_allocations', desc: 'Sorted bale garments allocated to sections' },
                { name: 'sales', desc: 'Atomic receipt header, staff link, subtotal, discount, total' },
                { name: 'sale_items', desc: 'Exact price & cost snapshot per line item' },
                { name: 'sale_payments', desc: 'Cash, POS card, Bank transfer split payment records' },
                { name: 'damage_reports', desc: 'Staff reports, damage type, reservation, approval/rejection' },
                { name: 'inventory_movements', desc: 'Append-only ledger of every stock fluctuation' },
                { name: 'stock_counts', desc: 'Periodic physical count audit and variance reconciliation' },
                { name: 'cash_sessions', desc: 'Daily till session, opening float, expected vs counted cash' },
                { name: 'reconciliation_entries', desc: 'Per-payment-method breakdown and discrepancy calculation' },
                { name: 'expenses', desc: 'Operating costs ledger (Owner Only)' },
                { name: 'audit_logs', desc: 'Immutable before/after state trace for sensitive operations' },
              ].map((t) => (
                <div key={t.name} className="p-3 bg-white border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-[#0B193C]" />
                    <span className="font-mono font-bold text-slate-900">{t.name}</span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-1">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* PHASE 2 MODALS */}
      <BaleRegistrationModal
        isOpen={isRegisterBaleOpen}
        onClose={() => setIsRegisterBaleOpen(false)}
        onSuccess={(newBatch) => {
          showToast(`Bale "${newBatch.batch_code}" registered successfully.`);
          reloadInventory();
        }}
        currentUserId={profile?.id || user?.id || 'demo-owner-001'}
      />

      <BaleAllocationWizard
        isOpen={isAllocationWizardOpen}
        onClose={() => {
          setIsAllocationWizardOpen(false);
          setSelectedBaleForAllocation(undefined);
        }}
        batches={batches}
        sections={sections}
        preselectedBatchId={selectedBaleForAllocation}
        onSuccess={() => {
          showToast('Bale stock sorted and allocated to sections atomically!');
          reloadInventory();
        }}
        currentUserId={profile?.id || user?.id || 'demo-owner-001'}
        currentUserName={profile?.full_name || 'Store Owner'}
      />

      <SectionFormModal
        isOpen={isSectionModalOpen}
        onClose={() => {
          setIsSectionModalOpen(false);
          setSectionToEdit(null);
        }}
        sectionToEdit={sectionToEdit}
        existingSections={sections}
        onSuccess={(saved) => {
          showToast(`Section "${saved.name}" [${saved.section_code || ''}] saved successfully.`);
          reloadInventory();
        }}
      />

      {/* PHASE 3 MODALS: Receipt Viewer & Cancellation / Refund Workflows */}
      {selectedSaleForReceipt && (
        <ReceiptModal
          isOpen={Boolean(selectedSaleForReceipt)}
          sale={selectedSaleForReceipt}
          onClose={() => setSelectedSaleForReceipt(null)}
          onCancelOrRefundClick={(sale) => setSaleToCancelOrRefund(sale)}
          isOwner={true}
        />
      )}

      {saleToCancelOrRefund && (
        <SaleCancellationModal
          isOpen={Boolean(saleToCancelOrRefund)}
          sale={saleToCancelOrRefund}
          onClose={() => setSaleToCancelOrRefund(null)}
          onSuccess={(updatedSale) => {
            showToast(
              `Sale ${updatedSale.receipt_number} ${updatedSale.status}. ${updatedSale.items_count || ''} garments returned to store stock.`
            );
            reloadInventory();
            setSelectedSaleForReceipt(updatedSale);
          }}
        />
      )}
    </div>
  );
};
