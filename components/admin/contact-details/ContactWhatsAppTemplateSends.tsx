import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCheck, ChevronRight, Clock, FileText, Loader2, MessageSquare, RefreshCw, Send, Smartphone, Tag } from 'lucide-react';
import { supabase } from '../../../lib/supabase-client';
import { logger } from '../../../lib/logger';
import type { WhatsAppTemplateSendRecord } from '../../../types/whatsapp-template';

interface ContactWhatsAppTemplateSendsProps {
  contactId: number;
  enterpriseId?: number | null;
  onOpenConversation?: (conversationId: number) => void;
}

type GroupByMode = 'date' | 'template';

interface GroupedSendSection {
  id: string;
  title: string;
  description: string;
  sortValue: number;
  items: WhatsAppTemplateSendRecord[];
}

const normalizeText = (value: string | null | undefined, fallback = '—') => {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, ' ').trim();
};

const getTemplatePreview = (value: string | null | undefined, maxLength = 140) => {
  if (!value) return null;

  const cleaned = value
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…`
    : cleaned;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const formatDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha válida';

  const formatted = new Intl.DateTimeFormat('es-PE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const getPrimaryDateLabel = (item: WhatsAppTemplateSendRecord) => {
  if (item.read_at) return 'Leído';
  if (item.delivered_at) return 'Entregado';
  if (item.sent_at) return 'Enviado';
  if (item.failed_at) return 'Falló';
  return 'Registrado';
};

const getPrimaryDateValue = (item: WhatsAppTemplateSendRecord) => {
  return item.read_at || item.delivered_at || item.sent_at || item.failed_at || item.created_at;
};

const getSortValue = (item: WhatsAppTemplateSendRecord) => {
  const value = getPrimaryDateValue(item);
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getLocalDateKey = (value: string | null | undefined) => {
  if (!value) return 'sin-fecha';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sin-fecha';

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const getStatusPresentation = (status: string | null | undefined) => {
  switch (status) {
    case 'read':
      return {
        label: 'Leído',
        Icon: CheckCheck,
        badgeClass: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300',
        cardClass: 'border-emerald-500/20 bg-emerald-500/[0.04]',
        iconWrapperClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      };
    case 'delivered':
      return {
        label: 'Entregado',
        Icon: CheckCheck,
        badgeClass: 'bg-sky-500/20 border-sky-400/30 text-sky-300',
        cardClass: 'border-sky-500/20 bg-sky-500/[0.04]',
        iconWrapperClass: 'border-sky-500/20 bg-sky-500/10 text-sky-300'
      };
    case 'failed':
    case 'rejected':
      return {
        label: status === 'failed' ? 'Fallido' : 'Rechazado',
        Icon: AlertTriangle,
        badgeClass: 'bg-red-500/20 border-red-400/30 text-red-300',
        cardClass: 'border-red-500/20 bg-red-500/[0.04]',
        iconWrapperClass: 'border-red-500/20 bg-red-500/10 text-red-300'
      };
    case 'sent':
      return {
        label: 'Enviado',
        Icon: Send,
        badgeClass: 'bg-blue-500/20 border-blue-400/30 text-blue-300',
        cardClass: 'border-blue-500/20 bg-blue-500/[0.04]',
        iconWrapperClass: 'border-blue-500/20 bg-blue-500/10 text-blue-300'
      };
    case 'accepted':
      return {
        label: 'Aceptado',
        Icon: MessageSquare,
        badgeClass: 'bg-indigo-500/20 border-indigo-400/30 text-indigo-300',
        cardClass: 'border-indigo-500/20 bg-indigo-500/[0.04]',
        iconWrapperClass: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
      };
    case 'queued':
      return {
        label: 'En cola',
        Icon: Clock,
        badgeClass: 'bg-amber-500/20 border-amber-400/30 text-amber-300',
        cardClass: 'border-amber-500/20 bg-amber-500/[0.04]',
        iconWrapperClass: 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      };
    default:
      return {
        label: normalizeText(status, 'Sin estado'),
        Icon: Clock,
        badgeClass: 'bg-zinc-800 border-white/10 text-zinc-300',
        cardClass: 'border-white/5 bg-[#131316]',
        iconWrapperClass: 'border-white/10 bg-zinc-900/70 text-zinc-300'
      };
  }
};

export const ContactWhatsAppTemplateSends: React.FC<ContactWhatsAppTemplateSendsProps> = ({ contactId, enterpriseId, onOpenConversation }) => {
  const [items, setItems] = useState<WhatsAppTemplateSendRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByMode>('date');

  const fetchItems = useCallback(async () => {
    if (!contactId || !enterpriseId) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('wp_whatsapp_template_envios')
        .select(`
          id,
          empresa_id,
          numero_id,
          template_id,
          conversacion_id,
          mensaje_id,
          contacto_id,
          enviado_por,
          provider,
          provider_message_id,
          provider_template_id,
          template_name,
          language_code,
          meta_category,
          clasificacion_interna,
          telefono_destino,
          estado,
          error_code,
          error_message,
          rendered_body,
          sent_at,
          delivered_at,
          read_at,
          failed_at,
          created_at,
          updated_at,
          number:wp_numeros!wp_whatsapp_template_envios_numero_id_fkey(id, telefono, nombre)
        `)
        .eq('empresa_id', enterpriseId)
        .eq('contacto_id', contactId)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const nextItems = ((data || []).map((item: any) => ({
        ...item,
        number: Array.isArray(item.number) ? item.number[0] ?? null : item.number ?? null
      })) as WhatsAppTemplateSendRecord[]);

      setItems(nextItems);
    } catch (err: any) {
      logger.error('[ContactWhatsAppTemplateSends] Error fetching sends:', err);
      setError(err?.message || 'Error al cargar envíos de plantillas de WhatsApp');
    } finally {
      setIsLoading(false);
    }
  }, [contactId, enterpriseId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const summary = useMemo(() => {
    if (items.length === 0) return 'Sin envíos registrados';
    return `${items.length} envío${items.length === 1 ? '' : 's'} de plantilla`;
  }, [items.length]);

  const statusHighlights = useMemo(() => {
    const counters = items.reduce((acc, item) => {
      if (item.estado === 'read') acc.read += 1;
      if (item.estado === 'delivered') acc.delivered += 1;
      if (item.estado === 'failed' || item.estado === 'rejected') acc.failed += 1;
      return acc;
    }, { read: 0, delivered: 0, failed: 0 });

    return [
      { id: 'read', label: 'Leídos', count: counters.read, className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
      { id: 'delivered', label: 'Entregados', count: counters.delivered, className: 'bg-sky-500/10 border-sky-500/20 text-sky-300' },
      { id: 'failed', label: 'Fallidos', count: counters.failed, className: 'bg-red-500/10 border-red-500/20 text-red-300' }
    ].filter((item) => item.count > 0);
  }, [items]);

  const groupedSections = useMemo(() => {
    const sortedItems = [...items].sort((a, b) => getSortValue(b) - getSortValue(a));
    const sections = new Map<string, GroupedSendSection>();

    sortedItems.forEach((item) => {
      if (groupBy === 'date') {
        const groupKey = getLocalDateKey(getPrimaryDateValue(item));
        const existing = sections.get(groupKey);

        if (existing) {
          existing.items.push(item);
          return;
        }

        sections.set(groupKey, {
          id: groupKey,
          title: groupKey === 'sin-fecha' ? 'Sin fecha válida' : formatDateLabel(groupKey),
          description: '',
          sortValue: getSortValue(item),
          items: [item]
        });
        return;
      }

      const templateName = item.template_name?.trim() || 'Sin plantilla';
      const languageCode = item.language_code?.toUpperCase() || '—';
      const groupKey = `${templateName}::${languageCode}`;
      const existing = sections.get(groupKey);

      if (existing) {
        existing.items.push(item);
        return;
      }

      sections.set(groupKey, {
        id: groupKey,
        title: templateName,
        description: `${languageCode} · ${normalizeText(item.meta_category, 'sin categoría')}`,
        sortValue: getSortValue(item),
        items: [item]
      });
    });

    return Array.from(sections.values())
      .map((section) => ({
        ...section,
        items: section.items.sort((a, b) => getSortValue(b) - getSortValue(a)),
        description: groupBy === 'date'
          ? `${section.items.length} envío${section.items.length === 1 ? '' : 's'} · último ${formatDateTime(getPrimaryDateValue(section.items[0]))}`
          : `${section.description} · ${section.items.length} envío${section.items.length === 1 ? '' : 's'}`
      }))
      .sort((a, b) => b.sortValue - a.sortValue);
  }, [groupBy, items]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-sm text-zinc-400">Cargando envíos de plantillas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-400">Error al cargar la sección</p>
          <p className="text-xs text-red-400/80 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={fetchItems}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10 transition-colors text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900/60 border border-white/5 flex items-center justify-center mb-4">
          <Send className="w-6 h-6 text-zinc-500" />
        </div>
        <h3 className="text-base font-semibold text-zinc-300 mb-1">Sin envíos de plantillas</h3>
        <p className="text-sm text-zinc-500 max-w-md">
          Este contacto todavía no tiene registros en el historial de envíos de plantillas de WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-200">Plantillas de WhatsApp</h3>
            <p className="text-xs text-zinc-500">{summary}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-white/5 bg-zinc-900/60 p-1">
            <button
              type="button"
              onClick={() => setGroupBy('date')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                groupBy === 'date'
                  ? 'bg-primary-500/10 text-primary-300 border border-primary-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Fecha
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('template')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                groupBy === 'template'
                  ? 'bg-primary-500/10 text-primary-300 border border-primary-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              Plantilla
            </button>
          </div>

          <button
            type="button"
            onClick={fetchItems}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusHighlights.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {statusHighlights.map((item) => (
            <span
              key={item.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${item.className}`}
            >
              <span>{item.label}</span>
              <span className="text-[11px] opacity-90">{item.count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-5">
        {groupedSections.map((section) => (
          <div key={section.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{section.title}</h4>
                <p className="text-[11px] text-zinc-500 mt-1">{section.description}</p>
              </div>

              <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-white/5 bg-zinc-900/60 text-[10px] font-medium text-zinc-400 shrink-0">
                {section.items.length} envío{section.items.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-3">
              {section.items.map((item) => {
                const status = getStatusPresentation(item.estado);
                const StatusIcon = status.Icon;
                const primaryDateLabel = getPrimaryDateLabel(item);
                const primaryDateValue = getPrimaryDateValue(item);
                const templatePreview = getTemplatePreview(item.rendered_body);

                return (
                  <div key={item.id} className={`rounded-2xl border p-4 transition-colors ${status.cardClass}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${status.iconWrapperClass}`}>
                          <StatusIcon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-zinc-100 break-words">{item.template_name}</h4>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${status.badgeClass}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {status.label}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span className="uppercase tracking-wide text-zinc-400">{item.language_code}</span>
                            <span className="text-zinc-700">•</span>
                            <span className="capitalize">{normalizeText(item.meta_category)}</span>
                            {item.clasificacion_interna && (
                              <>
                                <span className="text-zinc-700">•</span>
                                <span>{item.clasificacion_interna}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{primaryDateLabel}</div>
                        <div className="mt-1 text-xs text-zinc-200">{formatDateTime(primaryDateValue)}</div>
                      </div>
                    </div>

                    {templatePreview && (
                      <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm leading-6 text-zinc-400">
                        {templatePreview}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/5 bg-zinc-900/60 text-zinc-400">
                        <Smartphone className="w-3.5 h-3.5" />
                        {item.telefono_destino}
                      </span>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/5 bg-zinc-900/60 text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDateTime(item.created_at)}
                      </span>

                      {item.number?.telefono && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/5 bg-zinc-900/60 text-zinc-400">
                          <Send className="w-3.5 h-3.5" />
                          {item.number.telefono}
                          {item.number.nombre ? ` · ${item.number.nombre}` : ''}
                        </span>
                      )}

                      {(item.delivered_at || item.read_at) && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
                          <CheckCheck className="w-3.5 h-3.5" />
                          {item.read_at ? 'Leído' : 'Entregado'}
                        </span>
                      )}
                    </div>

                    {(item.error_code || item.error_message) && (
                      <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/5 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 text-xs">
                            <div className="text-red-400 font-medium">Error del envío</div>
                            <div className="text-red-300/80 mt-1 break-words">{item.error_message || item.error_code}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-white/5 bg-zinc-900/60 text-[10px] text-zinc-400">
                        <Send className="w-3 h-3" />
                        {normalizeText(item.provider)}
                      </span>

                      {item.conversacion_id && onOpenConversation && (
                        <button
                          type="button"
                          onClick={() => onOpenConversation(item.conversacion_id as number)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary-500/20 bg-primary-500/10 text-xs font-medium text-primary-300 hover:bg-primary-500/15 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Abrir conversación #{item.conversacion_id}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {item.conversacion_id && !onOpenConversation && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-white/5 bg-zinc-900/60 text-[10px] text-zinc-400">
                          <MessageSquare className="w-3 h-3" />
                          Conversación #{item.conversacion_id}
                        </span>
                      )}

                      {item.mensaje_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-white/5 bg-zinc-900/60 text-[10px] text-zinc-400">
                          Mensaje #{item.mensaje_id}
                        </span>
                      )}

                      {item.provider_message_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-white/5 bg-zinc-900/60 text-[10px] text-zinc-400 break-all">
                          Ref {item.provider_message_id}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
