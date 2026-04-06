/**
 * Monica Roles - Type Definitions
 * Sistema de Roles/Agentes Personalizados para Monica AI
 */

// =====================================================
// CORE TYPES
// =====================================================

export type MonicaRoleCategory = 
  | 'general' 
  | 'ventas' 
  | 'soporte' 
  | 'marketing' 
  | 'analisis' 
  | 'custom';

export type MonicaRoleColorTheme = 
  | 'cyan' 
  | 'violet' 
  | 'emerald' 
  | 'amber' 
  | 'rose' 
  | 'blue' 
  | 'indigo'
  | 'pink';

export type MonicaToolName = 
  | 'search_crm'
  | 'get_contact_360'
  | 'get_contacts'
  | 'create_note'
  | 'get_portfolio'
  | 'get_collection_queue'
  | 'register_payment'
  | 'attach_payment_receipt'
  | 'update_service_commitment'
  | 'get_pipeline'
  | 'get_business_metrics'
  | 'get_conversational_intelligence'
  | 'get_appointments'
  | 'update_appointment_status'
  | 'get_tasks'
  | 'get_projects'
  | 'get_team_members'
  | 'get_contact_assignments'
  | 'manage_contact_assignments'
  | 'get_funnel_stages'
  | 'get_funnel_stats'
  | 'update_contact_stage'
  | 'search_emails'
  | 'get_email_detail'
  | 'search_documentation'
  | 'create_template_draft';

// =====================================================
// MAIN INTERFACE
// =====================================================

export interface MonicaRole {
  id: string;
  
  // Identificación
  nombre: string;
  slug: string;
  descripcion: string | null;
  
  // Comportamiento
  system_prompt: string;
  welcome_message: string | null;
  temperatura: number;
  max_tokens: number;
  tools_enabled: MonicaToolName[];
  
  // Visuales
  avatar_url: string | null;
  color_theme: MonicaRoleColorTheme;
  icono: string;
  
  // Propiedad
  created_by: string;
  empresa_id: number | null;
  is_public: boolean;
  is_default: boolean;
  is_active: boolean;
  
  // Estadísticas
  usage_count: number;
  last_used_at: string | null;
  
  // Categorización
  categoria: MonicaRoleCategory;
  tags: string[];
  metadata: Record<string, unknown>;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// =====================================================
// UI DISPLAY TYPE (Optimized for lists)
// =====================================================

export interface MonicaRolePreview {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  avatar_url: string | null;
  color_theme: MonicaRoleColorTheme;
  icono: string;
  is_default: boolean;
  is_favorite: boolean;
  categoria: MonicaRoleCategory;
  usage_count: number;
}

// =====================================================
// PAYLOADS
// =====================================================

export interface CreateMonicaRolePayload {
  nombre: string;
  slug?: string; // Auto-generated if not provided
  descripcion?: string;
  system_prompt: string;
  welcome_message?: string;
  temperatura?: number;
  max_tokens?: number;
  tools_enabled?: MonicaToolName[];
  avatar_url?: string;
  color_theme?: MonicaRoleColorTheme;
  icono?: string;
  empresa_id?: number | null;
  is_public?: boolean;
  categoria?: MonicaRoleCategory;
  tags?: string[];
}

export interface UpdateMonicaRolePayload {
  nombre?: string;
  descripcion?: string;
  system_prompt?: string;
  welcome_message?: string;
  temperatura?: number;
  max_tokens?: number;
  tools_enabled?: MonicaToolName[];
  avatar_url?: string;
  color_theme?: MonicaRoleColorTheme;
  icono?: string;
  is_public?: boolean;
  is_active?: boolean;
  categoria?: MonicaRoleCategory;
  tags?: string[];
}

// =====================================================
// STORE STATE
// =====================================================

export interface MonicaRolesState {
  // Data
  roles: MonicaRole[];
  activeRoleId: string | null;
  favorites: string[];
  
  // Loading states
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  
  // Cache
  lastFetchedAt: number | null;
  
  // Error
  error: string | null;
}

// =====================================================
// CONSTANTS
// =====================================================

export const DEFAULT_ROLE_SLUG = 'monica-default';

export const ALL_MONICA_TOOLS: MonicaToolName[] = [
  'search_crm',
  'get_contact_360',
  'get_contacts',
  'create_note',
  'get_portfolio',
  'get_collection_queue',
  'register_payment',
  'attach_payment_receipt',
  'update_service_commitment',
  'get_pipeline',
  'get_business_metrics',
  'get_conversational_intelligence',
  'get_appointments',
  'update_appointment_status',
  'get_tasks',
  'get_projects',
  'get_team_members',
  'get_contact_assignments',
  'manage_contact_assignments',
  'get_funnel_stages',
  'get_funnel_stats',
  'update_contact_stage',
  'search_emails',
  'get_email_detail',
  'search_documentation',
  'create_template_draft'
];

export const ROLE_CATEGORY_CONFIG: Record<MonicaRoleCategory, {
  label: string;
  icon: string;
  color: string;
}> = {
  general: { label: 'General', icon: 'Sparkles', color: 'cyan' },
  ventas: { label: 'Ventas', icon: 'TrendingUp', color: 'emerald' },
  soporte: { label: 'Soporte', icon: 'Headphones', color: 'blue' },
  marketing: { label: 'Marketing', icon: 'Megaphone', color: 'violet' },
  analisis: { label: 'Análisis', icon: 'BarChart3', color: 'amber' },
  custom: { label: 'Personalizado', icon: 'Wand2', color: 'rose' }
};

export const ROLE_COLOR_CONFIG: Record<MonicaRoleColorTheme, {
  bg: string;
  border: string;
  text: string;
  gradient: string;
}> = {
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    gradient: 'from-cyan-500 to-blue-500'
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    text: 'text-violet-400',
    gradient: 'from-violet-500 to-purple-500'
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    gradient: 'from-emerald-500 to-green-500'
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    gradient: 'from-amber-500 to-orange-500'
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    gradient: 'from-rose-500 to-pink-500'
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    gradient: 'from-blue-500 to-indigo-500'
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    gradient: 'from-indigo-500 to-violet-500'
  },
  pink: {
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    text: 'text-pink-400',
    gradient: 'from-pink-500 to-rose-500'
  }
};

export const TOOL_DESCRIPTIONS: Record<MonicaToolName, {
  label: string;
  description: string;
  icon: string;
}> = {
  search_crm: {
    label: 'Buscar en CRM',
    description: 'Búsqueda universal de contactos, mensajes y notas',
    icon: 'Search'
  },
  get_contact_360: {
    label: 'Vista 360°',
    description: 'Contexto completo de un contacto',
    icon: 'User'
  },
  get_contacts: {
    label: 'Listar Contactos',
    description: 'Obtener lista de contactos con filtros',
    icon: 'Users'
  },
  create_note: {
    label: 'Crear Nota',
    description: 'Añadir nota a un contacto',
    icon: 'PenLine'
  },
  get_portfolio: {
    label: 'Cartera',
    description: 'Consultar cartera, servicios, pagos y señales operativas',
    icon: 'Wallet'
  },
  get_collection_queue: {
    label: 'Cola de Cobranza',
    description: 'Ver la priorización operativa de cobranza por cartera',
    icon: 'ListOrdered'
  },
  register_payment: {
    label: 'Registrar Pago',
    description: 'Registrar pagos y actualizar saldos del servicio',
    icon: 'CreditCard'
  },
  attach_payment_receipt: {
    label: 'Adjuntar Comprobante',
    description: 'Asociar una imagen del chat como comprobante de un pago existente',
    icon: 'Receipt'
  },
  update_service_commitment: {
    label: 'Ajustar Compromiso',
    description: 'Actualizar compromiso, cuota y estado operativo del servicio',
    icon: 'Settings2'
  },
  get_pipeline: {
    label: 'Pipeline',
    description: 'Ver embudo de ventas y etapas',
    icon: 'GitBranch'
  },
  get_business_metrics: {
    label: 'Métricas',
    description: 'KPIs y métricas de negocio',
    icon: 'BarChart3'
  },
  get_conversational_intelligence: {
    label: 'Inteligencia Conversacional',
    description: 'Análisis de calidad y patrones en conversaciones',
    icon: 'Brain'
  },
  get_appointments: {
    label: 'Citas',
    description: 'Consultar citas programadas',
    icon: 'Calendar'
  },
  update_appointment_status: {
    label: 'Actualizar Estado de Cita',
    description: 'Cambiar el estado operativo de una cita, incluso si no tiene contacto asociado',
    icon: 'CalendarCheck2'
  },
  get_tasks: {
    label: 'Tareas',
    description: 'Ver tareas del CRM',
    icon: 'CheckSquare'
  },
  get_projects: {
    label: 'Proyectos',
    description: 'Listar proyectos de la empresa',
    icon: 'Folder'
  },
  get_team_members: {
    label: 'Equipo',
    description: 'Ver miembros del equipo',
    icon: 'Users'
  },
  get_contact_assignments: {
    label: 'Asignaciones de Contacto',
    description: 'Consultar responsable, colaboradores y observadores de un contacto',
    icon: 'Users'
  },
  manage_contact_assignments: {
    label: 'Gestionar Asignaciones',
    description: 'Cambiar responsable y gestionar colaboradores u observadores con confirmación',
    icon: 'UserCheck'
  },
  get_funnel_stages: {
    label: 'Etapas del Embudo',
    description: 'Ver la lista de etapas del embudo comercial',
    icon: 'GitBranch'
  },
  get_funnel_stats: {
    label: 'Embudo',
    description: 'Estadísticas del embudo de ventas',
    icon: 'TrendingUp'
  },
  update_contact_stage: {
    label: 'Cambiar Etapa',
    description: 'Mover un contacto a otra etapa del embudo',
    icon: 'RefreshCw'
  },
  search_emails: {
    label: 'Buscar Correos',
    description: 'Buscar en la bandeja de correo del usuario',
    icon: 'Mail'
  },
  get_email_detail: {
    label: 'Detalle de Correo',
    description: 'Ver contenido completo de un correo',
    icon: 'MailOpen'
  },
  search_documentation: {
    label: 'Documentación',
    description: 'Buscar en la documentación técnica de la plataforma',
    icon: 'BookOpen'
  },
  create_template_draft: {
    label: 'Crear Plantilla',
    description: 'Crear borrador de plantilla WhatsApp desde el chat',
    icon: 'FileText'
  }
};

// =====================================================
// HELPERS
// =====================================================

/**
 * Generate slug from role name
 */
export function generateRoleSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')    // Remove special chars
    .replace(/\s+/g, '-')            // Spaces to hyphens
    .replace(/-+/g, '-')             // Multiple hyphens to single
    .slice(0, 50);                   // Limit length
}

/**
 * Get display info for a role category
 */
export function getCategoryInfo(categoria: MonicaRoleCategory) {
  return ROLE_CATEGORY_CONFIG[categoria] || ROLE_CATEGORY_CONFIG.general;
}

/**
 * Get color classes for a role theme
 */
export function getRoleColorClasses(theme: MonicaRoleColorTheme) {
  return ROLE_COLOR_CONFIG[theme] || ROLE_COLOR_CONFIG.cyan;
}

/**
 * Check if a tool is enabled for a role
 */
export function isToolEnabled(role: MonicaRole, toolName: MonicaToolName): boolean {
  return role.tools_enabled.includes(toolName);
}

/**
 * Get default new role template
 */
export function getDefaultRoleTemplate(): CreateMonicaRolePayload {
  return {
    nombre: '',
    descripcion: '',
    system_prompt: `Eres Monica, una asistente especializada. 

## Tu Rol
[Describe aquí el enfoque específico de este rol]

## Instrucciones
- Responde siempre en español
- Sé conciso y útil
- Usa las herramientas cuando sea necesario

## Estilo
[Define el tono y estilo de comunicación]`,
    welcome_message: '¡Hola! ¿En qué puedo ayudarte hoy?',
    temperatura: 0.7,
    max_tokens: 4096,
    tools_enabled: ['search_crm', 'create_note', 'get_contacts'],
    color_theme: 'cyan',
    icono: 'Sparkles',
    is_public: false,
    categoria: 'custom',
    tags: []
  };
}
