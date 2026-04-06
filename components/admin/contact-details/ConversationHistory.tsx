import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, User, Phone, Globe, ChevronRight } from 'lucide-react';
import { Conversation } from '../../../types/contact';
import { ConversationMessages } from './ConversationMessages';

 const getChannelLabel = (channel: string) => {
   if (channel === 'whatsapp') return 'WhatsApp';
   if (channel === 'web') return 'Chat Web';
   return 'Conversación';
 };

 const getChannelFallbackTitle = (channel: string) => {
   if (channel === 'whatsapp') return 'Línea de WhatsApp';
   if (channel === 'web') return 'Canal web';
   return 'Conversación';
 };

 const normalizeMetadataValue = (value: unknown): string | null => {
   if (typeof value !== 'string') return null;
   const trimmed = value.trim();
   if (!trimmed || trimmed === '[object Object]') return null;
   return trimmed;
 };

 const formatPhoneValue = (value: string | null): string | null => {
   if (!value) return null;
   const trimmed = value.trim();
   const sanitized = trimmed.replace(/[^\d+]/g, '');
   if (sanitized.length < 7) return trimmed;
   return sanitized;
 };

 const extractConversationReceiverInfo = (conversation: Conversation) => {
   const metadata = conversation.metadata && typeof conversation.metadata === 'object'
     ? conversation.metadata as Record<string, any>
     : null;

   const nameCandidates = [
     metadata?.receiver_name,
     metadata?.receiverName,
     metadata?.number_name,
     metadata?.numberName,
     metadata?.line_name,
     metadata?.lineName,
     metadata?.phone_name,
     metadata?.phoneName,
     metadata?.numero_nombre,
     metadata?.nombre_numero,
     metadata?.display_name,
     metadata?.displayName,
     metadata?.number?.nombre,
     metadata?.number?.name,
     metadata?.line?.nombre,
     metadata?.line?.name,
     metadata?.phone?.nombre,
     metadata?.phone?.name,
     metadata?.receiver?.name,
     metadata?.recipient?.name,
   ];

   const phoneCandidates = [
     metadata?.receiver_phone,
     metadata?.receiverPhone,
     metadata?.phone_number,
     metadata?.phoneNumber,
     metadata?.phone,
     metadata?.telefono,
     metadata?.telefono_receptor,
     metadata?.numero,
     metadata?.numero_receptor,
     metadata?.whatsapp_number,
     metadata?.number?.telefono,
     metadata?.number?.phone,
     metadata?.line?.telefono,
     metadata?.line?.phone,
     metadata?.phone?.telefono,
     metadata?.receiver?.phone,
     metadata?.recipient?.phone,
     metadata?.to,
     metadata?.from,
   ];

   const receiverName = nameCandidates
     .map(normalizeMetadataValue)
     .find(Boolean) ?? null;

   const receiverPhone = formatPhoneValue(
     phoneCandidates
       .map(normalizeMetadataValue)
       .find(Boolean) ?? null
   );

   return { receiverName, receiverPhone };
 };

 const getConversationDisplay = (conversation: Conversation) => {
   const channelLabel = getChannelLabel(conversation.canal);
   const fallbackTitle = getChannelFallbackTitle(conversation.canal);
   const { receiverName, receiverPhone } = extractConversationReceiverInfo(conversation);

   const title = receiverName || receiverPhone || fallbackTitle;
   const subtitle = receiverName && receiverPhone
     ? `${channelLabel} · ${receiverPhone}`
     : receiverPhone
       ? `${channelLabel} · ID: ${conversation.id}`
       : `${channelLabel} · Conversación #${conversation.id}`;

   return { title, subtitle };
 };

interface ConversationHistoryProps {
  conversations: Conversation[];
  initialConversationId?: number | null;
  onInitialConversationHandled?: () => void;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({ conversations, initialConversationId, onInitialConversationHandled }) => {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  useEffect(() => {
    if (!initialConversationId) return;

    setSelectedConversationId(initialConversationId);
    onInitialConversationHandled?.();
  }, [initialConversationId, onInitialConversationHandled]);

  // Auto-select single conversation
  useEffect(() => {
    if (conversations.length === 1 && !selectedConversationId) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  if (selectedConversationId) {
    return (
      <ConversationMessages 
        conversationId={selectedConversationId} 
        onBack={() => setSelectedConversationId(null)} 
        showBackButton={conversations.length > 1}
      />
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 md:py-12 text-zinc-500">
        <MessageSquare className="w-10 h-10 md:w-12 md:h-12 mb-2 md:mb-3 opacity-20" />
        <span className="text-xs md:text-sm">No hay conversaciones registradas</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 md:space-y-3">
      {conversations.map((conv) => {
        const display = getConversationDisplay(conv);

        return (
          <div 
            key={conv.id}
            onClick={() => setSelectedConversationId(conv.id)}
            className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 md:p-4 hover:border-white/10 hover:bg-white/[0.02] transition-colors cursor-pointer group active:scale-[0.99]"
          >
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`p-1 md:p-1.5 rounded-md shrink-0 ${
                conv.canal === 'whatsapp' ? 'bg-green-500/10 text-green-400' :
                conv.canal === 'web' ? 'bg-blue-500/10 text-blue-400' :
                'bg-zinc-800 text-zinc-400'
              }`}>
                {conv.canal === 'whatsapp' ? <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" /> : 
                 conv.canal === 'web' ? <Globe className="w-3.5 h-3.5 md:w-4 md:h-4" /> :
                 <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              </span>
              <div className="min-w-0">
                <h4 className="text-xs md:text-sm font-medium text-zinc-200 group-hover:text-primary-400 transition-colors truncate">
                  {display.title}
                </h4>
                <span className="text-[10px] md:text-xs text-zinc-500">
                  {display.subtitle}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-1 text-[10px] md:text-xs text-zinc-500">
                <Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span>
                  {new Date(conv.fecha_inicio).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
            </div>
          </div>

          {/* Mobile date */}
          <div className="sm:hidden flex items-center gap-1 text-[10px] text-zinc-500 mb-2">
            <Calendar className="w-3 h-3" />
            <span>
              {new Date(conv.fecha_inicio).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>

          {conv.resumen && (
            <div className="text-xs md:text-sm text-zinc-400 bg-zinc-900 rounded p-2 md:p-3 border border-white/5 group-hover:border-white/10 transition-colors">
              <p className="line-clamp-2 md:line-clamp-3">{conv.resumen}</p>
            </div>
          )}

          <div className="mt-2 md:mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {conv.estado && (
                <span className={`text-[9px] md:text-[10px] px-1.5 py-0.5 rounded border ${
                  conv.estado === 'abierto' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                  conv.estado === 'cerrado' ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {conv.estado.toUpperCase()}
                </span>
              )}
            </div>
            
            {conv.agente_id && (
              <div className="flex items-center gap-1 text-[10px] md:text-xs text-zinc-500">
                <User className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span>Agente #{conv.agente_id}</span>
              </div>
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
};
