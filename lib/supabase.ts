import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client';

// Reutilizar el singleton para evitar múltiples GoTrueClient en el browser
export const supabase = supabaseClient;

/**
 * Cache de clientes autenticados por accessToken.
 * Evita crear múltiples instancias de GoTrueClient en el mismo browser context.
 */
const authClientCache = new Map<string, any>(); // Cache: token → SupabaseClient

/**
 * Crea (o reutiliza) un cliente de Supabase con el token de autenticación del usuario.
 * El cliente se cachea por token para evitar el warning "Multiple GoTrueClient instances".
 * @param accessToken - Token de acceso de la sesión del usuario
 */
export function createAuthenticatedClient(accessToken?: string) {
  const cacheKey = accessToken ?? '__anon__';
  const storageKeySuffix = cacheKey === '__anon__' ? 'anon' : cacheKey.slice(0, 12);

  const cached = authClientCache.get(cacheKey);
  if (cached) return cached;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `urpe-auth-header-${storageKeySuffix}`,
    },
    global: {
      headers: accessToken 
        ? { Authorization: `Bearer ${accessToken}` }
        : { 'X-Client-Info': 'urpe-chat/2.0' }
    }
  });

  authClientCache.set(cacheKey, client);
  return client;
}

/**
 * Limpia el cache de clientes autenticados.
 * Llamar en logout para evitar reutilizar tokens expirados.
 */
export function clearAuthenticatedClientCache() {
  authClientCache.clear();
}

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
