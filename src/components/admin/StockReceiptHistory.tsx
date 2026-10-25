import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  Filter,
  RefreshCw,
  PackageCheck,
  Calendar,
  User,
} from 'lucide-react';
import { formatDateTime } from '../../lib/formatters';
import { InventoryMovement, StockSection } from '../../types/database';
import { getInventoryMovements } from '../../lib/inventoryService';

interface StockReceiptHistoryProps {
  sections: StockSection[];
  onRefreshNeeded?: () => void;
}

export const StockReceiptHistory: React.FC<StockReceiptHistoryProps> = ({ sections }) => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadMovements = async () => {
    setIsLoading(true);
    const result = await getInventoryMovements(selectedSectionId);
    if (result.success && result.data) {
      setMovements(result.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadMovements();
  }, [selectedSectionId]);

  // Filter only bale receipts or all movements, and sort Newest to Oldest always
  const filtered = movements
    .filter((m) => {
      const matchesSearch =
        m.section_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.notes && m.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        m.movement_type.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
      {/* Header and Filter Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-[#0B193C]" />
            <span>Stock Receipt &amp; Movement Audit Ledger</span>
          </h3>
          <p className="text-xs text-slate-500">
            Immutable record of sorted bale intakes, stock additions, and ledger events
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Section Filter */}
          <select
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none bg-white text-slate-700 font-medium"
          >
            <option value="all">All Sections ({sections.length})</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Newest Receipts on Top</span>
          </div>

          <button
            onClick={loadMovements}
            disabled={isLoading}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#0B193C]" />
            <span>Loading inventory ledger movements...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No inventory movement records found for the selected criteria.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Section Name</th>
                <th className="py-3 px-4">Movement Type</th>
                <th className="py-3 px-4 text-center">Quantity Change</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4">Reference &amp; Audit Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filtered.map((mov) => (
                <tr key={mov.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {formatDateTime(mov.created_at)}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{mov.section_name}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        mov.movement_type === 'bale_allocation'
                          ? 'bg-emerald-100 text-emerald-800'
                          : mov.movement_type === 'sale'
                          ? 'bg-blue-100 text-blue-800'
                          : mov.movement_type === 'damage_deduction'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {mov.movement_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono">
                    <span
                      className={`font-bold text-xs ${
                        mov.quantity_change > 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {mov.quantity_change > 0 ? `+${mov.quantity_change}` : mov.quantity_change} pcs
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium">
                    {mov.creator_name || 'Store Management'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{mov.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
