import React from 'react';
import {
  ShieldAlert,
  Database,
  LogOut,
  User,
  Sparkles,
  Store,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const Header: React.FC = () => {
  const {
    profile,
    role,
    isDemoMode,
    isConfigured,
    logout,
    exitDemoMode,
    setIsSetupModalOpen,
  } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-[#0B193C] text-white shadow-md border-b border-[#14285D]">
      {/* Demo Mode Banner (when active) */}
      {isDemoMode && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-between tracking-wide shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-950 animate-pulse shrink-0" />
            <span>
              <strong>DEMO MODE (Simulation)</strong> &mdash; Operating on isolated sample records. Persistent Supabase backend is not yet attached.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSetupModalOpen(true)}
              className="px-2.5 py-0.5 bg-slate-950 text-white rounded text-[11px] font-medium hover:bg-slate-800 transition"
            >
              Configure Live Supabase
            </button>
            <button
              onClick={exitDemoMode}
              className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-slate-950 font-medium rounded text-[11px] transition"
            >
              Exit Demo
            </button>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Store Identity */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-md shadow-xs h-9 flex items-center">
              <img
                src="/public/assets/aistudio/Asset_1_4x_cf9dccd7.png"
                alt="O3 Varieties Logo"
                className="h-7 w-auto object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">
                  O3 VARIETIES
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                  RETAIL OS
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <Store className="w-3 h-3 text-amber-400" />
                <span>Store #1 &bull; Lagos Main</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Supabase connection status button */}
          <button
            onClick={() => setIsSetupModalOpen(true)}
            className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${
              isConfigured
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
            }`}
            title="Database Connection Status"
          >
            {isConfigured ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="font-medium text-[11px]">
              {isConfigured ? 'Supabase Connected' : 'Setup Supabase'}
            </span>
          </button>

          {/* User Profile Chip */}
          {profile && (
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-amber-300 font-semibold text-xs border border-white/20">
                {profile.full_name?.charAt(0) || 'U'}
              </div>

              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-white leading-tight">
                  {profile.full_name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {role === 'super_admin' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-400/20 px-1.5 py-0.2 rounded border border-amber-400/30">
                      <Sparkles className="w-2.5 h-2.5" />
                      OWNER (SUPER ADMIN)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-200 bg-sky-500/20 px-1.5 py-0.2 rounded border border-sky-400/30">
                      <User className="w-2.5 h-2.5" />
                      STAFF CASHIER
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={logout}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
