import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { notificationSound } from '../lib/notification-sound';
import { sendDirectMessageRecord } from '../lib/direct-message';
import {
  Notification,
  NotificationFilters,
  NotificationStats,
  NotificationStatus,
  NotificationType,
  isHumanInTheLoopNotification
} from '../types/notification';

// Cache duration (5 minutes)
const CACHE_DURATION_MS = 300000;

// Max toasts to show at once
const MAX_TOAST_QUEUE = 3;

interface NotificationsState {
  // Data
  notifications: Notification[];
  stats: NotificationStats;
  
  // Cache
  lastFetchTime: number | null;
  cachedTeamData: { id: number; empresa_id: number } | null;
  
  // UI State
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  page: number;
  error: string | null;
  filters: NotificationFilters;
  
  // Toast queue for stacking notifications
  toastQueue: Notification[];
  
  // Sound settings
  soundEnabled: boolean;
  
  // Realtime subscription
  realtimeChannel: any | null;
  
  // Actions
  fetchNotifications: (forceRefresh?: boolean) => Promise<void>;
  fetchMore: () => Promise<void>;
  fetchStats: () => Promise<void>;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  respondToNotification: (notificationId: number, respuesta: string) => Promise<void>;
  respondToNotificationWithMessage: (notification: Notification, respuesta: string) => Promise<{ success: boolean; error?: string }>;
  deleteNotification: (notificationId: number) => Promise<void>;
  createNotification: (notification: Partial<Notification>) => Promise<void>;
  setFilters: (filters: Partial<NotificationFilters>) => void;
  resetFilters: () => void;
  // Toast queue management
  addToToastQueue: (notification: Notification) => void;
  removeFromToastQueue: (notificationId: number) => void;
  clearToastQueue: () => void;
  
  // Sound settings
  setSoundEnabled: (enabled: boolean) => void;
  
  // Realtime
  subscribeToNotifications: (userId: string, empresaId: number) => void;
  unsubscribeFromNotifications: () => void;
  
  // Cache management
  getTeamData: () => Promise<{ id: number; empresa_id: number } | null>;
  
  // HITL
  markHITLRespondedByContact: (contactId: number) => Promise<void>;
}

// Initial filters
const initialFilters: NotificationFilters = {
  visto: null,
  requiere_respuesta: null,
  tipo: null,
  dateRange: { from: null, to: null }
};

// Initial stats
const initialStats: NotificationStats = {
  total: 0,
  unread: 0,
  requiresResponse: 0,
  byType: {
    nueva_cita: 0,
    human_in_the_loop: 0,
    mensaje_urgente: 0,
    tarea_asignada: 0,
    recordatorio: 0,
    sistema: 0,
    tarea_mencion: 0,
    tarea_estado: 0,
    tarea_vencimiento_proximo: 0,
    tarea_vencida: 0,
    tarea_comentario: 0,
    tarea_item_completado: 0,
    proyecto_costo: 0,
    deep_research: 0
  }
};

// Selectors for performance
export const selectNotifications = (state: NotificationsState) => state.notifications;
export const selectUnreadCount = (state: NotificationsState) => state.stats.unread;
export const selectStats = (state: NotificationsState) => state.stats;
export const selectIsLoading = (state: NotificationsState) => state.isLoading;
export const selectFilters = (state: NotificationsState) => state.filters;
export const selectToastQueue = (state: NotificationsState) => state.toastQueue;
export const selectSoundEnabled = (state: NotificationsState) => state.soundEnabled;

// HITL Selectors
export const selectContactsWithPendingHITL = (state: NotificationsState): Set<number> => {
  const ids = new Set<number>();
  state.notifications.forEach(n => {
    if (isHumanInTheLoopNotification(n) && !n.respuesta && n.contacto_id) {
      ids.add(n.contacto_id);
    }
  });
  return ids;
};

export const selectPendingHITLForContact = (contactId: number | null) => (state: NotificationsState): Notification | null => {
  if (!contactId) return null;
  return state.notifications.find(
    n => isHumanInTheLoopNotification(n) && !n.respuesta && n.contacto_id === contactId
  ) || null;
};

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      stats: initialStats,
      lastFetchTime: null,
      cachedTeamData: null,
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      page: 0,
      error: null,
      filters: initialFilters,
      toastQueue: [],
      soundEnabled: typeof window !== 'undefined' ? localStorage.getItem('urpe_notification_sound') !== 'false' : true,
      realtimeChannel: null,

      fetchNotifications: async (forceRefresh = false) => {
        const { lastFetchTime, isLoading } = get();
        const now = Date.now();

        // Check cache validity
        if (!forceRefresh && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION_MS) {
          logger.debug('[Notifications] Using cached data');
          return;
        }

        // Prevent concurrent fetches
        if (isLoading) {
          logger.debug('[Notifications] Already loading, skipping fetch');
          return;
        }

        set({ isLoading: true, error: null, page: 0, hasMore: true });

        try {
          // Get current user context
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            throw new Error('Usuario no autenticado');
          }

          // Get user's team_humano_id
          const { data: teamData, error: teamError } = await supabase
            .from('wp_team_humano')
            .select('id, empresa_id')
            .eq('auth_uid', user.id)
            .maybeSingle();

          if (teamError && teamError.code !== 'PGRST116') {
            logger.error('[NotificationsStore] Error fetching team member:', teamError);
            throw teamError;
          }

          if (!teamData) {
            logger.warn('[Notifications] No se encontró el perfil del usuario para notificaciones, ignorando carga de notificaciones.');
            set({ isLoading: false });
            return;
          }

          const PAGE_SIZE = 20;

          // Build query
          let query = supabase
            .from('wp_notificaciones_team')
            .select(`
              *,
              contact:wp_contactos!wp_notificaciones_team_contacto_id_fkey(
                nombre,
                apellido,
                telefono,
                email
              )
            `)
            .eq('empresa_id', teamData.empresa_id)
            .order('fecha_envio', { ascending: false })
            .range(0, PAGE_SIZE - 1);

          // Filter by asesor_id: show notifications for this user OR broadcast (NULL)
          query = query.or(`asesor_id.eq.${teamData.id},asesor_id.is.null`);

          // Apply filters
          const { filters } = get();
          if (filters.visto !== null) {
            query = query.eq('visto', filters.visto);
          }
          if (filters.requiere_respuesta !== null) {
            query = query.eq('requiere_respuesta', filters.requiere_respuesta);
          }
          if (filters.tipo) {
            query = query.eq('tipo', filters.tipo);
          }
          if (filters.dateRange?.from) {
            query = query.gte('fecha_envio', filters.dateRange.from);
          }
          if (filters.dateRange?.to) {
            query = query.lte('fecha_envio', filters.dateRange.to);
          }

          const { data, error } = await query;

          if (error) throw error;

          set({ 
            notifications: data || [], 
            lastFetchTime: now,
            isLoading: false,
            hasMore: data ? data.length === PAGE_SIZE : false,
            page: 0
          });

          // Fetch stats after notifications
          get().fetchStats();

        } catch (error: any) {
          logger.error('[Notifications] Fetch error:', error);
          set({ 
            error: error.message || 'Error al cargar notificaciones', 
            isLoading: false 
          });
        }
      },

      fetchMore: async () => {
        const { isLoadingMore, hasMore, page, notifications } = get();
        
        if (isLoadingMore || !hasMore) return;

        set({ isLoadingMore: true });

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Usuario no autenticado');

          const { data: teamData, error: teamDataError } = await supabase
            .from('wp_team_humano')
            .select('id, empresa_id')
            .eq('auth_uid', user.id)
            .maybeSingle();

          if (teamDataError) {
            logger.error('[NotificationsStore] Error fetching team member (more):', teamDataError);
            throw teamDataError;
          }

          if (!teamData) throw new Error('No se encontró el perfil');

          const nextPage = page + 1;
          const PAGE_SIZE = 20;
          const from = nextPage * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;

          let query = supabase
            .from('wp_notificaciones_team')
            .select(`
              *,
              contact:wp_contactos!wp_notificaciones_team_contacto_id_fkey(
                nombre,
                apellido,
                telefono,
                email
              )
            `)
            .eq('empresa_id', teamData.empresa_id)
            .order('fecha_envio', { ascending: false })
            .range(from, to);

          query = query.or(`asesor_id.eq.${teamData.id},asesor_id.is.null`);

          const { filters } = get();
          if (filters.visto !== null) query = query.eq('visto', filters.visto);
          if (filters.requiere_respuesta !== null) query = query.eq('requiere_respuesta', filters.requiere_respuesta);
          if (filters.tipo) query = query.eq('tipo', filters.tipo);
          if (filters.dateRange?.from) query = query.gte('fecha_envio', filters.dateRange.from);
          if (filters.dateRange?.to) query = query.lte('fecha_envio', filters.dateRange.to);

          const { data, error } = await query;

          if (error) throw error;

          if (data && data.length > 0) {
            set({
              notifications: [...notifications, ...data],
              page: nextPage,
              hasMore: data.length === PAGE_SIZE,
              isLoadingMore: false
            });
          } else {
            set({
              hasMore: false,
              isLoadingMore: false
            });
          }
        } catch (error: any) {
          logger.error('[Notifications] Fetch more error:', error);
          set({ isLoadingMore: false, error: error.message });
        }
      },

      fetchStats: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: teamData, error: teamDataError } = await supabase
            .from('wp_team_humano')
            .select('id, empresa_id')
            .eq('auth_uid', user.id)
            .maybeSingle();

          if (teamDataError) {
            logger.error('[NotificationsStore] Error fetching team member (stats):', teamDataError);
            return;
          }

          if (!teamData) return;

          // Count total
          const { count: total } = await supabase
            .from('wp_notificaciones_team')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', teamData.empresa_id)
            .or(`asesor_id.eq.${teamData.id},asesor_id.is.null`);

          // Count unread
          const { count: unread } = await supabase
            .from('wp_notificaciones_team')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', teamData.empresa_id)
            .eq('visto', false)
            .or(`asesor_id.eq.${teamData.id},asesor_id.is.null`);

          // Count requires response
          const { count: requiresResponse } = await supabase
            .from('wp_notificaciones_team')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', teamData.empresa_id)
            .eq('requiere_respuesta', true)
            .eq('visto', false)
            .or(`asesor_id.eq.${teamData.id},asesor_id.is.null`);

          set({
            stats: {
              total: total || 0,
              unread: unread || 0,
              requiresResponse: requiresResponse || 0,
              byType: initialStats.byType // TODO: Implement type counts if needed
            }
          });

        } catch (error) {
          logger.error('[Notifications] Stats fetch error:', error);
        }
      },

      markAsRead: async (notificationId: number) => {
        try {
          const { error } = await supabase
            .from('wp_notificaciones_team')
            .update({ 
              visto: true,
              estado: 'leida'
            })
            .eq('id', notificationId);

          if (error) throw error;

          // Update local state
          set((state) => {
            const targetNotification = state.notifications.find(n => n.id === notificationId);
            if (!targetNotification || targetNotification.visto) {
              return state;
            }

            const nextRequiresResponse = targetNotification.requiere_respuesta
              ? Math.max(0, state.stats.requiresResponse - 1)
              : state.stats.requiresResponse;

            return {
              notifications: state.notifications.map(n =>
                n.id === notificationId ? { ...n, visto: true, estado: 'leida' as NotificationStatus } : n
              ),
              stats: {
                ...state.stats,
                unread: Math.max(0, state.stats.unread - 1),
                requiresResponse: nextRequiresResponse
              }
            };
          });

          // Refresh stats
          get().fetchStats();

        } catch (error: any) {
          logger.error('[Notifications] Mark as read error:', error);
          set({ error: error.message });
        }
      },

      markAllAsRead: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: teamData, error: teamDataError } = await supabase
            .from('wp_team_humano')
            .select('id, empresa_id')
            .eq('auth_uid', user.id)
            .maybeSingle();

          if (teamDataError) {
            logger.error('[NotificationsStore] Error fetching team member (markAll):', teamDataError);
            return;
          }

          if (!teamData) return;

          const { error } = await supabase
            .from('wp_notificaciones_team')
            .update({ 
              visto: true,
              estado: 'leida'
            })
            .eq('empresa_id', teamData.empresa_id)
            .eq('visto', false)
            .or(`asesor_id.eq.${teamData.id},asesor_id.is.null`);

          if (error) throw error;

          // Update local state
          set((state) => {
            const unreadToMark = state.notifications.filter(n => !n.visto).length;
            const requiresResponseToMark = state.notifications.filter(
              n => !n.visto && n.requiere_respuesta
            ).length;

            if (unreadToMark === 0) {
              return state;
            }

            return {
              notifications: state.notifications.map(n => ({ ...n, visto: true, estado: 'leida' as NotificationStatus })),
              stats: {
                ...state.stats,
                unread: Math.max(0, state.stats.unread - unreadToMark),
                requiresResponse: Math.max(0, state.stats.requiresResponse - requiresResponseToMark)
              }
            };
          });

          // Refresh stats
          get().fetchStats();

        } catch (error: any) {
          logger.error('[Notifications] Mark all as read error:', error);
          set({ error: error.message });
        }
      },

      respondToNotification: async (notificationId: number, respuesta: string) => {
        try {
          const { error } = await supabase
            .from('wp_notificaciones_team')
            .update({ 
              respuesta,
              fecha_respuesta: new Date().toISOString(),
              visto: true,
              estado: 'respondida'
            })
            .eq('id', notificationId);

          if (error) throw error;

          // Update local state
          set((state) => ({
            notifications: state.notifications.map(n =>
              n.id === notificationId 
                ? { 
                    ...n, 
                    respuesta, 
                    fecha_respuesta: new Date().toISOString(),
                    visto: true,
                    estado: 'respondida' as NotificationStatus
                  } 
                : n
            )
          }));

          // Refresh stats
          get().fetchStats();

        } catch (error: any) {
          logger.error('[Notifications] Respond error:', error);
          set({ error: error.message });
        }
      },

      // HITL: Respond to notification AND send message via webhook + save to DB
      respondToNotificationWithMessage: async (notification: Notification, respuesta: string) => {
        try {
          // Get user context
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            return { success: false, error: 'Usuario no autenticado' };
          }

          const { data: teamData, error: teamError } = await supabase
            .from('wp_team_humano')
            .select('id, empresa_id, nombre, apellido')
            .eq('auth_uid', user.id)
            .maybeSingle();

          if (teamError || !teamData) {
            return { success: false, error: 'No se encontró el perfil del usuario' };
          }

          // Get full contact data for webhook
          const { data: contactData, error: contactError } = await supabase
            .from('wp_contactos')
            .select('*')
            .eq('id', notification.contacto_id)
            .maybeSingle();

          if (contactError || !contactData) {
            return { success: false, error: 'No se encontró el contacto' };
          }

          const contactId = notification.contacto_id;
          if (!contactId) {
            return { success: false, error: 'La notificación no tiene contacto asociado' };
          }

          // Get or create conversation for this contact
          let conversacionId: number | null = null;
          
          // Check metadata for existing conversation
          if (notification.metadata?.conversacion_id) {
            conversacionId = notification.metadata.conversacion_id;
          } else {
            // Find most recent active conversation
            const { data: convData } = await supabase
              .from('wp_conversaciones')
              .select('id')
              .eq('contacto_id', notification.contacto_id)
              .eq('empresa_id', teamData.empresa_id)
              .order('fecha_inicio', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (convData) {
              conversacionId = convData.id;
            }
          }

          if (!conversacionId) {
            return { success: false, error: 'No se encontró una conversación activa para este contacto' };
          }

          const messageResult = await sendDirectMessageRecord({
            conversationId: conversacionId,
            contactId,
            content: respuesta,
            enterpriseId: teamData.empresa_id,
            userContext: teamData,
            contact: contactData,
            originNotificationId: notification.id,
          });

          if (!messageResult.success || !messageResult.data) {
            return { success: false, error: messageResult.error || 'Error al enviar el mensaje' };
          }

          const messageData = messageResult.data;

          const { error: updateError } = await supabase
            .from('wp_notificaciones_team')
            .update({ 
              respuesta: respuesta.trim(),
              fecha_respuesta: new Date().toISOString(),
              visto: true,
              estado: 'respondida'
            })
            .eq('id', notification.id);

          if (updateError) {
            logger.error('[Notifications] Error updating notification:', updateError);
            // Message was sent, but notification update failed - not critical
          }

          // Update local state
          set((state) => ({
            notifications: state.notifications.map(n =>
              n.id === notification.id 
                ? { 
                    ...n, 
                    respuesta: respuesta.trim(), 
                    fecha_respuesta: new Date().toISOString(),
                    visto: true,
                    estado: 'respondida' as NotificationStatus
                  } 
                : n
            )
          }));

          // Refresh stats
          get().fetchStats();

          logger.info('[Notifications] HITL response sent successfully', { 
            notificationId: notification.id, 
            messageId: messageData.id 
          });

          return { success: true };

        } catch (error: any) {
          logger.error('[Notifications] respondToNotificationWithMessage error:', error);
          return { success: false, error: error.message };
        }
      },

      deleteNotification: async (notificationId: number) => {
        try {
          const { error } = await supabase
            .from('wp_notificaciones_team')
            .delete()
            .eq('id', notificationId);

          if (error) throw error;

          // Update local state
          set((state) => ({
            notifications: state.notifications.filter(n => n.id !== notificationId)
          }));

          // Refresh stats
          get().fetchStats();

        } catch (error: any) {
          logger.error('[Notifications] Delete error:', error);
          set({ error: error.message });
        }
      },

      createNotification: async (notification: Partial<Notification>) => {
        try {
          // Defaults
          const payload = {
            ...notification,
            fecha_envio: notification.fecha_envio || new Date().toISOString(),
            visto: false,
            estado: 'pendiente',
            requiere_respuesta: notification.requiere_respuesta || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const { error } = await supabase
            .from('wp_notificaciones_team')
            .insert(payload);

          if (error) throw error;

          // No need to update local state as realtime subscription or next fetch will handle it
          // But we can optimistically add it if we want immediate feedback for the sender (though usually sender != receiver)
          
        } catch (error: any) {
           logger.error('[Notifications] Create error:', error);
           throw error; // Re-throw so caller knows it failed
        }
      },

      setFilters: (newFilters: Partial<NotificationFilters>) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters }
        }));
        // Trigger fetch with new filters
        get().fetchNotifications(true);
      },

      resetFilters: () => {
        set({ filters: initialFilters });
        get().fetchNotifications(true);
      },

      // Toast queue management
      addToToastQueue: (notification: Notification) => {
        const { toastQueue, soundEnabled } = get();
        
        // Don't add duplicates
        if (toastQueue.some(n => n.id === notification.id)) return;
        
        // Add to queue, keep max size
        const newQueue = [notification, ...toastQueue].slice(0, MAX_TOAST_QUEUE);
        set({ toastQueue: newQueue });
        
        // Play sound based on notification type
        if (soundEnabled) {
          notificationSound.playForNotificationType(notification.tipo);
        }
      },

      removeFromToastQueue: (notificationId: number) => {
        set((state) => ({
          toastQueue: state.toastQueue.filter(n => n.id !== notificationId)
        }));
      },

      clearToastQueue: () => {
        set({ toastQueue: [] });
      },

      // Sound settings
      setSoundEnabled: (enabled: boolean) => {
        set({ soundEnabled: enabled });
        notificationSound.setEnabled(enabled);
      },

      // Cache management - get team data with caching
      getTeamData: async () => {
        const { cachedTeamData } = get();
        if (cachedTeamData) return cachedTeamData;

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return null;

          const { data: teamData, error } = await supabase
            .from('wp_team_humano')
            .select('id, empresa_id')
            .eq('auth_uid', user.id)
            .maybeSingle();

          if (error || !teamData) return null;

          set({ cachedTeamData: teamData });
          return teamData;
        } catch (e) {
          logger.error('[NotificationsStore] Error getting team data:', e);
          return null;
        }
      },

      subscribeToNotifications: (userId: string, empresaId: number) => {
        const { realtimeChannel } = get();
        
        // Unsubscribe from existing channel
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
        }

        // Subscribe to new notifications
        const channel = supabase
          .channel('notifications-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wp_notificaciones_team',
              filter: `empresa_id=eq.${empresaId}`
            },
            (payload) => {
              logger.debug('[Notifications] Realtime event:', payload);
              
              // If INSERT, add to toast queue (with asesor_id filtering)
              if (payload.eventType === 'INSERT') {
                const newNotification = payload.new as Notification;
                const { cachedTeamData } = get();
                
                // Filter: Only show if it's for this user (asesor_id matches) or broadcast (asesor_id is null)
                const isForMe = !newNotification.asesor_id || 
                  (cachedTeamData && newNotification.asesor_id === cachedTeamData.id);
                
                if (isForMe) {
                  get().addToToastQueue(newNotification);
                  logger.debug('[Notifications] Toast added for notification:', newNotification.id);
                } else {
                  logger.debug('[Notifications] Skipping toast - not for this user:', newNotification.asesor_id);
                }
              }

              // Refresh notifications on any change
              get().fetchNotifications(true);
            }
          )
          .subscribe();

        set({ realtimeChannel: channel });
        logger.debug('[Notifications] Subscribed to realtime updates');
      },

      unsubscribeFromNotifications: () => {
        const { realtimeChannel } = get();
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
          set({ realtimeChannel: null });
          logger.debug('[Notifications] Unsubscribed from realtime updates');
        }
      },

      // HITL: Mark ALL pending HITL notifications as responded when user replies from chat
      // Query directa a DB para no depender del store paginado (que solo tiene ~20 items)
      markHITLRespondedByContact: async (contactId: number) => {
        try {
          // Buscar TODAS las HITL pendientes del contacto directamente en DB
          const { data: pendingHitl, error: fetchError } = await supabase
            .from('wp_notificaciones_team')
            .select('id')
            .eq('contacto_id', contactId)
            .eq('tipo', 'human_in_the_loop')
            .is('respuesta', null)
            .limit(50);

          if (fetchError) {
            logger.error('[Notifications] markHITLRespondedByContact fetch error:', fetchError);
            return;
          }

          if (!pendingHitl || pendingHitl.length === 0) return;

          const hitlIds = pendingHitl.map(n => n.id);
          const now = new Date().toISOString();

          const { error } = await supabase
            .from('wp_notificaciones_team')
            .update({
              respuesta: '(Respondido desde chat)',
              fecha_respuesta: now,
              visto: true,
              estado: 'respondida'
            })
            .in('id', hitlIds);

          if (error) {
            logger.error('[Notifications] markHITLRespondedByContact update error:', error);
            return;
          }

          // Update local state for any matching notifications in store
          const hitlIdSet = new Set(hitlIds);
          set((state) => ({
            notifications: state.notifications.map(n =>
              hitlIdSet.has(n.id)
                ? { ...n, respuesta: '(Respondido desde chat)', fecha_respuesta: now, visto: true, estado: 'respondida' as NotificationStatus }
                : n
            )
          }));

          get().fetchStats();
          logger.info(`[Notifications] ${hitlIds.length} HITL marked as responded from chat for contact:`, contactId);
        } catch (error: any) {
          logger.error('[Notifications] markHITLRespondedByContact error:', error);
        }
      }
    }),
    {
      name: 'urpe-notifications-store',
      partialize: (state) => ({
        filters: state.filters
      })
    }
  )
);
