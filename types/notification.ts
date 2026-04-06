// Notification types based on wp_notificaciones_team schema

export type KnownNotificationType = 
  | 'nueva_cita' 
  | 'human_in_the_loop'
  | 'mensaje_urgente'
  | 'tarea_asignada'
  | 'recordatorio'
  | 'sistema'
  | 'tarea_mencion'
  | 'tarea_estado'
  | 'tarea_vencimiento_proximo'
  | 'tarea_vencida'
  | 'tarea_comentario'
  | 'tarea_item_completado'
  | 'proyecto_costo'
  | 'deep_research';

export type NotificationType = KnownNotificationType | (string & {});

export type NotificationStatus = 
  | 'pendiente' 
  | 'leida' 
  | 'respondida' 
  | 'archivada'
  | 'Respondido'
  | (string & {});

export interface Notification {
  id: number;
  tipo: NotificationType;
  contacto_id: number | null;
  mensaje: string;
  fecha_envio: string;
  estado: NotificationStatus;
  created_at: string;
  updated_at: string;
  respuesta?: string | null;
  fecha_respuesta?: string | null;
  empresa_id?: number | null;
  asesor_id?: number | null; // NULL = broadcast to all team members
  agente_id?: number | null;
  origen?: string | null;
  requiere_respuesta: boolean;
  visto: boolean;
  metadata?: Record<string, any> | null;
  archivado?: boolean | null;
  
  // Joined contact data (optional)
  contact?: {
    id?: number;
    nombre?: string | null;
    apellido?: string | null;
    telefono?: string | null;
    email?: string | null;
    origen?: string | null;
    ultima_interaccion?: string | null;
  } | null;

  advisor?: {
    id?: number;
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    role_id?: number | null;
  } | null;

  agent?: {
    id?: number;
    nombre_agente?: string | null;
  } | null;
}

export interface NotificationFilters {
  visto?: boolean | null;
  requiere_respuesta?: boolean | null;
  tipo?: NotificationType | null;
  dateRange?: {
    from: string | null;
    to: string | null;
  };
}

export interface NotificationStats {
  total: number;
  unread: number;
  requiresResponse: number;
  byType: Record<string, number>;
}

// Helper functions
export const normalizeNotificationStatus = (estado?: string | null): string => {
  return (estado || 'pendiente').toString().trim().toLowerCase();
};

export const isHumanInTheLoopNotification = (
  notification?: Pick<Notification, 'tipo' | 'origen' | 'metadata' | 'requiere_respuesta'> | null
): boolean => {
  if (!notification) return false;

  const tipo = (notification.tipo || '').toString().trim().toLowerCase();
  const origen = (notification.origen || '').toString().trim().toLowerCase();
  const metadataSource = (notification.metadata?.source || notification.metadata?.origin || '')
    .toString()
    .trim()
    .toLowerCase();

  return (
    tipo === 'human_in_the_loop' ||
    origen.includes('human in the loop') ||
    origen.includes('human_in_the_loop') ||
    metadataSource.includes('human in the loop') ||
    metadataSource.includes('human_in_the_loop')
  );
};

export const getNotificationTypeLabel = (tipo: NotificationType): string => {
  const labels: Record<KnownNotificationType, string> = {
    nueva_cita: 'Nueva Cita',
    human_in_the_loop: 'Intervención Requerida',
    mensaje_urgente: 'Mensaje Urgente',
    tarea_asignada: 'Tarea Asignada',
    recordatorio: 'Recordatorio',
    sistema: 'Sistema',
    tarea_mencion: 'Mención en Tarea',
    tarea_estado: 'Cambio de Estado',
    tarea_vencimiento_proximo: 'Vence Pronto',
    tarea_vencida: 'Tarea Vencida',
    tarea_comentario: 'Nuevo Comentario',
    tarea_item_completado: 'Item Completado',
    proyecto_costo: 'Costo Registrado',
    deep_research: 'Deep Research'
  };

  if (tipo in labels) {
    return labels[tipo as KnownNotificationType];
  }

  return String(tipo || 'Sin tipo');
};

export const getNotificationTypeColor = (tipo: NotificationType): string => {
  const colors: Record<KnownNotificationType, string> = {
    nueva_cita: 'text-blue-400',
    human_in_the_loop: 'text-amber-400',
    mensaje_urgente: 'text-red-400',
    tarea_asignada: 'text-purple-400',
    recordatorio: 'text-cyan-400',
    sistema: 'text-zinc-400',
    tarea_mencion: 'text-pink-400',
    tarea_estado: 'text-blue-400',
    tarea_vencimiento_proximo: 'text-amber-400',
    tarea_vencida: 'text-rose-400',
    tarea_comentario: 'text-indigo-400',
    tarea_item_completado: 'text-emerald-400',
    proyecto_costo: 'text-emerald-400',
    deep_research: 'text-violet-400'
  };

  if (tipo in colors) {
    return colors[tipo as KnownNotificationType];
  }

  return 'text-zinc-400';
};

export const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
};

export const formatContactName = (contact?: Notification['contact']): string => {
  if (!contact) return 'Contacto desconocido';
  const nombre = contact.nombre || '';
  const apellido = contact.apellido || '';
  return `${nombre} ${apellido}`.trim() || contact.telefono || contact.email || 'Sin nombre';
};

export const formatAdvisorName = (advisor?: Notification['advisor']): string => {
  if (!advisor) return 'Sin asesor';
  const nombre = advisor.nombre || '';
  const apellido = advisor.apellido || '';
  return `${nombre} ${apellido}`.trim() || advisor.email || 'Sin asesor';
};
