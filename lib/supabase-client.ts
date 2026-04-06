/**
 * Supabase Client for Next.js (Browser)
 * 
 * This is the client-side Supabase instance for use in Client Components.
 * Uses NEXT_PUBLIC_ environment variables for browser access.
 * 
 * SECURITY: No hardcoded credentials. Variables must be set in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env-validator';

// Get validated environment variables
const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

// Export for backward compatibility (but now validated)
export { SUPABASE_URL, SUPABASE_ANON_KEY };

/**
 * Cliente Supabase optimizado para chat en tiempo real
 * 
 * Configuración de Realtime:
 * - Heartbeat cada 10s (más frecuente que default)
 * - Reconexión exponencial rápida: 500ms, 1s, 2s, 4s, max 10s
 * - eventsPerSecond: 20 para mejor throughput
 * - timeout: 20s para detección rápida de desconexiones
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  realtime: {
    params: {
      eventsPerSecond: 20
    },
    heartbeatIntervalMs: 10000,
    reconnectAfterMs: (tries: number) => {
      return Math.min(500 * Math.pow(2, tries), 10000);
    },
    timeout: 20000
  },
  global: {
    headers: {
      'X-Client-Info': 'urpe-chat-nextjs/4.0'
    }
  }
});

/**
 * Helper para verificar si el cliente Realtime está conectado
 */
export const isRealtimeConnected = (): boolean => {
  try {
    const channels = supabase.getChannels();
    return channels.some(ch => ch.state === 'joined');
  } catch {
    return false;
  }
};

/**
 * Helper para forzar reconexión de todos los canales
 */
export const reconnectAllChannels = async (): Promise<void> => {
  try {
    const channels = supabase.getChannels();
    for (const channel of channels) {
      await supabase.removeChannel(channel);
    }
    console.log('[Supabase] 🔄 Canales reconectados');
  } catch (err) {
    console.error('[Supabase] ❌ Error reconectando:', err);
  }
};
