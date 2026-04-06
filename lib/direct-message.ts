import { supabase } from './supabase-client';
import { logger } from './logger';

export interface DirectMessageUserContext {
  id?: number | null;
  nombre?: string | null;
  apellido?: string | null;
}

export interface DirectMessageContactContext {
  telefono?: string | null;
  [key: string]: unknown;
}

export interface SendDirectMessageInput {
  conversationId: number;
  contactId: number;
  content: string;
  enterpriseId: number | null;
  userContext?: DirectMessageUserContext | null;
  contact?: DirectMessageContactContext | null;
  originNotificationId?: number | null;
}

export interface SendDirectMessageResult {
  success: boolean;
  data?: any;
  metadata?: Record<string, unknown>;
  error?: string;
}

export async function sendDirectMessageRecord({
  conversationId,
  contactId,
  content,
  enterpriseId,
  userContext,
  contact,
  originNotificationId,
}: SendDirectMessageInput): Promise<SendDirectMessageResult> {
  const trimmedContent = content.trim();

  if (!enterpriseId) {
    return { success: false, error: 'No se encontró la empresa activa' };
  }

  if (!trimmedContent) {
    return { success: false, error: 'El mensaje está vacío' };
  }

  const metadata: Record<string, unknown> = {
    enviado_por: 'humano',
    team_humano_id: userContext?.id || null,
    team_humano_nombre: userContext ? `${userContext.nombre || ''} ${userContext.apellido || ''}`.trim() : null,
    empresa_id: enterpriseId,
    contacto_id: contactId,
    conversacion_id: conversationId,
    timestamp_envio: new Date().toISOString(),
    webhook_destino: 'dd09c8a8-ba99-48ab-mensajes',
    ventana_24h: true,
    contacto_telefono: contact?.telefono || null,
  };

  if (originNotificationId) {
    metadata.origen_notificacion = originNotificationId;
  }

  try {
    const { data, error } = await supabase
      .from('wp_mensajes')
      .insert({
        conversacion_id: conversationId,
        contenido: trimmedContent,
        tipo: 'texto',
        remitente: 'humano',
        status: 'pendiente',
        metadata,
        empresa_id: enterpriseId,
      })
      .select()
      .single();

    if (error) {
      logger.error('[DirectMessage] Error saving message:', error);
      return { success: false, error: 'Error al guardar el mensaje' };
    }

    // Enviar a nuestra API interna que utilizará Kapso
    const internalApiUrl = '/api/whatsapp/send';

    try {
      const sendRes = await fetch(internalApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message_id: data.id,
          content: trimmedContent,
          metadata,
          contact,
        }),
      });

      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        logger.error('[DirectMessage] Error desde API interna (Kapso):', errData);
        return { success: false, data, metadata, error: 'El mensaje se guardó pero no se pudo enviar por WhatsApp' };
      }

      logger.info('[DirectMessage] Mensaje enviado correctamente vía API interna (Kapso).');
    } catch (webhookError) {
      logger.error('[DirectMessage] Fallo en fetch a API interna:', webhookError);
      return { success: false, data, metadata, error: 'El mensaje se guardó pero falló la conexión con WhatsApp' };
    }

    return { success: true, data, metadata };
  } catch (error: any) {
    logger.error('[DirectMessage] Unexpected error:', error);
    return { success: false, error: error?.message || 'Error inesperado al enviar el mensaje' };
  }
}
