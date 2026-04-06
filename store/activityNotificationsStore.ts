import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import {
  Notification,
  isHumanInTheLoopNotification,
  normalizeNotificationStatus,
} from '../types/notification';

export type ActivityTab = 'all' | 'pending' | 'requires_response' | 'responded' | 'archived';

export interface ActivityMetrics {
  pending: number;
  requiresResponse: number;
  unread: number;
  respondedToday: number;
  avgResponseMinutes: number;
  hitlActive: number;
}

export interface ActivityQueryParams {
  enterpriseId: number;
  advisorIds?: number[];
  includeArchived?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  tipo?: string;
}

export interface ActivityFilterParams {
  tab: ActivityTab;
  search: string;
  onlyUnread?: boolean;
  onlyHitl?: boolean;
}

interface TeamContext {
  id: number;
  empresa_id: number;
  role_id: number | null;
}

interface ActivityNotificationsState {
  notifications: Notification[];
  metrics: ActivityMetrics;
  isLoading: boolean;
  error: string | null;
  fetchActivityNotifications: (params: ActivityQueryParams) => Promise<void>;
  archiveNotification: (notificationId: number) => Promise<void>;
  unarchiveNotification: (notificationId: number) => Promise<void>;
  clear: () => void;
}

const initialMetrics: ActivityMetrics = {
  pending: 0,
  requiresResponse: 0,
  unread: 0,
  respondedToday: 0,
  avgResponseMinutes: 0,
  hitlActive: 0,
};

const hasResponse = (notification: Notification): boolean => {
  return Boolean(notification.respuesta && notification.respuesta.trim());
};

export const isNotificationResponded = (notification: Notification): boolean => {
  const estado = normalizeNotificationStatus(notification.estado);
  return estado.includes('respondid') || hasResponse(notification);
};

export const isNotificationPending = (notification: Notification): boolean => {
  return !isNotificationResponded(notification) && normalizeNotificationStatus(notification.estado) !== 'archivada';
};

export const deriveActivityMetrics = (notifications: Notification[]): ActivityMetrics => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const responded = notifications.filter(isNotificationResponded);
  const respondedToday = responded.filter(notification => {
    if (!notification.fecha_respuesta) return false;
    const responseDate = new Date(notification.fecha_respuesta);
    return responseDate >= today;
  }).length;

  const responseTimes = responded
    .filter(notification => notification.fecha_envio && notification.fecha_respuesta)
    .map(notification => {
      const sentAt = new Date(notification.fecha_envio).getTime();
      const respondedAt = new Date(notification.fecha_respuesta as string).getTime();
      return Math.max(0, Math.round((respondedAt - sentAt) / 60000));
    })
    .filter(value => Number.isFinite(value));

  const avgResponseMinutes = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((acc, value) => acc + value, 0) / responseTimes.length)
    : 0;

  return {
    pending: notifications.filter(isNotificationPending).length,
    requiresResponse: notifications.filter(notification => notification.requiere_respuesta && !hasResponse(notification)).length,
    unread: notifications.filter(notification => !notification.visto).length,
    respondedToday,
    avgResponseMinutes,
    hitlActive: notifications.filter(notification => isHumanInTheLoopNotification(notification) && !hasResponse(notification)).length,
  };
};

export const filterActivityNotifications = (
  notifications: Notification[],
  filters: ActivityFilterParams,
): Notification[] => {
  const search = filters.search.trim().toLowerCase();

  return notifications.filter(notification => {
    if (filters.tab === 'pending' && !isNotificationPending(notification)) return false;
    if (filters.tab === 'requires_response' && (!notification.requiere_respuesta || hasResponse(notification))) return false;
    if (filters.tab === 'responded' && !isNotificationResponded(notification)) return false;
    if (filters.tab === 'archived' && !notification.archivado) return false;
    if (filters.tab !== 'archived' && notification.archivado) return false;
    if (filters.onlyUnread && notification.visto) return false;
    if (filters.onlyHitl && !isHumanInTheLoopNotification(notification)) return false;

    if (!search) return true;

    const haystack = [
      notification.tipo,
      notification.mensaje,
      notification.origen,
      notification.contact?.nombre,
      notification.contact?.apellido,
      notification.contact?.telefono,
      notification.contact?.email,
      notification.advisor?.nombre,
      notification.advisor?.apellido,
      notification.agent?.nombre_agente,
      notification.respuesta,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });
};

const getCurrentTeamContext = async (): Promise<TeamContext | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('wp_team_humano')
    .select('id, empresa_id, role_id')
    .eq('auth_uid', user.id)
    .maybeSingle();

  if (error || !data) {
    logger.error('[ActivityNotificationsStore] Error fetching team context:', error);
    return null;
  }

  return data;
};

export const useActivityNotificationsStore = create<ActivityNotificationsState>((set) => ({
  notifications: [],
  metrics: initialMetrics,
  isLoading: false,
  error: null,

  fetchActivityNotifications: async (params) => {
    set({ isLoading: true, error: null });

    try {
      const teamContext = await getCurrentTeamContext();
      if (!teamContext) {
        throw new Error('No se encontró el perfil del usuario');
      }

      let query = supabase
        .from('wp_notificaciones_team')
        .select(`
          *,
          contact:wp_contactos!wp_notificaciones_team_contacto_id_fkey(id, nombre, apellido, telefono, email, origen, ultima_interaccion),
          advisor:wp_team_humano!wp_notificaciones_team_asesor_id_fkey(id, nombre, apellido, email, role_id)
        `)
        .eq('empresa_id', params.enterpriseId)
        .order('fecha_envio', { ascending: false })
        .limit(params.limit || 200);

      if (params.tipo) {
        query = query.eq('tipo', params.tipo);
      }

      if (params.includeArchived) {
        query = query.eq('archivado', true);
      } else {
        query = query.not('archivado', 'is', true);
      }

      if (params.dateFrom) {
        query = query.gte('fecha_envio', params.dateFrom);
      }

      if (params.dateTo) {
        query = query.lte('fecha_envio', params.dateTo);
      }

      if (teamContext.role_id === 3) {
        query = query.or(`asesor_id.eq.${teamContext.id},asesor_id.is.null`);
      } else if (params.advisorIds && params.advisorIds.length > 0) {
        query = query.in('asesor_id', params.advisorIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const notifications = ((data || []) as Notification[]).map(notification => ({
        ...notification,
        agent: notification.agent || (notification.metadata?.agente_nombre
          ? {
              nombre_agente: notification.metadata.agente_nombre,
              id: notification.agente_id || undefined,
            }
          : null),
      }));
      set({
        notifications,
        metrics: deriveActivityMetrics(notifications),
        isLoading: false,
      });
    } catch (error: any) {
      logger.error('[ActivityNotificationsStore] Fetch error:', error);
      set({
        isLoading: false,
        error: error?.message || 'Error al cargar la actividad',
      });
    }
  },

  archiveNotification: async (notificationId) => {
    const { error } = await supabase
      .from('wp_notificaciones_team')
      .update({ archivado: true, updated_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      logger.error('[ActivityNotificationsStore] Archive error:', error);
      throw error;
    }

    set((state) => {
      const notifications = state.notifications.map(notification =>
        notification.id === notificationId
          ? { ...notification, archivado: true }
          : notification
      );

      return {
        notifications,
        metrics: deriveActivityMetrics(notifications),
      };
    });
  },

  unarchiveNotification: async (notificationId) => {
    const { error } = await supabase
      .from('wp_notificaciones_team')
      .update({ archivado: false, updated_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      logger.error('[ActivityNotificationsStore] Unarchive error:', error);
      throw error;
    }

    set((state) => {
      const notifications = state.notifications.map(notification =>
        notification.id === notificationId
          ? { ...notification, archivado: false }
          : notification
      );

      return {
        notifications,
        metrics: deriveActivityMetrics(notifications),
      };
    });
  },

  clear: () => set({ notifications: [], metrics: initialMetrics, isLoading: false, error: null }),
}));
