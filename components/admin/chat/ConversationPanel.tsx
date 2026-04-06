import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Download,
  FileText,
  Loader2,
  Lock,
  Play,
  Send,
  User,
  X,
} from 'lucide-react';
import { ConversationMessage } from '../../../types/contact';
import { InboxContactSnapshot } from '../../../types/chat-inbox';
import { useDraftStorage } from '../../../hooks/useDraftStorage';
import { MessageContentRenderer } from '../../MessageContentRenderer';

interface PendingHITLBanner {
  mensaje: string;
  fecha_envio?: string | null;
}

interface ConversationThreadProps {
  conversationId: number;
  messages: ConversationMessage[];
  isLoading: boolean;
  hasMoreMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
}

interface ConversationComposerProps {
  conversationId: number;
  contact: InboxContactSnapshot | null;
  onSendMessage: (content: string) => Promise<boolean>;
  isObservationMode?: boolean;
  pendingHITL?: PendingHITLBanner | null;
  onPendingHITLResolved?: () => void;
}

interface ConversationPanelProps {
  conversationId: number;
  messages: ConversationMessage[];
  isLoading: boolean;
  onBack: () => void;
  showBackButton?: boolean;
  contact?: InboxContactSnapshot | null;
  onSendMessage?: (content: string) => Promise<boolean>;
  isObservationMode?: boolean;
  pendingHITL?: PendingHITLBanner | null;
  onPendingHITLResolved?: () => void;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  hasMoreMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
}

const MultimediaContent: React.FC<{
  tipo: ConversationMessage['tipo'];
  url: string | null | undefined;
  textContent?: string;
}> = ({ tipo, url, textContent }) => {
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!url || tipo === 'texto' || tipo === 'plantilla') {
    return null;
  }

  const renderPreviewModal = () => {
    if (!previewOpen || typeof document === 'undefined') return null;

    return createPortal(
      <div
        className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
        onClick={() => setPreviewOpen(false)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPreviewOpen(false);
          }}
          className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50"
        >
          <X className="w-6 h-6" />
        </button>
        <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full">
          {tipo === 'imagen' && (
            <img src={url} alt="Vista previa" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          )}
          {tipo === 'video' && (
            <video src={url} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
          )}
        </div>
      </div>,
      document.body
    );
  };

  if (tipo === 'imagen') {
    return (
      <div className="space-y-2">
        <div
          className="relative cursor-pointer group max-w-[200px] rounded-lg overflow-hidden"
          onClick={() => setPreviewOpen(true)}
        >
          <img src={url} alt="Imagen" className="w-full h-auto rounded-lg hover:opacity-90 transition-opacity" loading="lazy" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium">Ver</span>
          </div>
        </div>
        {textContent && <p className="text-xs text-zinc-400 mt-1">{textContent}</p>}
        {renderPreviewModal()}
      </div>
    );
  }

  if (tipo === 'video') {
    return (
      <div className="space-y-2">
        <div
          className="relative cursor-pointer group max-w-[240px] rounded-lg overflow-hidden bg-zinc-900"
          onClick={() => setPreviewOpen(true)}
        >
          <div className="aspect-video flex items-center justify-center">
            <div className="p-3 bg-white/20 rounded-full group-hover:bg-white/30 transition-colors">
              <Play className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white">Video</div>
        </div>
        {textContent && <p className="text-xs text-zinc-400 mt-1">{textContent}</p>}
        {renderPreviewModal()}
      </div>
    );
  }

  if (tipo === 'audio') {
    return (
      <div className="space-y-2">
        <audio src={url} controls className="max-w-full h-10" style={{ minWidth: '200px' }} />
        {textContent && <p className="text-xs text-zinc-400 mt-1">{textContent}</p>}
      </div>
    );
  }

  if (tipo === 'documento' || tipo === 'archivo') {
    const fileName = url.split('/').pop()?.split('?')[0] || 'Documento';
    return (
      <div className="flex items-center gap-2 p-2 bg-zinc-900/50 rounded-lg border border-white/5">
        <div className="p-2 bg-zinc-800 rounded">
          <FileText className="w-4 h-4 text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-300 truncate">{fileName}</p>
          {textContent && <p className="text-[10px] text-zinc-500 truncate">{textContent}</p>}
        </div>
        <div className="flex items-center gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-zinc-800 rounded transition-colors" title="Abrir">
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>
          <a href={url} download className="p-1.5 hover:bg-zinc-800 rounded transition-colors" title="Descargar">
            <Download className="w-3.5 h-3.5 text-zinc-400" />
          </a>
        </div>
      </div>
    );
  }

  return null;
};

const extractPdfUrl = (content: string | null | undefined): string | null => {
  if (!content) return null;
  const match = content.match(/https?:\/\/[^\s)]+?\.pdf(?:\?[^\s)]*)?/i);
  if (!match) return null;
  return match[0].replace(/[),.]+$/, '');
};

const removeUrlFromText = (content: string, url: string): string => {
  return content.replace(url, '').replace(/\s{2,}/g, ' ').trim();
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

const getMessageStatusIcon = (status?: string) => {
  switch (status) {
    case 'enviado':
      return <Check className="w-3 h-3 text-zinc-500" />;
    case 'entregado':
      return <CheckCheck className="w-3 h-3 text-zinc-500" />;
    case 'leido':
      return <CheckCheck className="w-3 h-3 text-blue-400" />;
    case 'fallido':
      return <AlertCircle className="w-3 h-3 text-red-400" />;
    default:
      return <Clock className="w-3 h-3 text-zinc-600" />;
  }
};

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Hoy';
  if (isYesterday) return 'Ayer';

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
};

const getDateKey = (dateStr: string) => new Date(dateStr).toDateString();

const getMessageContent = (msg: ConversationMessage): string => {
  const content = msg.cuerpo || msg.mensaje || msg.contenido || msg.content || msg.text || msg.texto || msg.payload || msg.body;

  if (!content) return '(Sin contenido)';

  if (typeof content === 'string') {
    if (content.startsWith('{') || content.startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        return typeof parsed === 'string' ? parsed : parsed.text || parsed.content || parsed.message || JSON.stringify(parsed);
      } catch {
        return content;
      }
    }
    return content;
  }

  if (typeof content === 'object') {
    return content.text || content.content || content.message || JSON.stringify(content);
  }

  return String(content);
};

export const ConversationThread: React.FC<ConversationThreadProps> = React.memo(({
  conversationId,
  messages,
  isLoading,
  hasMoreMessages = false,
  isLoadingOlderMessages = false,
  onLoadOlderMessages,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderSentinelRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);

  // Auto-scroll to bottom on initial load or when new messages arrive at the end
  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;

    const el = scrollRef.current;
    const prevCount = prevMessageCountRef.current;

    // Scroll to bottom when:
    // - First load (prevCount === 0)
    // - New messages added at the end (count increased and not from loading older)
    if (prevCount === 0 || messages.length > prevCount) {
      // Only auto-scroll if user is near the bottom or it's the first load
      const isNearBottom = prevCount === 0 || (el.scrollHeight - el.scrollTop - el.clientHeight < 150);
      if (isNearBottom) {
        const scrollToBottom = () => { el.scrollTop = el.scrollHeight; };
        scrollToBottom();
        const rafId = requestAnimationFrame(scrollToBottom);
        prevMessageCountRef.current = messages.length;
        return () => cancelAnimationFrame(rafId);
      }
    }

    prevMessageCountRef.current = messages.length;
  }, [messages]);

  // Restore scroll position after prepending older messages
  useEffect(() => {
    if (!scrollRef.current || !isLoadingOlderMessages) return;
    // Capture scroll height before older messages are prepended
    prevScrollHeightRef.current = scrollRef.current.scrollHeight;
  }, [isLoadingOlderMessages]);

  useEffect(() => {
    if (!scrollRef.current || isLoadingOlderMessages || prevScrollHeightRef.current === 0) return;
    const el = scrollRef.current;
    const newScrollHeight = el.scrollHeight;
    const addedHeight = newScrollHeight - prevScrollHeightRef.current;
    if (addedHeight > 0) {
      el.scrollTop = addedHeight;
    }
    prevScrollHeightRef.current = 0;
  }, [messages, isLoadingOlderMessages]);

  // IntersectionObserver for loading older messages when scrolling up
  useEffect(() => {
    const sentinel = olderSentinelRef.current;
    if (!sentinel || !onLoadOlderMessages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && !isLoadingOlderMessages && !isLoading) {
          onLoadOlderMessages();
        }
      },
      { root: scrollRef.current, rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMessages, isLoadingOlderMessages, isLoading, onLoadOlderMessages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 md:space-y-4 pr-1 md:pr-2 min-h-0">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3 animate-in fade-in duration-300">
          <div className="w-5 h-5 border-2 border-white/10 border-t-emerald-500/60 rounded-full animate-spin" />
          <span className="text-[11px] text-zinc-600">Cargando mensajes...</span>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-zinc-600">
          <span className="text-sm">No hay mensajes en esta conversación</span>
          <span className="text-[10px] text-zinc-700 mt-1">ID: {conversationId}</span>
        </div>
      ) : (
        <>
        {/* Sentinel for loading older messages */}
        <div ref={olderSentinelRef} className="shrink-0">
          {isLoadingOlderMessages && (
            <div className="flex items-center justify-center py-3 text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-[11px]">Cargando mensajes anteriores...</span>
            </div>
          )}
        </div>
        {messages.map((msg, index) => {
          const isAgent = ['agente', 'asistente', 'sistema', 'assistant', 'model', 'humano'].includes(msg.remitente);
          const showAvatar = index === 0 || messages[index - 1].remitente !== msg.remitente;
          const messageContent = getMessageContent(msg);
          const pdfUrl = !msg.url_archivo ? extractPdfUrl(messageContent) : null;
          const derivedUrl = msg.url_archivo || pdfUrl || null;
          const derivedTipo = msg.url_archivo ? msg.tipo : pdfUrl ? 'documento' : msg.tipo;
          const cleanedContent = pdfUrl ? removeUrlFromText(messageContent, pdfUrl) : messageContent;
          const cleanedText = cleanedContent && cleanedContent !== '(Sin contenido)' ? cleanedContent : undefined;
          const currentDateKey = getDateKey(msg.created_at);
          const prevDateKey = index > 0 ? getDateKey(messages[index - 1].created_at) : null;
          const showDateSeparator = index === 0 || currentDateKey !== prevDateKey;

          return (
            <React.Fragment key={msg.id}>
              {showDateSeparator && (
                <div className="flex items-center gap-3 my-3 md:my-4">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] md:text-xs text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded-full border border-white/5">
                    {formatDate(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}
              <div className={`perf-message-bubble flex gap-3 ${isAgent ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs ${
                    !showAvatar ? 'opacity-0' : ''
                  } ${
                    isAgent
                      ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                      : 'bg-zinc-800 text-zinc-400 border border-white/5'
                  }`}
                >
                  {isAgent ? <Bot className="w-3 h-3 md:w-4 md:h-4" /> : <User className="w-3 h-3 md:w-4 md:h-4" />}
                </div>

                <div className={`flex flex-col max-w-[90%] md:max-w-[85%] ${isAgent ? 'items-end' : 'items-start'}`}>
                  {showAvatar && (
                    <span className="text-[10px] text-zinc-500 mb-1 ml-1 capitalize">
                      {isAgent ? (msg.remitente === 'sistema' ? 'Sistema' : msg.remitente === 'humano' ? 'Asesor' : 'Agente') : 'Cliente'}
                    </span>
                  )}

                  <div
                    className={`rounded-xl md:rounded-2xl px-3 md:px-4 py-2 text-xs md:text-sm w-full ${
                      isAgent
                        ? 'bg-primary-500/10 text-zinc-200 border border-primary-500/10 rounded-tr-sm'
                        : 'bg-zinc-800 text-zinc-200 border border-white/5 rounded-tl-sm'
                    }`}
                  >
                    <MultimediaContent tipo={derivedTipo} url={derivedUrl} textContent={cleanedText} />

                    {(!derivedUrl || derivedTipo === 'texto' || derivedTipo === 'plantilla') && cleanedText && (
                      <MessageContentRenderer content={cleanedText} isDashboard={false} />
                    )}

                    <div className={`flex items-center gap-1 mt-1 text-[10px] ${isAgent ? 'justify-end text-primary-400/60' : 'text-zinc-500'}`}>
                      <span>{formatTime(msg.created_at)}</span>
                      {isAgent && getMessageStatusIcon(msg.estado)}
                    </div>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        </>
      )}
    </div>
  );
});
ConversationThread.displayName = 'ConversationThread';

export const ConversationComposer: React.FC<ConversationComposerProps> = React.memo(({
  conversationId,
  contact,
  onSendMessage,
  isObservationMode = false,
  pendingHITL,
  onPendingHITLResolved,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messageText, setMessageText, clearMessageDraft] = useDraftStorage('message_reply', `conv_${conversationId}`, '');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const windowStatus = useMemo(() => {
    const isWhatsapp = contact?.origen?.toLowerCase() === 'whatsapp';
    const within24h = isWithin24Hours(contact?.ultima_interaccion) && isWhatsapp;
    const timeRemaining = isWhatsapp ? getTimeRemaining(contact?.ultima_interaccion) : '';
    const lastInteraction = formatLastInteraction(contact?.ultima_interaccion);

    return { within24h, timeRemaining, lastInteraction, isWhatsapp };
  }, [contact?.origen, contact?.ultima_interaccion]);

  const handleSend = async () => {
    if (!messageText.trim() || isSending || !windowStatus.within24h) return;

    if (!contact?.id) {
      setSendError('No se pudo identificar el contacto');
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      const success = await onSendMessage(messageText.trim());
      if (success) {
        clearMessageDraft();
        onPendingHITLResolved?.();
        if (inputRef.current) {
          inputRef.current.style.height = '40px';
        }
      } else {
        setSendError('Error al enviar el mensaje');
      }
    } catch {
      setSendError('Error de conexión');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="shrink-0 mt-3 pt-3 border-t border-white/5">
      {pendingHITL && (
        <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-amber-400">Intervención Requerida</span>
                <span className="text-[10px] text-zinc-500">
                  {pendingHITL.fecha_envio
                    ? new Date(pendingHITL.fecha_envio).toLocaleString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: 'numeric',
                        month: 'short',
                      })
                    : ''}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{pendingHITL.mensaje}</p>
              <p className="text-[10px] text-amber-400/70 mt-1.5">💬 Responde desde el input de abajo para resolver esta intervención</p>
            </div>
          </div>
        </div>
      )}

      {isObservationMode && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-cyan-400 font-medium">Empresa Externa</p>
            <p className="text-[10px] text-cyan-400/70">Los mensajes se enviarán a esta empresa.</p>
          </div>
        </div>
      )}

      {windowStatus.within24h ? (
        <div className="flex items-center gap-2 mb-2 text-[10px] text-emerald-400">
          <Clock className="w-3 h-3" />
          <span>Ventana de 24h activa • {windowStatus.timeRemaining}</span>
        </div>
      ) : !windowStatus.isWhatsapp ? (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400 font-medium">Origen no compatible</p>
            <p className="text-[10px] text-amber-400/70">El chat directo solo está disponible para contactos de WhatsApp actualmente.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400 font-medium">Fuera de la ventana de 24 horas</p>
            <p className="text-[10px] text-amber-400/70">Última interacción: {windowStatus.lastInteraction}. No se pueden enviar mensajes.</p>
          </div>
        </div>
      )}

      {sendError && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span className="text-xs text-rose-400">{sendError}</span>
        </div>
      )}

      <div className={`flex items-end gap-2 ${!windowStatus.within24h ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={windowStatus.within24h ? 'Escribe un mensaje...' : windowStatus.isWhatsapp ? 'Chat bloqueado' : 'Solo WhatsApp disponible'}
            disabled={!windowStatus.within24h || isSending}
            rows={1}
            className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed max-h-24 overflow-y-auto"
            style={{ minHeight: '40px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = '40px';
              target.style.height = `${Math.min(target.scrollHeight, 96)}px`;
            }}
          />
        </div>
        <button
          onClick={() => void handleSend()}
          disabled={!messageText.trim() || isSending || !windowStatus.within24h}
          className="shrink-0 p-2.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
          title={windowStatus.within24h ? 'Enviar mensaje' : 'Chat bloqueado'}
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {windowStatus.within24h && <p className="mt-1.5 text-[10px] text-zinc-500">Presiona Enter para enviar • Shift+Enter para nueva línea</p>}
    </div>
  );
});
ConversationComposer.displayName = 'ConversationComposer';

export const ConversationPanel: React.FC<ConversationPanelProps> = React.memo(({
  conversationId,
  messages,
  isLoading,
  onBack,
  showBackButton = true,
  contact = null,
  onSendMessage,
  isObservationMode = false,
  pendingHITL = null,
  onPendingHITLResolved,
  title = 'Detalle de Conversación',
  subtitle,
  headerActions,
  hasMoreMessages,
  isLoadingOlderMessages,
  onLoadOlderMessages,
}) => {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-3 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-white/5">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {showBackButton && (
            <button onClick={onBack} className="p-1 md:p-1.5 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-colors active:scale-95">
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h3 className="text-xs md:text-sm font-medium text-zinc-200 truncate">{title}</h3>
            <span className="text-[10px] md:text-xs text-zinc-500 truncate block">{subtitle || `ID: ${conversationId}`}</span>
          </div>
        </div>
        {headerActions && <div className="shrink-0">{headerActions}</div>}
      </div>

      <ConversationThread
        conversationId={conversationId}
        messages={messages}
        isLoading={isLoading}
        hasMoreMessages={hasMoreMessages}
        isLoadingOlderMessages={isLoadingOlderMessages}
        onLoadOlderMessages={onLoadOlderMessages}
      />

      {onSendMessage && (
        <ConversationComposer
          conversationId={conversationId}
          contact={contact}
          onSendMessage={onSendMessage}
          isObservationMode={isObservationMode}
          pendingHITL={pendingHITL}
          onPendingHITLResolved={onPendingHITLResolved}
        />
      )}
    </div>
  );
});
ConversationPanel.displayName = 'ConversationPanel';

export default ConversationPanel;
