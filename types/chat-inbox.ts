import { ConversationMessage } from './contact';

export interface InboxContactSnapshot {
  id: number;
  nombre?: string | null;
  apellido?: string | null;
  telefono?: string | null;
  origen?: string | null;
  ultima_interaccion?: string | null;
}

export interface EnterpriseInboxThread {
  id: number;
  contacto_id: number;
  nombre_contacto: string | null;
  telefono_contacto: string | null;
  ultimo_mensaje_contenido: string | null;
  ultimo_mensaje_fecha: string;
  canal: string | null;
  estado: string | null;
  numero_id: number | null;
  nombre_numero: string | null;
  telefono_numero: string | null;
  remitente_ultimo_mensaje: string | null;
  contactSnapshot: InboxContactSnapshot;
}

export interface ChatInboxFilters {
  selectedNumberId: number | null;
  search: string;
}

export interface EnterpriseInboxRpcRow {
  id: number;
  contacto_id: number;
  nombre_contacto: string | null;
  telefono_contacto: string | null;
  ultimo_mensaje_contenido: string | null;
  ultimo_mensaje_fecha: string;
  canal: string | null;
  estado: string | null;
  numero_id: number | null;
  nombre_numero: string | null;
  telefono_numero?: string | null;
  remitente_ultimo_mensaje?: string | null;
  contacto_origen?: string | null;
  contacto_ultima_interaccion?: string | null;
  total_count?: number | null;
}

export interface ChatInboxSendHandler {
  (conversationId: number, contactId: number, content: string, contact?: InboxContactSnapshot | null): Promise<boolean>;
}

export type InboxMessage = ConversationMessage;
