/**
 * Contact Profile Context Generator
 * 
 * Genera contexto enriquecido para la vista de detalles del contacto,
 * optimizado para mostrar información completa y relevante en el panel lateral.
 */

import { 
  Contact, 
  Conversation, 
  Appointment, 
  ContactNote, 
  Transcripcion,
  FunnelStatus,
  FunnelStage,
  TeamMember,
  ContactContext,
  calculateLeadScore,
  LEAD_SCORE_THRESHOLDS
} from '../types/contact';

// ============================================================================
// INTERFACES PARA EL CONTEXTO DEL PERFIL
// ============================================================================

export interface ContactProfileContext {
  // === INFORMACIÓN BÁSICA ===
  identity: {
    id: number;
    displayName: string;
    fullName: string;
    initials: string;
    avatar: {
      color: string;
      gradient: string;
      qualified: boolean;
    };
  };
  
  // === INFORMACIÓN DE CONTACTO ===
  contactInfo: {
    phone?: string;
    email?: string;
    driveUrl?: string;
    hasPhone: boolean;
    hasEmail: boolean;
    preferredMethod: 'phone' | 'email' | 'none';
  };
  
  // === ESTADO Y CALIFICACIÓN ===
  status: {
    qualification: {
      value: string;
      label: string;
      color: string;
      icon: string;
    };
    state: {
      value: string;
      label: string;
      color: string;
      priority: 'high' | 'medium' | 'low';
    };
    pauseStatus: {
      isPaused: boolean;
      isDeactivated: boolean;
      pausedUntil?: string;
      timeRemaining?: string;
      statusColor: string;
      statusIcon: string;
      statusText: string;
    };
  };
  
  // === ASIGNACIÓN Y EQUIPO ===
  assignment: {
    assignedAgent?: {
      id: number;
      fullName: string;
      initials: string;
      email?: string;
      role?: string;
    };
    origin: string;
    enterpriseId: number;
  };
  
  // === ACTIVIDAD Y ENGAGEMENT ===
  activity: {
    lastInteraction: {
      date: string;
      relativeTime: string;
      type: 'conversation' | 'appointment' | 'note' | 'none';
      color: string;
    };
    importantDates: {
      created: string;
      updated?: string;
      lastNote?: string;
      nextAppointment?: string;
    };
    metrics: {
      conversationCount: number;
      appointmentCount: number;
      noteCount: number;
      activityScore: number;
      engagementLevel: 'high' | 'medium' | 'low';
    };
  };
  
  // === INTELIGENCIA DE NEGOCIO ===
  intelligence: {
    leadScore: {
      value: number;
      level: 'hot' | 'warm' | 'cold';
      color: string;
      factors: string[];
    };
    funnelStage?: {
      id: number;
      name: string;
      order: number;
      progress: number;
    };
    conversionProbability: {
      percentage: number;
      confidence: 'high' | 'medium' | 'low';
    };
  };
  
  // === METADATA Y ETIQUETAS ===
  metadata: {
    tags: string[];
    customFields: Record<string, any>;
    businessData: Record<string, any>;
    hasMetadata: boolean;
  };
  
  // === ACCIONES RÁPIDAS ===
  quickActions: {
    canCall: boolean;
    canEmail: boolean;
    canMessage: boolean;
    canSchedule: boolean;
    hasUpcomingAppointment: boolean;
    isIn24hWindow: boolean;
    windowTimeRemaining?: string;
  };
  
  // === RESUMEN EJECUTIVO ===
  executiveSummary: {
    headline: string;
    keyPoints: string[];
    nextSteps: string[];
    riskFactors: string[];
    opportunities: string[];
  };
}

// ============================================================================
// CONSTANTES DE CONFIGURACIÓN
// ============================================================================

const AVATAR_GRADIENTS = {
  qualified: 'from-amber-500/20 to-amber-600/10',
  cliente: 'from-emerald-500/20 to-emerald-600/10',
  calificado: 'from-purple-500/20 to-purple-600/10',
  prospecto: 'from-blue-500/20 to-blue-600/10',
  paused: 'from-amber-500/20 to-amber-600/10',
  deactivated: 'from-rose-500/20 to-rose-600/10',
  default: 'from-zinc-500/20 to-zinc-600/10'
};

const QUALIFICATION_CONFIG = {
  si: { label: 'Calificado', color: 'text-emerald-400 bg-emerald-500/10', icon: '✓' },
  no: { label: 'No calificado', color: 'text-rose-400 bg-rose-500/10', icon: '✗' },
  pendiente: { label: 'Pendiente', color: 'text-amber-400 bg-amber-500/10', icon: '⏳' }
};

const STATE_CONFIG = {
  cliente: { label: 'Cliente', color: 'text-emerald-400', priority: 'high' as const },
  calificado: { label: 'Calificado', color: 'text-purple-400', priority: 'high' as const },
  prospecto: { label: 'Prospecto', color: 'text-blue-400', priority: 'medium' as const },
  evaluando: { label: 'Evaluando', color: 'text-amber-400', priority: 'medium' as const },
  rechazado: { label: 'Rechazado', color: 'text-rose-400', priority: 'low' as const }
};

// ============================================================================
// FUNCIONES HELPER
// ============================================================================

const getDaysDiff = (dateStr: string): number => {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
};

const formatRelativeTime = (diffDays: number): string => {
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  return `Hace ${Math.floor(diffDays / 30)} meses`;
};

const getAvatarColor = (contact: Contact): string => {
  const isPaused = contact.is_active === false && contact.paused_until && new Date(contact.paused_until) > new Date();
  const isDeactivated = contact.is_active === false && !contact.paused_until;

  if (isPaused) return 'bg-amber-500/80';
  if (isDeactivated) return 'bg-rose-500/80';
  if (contact.es_calificado === 'si') return 'bg-amber-500';
  if (contact.estado === 'cliente') return 'bg-emerald-500';
  if (contact.estado === 'calificado') return 'bg-purple-500';
  if (contact.estado === 'prospecto') return 'bg-blue-500';
  return 'bg-zinc-500';
};

const getAvatarGradient = (contact: Contact): string => {
  const isPaused = contact.is_active === false && contact.paused_until && new Date(contact.paused_until) > new Date();
  const isDeactivated = contact.is_active === false && !contact.paused_until;

  if (isPaused) return AVATAR_GRADIENTS.paused;
  if (isDeactivated) return AVATAR_GRADIENTS.deactivated;
  if (contact.es_calificado === 'si') return AVATAR_GRADIENTS.qualified;
  if (contact.estado === 'cliente') return AVATAR_GRADIENTS.cliente;
  if (contact.estado === 'calificado') return AVATAR_GRADIENTS.calificado;
  if (contact.estado === 'prospecto') return AVATAR_GRADIENTS.prospecto;
  return AVATAR_GRADIENTS.default;
};

const calculatePauseTimeRemaining = (pausedUntil: string): string => {
  const now = new Date();
  const pauseEnd = new Date(pausedUntil);
  const diffMs = pauseEnd.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Expirada';
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 24) {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ${diffHours % 24}h`;
  }
  
  return `${diffHours}h ${diffMinutes}m`;
};

const calculateWindowTimeRemaining = (lastInteractionTime: number): string => {
  const windowEnd = lastInteractionTime + 24 * 60 * 60 * 1000;
  const now = Date.now();
  const diffMs = windowEnd - now;
  
  if (diffMs <= 0) return 'Expirada';
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes}m`;
  }
  
  return `${diffMinutes}m`;
};

const isIn24HourWindow = (ultimaInteraccion?: string | null): boolean => {
  if (!ultimaInteraccion) return false;
  const lastInteraction = new Date(ultimaInteraccion);
  const now = new Date();
  const diffHours = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
};

const calculateEngagementLevel = (
  activityScore: number,
  lastInteractionDays: number
): 'high' | 'medium' | 'low' => {
  if (activityScore >= 70 && lastInteractionDays < 7) return 'high';
  if (activityScore >= 40 && lastInteractionDays < 30) return 'medium';
  return 'low';
};

const generateExecutiveSummary = (
  contact: Contact,
  context: Omit<ContactProfileContext, 'executiveSummary'>
): ContactProfileContext['executiveSummary'] => {
  const keyPoints: string[] = [];
  const nextSteps: string[] = [];
  const riskFactors: string[] = [];
  const opportunities: string[] = [];
  
  // Puntos clave
  if (context.status.qualification.value === 'si') {
    keyPoints.push('Contacto calificado para conversión');
  }
  if (contact.estado === 'cliente') {
    keyPoints.push('Cliente activo en cartera');
  }
  if (context.activity.metrics.conversationCount > 3) {
    keyPoints.push('Alta interacción en conversaciones');
  }
  if (context.intelligence.leadScore.value >= 70) {
    keyPoints.push('Lead con alto potencial de conversión');
  }
  
  // Próximos pasos
  if (context.quickActions.isIn24hWindow) {
    nextSteps.push('Ventana de 24h activa - Ideal para contacto directo');
  }
  if (context.quickActions.hasUpcomingAppointment) {
    nextSteps.push('Preparar para próxima cita agendada');
  }
  if (context.status.qualification.value === 'pendiente') {
    nextSteps.push('Evaluar calificación del contacto');
  }
  if (!context.contactInfo.hasPhone || !context.contactInfo.hasEmail) {
    nextSteps.push('Completar información de contacto');
  }
  
  // Factores de riesgo
  if (context.status.pauseStatus.isPaused) {
    riskFactors.push('Contacto temporalmente pausado');
  }
  if (context.status.pauseStatus.isDeactivated) {
    riskFactors.push('Contacto desactivado permanentemente');
  }
  if (context.activity.lastInteraction.type === 'none') {
    riskFactors.push('Sin actividad reciente');
  }
  if (context.status.state.value === 'rechazado') {
    riskFactors.push('Contacto previamente rechazado');
  }
  
  // Oportunidades
  if (context.intelligence.leadScore.level === 'hot') {
    opportunities.push('Alto potencial de conversión inmediata');
  }
  if (context.activity.metrics.appointmentCount === 0 && context.quickActions.canSchedule) {
    opportunities.push('Oportunidad para agendar primera cita');
  }
  if (context.metadata.tags.length > 0) {
    opportunities.push('Segmentación disponible para campañas personalizadas');
  }
  if (contact.estado === 'prospecto' && context.status.qualification.value === 'si') {
    opportunities.push('Listo para mover a siguiente etapa del embudo');
  }
  
  // Generar headline
  let headline = '';
  if (contact.estado === 'cliente') {
    headline = `Cliente activo ${context.assignment.assignedAgent ? `- Asignado a ${context.assignment.assignedAgent.fullName}` : ''}`;
  } else if (context.intelligence.leadScore.level === 'hot') {
    headline = `Lead caliente con ${context.intelligence.leadScore.value} puntos`;
  } else if (context.status.qualification.value === 'si') {
    headline = `Contacto calificado listo para conversión`;
  } else if (context.status.pauseStatus.isPaused) {
    headline = `Contacto pausado - ${context.status.pauseStatus.timeRemaining}`;
  } else {
    headline = `${context.status.state.label} - ${context.activity.lastInteraction.relativeTime}`;
  }
  
  return {
    headline: headline.trim(),
    keyPoints,
    nextSteps,
    riskFactors,
    opportunities
  };
};

// ============================================================================
// FUNCIÓN PRINCIPAL DE GENERACIÓN DE CONTEXTO
// ============================================================================

export const generateContactProfileContext = (
  contact: Contact,
  conversations?: Conversation[],
  appointments?: Appointment[],
  notes?: ContactNote[],
  transcriptions?: Transcripcion[],
  funnelStatus?: FunnelStatus | null,
  funnelStages?: FunnelStage[],
  teamMembers?: TeamMember[]
): ContactProfileContext => {
  // === INFORMACIÓN BÁSICA ===
  const nombre = contact.nombre || '';
  const apellido = contact.apellido || '';
  const fullName = [nombre, apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const initials = fullName.charAt(0).toUpperCase();
  
  const identity = {
    id: contact.id,
    displayName: fullName,
    fullName,
    initials,
    avatar: {
      color: getAvatarColor(contact),
      gradient: getAvatarGradient(contact),
      qualified: contact.es_calificado === 'si'
    }
  };
  
  // === INFORMACIÓN DE CONTACTO ===
  const hasPhone = !!(contact.telefono && contact.telefono !== '-');
  const hasEmail = !!(contact.email && contact.email !== '-');
  const preferredMethod: 'phone' | 'email' | 'none' = hasPhone ? 'phone' : hasEmail ? 'email' : 'none';
  
  const contactInfo = {
    phone: contact.telefono || undefined,
    email: contact.email || undefined,
    driveUrl: contact.url_drive || undefined,
    hasPhone,
    hasEmail,
    preferredMethod
  };
  
  // === ESTADO Y CALIFICACIÓN ===
  const qualification = QUALIFICATION_CONFIG[contact.es_calificado as keyof typeof QUALIFICATION_CONFIG] || 
                       QUALIFICATION_CONFIG.pendiente;
  
  const stateConfig = STATE_CONFIG[contact.estado as keyof typeof STATE_CONFIG] || 
                      { label: 'Desconocido', color: 'text-zinc-400', priority: 'low' as const };
  
  // Estado de pausa
  const isPaused = contact.is_active === false && !!contact.paused_until && new Date(contact.paused_until) > new Date();
  const isDeactivated = contact.is_active === false && !contact.paused_until;
  let timeRemaining: string | undefined;
  let statusColor: string;
  let statusIcon: string;
  let statusText: string;
  
  if (isPaused) {
    timeRemaining = calculatePauseTimeRemaining(contact.paused_until!);
    statusColor = 'text-amber-400';
    statusIcon = '⏰';
    statusText = `Pausado - ${timeRemaining}`;
  } else if (isDeactivated) {
    statusColor = 'text-rose-400';
    statusIcon = '⛔';
    statusText = 'Desactivado';
  } else {
    statusColor = 'text-emerald-400';
    statusIcon = '✓';
    statusText = 'Activo';
  }
  
  const status = {
    qualification: {
      value: contact.es_calificado || 'pendiente',
      label: qualification.label,
      color: qualification.color,
      icon: qualification.icon
    },
    state: {
      value: contact.estado || 'desconocido',
      label: stateConfig.label,
      color: stateConfig.color,
      priority: stateConfig.priority
    },
    pauseStatus: {
      isPaused,
      isDeactivated,
      pausedUntil: contact.paused_until || undefined,
      timeRemaining,
      statusColor,
      statusIcon,
      statusText
    }
  };
  
  // === ASIGNACIÓN Y EQUIPO ===
  const assignedAgent = teamMembers?.find(m => m.id === contact.team_humano_id);
  const assignment = {
    assignedAgent: assignedAgent ? {
      id: assignedAgent.id,
      fullName: `${assignedAgent.nombre} ${assignedAgent.apellido}`,
      initials: `${assignedAgent.nombre.charAt(0)}${assignedAgent.apellido.charAt(0)}`,
      email: assignedAgent.email,
      role: 'Asesor'
    } : undefined,
    origin: contact.origen || '-',
    enterpriseId: contact.empresa_id || 0
  };
  
  // === ACTIVIDAD Y ENGAGEMENT ===
  const activityDates = [
    contact.ultima_interaccion ? { date: contact.ultima_interaccion, type: 'conversation' as const } : null,
    ...(appointments || []).map(a => a.fecha_hora ? { date: a.fecha_hora, type: 'appointment' as const } : null),
    ...(notes || []).map(n => ({ date: n.created_at, type: 'note' as const })),
  ].filter((d): d is { date: string; type: 'conversation' | 'appointment' | 'note' } => d !== null && !!d.date);
  
  let lastInteraction: ContactProfileContext['activity']['lastInteraction'];
  let lastActivityDaysDiff = 999;
  
  if (activityDates.length === 0) {
    lastInteraction = { date: '-', relativeTime: 'Sin actividad', type: 'none', color: 'text-zinc-400' };
  } else {
    const latest = activityDates.reduce((prev, current) => 
      new Date(current.date) > new Date(prev.date) ? current : prev
    );
    lastActivityDaysDiff = getDaysDiff(latest.date);
    lastInteraction = {
      date: new Date(latest.date).toLocaleDateString('es-ES'),
      relativeTime: formatRelativeTime(lastActivityDaysDiff),
      type: latest.type,
      color: lastActivityDaysDiff < 3 ? 'text-emerald-400' : 
             lastActivityDaysDiff < 7 ? 'text-amber-400' : 'text-zinc-400'
    };
  }
  
  // Fechas importantes
  const importantDates = {
    created: contact.created_at ? new Date(contact.created_at).toLocaleDateString('es-ES') : '-',
    updated: contact.updated_at && contact.updated_at !== contact.created_at ? 
              new Date(contact.updated_at).toLocaleDateString('es-ES') : undefined,
    lastNote: notes?.[0]?.created_at ? new Date(notes[0].created_at).toLocaleDateString('es-ES') : undefined,
    nextAppointment: appointments
      ?.filter(a => a.fecha_hora && new Date(a.fecha_hora) > new Date())
      .sort((a, b) => new Date(a.fecha_hora!).getTime() - new Date(b.fecha_hora!).getTime())[0]
      ?.fecha_hora || undefined
  };
  
  // Métricas de actividad
  const conversationCount = conversations?.length || 0;
  const appointmentCount = appointments?.length || 0;
  const noteCount = notes?.length || 0;
  
  let activityScore = 50;
  if (lastInteraction.type !== 'none') {
    activityScore += Math.max(0, 30 - lastActivityDaysDiff);
  }
  activityScore += Math.min(conversationCount * 5, 20);
  activityScore += Math.min(appointmentCount * 10, 20);
  activityScore += Math.min(noteCount * 3, 10);
  activityScore = Math.max(0, Math.min(100, activityScore));
  
  const engagementLevel = calculateEngagementLevel(activityScore, lastActivityDaysDiff);
  
  const activity = {
    lastInteraction,
    importantDates,
    metrics: {
      conversationCount,
      appointmentCount,
      noteCount,
      activityScore,
      engagementLevel
    }
  };
  
  // === INTELIGENCIA DE NEGOCIO ===
  const leadScore = calculateLeadScore(contact, conversations, appointments, notes);
  const leadScoreConfig = LEAD_SCORE_THRESHOLDS[leadScore.level];
  
  // Etapa del embudo
  let funnelStage;
  if (funnelStatus?.etapa_actual && funnelStages) {
    const stage = funnelStages.find(s => s.id === funnelStatus.etapa_actual);
    if (stage) {
      funnelStage = {
        id: stage.id,
        name: stage.nombre_etapa,
        order: stage.orden_etapa,
        progress: Math.round((stage.orden_etapa / funnelStages.length) * 100)
      };
    }
  }
  
  // Probabilidad de conversión (basada en lead score y actividad)
  const confidenceLevel: 'high' | 'medium' | 'low' = 
    leadScore.level === 'hot' ? 'high' : 
    leadScore.level === 'warm' ? 'medium' : 'low';
  
  const conversionProbability = {
    percentage: Math.min(95, Math.round((leadScore.value * 0.7 + activityScore * 0.3) * 0.9)),
    confidence: confidenceLevel
  };
  
  const intelligence = {
    leadScore: {
      value: leadScore.value,
      level: leadScore.level,
      color: leadScoreConfig.color,
      factors: leadScore.factors
    },
    funnelStage,
    conversionProbability
  };
  
  // === METADATA Y ETIQUETAS ===
  const metadata = contact.metadata as Record<string, any> | null;
  const tags = (metadata?.tags as string[]) || [];
  const customFields = { ...metadata };
  delete customFields.tags; // Separar tags del resto de metadata
  
  const metadataContext = {
    tags,
    customFields,
    businessData: metadata || {},
    hasMetadata: Object.keys(metadata || {}).length > 0
  };
  
  // === ACCIONES RÁPIDAS ===
  const in24hWindow = isIn24HourWindow(contact.ultima_interaccion);
  const windowTimeRemaining = in24hWindow && contact.ultima_interaccion ? 
    calculateWindowTimeRemaining(new Date(contact.ultima_interaccion).getTime()) : 
    undefined;
  
  const hasUpcomingAppointment = appointments?.some(a => 
    a.fecha_hora && new Date(a.fecha_hora) > new Date()
  ) || false;
  
  const quickActions = {
    canCall: hasPhone,
    canEmail: hasEmail,
    canMessage: true,
    canSchedule: true,
    hasUpcomingAppointment,
    isIn24hWindow: in24hWindow,
    windowTimeRemaining
  };
  
  // === CONTEXTO BASE ===
  const baseContext = {
    identity,
    contactInfo,
    status,
    assignment,
    activity,
    intelligence,
    metadata: metadataContext,
    quickActions
  };
  
  // === RESUMEN EJECUTIVO ===
  const executiveSummary = generateExecutiveSummary(contact, baseContext);
  
  return {
    ...baseContext,
    executiveSummary
  };
};

// ============================================================================
// UTILIDADES DE RENDERIZADO
// ============================================================================

export const renderContactSummary = (context: ContactProfileContext): string => {
  return `${context.identity.displayName} - ${context.status.state.label} ${context.status.qualification.label}`;
};

export const getContactPriorityColor = (context: ContactProfileContext): string => {
  if (context.status.pauseStatus.isDeactivated) return 'rose';
  if (context.status.pauseStatus.isPaused) return 'amber';
  if (context.intelligence.leadScore.level === 'hot') return 'emerald';
  if (context.intelligence.leadScore.level === 'warm') return 'blue';
  return 'zinc';
};

export const shouldHighlightContact = (context: ContactProfileContext): boolean => {
  return context.intelligence.leadScore.level === 'hot' || 
         context.quickActions.isIn24hWindow || 
         context.quickActions.hasUpcomingAppointment;
};

export default generateContactProfileContext;
