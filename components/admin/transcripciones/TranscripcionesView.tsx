'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Search,
  Loader2,
  FileText,
  Video,
  Clock,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Filter,
  X,
  Phone,
  UserPlus,
  AlertTriangle,
  Send,
  Sparkles,
  Play,
  Download,
  ExternalLink,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useTranscripcionStore,
  selectTranscripciones,
  selectSelectedTranscripcion,
  selectTranscripcionFilters,
  selectTranscripcionView,
  selectIsLoadingTranscripciones,
  selectIsLoadingMore,
  selectHasMore,
  selectTranscripcionError,
} from '@/store/transcripcionStore';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext, selectTeamMembers } from '@/store/contactStore';
import { useAdminStore, selectGlobalTeamMemberIds } from '@/store/adminStore';
import { useChatStore } from '@/store/chatStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { TranscripcionWithContext } from '@/types/transcripcion';
import { Appointment } from '@/types/contact';
import { AssignContactToAppointmentModal } from '@/components/admin/calendar/AssignContactToAppointmentModal';

// ============================================================================
// HELPERS
// ============================================================================

const formatDuration = (minutes?: number | null) => {
  if (!minutes) return '--';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins} min`;
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'Sin fecha';
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) return 'Sin fecha';
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeDate = (dateStr?: string | null) => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  return `Hace ${Math.floor(diffDays / 30)} meses`;
};

const getAsesorName = (t: TranscripcionWithContext) => {
  if (t.asesor_nombre) {
    return `${t.asesor_nombre} ${t.asesor_apellido || ''}`.trim();
  }
  return null;
};

const getContactName = (t: TranscripcionWithContext) => {
  if (t.contacto_nombre) {
    return `${t.contacto_nombre} ${t.contacto_apellido || ''}`.trim();
  }
  return null;
};

const buildMonicaMessage = (item: TranscripcionWithContext, userQuestion: string): string => {
  const titulo = item.cita_titulo || 'Reunión sin título';
  const asesor = getAsesorName(item);
  const contacto = getContactName(item);
  const parts: string[] = [
    `**Mi pregunta:** ${userQuestion}`,
    `\n---\n**Contexto de la reunión "${titulo}":**`,
  ];
  if (asesor) parts.push(`- **Asesor:** ${asesor}`);
  if (contacto) parts.push(`- **Contacto:** ${contacto}`);
  if (item.cita_fecha) parts.push(`- **Fecha:** ${formatDate(item.cita_fecha)}`);
  if (item.cita_estado) parts.push(`- **Estado:** ${item.cita_estado}`);
  if (item.resumen_cita) {
    parts.push(`\n**Resumen de cita:**\n${item.resumen_cita}`);
  }
  if (item.resumen) {
    parts.push(`\n**Resumen previo:**\n${item.resumen}`);
  }
  if (item.transcripcion) {
    parts.push(`\n**Transcripción completa:**\n${item.transcripcion}`);
  }
  return parts.join('\n');
};

const SUPPORTED_MEETING_PLATFORMS = ['meet.google.com', 'teams.microsoft.com', 'zoom.us', 'zoom.com'];

const normalizeMeetingLink = (link: string) => {
  const trimmed = link.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isSupportedMeetingLink = (link?: string | null) => {
  if (!link) return false;
  const normalized = normalizeMeetingLink(link);
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return SUPPORTED_MEETING_PLATFORMS.some(platform => hostname === platform || hostname.endsWith(`.${platform}`));
  } catch {
    return SUPPORTED_MEETING_PLATFORMS.some(platform => normalized.includes(platform));
  }
};

const MONICA_INVITE_ERROR_MESSAGES: Record<string, string> = {
  NO_CALENDAR_CONNECTED: 'El asesor no tiene calendario conectado. Debe conectar su cuenta en Configuración → Integraciones.',
  CROSS_ENTERPRISE: 'No puedes invitar a Monica en reuniones de otra empresa.',
  UNSUPPORTED_PLATFORM: 'Plataforma no soportada. Monica solo funciona con Google Meet, Teams o Zoom.',
  CREDITS_EXHAUSTED: 'Créditos de Notetaker agotados. Contacta al administrador.',
  NYLAS_ERROR: 'Error en Nylas al procesar la solicitud. Intenta de nuevo.',
};

// ============================================================================
// ASK MONICA MODAL
// ============================================================================

const SUGGESTED_QUESTIONS = [
  'Haz un resumen ejecutivo de esta reunión',
  '¿Cuáles fueron los acuerdos y próximos pasos?',
  '¿Qué objeciones o preocupaciones mencionó el cliente?',
  'Identifica las oportunidades de venta mencionadas',
];

const AskMonicaModal: React.FC<{
  item: TranscripcionWithContext;
  onClose: () => void;
  onSend: (item: TranscripcionWithContext, question: string) => void;
}> = ({ item, onClose, onSend }) => {
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const asesor = getAsesorName(item);
  const contacto = getContactName(item);
  const hasTranscripcion = !!item.transcripcion;
  const hasResumen = !!(item.resumen || item.resumen_cita);

  // Focus textarea on mount + body scroll lock
  useEffect(() => {
    textareaRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSend = async () => {
    const q = question.trim();
    if (!q) return;
    setIsSending(true);
    await onSend(item, q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
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
            onClick={onClose}
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
                {item.cita_titulo || 'Reunión sin título'}
              </span>
            </div>
            {asesor && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <User className="w-2.5 h-2.5" />{asesor}
              </span>
            )}
            {contacto && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Phone className="w-2.5 h-2.5" />{contacto}
              </span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {hasTranscripcion && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-primary-500/10 text-primary-400">Transcripción</span>
              )}
              {hasResumen && (
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
                onClick={() => setQuestion(sq)}
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
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="¿Qué quieres saber sobre esta reunión?"
              rows={3}
              className="w-full px-3.5 py-3 pr-12 text-sm bg-zinc-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 resize-none transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!question.trim() || isSending}
              className="absolute right-2.5 bottom-2.5 w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {isSending ? (
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
  );
};

const InviteMonicaByLinkModal: React.FC<{
  onClose: () => void;
  onInvite: (meetingLink: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}> = ({ onClose, onInvite, isSubmitting, error }) => {
  const [meetingLink, setMeetingLink] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedLink = useMemo(() => normalizeMeetingLink(meetingLink), [meetingLink]);
  const validationError = meetingLink.trim() && !isSupportedMeetingLink(normalizedLink)
    ? 'Ingresa un link válido de Google Meet, Teams o Zoom.'
    : null;

  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleInvite = async () => {
    if (!normalizedLink || validationError) return;
    await onInvite(normalizedLink);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInvite();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Video className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Invitar a Monica</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Pega la URL de la reunión para citas fuera del calendario</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="text"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="w-full px-3.5 py-3 text-sm bg-zinc-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/10 transition-all"
            />
            <p className="text-[10px] text-zinc-600">
              Soporta Google Meet, Microsoft Teams y Zoom. Si no incluyes `https://`, lo completaré automáticamente.
            </p>
          </div>

          {(validationError || error) && (
            <div className="px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-[10px] text-red-400">
              {validationError || error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleInvite}
              disabled={!normalizedLink || !!validationError || isSubmitting}
              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Invitar Monica
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// VIDEO PLAYER MODAL
// ============================================================================

interface VideoMediaData {
  recording?: { url: string; duration?: number; name?: string; size?: number; type?: string } | null;
  thumbnail?: { url: string } | null;
}

type MediaResult = {
  state: 'available' | 'processing' | 'not_ready' | 'failed' | 'expired' | 'not_found' | 'unknown' | 'error';
  media?: VideoMediaData;
  message?: string;
  notetaker_state?: string;
  diagnostic?: {
    requested_notetaker_id?: string;
    requested_grant_id?: string;
    transcripcion_id?: number;
    cita_id?: number;
    candidate_notetaker_ids?: string[];
    candidate_grant_ids?: string[];
    meeting_link?: string;
    grant_list_errors?: Array<{ grant_id: string; status?: number; message: string }>;
    recent_notetakers?: Array<{ id: string; name: string; state: string; created_at?: string; meeting_link?: string }>;
    recent_standalone_notetakers?: Array<{ id: string; name: string; state: string; created_at?: string }>;
    list_error?: string;
    standalone_list_error?: string;
  };
};

const fetchNotetakerMedia = async (
  notetakerId: string,
  grantId: string,
  transcripcionId?: number,
  citaId?: number
): Promise<MediaResult> => {
  try {
    const { useAuthStore } = await import('../../../store/authStore');
    const accessToken = useAuthStore.getState().session?.access_token;

    const params = new URLSearchParams();
    if (notetakerId) params.set('notetaker_id', notetakerId);
    if (grantId) params.set('grant_id', grantId);
    if (typeof transcripcionId === 'number') params.set('transcripcion_id', String(transcripcionId));
    if (typeof citaId === 'number') params.set('cita_id', String(citaId));

    const res = await fetch(`/api/nylas/notetaker-media?${params.toString()}`, {
      credentials: 'include',
      headers: {
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      return { state: 'error', message: data.error || 'Error al obtener el video' };
    }
    return data;
  } catch {
    return { state: 'error', message: 'Error de conexión al obtener el video' };
  }
};

const VideoPlayerModal: React.FC<{
  item: TranscripcionWithContext;
  onClose: () => void;
}> = ({ item, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const hasNotetaker = !!item.notetaker_id;
    const hasCachedVideo = !!item.video_url;
    const hasContextLookup = !!item.id || !!item.cita_id;

    if (!hasNotetaker && !hasCachedVideo && !hasContextLookup) {
      setResult({ state: 'error', message: 'No hay datos de grabación para esta transcripción.' });
      setLoading(false);
      return;
    }

    // If no grant_id and no cached video, we still try (standalone endpoint)
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await fetchNotetakerMedia(
        item.notetaker_id || '',
        item.grant_id || '',
        item.id,
        item.cita_id || undefined
      );
      if (cancelled) return;
      setResult(data);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [item.id, item.cita_id, item.notetaker_id, item.grant_id, item.video_url, retryCount]);

  const state = result?.state;
  const recordingUrl = result?.media?.recording?.url;
  const thumbnailUrl = result?.media?.thumbnail?.url;
  const canRetry = state === 'processing' || state === 'not_ready' || state === 'error' || state === 'unknown';

  const stateConfig: Record<string, { icon: React.ReactNode; title: string; color: string }> = {
    processing:  { icon: <Loader2 className="w-8 h-8 animate-spin opacity-50" />, title: 'Procesando video', color: 'text-primary-400' },
    not_ready:   { icon: <Clock className="w-8 h-8 opacity-40" />,                title: 'Reunión en curso', color: 'text-blue-400' },
    failed:      { icon: <AlertTriangle className="w-8 h-8 opacity-40" />,         title: 'Grabación fallida', color: 'text-red-400' },
    expired:     { icon: <Video className="w-8 h-8 opacity-20" />,                 title: 'Grabación expirada', color: 'text-zinc-400' },
    not_found:   { icon: <AlertTriangle className="w-8 h-8 opacity-30" />,         title: 'Grabación no disponible', color: 'text-amber-400' },
    unknown:     { icon: <AlertTriangle className="w-8 h-8 opacity-30" />,         title: 'Estado desconocido', color: 'text-amber-400' },
    error:       { icon: <AlertTriangle className="w-8 h-8 opacity-30" />,         title: 'Error', color: 'text-red-400' },
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/60 animate-in zoom-in-95 fade-in duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-primary-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100 truncate">
                {item.cita_titulo || 'Grabación de reunión'}
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {formatDateTime(item.cita_fecha || item.created_at)}
                {item.duracion ? ` · ${formatDuration(item.duracion)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {recordingUrl && (
              <>
                <a
                  href={recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                  title="Abrir en nueva pestaña"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href={recordingUrl}
                  download={`reunion_${item.id}.mp4`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                  title="Descargar video"
                >
                  <Download className="w-4 h-4" />
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
              <span className="text-xs text-zinc-500">Consultando estado de la grabación...</span>
            </div>
          )}

          {!loading && state === 'available' && recordingUrl && (
            <video
              className="w-full rounded-lg bg-black"
              controls
              autoPlay={false}
              poster={thumbnailUrl || undefined}
              src={recordingUrl}
            >
              Tu navegador no soporta la reproducción de video.
            </video>
          )}

          {!loading && state && state !== 'available' && (() => {
            const cfg = stateConfig[state] || stateConfig.error;
            return (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className={cfg.color}>{cfg.icon}</div>
                <span className={`text-sm font-medium ${cfg.color}`}>{cfg.title}</span>
                <span className="text-xs text-zinc-600 text-center max-w-sm leading-relaxed">
                  {result?.message || 'No se pudo obtener la grabación.'}
                </span>
                {result?.notetaker_state && (
                  <span className="text-[10px] text-zinc-700 font-mono mt-1">
                    Estado Nylas: {result.notetaker_state}
                  </span>
                )}
                {result?.diagnostic && (
                  <div className="mt-3 w-full max-w-md text-left bg-zinc-800/50 border border-white/5 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Diagnóstico</p>
                    <p className="text-[10px] text-zinc-500 font-mono break-all">
                      notetaker_id: {result.diagnostic.requested_notetaker_id || 'N/A'}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono break-all">
                      grant_id: {result.diagnostic.requested_grant_id || 'N/A'}
                    </p>
                    {typeof result.diagnostic.transcripcion_id === 'number' && (
                      <p className="text-[10px] text-zinc-500 font-mono break-all">
                        transcripcion_id: {result.diagnostic.transcripcion_id}
                      </p>
                    )}
                    {typeof result.diagnostic.cita_id === 'number' && (
                      <p className="text-[10px] text-zinc-500 font-mono break-all">
                        cita_id: {result.diagnostic.cita_id}
                      </p>
                    )}
                    {result.diagnostic.candidate_notetaker_ids && result.diagnostic.candidate_notetaker_ids.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-400 mt-1">IDs candidatos de notetaker:</p>
                        {result.diagnostic.candidate_notetaker_ids.map((id, i) => (
                          <p key={i} className="text-[10px] text-zinc-500 font-mono break-all">
                            {id}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.diagnostic.candidate_grant_ids && result.diagnostic.candidate_grant_ids.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-400 mt-1">Grants candidatos:</p>
                        {result.diagnostic.candidate_grant_ids.map((id, i) => (
                          <p key={i} className="text-[10px] text-zinc-500 font-mono break-all">
                            {id}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.diagnostic.meeting_link && (
                      <p className="text-[10px] text-zinc-500 font-mono break-all">
                        meeting_link: {result.diagnostic.meeting_link}
                      </p>
                    )}
                    {result.diagnostic.grant_list_errors && result.diagnostic.grant_list_errors.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-400 mt-1">Errores al listar grants:</p>
                        {result.diagnostic.grant_list_errors.map((entry, i) => (
                          <p key={i} className="text-[10px] text-red-400 font-mono break-all">
                            {entry.grant_id}: {entry.message}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.diagnostic.recent_notetakers && result.diagnostic.recent_notetakers.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-400 mt-1">Notetakers en este grant:</p>
                        {result.diagnostic.recent_notetakers.map((n, i) => (
                          <p key={i} className="text-[10px] text-zinc-500 font-mono truncate">
                            {n.id} [{n.state}] {n.name}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.diagnostic.recent_standalone_notetakers && result.diagnostic.recent_standalone_notetakers.length > 0 && (
                      <div>
                        <p className="text-[10px] text-zinc-400 mt-1">Standalone notetakers:</p>
                        {result.diagnostic.recent_standalone_notetakers.map((n, i) => (
                          <p key={i} className="text-[10px] text-zinc-500 font-mono truncate">
                            {n.id} [{n.state}] {n.name}
                          </p>
                        ))}
                      </div>
                    )}
                    {result.diagnostic.list_error && (
                      <p className="text-[10px] text-red-500">List error: {result.diagnostic.list_error}</p>
                    )}
                    {result.diagnostic.standalone_list_error && (
                      <p className="text-[10px] text-red-500">Standalone list error: {result.diagnostic.standalone_list_error}</p>
                    )}
                    {(!result.diagnostic.recent_notetakers || result.diagnostic.recent_notetakers.length === 0) &&
                     (!result.diagnostic.recent_standalone_notetakers || result.diagnostic.recent_standalone_notetakers.length === 0) &&
                     (!result.diagnostic.grant_list_errors || result.diagnostic.grant_list_errors.length === 0) && (
                      <p className="text-[10px] text-zinc-600">No se encontraron notetakers relacionados en Nylas con los identificadores probados.</p>
                    )}
                  </div>
                )}
                {canRetry && (
                  <button
                    onClick={() => setRetryCount(c => c + 1)}
                    className="mt-3 px-4 py-1.5 text-xs font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg hover:bg-primary-500/20 transition-colors"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TRANSCRIPCION CARD
// ============================================================================

const TranscripcionCard: React.FC<{
  item: TranscripcionWithContext;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onSendToMonica: (item: TranscripcionWithContext) => void;
  onAssignContact?: (item: TranscripcionWithContext) => void;
  onPlayVideo?: (item: TranscripcionWithContext) => void;
}> = ({ item, isExpanded, onToggle, onSelect, onSendToMonica, onAssignContact, onPlayVideo }) => {
  const asesor = getAsesorName(item);
  const contacto = getContactName(item);
  const hasContent = !!(item.resumen || item.resumen_cita || item.transcripcion);
  const sinContacto = !item.cita_contacto_id;

  return (
    <div className={`bg-zinc-900/50 border rounded-lg overflow-hidden hover:border-white/10 transition-colors group ${sinContacto ? 'border-amber-500/10' : 'border-white/5'}`}>
      {/* Header */}
      <div
        className="p-3 md:p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-primary-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs md:text-sm font-medium text-zinc-200 truncate">
                {item.cita_titulo || 'Reunión sin título'}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                <span className={`flex items-center gap-1 ${asesor ? '' : 'text-zinc-600'}`}>
                  <User className="w-3 h-3" />
                  {asesor || 'Asesor desconocido'}
                </span>
                {contacto ? (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {contacto}
                  </span>
                ) : sinContacto ? (
                  <span className="flex items-center gap-1 text-amber-400/80">
                    <AlertTriangle className="w-3 h-3" />
                    Sin contacto
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(item.video_url || (item.notetaker_id && item.grant_id)) && onPlayVideo && (
              <button
                onClick={(e) => { e.stopPropagation(); onPlayVideo(item); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg hover:bg-primary-500/20 transition-colors"
                title="Ver grabación"
              >
                <Play className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden md:inline">Ver video</span>
              </button>
            )}
            {(item.transcripcion || item.resumen || item.resumen_cita) && (
              <button
                onClick={(e) => { e.stopPropagation(); onSendToMonica(item); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors"
              >
                <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden md:inline">Preguntar a Monica</span>
              </button>
            )}
            <span className="text-[10px] text-zinc-600 hidden md:block">
              {formatRelativeDate(item.cita_fecha || item.created_at)}
            </span>
            {hasContent && (
              <span className="text-zinc-500">
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span className="text-zinc-400">{formatDate(item.cita_fecha || item.created_at)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span className="text-zinc-400">{formatDuration(item.duracion)}</span>
          </span>
          {item.cita_estado && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-800 text-zinc-400 uppercase tracking-wider">
              {item.cita_estado}
            </span>
          )}
          {item.resumen_cita && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400">
              Resumen IA
            </span>
          )}
        </div>
      </div>

      {/* Expanded: Preview */}
      {isExpanded && (
        <div className="border-t border-white/5 p-3 md:p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {/* Resumen de Cita */}
          {item.resumen_cita && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-zinc-400">
                <FileText className="w-3 h-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Resumen de Cita</span>
              </div>
              <div className="text-[10px] md:text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-lg border border-white/5 prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:my-2 line-clamp-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.resumen_cita}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Resumen General */}
          {item.resumen && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-zinc-400">
                <FileText className="w-3 h-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Resumen</span>
              </div>
              <div className="text-[10px] md:text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-lg border border-white/5 prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:my-2 line-clamp-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.resumen}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {item.transcripcion && (
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                className="text-[10px] md:text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
              >
                Ver transcripción completa →
              </button>
            )}
            {sinContacto && item.cita_id && onAssignContact && (
              <button
                onClick={(e) => { e.stopPropagation(); onAssignContact(item); }}
                className="flex items-center gap-1 text-[10px] md:text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors bg-amber-500/5 border border-amber-500/10 rounded px-1.5 py-0.5"
              >
                <UserPlus className="w-3 h-3" />
                Asignar contacto
              </button>
            )}
            {item.cita_ubicacion && (
              <a
                href={item.cita_ubicacion}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] md:text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
              >
                Link reunión ↗
              </a>
            )}
          </div>

          {/* No content */}
          {!item.resumen && !item.resumen_cita && !item.transcripcion && (
            <div className="text-center py-3 text-zinc-600 text-xs">
              No hay contenido disponible aún
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CalendarTranscripcionesNav: React.FC<{
  onOpenCalendar: () => void;
}> = ({ onOpenCalendar }) => {
  return (
    <div className="flex bg-zinc-900 rounded-lg border border-white/5 p-0.5 md:p-1">
      <button
        onClick={onOpenCalendar}
        className="flex items-center justify-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
        title="Abrir Calendario"
      >
        <Calendar className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Calendario</span>
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md bg-primary-500/20 text-primary-400 shadow-sm cursor-default"
        title="Vista actual: Transcripciones"
        aria-current="page"
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Transcripciones</span>
      </button>
    </div>
  );
};

// ============================================================================
// TRANSCRIPCION DETAIL VIEW
// ============================================================================

const TranscripcionDetailView: React.FC<{
  item: TranscripcionWithContext;
  onBack: () => void;
  onOpenCalendar?: () => void;
  onSendToMonica: (item: TranscripcionWithContext) => void;
  onAssignContact?: (item: TranscripcionWithContext) => void;
  onPlayVideo?: (item: TranscripcionWithContext) => void;
  onOpenInviteMonicaModal?: () => void;
}> = ({ item, onBack, onOpenCalendar, onSendToMonica, onAssignContact, onPlayVideo, onOpenInviteMonicaModal }) => {
  const asesor = getAsesorName(item);
  const contacto = getContactName(item);
  const hasContent = !!(item.transcripcion || item.resumen || item.resumen_cita);
  const sinContacto = !item.cita_contacto_id;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-white/5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a lista
          </button>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {onOpenCalendar && <CalendarTranscripcionesNav onOpenCalendar={onOpenCalendar} />}
            {onOpenInviteMonicaModal && (
              <button
                onClick={onOpenInviteMonicaModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-colors"
              >
                <Video className="w-3.5 h-3.5" />
                Invitar por URL
              </button>
            )}
            {(item.video_url || (item.notetaker_id && item.grant_id)) && onPlayVideo && (
              <button
                onClick={() => onPlayVideo(item)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg hover:bg-primary-500/20 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Ver grabación
              </button>
            )}
            {sinContacto && item.cita_id && onAssignContact && (
              <button
                onClick={() => onAssignContact(item)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Asignar contacto
              </button>
            )}
            {hasContent && (
              <button
                onClick={() => onSendToMonica(item)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Preguntar a Monica
              </button>
            )}
          </div>
        </div>
        {/* Banner sin contacto */}
        {sinContacto && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] md:text-xs text-amber-400/90">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Esta reunión no tiene contacto asignado</span>
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
            <Video className="w-5 h-5 text-primary-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm md:text-base font-semibold text-zinc-100">
              {item.cita_titulo || 'Reunión sin título'}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] md:text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDateTime(item.cita_fecha || item.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(item.duracion)}
              </span>
              <span className={`flex items-center gap-1 ${asesor ? '' : 'text-zinc-600'}`}>
                <User className="w-3 h-3" />
                {asesor || 'Asesor desconocido'}
              </span>
              {contacto ? (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {contacto}
                </span>
              ) : sinContacto ? (
                <span className="flex items-center gap-1 text-amber-400/80">
                  <AlertTriangle className="w-3 h-3" />
                  Sin contacto
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Resumen de Cita */}
        {item.resumen_cita && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-zinc-400">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Resumen de Cita</span>
            </div>
            <div className="text-xs md:text-sm text-zinc-300 bg-zinc-950/50 p-4 rounded-lg border border-white/5 prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.resumen_cita}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Resumen General */}
        {item.resumen && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-zinc-400">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Resumen Previo</span>
            </div>
            <div className="text-xs md:text-sm text-zinc-300 bg-zinc-950/50 p-4 rounded-lg border border-white/5 prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.resumen}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Transcripción Completa */}
        {item.transcripcion && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-zinc-400">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Transcripción Completa</span>
            </div>
            <div className="text-xs md:text-sm text-zinc-300 bg-zinc-950/50 p-4 rounded-lg border border-white/5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                {item.transcripcion}
              </pre>
            </div>
          </div>
        )}

        {/* No content */}
        {!item.resumen && !item.resumen_cita && !item.transcripcion && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <FileText className="w-12 h-12 mb-3 opacity-20" />
            <span className="text-sm">No hay contenido disponible</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN VIEW
// ============================================================================

export const TranscripcionesView: React.FC = () => {
  const enterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const teamMembers = useContactStore(selectTeamMembers);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);

  // Global team filter from AdminPanel header (same pattern as CalendarView)
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const setAdminActiveView = useAdminStore(state => state.setActiveView);

  // Store state
  const transcripciones = useTranscripcionStore(selectTranscripciones);
  const selectedTranscripcion = useTranscripcionStore(selectSelectedTranscripcion);
  const filters = useTranscripcionStore(selectTranscripcionFilters);
  const view = useTranscripcionStore(selectTranscripcionView);
  const isLoading = useTranscripcionStore(selectIsLoadingTranscripciones);
  const isLoadingMore = useTranscripcionStore(selectIsLoadingMore);
  const hasMore = useTranscripcionStore(selectHasMore);
  const error = useTranscripcionStore(selectTranscripcionError);

  // Store actions
  const fetchTranscripciones = useTranscripcionStore(state => state.fetchTranscripciones);
  const fetchMore = useTranscripcionStore(state => state.fetchMore);
  const selectTranscripcion = useTranscripcionStore(state => state.selectTranscripcion);
  const setFilters = useTranscripcionStore(state => state.setFilters);
  const resetFilters = useTranscripcionStore(state => state.resetFilters);
  const setView = useTranscripcionStore(state => state.setView);

  // Engagement tracking
  usePageTracking('transcripciones');
  const trackAction = useActionTracking('transcripciones');

  // Local UI state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [onlySinContacto, setOnlySinContacto] = useState(false);
  const [assigningItem, setAssigningItem] = useState<TranscripcionWithContext | null>(null);
  const [askMonicaItem, setAskMonicaItem] = useState<TranscripcionWithContext | null>(null);
  const [videoItem, setVideoItem] = useState<TranscripcionWithContext | null>(null);
  const [showInviteMonicaModal, setShowInviteMonicaModal] = useState(false);
  const [isInvitingMonicaByLink, setIsInvitingMonicaByLink] = useState(false);
  const [inviteMonicaByLinkError, setInviteMonicaByLinkError] = useState<string | null>(null);
  const [inviteMonicaByLinkSuccess, setInviteMonicaByLinkSuccess] = useState<string | null>(null);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchMore]);

  // Ensure team members are loaded
  useEffect(() => {
    if (enterpriseId && teamMembers.length === 0) {
      fetchTeamMembers(false, enterpriseId);
    }
  }, [enterpriseId, fetchTeamMembers, teamMembers.length]);

  // Fetch data when enterprise changes
  useEffect(() => {
    if (enterpriseId && userContext) {
      fetchTranscripciones(
        enterpriseId,
        userContext.roleId,
        userContext.id,
        userContext.grantId
      );
    }
  }, [enterpriseId, userContext, fetchTranscripciones]);

  // Client-side filtering
  const filteredTranscripciones = useMemo(() => {
    let result = transcripciones;

    // Search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(t =>
        (t.cita_titulo?.toLowerCase().includes(q)) ||
        (t.resumen_cita?.toLowerCase().includes(q)) ||
        (t.resumen?.toLowerCase().includes(q)) ||
        (t.asesor_nombre?.toLowerCase().includes(q)) ||
        (t.asesor_apellido?.toLowerCase().includes(q)) ||
        (t.contacto_nombre?.toLowerCase().includes(q)) ||
        (t.contacto_apellido?.toLowerCase().includes(q)) ||
        (t.transcripcion?.toLowerCase().includes(q))
      );
    }

    // Global team filter (from AdminPanel header)
    if (globalTeamMemberIds.length > 0) {
      result = result.filter(t => 
        typeof t.cita_team_humano_id === 'number' && globalTeamMemberIds.includes(t.cita_team_humano_id)
      );
    }

    // Date range filter
    if (filters.dateRange.from) {
      const from = new Date(filters.dateRange.from);
      result = result.filter(t => {
        const d = new Date(t.cita_fecha || t.created_at);
        return d >= from;
      });
    }
    if (filters.dateRange.to) {
      const to = new Date(filters.dateRange.to);
      to.setHours(23, 59, 59, 999);
      result = result.filter(t => {
        const d = new Date(t.cita_fecha || t.created_at);
        return d <= to;
      });
    }

    // "Solo sin contacto" local filter
    if (onlySinContacto) {
      result = result.filter(t => !t.cita_contacto_id);
    }

    return result;
  }, [transcripciones, filters, globalTeamMemberIds, onlySinContacto]);

  // Handlers
  const handleToggleExpand = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
    trackAction('transcripcion.toggle_expand', { id });
  }, [trackAction]);

  const handleSelectTranscripcion = useCallback((item: TranscripcionWithContext) => {
    selectTranscripcion(item);
    trackAction('transcripcion.view_detail', { id: item.id });
  }, [selectTranscripcion, trackAction]);

  const handleBack = useCallback(() => {
    setView('list');
  }, [setView]);

  const handleOpenCalendar = useCallback(() => {
    trackAction('transcripcion.open_calendar');
    setAdminActiveView('calendar');
  }, [setAdminActiveView, trackAction]);

  const handleOpenAskMonica = useCallback((item: TranscripcionWithContext) => {
    setAskMonicaItem(item);
    trackAction('transcripcion.ask_monica_open', { id: item.id });
  }, [trackAction]);

  const handleSendToMonica = useCallback(async (item: TranscripcionWithContext, question: string) => {
    const message = buildMonicaMessage(item, question);
    await useChatStore.getState().createNewSession();
    useChatStore.getState().setPendingMessage(message);
    setAskMonicaItem(null);
    useAdminStore.getState().closeAdminPanel();
    trackAction('transcripcion.send_to_monica', { id: item.id, question });
  }, [trackAction]);

  const handleAssignContact = useCallback((item: TranscripcionWithContext) => {
    setAssigningItem(item);
    trackAction('transcripcion.assign_contact_open', { id: item.id, citaId: item.cita_id });
  }, [trackAction]);

  const handlePlayVideo = useCallback((item: TranscripcionWithContext) => {
    setVideoItem(item);
    trackAction('transcripcion.play_video', { id: item.id, notetakerId: item.notetaker_id });
  }, [trackAction]);

  const handleOpenInviteMonicaModal = useCallback(() => {
    setInviteMonicaByLinkError(null);
    setShowInviteMonicaModal(true);
    trackAction('transcripcion.invite_monica_by_link_open');
  }, [trackAction]);

  const handleCloseInviteMonicaModal = useCallback(() => {
    setShowInviteMonicaModal(false);
    setInviteMonicaByLinkError(null);
  }, []);

  const handleInviteMonicaByLink = useCallback(async (meetingLink: string) => {
    if (!userContext?.id) {
      setInviteMonicaByLinkError('No se encontró tu perfil de equipo para invitar a Monica.');
      return;
    }

    setIsInvitingMonicaByLink(true);
    setInviteMonicaByLinkError(null);

    try {
      const { useAuthStore } = await import('@/store/authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch('/api/nylas/notetaker', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        body: JSON.stringify({
          meeting_link: meetingLink,
          team_humano_id: userContext.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const friendlyMessage = data.code && MONICA_INVITE_ERROR_MESSAGES[data.code]
          ? MONICA_INVITE_ERROR_MESSAGES[data.code]
          : data.error || 'Error al invitar a Monica';
        throw new Error(friendlyMessage);
      }

      setShowInviteMonicaModal(false);
      setInviteMonicaByLinkSuccess('Monica fue invitada a la reunión.');
      trackAction('transcripcion.invite_monica_by_link_success', {
        host: (() => {
          try {
            return new URL(meetingLink).hostname;
          } catch {
            return 'unknown';
          }
        })(),
      });
      setTimeout(() => setInviteMonicaByLinkSuccess(null), 4000);
    } catch (error: any) {
      const message = error?.message || 'Error al invitar a Monica';
      setInviteMonicaByLinkError(message);
      trackAction('transcripcion.invite_monica_by_link_error');
    } finally {
      setIsInvitingMonicaByLink(false);
    }
  }, [trackAction, userContext?.id]);

  const handleAssignComplete = useCallback(() => {
    setAssigningItem(null);
    // Invalidar cache y refrescar transcripciones
    if (enterpriseId && userContext) {
      useTranscripcionStore.getState().clearStore();
      fetchTranscripciones(enterpriseId, userContext.roleId, userContext.id, userContext.grantId);
    }
  }, [enterpriseId, userContext, fetchTranscripciones]);

  // Build minimal Appointment object for AssignContactToAppointmentModal
  const assigningAppointment: Appointment | null = assigningItem?.cita_id ? {
    id: assigningItem.cita_id,
    titulo: assigningItem.cita_titulo,
    fecha_hora: assigningItem.cita_fecha,
    estado: assigningItem.cita_estado,
    ubicacion: assigningItem.cita_ubicacion,
    team_humano_id: assigningItem.cita_team_humano_id,
    empresa_id: assigningItem.cita_empresa_id,
    contacto_id: assigningItem.cita_contacto_id,
  } : null;

  // Can filter by team member? (roles 1-2)
  const canFilterByMember = userContext?.roleId === 1 || userContext?.roleId === 2;

  // Count sin contacto for badge
  const sinContactoCount = useMemo(() => transcripciones.filter(t => !t.cita_contacto_id).length, [transcripciones]);

  // ========================================================================
  // DETAIL VIEW
  // ========================================================================
  if (view === 'detail' && selectedTranscripcion) {
    return (
      <>
        <TranscripcionDetailView item={selectedTranscripcion} onBack={handleBack} onOpenCalendar={handleOpenCalendar} onSendToMonica={handleOpenAskMonica} onAssignContact={handleAssignContact} onPlayVideo={handlePlayVideo} onOpenInviteMonicaModal={userContext?.id ? handleOpenInviteMonicaModal : undefined} />
        {assigningAppointment && (
          <AssignContactToAppointmentModal
            appointment={assigningAppointment}
            onClose={() => setAssigningItem(null)}
            onAssigned={handleAssignComplete}
          />
        )}
        {askMonicaItem && (
          <AskMonicaModal
            item={askMonicaItem}
            onClose={() => setAskMonicaItem(null)}
            onSend={handleSendToMonica}
          />
        )}
        {videoItem && (
          <VideoPlayerModal
            item={videoItem}
            onClose={() => setVideoItem(null)}
          />
        )}
        {showInviteMonicaModal && (
          <InviteMonicaByLinkModal
            onClose={handleCloseInviteMonicaModal}
            onInvite={handleInviteMonicaByLink}
            isSubmitting={isInvitingMonicaByLink}
            error={inviteMonicaByLinkError}
          />
        )}
        {inviteMonicaByLinkSuccess && (
          <div className="fixed bottom-4 right-4 z-[95] px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-xl text-xs text-emerald-400 shadow-lg shadow-black/20">
            {inviteMonicaByLinkSuccess}
          </div>
        )}
      </>
    );
  }

  // ========================================================================
  // LIST VIEW
  // ========================================================================
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-4 space-y-3">
        {/* Title + count */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-primary-400" />
            <span className="text-xs text-zinc-400 font-medium">
              {filteredTranscripciones.length} transcripci{filteredTranscripciones.length !== 1 ? 'ones' : 'ón'}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <CalendarTranscripcionesNav onOpenCalendar={handleOpenCalendar} />
            {userContext?.id && (
              <button
                onClick={handleOpenInviteMonicaModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-colors"
              >
                <Video className="w-3.5 h-3.5" />
                Invitar por URL
              </button>
            )}
            {(filters.search || filters.dateRange.from || filters.dateRange.to || onlySinContacto) && (
              <button
                onClick={() => { resetFilters(); setOnlySinContacto(false); trackAction('transcripcion.reset_filters'); }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por título, asesor, contacto o contenido..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900/80 border border-white/5 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/30 transition-colors"
          />
          {filters.search && (
            <button
              onClick={() => setFilters({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter toggle + quick filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-lg border transition-colors ${
              showFilters
                ? 'text-primary-400 bg-primary-500/10 border-primary-500/20'
                : 'text-zinc-500 bg-zinc-900/50 border-white/5 hover:border-white/10'
            }`}
          >
            <Filter className="w-3 h-3" />
            Filtros
          </button>
          {sinContactoCount > 0 && (
            <button
              onClick={() => { setOnlySinContacto(!onlySinContacto); trackAction('transcripcion.filter_sin_contacto', { active: !onlySinContacto }); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-lg border transition-colors ${
                onlySinContacto
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-zinc-500 bg-zinc-900/50 border-white/5 hover:border-white/10'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              Sin contacto ({sinContactoCount})
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-3 bg-zinc-900/30 rounded-lg border border-white/5 animate-in slide-in-from-top-2 duration-200">
            {/* Global team filter indicator */}
            {globalTeamMemberIds.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-primary-500/10 border border-primary-500/20 rounded-md text-[10px] text-primary-400">
                <User className="w-3 h-3" />
                <span>Filtro equipo: {globalTeamMemberIds.length} selec.</span>
              </div>
            )}

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-zinc-500 uppercase tracking-wider font-medium">Desde</label>
              <input
                type="date"
                value={filters.dateRange.from || ''}
                onChange={(e) => setFilters({ dateRange: { ...filters.dateRange, from: e.target.value || null } })}
                className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-primary-500/50"
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-zinc-500 uppercase tracking-wider font-medium">Hasta</label>
              <input
                type="date"
                value={filters.dateRange.to || ''}
                onChange={(e) => setFilters({ dateRange: { ...filters.dateRange, to: e.target.value || null } })}
                className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-primary-500/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
              <span className="text-xs text-zinc-500">Cargando transcripciones...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            <span>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredTranscripciones.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <Video className="w-12 h-12 mb-3 opacity-20" />
            <span className="text-sm font-medium">No hay transcripciones</span>
            <span className="text-xs text-zinc-600 mt-1 text-center max-w-xs">
              {transcripciones.length > 0
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Las transcripciones aparecerán aquí después de las reuniones con Monica AI'
              }
            </span>
          </div>
        )}

        {/* List */}
        {!isLoading && filteredTranscripciones.map((item) => (
          <TranscripcionCard
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggle={() => handleToggleExpand(item.id)}
            onSelect={() => handleSelectTranscripcion(item)}
            onSendToMonica={handleOpenAskMonica}
            onAssignContact={handleAssignContact}
            onPlayVideo={handlePlayVideo}
          />
        ))}

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
            <span className="ml-2 text-[10px] text-zinc-500">Cargando más...</span>
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {!isLoading && hasMore && <div ref={sentinelRef} className="h-1" />}

        {/* End of list */}
        {!isLoading && !hasMore && transcripciones.length > 0 && (
          <div className="text-center py-3 text-[10px] text-zinc-600">
            {transcripciones.length} transcripciones cargadas
          </div>
        )}
      </div>

      {/* Assign Contact Modal */}
      {assigningAppointment && (
        <AssignContactToAppointmentModal
          appointment={assigningAppointment}
          onClose={() => setAssigningItem(null)}
          onAssigned={handleAssignComplete}
        />
      )}

      {/* Ask Monica Modal */}
      {askMonicaItem && (
        <AskMonicaModal
          item={askMonicaItem}
          onClose={() => setAskMonicaItem(null)}
          onSend={handleSendToMonica}
        />
      )}

      {/* Video Player Modal */}
      {videoItem && (
        <VideoPlayerModal
          item={videoItem}
          onClose={() => setVideoItem(null)}
        />
      )}
      {showInviteMonicaModal && (
        <InviteMonicaByLinkModal
          onClose={handleCloseInviteMonicaModal}
          onInvite={handleInviteMonicaByLink}
          isSubmitting={isInvitingMonicaByLink}
          error={inviteMonicaByLinkError}
        />
      )}
      {inviteMonicaByLinkSuccess && (
        <div className="fixed bottom-4 right-4 z-[95] px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-xl text-xs text-emerald-400 shadow-lg shadow-black/20">
          {inviteMonicaByLinkSuccess}
        </div>
      )}
    </div>
  );
};
