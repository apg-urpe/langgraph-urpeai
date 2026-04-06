import { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { normalizeMessageTipo } from '../lib/storage';
import { sendDirectMessageRecord } from '../lib/direct-message';
import { useContactStore } from './contactStore';
import { EnterpriseInboxRpcRow, EnterpriseInboxThread, InboxContactSnapshot } from '../types/chat-inbox';
import { ConversationMessage } from '../types/contact';

const INBOX_PAGE_SIZE = 50;
const MESSAGES_PAGE_SIZE = 50;

interface ChatInboxState {
  enterpriseId: number | null;
  threads: EnterpriseInboxThread[];
  activeThreadId: number | null;
  messages: ConversationMessage[];
  selectedNumberId: number | null;
  selectedCanal: string | null;
  search: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  isLoadingMessages: boolean;
  isLoadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  error: string | null;
  realtimeChannel: RealtimeChannel | null;
  // Pagination
  totalCount: number;
  hasMore: boolean;
  fetchInbox: (enterpriseId: number, forceRefresh?: boolean) => Promise<void>;
  fetchMoreInbox: () => Promise<void>;
  fetchMessages: (conversationId: number, enterpriseId?: number | null) => Promise<void>;
  fetchOlderMessages: () => Promise<void>;
  selectThread: (threadId: number | null) => void;
  setSelectedNumberId: (numberId: number | null) => void;
  setSelectedCanal: (canal: string | null) => void;
  setSearch: (search: string) => void;
  sendMessage: (conversationId: number, contactId: number, content: string, contact?: InboxContactSnapshot | null) => Promise<boolean>;
  subscribeToRealtime: (enterpriseId: number) => Promise<void>;
  unsubscribeFromRealtime: () => Promise<void>;
  refreshThreadByMessage: (payloadConversationId: number) => Promise<void>;
  reset: () => Promise<void>;
}

const toThread = (row: EnterpriseInboxRpcRow): EnterpriseInboxThread => ({
  id: Number(row.id),
  contacto_id: Number(row.contacto_id),
  nombre_contacto: row.nombre_contacto,
  telefono_contacto: row.telefono_contacto,
  ultimo_mensaje_contenido: row.ultimo_mensaje_contenido,
  ultimo_mensaje_fecha: row.ultimo_mensaje_fecha,
  canal: row.canal,
  estado: row.estado,
  numero_id: row.numero_id ? Number(row.numero_id) : null,
  nombre_numero: row.nombre_numero,
  telefono_numero: row.telefono_numero ?? null,
  remitente_ultimo_mensaje: row.remitente_ultimo_mensaje ?? null,
  contactSnapshot: {
    id: Number(row.contacto_id),
    nombre: row.nombre_contacto,
    apellido: null,
    telefono: row.telefono_contacto,
    origen: row.contacto_origen ?? row.canal ?? null,
    ultima_interaccion: row.contacto_ultima_interaccion ?? row.ultimo_mensaje_fecha,
  },
});

const normalizeMessages = (rows: any[]): ConversationMessage[] => {
  return (rows || []).map((msg) => ({
    ...msg,
    tipo: normalizeMessageTipo(msg.tipo, msg.url_archivo),
  }));
};

/** Build RPC params with security filters (role 3 → team_humano_id). */
const buildInboxRpcParams = (
  enterpriseId: number,
  limit: number,
  offset: number,
  selectedNumberId: number | null,
  selectedCanal: string | null = null,
): Record<string, unknown> => {
  const params: Record<string, unknown> = {
    p_empresa_id: enterpriseId,
    p_limit: limit,
    p_offset: offset,
  };
  if (selectedNumberId) params.p_numero_id = selectedNumberId;
  if (selectedCanal) params.p_canal = selectedCanal;

  // Role 3 security: restrict to conversations whose contacts are assigned to the user
  const { userContext } = useContactStore.getState();
  if (userContext?.roleId === 3 && userContext.id) {
    params.p_team_humano_id = userContext.id;
  }

  return params;
};

export const useChatInboxStore = create<ChatInboxState>((set, get) => ({
  enterpriseId: null,
  threads: [],
  activeThreadId: null,
  messages: [],
  selectedNumberId: null,
  selectedCanal: null,
  search: '',
  isLoading: false,
  isLoadingMore: false,
  isLoadingMessages: false,
  isLoadingOlderMessages: false,
  hasMoreMessages: false,
  error: null,
  realtimeChannel: null,
  totalCount: 0,
  hasMore: false,

  fetchInbox: async (enterpriseId, forceRefresh = false) => {
    const { threads, enterpriseId: currentEnterpriseId, selectedNumberId, selectedCanal } = get();
    if (!enterpriseId) return;
    if (!forceRefresh && currentEnterpriseId === enterpriseId && threads.length > 0) return;

    // When switching enterprise, clear stale threads immediately to prevent
    // auto-select effect from picking old threads during the async gap.
    const isEnterpriseSwitch = currentEnterpriseId !== null && currentEnterpriseId !== enterpriseId;
    set({
      isLoading: true,
      error: null,
      enterpriseId,
      ...(isEnterpriseSwitch ? { threads: [], activeThreadId: null, messages: [], totalCount: 0, hasMore: false } : {}),
    });

    try {
      const rpcParams = buildInboxRpcParams(enterpriseId, INBOX_PAGE_SIZE, 0, selectedNumberId, selectedCanal);
      const { data, error } = await supabase.rpc('get_enterprise_inbox_paginated', rpcParams);
      if (error) throw error;

      const rows = (data || []) as EnterpriseInboxRpcRow[];
      const nextThreads = rows.map(toThread);
      const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
      const activeThreadStillExists = nextThreads.some((thread) => thread.id === get().activeThreadId);

      set({
        threads: nextThreads,
        activeThreadId: activeThreadStillExists ? get().activeThreadId : nextThreads[0]?.id ?? null,
        isLoading: false,
        error: null,
        totalCount,
        hasMore: nextThreads.length < totalCount,
      });
    } catch (err: any) {
      logger.error('[ChatInboxStore] Error fetching inbox:', err);
      set({ isLoading: false, error: err?.message || 'Error al cargar la bandeja de WhatsApp' });
    }
  },

  fetchMoreInbox: async () => {
    const { enterpriseId, threads, isLoadingMore, hasMore, selectedNumberId, selectedCanal } = get();
    if (!enterpriseId || isLoadingMore || !hasMore) return;

    set({ isLoadingMore: true });

    try {
      const rpcParams = buildInboxRpcParams(enterpriseId, INBOX_PAGE_SIZE, threads.length, selectedNumberId, selectedCanal);
      const { data, error } = await supabase.rpc('get_enterprise_inbox_paginated', rpcParams);
      if (error) throw error;

      const rows = (data || []) as EnterpriseInboxRpcRow[];
      const newThreads = rows.map(toThread);
      const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : get().totalCount;

      // Deduplicate — realtime may have inserted threads already present
      const existingIds = new Set(threads.map((t) => t.id));
      const uniqueNew = newThreads.filter((t) => !existingIds.has(t.id));

      const merged = [...threads, ...uniqueNew];

      set({
        threads: merged,
        isLoadingMore: false,
        totalCount,
        hasMore: merged.length < totalCount,
      });
    } catch (err: any) {
      logger.error('[ChatInboxStore] Error fetching more inbox:', err);
      set({ isLoadingMore: false });
    }
  },

  fetchMessages: async (conversationId, enterpriseIdOverride = null) => {
    const enterpriseId = enterpriseIdOverride ?? get().enterpriseId;
    if (!enterpriseId || !conversationId) return;

    // Keep old messages visible while loading (no spinner flash).
    // Only show spinner if we have no messages at all (first load).
    const hasExistingMessages = get().messages.length > 0;
    set({ isLoadingMessages: !hasExistingMessages, error: null, hasMoreMessages: false });

    try {
      // Load the latest N messages (desc to get newest first, then reverse for chronological order)
      const { data, error } = await supabase
        .from('wp_mensajes')
        .select('*')
        .eq('conversacion_id', conversationId)
        .eq('empresa_id', enterpriseId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (error) throw error;

      // Staleness guard: if the user switched threads/enterprise while we were
      // loading, discard the result to prevent overwriting the current state.
      if (get().activeThreadId !== conversationId) return;

      const rows = data || [];
      // Reverse to chronological order (oldest first)
      const chronological = normalizeMessages(rows.reverse());

      // Do NOT set activeThreadId here — that is selectThread's job.
      set({
        messages: chronological,
        isLoadingMessages: false,
        hasMoreMessages: rows.length >= MESSAGES_PAGE_SIZE,
      });
    } catch (err: any) {
      logger.error('[ChatInboxStore] Error fetching messages:', err);
      if (get().activeThreadId !== conversationId) return;
      set({ messages: [], isLoadingMessages: false, hasMoreMessages: false, error: err?.message || 'Error al cargar mensajes' });
    }
  },

  fetchOlderMessages: async () => {
    const { activeThreadId, enterpriseId, messages, isLoadingOlderMessages, hasMoreMessages } = get();
    if (!activeThreadId || !enterpriseId || isLoadingOlderMessages || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    set({ isLoadingOlderMessages: true });

    try {
      const { data, error } = await supabase
        .from('wp_mensajes')
        .select('*')
        .eq('conversacion_id', activeThreadId)
        .eq('empresa_id', enterpriseId)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (error) throw error;

      // Staleness guard
      if (get().activeThreadId !== activeThreadId) return;

      const rows = data || [];
      const olderChronological = normalizeMessages(rows.reverse());

      set({
        messages: [...olderChronological, ...get().messages],
        isLoadingOlderMessages: false,
        hasMoreMessages: rows.length >= MESSAGES_PAGE_SIZE,
      });
    } catch (err: any) {
      logger.error('[ChatInboxStore] Error fetching older messages:', err);
      set({ isLoadingOlderMessages: false });
    }
  },

  selectThread: (threadId) => {
    const prev = get().activeThreadId;
    // Clear messages when switching to a different thread to avoid flashing old content
    set({
      activeThreadId: threadId,
      ...(threadId !== prev ? { messages: [], hasMoreMessages: false } : {}),
    });
  },

  setSelectedNumberId: (numberId) => {
    const { enterpriseId, selectedNumberId: prev } = get();
    if (numberId === prev) return;
    set({ selectedNumberId: numberId, threads: [], activeThreadId: null, messages: [], totalCount: 0, hasMore: false });
    if (enterpriseId) {
      // Re-fetch with the new filter applied server-side
      void get().fetchInbox(enterpriseId, true);
    }
  },
  setSelectedCanal: (canal) => {
    const { enterpriseId, selectedCanal: prev } = get();
    if (canal === prev) return;
    set({ selectedCanal: canal, threads: [], activeThreadId: null, messages: [], totalCount: 0, hasMore: false });
    if (enterpriseId) {
      void get().fetchInbox(enterpriseId, true);
    }
  },

  setSearch: (search) => set({ search }),

  sendMessage: async (conversationId, contactId, content, contact = null) => {
    const { enterpriseId, messages, threads } = get();
    const { userContext, isObservationMode } = useContactStore.getState();

    if (!enterpriseId || !content.trim()) return false;

    if (isObservationMode) {
      logger.info('[ChatInboxStore] Dev team sending message in observed enterprise');
    }

    try {
      const result = await sendDirectMessageRecord({
        conversationId,
        contactId,
        content,
        enterpriseId,
        userContext,
        contact: contact ? {
          id: contact.id,
          nombre: contact.nombre,
          apellido: contact.apellido,
          telefono: contact.telefono,
        } : null,
      });

      if (!result.success || !result.data) {
        logger.error('[ChatInboxStore] Error sending direct message:', result.error);
        return false;
      }

      const optimisticMessage = normalizeMessages([result.data])[0];
      const nextThreads = threads.map((thread) => {
        if (thread.id !== conversationId) return thread;
        return {
          ...thread,
          ultimo_mensaje_contenido: content,
          ultimo_mensaje_fecha: result.data.created_at || new Date().toISOString(),
          remitente_ultimo_mensaje: 'humano',
          contactSnapshot: contact ? { ...thread.contactSnapshot, ...contact } : thread.contactSnapshot,
        };
      }).sort((a, b) => new Date(b.ultimo_mensaje_fecha).getTime() - new Date(a.ultimo_mensaje_fecha).getTime());

      set({ messages: [...messages, optimisticMessage], threads: nextThreads });
      return true;
    } catch (err) {
      logger.error('[ChatInboxStore] Error in sendMessage:', err);
      return false;
    }
  },

  subscribeToRealtime: async (enterpriseId) => {
    const { realtimeChannel } = get();
    if (realtimeChannel) {
      await get().unsubscribeFromRealtime();
    }

    const channel = supabase
      .channel(`enterprise-inbox-${enterpriseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wp_mensajes',
          filter: `empresa_id=eq.${enterpriseId}`,
        },
        async (payload) => {
          const inserted = payload.new as any;
          const activeThreadId = get().activeThreadId;
          const normalized = normalizeMessages([inserted])[0];

          if (inserted?.conversacion_id && activeThreadId === inserted.conversacion_id) {
            set((state) => {
              if (state.messages.some((message) => message.id === normalized.id)) {
                return state;
              }
              return { messages: [...state.messages, normalized] };
            });
          }

          await get().refreshThreadByMessage(inserted?.conversacion_id);
        }
      )
      .subscribe((status) => {
        logger.debug('[ChatInboxStore] Realtime status:', status);
      });

    set({ realtimeChannel: channel, enterpriseId });
  },

  unsubscribeFromRealtime: async () => {
    const { realtimeChannel } = get();
    if (!realtimeChannel) return;
    await supabase.removeChannel(realtimeChannel);
    set({ realtimeChannel: null });
  },

  refreshThreadByMessage: async (payloadConversationId: number) => {
    const { enterpriseId, threads } = get();
    if (!enterpriseId || !payloadConversationId) return;

    try {
      const { data: latestMsg } = await supabase
        .from('wp_mensajes')
        .select('contenido, created_at, remitente')
        .eq('conversacion_id', payloadConversationId)
        .eq('empresa_id', enterpriseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestMsg) {
        const existingThread = threads.find((t) => t.id === payloadConversationId);
        if (existingThread) {
          const nextThreads = threads
            .map((t) =>
              t.id === payloadConversationId
                ? {
                    ...t,
                    ultimo_mensaje_contenido: latestMsg.contenido?.substring(0, 200) ?? t.ultimo_mensaje_contenido,
                    ultimo_mensaje_fecha: latestMsg.created_at ?? t.ultimo_mensaje_fecha,
                    remitente_ultimo_mensaje: latestMsg.remitente ?? t.remitente_ultimo_mensaje,
                  }
                : t
            )
            .sort((a, b) => new Date(b.ultimo_mensaje_fecha).getTime() - new Date(a.ultimo_mensaje_fecha).getTime());
          set({ threads: nextThreads });
          return;
        }
      }
    } catch {
      // Fallback to full reload if targeted update fails
    }

    await get().fetchInbox(enterpriseId, true);
  },

  reset: async () => {
    await get().unsubscribeFromRealtime();
    set({
      enterpriseId: null,
      threads: [],
      activeThreadId: null,
      messages: [],
      selectedNumberId: null,
      selectedCanal: null,
      search: '',
      isLoading: false,
      isLoadingMore: false,
      isLoadingMessages: false,
      isLoadingOlderMessages: false,
      hasMoreMessages: false,
      error: null,
      totalCount: 0,
      hasMore: false,
    });
  },
}));

export const selectInboxThreads = (state: ChatInboxState) => state.threads;
export const selectInboxActiveThreadId = (state: ChatInboxState) => state.activeThreadId;
export const selectInboxMessages = (state: ChatInboxState) => state.messages;
export const selectInboxSelectedNumberId = (state: ChatInboxState) => state.selectedNumberId;
export const selectInboxSelectedCanal = (state: ChatInboxState) => state.selectedCanal;
export const selectInboxSearch = (state: ChatInboxState) => state.search;
export const selectInboxLoading = (state: ChatInboxState) => state.isLoading;
export const selectInboxLoadingMore = (state: ChatInboxState) => state.isLoadingMore;
export const selectInboxMessagesLoading = (state: ChatInboxState) => state.isLoadingMessages;
export const selectInboxError = (state: ChatInboxState) => state.error;
export const selectInboxHasMore = (state: ChatInboxState) => state.hasMore;
export const selectInboxTotalCount = (state: ChatInboxState) => state.totalCount;
export const selectInboxHasMoreMessages = (state: ChatInboxState) => state.hasMoreMessages;
export const selectInboxLoadingOlderMessages = (state: ChatInboxState) => state.isLoadingOlderMessages;
