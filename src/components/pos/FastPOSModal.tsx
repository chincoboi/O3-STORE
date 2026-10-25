import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Split,
  Layers,
  ArrowRight,
  ShieldCheck,
  Receipt,
} from 'lucide-react';
import { StockSection, CartItem, SplitPaymentEntry, PaymentMethod, Sale } from '../../types/database';
import { formatNaira } from '../../lib/formatters';
import { processSaleAtomic } from '../../lib/salesService';
import { useAuth } from '../../contexts/AuthContext';

interface FastPOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: StockSection[];
  onSaleSuccess: (sale: Sale) => void;
  initialSelectedSection?: StockSection | null;
}

export const FastPOSModal: React.FC<FastPOSModalProps> = ({
  isOpen,
  onClose,
  sections,
  onSaleSuccess,
  initialSelectedSection,
}) => {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountNaira, setDiscountNaira] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Split payments state
  const [payments, setPayments] = useState<SplitPaymentEntry[]>([
    { method: 'cash', amount_kobo: 0, reference: '' },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [includeSoldOut, setIncludeSoldOut] = useState<boolean>(false);

  // Client-generated idempotency key
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  // Handle initial selected section passed in
  useEffect(() => {
    if (initialSelectedSection && initialSelectedSection.available_stock > 0) {
      setCart((prev) => {
        const exists = prev.find((item) => item.section.id === initialSelectedSection.id);
        if (exists) return prev;
        return [
          ...prev,
          {
            section: initialSelectedSection,
            quantity: 1,
            unit_price_kobo: initialSelectedSection.selling_price_kobo,
            line_total_kobo: initialSelectedSection.selling_price_kobo,
          },
        ];
      });
    }
  }, [initialSelectedSection]);

  // Cart calculations
  const subtotalKobo = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.line_total_kobo, 0);
  }, [cart]);

  const discountKobo = discountNaira * 100;
  const totalPayableKobo = Math.max(0, subtotalKobo - discountKobo);

  const totalTenderedKobo = useMemo(() => {
    return payments.reduce((acc, p) => acc + (p.amount_kobo || 0), 0);
  }, [payments]);

  const remainingBalanceKobo = Math.max(0, totalPayableKobo - totalTenderedKobo);

  // Change to return (if cash was paid more than balance)
  const cashPaidKobo = payments
    .filter((p) => p.method === 'cash')
    .reduce((acc, p) => acc + (p.amount_kobo || 0), 0);
  const otherPaidKobo = totalTenderedKobo - cashPaidKobo;
  const changeToReturnKobo =
    totalTenderedKobo > totalPayableKobo && cashPaidKobo > 0
      ? Math.min(cashPaidKobo, totalTenderedKobo - totalPayableKobo)
      : 0;

  // Dynamically extract all unique categories across all clothing sections
  const dynamicCategories = useMemo(() => {
    const set = new Set<string>();
    sections.forEach((sec) => {
      if (sec.category && sec.category.trim()) {
        set.add(sec.category.trim());
      }
    });
    const standard = ['Men', 'Women', 'Children'];
    const otherCats = Array.from(set).filter((c) => !standard.includes(c)).sort();
    const ordered = standard.filter((c) => set.has(c)).concat(otherCats);
    return ['all', ...ordered];
  }, [sections]);

  // Filter sections: Hide sold-out items from POS by default, strictly sorted newest to oldest
  const filteredSections = useMemo(() => {
    return sections
      .filter((sec) => {
        if (sec.is_active === false) return false;
        // Sold out items shouldn't show on the POS terminal
        if (!includeSoldOut && sec.available_stock <= 0) return false;

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
  }, [sections, searchTerm, selectedCategory, includeSoldOut]);

  // Add section to cart
  const addToCart = (section: StockSection) => {
    const codeTag = section.section_code ? ` [${section.section_code}]` : '';
    if (section.available_stock <= 0) {
      setErrorMessage(`Cannot add "${section.name}"${codeTag}: 0 pcs available for sale.`);
      return;
    }

    setErrorMessage(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.section.id === section.id);
      if (existing) {
        if (existing.quantity >= section.available_stock) {
          setErrorMessage(
            `Maximum available stock reached for "${section.name}"${codeTag} (${section.available_stock} pcs max).`
          );
          return prev;
        }
        return prev.map((item) =>
          item.section.id === section.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                line_total_kobo: (item.quantity + 1) * item.unit_price_kobo,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          section,
          quantity: 1,
          unit_price_kobo: section.selling_price_kobo,
          line_total_kobo: section.selling_price_kobo,
        },
      ];
    });
  };

  // Adjust quantity
  const updateQuantity = (sectionId: string, delta: number) => {
    setErrorMessage(null);
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.section.id === sectionId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.section.available_stock) {
              setErrorMessage(
                `Cannot increase "${item.section.name}": only ${item.section.available_stock} pcs available.`
              );
              return item;
            }
            return {
              ...item,
              quantity: newQty,
              line_total_kobo: newQty * item.unit_price_kobo,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (sectionId: string) => {
    setCart((prev) => prev.filter((item) => item.section.id !== sectionId));
  };

  // Split payment helper methods
  const addPaymentMethod = () => {
    const defaultMethod: PaymentMethod =
      payments.some((p) => p.method === 'bank_transfer') ? 'pos_card' : 'bank_transfer';
    setPayments((prev) => [
      ...prev,
      {
        method: defaultMethod,
        amount_kobo: remainingBalanceKobo > 0 ? remainingBalanceKobo : 0,
        reference: '',
      },
    ]);
  };

  const removePaymentMethod = (index: number) => {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePaymentMethod = (index: number, method: PaymentMethod) => {
    setPayments((prev) =>
      prev.map((p, i) => (i === index ? { ...p, method } : p))
    );
  };

  const updatePaymentAmount = (index: number, nairaVal: number) => {
    const kobo = Math.round(nairaVal * 100);
    setPayments((prev) =>
      prev.map((p, i) => (i === index ? { ...p, amount_kobo: Math.max(0, kobo) } : p))
    );
  };

  const updatePaymentRef = (index: number, ref: string) => {
    setPayments((prev) =>
      prev.map((p, i) => (i === index ? { ...p, reference: ref } : p))
    );
  };

  // Quick Action: Exact payment for single method
  const setExactPayment = (method: PaymentMethod) => {
    setPayments([{ method, amount_kobo: totalPayableKobo, reference: '' }]);
  };

  // Submit Sale Atomically
  const handleCheckout = async () => {
    setErrorMessage(null);

    if (cart.length === 0) {
      setErrorMessage('Your sale cart is empty. Add at least one garment.');
      return;
    }

    if (totalTenderedKobo < totalPayableKobo) {
      setErrorMessage(
        `Payment tendered (${formatNaira(totalTenderedKobo)}) is less than total payable (${formatNaira(
          totalPayableKobo
        )}). Remaining: ${formatNaira(remainingBalanceKobo)}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare payload
      const payload = {
        staff_id: profile?.id || 'demo-staff-002',
        staff_name: profile?.full_name || 'Floor Cashier',
        items: cart.map((item) => ({
          section_id: item.section.id,
          quantity: item.quantity,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount_kobo: p.amount_kobo,
          reference: p.reference?.trim() || undefined,
        })),
        discount_kobo: discountKobo,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKey,
      };

      const res = await processSaleAtomic(payload, profile || undefined);

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'Failed to complete sale transaction.');
        setIsSubmitting(false);
        return;
      }

      // Success!
      onSaleSuccess(res.data);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred during checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Terminal Header */}
        <div className="bg-[#0B193C] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-amber-400 text-[#0B193C] rounded-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">O3 Varieties &bull; Point of Sale Terminal</h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  LIVE CONCURRENCY SAFE
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Staff: <span className="font-semibold text-white">{profile?.full_name}</span> &bull; Stock validated inside atomic transaction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-lg text-xs font-mono text-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              <span>Idempotency: {idempotencyKey.slice(0, 15)}...</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-900 text-[11px] underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Terminal Body: Two-Column Split (Catalog & Cart) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* LEFT 7 COLS: Catalog / Section Selector */}
          <div className="lg:col-span-7 flex flex-col border-r border-slate-200 bg-white min-h-0">
            {/* Filter Controls */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search garment sections..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[#0B193C]"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <div className="flex items-center gap-1">
                  {dynamicCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                        selectedCategory === cat
                          ? 'bg-[#0B193C] text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {cat === 'all' ? 'All Sections' : cat}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer select-none shrink-0 pl-1">
                  <input
                    type="checkbox"
                    checked={includeSoldOut}
                    onChange={(e) => setIncludeSoldOut(e.target.checked)}
                    className="rounded text-[#0B193C] focus:ring-0 cursor-pointer"
                  />
                  <span>Show Sold Out</span>
                </label>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
              {filteredSections.length === 0 ? (
                <div className="py-12 text-center text-slate-500 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 p-6">
                  <p className="text-sm font-semibold text-slate-700">No available garments found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {!includeSoldOut
                      ? 'Sold-out items (0 pcs) are currently hidden. Check "Show Sold Out" above to view them or check another category.'
                      : 'No sections match your search or category filter.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredSections.map((sec) => {
                  const cartItem = cart.find((i) => i.section.id === sec.id);
                  const inCartQty = cartItem ? cartItem.quantity : 0;
                  const isOutOfStock = sec.available_stock <= 0;

                  return (
                    <div
                      key={sec.id}
                      className={`p-3 rounded-xl border transition flex flex-col justify-between ${
                        isOutOfStock
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : inCartQty > 0
                          ? 'bg-sky-50/50 border-sky-300 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 leading-snug">{sec.name}</h4>
                              {sec.section_code && (
                                <span className="text-[10px] font-mono font-extrabold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded shrink-0">
                                  {sec.section_code}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium shrink-0">
                            {sec.category}
                          </span>
                        </div>

                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="text-sm font-mono font-black text-slate-900">
                            {formatNaira(sec.selling_price_kobo)}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-800'
                                : sec.available_stock <= sec.low_stock_threshold
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {sec.available_stock} pcs left
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        {inCartQty > 0 ? (
                          <div className="flex items-center gap-1.5 bg-white border border-sky-300 rounded-lg p-0.5 shadow-xs">
                            <button
                              onClick={() => updateQuantity(sec.id, -1)}
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold text-xs text-sky-900">{inCartQty}</span>
                            <button
                              onClick={() => updateQuantity(sec.id, 1)}
                              disabled={inCartQty >= sec.available_stock}
                              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-30"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-600">Click to add</span>
                        )}

                        <button
                          onClick={() => addToCart(sec)}
                          disabled={isOutOfStock || inCartQty >= sec.available_stock}
                          className="px-3 py-1.5 bg-[#0B193C] text-white rounded-lg text-xs font-semibold hover:bg-[#14285D] transition disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {isOutOfStock ? 'Sold Out' : inCartQty > 0 ? '+ Add More' : '+ Add to Sale'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          {/* RIGHT 5 COLS: Cart & Payment Settlement */}
          <div className="lg:col-span-5 flex flex-col bg-slate-50 min-h-0">
            {/* Cart Header */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0B193C]" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Current Sale Cart ({cart.reduce((a, b) => a + b.quantity, 0)} pcs)
                </h3>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {/* Cart Item List */}
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-2">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Cart is currently empty</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Select clothing sections from the left directory to build this transaction.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.section.id}
                    className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="text-xs font-bold text-slate-900 truncate">{item.section.name}</h5>
                        {item.section.section_code && (
                          <span className="text-[9px] font-mono font-bold bg-blue-50 text-blue-800 px-1.5 py-0.2 rounded border border-blue-100 shrink-0">
                            {item.section.section_code}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        {formatNaira(item.unit_price_kobo)} &times; {item.quantity}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.section.id, -1)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-slate-900">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.section.id, 1)}
                          disabled={item.quantity >= item.section.available_stock}
                          className="p-1 hover:bg-slate-200 rounded text-slate-700 disabled:opacity-30"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="w-20 text-right font-mono font-bold text-xs text-slate-900">
                        {formatNaira(item.line_total_kobo)}
                      </div>

                      <button
                        onClick={() => removeFromCart(item.section.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Settlement Panel (Bottom Fixed) */}
            <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shadow-md space-y-3 shrink-0">
              {/* Discount Input */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700">Permitted Discount (₦):</span>
                <div className="flex items-center gap-1.5">
                  {[0, 500, 1000, 2000].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setDiscountNaira(quick)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                        discountNaira === quick
                          ? 'bg-[#0B193C] text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {quick === 0 ? 'None' : `₦${quick}`}
                    </button>
                  ))}
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1 text-slate-400 font-mono text-xs">₦</span>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={discountNaira || ''}
                      onChange={(e) => setDiscountNaira(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-full pl-5 pr-1.5 py-1 text-xs border border-slate-300 rounded-lg outline-none font-mono text-right"
                    />
                  </div>
                </div>
              </div>

              {/* Subtotal & Net Payable Banner */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">{formatNaira(subtotalKobo)}</span>
                </div>
                {discountKobo > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discount Applied:</span>
                    <span className="font-mono">-{formatNaira(discountKobo)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-200">
                  <span>NET TOTAL DUE:</span>
                  <span className="font-mono text-[#0B193C]">{formatNaira(totalPayableKobo)}</span>
                </div>
              </div>

              {/* Split Payment Methods */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Split className="w-3.5 h-3.5 text-[#0B193C]" />
                    <span>Payment Methods (Split Supported)</span>
                  </label>
                  <button
                    type="button"
                    onClick={addPaymentMethod}
                    className="text-[11px] text-sky-700 hover:text-sky-900 font-bold flex items-center gap-1"
                  >
                    + Add Method
                  </button>
                </div>

                {/* Quick 1-Click Full Payment Presets */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExactPayment('cash')}
                    className="py-1 px-2 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition"
                  >
                    Exact Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setExactPayment('bank_transfer')}
                    className="py-1 px-2 text-[10px] font-bold rounded-lg bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 transition"
                  >
                    Full Transfer
                  </button>
                  <button
                    type="button"
                    onClick={() => setExactPayment('pos_card')}
                    className="py-1 px-2 text-[10px] font-bold rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 transition"
                  >
                    Full POS / Card
                  </button>
                </div>

                {/* Dynamic Payment Legs */}
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs">
                      <select
                        value={p.method}
                        onChange={(e) => updatePaymentMethod(idx, e.target.value as PaymentMethod)}
                        className="border border-slate-300 rounded-lg py-1 px-1.5 text-xs bg-white text-slate-800 font-medium outline-none shrink-0"
                      >
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="pos_card">POS / Card</option>
                        <option value="other">Other</option>
                      </select>

                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1 text-slate-400 font-mono text-xs">₦</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={p.amount_kobo ? p.amount_kobo / 100 : ''}
                          onChange={(e) => updatePaymentAmount(idx, Number(e.target.value))}
                          placeholder="Amount"
                          className="w-full pl-5 pr-2 py-1 text-xs border border-slate-300 rounded-lg font-mono outline-none text-right"
                        />
                      </div>

                      <input
                        type="text"
                        placeholder="Ref/Bank (opt)"
                        value={p.reference || ''}
                        onChange={(e) => updatePaymentRef(idx, e.target.value)}
                        className="w-24 px-2 py-1 text-[11px] border border-slate-300 rounded-lg outline-none"
                      />

                      {payments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePaymentMethod(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Balance & Change Status */}
                <div className="pt-1 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Tendered:</span>
                    <span className="font-mono font-bold text-slate-900">{formatNaira(totalTenderedKobo)}</span>
                  </div>

                  {remainingBalanceKobo > 0 ? (
                    <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      Balance Due: {formatNaira(remainingBalanceKobo)}
                    </span>
                  ) : changeToReturnKobo > 0 ? (
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Change: {formatNaira(changeToReturnKobo)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                      Exact Settlement
                    </span>
                  )}
                </div>
              </div>

              {/* Checkout Trigger */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isSubmitting || cart.length === 0 || remainingBalanceKobo > 0}
                className="w-full py-2.5 bg-[#0B193C] hover:bg-[#14285D] disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>
                  {isSubmitting
                    ? 'Processing Atomic Sale...'
                    : remainingBalanceKobo > 0
                    ? `Pay Remaining ${formatNaira(remainingBalanceKobo)}`
                    : `Complete Sale (${formatNaira(totalPayableKobo)}) & Print Receipt`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
