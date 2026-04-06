/**
 * Contact Store — Conversations Slice
 * fetchConversationMessages, clearConversationMessages, sendDirectMessage,
 * fetchRecentConversations, fetchMoreRecentConversations, setRecentConversationsSearch
 * @module store/contact/conversationsSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import { logWarning } from '../../lib/error-logger';
import { trackMetric } from '../../lib/performance-monitor';
import { sendDirectMessageRecord } from '../../lib/direct-message';
import type { ContactState, ContactSet, ContactGet, Conversation } from './types';

const CONVERSATIONS_PAGE_SIZE = 30;

export const createConversationsSlice = (set: ContactSet, get: ContactGet) => ({

  // SECURITY: Verify conversation belongs to current enterprise before fetching messages
  fetchConversationMessages: async (conversationId: number) => {
    const { selectedEnterpriseId } = get();
    const startTime = performance.now();

    set({ isLoadingMessages: true });
    try {
      // First verify the conversation belongs to current enterprise
      const { data: conv, error: convError } = await supabase
        .from('wp_conversaciones')
        .select('id')
        .eq('id', conversationId)
        .eq('empresa_id', selectedEnterpriseId)
        .single();

      if (convError || !conv) {
        console.error('[ContactStore] Access denied: conversation does not belong to current enterprise');
        set({ activeConversationMessages: [], isLoadingMessages: false });
        return;
      }

      const { data, error } = await supabase
        .from('wp_mensajes')
        .select('*')
        .eq('conversacion_id', conversationId)
        .order('created_at', { ascending: true });

      // Track query performance
      const duration = performance.now() - startTime;
      trackMetric('query_fetchConversationMessages', duration, 'ms', { conversationId });
      if (duration > 2000) {
        logWarning('contactStore', `Slow query: fetchConversationMessages took ${duration.toFixed(0)}ms`);
      }

      if (error) {
        console.error('Error fetching conversation messages:', error);
        set({ activeConversationMessages: [], isLoadingMessages: false });
        return;
      }

      // Normalize message types: BD stores 'multimedia' but frontend expects specific types
      const { normalizeMessageTipo } = await import('../../lib/storage');
      const normalizedMessages = (data || []).map(msg => ({
        ...msg,
        tipo: normalizeMessageTipo(msg.tipo, msg.url_archivo)
      }));

      set({
        activeConversationMessages: normalizedMessages,
        isLoadingMessages: false
      });
    } catch (err) {
      console.error('Error in fetchConversationMessages:', err);
      set({ isLoadingMessages: false });
    }
  },

  clearConversationMessages: () => {
    set({ activeConversationMessages: [] });
  },

  sendDirectMessage: async (conversationId: number, contactId: number, content: string) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] Dev team sending message in observed enterprise');
    }

    const { selectedEnterpriseId, userContext, activeContact } = get();

    if (!selectedEnterpriseId || !content.trim()) return false;

    try {
      const result = await sendDirectMessageRecord({
        conversationId,
        contactId,
        content,
        enterpriseId: selectedEnterpriseId,
        userContext,
        contact: activeContact ? {
          id: activeContact.id,
          nombre: activeContact.nombre,
          apellido: activeContact.apellido,
          telefono: activeContact.telefono,
          email: activeContact.email,
        } : null,
      });

      if (!result.success || !result.data) {
        console.error('[ContactStore] Error sending direct message:', result.error);
        return false;
      }

      const data = result.data;

      // Add message to local state optimistically
      set(state => ({
        activeConversationMessages: [...state.activeConversationMessages, data]
      }));

      console.log('[ContactStore] Direct message sent:', data?.id);

      // Award XP for sending a message
      try {
        const { useGamificationStore } = await import('../gamificationStore');
        useGamificationStore.getState().awardXP(
          'message_sent',
          'Mensaje directo enviado',
          data.id,
          'message'
        );
      } catch (gamiErr) {
        console.warn('[ContactStore] Non-critical error awarding XP:', gamiErr);
      }

      return true;

    } catch (err) {
      console.error('[ContactStore] Error in sendDirectMessage:', err);
      return false;
    }
  },

  fetchRecentConversations: async (forceRefresh = false) => {
    const { selectedEnterpriseId, recentConversations, recentConversationsSearch } = get();
    if (!selectedEnterpriseId) return;

    if (!forceRefresh && recentConversations.length > 0 && !recentConversationsSearch) {
      return;
    }

    set({ isLoadingRecentConversations: true, recentConversationsHasMore: true });

    try {
      const searchTerm = recentConversationsSearch?.trim().toLowerCase() || '';

      const query = supabase
        .from('wp_conversaciones')
        .select(`
          id,
          agente_id,
          contacto_id,
          fecha_inicio,
          canal,
          resumen,
          estado,
          created_at,
          metadata,
          contact:wp_contactos(id, nombre, apellido, telefono)
        `, { count: 'exact' })
        .eq('empresa_id', selectedEnterpriseId)
        .order('fecha_inicio', { ascending: false })
        .range(0, CONVERSATIONS_PAGE_SIZE - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      let conversations = (data || []).map((conv: any) => ({
        ...conv,
        contact: Array.isArray(conv.contact) ? conv.contact[0] : conv.contact
      }));

      // Client-side filter when searching
      if (searchTerm) {
        conversations = conversations.filter((conv: any) => {
          const haystack = [
            conv.resumen,
            conv.contact?.nombre,
            conv.contact?.apellido,
            conv.contact?.telefono,
            (conv.metadata as any)?.summary,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(searchTerm);
        });
      }

      const totalCount = count ?? 0;

      set({
        recentConversations: conversations as Conversation[],
        isLoadingRecentConversations: false,
        recentConversationsTotalCount: totalCount,
        recentConversationsHasMore: (data?.length ?? 0) >= CONVERSATIONS_PAGE_SIZE,
      });

      logger.debug(`[ContactStore] Loaded ${conversations.length} recent conversations (total: ${totalCount})`);
    } catch (err) {
      logger.error('[ContactStore] Error fetching recent conversations:', err);
      set({ isLoadingRecentConversations: false });
    }
  },

  fetchMoreRecentConversations: async () => {
    const { selectedEnterpriseId, recentConversations, recentConversationsSearch, isLoadingMoreRecentConversations, recentConversationsHasMore } = get();
    if (!selectedEnterpriseId || isLoadingMoreRecentConversations || !recentConversationsHasMore) return;

    set({ isLoadingMoreRecentConversations: true });

    try {
      const offset = recentConversations.length;
      const searchTerm = recentConversationsSearch?.trim().toLowerCase() || '';

      const query = supabase
        .from('wp_conversaciones')
        .select(`
          id,
          agente_id,
          contacto_id,
          fecha_inicio,
          canal,
          resumen,
          estado,
          created_at,
          metadata,
          contact:wp_contactos(id, nombre, apellido, telefono)
        `)
        .eq('empresa_id', selectedEnterpriseId)
        .order('fecha_inicio', { ascending: false })
        .range(offset, offset + CONVERSATIONS_PAGE_SIZE - 1);

      const { data, error } = await query;

      if (error) throw error;

      let newConversations = (data || []).map((conv: any) => ({
        ...conv,
        contact: Array.isArray(conv.contact) ? conv.contact[0] : conv.contact
      }));

      if (searchTerm) {
        newConversations = newConversations.filter((conv: any) => {
          const haystack = [
            conv.resumen,
            conv.contact?.nombre,
            conv.contact?.apellido,
            conv.contact?.telefono,
            (conv.metadata as any)?.summary,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(searchTerm);
        });
      }

      // Deduplicate
      const existingIds = new Set(recentConversations.map(c => c.id));
      const unique = newConversations.filter((c: any) => !existingIds.has(c.id));

      set({
        recentConversations: [...recentConversations, ...unique] as Conversation[],
        isLoadingMoreRecentConversations: false,
        recentConversationsHasMore: (data?.length ?? 0) >= CONVERSATIONS_PAGE_SIZE,
      });
    } catch (err) {
      logger.error('[ContactStore] Error fetching more recent conversations:', err);
      set({ isLoadingMoreRecentConversations: false });
    }
  },

  setRecentConversationsSearch: (search: string) => {
    set({ recentConversationsSearch: search });
  },
});
