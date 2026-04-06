import React, { useEffect, useMemo } from 'react';
import { useContactStore, selectActiveConversationMessages, selectIsLoadingMessages, selectActiveContact, selectIsObservationMode } from '../../../store/contactStore';
import { useNotificationsStore, selectPendingHITLForContact } from '../../../store/notificationsStore';
import { ConversationPanel } from '../chat/ConversationPanel';

interface ConversationMessagesProps {
  conversationId: number;
  onBack: () => void;
  showBackButton?: boolean;
  contactId?: number;
}

export const ConversationMessages: React.FC<ConversationMessagesProps> = ({ conversationId, onBack, showBackButton = true, contactId }) => {
  const messages = useContactStore(selectActiveConversationMessages);
  const isLoading = useContactStore(selectIsLoadingMessages);
  const activeContact = useContactStore(selectActiveContact);
  const fetchMessages = useContactStore(state => state.fetchConversationMessages);
  const clearMessages = useContactStore(state => state.clearConversationMessages);
  const sendDirectMessage = useContactStore(state => state.sendDirectMessage);
  const isObservationMode = useContactStore(selectIsObservationMode);
  
  // HITL: Get pending notification for this contact
  const resolvedContactId = contactId || activeContact?.id || null;
  const pendingHITL = useNotificationsStore(selectPendingHITLForContact(resolvedContactId));
  const markHITLResponded = useNotificationsStore(state => state.markHITLRespondedByContact);
  
  useEffect(() => {
    fetchMessages(conversationId);
    return () => clearMessages();
  }, [conversationId, fetchMessages, clearMessages]);
  const contactSnapshot = useMemo(() => {
    if (!resolvedContactId) return null;

    if (activeContact?.id === resolvedContactId) {
      return {
        id: resolvedContactId,
        nombre: activeContact.nombre,
        apellido: activeContact.apellido,
        telefono: activeContact.telefono,
        origen: activeContact.origen,
        ultima_interaccion: activeContact.ultima_interaccion,
      };
    }

    return {
      id: resolvedContactId,
      nombre: null,
      apellido: null,
      telefono: null,
      origen: null,
      ultima_interaccion: null,
    };
  }, [activeContact, resolvedContactId]);

  const handleSendMessage = async (content: string) => {
    if (!resolvedContactId) return false;
    const success = await sendDirectMessage(conversationId, resolvedContactId, content);
    if (success && pendingHITL && resolvedContactId) {
      await markHITLResponded(resolvedContactId);
    }
    return success;
  };

  return (
    <ConversationPanel
      conversationId={conversationId}
      messages={messages}
      isLoading={isLoading}
      onBack={onBack}
      showBackButton={showBackButton}
      contact={contactSnapshot}
      onSendMessage={handleSendMessage}
      isObservationMode={isObservationMode}
      pendingHITL={pendingHITL ? { mensaje: pendingHITL.mensaje, fecha_envio: pendingHITL.fecha_envio } : null}
    />
  );
};
