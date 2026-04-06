'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { sanitizeHtml } from '../lib/sanitize-html';
import { Message, Attachment, MessageFeedback as FeedbackType } from '../types/chat';
import { InputArea } from './InputArea';
import { VisualRenderer } from './VisualRenderer';
import { MessageContentRenderer } from './MessageContentRenderer';
import { MessageActions } from './MessageActions';
import { logger } from '@/lib/logger';
import { User, CheckCircle2, ChevronRight, ChevronDown, ChevronUp, Code2, Eye, Zap, Activity } from 'lucide-react';
import { RequestTrace } from '@/types/observability';
import { TraceAccordion, TraceDetailModal, ToolExecutionCard } from './chat';
import { useContactStore } from '@/store/contactStore';
import type { ToolPart } from '@/hooks/useChatReliable';
import { ChatHeader } from './ChatHeader';
import { HistoryModal } from './HistoryModal';
import { ChatSession } from '../types';
import { useChatStore, selectActiveSessionId, selectActiveSessionMessages, selectIsSidebarCollapsed } from '../store/chatStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';
import { SafeBlockRenderer } from './SafeBlockRenderer';

interface AgentProgress {
  status: 'idle' | 'connecting' | 'thinking' | 'processing' | 'streaming' | 'error' | 'recovery';
  stepCount: number;
  lastUpdate: number;
}

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
  onStopGeneration?: () => void;
  isThinking: boolean;
  isStreaming: boolean;
  isLoadingMessages?: boolean;
  isMessageAnimating?: (messageId: string) => boolean;
  agentProgress?: AgentProgress;
  onRecoverMessage?: () => void;
  // New props for header integration
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  // Artifacts
  onOpenArtifactLibrary?: () => void;
  // Observability props (only for role_id = 1)
  getTraceForMessage?: (messageId: string) => RequestTrace | null;
  // Tool execution state
  currentToolParts?: ToolPart[];
  toolPartsByMessageId?: Record<string, ToolPart[]>;
}

// --- Enhanced Thinking Indicator with Status ---
interface DynamicThinkingProps {
  status?: 'thinking' | 'processing' | 'streaming' | 'connecting';
  stepCount?: number;
  elapsedTime?: number;
}

const DynamicThinking: React.FC<DynamicThinkingProps> = ({ 
  status = 'thinking', 
  stepCount = 0,
  elapsedTime = 0 
}) => {
  const { language } = useLanguageStore();
  
  const statusMessages: Record<string, { en: string; es: string }> = {
    connecting: { en: 'Connecting...', es: 'Conectando...' },
    thinking: { en: 'Thinking...', es: 'Pensando...' },
    processing: { en: 'Processing...', es: 'Procesando...' },
    streaming: { en: 'Writing...', es: 'Escribiendo...' },
  };
  
  const currentMessage = statusMessages[status]?.[language] || statusMessages.thinking[language];
  const showTime = elapsedTime > 5;
  const timeDisplay = showTime ? `${elapsedTime}s` : '';
  
  return (
    <div className="flex gap-2 animate-fade-in-up mt-1 ml-[3.25rem] md:ml-[3.75rem]">
      <div className="flex items-center gap-2 text-zinc-500 bg-transparent px-2 py-1 rounded-lg w-fit backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '-0.32s' }}></div>
            <div className="w-1 h-1 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '-0.16s' }}></div>
            <div className="w-1 h-1 rounded-full bg-primary-500 animate-bounce"></div>
          </div>
          <span className="text-xs font-medium tracking-wide opacity-80">{currentMessage}</span>
          {showTime && <span className="text-[10px] font-mono opacity-60 ml-1 border-l border-white/10 pl-2">{timeDisplay}</span>}
      </div>
    </div>
  );
};

const TOOL_LABELS: Record<string, string> = {
  // New tool names (camelCase)
  searchContacts: 'Búsqueda CRM',
  getContactContext: 'Contexto',
  createNote: 'Nota',
  countContacts: 'Conteo',
  registerPayment: 'Registrar Pago',
  attachPaymentReceipt: 'Adjuntar Comprobante',
  createArtifact: 'Artifact',
  updateArtifact: 'Editar Artifact',
  // Legacy tool names
  search_contacts_deep: 'Búsqueda CRM',
  buscar_contactos: 'Búsqueda CRM',
  get_full_contact_context: 'Contexto',
  ver_contacto_completo: 'Contexto',
  create_note: 'Nota',
  crear_nota: 'Nota'
};

const isToolError = (toolPart: ToolPart) => {
  const output = toolPart.output as any;
  return toolPart.state === 'error' || output?.success === false || output?.exito === false;
};

const getToolSummary = (toolPart: ToolPart) => {
  const input = toolPart.input as any;
  const output = toolPart.output as any;
  const toolName = toolPart.toolName;
  
  // Tool type detection (supports both new camelCase and legacy names)
  const isSearchTool = ['searchContacts', 'search_contacts_deep', 'buscar_contactos'].includes(toolName);
  const isContextTool = ['getContactContext', 'get_full_contact_context', 'ver_contacto_completo'].includes(toolName);
  const isNoteTool = ['createNote', 'create_note', 'crear_nota'].includes(toolName);
  const isCountTool = toolName === 'countContacts';
  const isArtifactTool = toolName === 'createArtifact' || toolName === 'updateArtifact';

  // Executing state
  if (toolPart.state === 'pending' || toolPart.state === 'executing') {
    if (isSearchTool) {
      const term = input?.query || input?.termino_busqueda;
      return term ? `Buscando "${term}"…` : 'Buscando contactos…';
    }
    if (isContextTool) {
      const id = input?.contactId || input?.contact_id;
      return id ? `Cargando contacto #${id}…` : 'Consultando contacto…';
    }
    if (isNoteTool) {
      const txt = input?.texto || input?.contenido;
      return txt ? `Guardando: "${String(txt).slice(0, 30)}…"` : 'Guardando nota…';
    }
    if (isCountTool) return 'Contando contactos…';
    if (isArtifactTool) {
      const artifactTitle = input?.title;
      return artifactTitle ? `Guardando artifact: "${String(artifactTitle).slice(0, 30)}…"` : 'Guardando artifact…';
    }
    return 'Ejecutando…';
  }

  // Error state - now errors are flat strings
  if (isToolError(toolPart)) {
    const err = output?.error;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && err !== null) {
      return err.message || err.mensaje || JSON.stringify(err);
    }
    return output?.mensaje || 'Error al ejecutar.';
  }

  // Success - prefer resumen field from new tools
  if (output?.resumen && typeof output.resumen === 'string') {
    // Truncate long resumen for card display
    const resumen = output.resumen;
    return resumen.length > 80 ? resumen.substring(0, 77) + '…' : resumen;
  }

  // Fallback summaries by tool type
  if (isSearchTool) {
    const total = output?.total ?? output?.contactos?.length ?? output?.results?.length ?? 0;
    return `${total} contacto${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}`;
  }

  if (isContextTool) {
    const contact = output?.contacto || output?.contact;
    return contact?.nombre || contact?.nombreCompleto || 'Contexto listo.';
  }

  if (isNoteTool) {
    return output?.nota?.contacto ? `Nota guardada para ${output.nota.contacto}` : 'Nota creada.';
  }

  if (isCountTool) {
    return `${output?.total ?? 0} contactos`;
  }

  if (isArtifactTool) {
    const title = output?.title || output?.artifact?.title || 'Artifact';
    const type = output?.artifactType || output?.artifact?.type;
    return type ? `${title} (${type})` : `${title} creado`;
  }

  return 'Resultado disponible.';
};

const ToolStepsStack: React.FC<{ toolParts: ToolPart[] }> = ({ toolParts }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out artifact tools — they render as prominent cards outside this stack
  const nonArtifactParts = toolParts.filter(p => p.toolName !== 'createArtifact' && p.toolName !== 'updateArtifact');
  if (nonArtifactParts.length === 0) return null;

  const runningCount = nonArtifactParts.filter(part => part.state === 'pending' || part.state === 'executing').length;
  const errorCount = nonArtifactParts.filter(isToolError).length;
  const okCount = nonArtifactParts.filter(part => !isToolError(part) && part.state === 'complete').length;

  const statusSummary = [
    runningCount ? `${runningCount} en curso` : null,
    errorCount ? `${errorCount} error${errorCount === 1 ? '' : 'es'}` : null,
    okCount ? `${okCount} OK` : null
  ].filter(Boolean).join(' · ');

  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/40 backdrop-blur-md px-3 py-2 mb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-400">
          <Activity className="w-3 h-3 text-primary-400" />
          <span>Pasos intermedios</span>
          <span className="text-zinc-500">({nonArtifactParts.length})</span>
          {statusSummary && (
            <span className="text-[10px] text-zinc-500 normal-case">{statusSummary}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Ocultar' : 'Ver detalles'}
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {!isExpanded && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {nonArtifactParts.map((toolPart) => {
            const statusColor = isToolError(toolPart)
              ? 'text-red-400 border-red-500/30'
              : toolPart.state === 'pending' || toolPart.state === 'executing'
                ? 'text-amber-300 border-amber-400/30'
                : 'text-emerald-300 border-emerald-400/30';
            return (
              <div
                key={toolPart.toolCallId}
                className={`shrink-0 rounded-full border ${statusColor} bg-white/5 px-2.5 py-1 text-[11px] flex items-center gap-2`}
              >
                <span className="font-semibold text-zinc-200">
                  {TOOL_LABELS[toolPart.toolName] || toolPart.toolName}
                </span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-300 max-w-[220px] truncate">
                  {getToolSummary(toolPart)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isExpanded && (
        <div className="mt-2 space-y-1.5">
          {nonArtifactParts.map((toolPart) => (
            <ToolExecutionCard key={toolPart.toolCallId} toolPart={toolPart} />
          ))}
        </div>
      )}
    </div>
  );
};

// Stylized Receipt for System Interactions - Enhanced Design
const InteractionReceipt: React.FC<{ content: string }> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(false);
  const match = content.match(/^\[INTERACTION:\s*([A-Z_]+)\]\s*(.*)/);
  if (!match) return <div className="text-xs text-zinc-600">{sanitizeHtml(content)}</div>;
  const type = match[1];
  const rawJson = match[2];
  let parsedData = {};
  try { parsedData = JSON.parse(rawJson); } catch { parsedData = { raw: rawJson }; }

  // Format type for display
  const formattedType = type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="flex justify-end w-full my-3">
      <div className="relative bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 border border-zinc-700/40 rounded-xl overflow-hidden min-w-[280px] max-w-sm backdrop-blur-xl shadow-sm group hover:border-primary-500/30 transition-all duration-300">
        {/* Header */}
        <div 
          onClick={() => setIsOpen(!isOpen)} 
          className="relative px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors active:bg-white/10"
        >
          <div className="flex items-center gap-2">
            {/* Icon */}
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500/20 to-primary-500/20 flex items-center justify-center border border-emerald-500/30 flex-shrink-0">
              <Zap className="w-3 h-3 text-emerald-400" />
            </div>
            
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                System Action
              </span>
              <span className="text-xs font-medium text-zinc-100">{formattedType}</span>
            </div>
          </div>
          
          <div className={`p-1 rounded bg-zinc-800/50 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-700/50 transition-all duration-200 ${isOpen ? 'rotate-90' : ''}`}>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
        
        {/* Expandable content */}
        {isOpen && (
          <div className="px-3 pb-3 pt-1 border-t border-zinc-800/50 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded bg-zinc-800/50">
                <Code2 className="w-2.5 h-2.5 text-primary-400" />
              </div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Data Transmitted</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
              {sanitizeHtml(JSON.stringify(parsedData, null, 2))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Component to detect and render HTML content from user
const UserHtmlContent: React.FC<{ content: string }> = ({ content }) => {
  const { openArtifact } = useChatStore();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content) && 
    (content.includes('</') || content.includes('/>') || content.includes('<table') || content.includes('<div') || content.includes('<html'));
  
  if (!looksLikeHtml) {
    const TEXT_COLLAPSE_THRESHOLD = 300;
    const isLongText = content.length > TEXT_COLLAPSE_THRESHOLD;

    if (!isLongText) {
      return <span className="whitespace-pre-wrap">{sanitizeHtml(content)}</span>;
    }

    return (
      <div className="relative">
        <span className={`whitespace-pre-wrap transition-all duration-300 ease-in-out ${!isExpanded ? 'line-clamp-4' : ''}`}>
          {sanitizeHtml(content)}
        </span>
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#161618] via-[#161618]/80 to-transparent pointer-events-none rounded-b-xl" />
        )}
        <div className="flex justify-end">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="relative mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-200 backdrop-blur-sm transition-all duration-200 group shadow-sm"
          >
            {isExpanded ? (
              <><ChevronUp className="w-3 h-3 text-primary-400 transition-transform duration-200 group-hover:-translate-y-0.5" /> Ver menos</>
            ) : (
              <><ChevronDown className="w-3 h-3 text-primary-400 transition-transform duration-200 group-hover:translate-y-0.5" /> Ver más</>
            )}
          </button>
        </div>
      </div>
    );
  }
  
  const previewLength = 150;
  const isLong = content.length > previewLength;
  const displayContent = isExpanded ? content : content.slice(0, previewLength);
  
  return (
    <div className="space-y-2">
      <div className="bg-zinc-900/50 border border-zinc-700/50 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-zinc-900/80 border-b border-zinc-700/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Código HTML</span>
            <span className="text-[10px] text-zinc-600 font-mono">({(content.length / 1024).toFixed(1)}KB)</span>
          </div>
          <button
            onClick={() => openArtifact(sanitizeHtml(content))}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
          >
            <Eye className="w-3 h-3" />
            Ver
          </button>
        </div>
        <div className="p-3">
          <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-all leading-relaxed max-h-32 overflow-hidden">
            {sanitizeHtml(displayContent)}{isLong && !isExpanded && '...'}
          </pre>
          {isLong && (
            <div className="flex justify-end mt-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 hover:border-primary-500/30 text-primary-400 hover:text-primary-300 backdrop-blur-sm transition-all duration-200 group shadow-sm"
              >
                {isExpanded ? (
                  <><ChevronUp className="w-3 h-3 transition-transform duration-200 group-hover:-translate-y-0.5" /> Mostrar menos</>
                ) : (
                  <><ChevronDown className="w-3 h-3 transition-transform duration-200 group-hover:translate-y-0.5" /> Mostrar más</>
                )}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

// Component to render user attachments
const AttachmentView: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
  const isImage = attachment.type.startsWith('image/');
  
  if (isImage) {
    return (
      <div className="relative group inline-block overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-md transition-all hover:shadow-xl hover:border-primary-500/30 backdrop-blur-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={attachment.data} 
            alt={attachment.name} 
            className="h-28 md:h-40 w-auto object-cover min-w-[100px] transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
              <span className="text-[10px] text-white/90 font-medium font-mono truncate w-full">{attachment.name}</span>
          </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border transition-all group max-w-xs h-16 md:h-20 shadow-sm backdrop-blur-md border-white/10 bg-black/40 hover:bg-black/60 hover:border-primary-500/30">
        <div className="p-2.5 rounded-lg transition-colors border bg-white/5 text-zinc-400 border-white/5 group-hover:bg-primary-500/10 group-hover:text-primary-400">
            <span className="text-xs font-bold uppercase">{attachment.type.split('/')[1] || 'FILE'}</span>
        </div>
        <div className="flex flex-col min-w-0">
            <span className="text-xs md:text-sm font-medium text-zinc-200 truncate max-w-[120px]">{attachment.name}</span>
            <span className="text-[9px] md:text-[10px] uppercase font-bold tracking-wider text-zinc-500">Attached File</span>
        </div>
    </div>
  );
};

/**
 * PERFORMANCE: Specialized memoized component for rendering individual messages
 */
const MessageItem = React.memo(({ 
  msg, 
  index, 
  isSequence, 
  isNewMessage, 
  animationDelay, 
  userAvatar, 
  isDeveloper, 
  getTraceForMessage, 
  handleFeedback, 
  handleDeleteMessage, 
  handleInteraction, 
  isMessageAnimating, 
  isThinking, 
  isStreaming, 
  submittedForms,
  toolParts
}: { 
  msg: Message; 
  index: number; 
  isSequence: boolean; 
  isNewMessage: boolean; 
  animationDelay: number; 
  userAvatar: string; 
  isDeveloper: boolean; 
  getTraceForMessage?: (id: string) => RequestTrace | null; 
  handleFeedback: (id: string, f: FeedbackType) => void; 
  handleDeleteMessage: (id: string) => void; 
  handleInteraction: (data: any) => void; 
  isMessageAnimating?: (id: string) => boolean; 
  isThinking: boolean; 
  isStreaming: boolean; 
  submittedForms: Set<string>; 
  toolParts?: ToolPart[];
}) => {
  return (
    <div 
      className={`group flex gap-3 md:gap-6 ${msg.role === 'user' ? 'flex-row-reverse' : ''} ${isNewMessage ? 'animate-message-in' : ''} ${isSequence ? 'mt-1' : 'mt-6'}`}
      style={isNewMessage ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      {!isSequence ? (
        <div className={`w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-sm mt-1 backdrop-blur-sm overflow-hidden transition-colors duration-500 ${
          msg.role === 'assistant'
            ? 'bg-black/40 border-primary-500/20 shadow-[0_0_15px_rgba(var(--primary-500),0.15)]' 
            : 'bg-white/5 border-white/5'
        }`}>
          {msg.role === 'assistant' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img 
              src="https://vecspltvmyopwbjzerow.supabase.co/storage/v1/object/public/chat-uploads/imag_confi/mzdwsitj_IMG_6812.webp" 
              alt="Monica"
              className="w-full h-full object-cover"
            />
          ) : userAvatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img 
              src={userAvatar} 
              alt="You" 
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-300" />
          )}
        </div>
      ) : (
         <div className="w-8 h-8 md:w-9 md:h-9 flex-shrink-0" />
      )}

      <div className={`flex flex-col min-w-0 ${
        msg.role === 'user' 
          ? 'items-end max-w-[85%] md:max-w-[70%]' 
          : 'items-start w-full max-w-full'
      }`}>
        {msg.role === 'assistant' && toolParts && toolParts.length > 0 && (
          <ToolStepsStack toolParts={toolParts} />
        )}
        {/* Artifact cards — always visible, outside the accordion */}
        {msg.role === 'assistant' && toolParts && toolParts.filter(p => p.toolName === 'createArtifact' || p.toolName === 'updateArtifact').length > 0 && (
          <div className="flex flex-col gap-2 mb-2 w-full">
            {toolParts.filter(p => p.toolName === 'createArtifact' || p.toolName === 'updateArtifact').map(p => (
              <ToolExecutionCard key={p.toolCallId} toolPart={p} />
            ))}
          </div>
        )}
        {!isSequence && (
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <span className={`text-xs uppercase tracking-wide transition-all duration-500 ${msg.role === 'assistant' ? 'text-primary-400 font-extrabold drop-shadow-[0_0_8px_rgba(var(--primary-400),0.6)]' : 'text-zinc-400 font-bold'}`}>
              {msg.role === 'assistant' ? 'Monica' : 'You'}
            </span>
            {msg.role === 'assistant' && (
               <span className="text-[9px] font-mono text-primary-500/80 border border-primary-500/20 px-1 rounded bg-primary-500/5 shadow-[0_0_10px_rgba(var(--primary-400),0.1)] transition-colors duration-500">
                 [AI]
               </span>
            )}
            <span className="text-[10px] text-zinc-600 font-mono">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        <div className={`text-[0.95rem] md:text-[0.92rem] leading-7 w-full overflow-hidden break-words backdrop-blur-md transition-all duration-300 ${
          msg.role === 'user' 
            ? 'text-zinc-100 bg-[#161618]/60 px-4 py-3 md:px-6 md:py-4 rounded-3xl rounded-tr-md border border-white/[0.08] hover:border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-white/5' 
            : 'text-zinc-300'
        }`}>
          
          {msg.attachments && msg.attachments.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.attachments.map((att, i) => (
                <AttachmentView key={i} attachment={att} />
              ))}
            </div>
          )}

          {msg.role === 'user' ? (
            <UserHtmlContent content={msg.content} />
          ) : (
            <MessageContentRenderer 
              content={msg.content} 
              onInteract={handleInteraction}
              isStreaming={isStreaming}
              isAnimating={isMessageAnimating?.(msg.id)}
              isDisabled={isThinking || isStreaming}
            />
          )}
        </div>

        {/* Action buttons - only for completed assistant messages */}
        {msg.role === 'assistant' && msg.isComplete !== false && !isStreaming && (
          <MessageActions
            messageId={msg.id}
            content={msg.content}
            currentFeedback={msg.feedback || null}
            onFeedback={handleFeedback}
            onArchive={handleDeleteMessage}
          />
        )}

        {/* Observability Trace Accordion - only for developers (role_id = 1) */}
        {isDeveloper && msg.role === 'assistant' && msg.isComplete !== false && getTraceForMessage && (() => {
          const trace = getTraceForMessage(msg.id);
          if (!trace || trace.toolTraces.length === 0) return null;
          return (
            <TraceAccordion
              trace={trace}
              onViewDetail={() => {
                // This will be handled by the parent
                handleInteraction({ type: 'VIEW_TRACE', messageId: msg.id });
              }}
            />
          );
        })()}

        {msg.uiBlocks && msg.uiBlocks.length > 0 && (
           <div className="flex flex-col gap-4 py-2">
              {msg.uiBlocks.map((block, idx) => {
                const isFormBlocked = block.type === 'form' && submittedForms.has(block.id || block.title || 'unknown');
                return (
                  <SafeBlockRenderer 
                    key={`${msg.id}-block-${idx}`} 
                    block={block} 
                    onAction={handleInteraction}
                    disabled={isFormBlocked}
                  />
                );
              })}
           </div>
        )}
      </div>
    </div>
  );
});
MessageItem.displayName = 'MessageItem';


// --- Ambient Background Component ---
const AmbientBackground = React.memo(() => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Base Background */}
      <div className="absolute inset-0 bg-[#020204]" />
      
      {/* Subtle Grid Pattern with Radial Mask */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      {/* Aurora Orbs - Dynamic Theme Colors */}
      {/* Top Left - Primary */}
      <div className="absolute -top-[10%] -left-[10%] w-[40rem] h-[40rem] bg-primary-500/10 rounded-full mix-blend-screen blur-[100px] animate-blob-1 opacity-40" />
      
      {/* Top Right - Secondary */}
      <div className="absolute top-[0%] -right-[10%] w-[35rem] h-[35rem] bg-secondary-500/10 rounded-full mix-blend-screen blur-[90px] animate-blob-2 opacity-30" />
      
      {/* Bottom Center - Primary subtle */}
      <div className="absolute -bottom-[20%] left-[20%] w-[45rem] h-[45rem] bg-primary-600/5 rounded-full mix-blend-screen blur-[110px] animate-blob-3 opacity-30" />

      {/* Vignette for Focus */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,4,0.4)_100%)]" />
    </div>
  );
});
AmbientBackground.displayName = 'AmbientBackground';

export const ChatArea: React.FC<ChatAreaProps> = React.memo(({ 
  messages, 
  onSendMessage, 
  onStopGeneration, 
  isThinking, 
  isStreaming, 
  isLoadingMessages, 
  isMessageAnimating, 
  agentProgress, 
  onRecoverMessage,
  sessions,
  activeSessionId: propsActiveSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenArtifactLibrary,
  getTraceForMessage,
  currentToolParts,
  toolPartsByMessageId
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const thinkingStartRef = useRef<number | null>(null);
  
  const { language } = useLanguageStore();
  const t = translations[language].chat;
  const [userAvatar, setUserAvatar] = useState('');

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [submittedForms, setSubmittedForms] = useState<Set<string>>(new Set());
  
  // Engagement tracking
  usePageTracking('chat');
  const trackAction = useActionTracking('chat');
  
  // Observability state (only for role_id = 1)
  const userContext = useContactStore(state => state.userContext);
  const isDeveloper = userContext?.roleId === 1;
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);
  
  // Track elapsed time when thinking
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isThinking) {
      thinkingStartRef.current = Date.now();
      setElapsedTime(0);
      interval = setInterval(() => {
        if (thinkingStartRef.current) {
          setElapsedTime(Math.floor((Date.now() - thinkingStartRef.current) / 1000));
        }
      }, 1000);
    } else {
      thinkingStartRef.current = null;
      setElapsedTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isThinking]);
  
  // PERFORMANCE: Atomic selectors to prevent unnecessary re-renders of the entire list
  const activeSessionId = useChatStore(selectActiveSessionId);
  const activeSessionMessages = useChatStore(selectActiveSessionMessages);
  const isSidebarCollapsed = useChatStore(selectIsSidebarCollapsed);
  
  // Actions (stable references)
  const updateMessageFeedback = useChatStore(state => state.updateMessageFeedback);
  const deleteMessage = useChatStore(state => state.deleteMessage);
  const setSessionStatus = useChatStore(state => state.setSessionStatus);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldAutoScroll(isAtBottom);
    }
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, []);

  // Load dynamic avatar from Sidebar (same avatar for consistency within this page load)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Wait a bit for Sidebar to set the global avatar URL
    const checkAvatar = () => {
      const globalAvatar = (window as any).__urpeAvatarUrl;
      if (globalAvatar) {
        setUserAvatar(globalAvatar);
      } else {
        // Fallback: generate one if Sidebar hasn't loaded yet
        const seed = Math.random().toString(36).substring(2, 10);
        const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=transparent&size=64`;
        setUserAvatar(avatarUrl);
      }
    };
    
    // Check immediately and after a short delay
    checkAvatar();
    const timeout = setTimeout(checkAvatar, 100);
    
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isThinking) {
      setShouldAutoScroll(true);
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 100);
    }
  }, [isThinking]);

  useEffect(() => {
    if ((isStreaming || isThinking) && shouldAutoScroll) {
      scrollToBottom('smooth');
    }
  }, [messages, isThinking, isStreaming, shouldAutoScroll]);

  const handleInteraction = (data: any) => {
     // Manejar acción de recuperación especialmente
     if (data.type === 'BLOCK_ACTION' && data.payload?.action === 'RECOVER_MESSAGE') {
       logger.debug('[ChatArea] Ejecutando recuperación de mensaje...');
       if (onRecoverMessage) {
         onRecoverMessage();
       }
       return; // No enviar como mensaje
     }
     
     // Track form submissions for blocking
     if (data.type === 'FORM_SUBMISSION') {
       const formId = data.formId || 'unknown';
       setSubmittedForms(prev => new Set(prev).add(formId));
       trackAction('chat.form_submit', { formId, values: data.values });
     } else if (data.type === 'BLOCK_ACTION') {
       trackAction('chat.block_action', { action: data.payload?.action || data.actionId });
     }
     
     let payloadToSerialize = data;
     if (data.type === 'FORM_SUBMISSION') payloadToSerialize = data.values;
     else if (data.type === 'BLOCK_ACTION') payloadToSerialize = data.payload || { actionId: data.actionId };
     
     onSendMessage(`[INTERACTION: ${data.type || 'ACTION'}] ${JSON.stringify(payloadToSerialize)}`);
  };

  const handleFeedback = useCallback((messageId: string, feedback: FeedbackType) => {
    if (activeSessionId) {
      updateMessageFeedback(activeSessionId, messageId, feedback);
      trackAction('chat.feedback', { messageId, feedback });
    }
  }, [activeSessionId, updateMessageFeedback, trackAction]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    if (activeSessionId) {
      deleteMessage(activeSessionId, messageId);
    }
  }, [activeSessionId, deleteMessage]);

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden bg-[#020204]">
      
      {/* Ambient Background System */}
      <AmbientBackground />
      
      {/* New Integrated Header */}
      <ChatHeader 
        onNewChat={onNewChat}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenArtifactLibrary={onOpenArtifactLibrary}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        activeSessionId={propsActiveSessionId}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
      />

      {/* Messages List */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative z-10 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent no-overscroll pt-10 pb-0"
      >
        <div className="max-w-4xl lg:max-w-5xl mx-auto px-3 md:px-6 py-6 space-y-6 md:space-y-8 min-h-full">
          
          {messages.length === 0 && !isLoadingMessages && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-fade-in-up px-4">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-primary-400 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                
                <div className="w-16 h-16 md:w-20 md:h-20 mb-6 rounded-full bg-black/50 border border-white/10 flex items-center justify-center relative z-10 shadow-xl backdrop-blur-md overflow-hidden">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img 
                      src="https://vecspltvmyopwbjzerow.supabase.co/storage/v1/object/public/chat-uploads/imag_confi/mzdwsitj_IMG_6812.webp" 
                      alt="Monica Star" 
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" 
                    />
                </div>
              </div>
              <h2 className="text-xl md:text-3xl font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-zinc-100 to-zinc-500 mb-3">{t.empty_title}</h2>
              <p className="text-zinc-500 max-w-md mb-8 leading-relaxed text-sm">
                {t.empty_desc}
              </p>
            </div>
          )}

          {/* Loading indicator when switching sessions */}
          {messages.length === 0 && isLoadingMessages && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-fade-in-up px-4">
              <div className="w-12 h-12 border-4 border-zinc-800 border-t-primary-500 rounded-full animate-spin mb-4"></div>
              <p className="text-zinc-500 text-sm font-medium">Cargando conversación...</p>
            </div>
          )}

          {(activeSessionMessages as Message[]).map((msg, index) => {
            if (msg.role === 'user' && msg.content.startsWith('[INTERACTION:')) return <InteractionReceipt key={msg.id} content={msg.content} />;

            const toolPartsForMessage = msg.role === 'assistant'
              ? toolPartsByMessageId?.[msg.id]
              : undefined;

            if (
              isThinking &&
              msg.role === 'assistant' &&
              index === activeSessionMessages.length - 1 &&
              !msg.content.trim() &&
              (!toolPartsForMessage || toolPartsForMessage.length === 0)
            ) {
              return null;
            }

            // Animación escalonada para mensajes nuevos
            const isNewMessage = index >= activeSessionMessages.length - 2;
            const animationDelay = isNewMessage ? (index % 2) * 100 : 0;
            
            // Check if previous message is from same role to group them
            const isSequence = index > 0 && activeSessionMessages[index - 1].role === msg.role;
            const isLastAssistantMessage = msg.role === 'assistant' && index === activeSessionMessages.length - 1;

            return (
              <MessageItem
                key={msg.id}
                msg={msg}
                index={index}
                isSequence={isSequence}
                isNewMessage={isNewMessage}
                animationDelay={animationDelay}
                userAvatar={userAvatar}
                isDeveloper={isDeveloper}
                getTraceForMessage={getTraceForMessage}
                handleFeedback={handleFeedback}
                handleDeleteMessage={handleDeleteMessage}
                handleInteraction={(data) => {
                  if (data.type === 'VIEW_TRACE') {
                    setSelectedTraceId(data.messageId);
                    setIsTraceModalOpen(true);
                  } else {
                    handleInteraction(data);
                  }
                }}
                isMessageAnimating={isMessageAnimating}
                isThinking={isThinking}
                isStreaming={isStreaming && isLastAssistantMessage}
                submittedForms={submittedForms}
                toolParts={toolPartsForMessage}
              />
            );
          })}

          {isThinking && (
            <DynamicThinking 
              status={
                !agentProgress?.status || agentProgress.status === 'idle' || agentProgress.status === 'error'
                  ? 'thinking'
                  : agentProgress.status as 'connecting' | 'thinking' | 'processing' | 'streaming'
              }
              stepCount={agentProgress?.stepCount || 0}
              elapsedTime={elapsedTime}
            />
          )}
          
          <div className="h-32 md:h-32"></div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#020204] via-[#020204]/80 to-transparent pointer-events-none"></div>
          
          <div className="pointer-events-auto pb-[calc(env(safe-area-inset-bottom)+64px)] md:pb-[env(safe-area-inset-bottom)]">
              <InputArea 
                  onSendMessage={onSendMessage} 
                  onStop={onStopGeneration}
                  isThinking={isThinking} 
                  isStreaming={isStreaming} 
                />
           </div>
      </div>

      {/* Trace Detail Modal - only for developers (role_id = 1) */}
      {isDeveloper && getTraceForMessage && (
        <TraceDetailModal
          trace={selectedTraceId ? getTraceForMessage(selectedTraceId) : null}
          isOpen={isTraceModalOpen}
          onClose={() => {
            setIsTraceModalOpen(false);
            setSelectedTraceId(null);
          }}
        />
      )}

      </div>
  );
});
ChatArea.displayName = 'ChatArea';
