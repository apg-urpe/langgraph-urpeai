'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Filter,
  Loader2,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  User,
  X,
} from 'lucide-react';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import {
  useContactStore,
  selectIsObservationMode,
  selectSelectedEnterpriseId,
} from '@/store/contactStore';
import {
  useChatInboxStore,
  selectInboxActiveThreadId,
  selectInboxError,
  selectInboxLoading,
  selectInboxLoadingMore,
  selectInboxMessages,
  selectInboxMessagesLoading,
  selectInboxSearch,
  selectInboxSelectedNumberId,
  selectInboxSelectedCanal,
  selectInboxThreads,
  selectInboxHasMore,
  selectInboxTotalCount,
  selectInboxHasMoreMessages,
  selectInboxLoadingOlderMessages,
} from '@/store/chatInboxStore';
import {
  usePhoneNumbersStore,
  selectPhoneNumbers,
  selectPhoneNumbersLoading,
} from '@/store/phoneNumbersStore';
import { useNotificationsStore, selectPendingHITLForContact } from '@/store/notificationsStore';
import { formatPhoneDisplay } from '@/lib/ui-helpers';
import { ConversationPanel } from '../chat/ConversationPanel';
import { ContactDetailModal } from '../ContactDetailModal';

export const EnterpriseInboxView: React.FC = () => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const isObservationMode = useContactStore(selectIsObservationMode);

  const threads = useChatInboxStore(selectInboxThreads);
  const activeThreadId = useChatInboxStore(selectInboxActiveThreadId);
  const messages = useChatInboxStore(selectInboxMessages);
  const inboxSearch = useChatInboxStore(selectInboxSearch);
  const selectedNumberId = useChatInboxStore(selectInboxSelectedNumberId);
  const selectedCanal = useChatInboxStore(selectInboxSelectedCanal);
  const isLoading = useChatInboxStore(selectInboxLoading);
  const isLoadingMore = useChatInboxStore(selectInboxLoadingMore);
  const isLoadingMessages = useChatInboxStore(selectInboxMessagesLoading);
  const inboxError = useChatInboxStore(selectInboxError);
  const hasMore = useChatInboxStore(selectInboxHasMore);
  const totalCount = useChatInboxStore(selectInboxTotalCount);
  const hasMoreMessages = useChatInboxStore(selectInboxHasMoreMessages);
  const isLoadingOlderMessages = useChatInboxStore(selectInboxLoadingOlderMessages);

  const fetchInbox = useChatInboxStore((state) => state.fetchInbox);
  const fetchMoreInbox = useChatInboxStore((state) => state.fetchMoreInbox);
  const fetchMessages = useChatInboxStore((state) => state.fetchMessages);
  const selectThread = useChatInboxStore((state) => state.selectThread);
  const setSelectedNumberId = useChatInboxStore((state) => state.setSelectedNumberId);
  const setSelectedCanal = useChatInboxStore((state) => state.setSelectedCanal);
  const setSearch = useChatInboxStore((state) => state.setSearch);
  const sendMessage = useChatInboxStore((state) => state.sendMessage);
  const fetchOlderMessages = useChatInboxStore((state) => state.fetchOlderMessages);
  const subscribeToRealtime = useChatInboxStore((state) => state.subscribeToRealtime);
  const unsubscribeFromRealtime = useChatInboxStore((state) => state.unsubscribeFromRealtime);
  const resetInbox = useChatInboxStore((state) => state.reset);

  const phoneNumbers = usePhoneNumbersStore(selectPhoneNumbers);
  const isLoadingNumbers = usePhoneNumbersStore(selectPhoneNumbersLoading);
  const fetchPhoneNumbers = usePhoneNumbersStore((state) => state.fetchPhoneNumbers);

  const markHITLResponded = useNotificationsStore((state) => state.markHITLRespondedByContact);

  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);

  // Infinite scroll sentinel ref
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  usePageTracking('chat');
  const trackAction = useActionTracking('chat');

  useEffect(() => {
    if (!selectedEnterpriseId) {
      void resetInbox();
      return;
    }

    selectThread(null);
    void fetchInbox(selectedEnterpriseId, true);
    void fetchPhoneNumbers(selectedEnterpriseId, true);
    void subscribeToRealtime(selectedEnterpriseId);

    return () => {
      void unsubscribeFromRealtime();
    };
  }, [selectedEnterpriseId, fetchInbox, fetchPhoneNumbers, subscribeToRealtime, unsubscribeFromRealtime, resetInbox, selectThread]);

  useEffect(() => {
    if (!activeThreadId) return;
    void fetchMessages(activeThreadId, selectedEnterpriseId);
  }, [activeThreadId, fetchMessages, selectedEnterpriseId]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          void fetchMoreInbox();
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, fetchMoreInbox]);

  // Number filter is now server-side (p_numero_id in RPC).
  // Only text search remains client-side for instant feedback.
  const filteredThreads = useMemo(() => {
    const normalizedSearch = inboxSearch.trim().toLowerCase();
    if (!normalizedSearch) return threads;

    return threads.filter((thread) => {
      const haystack = [
        thread.nombre_contacto,
        thread.telefono_contacto,
        thread.nombre_numero,
        thread.telefono_numero,
        thread.ultimo_mensaje_contenido,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [threads, inboxSearch]);

  const activeThread = useMemo(
    () => filteredThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [filteredThreads, activeThreadId]
  );

  // Memoize HITL selector to avoid creating a new function reference on every render
  const hitlContactId = activeThread?.contacto_id ?? null;
  const hitlSelector = useMemo(() => selectPendingHITLForContact(hitlContactId), [hitlContactId]);
  const pendingHITL = useNotificationsStore(hitlSelector);

  useEffect(() => {
    if (filteredThreads.length === 0) {
      if (activeThreadId !== null) {
        selectThread(null);
      }
      setIsMobileThreadOpen(false);
      return;
    }

    if (!activeThread) {
      selectThread(filteredThreads[0].id);
    }
  }, [activeThread, activeThreadId, filteredThreads, selectThread]);

  const handleRefresh = useCallback(() => {
    if (!selectedEnterpriseId) return;
    trackAction('chat.inbox_refresh', { enterpriseId: selectedEnterpriseId });
    void fetchInbox(selectedEnterpriseId, true);
    void fetchPhoneNumbers(selectedEnterpriseId, true);
    if (activeThreadId) {
      void fetchMessages(activeThreadId, selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, activeThreadId, trackAction, fetchInbox, fetchPhoneNumbers, fetchMessages]);

  // Batch selectThread + isMobileThreadOpen in a single handler to avoid 2 separate renders
  const handleSelectThread = useCallback((threadId: number) => {
    selectThread(threadId);
    setIsMobileThreadOpen(true);
    trackAction('chat.thread_select', { threadId });
  }, [selectThread, trackAction]);

  const handleOpenContactDetail = useCallback(() => {
    if (!activeThread?.contacto_id) return;
    setSelectedContactId(activeThread.contacto_id);
    trackAction('chat.open_contact_detail', { contactId: activeThread.contacto_id, threadId: activeThread.id });
  }, [activeThread, trackAction]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeThread) return false;
    const success = await sendMessage(activeThread.id, activeThread.contacto_id, content, activeThread.contactSnapshot);
    if (success && activeThread.contacto_id) {
      await markHITLResponded(activeThread.contacto_id);
    }
    return success;
  }, [activeThread, sendMessage, markHITLResponded]);

  const mobileThreadVisible = isMobileThreadOpen && !!activeThread;

  return (
    <div className="h-full flex bg-[#0c0c0e]">
      <aside className={`${mobileThreadVisible ? 'hidden lg:flex' : 'flex'} w-full lg:w-[30%] lg:max-w-[380px] shrink lg:min-w-0 border-r border-white/5 flex-col`}>
        {/* Search, filter & header — inside sidebar */}
        <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-white/5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquareText className="w-4 h-4 text-emerald-400 shrink-0" />
              <h1 className="text-sm font-semibold text-zinc-200">Conversaciones</h1>
              <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                {filteredThreads.length}{totalCount > 0 ? `/${totalCount}` : ''}
              </span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="shrink-0 p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors disabled:opacity-50"
              title="Actualizar bandeja"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={inboxSearch}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
              />
              {inboxSearch && (
                <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 rounded">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Number filter */}
            <div className="relative shrink-0">
              <Filter className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <select
                value={selectedNumberId ?? ''}
                onChange={(e) => setSelectedNumberId(e.target.value ? Number(e.target.value) : null)}
                className="bg-zinc-900 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/40 appearance-none max-w-[130px]"
              >
                <option value="">Todos</option>
                {phoneNumbers.map((number) => (
                  <option key={number.id} value={number.id}>
                    {(number.nombre || 'Número')} · {number.telefono || 'Sin teléfono'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Channel filter chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {([
              { value: null, label: 'Todos' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'web', label: 'Web' },
              { value: 'email', label: 'Email' },
            ] as const).map((ch) => {
              const isActive = selectedCanal === ch.value;
              return (
                <button
                  key={ch.value ?? 'all'}
                  onClick={() => setSelectedCanal(ch.value)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    isActive
                      ? ch.value === 'whatsapp' ? 'bg-green-500/15 border-green-500/30 text-green-300'
                        : ch.value === 'web' ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        : ch.value === 'email' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-transparent border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                  }`}
                >
                  {ch.label}
                </button>
              );
            })}
          </div>

          {inboxError && <div className="px-3 py-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-xs text-rose-300">{inboxError}</div>}
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {(isLoading || isLoadingNumbers) && filteredThreads.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Cargando bandeja...</span>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center px-4">
                <MessageSquareText className="w-10 h-10 mb-3 opacity-30" />
                <span className="text-sm">No hay conversaciones</span>
                <span className="text-[11px] text-zinc-600 mt-1">
                  {selectedCanal
                    ? `No se encontraron conversaciones de ${selectedCanal === 'whatsapp' ? 'WhatsApp' : selectedCanal === 'web' ? 'Web' : 'Email'}.`
                    : selectedNumberId
                    ? 'No se encontraron conversaciones para este número. Prueba seleccionando "Todos los números".'
                    : inboxSearch
                    ? 'No se encontraron conversaciones con ese criterio de búsqueda.'
                    : 'No se encontraron conversaciones para esta empresa.'}
                </span>
                {(selectedNumberId || selectedCanal || inboxSearch) && (
                  <button
                    onClick={() => { setSelectedNumberId(null); setSelectedCanal(null); setSearch(''); }}
                    className="mt-3 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredThreads.map((thread) => {
                  const isActive = thread.id === activeThread?.id;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => handleSelectThread(thread.id)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        isActive
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-zinc-900/40 border-white/5 hover:bg-white/[0.02] hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-zinc-200 truncate">
                              {thread.nombre_contacto || 'Contacto sin nombre'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
                            <Phone className="w-3 h-3 shrink-0" />
                            <span className="truncate">{thread.telefono_contacto ? formatPhoneDisplay(thread.telefono_contacto) : 'Sin teléfono'}</span>
                          </div>
                        </div>

                        <div className="shrink-0 text-[10px] text-zinc-500 text-right">
                          {new Date(thread.ultimo_mensaje_fecha).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {thread.nombre_numero && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/15 text-[10px] text-violet-300 truncate max-w-full">
                            <Phone className="w-2.5 h-2.5 shrink-0" />
                            {thread.nombre_numero}
                          </span>
                        </div>
                      )}

                      {thread.ultimo_mensaje_contenido && (
                        <p className="mt-1.5 text-xs text-zinc-400 line-clamp-2">{thread.ultimo_mensaje_contenido}</p>
                      )}
                    </button>
                  );
                })}

                {/* Infinite scroll sentinel */}
                <div ref={scrollSentinelRef} className="py-1">
                  {isLoadingMore && (
                    <div className="flex items-center justify-center py-4 text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-xs">Cargando más conversaciones...</span>
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
      </aside>

      <section className={`${mobileThreadVisible ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 min-h-0 flex-col overflow-hidden p-3 lg:p-4`}>
          {activeThread ? (
            <ConversationPanel
              key={activeThread.id}
              conversationId={activeThread.id}
              messages={messages}
              isLoading={isLoadingMessages}
              onBack={() => setIsMobileThreadOpen(false)}
              showBackButton={mobileThreadVisible}
              contact={activeThread.contactSnapshot}
              onSendMessage={handleSendMessage}
              isObservationMode={isObservationMode}
              pendingHITL={pendingHITL ? { mensaje: pendingHITL.mensaje, fecha_envio: pendingHITL.fecha_envio } : null}
              title={activeThread.nombre_contacto || 'Conversación'}
              subtitle={activeThread.nombre_numero
                ? `${activeThread.nombre_numero}${activeThread.telefono_numero ? ` · ${activeThread.telefono_numero}` : ''}`
                : activeThread.telefono_numero ?? undefined}
              hasMoreMessages={hasMoreMessages}
              isLoadingOlderMessages={isLoadingOlderMessages}
              onLoadOlderMessages={fetchOlderMessages}
              headerActions={
                <button
                  onClick={handleOpenContactDetail}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  Ver detalle
                </button>
              }
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center px-6">
              <MessageSquareText className="w-12 h-12 mb-3 opacity-30" />
              <h3 className="text-sm font-medium text-zinc-300">Selecciona una conversación</h3>
              <p className="text-xs text-zinc-500 mt-1">Elige un hilo de la bandeja para ver mensajes y responder.</p>
            </div>
          )}
      </section>

      {selectedContactId !== null && (
        <ContactDetailModal
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          initialTab="conversations"
        />
      )}
    </div>
  );
};

export default EnterpriseInboxView;
