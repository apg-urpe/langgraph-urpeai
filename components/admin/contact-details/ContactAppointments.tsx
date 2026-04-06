import React, { useState, useCallback } from 'react';
import { Calendar, Clock, MapPin, ExternalLink, FileText, ChevronDown, ChevronUp, Video, Sparkles, Loader2, Check, CheckCircle, AlertCircle, Info, Plus, CalendarPlus, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Appointment, Transcripcion, Contact } from '../../../types/contact';
import { useContactStore, selectActiveContactData, selectUserContext } from '../../../store/contactStore';
import { useChatStore } from '../../../store/chatStore';
import { useAdminStore } from '../../../store/adminStore';
import { QuickScheduleModal } from '../dashboard/QuickScheduleModal';
import { AssignContactToAppointmentModal } from '../calendar/AssignContactToAppointmentModal';

interface ContactAppointmentsProps {
  appointments: Appointment[];
  contact?: Contact | null;
}

const APPOINTMENT_STATUSES = [
  { value: 'pendiente', label: 'Pendiente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'confirmada', label: 'Confirmada', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'realizada', label: 'Realizada', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'reagendada', label: 'Reagendada', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { value: 'cancelada', label: 'Cancelada', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { value: 'no_asistio', label: 'No asistió', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
];

// Plataformas soportadas por Nylas Notetaker
const SUPPORTED_MEETING_PLATFORMS = ['meet.google.com', 'teams.microsoft.com', 'zoom.us', 'zoom.com'];

const normalizeAppointmentLocation = (value?: string | null) => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.includes(' ') && trimmed.includes('.')) return `https://${trimmed}`;
  return trimmed;
};

const isSupportedMeetingLink = (link?: string | null): boolean => {
  if (!link) return false;
  const normalized = normalizeAppointmentLocation(link);
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return SUPPORTED_MEETING_PLATFORMS.some(platform => hostname === platform || hostname.endsWith(`.${platform}`));
  } catch {
    return SUPPORTED_MEETING_PLATFORMS.some(platform => normalized.includes(platform));
  }
};

const getLocationHref = (link?: string | null) => {
  const normalized = normalizeAppointmentLocation(link);
  return /^https?:\/\//i.test(normalized) ? normalized : null;
};

const getMeetingPlatformLabel = (link?: string | null) => {
  if (!link) return null;
  const normalized = normalizeAppointmentLocation(link).toLowerCase();
  if (normalized.includes('meet.google.com')) return 'Google Meet';
  if (normalized.includes('teams.microsoft.com')) return 'Microsoft Teams';
  if (normalized.includes('zoom.us') || normalized.includes('zoom.com')) return 'Zoom';
  if (/^https?:\/\//i.test(normalized)) return 'Enlace';
  return 'Ubicación';
};

// ============================================================================
// ASK MONICA HELPERS
// ============================================================================

const SUGGESTED_QUESTIONS = [
  'Haz un resumen ejecutivo de esta reunión',
  '¿Cuáles fueron los acuerdos y próximos pasos?',
  '¿Qué objeciones o preocupaciones mencionó el cliente?',
  'Identifica las oportunidades de venta mencionadas',
];

const buildMonicaMessageFromTranscripcion = (
  trans: Transcripcion,
  apt: Appointment,
  userQuestion: string
): string => {
  const titulo = apt.titulo || 'Reunión sin título';
  const parts: string[] = [
    `**Mi pregunta:** ${userQuestion}`,
    `\n---\n**Contexto de la reunión "${titulo}":**`,
  ];
  if (apt.fecha_hora) parts.push(`- **Fecha:** ${new Date(apt.fecha_hora).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`);
  if (apt.estado) parts.push(`- **Estado:** ${apt.estado}`);
  if (trans.resumen_cita) {
    parts.push(`\n**Resumen de cita:**\n${trans.resumen_cita}`);
  }
  if (trans.resumen) {
    parts.push(`\n**Resumen previo:**\n${trans.resumen}`);
  }
  if (trans.transcripcion) {
    parts.push(`\n**Transcripción completa:**\n${trans.transcripcion}`);
  }
  return parts.join('\n');
};

export const ContactAppointments: React.FC<ContactAppointmentsProps> = ({ appointments, contact }) => {
  const updateStatus = useContactStore(state => state.updateAppointmentStatus);
  const updateAppointmentLocation = useContactStore(state => state.updateAppointmentLocation);
  const enterpriseAppointments = useContactStore(state => state.enterpriseAppointments);
  const activeContactData = useContactStore(selectActiveContactData);
  const userContext = useContactStore(selectUserContext);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<number | string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number | string>>(new Set());
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);
  const fetchContactDetails = useContactStore(state => state.fetchContactDetails);
  const [locationDraft, setLocationDraft] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  
  // Toast system
  const [toasts, setToasts] = useState<Array<{id: string, message: string, type: 'success' | 'error' | 'info', timestamp: number}>>([]);
  
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, timestamp: Date.now() }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);
  
  // Estado para invitaciones de Monica
  const [invitingIds, setInvitingIds] = useState<Set<number | string>>(new Set());
  const [invitedIds, setInvitedIds] = useState<Set<number | string>>(new Set());
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Estado para "Preguntar a Monica" sobre transcripciones
  const [askMonicaData, setAskMonicaData] = useState<{ trans: Transcripcion; apt: Appointment } | null>(null);
  const [monicaQuestion, setMonicaQuestion] = useState('');
  const [isSendingToMonica, setIsSendingToMonica] = useState(false);

  const handleSendToMonica = useCallback(async () => {
    if (!askMonicaData || !monicaQuestion.trim()) return;
    setIsSendingToMonica(true);
    const message = buildMonicaMessageFromTranscripcion(askMonicaData.trans, askMonicaData.apt, monicaQuestion.trim());
    await useChatStore.getState().createNewSession();
    useChatStore.getState().setPendingMessage(message);
    setAskMonicaData(null);
    setMonicaQuestion('');
    setIsSendingToMonica(false);
    useAdminStore.getState().closeAdminPanel();
  }, [askMonicaData, monicaQuestion]);

  // Invitar a Monica a una reunión
  const inviteMonicaToMeeting = useCallback(async (apt: Appointment) => {
    if (!apt.ubicacion || !userContext?.id) return;
    
    setInviteError(null);
    setInvitingIds(prev => new Set(prev).add(apt.id));
    
    try {
      // Obtener token de sesión para autenticación
      const { useAuthStore } = await import('../../../store/authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      // Monica se une INMEDIATAMENTE al hacer click
      // Los asesores usan la misma sala Meet y las citas se reagendan frecuentemente
      const response = await fetch('/api/nylas/notetaker', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        body: JSON.stringify({
          meeting_link: apt.ubicacion,
          team_humano_id: userContext.id,
          appointment_id: apt.id
          // Sin join_time = Monica se une ahora
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        const MONICA_ERROR_MESSAGES: Record<string, string> = {
          NO_CALENDAR_CONNECTED: '📅 El asesor no tiene calendario conectado. Debe conectar su cuenta en Configuración → Integraciones.',
          CROSS_ENTERPRISE: '🔒 No puedes invitar a Monica en reuniones de otra empresa.',
          UNSUPPORTED_PLATFORM: '🔗 Plataforma no soportada. Monica solo funciona con Google Meet, Teams o Zoom.',
          CREDITS_EXHAUSTED: '💳 Créditos de Notetaker agotados. Contacta al administrador.',
          NYLAS_ERROR: '⚠️ Error en Nylas al procesar la solicitud. Intenta de nuevo.',
        };
        const friendlyMessage = data.code && MONICA_ERROR_MESSAGES[data.code]
          ? MONICA_ERROR_MESSAGES[data.code]
          : data.error || 'Error al invitar a Monica';
        throw new Error(friendlyMessage);
      }
      
      // Marcar como invitada exitosamente
      setInvitedIds(prev => new Set(prev).add(apt.id));
      showToast('Monica fue invitada a la reunión exitosamente.', 'success');
      
    } catch (error: any) {
      console.error('[ContactAppointments] Error inviting Monica:', error);
      setInviteError(error.message);
      // Limpiar error después de 7 segundos (mensajes más largos necesitan más tiempo)
      setTimeout(() => setInviteError(null), 7000);
    } finally {
      setInvitingIds(prev => {
        const next = new Set(prev);
        next.delete(apt.id);
        return next;
      });
    }
  }, [userContext?.id, showToast]);
  
  const toggleExpand = (id: number | string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAppointmentCreated = useCallback(() => {
    if (contact?.id) {
      fetchContactDetails(contact.id, { priorityTab: 'appointments' });
    }
  }, [contact?.id, fetchContactDetails]);

  const handleAppointmentUpdated = useCallback(async () => {
    if (contact?.id) {
      await fetchContactDetails(contact.id, { priorityTab: 'appointments' });
    }
  }, [contact?.id, fetchContactDetails]);

  const handleStartLocationEdit = useCallback((apt: Appointment) => {
    setEditingLocationId(apt.id);
    setLocationDraft(apt.ubicacion || '');
    setLocationError(null);
  }, []);

  const handleCancelLocationEdit = useCallback(() => {
    setEditingLocationId(null);
    setLocationDraft('');
    setLocationError(null);
    setIsSavingLocation(false);
  }, []);

  const handleSaveLocation = useCallback(async (apt: Appointment) => {
    const normalizedLocation = normalizeAppointmentLocation(locationDraft);

    if (!normalizedLocation) {
      setLocationError('Ingresa un link o una ubicación válida.');
      return;
    }

    setIsSavingLocation(true);
    setLocationError(null);

    try {
      const result = await updateAppointmentLocation(apt.id, normalizedLocation);

      if (!result.success) {
        const errorMessage = result.error || 'No se pudo actualizar el link de la cita';
        setLocationError(errorMessage);
        showToast(errorMessage, 'error');
        return;
      }

      showToast('Link de la cita actualizado', 'success');
      handleCancelLocationEdit();
    } catch (err: any) {
      const errorMessage = err.message || 'No se pudo actualizar el link de la cita';
      setLocationError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSavingLocation(false);
    }
  }, [handleCancelLocationEdit, locationDraft, showToast, updateAppointmentLocation]);

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 md:py-12 text-zinc-500">
        <Calendar className="w-10 h-10 md:w-12 md:h-12 mb-2 md:mb-3 opacity-20" />
        <span className="text-xs md:text-sm mb-3">No hay citas programadas</span>
        {contact && (
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg hover:bg-primary-500/20 transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Agendar Cita
          </button>
        )}
        {showScheduleModal && contact && (
          <QuickScheduleModal
            onClose={() => setShowScheduleModal(false)}
            initialContact={contact}
            initialTeamMemberId={contact.team_humano_id || undefined}
            onSuccess={handleAppointmentCreated}
          />
        )}
      </div>
    );
  }

  const getStatusColor = (status?: string | null) => {
    const found = APPOINTMENT_STATUSES.find(s => s.value === status?.toLowerCase());
    return found?.color || 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  };

  const handleStatusChange = async (id: number | string, newStatus: string, aptTitulo?: string) => {
    try {
      await updateStatus(id, newStatus);
      showToast(`Cita "${aptTitulo || 'Sin título'}" actualizada a "${newStatus}"`, 'success');
    } catch (err) {
      showToast('Error al actualizar la cita', 'error');
    }
    setEditingId(null);
  };

  // Función para obtener transcripciones de una cita
  const getTranscriptionsForAppointment = (appointmentId: number | string): Transcripcion[] => {
    if (!activeContactData.transcripciones) return [];
    return activeContactData.transcripciones.filter(t => t.cita_id === appointmentId);
  };

  const formatDuration = (minutes?: number | null) => {
    if (!minutes) return '--';
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins} min`;
  };

  return (
    <div className="space-y-2 md:space-y-3">
      {/* Header con botón Agendar */}
      {contact && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
            {appointments.length} cita{appointments.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg hover:bg-primary-500/20 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Agendar Cita
          </button>
        </div>
      )}

      {showScheduleModal && contact && (
        <QuickScheduleModal
          onClose={() => setShowScheduleModal(false)}
          initialContact={contact}
          initialTeamMemberId={contact.team_humano_id || undefined}
          onSuccess={handleAppointmentCreated}
        />
      )}

      {appointments.map((apt) => {
        const enrichedAppointment = enterpriseAppointments.find(candidate =>
          candidate.id === apt.id || (!!candidate.event_id && candidate.event_id === apt.event_id)
        );
        const effectiveAppointment = enrichedAppointment
          ? {
              ...apt,
              participantes: enrichedAppointment.participantes || apt.participantes,
              metadata: enrichedAppointment.metadata || apt.metadata,
              contact: enrichedAppointment.contact || apt.contact
            }
          : apt;
        const isExpanded = expandedIds.has(apt.id);
        const transcriptions = getTranscriptionsForAppointment(apt.id);
        const hasDetails = apt.descripcion || apt.resumen_conversacion || transcriptions.length > 0;
        const startDate = apt.fecha_hora ? new Date(apt.fecha_hora) : null;
        const endDate = startDate
          ? new Date(startDate.getTime() + (apt.duracion || 30) * 60000)
          : null;
        const locationHref = getLocationHref(apt.ubicacion);
        const platformLabel = getMeetingPlatformLabel(apt.ubicacion);
        const isInternalMeeting = effectiveAppointment.metadata?.is_internal === true || effectiveAppointment.metadata?.meeting_kind === 'internal';
        const assistantIds = Array.from(new Set((effectiveAppointment.participantes || []).map(participant => participant.team_humano_id).filter((id): id is number => typeof id === 'number')));
        
        return (
        <div 
          key={apt.id}
          className="bg-zinc-900/50 border border-white/5 rounded-lg overflow-hidden hover:border-white/10 transition-colors group"
        >
          {/* Header comprimido - siempre visible */}
          <div 
            className={`p-3 md:p-4 cursor-pointer ${hasDetails ? 'hover:bg-white/[0.02]' : ''}`}
            onClick={() => hasDetails && toggleExpand(apt.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs md:text-sm font-medium text-zinc-200 truncate">
                    {apt.titulo || 'Cita sin título'}
                  </h4>
                  {hasDetails && (
                    <span className="text-zinc-500">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
                {/* Info compacta en una línea */}
                <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {startDate
                      ? startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                      : 'Sin fecha'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {startDate
                      ? `${startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}${endDate ? ` - ${endDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                      : '--:--'}
                  </span>
                  {apt.duracion ? (
                    <span>{formatDuration(apt.duracion)}</span>
                  ) : null}
                  {platformLabel ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/5 bg-white/[0.03] text-zinc-400">
                      {isSupportedMeetingLink(apt.ubicacion) ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                      {platformLabel}
                    </span>
                  ) : null}
                  {isInternalMeeting ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/15 bg-sky-500/10 text-sky-300">
                      <Calendar className="w-3 h-3" />
                      Interna
                    </span>
                  ) : null}
                  {assistantIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/10 bg-sky-500/5 text-sky-300/90">
                      <span>{assistantIds.length}</span>
                      <span>asistente{assistantIds.length > 1 ? 's' : ''}</span>
                    </span>
                  ) : null}
                  <span className="text-zinc-600">ID: {apt.id}</span>
                </div>
              </div>

              {/* Status button */}
              <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                {editingId === apt.id ? (
                  <div className="fixed right-4 z-50 bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[110px] md:min-w-[120px]">
                    {APPOINTMENT_STATUSES.map((status) => (
                      <button
                        key={status.value}
                        onClick={() => handleStatusChange(apt.id, status.value, apt.titulo || undefined)}
                        className={`w-full text-left px-2.5 md:px-3 py-1.5 md:py-2 text-[10px] md:text-xs hover:bg-white/5 flex items-center gap-2 ${
                          apt.estado === status.value ? 'text-primary-400 bg-primary-500/5' : 'text-zinc-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.color.split(' ')[0]}`} />
                        {status.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingId(apt.id)}
                    className={`text-[9px] md:text-[10px] px-2 md:px-2.5 py-0.5 md:py-1 rounded border flex items-center gap-1 md:gap-1.5 hover:opacity-80 transition-opacity ${getStatusColor(apt.estado)}`}
                  >
                    <span className="uppercase font-medium">{apt.estado || 'PENDIENTE'}</span>
                    <ChevronDown className="w-2.5 h-2.5 md:w-3 md:h-3 opacity-50" />
                  </button>
                )}
                {editingId === apt.id && (
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setEditingId(null)}
                  />
                )}
              </div>
            </div>
            
            {(apt.ubicacion || editingLocationId === apt.id) && (
              <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                {editingLocationId === apt.id ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-zinc-950/60 px-2.5 py-2">
                      {isSupportedMeetingLink(locationDraft) ? (
                        <Video className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      )}
                      <input
                        value={locationDraft}
                        onChange={(e) => {
                          setLocationDraft(e.target.value);
                          if (locationError) setLocationError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!isSavingLocation) handleSaveLocation(apt);
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelLocationEdit();
                          }
                        }}
                        placeholder="https://meet.google.com/abc-defg-hij"
                        className="flex-1 bg-transparent text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveLocation(apt)}
                        disabled={isSavingLocation || !locationDraft.trim()}
                        className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Guardar link"
                      >
                        {isSavingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={handleCancelLocationEdit}
                        disabled={isSavingLocation}
                        className="p-1 rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300 disabled:opacity-40 transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {locationError && (
                      <div className="text-[10px] text-red-400 px-1">
                        {locationError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 flex-wrap">
                    {isSupportedMeetingLink(apt.ubicacion) ? (
                      <Video className="w-3 h-3 text-cyan-400 shrink-0" />
                    ) : (
                      <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                    )}
                    {locationHref ? (
                      <a 
                        href={locationHref} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:underline flex items-center gap-1 min-w-0"
                      >
                        <span className="truncate max-w-[260px]">{normalizeAppointmentLocation(apt.ubicacion)}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-50 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-zinc-300 truncate max-w-[260px]">{apt.ubicacion}</span>
                    )}

                    <button
                      onClick={() => handleStartLocationEdit(apt)}
                      className="px-2 py-0.5 rounded-md border border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/15 hover:bg-white/[0.03] transition-colors"
                    >
                      Editar link
                    </button>
                    
                    {isSupportedMeetingLink(apt.ubicacion) && userContext?.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!invitingIds.has(apt.id) && !invitedIds.has(apt.id)) {
                            inviteMonicaToMeeting(apt);
                          }
                        }}
                        disabled={invitingIds.has(apt.id) || invitedIds.has(apt.id)}
                        className={`
                          px-2 py-0.5 rounded-md flex items-center gap-1 text-[9px] font-medium
                          transition-all duration-200 shrink-0
                          ${invitedIds.has(apt.id)
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                            : invitingIds.has(apt.id)
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 cursor-wait'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/30 cursor-pointer'
                          }
                        `}
                        title={invitedIds.has(apt.id) ? 'Monica ya fue invitada' : 'Invitar a Monica a tomar notas'}
                      >
                        {invitingIds.has(apt.id) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="hidden sm:inline">Invitando...</span>
                          </>
                        ) : invitedIds.has(apt.id) ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span className="hidden sm:inline">Invitada</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            <span className="hidden sm:inline">Invitar Monica</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {!apt.ubicacion && editingLocationId !== apt.id && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleStartLocationEdit(apt)}
                  className="px-2 py-1 rounded-md border border-dashed border-white/10 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/15 hover:bg-white/[0.03] transition-colors"
                >
                  Agregar link de reunión
                </button>
              </div>
            )}

            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setAppointmentToEdit(effectiveAppointment)}
                className="px-2 py-1 rounded-md border border-white/10 text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-white/15 hover:bg-white/[0.03] transition-colors"
              >
                Editar cita
              </button>
            </div>
            
            {/* Error de invitación */}
            {inviteError && (
              <div className="mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">
                {inviteError}
              </div>
            )}
          </div>

          {/* Contenido expandible */}
          {isExpanded && hasDetails && (
            <div className="px-3 md:px-4 pb-4 md:pb-5 border-t border-white/5 bg-gradient-to-b from-zinc-950/50 to-zinc-900/30 animate-in slide-in-from-top-2 duration-200 space-y-4">
              
              {/* 📋 Descripción de la Cita */}
              {apt.descripcion && (
                <div className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <FileText className="w-3 h-3 text-blue-400" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-zinc-200">Descripción</span>
                  </div>
                  <div className="ml-8 text-xs md:text-sm text-zinc-300 leading-relaxed bg-zinc-900/40 p-3 md:p-4 rounded-lg border border-white/5 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:text-zinc-100 prose-headings:font-medium prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-ul:my-2 prose-li:my-0.5 prose-strong:text-zinc-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {apt.descripcion}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* 📝 Resumen de la Conversación */}
              {apt.resumen_conversacion && (
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <FileText className="w-3 h-3 text-emerald-400" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-zinc-200">Resumen Previo</span>
                  </div>
                  <div className="ml-8 text-xs md:text-sm text-zinc-300 leading-relaxed bg-zinc-900/40 p-3 md:p-4 rounded-lg border border-white/5 max-h-[400px] overflow-y-auto custom-scrollbar prose prose-invert prose-sm max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:text-zinc-100 prose-headings:font-medium prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-ul:my-2 prose-ul:pl-4 prose-li:my-0.5 prose-strong:text-zinc-100 prose-blockquote:border-l-primary-500 prose-blockquote:bg-zinc-800/50 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:rounded-r prose-blockquote:not-italic prose-blockquote:text-zinc-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {apt.resumen_conversacion}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* 🎥 Transcripciones de la Reunión */}
              {transcriptions.length > 0 && (
                <div className="pt-2 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <Video className="w-3 h-3 text-purple-400" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-zinc-200">
                      Grabaciones y Transcripciones
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {transcriptions.length}
                    </span>
                  </div>
                  
                  {transcriptions.map((trans, idx) => (
                    <div key={trans.id} className="ml-8 bg-zinc-900/40 border border-white/5 rounded-lg overflow-hidden">
                      {/* Header de transcripción */}
                      <div className="px-3 md:px-4 py-2 md:py-3 bg-zinc-800/30 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Video className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Grabación #{idx + 1}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(trans.transcripcion || trans.resumen || trans.resumen_cita) && (
                            <button
                              onClick={() => { setAskMonicaData({ trans, apt }); setMonicaQuestion(''); }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors"
                            >
                              <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span className="hidden sm:inline">Preguntar a Monica</span>
                            </button>
                          )}
                          {trans.duracion && (
                            <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-zinc-500 bg-zinc-900/50 px-2 py-1 rounded">
                              <Clock className="w-3 h-3" />
                              <span>{formatDuration(trans.duracion)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-3 md:p-4 space-y-4">
                        {/* Resumen de la Cita */}
                        {trans.resumen_cita && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2 text-zinc-400">
                              <span className="text-[10px] md:text-xs font-medium">💡 Lo más importante</span>
                            </div>
                            <div className="text-xs md:text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:text-zinc-100 prose-headings:font-medium prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-ul:my-2 prose-li:my-0.5 prose-strong:text-zinc-100">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {trans.resumen_cita}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* Resumen detallado de la Reunión */}
                        {trans.resumen && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2 text-zinc-400">
                              <span className="text-[10px] md:text-xs font-medium">📋 Resumen detallado</span>
                            </div>
                            <div className="text-xs md:text-sm text-zinc-300 leading-relaxed bg-zinc-950/40 p-3 rounded-lg border border-white/5 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-p:leading-relaxed prose-headings:text-zinc-100 prose-headings:font-medium prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-ul:my-2 prose-ul:pl-4 prose-li:my-0.5 prose-strong:text-zinc-100 prose-blockquote:border-l-primary-500 prose-blockquote:bg-zinc-800/50 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:rounded-r">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {trans.resumen}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Mensaje cuando no hay contenido detallado */}
              {!apt.descripcion && !apt.resumen_conversacion && transcriptions.length === 0 && (
                <div className="pt-4 text-center py-6 text-zinc-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No hay información adicional disponible para esta cita.</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
      })}
      
      {/* Modal: Preguntar a Monica */}
      {askMonicaData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setAskMonicaData(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Preguntar a Monica</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Escribe tu consulta sobre esta reunión</p>
                </div>
              </div>
              <button
                onClick={() => setAskMonicaData(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Context summary */}
            <div className="px-4 pt-3">
              <div className="flex flex-wrap items-center gap-2 p-2.5 bg-zinc-950/60 rounded-lg border border-white/5">
                <div className="flex items-center gap-1.5">
                  <Video className="w-3 h-3 text-primary-400" />
                  <span className="text-[10px] font-medium text-zinc-300 truncate max-w-[200px]">
                    {askMonicaData.apt.titulo || 'Reunión sin título'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  {askMonicaData.trans.transcripcion && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-primary-500/10 text-primary-400">Transcripción</span>
                  )}
                  {(askMonicaData.trans.resumen || askMonicaData.trans.resumen_cita) && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-emerald-500/10 text-emerald-400">Resumen</span>
                  )}
                </div>
              </div>
            </div>

            {/* Suggested questions */}
            <div className="px-4 pt-3">
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUESTIONS.map((sq, i) => (
                  <button
                    key={i}
                    onClick={() => setMonicaQuestion(sq)}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg border border-white/5 bg-zinc-800/50 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-all duration-150"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div className="p-4">
              <div className="relative">
                <textarea
                  autoFocus
                  value={monicaQuestion}
                  onChange={(e) => setMonicaQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSendToMonica();
                    }
                  }}
                  placeholder="¿Qué quieres saber sobre esta reunión?"
                  rows={3}
                  className="w-full px-3.5 py-3 pr-12 text-sm bg-zinc-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 resize-none transition-all"
                />
                <button
                  onClick={handleSendToMonica}
                  disabled={!monicaQuestion.trim() || isSendingToMonica}
                  className="absolute right-2.5 bottom-2.5 w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {isSendingToMonica ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[9px] text-zinc-600 mt-2 text-right">Ctrl+Enter para enviar</p>
            </div>
          </div>
        </div>
      )}

      {appointmentToEdit && (
        <AssignContactToAppointmentModal
          appointment={appointmentToEdit}
          initialInvitedIds={Array.from(new Set((appointmentToEdit.participantes || []).map(participant => participant.team_humano_id).filter((id): id is number => typeof id === 'number')))}
          onClose={() => setAppointmentToEdit(null)}
          onAssigned={() => {
            void handleAppointmentUpdated();
            setAppointmentToEdit(null);
          }}
        />
      )}

      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg shadow-black/50 border backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-200 ${
                toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
               toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
               <Info className="w-4 h-4" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
