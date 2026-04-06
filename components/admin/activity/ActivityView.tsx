'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Inbox,
  Lock,
  MessageSquareReply,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize-html';
import {
  useAdminStore,
  selectGlobalTeamMemberIds,
  selectIsMaximized,
  selectIsTeamFilterRestricted,
  DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED,
  DASHBOARD_CONTENT_MAX_WIDTH_NORMAL,
} from '@/store/adminStore';
import { useContactStore, selectIsObservationMode, selectSelectedEnterpriseId, selectUserContext } from '@/store/contactStore';
import {
  ActivityTab,
  ActivityMetrics,
  deriveActivityMetrics,
  filterActivityNotifications,
  useActivityNotificationsStore,
} from '@/store/activityNotificationsStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import {
  Notification,
  formatAdvisorName,
  formatContactName,
  getNotificationTypeColor,
  getNotificationTypeLabel,
  getRelativeTime,
  isHumanInTheLoopNotification,
} from '@/types/notification';

// ============================================================================
// TYPES
// ============================================================================

type ScreenId = 'inbox' | 'metrics' | 'archived';

const FILTER_TABS: { id: ActivityTab; label: string }[] = [
  { id: 'requires_response', label: 'Req. respuesta' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'responded', label: 'Respondidas' },
  { id: 'all', label: 'Todas' },
];

// ============================================================================
// HELPERS
// ============================================================================

const formatFullDate = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isWithin24Hours = (ultimaInteraccion: string | null | undefined): boolean => {
  if (!ultimaInteraccion) return false;
  const lastInteraction = new Date(ultimaInteraccion);
  const now = new Date();
  const diffMs = now.getTime() - lastInteraction.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours <= 24;
};

const getTimeRemaining = (ultimaInteraccion: string | null | undefined): string => {
  if (!ultimaInteraccion) return '';
  const lastInteraction = new Date(ultimaInteraccion);
  const windowEnd = new Date(lastInteraction.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = windowEnd.getTime() - now.getTime();

  if (diffMs <= 0) return 'Ventana cerrada';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${minutes}m restantes`;
};

const formatLastInteraction = (ultimaInteraccion: string | null | undefined): string => {
  if (!ultimaInteraccion) return 'Sin interacción registrada';
  const date = new Date(ultimaInteraccion);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Hace menos de 1 hora';
  if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  if (diffDays === 1) return 'Hace 1 día';
  return `Hace ${diffDays} días`;
};

const getWindowStatus = (notification: Notification) => {
  const ultimaInteraccion = notification.contact?.ultima_interaccion || notification.metadata?.ultima_interaccion || notification.metadata?.contact_ultima_interaccion;
  const origen = (notification.contact?.origen || notification.metadata?.contact_origen || notification.metadata?.origen_contacto || notification.metadata?.channel || '')
    .toString()
    .trim()
    .toLowerCase();
  const isWhatsapp = origen === 'whatsapp';
  const within24h = isWhatsapp && isWithin24Hours(ultimaInteraccion);
  const timeRemaining = isWhatsapp ? getTimeRemaining(ultimaInteraccion) : '';
  const lastInteraction = formatLastInteraction(ultimaInteraccion);
  return { ultimaInteraccion: ultimaInteraccion || null, within24h, timeRemaining, lastInteraction, isWhatsapp };
};

// ============================================================================
// NOTIFICATION ROW (expandible inline)
// ============================================================================

const NotificationRow: React.FC<{
  notification: Notification;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ notification, isExpanded, onToggle }) => {
  
  const isHitl = isHumanInTheLoopNotification(notification);
  const hasResponse = !!notification.respuesta;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full border rounded-xl overflow-hidden transition-colors text-left ${isExpanded ? 'border-primary-500/30 bg-primary-500/[0.03]' : 'border-white/5 bg-zinc-900/50 hover:border-white/10 hover:bg-white/[0.02]'}`}
    >
      {/* Collapsed row — click to expand */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2">
        {/* Unread dot */}
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${!notification.visto ? 'bg-sky-400' : 'bg-transparent'}`} />

        {/* HITL badge */}
        {isHitl && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/20 shrink-0">HITL</span>}

        {/* Contact name */}
        <span className="text-xs font-medium text-zinc-200 truncate min-w-0">{formatContactName(notification.contact)}</span>

        {/* Separator dot */}
        <span className="text-zinc-700 text-[10px] shrink-0">·</span>

        {/* Type label */}
        <span className={`text-[10px] shrink-0 ${getNotificationTypeColor(notification.tipo)}`}>{getNotificationTypeLabel(notification.tipo)}</span>

        {/* Separator dot */}
        <span className="text-zinc-700 text-[10px] shrink-0">·</span>

        {/* Advisor */}
        <span className="text-[10px] text-zinc-500 truncate min-w-0 hidden md:inline">{formatAdvisorName(notification.advisor)}</span>
        <span className="text-zinc-700 text-[10px] shrink-0 hidden md:inline">·</span>

        {/* Agent */}
        {notification.agent?.nombre_agente && (
          <>
            <span className="text-[10px] text-zinc-500 truncate min-w-0 hidden lg:inline"><Bot className="w-3 h-3 inline mr-0.5" />{notification.agent.nombre_agente}</span>
            <span className="text-zinc-700 text-[10px] shrink-0 hidden lg:inline">·</span>
          </>
        )}

        {/* Time */}
        <span className="text-[10px] text-zinc-600 shrink-0 ml-auto">{getRelativeTime(notification.fecha_envio)}</span>

        {/* Status badge */}
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${hasResponse ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
          {hasResponse ? '✓ Resp.' : 'Pend.'}
        </span>

        {/* Chevron */}
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
        </div>

        {/* Message body */}
        <div className="mt-2 space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">Consulta del usuario</div>
          <div className="text-xs text-zinc-400 leading-relaxed line-clamp-2 break-words [overflow-wrap:anywhere]">{sanitizeHtml(notification.mensaje)}</div>
        </div>

        {/* Context chips */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
          <span>{formatFullDate(notification.fecha_envio)}</span>
          {notification.requiere_respuesta && <span className="text-amber-400">Requiere acción</span>}
        </div>

        {/* Actions bar */}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
          {/* Advisor */}
          <span className="truncate min-w-0">{formatAdvisorName(notification.advisor)}</span>
          {notification.agent?.nombre_agente && (
            <>
              <span className="text-zinc-700">·</span>
              {/* Agent */}
              <span className="truncate min-w-0 flex items-center gap-1"><Bot className="w-3 h-3" />{notification.agent.nombre_agente}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
};

const NotificationDetailView: React.FC<{
  notification: Notification;
  onBack: () => void;
  onRespond: (notification: Notification, text: string) => Promise<void>;
  onArchive: (notification: Notification) => Promise<void>;
  onOpenContact: (notification: Notification) => void;
  isObservationMode: boolean;
  isSubmitting: boolean;
}> = ({ notification, onBack, onRespond, onArchive, onOpenContact, isObservationMode, isSubmitting }) => {
  const [replyText, setReplyText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isHitl = isHumanInTheLoopNotification(notification);
  const hasResponse = !!notification.respuesta;
  const windowStatus = getWindowStatus(notification);
  const canSendToChat = isHitl && !!notification.contacto_id && windowStatus.within24h;

  useEffect(() => {
    setReplyText('');
    setLocalError(null);
  }, [notification.id]);

  const handleSubmit = async () => {
    if (!replyText.trim()) return;
    setLocalError(null);
    try {
      await onRespond(notification, replyText.trim());
      setReplyText('');
    } catch (err: any) {
      setLocalError(err?.message || 'Error al responder');
    }
  };

  return (
    <div className="px-4 md:px-6 py-4 md:py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-zinc-900/30 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-3">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a la bandeja
              </button>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* HITL badge */}
                  {isHitl && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/20 shrink-0">HITL</span>}
                  {/* Type label */}
                  <span className={`text-[10px] shrink-0 ${getNotificationTypeColor(notification.tipo)}`}>{getNotificationTypeLabel(notification.tipo)}</span>
                  {/* Status badge */}
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${hasResponse ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {hasResponse ? '✓ Respondida' : notification.requiere_respuesta ? 'Pendiente' : 'Informativa'}
                  </span>
                </div>

                {/* Contact name */}
                <h2 className="text-xl md:text-2xl font-semibold text-zinc-100 tracking-tight break-words">{formatContactName(notification.contact)}</h2>

                {/* Context chips */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span>{formatFullDate(notification.fecha_envio)}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{formatAdvisorName(notification.advisor)}</span>
                  {notification.agent?.nombre_agente && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="flex items-center gap-1"><Bot className="w-3 h-3" />{notification.agent.nombre_agente}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              {notification.contacto_id && (
                <button onClick={() => onOpenContact(notification)} className="text-[11px] text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-500/20 bg-primary-500/10">
                  <ExternalLink className="w-3 h-3" /> Abrir contacto
                </button>
              )}
              <button onClick={() => onArchive(notification)} className="text-[11px] text-zinc-300 hover:text-white font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5">
                {notification.archivado ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                {notification.archivado ? 'Desarchivar' : 'Archivar'}
              </button>
            </div>
          </div>

          {/* Message body */}
          <div className="rounded-2xl border border-white/5 bg-[#0b0b0d] p-5 md:p-6">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Consulta del usuario</div>
            <div className="text-sm md:text-[15px] text-zinc-200 leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{sanitizeHtml(notification.mensaje)}</div>
          </div>

          {/* Context chips */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span>{formatFullDate(notification.fecha_envio)}</span>
            {notification.contact?.telefono && <span className="text-zinc-400">📞 {notification.contact.telefono}</span>}
            {notification.contact?.email && <span className="text-zinc-400">✉ {notification.contact.email}</span>}
            {isHitl && notification.contacto_id && (
              <span className="text-zinc-400">Canal: Chat / WhatsApp</span>
            )}
            {notification.requiere_respuesta && <span className="text-amber-400">Requiere acción</span>}
          </div>

          {isObservationMode && (
            <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-cyan-400 font-medium">Empresa Externa</p>
                <p className="text-[10px] text-cyan-400/70">Los mensajes se enviarán a esta empresa.</p>
              </div>
            </div>
          )}

          {isHitl && notification.contacto_id && (
            windowStatus.within24h ? (
              <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                <Clock3 className="w-3 h-3" />
                <span>Ventana de 24h activa • {windowStatus.timeRemaining}</span>
              </div>
            ) : !windowStatus.isWhatsapp ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-400 font-medium">Origen no compatible</p>
                  <p className="text-[10px] text-amber-400/70">El chat directo solo está disponible para contactos de WhatsApp actualmente.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-400 font-medium">Fuera de la ventana de 24 horas</p>
                  <p className="text-[10px] text-amber-400/70">Última interacción: {windowStatus.lastInteraction}. No se pueden enviar mensajes.</p>
                </div>
              </div>
            )
          )}

          {/* Existing response */}
          {hasResponse && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium mb-2"><CheckCircle2 className="w-3.5 h-3.5" /> Respuesta registrada</div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-6">{sanitizeHtml(notification.respuesta!)}</p>
              <div className="text-[10px] text-zinc-600 mt-2">Respondida: {formatFullDate(notification.fecha_respuesta)}</div>
            </div>
          )}

          {/* Reply composer (only if requires response and no response yet) */}
          {notification.requiere_respuesta && !hasResponse && (
            <div className="space-y-2 rounded-2xl border border-white/5 bg-[#0b0b0d] p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"><MessageSquareReply className="w-3.5 h-3.5 text-amber-400" /> Responder</div>
              <div className={`flex items-end gap-2 ${isHitl && !windowStatus.within24h ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex-1 relative">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={6}
                    placeholder={isHitl ? (windowStatus.within24h ? 'Escribe un mensaje...' : windowStatus.isWhatsapp ? 'Chat bloqueado' : 'Solo WhatsApp disponible') : 'Respuesta interna...'}
                    disabled={(isHitl && !windowStatus.within24h) || isSubmitting}
                    className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/40 resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              {localError && <div className="text-[10px] text-rose-400">{localError}</div>}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !replyText.trim() || (isHitl && !canSendToChat)}
                  className="px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-medium flex items-center gap-1.5"
                >
                  {isSubmitting ? <RefreshCw className="w-3 h-3 animate-spin" /> : isHitl ? <Send className="w-3 h-3" /> : <CheckCheck className="w-3 h-3" />}
                  {isHitl ? 'Enviar al contacto' : 'Guardar respuesta'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// METRICS PANEL (sub-pantalla para supervisores)
// ============================================================================

const MetricsPanel: React.FC<{ metrics: ActivityMetrics }> = ({ metrics }) => {
  const cards = [
    { title: 'Pendientes', value: metrics.pending, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { title: 'Requieren respuesta', value: metrics.requiresResponse, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    { title: 'No leídas', value: metrics.unread, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    { title: 'Respondidas hoy', value: metrics.respondedToday, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { title: 'HITL activas', value: metrics.hitlActive, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
    { title: 'T. prom. respuesta', value: metrics.avgResponseMinutes ? `${metrics.avgResponseMinutes} min` : '—', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map(c => (
          <div key={c.title} className={`rounded-xl border p-4 ${c.bg}`}>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">{c.title}</div>
            <div className={`mt-2 text-3xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/5 bg-zinc-900/30 p-6 text-center">
        <BarChart3 className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
        <p className="text-xs text-zinc-600">Gráficas de distribución por tipo y timeline de respuestas — próximamente</p>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN VIEW
// ============================================================================

export const ActivityView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const selectContact = useContactStore(state => state.selectContact);
  const fetchContactDetails = useContactStore(state => state.fetchContactDetails);
  const isObservationMode = useContactStore(selectIsObservationMode);
  const focusContactNavigation = useAdminStore(state => state.focusContactNavigation);
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const isMaximized = useAdminStore(selectIsMaximized);
  const isRestricted = useAdminStore(selectIsTeamFilterRestricted);

  const notifications = useActivityNotificationsStore(state => state.notifications);
  const isLoading = useActivityNotificationsStore(state => state.isLoading);
  const error = useActivityNotificationsStore(state => state.error);
  const fetchActivityNotifications = useActivityNotificationsStore(state => state.fetchActivityNotifications);
  const archiveNotification = useActivityNotificationsStore(state => state.archiveNotification);
  const unarchiveNotification = useActivityNotificationsStore(state => state.unarchiveNotification);

  const markAsRead = useNotificationsStore(state => state.markAsRead);
  const respondToNotification = useNotificationsStore(state => state.respondToNotification);
  const respondToNotificationWithMessage = useNotificationsStore(state => state.respondToNotificationWithMessage);

  const [screen, setScreen] = useState<ScreenId>('inbox');
  const [tab, setTab] = useState<ActivityTab>('requires_response');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSupervisor = userContext?.roleId === 1 || userContext?.roleId === 2;
  const containerMaxWidth = isMaximized ? DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED : DASHBOARD_CONTENT_MAX_WIDTH_NORMAL;
  const contentStyle = embedded ? undefined : { maxWidth: containerMaxWidth };

  const effectiveAdvisorIds = useMemo(() => {
    if (isObservationMode) return [];
    if (isRestricted && userContext?.id) return [userContext.id];
    return globalTeamMemberIds;
  }, [globalTeamMemberIds, isObservationMode, isRestricted, userContext?.id]);

  const loadActivity = useCallback(async () => {
    if (!selectedEnterpriseId) return;
    await fetchActivityNotifications({
      enterpriseId: selectedEnterpriseId,
      advisorIds: effectiveAdvisorIds,
      includeArchived: screen === 'archived',
      tipo: 'human_in_the_loop',
    });
  }, [effectiveAdvisorIds, fetchActivityNotifications, selectedEnterpriseId, screen]);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  const effectiveTab = screen === 'archived' ? 'archived' as ActivityTab : tab;

  const hitlNotifications = useMemo(() => {
    return notifications.filter(notification => isHumanInTheLoopNotification(notification));
  }, [notifications]);

  const metrics = useMemo(() => {
    return deriveActivityMetrics(hitlNotifications);
  }, [hitlNotifications]);

  const filteredNotifications = useMemo(() => {
    return filterActivityNotifications(hitlNotifications, { tab: effectiveTab, search, onlyUnread });
  }, [hitlNotifications, effectiveTab, search, onlyUnread]);

  const visibleNotifications = useMemo(() => {
    return filteredNotifications;
  }, [filteredNotifications]);

  const resultScopeLabel = isObservationMode
    ? ' · Empresa externa'
    : isRestricted
      ? ' · Vista personal'
      : effectiveAdvisorIds.length > 0
        ? ' · Filtrado'
        : ' · Empresa';

  const selectedNotification = useMemo(
    () => visibleNotifications.find(notification => notification.id === expandedId) ?? null,
    [expandedId, visibleNotifications],
  );

  // Mark as read on expand
  useEffect(() => {
    if (!expandedId) return;
    const n = visibleNotifications.find(n => n.id === expandedId);
    if (n && !n.visto) {
      markAsRead(n.id).catch(() => undefined);
    }
  }, [expandedId, visibleNotifications, markAsRead]);

  useEffect(() => {
    if (expandedId && !selectedNotification) {
      setExpandedId(null);
    }
  }, [expandedId, selectedNotification]);

  const handleToggleExpand = (id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleOpenContact = async (notification: Notification) => {
    if (!notification.contacto_id) return;
    if (!notification.visto) await markAsRead(notification.id);
    focusContactNavigation(notification.contacto_id, formatContactName(notification.contact));
    selectContact(notification.contacto_id);
    void fetchContactDetails(notification.contacto_id);
  };

  const handleArchive = async (notification: Notification) => {
    try {
      if (notification.archivado) {
        await unarchiveNotification(notification.id);
      } else {
        await archiveNotification(notification.id);
      }
      if (expandedId === notification.id) setExpandedId(null);
      await loadActivity();
    } catch { /* silently handled by store */ }
  };

  const handleRespond = async (notification: Notification, text: string) => {
    setIsSubmitting(true);
    try {
      const isHitl = isHumanInTheLoopNotification(notification);
      if (isHitl && notification.contacto_id) {
        const result = await respondToNotificationWithMessage(notification, text);
        if (!result.success) throw new Error(result.error || 'No se pudo enviar');
      } else {
        await respondToNotification(notification.id, text);
      }
      await loadActivity();
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──

  const screenTabs: { id: ScreenId; label: string; show: boolean }[] = [
    { id: 'inbox', label: 'Bandeja', show: true },
    { id: 'metrics', label: 'Métricas', show: isSupervisor },
    { id: 'archived', label: 'Archivadas', show: true },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0c0c0e]">
      <div className={`flex-1 flex flex-col w-full overflow-hidden ${embedded ? '' : 'mx-auto'}`} style={contentStyle}>
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5 border-b border-white/5">
          {!embedded && (
            <div className="flex items-center gap-1.5 mr-1">
              <MessageSquareReply className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-zinc-100">Consultas IA</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            {screenTabs.filter(t => t.show).map(t => (
              <button
                key={t.id}
                onClick={() => { setScreen(t.id); setExpandedId(null); }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${screen === t.id ? 'bg-primary-500/15 text-primary-300 border border-primary-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Inline summary (only on inbox screen) */}
          {screen === 'inbox' && (
            <div className="hidden lg:flex items-center gap-1.5">
              <button onClick={() => setTab('requires_response')} className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${tab === 'requires_response' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20' : 'bg-white/[0.03] text-zinc-500 hover:text-rose-300 border border-white/5'}`}>
                {metrics.requiresResponse} req. respuesta
              </button>
              <button onClick={() => { setOnlyUnread(v => !v); }} className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${onlyUnread ? 'bg-sky-500/15 text-sky-300 border border-sky-500/20' : 'bg-white/[0.03] text-zinc-500 hover:text-sky-300 border border-white/5'}`}>
                {metrics.unread} no leídas
              </button>
              <span className="text-[10px] text-zinc-500 whitespace-nowrap">{hitlNotifications.length} consultas HITL</span>
            </div>
          )}

          {/* Search toggle */}
          {(screen === 'inbox' || screen === 'archived') && (
            searchOpen ? (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-48 rounded-lg border border-white/10 bg-zinc-950 pl-8 pr-7 py-1 text-xs text-zinc-200 focus:outline-none focus:border-primary-500/40"
                />
                <button onClick={() => { setSearch(''); setSearchOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button onClick={() => setSearchOpen(true)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors">
                <Search className="w-3.5 h-3.5" />
              </button>
            )
          )}

          {/* Refresh */}
          <button onClick={loadActivity} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors" title="Refrescar">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ─── FILTER BAR (only for inbox) ─── */}
        {screen === 'inbox' && !selectedNotification && (
          <div className="shrink-0 px-4 md:px-6 py-1.5 border-b border-white/5 overflow-x-auto scrollbar-hide">
            <div className="flex min-w-max items-center gap-1">
              {FILTER_TABS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setTab(f.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${tab === f.id ? 'bg-white/10 text-zinc-100 border border-white/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'}`}
                >
                  {f.label}
                </button>
              ))}

              <div className="mx-1 h-4 w-px bg-white/5" />

              <button
                onClick={() => setOnlyUnread(v => !v)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${onlyUnread ? 'bg-sky-500/15 text-sky-300 border border-sky-500/20' : 'text-zinc-600 hover:text-zinc-400 border border-transparent'}`}
              >
                No leídas
              </button>

              <span className="ml-2 text-[10px] text-zinc-600 whitespace-nowrap shrink-0">
                {visibleNotifications.length} registros{resultScopeLabel}
              </span>
            </div>
          </div>
        )}

        {/* ─── CONTENT ─── */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {screen === 'metrics' ? (
            <MetricsPanel metrics={metrics} />
          ) : selectedNotification ? (
            <NotificationDetailView
              notification={selectedNotification}
              onBack={() => setExpandedId(null)}
              onRespond={handleRespond}
              onArchive={handleArchive}
              onOpenContact={handleOpenContact}
              isObservationMode={isObservationMode}
              isSubmitting={isSubmitting}
            />
          ) : (
            <div className="p-3 md:px-6 md:py-4 space-y-1.5">
              {visibleNotifications.map(notification => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  isExpanded={expandedId === notification.id}
                  onToggle={() => handleToggleExpand(notification.id)}
                />
              ))}

              {!isLoading && visibleNotifications.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-16 text-zinc-600">
                  <Inbox className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm text-zinc-500">
                    {screen === 'archived' ? 'No hay registros HITL archivados.' : 'No hay registros HITL para los filtros actuales.'}
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-zinc-600 animate-spin" />
                </div>
              )}
            </div>
          )}

          {error && <div className="px-4 md:px-6 py-2 text-xs text-rose-400">{error}</div>}
        </div>
      </div>
    </div>
  );
};
