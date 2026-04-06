'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MessageSquareReply,
  Phone,
  RefreshCw,
  Send,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { logger } from '@/lib/logger';
import { markdownToSafeHtml } from '@/lib/sanitize-html';
import { useNotificationsStore } from '@/store/notificationsStore';
import {
  Notification,
  formatAdvisorName,
  getNotificationTypeColor,
  getNotificationTypeLabel,
  getRelativeTime,
  isHumanInTheLoopNotification,
} from '@/types/notification';

interface ContactQueriesViewProps {
  contactId: number;
  enterpriseId?: number | null;
  hitlVersion?: number;
  onCountsChange?: (counts: { total: number; pending: number }) => void;
}

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
  return { within24h, timeRemaining, lastInteraction, isWhatsapp };
};

const getAgentName = (notification: Notification) => {
  return notification.agent?.nombre_agente || notification.metadata?.agente_nombre || null;
};

const QueryCard: React.FC<{
  actionError?: string;
  expanded: boolean;
  notification: Notification;
  onReplyChange: (value: string) => void;
  onRespond: () => Promise<void>;
  onToggle: () => void;
  replyValue: string;
  submitting: boolean;
}> = ({ actionError, expanded, notification, onReplyChange, onRespond, onToggle, replyValue, submitting }) => {
  const isHitl = isHumanInTheLoopNotification(notification);
  const hasResponse = !!notification.respuesta;
  const windowStatus = getWindowStatus(notification);
  const canSendToChat = isHitl && !!notification.contacto_id && windowStatus.within24h;
  const agentName = getAgentName(notification);

  // Urgencia para el equipo comercial: > 1h sin respuesta = urgente, > 4h = crítico
  const pendingAgeMs = !hasResponse ? Date.now() - new Date(notification.fecha_envio).getTime() : 0;
  const isUrgent = !hasResponse && pendingAgeMs > 60 * 60 * 1000;
  const isCritical = !hasResponse && pendingAgeMs > 4 * 60 * 60 * 1000;

  const borderClass = expanded
    ? isCritical ? 'border-rose-500/40 bg-rose-500/[0.03]'
      : isUrgent ? 'border-amber-500/30 bg-amber-500/[0.03]'
      : 'border-primary-500/30 bg-primary-500/[0.03]'
    : isCritical ? 'border-rose-500/20 bg-rose-500/[0.02] hover:border-rose-500/30'
      : isUrgent ? 'border-amber-500/15 bg-amber-500/[0.02] hover:border-amber-500/25'
      : 'border-white/5 bg-zinc-900/40 hover:border-white/10 hover:bg-white/[0.02]';

  return (
    <div className={`overflow-hidden rounded-2xl border transition-colors ${borderClass}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${notification.visto ? 'bg-zinc-700' : 'bg-sky-400'}`} aria-label={notification.visto ? undefined : 'No leída'} role={notification.visto ? undefined : 'status'} />
          {isCritical ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/20 shrink-0 animate-pulse motion-reduce:animate-none">URGENTE</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/20 shrink-0">HITL</span>
          )}
          <span className={`text-[10px] shrink-0 ${getNotificationTypeColor(notification.tipo)}`}>{getNotificationTypeLabel(notification.tipo)}</span>
          <span className="text-zinc-700 text-[10px] shrink-0">·</span>
          <span className="text-[10px] text-zinc-500 truncate min-w-0">{formatAdvisorName(notification.advisor)}</span>
          {agentName && (
            <>
              <span className="text-zinc-700 text-[10px] shrink-0">·</span>
              <span className="text-[10px] text-zinc-500 truncate min-w-0 hidden md:inline-flex md:items-center md:gap-1">
                <Bot className="w-3 h-3" />
                {agentName}
              </span>
            </>
          )}
          <span className="ml-auto text-[10px] text-zinc-600 shrink-0">{getRelativeTime(notification.fecha_envio)}</span>
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${
            hasResponse ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : isCritical ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {hasResponse ? 'Respondida' : isCritical ? 'Sin responder (+4h)' : isUrgent ? 'Pendiente (+1h)' : 'Pendiente'}
          </span>
          {notification.archivado ? (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
              Archivada
            </span>
          ) : null}
        </div>

        <div className="mt-2 space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">Consulta</div>
          <div className="text-sm text-zinc-300 line-clamp-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(notification.mensaje || '') }} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
          <span>{formatFullDate(notification.fecha_envio)}</span>
          {notification.requiere_respuesta ? <span className="text-amber-400">Requiere acción</span> : null}
          {notification.contact?.telefono ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{notification.contact.telefono}</span> : null}
          {notification.contact?.email ? <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{notification.contact.email}</span> : null}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">
          <div className="rounded-2xl border border-white/5 bg-[#0b0b0d] p-4">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Consulta del usuario</div>
            <div className="text-sm text-zinc-200 leading-7 break-words" dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(notification.mensaje || '') }} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span>{formatFullDate(notification.fecha_envio)}</span>
            <span className="text-zinc-700">·</span>
            <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{formatAdvisorName(notification.advisor)}</span>
            {agentName ? (
              <>
                <span className="text-zinc-700">·</span>
                <span className="inline-flex items-center gap-1"><Bot className="w-3 h-3" />{agentName}</span>
              </>
            ) : null}
          </div>

          {isHitl && notification.contacto_id ? (
            windowStatus.within24h ? (
              <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                <Clock3 className="w-3 h-3" />
                <span>Ventana de 24h activa • {windowStatus.timeRemaining}</span>
              </div>
            ) : !windowStatus.isWhatsapp ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-400">Origen no compatible</p>
                  <p className="text-[10px] text-amber-400/70">El chat directo solo está disponible para contactos de WhatsApp actualmente.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-400">Fuera de la ventana de 24 horas</p>
                  <p className="text-[10px] text-amber-400/70">Última interacción: {windowStatus.lastInteraction}. No se pueden enviar mensajes.</p>
                </div>
              </div>
            )
          ) : null}

          {hasResponse ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Respuesta registrada
              </div>
              <div className="text-sm text-zinc-300 leading-6 break-words" dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(notification.respuesta || '') }} />
              <div className="mt-2 text-[10px] text-zinc-600">Respondida: {formatFullDate(notification.fecha_respuesta)}</div>
            </div>
          ) : null}

          {notification.requiere_respuesta && !hasResponse ? (
            <div className="space-y-2 rounded-2xl border border-white/5 bg-[#0b0b0d] p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <MessageSquareReply className="w-3.5 h-3.5 text-amber-400" />
                Responder
              </div>
              <textarea
                value={replyValue}
                onChange={(event) => onReplyChange(event.target.value)}
                rows={5}
                aria-label="Respuesta a la consulta"
                placeholder={isHitl ? (windowStatus.within24h ? 'Escribe un mensaje...' : windowStatus.isWhatsapp ? 'Chat bloqueado' : 'Solo WhatsApp disponible') : 'Respuesta interna...'}
                disabled={submitting || (isHitl && !windowStatus.within24h)}
                className="w-full rounded-xl border border-zinc-700/50 bg-zinc-950/50 px-3 py-3 text-sm text-zinc-200 resize-y focus:outline-none focus:border-primary-500/40 focus:ring-1 focus:ring-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {actionError ? <div className="text-[10px] text-rose-400">{actionError}</div> : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onRespond}
                  disabled={submitting || !replyValue.trim() || (isHitl && !canSendToChat)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-500 disabled:bg-zinc-800 disabled:text-zinc-600 transition-all active:scale-95"
                >
                  {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : isHitl ? <Send className="w-3 h-3" /> : <CheckCheck className="w-3 h-3" />}
                  {isHitl ? 'Enviar al contacto' : 'Guardar respuesta'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const ContactQueriesView: React.FC<ContactQueriesViewProps> = ({ contactId, enterpriseId, hitlVersion, onCountsChange }) => {
  const markAsRead = useNotificationsStore((state) => state.markAsRead);
  const respondToNotification = useNotificationsStore((state) => state.respondToNotification);
  const respondToNotificationWithMessage = useNotificationsStore((state) => state.respondToNotificationWithMessage);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [replyValues, setReplyValues] = useState<Record<number, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({});

  const loadQueries = useCallback(async () => {
    if (!enterpriseId || !contactId) {
      setNotifications([]);
      setExpandedId(null);
      setIsLoading(false);
      onCountsChange?.({ total: 0, pending: 0 });
      return;
    }

    try {
      setIsLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('wp_notificaciones_team')
        .select(`
          *,
          contact:wp_contactos!wp_notificaciones_team_contacto_id_fkey(id, nombre, apellido, telefono, email, origen, ultima_interaccion),
          advisor:wp_team_humano!wp_notificaciones_team_asesor_id_fkey(id, nombre, apellido, email, role_id)
        `)
        .eq('empresa_id', enterpriseId)
        .eq('contacto_id', contactId)
        .eq('tipo', 'human_in_the_loop')
        .order('fecha_envio', { ascending: false })
        .limit(200);

      if (error) throw error;

      const nextNotifications = ((data || []) as Notification[])
        .map((notification) => ({
          ...notification,
          agent: notification.agent || (notification.metadata?.agente_nombre
            ? {
                nombre_agente: notification.metadata.agente_nombre,
                id: notification.agente_id || undefined,
              }
            : null),
        }))
        // Ordenar: pendientes primero (más antiguos arriba = más urgentes), luego respondidas por fecha desc
        .sort((a, b) => {
          const aPending = !a.respuesta;
          const bPending = !b.respuesta;
          if (aPending && !bPending) return -1;
          if (!aPending && bPending) return 1;
          if (aPending && bPending) {
            // Pendientes: más antigua primero (más urgente)
            return new Date(a.fecha_envio).getTime() - new Date(b.fecha_envio).getTime();
          }
          // Respondidas: más reciente primero
          return new Date(b.fecha_envio).getTime() - new Date(a.fecha_envio).getTime();
        });

      setNotifications(nextNotifications);
      onCountsChange?.({
        total: nextNotifications.length,
        pending: nextNotifications.filter((n) => !n.respuesta).length,
      });
      // Auto-expandir la primera pendiente para acción rápida del equipo
      setExpandedId((current) => {
        if (current && nextNotifications.some((n) => n.id === current)) return current;
        const firstPending = nextNotifications.find((n) => !n.respuesta);
        return firstPending?.id ?? null;
      });
    } catch (error: any) {
      logger.error('[ContactQueriesView] Error fetching contact queries:', error);
      setLoadError(error?.message || 'Error al cargar las consultas');
    } finally {
      setIsLoading(false);
    }
  }, [contactId, enterpriseId, onCountsChange]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  // Refrescar cuando el padre detecta cambios realtime (hitlVersion)
  useEffect(() => {
    if (hitlVersion && hitlVersion > 0) {
      loadQueries();
    }
  }, [hitlVersion, loadQueries]);

  useEffect(() => {
    if (!expandedId) return;
    const notification = notificationsRef.current.find((item) => item.id === expandedId);
    if (!notification || notification.visto) return;

    markAsRead(notification.id).catch(() => undefined);
    setNotifications((current) => current.map((item) => (
      item.id === notification.id
        ? { ...item, visto: true, estado: 'leida' as Notification['estado'] }
        : item
    )));
  }, [expandedId, markAsRead]);

  const summary = useMemo(() => {
    const now = Date.now();
    const pendingItems = notifications.filter((n) => !n.respuesta);
    const pending = pendingItems.length;
    const responded = notifications.length - pending;
    // Consultas pendientes con más de 1 hora sin respuesta
    const urgent = pendingItems.filter((n) => {
      const age = now - new Date(n.fecha_envio).getTime();
      return age > 60 * 60 * 1000; // > 1 hora
    }).length;
    // Tiempo promedio de espera de las pendientes
    const avgWaitMs = pending > 0
      ? pendingItems.reduce((sum, n) => sum + (now - new Date(n.fecha_envio).getTime()), 0) / pending
      : 0;
    const avgWaitHours = Math.floor(avgWaitMs / (1000 * 60 * 60));
    const avgWaitMins = Math.floor((avgWaitMs % (1000 * 60 * 60)) / (1000 * 60));
    const avgWaitLabel = avgWaitHours > 0 ? `${avgWaitHours}h ${avgWaitMins}m` : `${avgWaitMins}m`;
    return { pending, responded, urgent, avgWaitLabel };
  }, [notifications]);

  const handleToggle = useCallback((notificationId: number) => {
    setExpandedId((current) => (current === notificationId ? null : notificationId));
  }, []);

  const handleReplyChange = useCallback((notificationId: number, value: string) => {
    setReplyValues((current) => ({ ...current, [notificationId]: value }));
    setActionErrors((current) => ({ ...current, [notificationId]: '' }));
  }, []);

  const handleRespond = useCallback(async (notification: Notification) => {
    const replyValue = (replyValues[notification.id] || '').trim();
    if (!replyValue) return;

    try {
      setSubmittingId(notification.id);
      setActionErrors((current) => ({ ...current, [notification.id]: '' }));

      if (isHumanInTheLoopNotification(notification) && notification.contacto_id) {
        const result = await respondToNotificationWithMessage(notification, replyValue);
        if (!result.success) {
          throw new Error(result.error || 'No se pudo enviar el mensaje');
        }
      } else {
        await respondToNotification(notification.id, replyValue);
      }

      setNotifications((current) => current.map((item) => (
        item.id === notification.id
          ? {
              ...item,
              respuesta: replyValue,
              fecha_respuesta: new Date().toISOString(),
              visto: true,
              estado: 'respondida' as Notification['estado'],
            }
          : item
      )));
      setReplyValues((current) => ({ ...current, [notification.id]: '' }));
    } catch (error: any) {
      logger.error('[ContactQueriesView] Error responding to query:', error);
      setActionErrors((current) => ({
        ...current,
        [notification.id]: error?.message || 'Error al responder la consulta',
      }));
    } finally {
      setSubmittingId(null);
    }
  }, [replyValues, respondToNotification, respondToNotificationWithMessage]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin mb-3 text-primary-400/50" />
        <span className="text-sm animate-pulse motion-reduce:animate-none">Cargando consultas...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <MessageSquareReply className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm text-rose-400">{loadError}</p>
        <button
          type="button"
          onClick={loadQueries}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-all active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Inbox className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">Este contacto aún no tiene consultas HITL registradas</p>
        <p className="text-xs text-zinc-600 mt-1">Cuando el agente escale una consulta al equipo, aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareReply className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-zinc-300">Consultas IA</h3>
          <span className="px-2 py-0.5 rounded-full border border-white/5 bg-zinc-900/50 text-[10px] text-zinc-500">
            {notifications.length} registros
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {summary.urgent > 0 ? (
            <span className="px-2 py-1 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300 animate-pulse motion-reduce:animate-none">
              {summary.urgent} urgente{summary.urgent > 1 ? 's' : ''} (+1h)
            </span>
          ) : null}
          <span className={`px-2 py-1 rounded-full border ${summary.pending > 0 ? 'border-amber-500/15 bg-amber-500/10 text-amber-300' : 'border-white/5 bg-zinc-900/50 text-zinc-500'}`}>
            {summary.pending} pendiente{summary.pending !== 1 ? 's' : ''}
          </span>
          <span className="px-2 py-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
            {summary.responded} respondida{summary.responded !== 1 ? 's' : ''}
          </span>
          {summary.pending > 0 ? (
            <span className="px-2 py-1 rounded-full border border-white/5 bg-zinc-900/50 text-zinc-400" title="Tiempo promedio de espera">
              ~{summary.avgWaitLabel} espera
            </span>
          ) : null}
          <button
            type="button"
            onClick={loadQueries}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-400 hover:text-zinc-200 transition-all active:scale-95"
          >
            <RefreshCw className="w-3 h-3" />
            Refrescar
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {notifications.map((notification) => (
          <QueryCard
            key={notification.id}
            actionError={actionErrors[notification.id]}
            expanded={expandedId === notification.id}
            notification={notification}
            onReplyChange={(value) => handleReplyChange(notification.id, value)}
            onRespond={() => handleRespond(notification)}
            onToggle={() => handleToggle(notification.id)}
            replyValue={replyValues[notification.id] || ''}
            submitting={submittingId === notification.id}
          />
        ))}
      </div>
    </div>
  );
};
