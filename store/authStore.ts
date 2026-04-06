import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { clearAuthenticatedClientCache } from '../lib/supabase';
import { Session, User, Subscription } from '@supabase/supabase-js';
import { logger } from '../lib/logger';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  _authSubscription: Subscription | null; // Internal: for cleanup
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  cleanup: () => void; // CRITICAL: Call this on app unmount to prevent memory leaks
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  _authSubscription: null,

  initialize: async () => {
    try {
      // Add timeout wrapper to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Auth initialization timeout')), 10000); // 10s timeout
      });

      const initPromise = async () => {
        // Bootstrap session from URL hash tokens (Magic Link callback)
        if (typeof window !== 'undefined' && window.location.hash) {
          const hash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash;

          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            try {
              logger.debug('[Auth] Setting session from URL hash...');
              await supabase.auth.setSession({ access_token, refresh_token });

              // Clean URL (remove hash) to avoid leaking tokens and repeated parsing
              const { pathname, search } = window.location;
              window.history.replaceState({}, '', pathname + search);
            } catch (e) {
              logger.error('[Auth] Error setting session from URL hash:', e);
            }
          }
        }

        // Get initial session with timeout
        logger.debug('[Auth] Getting initial session...');
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          // Specifically check for Refresh Token errors which indicate stale local storage
          if (error.message && (
               error.message.includes('Refresh Token') || 
               error.message.includes('refresh_token_not_found') ||
               error.message.includes('Invalid Refresh Token')
             )) {
               logger.warn('[Auth] Detected stale session (Invalid Refresh Token). Clearing auth storage.');
               // Force a sign out to clear the invalid token from localStorage
               // We wrap this in try/catch to ensure we proceed to clear local state even if the network call fails
               try {
                await supabase.auth.signOut();
               } catch (signOutError) {
                logger.warn('[Auth] SignOut failed during recovery, forcing local state clear', signOutError);
               }
          }
          
          set({ session: null, user: null, isLoading: false });
        } else {
          logger.debug('[Auth] Session retrieved:', data.session ? 'with session' : 'no session');
          set({ session: data.session, user: data.session?.user || null, isLoading: false });
        }

        // Listen for changes - CRITICAL: Store subscription for cleanup
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          const eventName = event as string;
          
          logger.debug('[Auth] Estado cambi\u00f3:', eventName);
          
          // Eventos que cierran sesión
          if (eventName === 'SIGNED_OUT' || eventName === 'USER_DELETED' || eventName === 'TOKEN_REFRESH_REVOKED') {
            logger.debug('[Auth] Cerrando sesi\u00f3n por evento:', eventName);
            set({ session: null, user: null, isLoading: false });
            return;
          }
          
          // Solo establecer sesión si realmente hay una válida
          if (session && session.user) {
            logger.debug('[Auth] Sesi\u00f3n v\u00e1lida establecida');
            set({ session, user: session.user, isLoading: false });
          } else if (eventName === 'INITIAL_SESSION' && !session) {
            // No hay sesión inicial - mantener estado sin sesión
            logger.debug('[Auth] No hay sesi\u00f3n inicial');
            set({ session: null, user: null, isLoading: false });
          }
          // Para otros eventos sin sesión válida, no hacer nada
          // Esto evita re-establecer sesión por eventos espurios
        });
        
        // Store subscription for cleanup
        set({ _authSubscription: subscription });
      };

      // Race between initialization and timeout
      await Promise.race([initPromise(), timeoutPromise]);

    } catch (error) {
      logger.error('[Auth] Initialization error or timeout:', error);
      // Ensure we don't get stuck in loading state even if there's a crash or timeout
      set({ session: null, user: null, isLoading: false });
    }
  },

  signOut: async () => {
    try {
      // 1. Limpiar URL hash si existe (evita re-login automático)
      if (typeof window !== 'undefined' && window.location.hash) {
        const { pathname, search } = window.location;
        window.history.replaceState({}, '', pathname + search);
      }

      // 2. Desconectar todos los canales de Realtime
      const channels = supabase.getChannels();
      for (const channel of channels) {
        await supabase.removeChannel(channel);
      }

      // 3. Limpiar cache de clientes autenticados (evita reutilizar tokens expirados)
      clearAuthenticatedClientCache();

      // 4. SignOut con scope global (cierra sesión en TODOS los dispositivos)
      await supabase.auth.signOut({ scope: 'global' });

      // 5. Limpiar storage de Supabase manualmente (fallback)
      if (typeof window !== 'undefined') {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }

      logger.debug('[Auth] Sesi\u00f3n cerrada correctamente');
    } catch (error) {
      logger.error('[Auth] Error durante sign out:', error);
      
      // Aún así, limpiar storage local como fallback
      if (typeof window !== 'undefined') {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }
    }
    
    set({ session: null, user: null, isLoading: false });
  },

  // CRITICAL: Cleanup function to prevent memory leaks
  // Call this when the app unmounts or when you need to clean up
  cleanup: () => {
    const subscription = get()._authSubscription;
    if (subscription) {
      subscription.unsubscribe();
      set({ _authSubscription: null });
      logger.debug('[Auth] Auth subscription cleaned up');
    }
  }
}));
