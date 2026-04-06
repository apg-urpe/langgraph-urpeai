/**
 * Chat Store - Store de sesiones de chat con persistencia IndexedDB
 * 
 * Gestiona múltiples sesiones de chat con Monica AI:
 * - Sesiones persistentes con IndexedDB (para soportar imágenes grandes)
 * - Múltiples sesiones simultáneas (multi-session chat)
 * - Persistencia a Supabase (mensajes en base de datos)
 * - UI Blocks para renderizado dinámico
 * - Adjuntos multimedia (imágenes, PDFs, audio, video)
 * 
 * ## Arquitectura de Almacenamiento
 * 
 * ### IndexedDB (Cliente)
 * - Mensajes locales con adjuntos
 * - Límite: 500 mensajes por sesión
 * - Persistencia automática entre recargas
 * 
 * ### Supabase (Servidor)
 * - Mensajes sincronizados a wp_chat_messages
 * - Mensajes finalizados guardados permanentemente
 * 
 * @module store/chatStore
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { Message, UIBlock, Attachment, MessageFeedback } from '../types/chat';
import { ChatSession, ChatSessionMeta, DbChatMessage } from '../types';
import { logger } from '../lib/logger';

// IndexedDB Storage Adapter to handle large payloads (images)
const DB_NAME = 'urpe-ai-db';
const STORE_NAME = 'chat-store';

// PERFORMANCE: LÃ­mite de mensajes por sesiÃ³n para prevenir memory leaks
const MAX_MESSAGES_PER_SESSION = 500;
const MESSAGE_CLEANUP_THRESHOLD = 600; // Limpiar cuando exceda este nÃºmero

// IMPROVED: IndexedDB storage with better error handling and logging
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof indexedDB === 'undefined') {
      logger.warn('[IDB] IndexedDB no disponible en este entorno');
      return null;
    }
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const getRequest = store.get(name);
          getRequest.onsuccess = () => resolve(getRequest.result as string || null);
          getRequest.onerror = (e) => {
            logger.warn('[IDB] Error leyendo:', name);
            resolve(null);
          };
        } catch (err) {
          logger.warn('[IDB] Error en transacciÃ³n de lectura:', err);
          resolve(null);
        }
      };
      request.onerror = (e) => {
        logger.warn('[IDB] Error abriendo DB para lectura');
        resolve(null);
      };
    });
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof indexedDB === 'undefined') return;
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          store.put(value, name);
          transaction.oncomplete = () => resolve();
          transaction.onerror = (e) => {
            logger.warn('[IDB] Error guardando:', name);
            resolve();
          };
        } catch (err) {
          logger.warn('[IDB] Error en transacciÃ³n de escritura:', err);
          resolve();
        }
      };
      request.onerror = (e) => {
        logger.warn('[IDB] Error abriendo DB para escritura');
        resolve();
      };
    });
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof indexedDB === 'undefined') return;
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          store.delete(name);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
        } catch (err) {
          logger.warn('[IDB] Error eliminando:', name, err);
          resolve();
        }
      };
      request.onerror = () => resolve();
    });
  },
};

interface ChatState {
  sessions: Record<string, ChatSession & { messages: Message[] }>;
  activeSessionId: string;
  
  // NEW: Loading state for messages
  isLoadingMessages: boolean;
  
  // UI State
  isSidebarCollapsed: boolean;
  currentTheme: AppTheme;
  themeIntensity: number; // 0 to 100

  // Global Instructions
  globalInstructions: string;

  // Artifact / Canvas State (New)
  isArtifactOpen: boolean;
  artifactContent: string;
  artifactStatus: 'building' | 'ready';

  // Pending message (for cross-module send-to-chat, NOT persisted)
  pendingMessage: string | null;

  // Actions
  toggleSidebar: () => void;
  setTheme: (theme: AppTheme) => void;
  setThemeIntensity: (intensity: number) => void;
  setActiveSession: (id: string) => void;
  setGlobalInstructions: (instructions: string) => void;
  
  // Artifact Actions
  openArtifact: (content: string) => void;
  updateArtifact: (content: string) => void;
  closeArtifact: () => void;
  setArtifactStatus: (status: 'building' | 'ready') => void;

  // Async Actions - Supabase Persistence
  syncSessions: () => Promise<void>;
  loadSessionsFromDb: (userId: string) => Promise<void>;
  loadMessagesForSession: (sessionId: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  
  // Message Actions with Supabase Persistence
  addMessage: (sessionId: string, message: Message) => void;
  persistMessageToDb: (sessionId: string, message: Message) => Promise<string | null>;
  updateLastMessageContent: (sessionId: string, contentChunk: string) => void;
  updateMessageById: (sessionId: string, messageId: string, content: string, isComplete?: boolean) => void;
  updateMessageContentInDb: (sessionId: string, messageId: string, content: string) => Promise<void>;
  finalizeMessageInDb: (sessionId: string, messageId: string, content: string, uiBlocks?: UIBlock[]) => Promise<void>;
  updateMessageAttachments: (sessionId: string, messageId: string, attachments: Attachment[]) => void;
  addUiBlockToLastMessage: (sessionId: string, block: UIBlock) => void;
  
  // Feedback Actions
  updateMessageFeedback: (sessionId: string, messageId: string, feedback: MessageFeedback) => Promise<void>;
  
  // Message Actions
  deleteMessage: (sessionId: string, messageId: string) => Promise<void>;

  // State Management Actions
  setSessionStatus: (sessionId: string, status: { isThinking?: boolean; isStreaming?: boolean }) => void;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  toggleSessionPin: (sessionId: string) => Promise<void>;

  // Pending message actions (cross-module)
  setPendingMessage: (message: string) => void;
  consumePendingMessage: () => string | null;
}

export type AppTheme = 'nebula' | 'matrix' | 'ember' | 'glacier' | 'midnight';

// Generate initial ID once
const INITIAL_SESSION_ID = crypto.randomUUID();

// =============================================================================
// PERFORMANCE: Optimized atomic selectors to prevent unnecessary re-renders
// =============================================================================
export const selectActiveSessionId = (state: ChatState) => state.activeSessionId;
export const selectSessions = (state: ChatState) => state.sessions;
export const selectIsSidebarCollapsed = (state: ChatState) => state.isSidebarCollapsed;
export const selectCurrentTheme = (state: ChatState) => state.currentTheme;
export const selectThemeIntensity = (state: ChatState) => state.themeIntensity;
export const selectGlobalInstructions = (state: ChatState) => state.globalInstructions;
export const selectIsArtifactOpen = (state: ChatState) => state.isArtifactOpen;
export const selectArtifactContent = (state: ChatState) => state.artifactContent;
export const selectArtifactStatus = (state: ChatState) => state.artifactStatus;
export const selectIsLoadingMessages = (state: ChatState) => state.isLoadingMessages;
export const selectPendingMessage = (state: ChatState) => state.pendingMessage;

// Derived selector for active session
export const selectActiveSession = (state: ChatState) => 
  state.sessions[state.activeSessionId];

export const selectActiveSessionMessages = (state: ChatState) => 
  state.sessions[state.activeSessionId]?.messages || [];

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {
        [INITIAL_SESSION_ID]: {
          id: INITIAL_SESSION_ID,
          title: 'New Analysis',
          date: new Date().toISOString(),
          active: true,
          messages: [],
          isThinking: false,
          isStreaming: false,
          hasUnread: false,
          isPinned: false,
          // Custom instructions removed to enforce global logic
        }
      },
      activeSessionId: INITIAL_SESSION_ID,
      isLoadingMessages: false,
      isSidebarCollapsed: false,
      currentTheme: 'glacier', // Changed default to Glacier (Cyan)
      themeIntensity: 65, // Increased default intensity for better ambiance visibility
      globalInstructions: '',


      // Artifact Init
      isArtifactOpen: false,
      artifactContent: '',
      artifactStatus: 'ready',

      // Pending message init
      pendingMessage: null,

      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setTheme: (theme) => set({ currentTheme: theme }),
      setThemeIntensity: (intensity) => set({ themeIntensity: intensity }),

      setActiveSession: (id) => {
        const state = get();
        if (!state.sessions[id]) return;
        
        // Update active session synchronously
        set({ 
          activeSessionId: id, 
          sessions: {
            ...state.sessions,
            [id]: {
              ...state.sessions[id],
              hasUnread: false
            }
          }
        });
        
        // Load messages from Supabase if not already loaded (async, non-blocking)
        const session = state.sessions[id];
        if (!session?.messages || session.messages.length === 0) {
          get().loadMessagesForSession(id);
        }
      },

      setGlobalInstructions: (instructions) => set({ globalInstructions: instructions }),

      // Artifact Actions Implementation
      openArtifact: (content) => set({ isArtifactOpen: true, artifactContent: content }),
      updateArtifact: (content) => set({ artifactContent: content }),
      closeArtifact: () => set({ isArtifactOpen: false }),
      setArtifactStatus: (status) => set({ artifactStatus: status }),

      syncSessions: async () => {
        const state = get();
        
        // Solo resetear sesiones que llevan MUCHO tiempo sin actividad (> 5 minutos)
        // No resetear sesiones que podrÃ­an estar activamente procesando
        const STALE_SESSION_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos
        const now = Date.now();
        const updatedSessions = { ...state.sessions };
        let hasStuckSessions = false;
        
        Object.keys(updatedSessions).forEach(id => {
          const session = updatedSessions[id];
          if (session.isThinking || session.isStreaming) {
            // Verificar si la sesiÃ³n lleva mucho tiempo sin actualizar
            const lastUpdate = new Date(session.date).getTime();
            const timeSinceUpdate = now - lastUpdate;
            
            if (timeSinceUpdate > STALE_SESSION_THRESHOLD_MS) {
              logger.debug('[ChatStore] Reseteando sesiÃ³n stale:', id);
              updatedSessions[id] = {
                ...session,
                isThinking: false,
                isStreaming: false
              };
              hasStuckSessions = true;
            } else {
              logger.debug('[ChatStore] SesiÃ³n ocupada reciente, no resetear:', id);
            }
          }
        });
        
        if (hasStuckSessions) {
          set({ sessions: updatedSessions });
        }
        
        // Si no hay sesiones, crear una nueva
        if (Object.keys(state.sessions).length === 0) {
           get().createNewSession();
        }
      },
      
      // Cargar sesiones desde Supabase - FUENTE PRINCIPAL para multi-dispositivo
      loadSessionsFromDb: async (userId: string) => {
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, omitiendo carga de sesiones');
            return;
          }
          
          const supabase = createAuthenticatedClient(accessToken);
          
          logger.debug('[ChatStore] Cargando sesiones de Supabase para:', userId);
          
          // Cargar sesiones del usuario desde Supabase (excluyendo archivadas)
          const { data: dbSessions, error } = await supabase
            .schema('adaptive_interface')
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('is_archived', false)
            .order('updated_at', { ascending: false })
            .limit(50);
          
          if (error) {
            logger.error('[ChatStore] Error cargando sesiones:', error);
            return;
          }
          
          const state = get();
          
          if (!dbSessions || dbSessions.length === 0) {
            logger.debug('[ChatStore] No hay sesiones en Supabase');
            // Si hay sesiones locales sin sync, mantenerlas
            return;
          }
          
          logger.debug('[ChatStore] Sesiones de Supabase:', dbSessions.length);
          
          // Crear nuevo mapa de sesiones priorizando Supabase
          const newSessions: typeof state.sessions = {};
          
          // Primero agregar todas las sesiones de Supabase
          for (const dbSession of dbSessions) {
            const localSession = state.sessions[dbSession.id];
            
            newSessions[dbSession.id] = {
              id: dbSession.id,
              title: dbSession.title || 'Chat',
              date: dbSession.updated_at || dbSession.created_at,
              active: true,
              messages: localSession?.messages || [],
              isThinking: localSession?.isThinking || false,
              isStreaming: localSession?.isStreaming || false,
              hasUnread: localSession?.hasUnread || false,
              isPinned: Boolean(dbSession.is_pinned)
            };
          }
          
          // Mantener sesiones locales que aÃºn no estÃ¡n en Supabase (nuevas sin sincronizar)
          // IMPORTANTE: Siempre preservar la sesiÃ³n activa actual, incluso si estÃ¡ vacÃ­a
          for (const [id, localSession] of Object.entries(state.sessions)) {
            const isActiveSession = id === state.activeSessionId;
            const hasMessages = localSession.messages.length > 0;
            
            if (!newSessions[id] && (hasMessages || isActiveSession)) {
              newSessions[id] = localSession as typeof state.sessions[string];
              if (isActiveSession && !hasMessages) {
                logger.debug('[ChatStore] Preservando sesiÃ³n activa vacÃ­a:', id);
              } else {
                logger.debug('[ChatStore] Manteniendo sesiÃ³n local no sincronizada:', id);
              }
            }
          }
          
          // Si no hay sesiones, agregar la inicial
          if (Object.keys(newSessions).length === 0) {
            const newId = crypto.randomUUID();
            newSessions[newId] = {
              id: newId,
              title: 'New Analysis',
              date: new Date().toISOString(),
              active: true,
              messages: [],
              isThinking: false,
              isStreaming: false,
              hasUnread: false,
              isPinned: false,
            };
          }
          
          // Determinar quÃ© sesiÃ³n activar
          let nextActiveId = state.activeSessionId;
          if (!newSessions[nextActiveId]) {
            // La sesiÃ³n activa ya no existe, usar la mÃ¡s reciente
            nextActiveId = Object.keys(newSessions)[0];
          }
          
          set({ sessions: newSessions, activeSessionId: nextActiveId });
          logger.debug('[ChatStore] Sesiones sincronizadas. Activa:', nextActiveId);
          
        } catch (err) {
          logger.error('[ChatStore] Error en loadSessionsFromDb:', err);
        }
      },

      // Cargar mensajes de una sesiÃ³n especÃ­fica desde Supabase
      loadMessagesForSession: async (sessionId: string) => {
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, omitiendo carga de mensajes');
            return;
          }
          
          const supabase = createAuthenticatedClient(accessToken);
          set({ isLoadingMessages: true });

          const { data: dbMessages, error } = await supabase
            .schema('adaptive_interface')
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

          if (error) {
            logger.error('[ChatStore] Error cargando mensajes:', error);
            set({ isLoadingMessages: false });
            return;
          }

          const state = get();
          const session = state.sessions[sessionId];
          if (session) {
            const messages: Message[] = (dbMessages || []).map((m: any) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? JSON.parse(m.content).text : m.content.text,
              timestamp: new Date(m.created_at),
              isComplete: m.is_complete,
              uiBlocks: typeof m.content === 'string' ? JSON.parse(m.content).uiBlocks : m.content.uiBlocks,
              attachments: m.metadata?.attachments
            }));

            set((state) => ({
              sessions: {
                ...state.sessions,
                [sessionId]: { ...session, messages }
              },
              isLoadingMessages: false
            }));
          } else {
            set({ isLoadingMessages: false });
          }
        } catch (err) {
          logger.error('[ChatStore] Error en loadMessagesForSession:', err);
          set({ isLoadingMessages: false });
        }
      },

      // Crear nueva sesiÃ³n en local y Supabase
      createNewSession: async () => {
        const state = get();
        const activeSession = state.sessions[state.activeSessionId];
        if (activeSession && activeSession.messages.length === 0) {
          logger.debug('[ChatStore] SesiÃ³n activa ya estÃ¡ vacÃ­a, no crear nueva');
          set({ isSidebarCollapsed: false });
          return;
        }

        const newId = crypto.randomUUID();
        const now = new Date().toISOString();

        const newSession = {
          id: newId,
          title: 'New Analysis',
          date: now,
          active: true,
          messages: [],
          isThinking: false,
          isStreaming: false,
          hasUnread: false,
          isPinned: false,
        };

        set((state) => ({
          sessions: { [newId]: newSession, ...state.sessions },
          activeSessionId: newId,
          isSidebarCollapsed: false,
          isArtifactOpen: false,
          artifactContent: ''
        }));

        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useContactStore } = await import('./contactStore');
          const { useAuthStore } = await import('./authStore');
          const userContext = useContactStore.getState().userContext;
          const accessToken = useAuthStore.getState().session?.access_token;

          if (!accessToken || !userContext?.authUid) {
            logger.warn('[ChatStore] No se puede persistir sesión: usuario no autenticado');
            return;
          }

          const supabase = createAuthenticatedClient(accessToken);

          const { error } = await supabase
            .schema('adaptive_interface')
            .from('chat_sessions')
            .insert({
              id: newId,
              user_id: userContext.authUid,
              title: 'New Analysis',
              created_at: now,
              updated_at: now,
              is_archived: false,
              is_pinned: false
            });

          if (error) {
            logger.error('[ChatStore] Error persistiendo sesión:', error);
          }
        } catch (err) {
          logger.error('[ChatStore] Error en createNewSession persistence:', err);
        }
      },

      deleteSession: async (id) => {
        // 1. Optimistic update - remover del estado local inmediatamente (solo de la vista)
        set((state) => {
          const { [id]: archived, ...rest } = state.sessions;
          let nextActiveId = state.activeSessionId;
          
          if (id === state.activeSessionId) {
            const remainingIds = Object.keys(rest);
            if (remainingIds.length > 0) {
              nextActiveId = remainingIds[0];
            } else {
                const newId = crypto.randomUUID();
                rest[newId] = {
                  id: newId,
                  title: 'New Analysis',
                  date: new Date().toISOString(),
                  active: true,
                  messages: [],
                  isThinking: false,
                  isStreaming: false,
                  hasUnread: false,
                  isPinned: false,
                };
                nextActiveId = newId;
            }
          }
          return { sessions: rest, activeSessionId: nextActiveId };
        });

        // 2. Archivar en Supabase (NO eliminar, solo marcar is_archived = true)
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, omitiendo archivado');
            return;
          }
          
          const supabase = createAuthenticatedClient(accessToken);
          
          // Archivar todos los mensajes de la sesión
          const { error: messagesError } = await supabase
            .schema('adaptive_interface')
            .from('chat_messages')
            .update({ is_archived: true })
            .eq('session_id', id);

          if (messagesError) {
            logger.error('[ChatStore] Error archivando mensajes de sesiÃ³n:', messagesError);
          }

          // Archivar la sesiÃ³n
          const { error: sessionError } = await supabase
            .schema('adaptive_interface')
            .from('chat_sessions')
            .update({ is_archived: true })
            .eq('id', id);

          if (sessionError) {
            logger.error('[ChatStore] Error archivando sesiÃ³n:', sessionError);
          } else {
            logger.debug('[ChatStore] SesiÃ³n archivada en Supabase:', id);
          }
        } catch (err) {
          logger.error('[ChatStore] Error en deleteSession (archive):', err);
        }
      },

      addMessage: (sessionId, message) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          let newTitle = session.title;
          const isFirstUserMessage = session.messages.length === 0 && message.role === 'user';
          
          if (isFirstUserMessage) {
            newTitle = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
          }

          let newMessages = [...session.messages, message];
        
          if (newMessages.length > MESSAGE_CLEANUP_THRESHOLD) {
            logger.debug('[ChatStore] Limpiando mensajes antiguos:', newMessages.length);
            // Mantener los primeros 10 (contexto inicial) + los Ãºltimos (MAX - 10)
            const firstMessages = newMessages.slice(0, 10);
            const recentMessages = newMessages.slice(-(MAX_MESSAGES_PER_SESSION - 10));
            newMessages = [...firstMessages, ...recentMessages];
          }
        
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                date: new Date().toISOString(),
                title: newTitle,
                messages: newMessages
              }
            }
          };
        });
      },

      persistMessageToDb: async (sessionId, message) => {
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useContactStore } = await import('./contactStore');
          const { useAuthStore } = await import('./authStore');
          const userContext = useContactStore.getState().userContext;
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, mensaje no persistido');
            return null;
          }
          
          const supabase = createAuthenticatedClient(accessToken);

          if (!userContext?.authUid) return null;

          // Verificar/crear sesión antes de insertar mensaje (evita FK violation)
          const { data: existingSession } = await supabase
            .schema('adaptive_interface')
            .from('chat_sessions')
            .select('id')
            .eq('id', sessionId)
            .maybeSingle();

          if (!existingSession) {
            // Crear sesión si no existe
            const now = new Date().toISOString();
            const { error: sessionError } = await supabase
              .schema('adaptive_interface')
              .from('chat_sessions')
              .insert({
                id: sessionId,
                user_id: userContext.authUid,
                title: 'New Analysis',
                created_at: now,
                updated_at: now,
                is_archived: false
              });

            if (sessionError) {
              logger.error('[ChatStore] Error creando sesión:', sessionError);
              return null;
            }
          }

          const { data, error } = await supabase
            .schema('adaptive_interface')
            .from('chat_messages')
            .insert({
              id: message.id,
              session_id: sessionId,
              user_id: userContext.authUid,
              role: message.role,
              content: { text: message.content, uiBlocks: message.uiBlocks || [] },
              is_complete: message.isComplete ?? true,
              metadata: { attachments: message.attachments || [] },
              created_at: message.timestamp.toISOString()
            })
            .select('id')
            .single();

          if (error) {
            logger.error('[ChatStore] Error persistiendo mensaje:', error);
            return null;
          }

          return data.id;
        } catch (err) {
          logger.error('[ChatStore] Error en persistMessageToDb:', err);
          return null;
        }
      },

      finalizeMessageInDb: async (sessionId, messageId, content, uiBlocks) => {
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, mensaje no finalizado en BD');
            return;
          }
          
          const supabase = createAuthenticatedClient(accessToken);
          
          const { error } = await supabase
            .schema('adaptive_interface')
            .from('chat_messages')
            .update({
              content: { text: content, uiBlocks: uiBlocks || [] },
              is_complete: true
            })
            .eq('session_id', sessionId)
            .filter('id', 'eq', messageId); // Usar filter si el id es uuid o string

          if (error) {
            logger.error('[ChatStore] Error finalizando mensaje:', error);
          }
        } catch (err) {
          logger.error('[ChatStore] Error en finalizeMessageInDb:', err);
        }
      },

      updateLastMessageContent: (sessionId, contentChunk) => set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;

        const messages = [...session.messages];
        const lastMsg = messages[messages.length - 1];
        
        if (lastMsg && lastMsg.role === 'assistant') {
          messages[messages.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + contentChunk
          };
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages
              }
            }
          };
        }
        return state;
      }),

      updateMessageById: (sessionId, messageId, content, isComplete) => set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;

        const messages = session.messages.map(m => 
          m.id === messageId ? { ...m, content, ...(typeof isComplete === 'boolean' ? { isComplete } : {}) } : m
        );

        return {
          sessions: {
            ...state.sessions,
            [sessionId]: { ...session, messages }
          }
        };
      }),

      updateMessageContentInDb: async (sessionId, messageId, content) => {
         return; 
      },

      updateMessageAttachments: (sessionId, messageId, attachments) => set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;

        const messages = session.messages.map(m => 
            m.id === messageId ? { ...m, attachments } : m
        );

        return {
            sessions: {
                ...state.sessions,
                [sessionId]: { ...session, messages }
            }
        };
      }),

      addUiBlockToLastMessage: (sessionId, block) => set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;

        const messages = [...session.messages];
        const lastMsg = messages[messages.length - 1];

        if (lastMsg && lastMsg.role === 'assistant') {
          messages[messages.length - 1] = {
            ...lastMsg,
            uiBlocks: [...lastMsg.uiBlocks, block]
          };
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages
              }
            }
          };
        }
        return state;
      }),

      updateMessageFeedback: async (sessionId, messageId, feedback) => {
        // 1. Optimistic update - actualizar estado local inmediatamente
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          
          const messages = session.messages.map(m =>
            m.id === messageId ? { ...m, feedback } : m
          );
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, messages }
            }
          };
        });

        // 2. Persistir en Supabase
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, feedback no guardado');
            return;
          }
          
          const supabase = createAuthenticatedClient(accessToken);
          
          const { error } = await supabase
            .schema('adaptive_interface')
            .from('chat_messages')
            .update({ feedback })
            .eq('id', messageId);

          if (error) {
            logger.error('[ChatStore] Error guardando feedback:', error);
          } else {
            logger.debug('[ChatStore] Feedback guardado:', messageId);
          }
        } catch (err) {
          logger.error('[ChatStore] Error en updateMessageFeedback:', err);
        }
      },

      deleteMessage: async (sessionId, messageId) => {
        // 1. Optimistic update - remover del estado local inmediatamente (solo de la vista)
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          
          const messages = session.messages.filter(m => m.id !== messageId);
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, messages }
            }
          };
        });

        // 2. Archivar en Supabase (NO eliminar, solo marcar is_archived = true)
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          
          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, mensaje no archivado');
            return;
          }
          
          const supabase = createAuthenticatedClient(accessToken);
          
          const { error } = await supabase
            .schema('adaptive_interface')
            .from('chat_messages')
            .update({ is_archived: true })
            .eq('id', messageId);

          if (error) {
            logger.error('[ChatStore] Error archivando mensaje:', error);
          } else {
            logger.debug('[ChatStore] Mensaje archivado:', messageId);
          }
        } catch (err) {
          logger.error('[ChatStore] Error en deleteMessage (archive):', err);
        }
      },

      renameSession: async (sessionId, newTitle) => {
        // 1. Optimistic update local
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, title: newTitle }
            }
          };
        });

        // 2. Persistir en Supabase
        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;
          if (!accessToken) return;
          const supabase = createAuthenticatedClient(accessToken);

          const { error } = await supabase
            .schema('adaptive_interface')
            .from('chat_sessions')
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq('id', sessionId);

          if (error) {
            logger.error('[ChatStore] Error renombrando sesión:', error);
          } else {
            logger.debug('[ChatStore] Sesión renombrada:', sessionId, newTitle);
          }
        } catch (err) {
          logger.error('[ChatStore] Error en renameSession:', err);
        }
      },

      toggleSessionPin: async (sessionId) => {
        const currentSession = get().sessions[sessionId];
        if (!currentSession) return;

        const previousPinnedState = currentSession.isPinned ?? false;
        const nextPinnedState = !previousPinnedState;

        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                isPinned: nextPinnedState
              }
            }
          };
        });

        try {
          const { createAuthenticatedClient } = await import('../lib/supabase');
          const { useAuthStore } = await import('./authStore');
          const accessToken = useAuthStore.getState().session?.access_token;

          if (!accessToken) {
            logger.debug('[ChatStore] Sin token, omitiendo persistencia de pin');
            return;
          }

          const supabase = createAuthenticatedClient(accessToken);

          const { error } = await supabase
            .schema('adaptive_interface')
            .from('chat_sessions')
            .update({ is_pinned: nextPinnedState, updated_at: new Date().toISOString() })
            .eq('id', sessionId);

          if (error) {
            logger.error('[ChatStore] Error actualizando pin de sesión:', error);

            set((state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;

              return {
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    isPinned: previousPinnedState
                  }
                }
              };
            });
            return;
          }

          logger.debug('[ChatStore] Pin de sesión actualizado:', sessionId, nextPinnedState);
        } catch (err) {
          logger.error('[ChatStore] Error en toggleSessionPin:', err);

          set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;

            return {
              sessions: {
                ...state.sessions,
                [sessionId]: {
                  ...session,
                  isPinned: previousPinnedState
                }
              }
            };
          });
        }
      },

      setSessionStatus: (sessionId, status) => set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;

        let newHasUnread = session.hasUnread;
        if (status.isStreaming === false) {
           newHasUnread = true; 
        }
        if (sessionId === state.activeSessionId) {
            newHasUnread = false;
        }

        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              ...status,
              hasUnread: newHasUnread
            }
          }
        };
      }),

      // Pending message actions (cross-module send-to-chat)
      setPendingMessage: (message) => set({ pendingMessage: message }),
      consumePendingMessage: () => {
        const msg = get().pendingMessage;
        if (msg) set({ pendingMessage: null });
        return msg;
      },
    }),
    {
      name: 'urpe-ai-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({ 
        sessions: state.sessions, 
        activeSessionId: state.activeSessionId,
        isSidebarCollapsed: state.isSidebarCollapsed,
        currentTheme: state.currentTheme,
        themeIntensity: state.themeIntensity,
        globalInstructions: state.globalInstructions
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.syncSessions();
        }
      }
    }
  )
);
