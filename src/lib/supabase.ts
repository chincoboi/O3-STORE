import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile } from '../types/database';

const STORAGE_KEY_URL = 'o3_custom_supabase_url';
const STORAGE_KEY_ANON = 'o3_custom_supabase_anon_key';

export function getSupabaseCredentials(): { url: string | null; key: string | null; source: 'env' | 'custom' | 'none' } {
  const envUrl = import.meta?.env?.VITE_SUPABASE_URL;
  const envKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey && !envUrl.includes('your-project-id') && envUrl.startsWith('https://')) {
    return { url: envUrl, key: envKey, source: 'env' };
  }

  // 2. Check browser runtime storage (if owner entered directly in app UI)
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem(STORAGE_KEY_URL);
    const customKey = localStorage.getItem(STORAGE_KEY_ANON);
    if (customUrl && customKey && customUrl.startsWith('https://')) {
      return { url: customUrl, key: customKey, source: 'custom' };
    }
  }

  return { url: null, key: null, source: 'none' };
}

let supabaseInstance: SupabaseClient | null = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();

  if (!url || !key) {
    return null;
  }

  if (supabaseInstance && currentUrl === url && currentKey === key) {
    return supabaseInstance;
  }

  try {
    currentUrl = url;
    currentKey = key;
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function saveCustomCredentials(url: string, key: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_ANON, key.trim());
  supabaseInstance = null; // force re-instantiation
}

export function clearCustomCredentials(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON);
  supabaseInstance = null;
}

export async function testConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url.trim(), key.trim(), {
      auth: { persistSession: false },
    });
    // Check if we can ping the public health or schema
    const { error } = await client.from('profiles').select('id').limit(1);

    if (error) {
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'Connected to Supabase! Note: Database tables not found yet. Please run migration 001 in the SQL Editor.',
        };
      }
      if (error.message.includes('Invalid API key') || error.code === 'PGRST301') {
        return { success: false, message: 'Invalid Supabase Anon Public Key.' };
      }
      return { success: false, message: `Database error: ${error.message}` };
    }

    return { success: true, message: 'Successfully connected to Supabase and verified schema!' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection failed: ${errorMsg}` };
  }
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Profile fetch warning:', error.message);
      return null;
    }
    return data as UserProfile;
  } catch (err) {
    console.error('Error in fetchProfile:', err);
    return null;
  }
}
