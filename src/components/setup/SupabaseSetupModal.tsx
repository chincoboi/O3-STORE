import React, { useState } from 'react';
import {
  X,
  Database,
  Key,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  getSupabaseCredentials,
  saveCustomCredentials,
  clearCustomCredentials,
  testConnection,
} from '../../lib/supabase';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const currentCreds = getSupabaseCredentials();

  const [url, setUrl] = useState<string>(currentCreds.url || '');
  const [anonKey, setAnonKey] = useState<string>(currentCreds.key || '');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'credentials' | 'schema' | 'guide'>('credentials');

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !anonKey) {
      setTestResult({ success: false, message: 'Please provide both the Supabase URL and Anon Key.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await testConnection(url, anonKey);
    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      saveCustomCredentials(url, anonKey);
      if (onConfigChanged) onConfigChanged();
    }
  };

  const handleReset = () => {
    clearCustomCredentials();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
    if (onConfigChanged) onConfigChanged();
  };

  const handleCopySql = () => {
    const sqlPath = '/supabase/migrations/001_initial_schema.sql';
    // Copy helpful instruction
    navigator.clipboard.writeText(
      `-- Copy and run the content of ${sqlPath} in your Supabase SQL Editor.`
    );
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0B193C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Supabase Database & Auth Setup</h3>
              <p className="text-xs text-slate-300">
                Connect O3 Varieties to persistent PostgreSQL, Supabase Auth & Storage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status banner */}
        <div
          className={`px-5 py-3 text-xs flex items-center justify-between ${
            currentCreds.source !== 'none'
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-b border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {currentCreds.source !== 'none' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              <strong>Status:</strong>{' '}
              {currentCreds.source === 'env'
                ? 'Configured via .env variables'
                : currentCreds.source === 'custom'
                ? 'Configured via in-browser settings'
                : 'Not connected (Requires Project URL & Anon Key)'}
            </span>
          </div>
          {currentCreds.source === 'custom' && (
            <button
              onClick={handleReset}
              className="text-xs text-rose-600 hover:underline font-medium"
            >
              Clear Saved Keys
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-medium">
          <button
            onClick={() => setActiveTab('credentials')}
            className={`px-4 py-2.5 border-b-2 transition ${
              activeTab === 'credentials'
                ? 'border-[#0B193C] text-[#0B193C] bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Connection Keys
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2.5 border-b-2 transition ${
              activeTab === 'guide'
                ? 'border-[#0B193C] text-[#0B193C] bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Setup Guide (3 Steps)
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-4 py-2.5 border-b-2 transition ${
              activeTab === 'schema'
                ? 'border-[#0B193C] text-[#0B193C] bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Migration 001 SQL
          </button>
        </div>

        {/* Body content */}
        <div className="p-6">
          {activeTab === 'credentials' && (
            <form onSubmit={handleTestAndSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supabase Project URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://xyzcompany.supabase.co"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full pl-3 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0B193C] focus:border-transparent outline-none font-mono"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Found in Supabase Dashboard &rarr; Project Settings &rarr; API &rarr; Project URL
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supabase Anon Public Key <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    className="w-full pl-3 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0B193C] focus:border-transparent outline-none font-mono"
                    required
                  />
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-amber-700">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Only use the <strong>anon public</strong> key. Never paste the secret service_role key.</span>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  <p className="font-semibold">{testResult.success ? 'Success' : 'Connection Error'}</p>
                  <p>{testResult.message}</p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#0B193C] hover:underline font-medium"
                >
                  Open Supabase Dashboard <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="submit"
                  disabled={isTesting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B193C] text-white text-xs font-semibold rounded-lg hover:bg-[#14285D] transition disabled:opacity-50"
                >
                  {isTesting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {isTesting ? 'Verifying...' : 'Save & Test Connection'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0B193C] text-white flex items-center justify-center text-[10px]">1</span>
                  Create or Select your Supabase Project
                </div>
                <p className="pl-7 text-slate-600">
                  Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">supabase.com</a>. Create a new organization and project (e.g., &quot;O3 Varieties Store&quot;), selecting the region closest to Nigeria (such as Europe West or Frankfurt).
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0B193C] text-white flex items-center justify-center text-[10px]">2</span>
                  Execute Migration 001 in SQL Editor
                </div>
                <p className="pl-7 text-slate-600">
                  In Supabase, navigate to the <strong>SQL Editor</strong> tab on the left. Paste the provided SQL schema from the &quot;Migration 001 SQL&quot; tab and click <strong>Run</strong>. This creates all 14 tables, custom enums, RLS policies, and seeds initial clothing sections.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0B193C] text-white flex items-center justify-center text-[10px]">3</span>
                  Create Owner Account and Staff Accounts
                </div>
                <p className="pl-7 text-slate-600">
                  In Supabase &rarr; <strong>Authentication &rarr; Users</strong>, create the store owner user. Then insert their profile row with <code>role = &apos;super_admin&apos;</code> in the <code>profiles</code> table.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'schema' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-600 font-semibold">1. /supabase/migrations/001_initial_schema.sql</span>
                <button
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedSql ? 'Copied reference!' : 'Copy SQL Location'}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Migration 001 creates all 14 core tables (profiles, stock_sections, stock_batches, sales, damage_reports, cash_sessions, expenses, audit_logs), custom types, Row Level Security policies, and initial Nigerian thrift clothing sections.
              </p>

              <div className="flex items-center justify-between text-xs pt-2">
                <span className="font-mono text-slate-600 font-semibold">2. /supabase/migrations/002_bale_allocation_functions.sql</span>
              </div>
              <p className="text-xs text-slate-500">
                Migration 002 adds the <code>section_stock_balances</code> view and the transactional stored procedure <code>allocate_bale_stock_atomic</code> for atomic bale intake, cost allocation verification, and audit trail generation.
              </p>

              <div className="flex items-center justify-between text-xs pt-2">
                <span className="font-mono text-slate-600 font-semibold">3. /supabase/migrations/004_atomic_sales_and_pos.sql</span>
              </div>
              <p className="text-xs text-slate-500">
                Migration 004 adds <code>process_sale_atomic</code> for atomic sales checkout, split payment legs, idempotency deduplication, and inventory ledger decrements.
              </p>

              <div className="flex items-center justify-between text-xs pt-2">
                <span className="font-mono text-slate-600 font-semibold">4. /supabase/migrations/005_section_codes_and_unique_identifiers.sql</span>
              </div>
              <p className="text-xs text-slate-500">
                Migration 005 adds unique <code>section_code</code> identifiers (e.g. <code>SEC-001</code>, <code>SEC-009</code>) to prevent name collision and ensure distinct identification across duplicate section names.
              </p>

              <div className="p-3 bg-slate-900 text-slate-200 text-[11px] font-mono rounded-lg max-h-48 overflow-y-auto leading-relaxed border border-slate-800">
                -- O3 VARIETIES INVENTORY &amp; ACCOUNTABILITY SYSTEM<br />
                -- Migration 001: Initial Core Schema, RLS, Enums<br />
                -- Migration 002: Atomic Bale Allocation &amp; Stock Balance Views<br />
                -- Migration 004: Atomic POS Sales Processing, Split Payments &amp; Idempotency<br />
                -- Migration 005: Section Codes &amp; Unique Identifiers<br />
                -- Run migration files sequentially in your Supabase SQL Editor.<br />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
