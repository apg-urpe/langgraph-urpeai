/**
 * Email Intelligence Module - Types
 * 
 * Tipos para el sistema de correos con análisis IA.
 * Integración: Nylas v3 (fetch) + Gemini (análisis)
 */

// ============================================
// NYLAS EMAIL TYPES
// ============================================

export interface EmailParticipant {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface LocalEmail {
  id: string;                    // ID de Nylas
  grantId: string;               // Grant del usuario
  threadId?: string;             // ID del hilo
  subject: string;
  snippet: string;               // Preview corto (primeras ~100 chars)
  body?: string;                 // Cuerpo completo (HTML o texto)
  bodyText?: string;             // Cuerpo en texto plano
  from: EmailParticipant[];
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  replyTo?: EmailParticipant[];
  date: number;                  // Unix timestamp (segundos)
  unread: boolean;
  starred: boolean;
  folders: string[];             // IDs de folders/labels
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
  fetchedAt: number;             // Cuándo se guardó en local (ms)
}

// ============================================
// AI ANALYSIS TYPES
// ============================================

export type EmailCategory = 
  | 'ventas' 
  | 'soporte' 
  | 'interno' 
  | 'personal' 
  | 'marketing' 
  | 'facturacion'
  | 'legal'
  | 'spam'
  | 'otro';

export type EmailPriority = 'alta' | 'media' | 'baja';

export type EmailSentiment = 'positivo' | 'neutral' | 'negativo';

export interface ExtractedEntities {
  fechas?: string[];             // Fechas mencionadas
  montos?: string[];             // Cantidades/precios
  contactos?: string[];          // Nombres de personas
  empresas?: string[];           // Nombres de empresas
  telefonos?: string[];          // Números de teléfono
  enlaces?: string[];            // URLs importantes
}

export interface EmailAnalysis {
  emailId: string;
  categoria: EmailCategory;
  prioridad: EmailPriority;
  resumen: string;               // 2-3 oraciones
  tareas: string[];              // Acciones identificadas
  sentimiento: EmailSentiment;
  entidades: ExtractedEntities;
  palabrasClave: string[];       // Keywords principales
  requiereRespuesta: boolean;    // ¿Necesita reply?
  analyzedAt: number;            // Timestamp del análisis
}

// ============================================
// SUMMARY TYPES
// ============================================

export interface EmailHighlight {
  emailId: string;
  subject: string;
  razon: string;                 // Por qué es destacado
}

export interface EmailSummary {
  generatedAt: number;
  emailIds: string[];            // IDs de los correos resumidos
  summary: string;               // Resumen general narrativo
  highlights: EmailHighlight[];  // Correos destacados
  urgentCount: number;           // Cantidad de urgentes
  pendingActions: string[];      // Acciones pendientes consolidadas
  topCategories: { categoria: EmailCategory; count: number }[];
}

// ============================================
// SEARCH & FILTER TYPES
// ============================================

export interface EmailSearchParams {
  query?: string;                // Búsqueda de texto
  from?: string;                 // Filtrar por remitente
  to?: string;                   // Filtrar por destinatario
  subject?: string;              // Buscar en asunto
  before?: number;               // Unix timestamp
  after?: number;                // Unix timestamp
  unread?: boolean;              // Solo no leídos
  starred?: boolean;             // Solo destacados
  hasAttachment?: boolean;       // Con adjuntos
  limit?: number;                // Máximo resultados (default 20)
  pageToken?: string;            // Para paginación
}

export interface EmailSearchResult {
  emails: LocalEmail[];
  nextPageToken?: string;
  totalCount?: number;
}

// ============================================
// STORE STATE TYPES
// ============================================

export interface EmailStoreState {
  // Data
  emails: LocalEmail[];
  analyses: Record<string, EmailAnalysis>;  // emailId -> analysis
  lastSummary: EmailSummary | null;
  
  // UI State
  selectedEmailId: string | null;
  searchQuery: string;
  searchHistory: string[];
  
  // Loading states
  isLoading: boolean;
  isAnalyzing: boolean;
  isSummarizing: boolean;
  
  // Cache control
  lastFetchTime: number | null;
  grantId: string | null;
  
  // Error
  error: string | null;
}

export interface EmailStoreActions {
  // Fetch
  fetchEmails: (grantId: string, enterpriseId: number, userId: string, params?: EmailSearchParams) => Promise<void>;
  fetchEmailBody: (emailId: string) => Promise<string | null>;
  
  // Analysis
  analyzeEmail: (emailId: string) => Promise<EmailAnalysis | null>;
  generateSummary: (count?: number) => Promise<EmailSummary | null>;
  
  // Actions
  markAsRead: (emailId: string) => Promise<boolean>;
  
  // Query (Preguntas al correo)
  queryEmails: (question: string) => Promise<string | null>;
  
  // UI
  selectEmail: (emailId: string | null) => void;
  setSearchQuery: (query: string) => void;
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  
  // Cache
  clearCache: () => void;
  setGrantId: (grantId: string | null) => void;
  
  // Error
  clearError: () => void;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface FetchEmailsRequest {
  grant_id: string;
  limit?: number;
  query?: string;
  unread?: boolean;
  in_folder?: string;
  received_after?: number;
  received_before?: number;
  page_token?: string;
}

export interface FetchEmailsResponse {
  success: boolean;
  emails: LocalEmail[];
  next_page_token?: string;
  error?: string;
}

export interface AnalyzeEmailRequest {
  email_id: string;
  subject: string;
  body: string;
  from: string;
}

export interface AnalyzeEmailResponse {
  success: boolean;
  analysis?: EmailAnalysis;
  error?: string;
}

export interface GenerateSummaryRequest {
  emails: Array<{
    id: string;
    subject: string;
    snippet: string;
    from: string;
    date: number;
  }>;
}

export interface GenerateSummaryResponse {
  success: boolean;
  summary?: EmailSummary;
  error?: string;
}
