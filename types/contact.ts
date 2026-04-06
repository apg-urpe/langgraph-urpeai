/**
 * Contact Types - Tipos del sistema CRM de contactos
 * 
 * Define las interfaces para Contactos, Conversaciones, Mensajes, Citas y Multimedia
 * basadas en el schema de WordPress + Supabase.
 * 
 * ## Tablas Principales (WordPress)
 * 
 * | Tabla | Entidad | Descripción |
 * |-------|---------|-------------|
 * | wp_contactos | Contact | Personas/Clientes del CRM |
 * | wp_conversaciones | Conversation | Hilos de conversación |
 * | wp_conversacion_mensajes | ConversationMessage | Mensajes individuales |
 * | wp_citas | Appointment | Citas y reuniones |
 * | wp_multimedia | Multimedia | Archivos adjuntos |
 * 
 * ## Campos Flexibles
 * 
 * La mayoría de entidades tienen campos `metadata: Record<string, any>` para
 * extensibilidad sin modificar el schema.
 * 
 * @module types/contact
 */

// Contact types based on wp_contactos schema
// Flexible: missing columns are handled gracefully

export interface Contact {
  id: number;
  nombre?: string | null;
  apellido?: string | null;
  telefono?: string | null;
  email?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  estado?: string | null;
  es_calificado?: string | null;
  notas?: string | null;
  empresa_id?: number | null;
  team_humano_id?: number | null;
  metadata?: Record<string, unknown> | null;
  origen?: string | null;
  ultima_interaccion?: string | null;
  is_active?: boolean | null;
  paused_until?: string | null; // ISO timestamp - if set and future, contact is temporarily paused
  etapa_embudo?: number | null;
  etapa_emocional?: string | null;
  url_drive?: string | null;
  // Columns we explicitly don't use:
  // avatar_url, subscriber_id, link_stripe, informe_gamma, timezone, suscripcion
}

export interface Conversation {
  id: number;
  agente_id?: number | null;
  contacto_id: number;
  fecha_inicio: string;
  canal: string;
  resumen?: string | null;
  estado?: string | null;
  created_at: string;
  metadata?: Record<string, any> | null;
  contact?: Contact | null;
}

export interface ConversationMessage {
  id: number;
  conversacion_id: number;
  // Content fields (various possibilities)
  cuerpo?: string | any; 
  mensaje?: string | any;
  contenido?: string | any;
  content?: string | any;
  text?: string | any;
  texto?: string | any;
  payload?: string | any;
  body?: string | any;
  
  // Roles
  remitente: 'cliente' | 'agente' | 'sistema' | 'asistente' | 'user' | 'assistant' | 'model' | 'humano';
  
  tipo: 'texto' | 'imagen' | 'audio' | 'video' | 'archivo' | 'plantilla' | 'documento' | 'multimedia';
  url_archivo?: string | null;
  estado?: 'enviado' | 'entregado' | 'leido' | 'fallido';
  created_at: string;
  metadata?: Record<string, any> | null;
}

export interface AppointmentParticipant {
  id: number;
  team_humano_id: number;
  rol: 'organizador' | 'equipo' | 'invitado' | 'opcional' | string;
  estado_rsvp?: string | null;
  email?: string | null;
}

export interface Appointment {
  id: number | string;
  contacto_id?: number | null;
  empresa_id?: number | null;
  fecha_hora?: string | null;
  duracion?: number | null;
  titulo?: string | null;
  ubicacion?: string | null; // meet link
  estado?: 'pendiente' | 'cancelada' | 'confirmada' | 'realizada' | 'reagendada' | 'no_asistio' | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  event_id?: string | null;
  ultima_sincronizacion?: string | null;
  team_humano_id?: number | null;
  timezone_cliente?: string | null;
  duracion_buffer?: number | null;
  preguntas_calendario?: Record<string, any> | null;
  descripcion?: string | null;
  sincronizacion?: string | null;
  metadata?: Record<string, any> | null;
  cuestionario_asesor?: Record<string, any> | null;
  evaluacion_asesor?: Record<string, any> | null;
  notificaciones?: Record<string, any> | null;
  resumen_conversacion?: string | null;
  // Joined contact data
  contact?: {
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    telefono?: string | null;
  } | null;
  // Participants (from wp_citas_participantes)
  participantes?: AppointmentParticipant[];
  // Internal flags for expanded participant views (not persisted)
  _isParticipantView?: boolean;
  _originalTeamHumanoId?: number | null;
  _participantRole?: string | null;
}

// Multimedia types based on wp_multimedia schema
export type MultimediaTipo = 'imagen' | 'audio' | 'video' | 'documento';

export interface Multimedia {
  id: number;
  archivo_url: string;
  tipo: MultimediaTipo;
  nombre_archivo?: string | null;
  tamaño?: number | null;
  created_at: string;
  updated_at?: string | null;
  seccion?: string | null;
  // New fields from updated schema
  metadata?: Record<string, unknown> | null;
  hash?: string | null;
  contenido?: Record<string, unknown> | null;
  url_carpeta?: string | null;
  estado?: string | null;
  empresa_id?: number | null;
  contacto_id?: number | null;
}

// Helper constants for multimedia
export const MULTIMEDIA_TIPO_LABELS: Record<MultimediaTipo, string> = {
  imagen: 'Imagen',
  audio: 'Audio',
  video: 'Video',
  documento: 'Documento'
};

export const MULTIMEDIA_TIPO_ICONS: Record<MultimediaTipo, string> = {
  imagen: 'Image',
  audio: 'Music',
  video: 'Video',
  documento: 'FileText'
};

export interface ContactNote {
  id: number;
  descripcion?: string | null;
  titulo?: string | null; // V2
  etiquetas?: string[] | null; // V2
  es_fijado?: boolean | null; // V2
  archivos_urls?: string[] | null; // V2 - URLs de archivos adjuntos
  visible_ia?: boolean | null; // V4 - Si es visible para el agente IA (default: true)
  created_at: string;
  contacto_id?: number | null;
  create_by?: number | null;
  team_humano_id?: number | null;
  author?: {
    nombre: string;
    apellido: string;
  } | null;
}

export interface Transcripcion {
  id: number;
  created_at: string;
  grant_id?: string | null;
  transcripcion?: string | null;
  notetaker_id?: string | null;
  duracion?: number | null;
  resumen?: string | null;
  cita_id?: number | null;
  resumen_cita?: string | null;
  reunion_id?: string | null;
  video_url?: string | null;
  video_cached_at?: string | null;
  // Joined appointment data
  cita?: {
    id: number;
    titulo?: string | null;
    fecha_hora?: string | null;
  } | null;
}

export interface FunnelStatus {
  id: number;
  contacto_id: number;
  etapa_actual: number;
  etapa_anterior?: number | null;
  notas?: string | null;
  fecha_ultimo_cambio: string;
  origen_cambio?: string | null;
}

export interface FunnelStage {
  id: number;
  nombre_etapa: string;
  orden_etapa: number;
  descripcion?: FunnelStageDescripcion | null;
  empresa_id: number;
  configuracion_seguimiento?: FunnelSeguimientoConfig | null;
}

export interface CreateFunnelStagePayload {
  nombre_etapa: string;
  orden_etapa: number;
  empresa_id: number;
  descripcion?: FunnelStageDescripcion | null;
  configuracion_seguimiento?: FunnelSeguimientoConfig | null;
}

export interface UpdateFunnelStagePayload {
  nombre_etapa?: string;
  orden_etapa?: number;
  descripcion?: FunnelStageDescripcion | null;
  configuracion_seguimiento?: FunnelSeguimientoConfig | null;
  empresa_id?: number;
}

// Funnel Stage Description structure
export interface FunnelStageDescripcion {
  color?: string;
  icono?: string;
  que_es?: string;
  nota_importante?: string;
  instrucciones_agente?: string;
  acciones_agente?: string[];
  criterios_avance?: string[];
}

// Funnel Stage Follow-up configuration
export interface FunnelSeguimientoStep {
  numero: number;
  horas_espera: number;
  mensaje_template: string;
}

export interface FunnelSeguimientoHorario {
  inicio: string;
  fin: string;
  dias_permitidos: number[];
}

export interface FunnelSeguimientoConfig {
  activo: boolean;
  horario?: FunnelSeguimientoHorario;
  seguimientos?: FunnelSeguimientoStep[];
  frecuencia_horas?: number;
  max_intentos?: number;
  mensaje_plantilla?: string;
  acciones_automaticas?: {
    tipo: string;
    configuracion?: Record<string, any>;
  }[];
}

// Default values for new funnel stages
export const DEFAULT_STAGE_DESCRIPCION: FunnelStageDescripcion = {
  color: '#6366f1',
  icono: '',
  que_es: '',
  nota_importante: '',
  instrucciones_agente: '',
  acciones_agente: [],
  criterios_avance: []
};

export const DEFAULT_SEGUIMIENTO_CONFIG: FunnelSeguimientoConfig = {
  activo: false,
  horario: { inicio: '08:00', fin: '20:00', dias_permitidos: [1, 2, 3, 4, 5] },
  seguimientos: [],
  frecuencia_horas: 24,
  max_intentos: 3,
  mensaje_plantilla: '',
  acciones_automaticas: []
};

// Display-ready contact data
export interface ContactDisplayData {
  id: number;
  nombreCompleto: string;
  telefono: string;
  email: string;
  estado: string;
  calificacion: string;
  origen: string;
  fechaCreacion: string;
  ultimoContacto: string;
  asesorId: number | null;
  tags: string[];
  isPaused: boolean;
  isDeactivated: boolean;
  matchSource?: string;
  matchPreview?: string;
  etapaEmbudoId: number | null;
  etapaEmocional: string | null;
}

// Search scope options for super search
export type SearchScope = 'basic' | 'messages' | 'metadata' | 'all';

// Search result with match info
export interface ContactSearchResult extends Contact {
  matchSource?: 'contact' | 'message' | 'metadata' | 'conversation';
  matchPreview?: string;
  matchField?: string;
}

// Contact sorting options
export type ContactSortOption = 
  | 'leadScore'           // Highest lead score first (default)
  | 'activity'            // Most recently active
  | 'createdNewest'       // Newest contacts first
  | 'createdOldest'       // Oldest contacts first
  | 'portfolioPriority';  // Collection priority (mora, commitment, balance)

export interface ContactSortConfig {
  option: ContactSortOption;
  direction: 'asc' | 'desc';
  label: string;
  description: string;
  icon?: string;
}

// Predefined sorting configurations
export const SORT_OPTIONS: ContactSortConfig[] = [
  {
    option: 'leadScore',
    direction: 'desc',
    label: 'Lead Score',
    description: 'Mayor puntuación de lead primero',
    icon: '🎯'
  },
  {
    option: 'activity',
    direction: 'desc',
    label: 'Actividad',
    description: 'Más activos recientemente',
    icon: '⚡'
  },
  {
    option: 'createdNewest',
    direction: 'desc',
    label: 'Más nuevos',
    description: 'Contactos más recientes primero',
    icon: '🆕'
  },
  {
    option: 'createdOldest',
    direction: 'asc',
    label: 'Más antiguos',
    description: 'Contactos más antiguos primero',
    icon: '📅'
  }
];

// Sort options specifically for the Portfolio (Cartera) view
export const PORTFOLIO_SORT_OPTIONS: ContactSortConfig[] = [
  {
    option: 'portfolioPriority',
    direction: 'desc',
    label: 'Prioridad cobranza',
    description: 'Mayor urgencia de cobranza primero',
    icon: '🔴'
  },
  {
    option: 'createdNewest',
    direction: 'desc',
    label: 'Más nuevos',
    description: 'Contactos más recientes primero',
    icon: '�'
  },
  {
    option: 'createdOldest',
    direction: 'asc',
    label: 'Más antiguos',
    description: 'Contactos más antiguos primero',
    icon: '📅'
  }
];

// Enhanced filter options for contacts list
export interface ContactFilters {
  search: string;
  searchScope: SearchScope;
  estado: string | null;
  calificacion: string | null;
  origen: string | null;
  asesorIds: number[]; // Array of team member IDs (empty = all)
  etapaEmbudoId: number | null;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  sortBy: ContactSortOption;
  estadoCobranza?: string | null; // Portfolio-specific filter
}

// Team member for filter dropdown
export interface TeamMember {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  is_active: boolean;
  rol?: string | null;
  role_id?: number | null;
}

// User context from wp_team_humano
export interface UserContext {
  id: number;
  authUid: string;
  empresaId: number;
  enterpriseId: number | null;
  roleId: number; // 1 = can see multiple companies, 2-3 = restricted
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  timezone: string; // e.g. 'America/Lima', 'America/Mexico_City'
  grantId?: string | null;
}

// Enterprise/Company info
export interface Enterprise {
  id: number;
  nombre: string;
  logo_url?: string | null;
}

export interface EnterpriseProfile {
  id: number;
  nombre: string;
  ciudad?: string | null;
  pais?: string | null;
  rubro?: string | null;
  informacion_empresarial?: string | null;
  preguntas_frecuentes?: string | null;
  servicios_generales?: string | null;
  embudo_ventas?: string | null;
  logo_url?: string | null;
  sitio_web?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  fecha_creacion?: string | null;
  fecha_actualizacion?: string | null;
  metadata?: Record<string, unknown> | null;
  team_slack?: string | null;
  reglas_negocio?: string | null;
  canal_comunicacion?: string | null;
  metricas_activa?: boolean | null;
  timezone?: string | null;
  branding?: Record<string, unknown> | null;
  activo?: boolean | null;
  email_marketing?: boolean | null;
}

// Pagination state
export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// Contact store state
export interface ContactState {
  contacts: Contact[];
  isLoading: boolean;
  error: string | null;
  filters: ContactFilters;
  pagination: PaginationState;
  userContext: UserContext | null;
  availableEnterprises: Enterprise[];
  selectedEnterpriseId: number | null;
  enterpriseProfile?: EnterpriseProfile | null;
  enterpriseProfileLoading?: boolean;
  enterpriseProfileError?: string | null;
}

// Helper to transform Contact to DisplayData
export const toDisplayData = (contact: Contact): ContactDisplayData => ({
  id: contact.id,
  nombreCompleto: [contact.nombre, contact.apellido].filter(Boolean).join(' ') || 'Sin nombre',
  telefono: contact.telefono || '-',
  email: contact.email || '-',
  estado: contact.estado || 'Desconocido',
  calificacion: contact.es_calificado || '-',
  origen: contact.origen || '-',
  fechaCreacion: contact.created_at 
    ? new Date(contact.created_at).toLocaleDateString('es-ES') 
    : '-',
  ultimoContacto: contact.ultima_interaccion 
    ? new Date(contact.ultima_interaccion).toLocaleDateString('es-ES') 
    : '-',
  asesorId: contact.team_humano_id || null,
  tags: [],
  isPaused: contact.is_active === false && !!contact.paused_until && new Date(contact.paused_until) > new Date(),
  isDeactivated: contact.is_active === false && !contact.paused_until,
  matchSource: (contact as any).matchSource,
  matchPreview: (contact as any).matchPreview,
  etapaEmbudoId: contact.etapa_embudo || null,
  etapaEmocional: contact.etapa_emocional || null,
});

// Enhanced contact context for list display
export interface ContactContext {
  // Primary context
  displayName: string;
  avatar: {
    initial: string;
    color: string;
    qualified: boolean;
  };
  
  // Business context
  status: {
    label: string;
    color: string;
    priority: 'high' | 'medium' | 'low';
  };
  origin: string;
  assignedAgent?: string;
  
  // Activity context
  lastActivity: {
    date: string;
    relativeTime: string;
    type: 'conversation' | 'appointment' | 'note' | 'none';
  };
  activityScore: number;
  
  // Communication
  contactMethods: {
    phone?: string;
    email?: string;
    preferred: 'phone' | 'email' | 'none';
  };
  
  // Business intelligence
  leadScore: {
    value: number;
    level: 'hot' | 'warm' | 'cold';
    factors: string[];
  };
  
  // Metadata context
  tags: string[];
  customFields: Record<string, any>;
  funnelStage?: string;
  
  // Pause status
  pauseStatus: {
    isPaused: boolean;
    isDeactivated: boolean;
    pausedUntil: string | null;
  };

  // Quick actions
  quickActions: {
    canCall: boolean;
    canEmail: boolean;
    canMessage: boolean;
    hasAppointment: boolean;
    nextAppointment?: {
      date: string;      // Fecha formateada: "Mié 22 Ene"
      time: string;      // Hora formateada: "10:00am"
      title?: string;    // Título de la cita
      isToday: boolean;  // Si es hoy
      isTomorrow: boolean; // Si es mañana
    };
  };
}

// ============================================================================
// HELPER FUNCTIONS - Extracted for performance (avoid recreating on each call)
// ============================================================================

// Status configuration map (constant)
const STATUS_MAP: Record<string, { label: string; color: string; priority: 'high' | 'medium' | 'low' }> = {
  'cliente': { label: 'Cliente', color: 'text-emerald-400 bg-emerald-500/10', priority: 'high' },
  'calificado': { label: 'Calificado', color: 'text-purple-400 bg-purple-500/10', priority: 'high' },
  'prospecto': { label: 'Prospecto', color: 'text-blue-400 bg-blue-500/10', priority: 'medium' },
  'rembolso realizado': { label: 'Rembolso Realizado', color: 'text-rose-400 bg-rose-500/10', priority: 'medium' },
  'rembolsos solicitado': { label: 'Rembolsos Solicitado', color: 'text-amber-400 bg-amber-500/10', priority: 'medium' },
  'evaluando': { label: 'Evaluando', color: 'text-amber-400 bg-amber-500/10', priority: 'medium' },
  'no_calificado': { label: 'No Calificado', color: 'text-red-400 bg-red-500/10', priority: 'low' },
  'rechazado': { label: 'Rechazado', color: 'text-gray-400 bg-gray-500/10', priority: 'low' },
};

const DEFAULT_STATUS = { label: 'Desconocido', color: 'text-zinc-400 bg-zinc-500/10', priority: 'low' as const };

// Status priority values for sorting
export const STATUS_PRIORITY_VALUES: Record<string, number> = {
  'high': 3,
  'medium': 2,
  'low': 1
};

// Get avatar color based on contact state
const getAvatarColor = (contact: Contact): string => {
  // Check valid pause (active=false + paused_until in future)
  const isPaused = contact.is_active === false && contact.paused_until && new Date(contact.paused_until) > new Date();
  
  // Check permanent deactivation (active=false + no paused_until)
  const isDeactivated = contact.is_active === false && !contact.paused_until;

  if (isPaused) return 'bg-amber-500/80';
  if (isDeactivated) return 'bg-rose-500/80';
  
  // If active=false but paused_until expired -> treat as active/normal
  if (contact.es_calificado === 'si') return 'bg-amber-500';
  if (contact.estado === 'cliente') return 'bg-emerald-500';
  if (contact.estado === 'calificado') return 'bg-purple-500';
  if (contact.estado === 'prospecto') return 'bg-blue-500';
  if (contact.estado === 'rembolso realizado') return 'bg-rose-500';
  if (contact.estado === 'rembolsos solicitado') return 'bg-amber-500';
  return 'bg-zinc-500';
};

// Get status info
const getStatusInfo = (estado?: string | null) => {
  const status = estado?.toLowerCase() || 'desconocido';
  return STATUS_MAP[status] || DEFAULT_STATUS;
};

// Calculate days difference from now
const getDaysDiff = (dateStr: string): number => {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
};

// Format relative time
const formatRelativeTime = (diffDays: number): string => {
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  return `Hace ${Math.floor(diffDays / 30)} meses`;
};

export const LEAD_SCORE_THRESHOLDS = {
  hot: { min: 70, color: 'text-emerald-400', label: 'Lead Caliente' },
  warm: { min: 40, color: 'text-amber-400', label: 'Lead Tibio' },
  cold: { min: 0, color: 'text-zinc-400', label: 'Lead Frío' }
} as const;

export const calculateLeadScore = (
  contact: Contact,
  conversations?: Conversation[],
  appointments?: Appointment[],
  notes?: ContactNote[]
): { value: number; level: 'hot' | 'warm' | 'cold'; factors: string[] } => {
  // Descalificados y no calificados: score 0, van al final
  if (contact.es_calificado === 'no' || contact.estado === 'descalificado' || contact.estado === 'no_calificado') {
    return { value: 0, level: 'cold', factors: ['Descalificado'] };
  }

  let score = 0;
  const factors: string[] = [];
  const hasPhone = !!(contact.telefono && contact.telefono !== '-');
  const hasEmail = !!(contact.email && contact.email !== '-');

  // Calificación y estado
  if (contact.es_calificado === 'si') { score += 30; factors.push('Calificado'); }
  if (contact.estado === 'cliente') { score += 25; factors.push('Cliente'); }
  else if (contact.estado === 'calificado') { score += 20; factors.push('Estado calificado'); }
  else if (contact.estado === 'prospecto') { score += 10; factors.push('Prospecto'); }

  // Información de contacto
  if (hasPhone) { score += 10; factors.push('Teléfono'); }
  if (hasEmail) { score += 10; factors.push('Email'); }
  if (contact.url_drive) { score += 5; factors.push('Drive'); }

  // Actividad reciente
  if (contact.ultima_interaccion) {
    const daysDiff = getDaysDiff(contact.ultima_interaccion);
    if (daysDiff < 7) { score += 15; factors.push('Activo recientemente'); }
    else if (daysDiff < 30) { score += 5; factors.push('Actividad reciente'); }
  }

  // Interacciones
  if (conversations && conversations.length > 2) { score += 10; factors.push('Múltiples conversaciones'); }
  if (appointments && appointments.length > 0) { score += 15; factors.push('Con citas agendadas'); }
  if (notes && notes.length > 2) { score += 5; factors.push('Con notas detalladas'); }

  // Metadata y tags
  const metadata = contact.metadata as Record<string, any> | null;
  if (metadata?.tags && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
    score += 5; factors.push('Con etiquetas');
  }

  const level: 'hot' | 'warm' | 'cold' = score >= LEAD_SCORE_THRESHOLDS.hot.min
    ? 'hot'
    : score >= LEAD_SCORE_THRESHOLDS.warm.min
      ? 'warm'
      : 'cold';

  return { value: score, level, factors };
};

// ============================================================================
// MAIN CONTEXT GENERATOR - Optimized
// ============================================================================
export const generateContactContext = (
  contact: Contact, 
  conversations?: Conversation[],
  appointments?: Appointment[],
  notes?: ContactNote[],
  teamMembers?: Array<{ id: number; nombre: string; apellido: string }>
): ContactContext => {
  // Basic info
  const nombre = contact.nombre || '';
  const apellido = contact.apellido || '';
  const displayName = [nombre, apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const initial = displayName.charAt(0).toUpperCase();
  
  // Contact methods (calculated once)
  const hasPhone = !!(contact.telefono && contact.telefono !== '-');
  const hasEmail = !!(contact.email && contact.email !== '-');
  const preferredContact: 'phone' | 'email' | 'none' = hasPhone ? 'phone' : hasEmail ? 'email' : 'none';
  
  // Calculate last activity
  const activityDates = [
    contact.ultima_interaccion ? { date: contact.ultima_interaccion, type: 'conversation' as const } : null,
    ...(appointments || []).map(a => a.fecha_hora ? { date: a.fecha_hora, type: 'appointment' as const } : null),
    ...(notes || []).map(n => ({ date: n.created_at, type: 'note' as const })),
  ].filter((d): d is { date: string; type: 'conversation' | 'appointment' | 'note' } => d !== null && !!d.date);
  
  let lastActivity: ContactContext['lastActivity'];
  let lastActivityDaysDiff = 999;
  
  if (activityDates.length === 0) {
    lastActivity = { date: '-', relativeTime: 'Sin actividad', type: 'none' };
  } else {
    const latest = activityDates.reduce((prev, current) => 
      new Date(current.date) > new Date(prev.date) ? current : prev
    );
    lastActivityDaysDiff = getDaysDiff(latest.date);
    lastActivity = {
      date: new Date(latest.date).toLocaleDateString('es-ES'),
      relativeTime: formatRelativeTime(lastActivityDaysDiff),
      type: latest.type,
    };
  }
  
  // Activity score (0-100)
  let activityScore = 50;
  if (lastActivity.type !== 'none') {
    activityScore += Math.max(0, 30 - lastActivityDaysDiff);
  }
  if (conversations?.length) activityScore += Math.min(conversations.length * 5, 20);
  if (appointments?.length) activityScore += Math.min(appointments.length * 10, 20);
  if (notes?.length) activityScore += Math.min(notes.length * 3, 10);
  activityScore = Math.max(0, Math.min(100, activityScore));
  
  // Lead score calculation (shared)
  const leadScore = calculateLeadScore(contact, conversations, appointments, notes);
  const leadScoreValue = leadScore.value;
  const leadLevel = leadScore.level;
  const factors = leadScore.factors;
  
  // Agent name
  const assignedAgent = teamMembers?.find(m => m.id === contact.team_humano_id);
  const agentName = assignedAgent ? `${assignedAgent.nombre} ${assignedAgent.apellido.charAt(0)}.` : undefined;
  
  // Metadata
  const metadata = contact.metadata as Record<string, any> | null;
  const tags = (metadata?.tags as string[]) || [];
  const hasAppointments = (appointments?.length || 0) > 0;
  
  // Calculate next appointment
  let nextAppointment: ContactContext['quickActions']['nextAppointment'] = undefined;
  if (appointments && appointments.length > 0) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayAfterTomorrow = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
    
    // Filter future/today appointments and sort by date
    const upcomingApts = appointments
      .filter(apt => apt.fecha_hora && new Date(apt.fecha_hora) >= todayStart && apt.estado !== 'cancelada')
      .sort((a, b) => new Date(a.fecha_hora!).getTime() - new Date(b.fecha_hora!).getTime());
    
    if (upcomingApts.length > 0) {
      const apt = upcomingApts[0];
      const aptDate = new Date(apt.fecha_hora!);
      const isToday = aptDate >= todayStart && aptDate < tomorrowStart;
      const isTomorrow = aptDate >= tomorrowStart && aptDate < dayAfterTomorrow;
      
      // Format date: "Mié 22 Ene"
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const formattedDate = `${dayNames[aptDate.getDay()]} ${aptDate.getDate()} ${monthNames[aptDate.getMonth()]}`;
      
      // Format time: "10:00am"
      const hours = aptDate.getHours();
      const minutes = aptDate.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      const hour12 = hours % 12 || 12;
      const formattedTime = `${hour12}:${minutes}${ampm}`;
      
      nextAppointment = {
        date: formattedDate,
        time: formattedTime,
        title: apt.titulo || undefined,
        isToday,
        isTomorrow
      };
    }
  }
  
  // Calculate pause status
  const isPaused = contact.is_active === false && !!contact.paused_until && new Date(contact.paused_until) > new Date();
  const isDeactivated = contact.is_active === false && !contact.paused_until;
  
  return {
    displayName,
    avatar: {
      initial,
      color: getAvatarColor(contact),
      qualified: contact.es_calificado === 'si',
    },
    status: getStatusInfo(contact.estado),
    origin: contact.origen || '-',
    assignedAgent: agentName,
    lastActivity,
    activityScore,
    contactMethods: {
      phone: hasPhone ? (contact.telefono || undefined) : undefined,
      email: hasEmail ? (contact.email || undefined) : undefined,
      preferred: preferredContact,
    },
    leadScore: { value: leadScoreValue, level: leadLevel, factors },
    tags,
    customFields: metadata || {},
    funnelStage: metadata?.funnelStage as string | undefined,
    pauseStatus: {
      isPaused,
      isDeactivated,
      pausedUntil: contact.paused_until || null
    },
    quickActions: {
      canCall: hasPhone,
      canEmail: hasEmail,
      canMessage: true,
      hasAppointment: hasAppointments,
      nextAppointment,
    },
  };
};

// ============================================================================
// SORTING UTILITIES - Pre-compute context for O(n) instead of O(n²)
// ============================================================================
export interface ContactWithContext {
  contact: Contact;
  context: ContactContext;
}

// Pre-compute context for all contacts (call once before sorting)
export const precomputeContactContexts = (
  contacts: Contact[],
  teamMembers?: Array<{ id: number; nombre: string; apellido: string }>,
  appointmentsByContactId?: Map<number, Appointment[]>
): ContactWithContext[] => {
  return contacts.map(contact => ({
    contact,
    context: generateContactContext(
      contact, 
      undefined, 
      appointmentsByContactId?.get(contact.id), 
      undefined, 
      teamMembers
    )
  }));
};

// Sorting comparator functions (use pre-computed context)
export const contactSortComparators: Record<ContactSortOption, (a: ContactWithContext, b: ContactWithContext) => number> = {
  leadScore: (a, b) => {
    const scoreDiff = b.context.leadScore.value - a.context.leadScore.value;
    if (scoreDiff !== 0) return scoreDiff;

    const lastA = a.contact.ultima_interaccion ? new Date(a.contact.ultima_interaccion).getTime() : 0;
    const lastB = b.contact.ultima_interaccion ? new Date(b.contact.ultima_interaccion).getTime() : 0;
    if (lastB !== lastA) return lastB - lastA;

    const createdA = a.contact.created_at ? new Date(a.contact.created_at).getTime() : 0;
    const createdB = b.contact.created_at ? new Date(b.contact.created_at).getTime() : 0;
    return createdB - createdA;
  },
  
  activity: (a, b) => b.context.activityScore - a.context.activityScore,
  
  createdNewest: (a, b) => {
    const dateA = a.contact.created_at ? new Date(a.contact.created_at).getTime() : 0;
    const dateB = b.contact.created_at ? new Date(b.contact.created_at).getTime() : 0;
    return dateB - dateA;
  },
  
  createdOldest: (a, b) => {
    const dateA = a.contact.created_at ? new Date(a.contact.created_at).getTime() : 0;
    const dateB = b.contact.created_at ? new Date(b.contact.created_at).getTime() : 0;
    return dateA - dateB;
  },

  // Portfolio priority: sorted externally via portfolioSummaries map; fallback to leadScore
  portfolioPriority: (a, b) => {
    const scoreDiff = b.context.leadScore.value - a.context.leadScore.value;
    if (scoreDiff !== 0) return scoreDiff;
    const lastA = a.contact.ultima_interaccion ? new Date(a.contact.ultima_interaccion).getTime() : 0;
    const lastB = b.contact.ultima_interaccion ? new Date(b.contact.ultima_interaccion).getTime() : 0;
    return lastB - lastA;
  },
};

// Sort contacts with pre-computed context (O(n log n) instead of O(n²))
export const sortContactsWithContext = (
  contactsWithContext: ContactWithContext[],
  sortBy: ContactSortOption
): ContactWithContext[] => {
  const comparator = contactSortComparators[sortBy] || contactSortComparators.leadScore;
  return [...contactsWithContext].sort(comparator);
};

// ============================================================================
// TASK MANAGEMENT SYSTEM
// ============================================================================

export type TaskStatus = 'pendiente' | 'en_progreso' | 'completada' | 'cancelada';
export type TaskPriority = 1 | 2 | 3 | 4; // 1=baja, 2=media, 3=alta, 4=urgente

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
  4: 'Urgente'
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  1: 'text-zinc-500 bg-zinc-800/50',
  2: 'text-primary-400 bg-primary-500/10',
  3: 'text-amber-400 bg-amber-500/10',
  4: 'text-rose-400 bg-rose-500/10'
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En Progreso',
  completada: 'Completada',
  cancelada: 'Cancelada'
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pendiente: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  en_progreso: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  completada: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  cancelada: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
};

export interface TaskItem {
  id: number;
  tarea_id: number;
  texto: string;
  orden: number;
  completado: boolean;
  completado_por?: number | null;
  completado_at?: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  titulo: string;
  descripcion?: string | null;
  estado: TaskStatus;
  prioridad: TaskPriority;
  
  // Contexto (nullable - determina el tipo de tarea)
  contacto_id?: number | null;
  cita_id?: number | null;
  conversacion_id?: number | null;
  
  // Asignación y pertenencia
  empresa_id: number;
  proyecto_id?: number | null; // Add proyecto_id
  asignado_a?: number | null;
  creado_por: number;
  
  // Fechas
  fecha_vencimiento?: string | null;
  fecha_completada?: string | null;
  created_at: string;
  updated_at?: string | null;
  
  // Metadata flexible
  metadata?: Record<string, unknown> | null;
  
  // Relaciones cargadas (joins)
  items?: TaskItem[];
  asignado?: { id: number; nombre: string; apellido: string } | null;
  creador?: { id: number; nombre: string; apellido: string } | null;
  contacto?: { id: number; nombre: string; apellido: string; telefono?: string; email?: string } | null;
  cita?: { id: number; titulo: string; fecha_hora: string } | null;
  proyecto?: { id: number; nombre: string; color: string } | null;
}

// Helper para determinar el tipo de tarea basado en sus FKs
export type TaskType = 'contacto' | 'cita' | 'conversacion' | 'equipo' | 'general';

export const getTaskType = (task: Task): TaskType => {
  if (task.contacto_id) return 'contacto';
  if (task.cita_id) return 'cita';
  if (task.conversacion_id) return 'conversacion';
  if (task.asignado_a) return 'equipo';
  return 'general';
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  contacto: 'Contacto',
  cita: 'Cita',
  conversacion: 'Conversación',
  equipo: 'Equipo',
  general: 'General'
};

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  contacto: 'User',
  cita: 'Calendar',
  conversacion: 'MessageSquare',
  equipo: 'Users',
  general: 'CheckSquare'
};

// Filtros para lista de tareas
export interface TaskFilters {
  search: string;
  estado: TaskStatus | null;
  prioridad: TaskPriority | null;
  asignadoA: number | null;
  tipo: TaskType | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
}

// ============================================================================
// CONTACT TEAM ASSIGNMENTS - Asignaciones múltiples de team humanos
// ============================================================================

export type RolAsignacion = 'principal' | 'colaborador' | 'observador';

export interface ContactTeamAssignment {
  id: number;
  contacto_id: number;
  team_humano_id: number;
  es_principal: boolean;
  rol_asignacion?: RolAsignacion | null;
  asignado_por?: number | null;
  empresa_id: number;
  created_at: string;
  updated_at?: string | null;
  // Datos del team humano (join)
  team_nombre?: string;
  team_apellido?: string;
  team_email?: string;
  team_rol?: string;
  team_is_active?: boolean;
}

export interface CreateAssignmentPayload {
  contacto_id: number;
  team_humano_id: number;
  es_principal?: boolean;
  rol_asignacion?: RolAsignacion;
  empresa_id: number;
}

export interface UpdateAssignmentPayload {
  id: number;
  es_principal?: boolean;
  rol_asignacion?: RolAsignacion;
}

export const ROL_ASIGNACION_LABELS: Record<RolAsignacion, string> = {
  principal: 'Principal',
  colaborador: 'Colaborador',
  observador: 'Observador'
};

export const ROL_ASIGNACION_COLORS: Record<RolAsignacion, string> = {
  principal: 'text-primary-400 bg-primary-500/10 border-primary-500/20',
  colaborador: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  observador: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
};

// Estado del store de tareas
export interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  filters: TaskFilters;
  selectedTask: Task | null;
}

// Payload para crear tarea
export interface CreateTaskPayload {
  titulo: string;
  descripcion?: string;
  prioridad?: TaskPriority;
  contacto_id?: number;
  cita_id?: number;
  conversacion_id?: number;
  proyecto_id?: number; // Add proyecto_id
  asignado_a?: number;
  fecha_vencimiento?: string;
  items?: string[]; // Array de textos para crear items
}

// Payload para actualizar tarea
export interface UpdateTaskPayload {
  titulo?: string;
  descripcion?: string | null;
  descripcion_md?: string | null; // Add descripcion_md for V3
  estado?: TaskStatus;
  prioridad?: TaskPriority;
  proyecto_id?: number | null; // Add proyecto_id
  asignado_a?: number | null;
  fecha_vencimiento?: string | null;
}

// ============================================================================
// PROJECT MANAGEMENT V2
// ============================================================================

export type ProjectStatus = 'activo' | 'archivado' | 'completado';

export interface ProjectConfig {
  vista_default: 'lista' | 'kanban';
  columnas_kanban: TaskStatus[];
}

export interface Project {
  id: number;
  empresa_id: number;
  nombre: string;
  descripcion?: string | null;
  estado: ProjectStatus;
  color: string;
  icono: string;
  orden: number;
  config: ProjectConfig;
  creado_por: number;
  created_at: string;
  updated_at?: string | null;
  
  // Computed/joined
  _task_count?: number;
  _completed_count?: number;
  creador?: { id: number; nombre: string; apellido: string } | null;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  activo: 'Activo',
  archivado: 'Archivado',
  completado: 'Completado'
};

export const PROJECT_COLORS: string[] = [
  'blue', 'purple', 'pink', 'rose', 'red', 'orange', 
  'amber', 'yellow', 'lime', 'green', 'emerald', 
  'teal', 'cyan', 'sky', 'indigo', 'violet', 'zinc'
];

export const PROJECT_ICONS: string[] = [
  'folder', 'briefcase', 'rocket', 'target', 'flag',
  'star', 'heart', 'zap', 'home', 'building',
  'users', 'code', 'palette', 'megaphone', 'shopping-cart'
];

// Asignación múltiple
export type AssignmentRole = 'responsable' | 'colaborador' | 'revisor';

export interface TaskAssignment {
  tarea_id: number;
  team_humano_id: number;
  rol: AssignmentRole;
  asignado_por?: number | null;
  created_at: string;
  
  // Joined
  usuario?: { id: number; nombre: string; apellido: string } | null;
}

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  responsable: 'Responsable',
  colaborador: 'Colaborador',
  revisor: 'Revisor'
};

// Comentarios
export type CommentType = 'comentario' | 'sistema' | 'mencion';

export interface TaskComment {
  id: number;
  tarea_id: number;
  autor_id?: number | null;
  contenido: string;
  tipo: CommentType;
  metadata?: {
    mentions?: number[];
    action?: string;
    from?: string;
    to?: string;
  } | null;
  editado: boolean;
  created_at: string;
  updated_at?: string | null;
  
  // Joined
  autor?: { id: number; nombre: string; apellido: string } | null;
}

// Etiquetas de equipo
export interface TeamLabel {
  id: number;
  empresa_id: number;
  nombre: string;
  color: string;
  descripcion?: string | null;
  created_at: string;
}

// Extensión de TaskItem para V2
export interface TaskItemV2 extends TaskItem {
  asignado_a?: number | null;
  etiqueta_id?: number | null;
  
  // Joined
  asignado?: { id: number; nombre: string; apellido: string } | null;
  etiqueta?: TeamLabel | null;
}

// Extensión de Task para V2
export interface TaskV2 extends Task {
  proyecto_id?: number | null;
  
  // Relaciones V2
  proyecto?: Project | null;
  asignados?: TaskAssignment[];
  comentarios?: TaskComment[];
}

// Filtros extendidos para V2
export interface TaskFiltersV2 extends TaskFilters {
  proyecto_id: number | null;
}

// Payload para crear proyecto
export interface CreateProjectPayload {
  nombre: string;
  descripcion?: string;
  color?: string;
  icono?: string;
}

// Payload para actualizar proyecto
export interface UpdateProjectPayload {
  nombre?: string;
  descripcion?: string | null;
  estado?: ProjectStatus;
  color?: string;
  icono?: string;
  orden?: number;
  config?: Partial<ProjectConfig>;
}
