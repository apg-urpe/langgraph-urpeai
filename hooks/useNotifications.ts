import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useContactStore } from '../store/contactStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { logger } from '../lib/logger';

/**
 * Hook to initialize notifications system
 * - Subscribes to Supabase Realtime updates
 * - Fetches initial notifications
 * - Cleans up on unmount
 */
export const useNotifications = () => {
  // Use user.id instead of user object to prevent re-renders when user object reference changes
  const userId = useAuthStore(state => state.user?.id);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const subscribeToNotifications = useNotificationsStore(state => state.subscribeToNotifications);
  const unsubscribeFromNotifications = useNotificationsStore(state => state.unsubscribeFromNotifications);
  const fetchNotifications = useNotificationsStore(state => state.fetchNotifications);

  useEffect(() => {
    if (userId && selectedEnterpriseId) {
      logger.debug('[useNotifications] Initializing notifications for enterprise:', selectedEnterpriseId);
      
      // Fetch initial notifications
      fetchNotifications(true);
      
      // Subscribe to realtime updates
      subscribeToNotifications(userId, selectedEnterpriseId);
      
      // Cleanup on unmount or when enterprise changes
      return () => {
        logger.debug('[useNotifications] Cleaning up notifications subscription');
        unsubscribeFromNotifications();
      };
    }
  }, [userId, selectedEnterpriseId, subscribeToNotifications, unsubscribeFromNotifications, fetchNotifications]);
};
