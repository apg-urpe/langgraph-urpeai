/**
 * useChatReliable - Hook principal para el chat con Monica AI
 * 
 * Maneja el protocolo de streaming de Vercel AI SDK con soporte para:
 * - Streaming de texto en tiempo real (text-delta)
 * - Ejecución de tools con visualización de progreso
 * - Multimedios (imágenes, PDFs, audio, video)
 * - Contexto empresarial dinámico
 * - Observabilidad para equipo de desarrollo (role_id = 1)
 * 
 * ## Estados del Agente
 * 
 * | Estado | Descripción |
 * |--------|-------------|
 * | idle | Listo para recibir mensajes |
 * | thinking | Procesando el mensaje del usuario |
 * | streaming | Recibiendo respuesta del modelo |
 * | tool_executing | Ejecutando herramientas (CRM, búsquedas) |
 * | error | Error en la comunicación |
 * 
 * ## Eventos del Stream
 * 
 * - `text-delta`: Fragmento de texto incremental
 * - `tool-input-start`: Inicio de ejecución de tool
 * - `tool-input-available`: Parámetros de tool listos
 * - `tool-output-available`: Resultado de tool recibido
 * - `error`: Error en el stream
 * - `finish`: Mensaje completo
 * 
 * @returns Objeto con estado del chat, mensajes y funciones de control
 * 
 * @example
 * ```tsx
 * const { messages, sendMessage, isLoading, currentToolParts } = useChatReliable();
 * 
 * // Enviar mensaje
 * await sendMessage('Busca contactos de Madrid', attachments);
 * 
 * // Mostrar tools en ejecución
 * {currentToolParts.map(part => (
 *   <ToolExecutionIndicator key={part.toolCallId} part={part} />
 * ))}
 * ```
 */

import { useCallback, useState, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { useContactStore } from '../store/contactStore';
import { useMonicaRolesStore } from '../store/monicaRolesStore';
import { useAuthStore } from '../store/authStore';
import { RequestTrace } from '../types/observability';
import { Attachment } from '../types/chat';
import { processAttachmentsForUpload } from '../lib/chat-upload';
import { logger } from '../lib/logger';
import { trackAction, trackFeatureUse } from '../lib/engagement-tracker';
import { useArtifactStore } from '../store/artifactStore';

type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'tool_executing' | 'error';

/**
 * Representa una parte de ejecución de tool para renderizado en UI.
 * 
 * Usado para mostrar el progreso de ejecución de herramientas (CRM, búsquedas, etc.)
 * en tiempo real mientras el asistente procesa la solicitud.
 * 
 * @example
 * ```tsx
 * <ToolExecutionIndicator
 *   toolName={part.toolName}
 *   state={part.state}
 *   input={part.input}
 *   output={part.output}
 * />
 * ```
 */
export interface ToolPart {
  /** Tipo de parte: tool-call (inicio) o tool-result (completado) */
  type: 'tool-call' | 'tool-result';
  /** Nombre de la herramienta ejecutada (ej: searchContacts, createNote) */
  toolName: string;
  /** ID único de la llamada a tool para tracking */
  toolCallId: string;
  /** Estado actual de la ejecución */
  state: 'pending' | 'executing' | 'complete' | 'error';
  /** Parámetros de entrada de la tool (disponible en state >= executing) */
  input?: Record<string, any>;
  /** Resultado de la ejecución (disponible en state = complete) */
  output?: any;
  /** Mensaje de error (disponible en state = error) */
  errorText?: string;
}

const truncatePromptValue = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const normalized = value
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const normalizePromptEmail = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const uniqueEmails = Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));

  if (uniqueEmails.length > 0) {
    return uniqueEmails.slice(0, 3).join(', ');
  }

  return truncatePromptValue(value, 160);
};

const sanitizeEnterpriseContext = (enterpriseProfile: any) => {
  if (!enterpriseProfile) return null;

  return {
    identity: {
      nombre: truncatePromptValue(enterpriseProfile.nombre, 120),
      rubro: truncatePromptValue(enterpriseProfile.rubro, 160),
      mision: truncatePromptValue((enterpriseProfile.metadata as any)?.mision || (enterpriseProfile.metadata as any)?.vision, 600)
    },
    contact: {
      telefono: truncatePromptValue(enterpriseProfile.telefono, 80),
      email: normalizePromptEmail(enterpriseProfile.email),
      direccion: truncatePromptValue(enterpriseProfile.direccion, 240),
      website: truncatePromptValue(enterpriseProfile.sitio_web, 200)
    },
    business: {
      info: truncatePromptValue(enterpriseProfile.informacion_empresarial, 1200),
      services: truncatePromptValue(enterpriseProfile.servicios_generales, 1200)
    }
  };
};

export const useChatReliable = () => {
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const sessions = useChatStore(state => state.sessions);
  const currentSession = sessions[activeSessionId];
  const messages = currentSession?.messages || [];
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessageById = useChatStore(state => state.updateMessageById);
  const updateMessageAttachments = useChatStore(state => state.updateMessageAttachments);
  const setSessionStatus = useChatStore(state => state.setSessionStatus);
  const persistMessageToDb = useChatStore(state => state.persistMessageToDb);
  const finalizeMessageInDb = useChatStore(state => state.finalizeMessageInDb);
  const renameSession = useChatStore(state => state.renameSession);
  const isLoadingMessagesFromDb = useChatStore(state => state.isLoadingMessages);
  
  // Get Enterprise Profile and IDs for context
  const enterpriseProfile = useContactStore(state => state.enterpriseProfile);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const userContext = useContactStore(state => state.userContext);
  
  // Fallback: Get auth user directly from authStore
  const authUser = useAuthStore(state => state.user);
  
  // Get active Monica Role
  const activeRoleId = useMonicaRolesStore(state => state.activeRoleId);
  
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  
  // Track which session is currently processing (to prevent indicator bleeding to other sessions)
  const processingSessionRef = useRef<string | null>(null);
  
  // Only show loading/streaming if the CURRENT active session is the one processing
  const isProcessingThisSession = processingSessionRef.current === activeSessionId;
  const isLoading = isProcessingThisSession && (agentStatus === 'thinking' || agentStatus === 'streaming');
  const isStreaming = isProcessingThisSession && agentStatus === 'streaming';
  
  // Observability: Store traces by messageId (only for role_id = 1)
  const [messageTraces, setMessageTraces] = useState<Record<string, RequestTrace>>({});
  const lastTraceRef = useRef<RequestTrace | null>(null);
  
  // Tool parts for current message
  const [currentToolParts, setCurrentToolParts] = useState<ToolPart[]>([]);
  const [toolPartsByMessageId, setToolPartsByMessageId] = useState<Record<string, ToolPart[]>>({});
  const currentToolMessageIdRef = useRef<string | null>(null);

  const serializeAttachments = useCallback((items?: Attachment[]) => {
    if (!items?.length) return undefined;
    return items.map(att => ({
      name: att.name,
      type: att.type,
      data: att.data || '',
      url: att.url,
      storagePath: att.storagePath
    }));
  }, []);

  const sendMessage = useCallback(async (text: string, attachments?: Attachment[]) => {
    if ((!text.trim() && (!attachments || attachments.length === 0)) || !activeSessionId || isLoading) return;

    const safeAttachments = attachments || [];
    const hasAttachments = safeAttachments.length > 0;

    // ── IMMEDIATE FEEDBACK: Show user message + thinking state BEFORE upload ──
    // Use local base64 previews so the message appears instantly
    const userMsgId = crypto.randomUUID();
    const userMessage = {
      id: userMsgId,
      role: 'user' as const,
      content: text,
      timestamp: new Date(),
      isComplete: true,
      uiBlocks: [],
      attachments: hasAttachments ? attachments : undefined
    };
    addMessage(activeSessionId, userMessage);

    // Activate thinking state immediately so the user sees the indicator
    processingSessionRef.current = activeSessionId;
    setAgentStatus('thinking');
    setSessionStatus(activeSessionId, { isThinking: true });
    setCurrentToolParts([]);
    currentToolMessageIdRef.current = null;

    // Track engagement: message sent
    trackAction('chat', 'chat.send_message', { 
      messageLength: text.length,
      hasAttachments: !!hasAttachments,
      attachmentCount: hasAttachments ? safeAttachments.length : 0
    });
    
    // Track multimedia feature if attachments present
    if (hasAttachments) {
      trackFeatureUse('chat', 'multimedia_upload', {
        fileTypes: safeAttachments.map(a => a.type)
      });
    }

    // ── BACKGROUND UPLOAD: Upload attachments to Supabase Storage ──
    // This happens AFTER the message is visible and thinking indicator is shown
    let processedAttachments: Attachment[] = [];
    if (hasAttachments && userContext?.id) {
      logger.debug('[Chat] Processing attachments (background):', safeAttachments.length);
      const { processed, errors } = await processAttachmentsForUpload(
        safeAttachments,
        String(userContext.id),
        activeSessionId
      );
      processedAttachments = processed;
      if (errors.length > 0) {
        logger.warn('[Chat] Attachment upload errors:', errors);
      }
    }
    
    const sourceAttachments = processedAttachments.length > 0 ? processedAttachments : safeAttachments;
    const serializedCurrentAttachments = serializeAttachments(sourceAttachments);

    if (serializedCurrentAttachments?.length) {
      updateMessageAttachments(activeSessionId, userMsgId, serializedCurrentAttachments as Attachment[]);
    }

    const persistedUserMessage = {
      ...userMessage,
      attachments: serializedCurrentAttachments as Attachment[] | undefined
    };

    persistMessageToDb(activeSessionId, persistedUserMessage);

    try {
      // Build history from current messages (filter empty content to avoid Zod validation errors)
      const history = messages
        .filter(m => m.content && m.content.trim().length > 0)
        .slice(-20)
        .map(m => ({
          role: m.role,
          content: m.content,
          attachments: serializeAttachments(m.attachments)
        }));

      // Construct Enterprise Context
      const enterpriseContext = sanitizeEnterpriseContext(enterpriseProfile);

      // Get user's timezone from browser or userContext
      const userTimezone = (userContext as any)?.timezone || 
        Intl.DateTimeFormat().resolvedOptions().timeZone || 
        'America/Lima';

      // Prepare attachments for API (convert to serializable format)
      // Use processed (with URLs) if available, fallback to originals (base64 only)
      const attachmentsForApi = sourceAttachments.map(att => ({
        name: att.name,
        type: att.type,
        data: att.data, // Base64 data
        url: att.url,   // Storage URL if uploaded
        storagePath: att.storagePath
      }));

      // CRITICAL: Get userId with fallback to authStore
      const resolvedUserId = userContext?.authUid || authUser?.id;
      
      if (!resolvedUserId) {
        logger.error('[Chat] No userId available - user not authenticated');
        throw new Error('No se pudo identificar al usuario. Por favor, recarga la página.');
      }
      
      // Get session token for API authentication
      const authSession = useAuthStore.getState().session;
      const accessToken = authSession?.access_token;
      
      if (!accessToken) {
        logger.error('[Chat] No access token available - session expired');
        throw new Error('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
      }
      
      logger.debug('[Chat] Sending message with userId:', resolvedUserId);
      logger.debug('[Chat] Enterprise context:', enterpriseContext ? `${enterpriseContext.identity?.nombre} (ID: ${selectedEnterpriseId})` : 'NULL - No enterprise loaded');

      // Controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      let res: Response;
      try {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({ 
            chatInput: text, 
            history, 
            enterpriseContext,
            enterpriseId: selectedEnterpriseId,
            userId: resolvedUserId,
            userRoleId: userContext?.roleId,
            sessionId: activeSessionId,
            userTimezone,
            roleId: activeRoleId,
            attachments: attachmentsForApi.length > 0 ? attachmentsForApi : undefined
          })
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') {
          throw new Error('La conexión tardó demasiado (Timeout). Por favor, intenta de nuevo.');
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        let errorMsg = 'Error ' + res.status;
        try {
          const errorData = await res.json();
          if (errorData.details) {
            const details = typeof errorData.details === 'string' 
              ? errorData.details 
              : JSON.stringify(errorData.details);
            errorMsg += ' - ' + details;
          } else if (errorData.error) {
            errorMsg += ' - ' + errorData.error;
          }
        } catch (e) {
          // Fallback to text if JSON parse fails
          try {
            const textError = await res.text();
            if (textError) errorMsg += ' - ' + textError.slice(0, 200);
          } catch {}
        }
        throw new Error(errorMsg);
      }

      // Award XP for sending a message
      try {
        const { useGamificationStore } = await import('../store/gamificationStore');
        useGamificationStore.getState().awardXP(
          'message_sent',
          'Mensaje de chat enviado'
        );
      } catch (gamiErr) {
        console.warn('[Chat] Non-critical error awarding XP:', gamiErr);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      // Add assistant message placeholder
      const assistantMsgId = crypto.randomUUID();
      const assistantMessage = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
        isComplete: false,
        uiBlocks: []
      };
      addMessage(activeSessionId, assistantMessage);
      
      // Persist assistant placeholder to Supabase (non-blocking)
      persistMessageToDb(activeSessionId, assistantMessage);

      currentToolMessageIdRef.current = assistantMsgId;
      setToolPartsByMessageId(prev => ({
        ...prev,
        [assistantMsgId]: []
      }));

      setAgentStatus('streaming');
      setSessionStatus(activeSessionId, { isStreaming: true });

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';
      let chunkCount = 0;
      const toolParts: ToolPart[] = [];
      let sseEventLines: string[] = [];
      let streamError: string | null = null; // Capturar errores del stream
      let hasTextDelta = false;

      const buildToolFallbackText = (parts: ToolPart[]) => {
        const completed = parts.filter(part => part.state === 'complete' && part.output);
        if (completed.length === 0) return '';

        const sanitizeCell = (value: unknown) => {
          if (value === null || value === undefined || value === '') return '—';
          return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        };

        return completed
          .map((part) => {
            const output = part.output || {};
            // Support both new camelCase and legacy snake_case tool names
            const isSearchTool = ['searchContacts', 'search_contacts_deep', 'buscar_contactos'].includes(part.toolName);
            const isContextTool = ['getContactContext', 'get_full_contact_context', 'ver_contacto_completo'].includes(part.toolName);
            const isNoteTool = ['createNote', 'create_note', 'crear_nota'].includes(part.toolName);
            const isCountTool = part.toolName === 'countContacts';
            const isArtifactTool = part.toolName === 'createArtifact';

            // Prefer resumen field from new tools if available
            if (output.resumen && typeof output.resumen === 'string') {
              return output.resumen;
            }

            if (isSearchTool) {
              const results = (output.contactos || output.results || []) as any[];
              const total = output.total ?? results.length;
              const rows = results.slice(0, 4);

              const listLines = rows.map((contact) => {
                const name = contact?.nombre || contact?.nombre_completo || 'Sin nombre';
                const phone = contact?.telefono ? ` · ${sanitizeCell(contact?.telefono)}` : '';
                return `- ${sanitizeCell(name)}${phone} (ID: ${contact?.id})`;
              });

              return [
                '**Resultados de búsqueda**',
                `Total: ${total}`,
                '',
                listLines.join('\n'),
                results.length > rows.length ? `\n_+${results.length - rows.length} más..._` : ''
              ].join('\n');
            }

            if (isContextTool && (output.contact || output.contacto)) {
              const contact = output.contact || output.contacto;
              const totales = output.totales || {};
              return [
                `**Contacto:** ${sanitizeCell(contact?.nombre || contact?.nombreCompleto)}`,
                `- Teléfono: ${sanitizeCell(contact?.telefono)}`,
                `- Email: ${sanitizeCell(contact?.email)}`,
                `- Estado: ${sanitizeCell(contact?.estado)}`,
                `- Etapa: ${sanitizeCell(contact?.etapa || contact?.etapa_embudo)}`,
                `- Conversaciones: ${sanitizeCell(totales.conversaciones ?? output.conversaciones?.length ?? 0)}`,
                `- Citas: ${sanitizeCell(totales.citas ?? output.citas?.length ?? 0)}`,
                `- Notas: ${sanitizeCell(totales.notas ?? output.notas?.length ?? 0)}`
              ].join('\n');
            }

            if (isNoteTool) {
              if (output.success === false) {
                return `**Nota:** Error - ${sanitizeCell(output.error || 'No se pudo crear la nota')}`;
              }
              const contactName = output.nota?.contacto || '';
              return `**Nota creada${contactName ? ` para ${contactName}` : ''}**`;
            }

            if (isCountTool) {
              return `**Total contactos:** ${output.total ?? 0}${output.filtros && output.filtros !== 'ninguno' ? ` (${output.filtros})` : ''}`;
            }

            if (isArtifactTool) {
              const artifact = output.artifact || {};
              const artifactTitle = output.title || artifact.title || 'Artifact';
              const artifactType = output.artifactType || artifact.type || 'markdown';
              const artifactId = output.artifactId || artifact.id;

              return [
                `**Artifact creado:** ${artifactTitle} (${artifactType})`,
                artifactId ? `ID: ${sanitizeCell(artifactId)}` : ''
              ].filter(Boolean).join('\n');
            }

            if (output.success === false) {
              return `**${part.toolName}:** Error - ${sanitizeCell(output.error || 'Sin detalles')}`;
            }

            return `**${part.toolName}:** Resultado disponible.`;
          })
          .filter(Boolean)
          .join('\n\n');
      };

      const updateToolPartsState = (nextParts: ToolPart[]) => {
        setCurrentToolParts([...nextParts]);
        const messageId = currentToolMessageIdRef.current;
        if (!messageId) return;
        setToolPartsByMessageId(prev => ({
          ...prev,
          [messageId]: [...nextParts]
        }));
      };

      const handleEventData = (rawData: string) => {
        const data = rawData.trim();
        if (!data) return;

        // Stream termination
        if (data === '[DONE]') {
          logger.debug('[Stream] Received [DONE] marker');
          return;
        }

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'text-start':
            case 'text-end':
              break;

            case 'text-delta':
              // Incremental text update
              if (event.delta) {
                hasTextDelta = true;
                fullContent += event.delta;
                updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
              }
              break;

            case 'text':
              if (event.text) {
                if (!fullContent) {
                  fullContent = event.text;
                  updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
                  break;
                }

                if (event.text === fullContent) {
                  break;
                }

                if (event.text.startsWith(fullContent)) {
                  fullContent = event.text;
                  updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
                  break;
                }

                if (!hasTextDelta) {
                  fullContent += event.text;
                  updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
                }
              }
              break;

            case 'tool-input-start':
              // Tool execution starting
              logger.info('[Stream] Tool starting:', event.toolName);
              setAgentStatus('tool_executing');
              toolParts.push({
                type: 'tool-call',
                toolName: event.toolName,
                toolCallId: event.toolCallId,
                state: 'pending'
              });
              updateToolPartsState(toolParts);
              break;

            case 'tool-input-available':
              // Tool input ready
              logger.info('[Stream] Tool input available:', event.toolName, event.input);
              const pendingTool = toolParts.find(t => t.toolCallId === event.toolCallId);
              if (pendingTool) {
                pendingTool.state = 'executing';
                pendingTool.input = event.input;
                updateToolPartsState(toolParts);
              }
              break;

            case 'tool-output-available':
              // Tool result received
              logger.info('[Stream] Tool output available:', event.toolCallId);
              const executingTool = toolParts.find(t => t.toolCallId === event.toolCallId);
              if (executingTool) {
                executingTool.state = 'complete';
                executingTool.output = event.output;
                executingTool.type = 'tool-result';
                updateToolPartsState(toolParts);

                // Sync artifactStore when an artifact is created or updated
                if ((executingTool.toolName === 'createArtifact' || executingTool.toolName === 'updateArtifact') && event.output?.success) {
                  try {
                    const resolvedUid = userContext?.authUid || authUser?.id;
                    if (resolvedUid) {
                      useArtifactStore.getState().fetchArtifacts(resolvedUid, true);
                    }
                  } catch (syncErr) {
                    logger.warn('[Stream] Non-critical: failed to sync artifactStore', syncErr);
                  }
                }
              }
              setAgentStatus('streaming');
              break;

            case 'start-step':
              logger.debug('[Stream] Step started');
              break;

            case 'finish-step':
              logger.debug('[Stream] Step finished');
              break;

            case 'finish':
              logger.debug('[Stream] Message finished');
              break;

            case 'error':
              logger.error('[Stream] Error event:', event.errorText);
              // Capturar el error para mostrarlo al usuario
              streamError = event.errorText || 'Error desconocido del servidor';
              break;

            default:
              // Handle other event types silently
              logger.debug('[Stream] Unknown event type:', event.type);
          }
        } catch (parseErr) {
          // Not JSON - might be plain text fallback or malformed
          logger.debug('[Stream] Non-JSON data:', data.slice(0, 100));
        }
      };

      logger.debug('[Stream] Starting UI Message Protocol stream...');

      // Parse UI Message Stream Protocol (SSE-compatible)
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          logger.debug('[Stream] Stream complete. Total chunks:', chunkCount, 'Final content length:', fullContent.length);
          break;
        }

        chunkCount++;
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from buffer
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          // End of SSE event
          if (line.trim() === '') {
            if (sseEventLines.length > 0) {
              handleEventData(sseEventLines.join('\n'));
              sseEventLines = [];
            }
            continue;
          }

          if (line.startsWith('data:')) {
            sseEventLines.push(line.slice(5).trimStart());
          }
        }

        logger.debug('[Stream] Chunk', chunkCount, '- Content length:', fullContent.length);
      }

      // Flush any pending SSE event
      if (sseEventLines.length > 0) {
        handleEventData(sseEventLines.join('\n'));
        sseEventLines = [];
      }

      // Handle stream error - mostrar al usuario
      if (streamError) {
        fullContent = `⚠️ **Error:** ${streamError}`;
        updateMessageById(activeSessionId, assistantMsgId, fullContent, true);
        setAgentStatus('error');
      }
      // Fallback: if tools ran but no text was generated
      else if (!fullContent.trim() && toolParts.length > 0) {
        const fallbackText = buildToolFallbackText(toolParts);
        fullContent = fallbackText || 'Listo. Ejecuté las herramientas y ya tengo los resultados arriba.';
        updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
      }
      // Fallback: Si no hay contenido, ni tools, ni error capturado
      else if (!fullContent.trim()) {
        fullContent = '⚠️ No se recibió respuesta del servidor. Por favor, intenta de nuevo.';
        updateMessageById(activeSessionId, assistantMsgId, fullContent, true);
      }

      // Mark complete and finalize in Supabase
      updateMessageById(activeSessionId, assistantMsgId, fullContent, true);
      finalizeMessageInDb(activeSessionId, assistantMsgId, fullContent);

      // Auto-generate title every 3 messages (fire-and-forget)
      try {
        const latestSession = useChatStore.getState().sessions[activeSessionId];
        const msgCount = latestSession?.messages?.length || 0;
        // Trigger on message 3, 6, 9... (user+assistant pairs count as 2 each, so 3 = ~2nd exchange)
        if (msgCount >= 3 && msgCount % 3 === 0) {
          const recentMsgs = (latestSession?.messages || [])
            .filter((m: any) => m.content && m.content.trim())
            .slice(-6)
            .map((m: any) => ({ role: m.role, content: m.content.slice(0, 300) }));

          fetch('/api/chat/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: recentMsgs, currentTitle: latestSession?.title })
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.title) {
                renameSession(activeSessionId, data.title);
                logger.debug('[Chat] Auto-title updated:', data.title);
              }
            })
            .catch(err => logger.debug('[Chat] Auto-title failed (non-critical):', err));
        }
      } catch (titleErr) {
        // Non-critical - don't break chat flow
        logger.debug('[Chat] Auto-title error:', titleErr);
      }

    } catch (err: any) {
      logger.error('[Chat]', err);
      addMessage(activeSessionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Error: ' + err.message,
        timestamp: new Date(),
        isComplete: true,
        uiBlocks: []
      });
    } finally {
      setAgentStatus('idle');
      const sessionToUpdate = processingSessionRef.current || activeSessionId;
      processingSessionRef.current = null;
      setSessionStatus(sessionToUpdate, { isThinking: false, isStreaming: false });
    }
  }, [activeSessionId, isLoading, messages, addMessage, updateMessageById, updateMessageAttachments, setSessionStatus, persistMessageToDb, finalizeMessageInDb, renameSession, enterpriseProfile, selectedEnterpriseId, userContext, authUser, activeRoleId, serializeAttachments]);

  const stopGeneration = useCallback(() => {
    setAgentStatus('idle');
    if (activeSessionId) {
      setSessionStatus(activeSessionId, { isThinking: false, isStreaming: false });
    }
  }, [activeSessionId, setSessionStatus]);

  const resetChat = useCallback(() => {
    // No-op for now
  }, []);

  const getTraceForMessage = useCallback((messageId: string): RequestTrace | null => {
    return messageTraces[messageId] || null;
  }, [messageTraces]);

  return {
    messages,
    isLoading,
    isStreaming,
    agentStatus,
    sendMessage,
    stopGeneration,
    resetChat,
    messageTraces,
    getTraceForMessage,
    lastTrace: lastTraceRef.current,
    isLoadingMessages: isLoadingMessagesFromDb,
    connectionStatus: 'connected' as const,
    forceSync: async () => {},
    triggerRecovery: async () => {},
    isMessageAnimating: () => false,
    completeAnimation: () => {},
    agentProgress: { status: agentStatus, stepCount: 0, lastUpdate: Date.now() },
    // Tool execution state
    currentToolParts,
    toolPartsByMessageId,
    isToolExecuting: agentStatus === 'tool_executing'
  };
};

export default useChatReliable;
