import { supabase } from '../lib/supabase-client';
import { useAuthStore } from '../store/authStore';

/**
 * Hook para obtener cliente Supabase con sesión del usuario
 * 
 * IMPORTANTE: Reutiliza el singleton de supabase-client para evitar
 * múltiples instancias de GoTrueClient en el browser.
 * 
 * El cliente singleton ya maneja la sesión automáticamente via
 * persistSession: true y autoRefreshToken: true.
 */
export function useSupabase() {
  const session = useAuthStore(state => state.session);
  
  // Reutilizar el singleton - NO crear nuevos clientes
  return { supabase, session };
}
