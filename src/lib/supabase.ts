import { createClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 本地游客模式允许不配置 Supabase；真实登录和云端数据仍要求正式凭据。 */
export const isSupabaseConfigured = Boolean(configuredUrl && configuredAnonKey);

export const supabase = createClient(
  configuredUrl ?? 'http://127.0.0.1:54321',
  configuredAnonKey ?? 'local-development-anon-key',
  {
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured,
    },
  },
);
