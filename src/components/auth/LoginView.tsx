import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Shield,
  ArrowRight,
  Database,
  UserCheck,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types/database';

export const LoginView: React.FC = () => {
  const { login, enterDemoMode, isConfigured, setIsSetupModalOpen } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleDemoSignIn = (role: UserRole) => {
    enterDemoMode(role);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#11235A] via-[#0B193C] to-[#060D20]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo Container */}
        <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-xl mb-4 border border-white/20">
          <img
            src="/public/assets/aistudio/Asset_1_4x_cf9dccd7.png"
            alt="O3 Varieties Logo"
            className="h-12 w-auto object-contain"
          />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-white">
          Inventory & Accountability
        </h2>
        <p className="mt-1 text-xs text-slate-300">
          Retail Operations Portal &bull; Second-Hand Clothing Store &bull; Lagos
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-200">
          {/* Sign In Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Store Staff Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. staff@o3varieties.ng"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0B193C] focus:border-transparent outline-none transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0B193C] focus:border-transparent outline-none transition"
                  required
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-[#0B193C] hover:bg-[#14285D] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0B193C] transition disabled:opacity-50"
            >
              {isLoading ? 'Verifying Credentials...' : 'Sign In to Store'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Security policy note */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              Public sign-up is disabled
            </span>
            <button
              type="button"
              onClick={() => setIsSetupModalOpen(true)}
              className="text-[#0B193C] hover:underline flex items-center gap-1 font-medium"
            >
              <Database className="w-3 h-3" />
              Database Status
            </button>
          </div>

          {/* Connection Status & Demo Options */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                Interactive Testing &amp; Preview
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full">
                Phase 1 Sandbox
              </span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-tight">
                  <strong>Explore Demo Mode:</strong> Test role-based dashboard shells immediately with realistic Nigerian thrift inventory records.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => enterDemoMode('super_admin')}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B193C] text-white rounded-lg text-xs font-semibold hover:bg-[#14285D] transition shadow-xs"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Owner (Super Admin) &bull; Overall Sales Board (₦83,500)
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => enterDemoMode('staff', 1)}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white text-slate-800 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50 transition shadow-xs"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span>Staff 1 (Chidinma: ₦45.5k)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => enterDemoMode('staff', 2)}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white text-slate-800 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50 transition shadow-xs"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Staff 2 (Babatunde: ₦38k)</span>
                  </button>
                </div>
                <p className="text-[10px] text-amber-800 text-center font-medium">
                  Notice: Each staff account is strictly isolated to their own shift receipts.
                </p>
              </div>
            </div>

            {!isConfigured && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => setIsSetupModalOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 transition"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  How to connect your live Supabase project?
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-4 text-center text-xs text-slate-400">
          O3 Varieties &bull; Physical Store Accountability &bull; Strict Role Separation
        </p>
      </div>
    </div>
  );
};
