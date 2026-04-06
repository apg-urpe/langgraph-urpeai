import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Supabase Admin client with service_role key.
 * Bypass RLS. Only use in server-side contexts.
 * Lazy-initialized to avoid crashing during Next.js build.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in environment variables.');
      }

      _client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    }
    return (_client as any)[prop];
  }
});
