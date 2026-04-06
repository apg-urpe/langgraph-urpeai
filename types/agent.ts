/**
 * Agent Configuration Types
 * Tipos para wp_agentes y wp_agente_roles
 */

// =====================================================
// AGENT ROLE (wp_agente_roles)
// =====================================================

export interface AgentRole {
  id: number;
  nombre_rol: string | null;
  instrucciones_rol: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface CreateAgentRolePayload {
  nombre_rol: string;
  instrucciones_rol?: string;
}

export interface UpdateAgentRolePayload {
  nombre_rol?: string;
  instrucciones_rol?: string;
}

// =====================================================
// AGENT (wp_agentes)
// =====================================================

export interface Agent {
  id: number;
  nombre_agente: string;
  instrucciones: string | null;
  comportamiento: string | null;
  restricciones: string | null;
  empresa_id: number | null;
  formato_respuesta: string | null;
  areas_de_expertise: string | null;
  uso_de_emojis: string | null;
  prompt_personalizado: string | null;
  idioma: string | null;
  url_imagen_agente: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  id_rol: number | null;
  metadata_contacto: Record<string, any> | null;
  archivado: boolean; // Soft delete flag
  
  // Campos solo visibles para rol 1
  llm: string | null;
  manejo_herramientas: string | null;
  mcp_url: string | null;
  instrucciones_multimedia: string | null;
  
  // Campos que no se usan (ocultos en UI)
  // rol: string | null;
  // instrucciones_mensajes: string | null;
  // url_videos: string | null;
  
  // Relación opcional
  role?: AgentRole | null;
}

export interface CreateAgentPayload {
  nombre_agente: string;
  empresa_id: number;
  idioma?: string;
  instrucciones?: string;
  comportamiento?: string;
  restricciones?: string;
  formato_respuesta?: string;
  areas_de_expertise?: string;
  uso_de_emojis?: string;
  prompt_personalizado?: string;
  url_imagen_agente?: string;
  id_rol?: number;
  metadata_contacto?: Record<string, any>;
  // Solo rol 1
  llm?: string;
  manejo_herramientas?: string;
  mcp_url?: string;
  instrucciones_multimedia?: string;
}

export interface UpdateAgentPayload {
  nombre_agente?: string;
  instrucciones?: string | null;
  comportamiento?: string | null;
  restricciones?: string | null;
  formato_respuesta?: string | null;
  areas_de_expertise?: string | null;
  uso_de_emojis?: string | null;
  prompt_personalizado?: string | null;
  idioma?: string | null;
  url_imagen_agente?: string | null;
  id_rol?: number | null;
  metadata_contacto?: Record<string, any> | null;
  // Solo rol 1
  llm?: string | null;
  manejo_herramientas?: string | null;
  mcp_url?: string | null;
  instrucciones_multimedia?: string | null;
}

// =====================================================
// AGENT HISTORY (wp_agentes_historial)
// =====================================================

export interface AgentHistoryEntry {
  id: number;
  agente_id: number;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  usuario_id: number | null;
  mensaje_commit: string | null;
  created_at: string;
  // Relación opcional
  usuario?: {
    id: number;
    nombre: string;
    apellido: string;
  } | null;
}

// =====================================================
// FIELD CONFIGURATION
// =====================================================

export type AgentFieldCategory = 'identidad' | 'comportamiento' | 'instrucciones' | 'restricciones' | 'avanzado';

export interface AgentFieldConfig {
  key: keyof Agent;
  label: string;
  category: AgentFieldCategory;
  type: 'input' | 'textarea' | 'select' | 'json' | 'image';
  description?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  minRoleId?: number; // Rol mínimo para ver/editar (1 = solo dev)
  maxLength?: number;
  rows?: number;
}

// Configuración de campos por sección
export const AGENT_FIELDS: AgentFieldConfig[] = [
  // Identidad
  { key: 'nombre_agente', label: 'Nombre del Agente', category: 'identidad', type: 'input', description: 'Nombre identificador del agente' },
  { key: 'idioma', label: 'Idioma', category: 'identidad', type: 'select', options: [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português' }
  ]},
  { key: 'url_imagen_agente', label: 'Avatar URL', category: 'identidad', type: 'image', description: 'URL de la imagen del agente' },
  
  // Comportamiento
  { key: 'comportamiento', label: 'Comportamiento', category: 'comportamiento', type: 'textarea', description: 'Cómo debe actuar el agente', rows: 8 },
  { key: 'uso_de_emojis', label: 'Uso de Emojis', category: 'comportamiento', type: 'textarea', description: 'Políticas de uso de emojis', rows: 4 },
  { key: 'formato_respuesta', label: 'Formato de Respuesta', category: 'comportamiento', type: 'textarea', description: 'Formato esperado de las respuestas', rows: 6 },
  
  // Instrucciones
  { key: 'instrucciones', label: 'Instrucciones Principales', category: 'instrucciones', type: 'textarea', description: 'Instrucciones principales del agente', rows: 12 },
  { key: 'prompt_personalizado', label: 'Prompt Personalizado', category: 'instrucciones', type: 'textarea', description: 'Prompt adicional personalizado', rows: 8 },
  { key: 'areas_de_expertise', label: 'Áreas de Expertise', category: 'instrucciones', type: 'textarea', description: 'Áreas de conocimiento del agente', rows: 6 },
  
  // Restricciones
  { key: 'restricciones', label: 'Restricciones', category: 'restricciones', type: 'textarea', description: 'Qué NO debe hacer el agente', rows: 8 },
  
  // Avanzado (Solo rol 1)
  { key: 'llm', label: 'Modelo LLM', category: 'avanzado', type: 'select', minRoleId: 1, options: [
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }
  ]},
  { key: 'mcp_url', label: 'MCP URL', category: 'avanzado', type: 'input', minRoleId: 1, description: 'URL del servidor MCP' },
  { key: 'manejo_herramientas', label: 'Manejo de Herramientas', category: 'avanzado', type: 'textarea', minRoleId: 1, description: 'Configuración de herramientas', rows: 8 },
  { key: 'instrucciones_multimedia', label: 'Instrucciones Multimedia', category: 'avanzado', type: 'textarea', minRoleId: 1, description: 'Manejo de imágenes, audio, video', rows: 6 },
  { key: 'metadata_contacto', label: 'Metadata de Contacto', category: 'avanzado', type: 'json', description: 'Configuración JSON adicional' }
];

// Helper para obtener campos por categoría
export const getFieldsByCategory = (category: AgentFieldCategory, userRoleId: number): AgentFieldConfig[] => {
  return AGENT_FIELDS.filter(f => 
    f.category === category && 
    (f.minRoleId === undefined || userRoleId <= f.minRoleId)
  );
};

// Helper para verificar si un campo es visible para un rol
export const isFieldVisibleForRole = (field: AgentFieldConfig, userRoleId: number): boolean => {
  return field.minRoleId === undefined || userRoleId <= field.minRoleId;
};

// Categorías con metadata
export const AGENT_CATEGORIES: { id: AgentFieldCategory; label: string; icon: string }[] = [
  { id: 'identidad', label: 'Identidad', icon: 'User' },
  { id: 'comportamiento', label: 'Comportamiento', icon: 'Brain' },
  { id: 'instrucciones', label: 'Instrucciones', icon: 'FileText' },
  { id: 'restricciones', label: 'Restricciones', icon: 'ShieldAlert' },
  { id: 'avanzado', label: 'Avanzado', icon: 'Settings2' }
];
