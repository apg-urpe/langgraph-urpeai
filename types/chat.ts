/**
 * Chat Types - Tipos del sistema de chat con Monica AI
 * 
 * Define las interfaces para mensajes, bloques UI, adjuntos y eventos de streaming
 * usados en la comunicación con el agente AI.
 * 
 * ## UI Blocks System
 * 
 * Los bloques UI permiten a Monica renderizar componentes interactivos:
 * - KPI Cards: Métricas y estadísticas
 * - Charts: Visualización de datos
 * - Tables: Datos tabulares
 * - Forms: Formularios interactivos
 * - Calendar: Eventos y citas
 * - Actions: Botones con callbacks
 * 
 * @module types/chat
 */

export type Role = 'user' | 'assistant';
export type MessageFeedback = 'like' | 'dislike' | null;

// Option can be string or {label, value} object for select fields
export type OptionItem = string | { label: string; value: string | number };

export interface FormField {
  id?: string; // Permitir id o name para resiliencia
  name?: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'email' | 'textarea' | 'date' | 'checkbox';
  placeholder?: string;
  helpText?: string; // Texto de ayuda o instrucción para el campo
  required?: boolean;
  options?: OptionItem[]; // For select type - accepts both string[] and {label, value}[]
  defaultValue?: string | number;
}

export interface BlockAction {
  id: string;
  label: string;
  icon?: string; // Lucide icon name
  payload?: any; // Data to send back
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO Date string
  end?: string; // ISO Date string
  description?: string;
  category?: 'meeting' | 'deadline' | 'reminder' | 'holiday';
  color?: string; // Optional hex override
}

export type BlockTheme = 'default' | 'success' | 'warning' | 'error' | 'info' | 'special' | 'neutral' | 'primary' | 'secondary';

export interface UIBlock {
  type: 'kpi_card' | 'chart' | 'table' | 'error' | 'warning' | 'info' | 'alert' | 'form' | 'image' | 'calendar' | 'html' | 'video' | 'text_block' | 'actions' | 'card' | 'cards' | 'grid' | 'task_board';
  title?: string;
  id?: string; // Optional ID to track specific forms
  theme?: BlockTheme; // Visual theme from CardPalette
  data: {
    actions?: BlockAction[]; // New standard for interactivity
    // Calendar specific data
    view?: 'month' | 'week' | 'day';
    currentDate?: string;
    events?: CalendarEvent[];
    // Text Block specific
    content?: string;
    markdown?: boolean;
    // Generic
    [key: string]: any;
  }; 
}

export interface Attachment {
  name: string;
  type: string;
  data: string; // Base64 Data URL
  file?: File; // Raw File object for uploads
  url?: string; // Persistent URL (Signed or Public)
  storagePath?: string; // Supabase Storage Path
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  uiBlocks: UIBlock[];
  timestamp: Date;
  attachments?: Attachment[];
  isComplete?: boolean;
  feedback?: MessageFeedback;
  is_archived?: boolean;
}

export interface StreamEvent {
  type: 'text' | 'ui_block' | 'done';
  payload?: string | UIBlock;
}