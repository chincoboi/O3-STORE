import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Package,
  Trash2,
  Flame,
  Droplets,
  Scissors,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import { StockSection, DamageType, DamageReport } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import { submitDamageReport } from '../../lib/damageService';

interface DamageReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: StockSection[];
  initialSection?: StockSection | null;
  onSuccess: (report: DamageReport) => void;
}

const DAMAGE_TYPES: { type: DamageType; label: string; icon: React.ElementType; color: string; desc: string }[] = [
  {
    type: 'tear',
    label: 'Torn / Rip',
    icon: Scissors,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    desc: 'Torn seam, slit fabric, ripped hem',
  },
  {
    type: 'stain',
    label: 'Stain / Oil',
    icon: Droplets,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    desc: 'Grease, chemical, food, or ink mark',
  },
  {
    type: 'burn',
    label: 'Burn / Heat',
    icon: Flame,
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    desc: 'Iron scorch, hole, heat discoloration',
  },
  {
    type: 'dent',
    label: 'Hardware / Zip',
    icon: Wrench,
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    desc: 'Broken zipper, missing/crushed button',
  },
  {
    type: 'other',
    label: 'Other Defect',
    icon: HelpCircle,
    color: 'text-slate-700 bg-slate-50 border-slate-200',
    desc: 'Fabric weave defect, odor, fading',
  },
];

export const DamageReportModal: React.FC<DamageReportModalProps> = ({
  isOpen,
  onClose,
  sections,
  initialSection,
  onSuccess,
}) => {
  const { profile } = useAuth();

  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    initialSection?.id || (sections.length > 0 ? sections[0].id : '')
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [damageType, setDamageType] = useState<DamageType>('tear');
  const [description, setDescription] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentSection = sections.find((s) => s.id === selectedSectionId);
  const maxAvailable = currentSection ? currentSection.available_stock : 0;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage(`Photo exceeds 5MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please choose a smaller image.`);
      return;
    }

    // Check type
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type.toLowerCase())) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, or WebP).');
      return;
    }

    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedSectionId) {
      setErrorMessage('Please select a clothing section.');
      return;
    }

    if (quantity <= 0) {
      setErrorMessage('Reported quantity must be at least 1 piece.');
      return;
    }

    if (quantity > maxAvailable) {
      setErrorMessage(
        `Cannot report ${quantity} pcs: only ${maxAvailable} pcs are available for sale in this section.`
      );
      return;
    }

    if (!description.trim()) {
      setErrorMessage('Please provide a short description of the damage found.');
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `dmg-idem-${profile?.id || 'staff'}-${Date.now()}`;

    const res = await submitDamageReport(
      {
        staff_id: profile?.id || 'staff',
        staff_name: profile?.full_name || 'Staff Member',
        section_id: selectedSectionId,
        quantity,
        damage_type: damageType,
        description: description.trim(),
        photo_file: photoFile || undefined,
        idempotency_key: idempotencyKey,
      },
      profile || undefined
    );

    setIsSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
      onClose();
    } else {
      setErrorMessage(res.error || 'Failed to submit damage report.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#0B193C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Report Damaged Garment</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-300 border border-rose-400/30">
                  Phase 4 Stock Reservation
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Immediately holds items from POS sales &bull; Awaits Owner review
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Section Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Target Section / Garment
            </label>
            <select
              value={selectedSectionId}
              onChange={(e) => {
                setSelectedSectionId(e.target.value);
                setQuantity(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-900 font-medium outline-none focus:ring-2 focus:ring-[#0B193C]"
            >
              {sections
                .filter((s) => s.is_active !== false)
                .map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name} {sec.section_code ? `[${sec.section_code}]` : ''} ({sec.category}) — {sec.available_stock} pcs available
                  </option>
                ))}
            </select>

            {currentSection && (
              <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">Current Stock Status:</span>
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-slate-700">
                    Physical: <strong>{currentSection.physical_stock}</strong>
                  </span>
                  <span className="text-amber-700 font-semibold">
                    Reserved: <strong>{currentSection.reserved_stock}</strong>
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                      currentSection.available_stock > 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {currentSection.available_stock} sellable
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quantity Stepper */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Damaged Quantity (Pieces)
              </label>
              <span className="text-[11px] text-slate-500">
                Max available: <strong className="text-slate-800 font-mono">{maxAvailable} pcs</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="px-3 py-2 text-slate-700 hover:bg-slate-200 transition disabled:opacity-40 text-sm font-bold cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max={maxAvailable}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (isNaN(val)) setQuantity(1);
                    else setQuantity(Math.min(Math.max(1, val), maxAvailable || 1));
                  }}
                  className="w-16 text-center text-xs font-bold font-mono py-2 bg-white border-x border-slate-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxAvailable, q + 1))}
                  disabled={quantity >= maxAvailable || maxAvailable === 0}
                  className="px-3 py-2 text-slate-700 hover:bg-slate-200 transition disabled:opacity-40 text-sm font-bold cursor-pointer"
                >
                  +
                </button>
              </div>

              <div className="text-xs text-slate-600 leading-tight">
                {quantity > 0 ? (
                  <span>
                    Will reserve <strong className="text-amber-800 font-mono">{quantity} pc(s)</strong>.
                    Remaining sellable: <strong className="text-slate-800 font-mono">{Math.max(0, maxAvailable - quantity)}</strong>.
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Damage Type Category Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Damage Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DAMAGE_TYPES.map((dt) => {
                const IconComponent = dt.icon;
                const isSelected = damageType === dt.type;
                return (
                  <button
                    key={dt.type}
                    type="button"
                    onClick={() => setDamageType(dt.type)}
                    className={`p-2.5 text-left rounded-xl border transition cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'border-[#0B193C] bg-slate-900 text-white shadow-xs ring-1 ring-[#0B193C]'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <IconComponent
                        className={`w-3.5 h-3.5 ${
                          isSelected ? 'text-amber-400' : 'text-slate-500'
                        }`}
                      />
                      <span className="text-xs font-bold">{dt.label}</span>
                    </div>
                    <span
                      className={`text-[10px] line-clamp-1 ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {dt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Specific Defect Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Iron burn hole on right breast pocket found during morning hanger arrangement..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#0B193C]"
            />
          </div>

          {/* Photo Evidence (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Photo Evidence (Optional)</span>
              </label>
              <span className="text-[10px] text-slate-500">Max 5MB &bull; JPG, PNG, WebP</span>
            </div>

            {photoPreview ? (
              <div className="relative p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <img
                    src={photoPreview}
                    alt="Damage Evidence"
                    className="w-12 h-12 object-cover rounded-lg border border-slate-300 shrink-0"
                  />
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {photoFile?.name || 'Attached Photo'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {photoFile ? `${(photoFile.size / 1024).toFixed(0)} KB` : 'Ready for upload'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                  title="Remove photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50 rounded-xl cursor-pointer transition">
                <Upload className="w-5 h-5 text-slate-400 mb-1" />
                <span className="text-xs font-semibold text-slate-700">
                  Click to upload or take a photo of the damage
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  Stored securely in private Supabase Storage
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Safety Notice */}
          <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-tight flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Inventory Protection:</strong> Submitting reserves {quantity} pc(s) from POS checkout so cashiers cannot sell it. Physical inventory remains in store until the Store Owner approves or rejects the report.
            </div>
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
              disabled={isSubmitting || maxAvailable === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#0B193C] hover:bg-[#14285D] text-white text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Reserving Stock...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Submit &amp; Reserve Stock</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
