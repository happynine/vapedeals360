// Supabase client - 数据隔离版本（Supabase 官方）
// 不依赖任何扣子平台 SDK，直接使用环境变量
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function getAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

// Public client (anon key) - for client-side safe operations
function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = getSupabaseUrl();
    const key = getAnonKey();
    if (!url || !key) {
      throw new Error('Supabase not configured: missing URL or anon key');
    }
    _client = createClient(url, key);
  }
  return _client;
}

// Service role client - for server-side operations with full access
function getServiceRoleClient(): SupabaseClient {
  if (!_serviceClient) {
    const url = getSupabaseUrl();
    const key = getServiceRoleKey() || getAnonKey();
    if (!url || !key) {
      throw new Error('Supabase not configured: missing URL or key');
    }
    _serviceClient = createClient(url, key);
  }
  return _serviceClient;
}

function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getAnonKey();
  return !!(url && key);
}

function loadEnv(): void {
  // No-op: env vars are read directly from process.env
}

function getSupabaseCredentials() {
  return {
    url: getSupabaseUrl(),
    anonKey: getAnonKey(),
  };
}

function getSupabaseServiceRoleKey(): string | undefined {
  return getServiceRoleKey() || undefined;
}

export {
  loadEnv,
  getSupabaseCredentials,
  getSupabaseServiceRoleKey,
  getSupabaseClient,
  getServiceRoleClient,
  isSupabaseConfigured,
};
