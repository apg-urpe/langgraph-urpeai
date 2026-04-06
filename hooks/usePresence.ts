import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useContactStore, selectUserContext } from '../store/contactStore';
import { usePresenceStore } from '../store/presenceStore';
import { logger } from '../lib/logger';

/**
 * Hook to initialize real-time presence tracking.
 * - Subscribes to Supabase Presence channel scoped by empresa
 * - Tracks current user as online
 * - Cleans up on unmount or enterprise change
 */
export const usePresence = () => {
  const userId = useAuthStore(state => state.user?.id);
  const userContext = useContactStore(selectUserContext);
  const subscribeToPresence = usePresenceStore(state => state.subscribeToPresence);
  const unsubscribeFromPresence = usePresenceStore(state => state.unsubscribeFromPresence);

  useEffect(() => {
    if (userId && userContext) {
      logger.debug('[usePresence] Initializing presence for enterprise:', userContext.empresaId);

      subscribeToPresence({
        id: userContext.id,
        authUid: userContext.authUid,
        nombre: userContext.nombre,
        apellido: userContext.apellido,
        email: userContext.email,
        empresaId: userContext.empresaId,
      });

      return () => {
        logger.debug('[usePresence] Cleaning up presence subscription');
        unsubscribeFromPresence();
      };
    }
  }, [userId, userContext?.id, userContext?.empresaId, subscribeToPresence, unsubscribeFromPresence]);
};
