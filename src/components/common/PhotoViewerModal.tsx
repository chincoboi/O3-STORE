import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, ShieldCheck, Loader2, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { resolveDamagePhotoUrl, getDamagePhotoImmediateUrl } from '../../lib/damageService';

interface PhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  storagePath?: string | null;
  title?: string;
  subtitle?: string;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  storagePath,
  title = 'Damage Photo Evidence',
  subtitle,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    return getDamagePhotoImmediateUrl(storagePath || imageUrl, imageUrl) || imageUrl || null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    setHasError(false);
    setIsZoomed(false);

    // If already valid data/blob/http URL
    if (imageUrl && (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:') || imageUrl.startsWith('http'))) {
      setResolvedUrl(imageUrl);
      setIsLoading(false);
      return;
    }

    const immediate = getDamagePhotoImmediateUrl(storagePath || imageUrl, imageUrl);
    if (immediate) {
      setResolvedUrl(immediate);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    resolveDamagePhotoUrl(storagePath || imageUrl, imageUrl)
      .then((url) => {
        setResolvedUrl(url);
        setIsLoading(false);
        if (!url) setHasError(true);
      })
      .catch(() => {
        setIsLoading(false);
        setHasError(true);
      });
  }, [isOpen, imageUrl, storagePath]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-[#0B193C] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight">{title}</h3>
              <span className="text-[10px] bg-white/20 text-white font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Evidence Vault
              </span>
            </div>
            {subtitle && <p className="text-xs text-slate-300 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {resolvedUrl && !hasError && (
              <>
                <button
                  type="button"
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                  title={isZoomed ? 'Fit to screen' : 'Zoom 100%'}
                >
                  {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                </button>
                <a
                  href={resolvedUrl}
                  download="damage-evidence.jpg"
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition"
                  title="Open full size / Download"
                >
                  <Download className="w-4 h-4" />
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="p-4 bg-slate-950 flex items-center justify-center overflow-auto flex-1 min-h-[320px]">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <span className="text-xs font-medium">Loading high-resolution evidence photo...</span>
            </div>
          ) : hasError || !resolvedUrl ? (
            <div className="flex flex-col items-center gap-2 text-rose-300 p-8 text-center max-w-sm">
              <AlertCircle className="w-8 h-8 text-rose-400" />
              <span className="text-sm font-bold text-white">Could not load photo preview</span>
              <p className="text-xs text-slate-400">
                The image storage path could not be resolved. If the report was submitted recently, please verify your network connection.
              </p>
            </div>
          ) : (
            <img
              src={resolvedUrl}
              alt={title}
              onError={() => setHasError(true)}
              className={`rounded-lg shadow-2xl transition-all duration-200 ${
                isZoomed
                  ? 'max-h-none w-auto max-w-none cursor-zoom-out'
                  : 'max-h-[68vh] w-auto max-w-full object-contain cursor-zoom-in'
              }`}
              onClick={() => setIsZoomed(!isZoomed)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Store quality inspection proof &bull; Click image to zoom</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0B193C] hover:bg-[#14285D] text-white font-semibold text-xs rounded-lg transition cursor-pointer"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
