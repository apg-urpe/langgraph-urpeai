
export enum Sender {
  USER = 'USER',
  AI = 'AI'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  isThinking?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  date: string;
  active: boolean;
  // Per-session state for virtual isolation
  isThinking?: boolean;
  isStreaming?: boolean;
  hasUnread?: boolean; // New: Notification indicator
  customInstructions?: string;
  is_archived?: boolean;
  isPinned?: boolean;
  // Monica Role - references monica_roles.id
  roleId?: string;
}

/**
 * ChatSessionMeta - Metadata ligera de sesión para lista de sesiones
 * No incluye mensajes para evitar cargar todo en memoria
 */
export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
  roleId?: string;
  // Estado de UI (no persistido en DB)
  isThinking?: boolean;
  isStreaming?: boolean;
  hasUnread?: boolean;
}

/**
 * DbChatMessage - Estructura del mensaje en Supabase
 */
export interface DbChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: {
    text?: string;
    uiBlocks?: any[];
  };
  created_at: string;
  updated_at?: string;
  metadata?: {
    attachments?: any[];
  };
  is_complete: boolean;
  request_id?: string;
  feedback?: 'like' | 'dislike' | null;
  is_archived: boolean;
}
