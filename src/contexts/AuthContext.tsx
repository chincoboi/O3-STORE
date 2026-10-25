import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../types/database';
import {
  getSupabaseClient,
  getSupabaseCredentials,
  fetchProfile,
  clearCustomCredentials,
} from '../lib/supabase';
import { DEMO_OWNER, DEMO_STAFF, DEMO_STAFF_2 } from '../lib/demoData';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isConfigured: boolean;
  isDemoMode: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  enterDemoMode: (role: UserRole, staffIndex?: 1 | 2) => void;
  exitDemoMode: () => void;
  refreshProfile: () => Promise<void>;
  isSetupModalOpen: boolean;
  setIsSetupModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState<boolean>(false);

  const creds = getSupabaseCredentials();
  const isConfigured = creds.source !== 'none';

  // Initialize Auth
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      setIsLoading(true);
      const client = getSupabaseClient();

      if (!client) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: { session } } = await client.auth.getSession();
        if (session?.user && mounted) {
          setUser(session.user);
          const userProf = await fetchProfile(session.user.id);
          if (mounted) {
            if (userProf) {
              if (!userProf.is_active) {
                setError('Your staff account is currently deactivated. Please contact store management.');
                await client.auth.signOut();
                setUser(null);
                setProfile(null);
                setRole(null);
              } else {
                setProfile(userProf);
                setRole(userProf.role);
              }
            } else {
              // User has auth record but no profile in public.profiles yet
              setProfile({
                id: session.user.id,
                email: session.user.email,
                full_name: session.user.email?.split('@')[0] || 'User',
                username: session.user.email?.split('@')[0] || 'user',
                role: 'staff',
                is_active: true,
                created_at: new Date().toISOString(),
              });
              setRole('staff');
            }
          }
        }

        // Listen for auth state changes
        const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, newSession) => {
          if (!mounted) return;
          if (newSession?.user) {
            setUser(newSession.user);
            const userProf = await fetchProfile(newSession.user.id);
            if (mounted) {
              if (userProf) {
                if (!userProf.is_active) {
                  setError('Account deactivated. Contact business owner.');
                  client.auth.signOut();
                  setUser(null);
                  setProfile(null);
                  setRole(null);
                } else {
                  setProfile(userProf);
                  setRole(userProf.role);
                }
              }
            }
          } else {
            setUser(null);
            setProfile(null);
            setRole(null);
          }
        });

        return () => {
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    const client = getSupabaseClient();

    if (!client) {
      return {
        success: false,
        error: 'Supabase is not configured yet. Please configure your project credentials or explore Demo Mode.',
      };
    }

    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        return { success: false, error: signInError.message };
      }

      if (data.user) {
        setUser(data.user);
        const userProf = await fetchProfile(data.user.id);
        if (userProf) {
          if (!userProf.is_active) {
            await client.auth.signOut();
            return { success: false, error: 'Your account is deactivated by the business owner.' };
          }
          setProfile(userProf);
          setRole(userProf.role);
        }
        return { success: true };
      }

      return { success: false, error: 'Sign in could not be completed.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown login error';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setUser(null);
      setProfile(null);
      setRole(null);
      return;
    }

    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  const enterDemoMode = (demoRole: UserRole, staffIndex: 1 | 2 = 1) => {
    setIsDemoMode(true);
    setError(null);
    if (demoRole === 'super_admin') {
      setProfile(DEMO_OWNER);
      setRole('super_admin');
    } else {
      setProfile(staffIndex === 2 ? DEMO_STAFF_2 : DEMO_STAFF);
      setRole('staff');
    }
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  const refreshProfile = async () => {
    if (isDemoMode || !user) return;
    const p = await fetchProfile(user.id);
    if (p) {
      setProfile(p);
      setRole(p.role);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAuthenticated: isDemoMode ? Boolean(profile) : Boolean(user),
        isConfigured,
        isDemoMode,
        isLoading,
        error,
        login,
        logout,
        enterDemoMode,
        exitDemoMode,
        refreshProfile,
        isSetupModalOpen,
        setIsSetupModalOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
