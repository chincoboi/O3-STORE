/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/common/Header';
import { LoginView } from './components/auth/LoginView';
import { OwnerDashboardShell } from './components/admin/OwnerDashboardShell';
import { StaffDashboardShell } from './components/staff/StaffDashboardShell';
import { SupabaseSetupModal } from './components/setup/SupabaseSetupModal';
import { Loader2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { isAuthenticated, role, isLoading, isSetupModalOpen, setIsSetupModalOpen } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B193C] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-3 rounded-2xl shadow-xl mb-4">
          <img
            src="/public/assets/aistudio/Asset_1_4x_cf9dccd7.png"
            alt="O3 Varieties Logo"
            className="h-10 w-auto object-contain"
          />
        </div>
        <div className="flex items-center gap-2 text-white text-xs font-semibold">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>Initializing O3 Retail System...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginView />
        <SupabaseSetupModal
          isOpen={isSetupModalOpen}
          onClose={() => setIsSetupModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Header />
      <div className="flex-1">
        {role === 'super_admin' ? <OwnerDashboardShell /> : <StaffDashboardShell />}
      </div>
      <SupabaseSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
