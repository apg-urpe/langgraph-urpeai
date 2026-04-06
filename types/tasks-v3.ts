/**
 * Task Management V3 - Types
 * 
 * Tipos extendidos para el sistema de gestión de tareas avanzado.
 * Incluye: Media, Etiquetas, Historial, Reacciones, Costos de Proyecto.
 */

import { 
  Task, 
  TaskItem, 
  TaskStatus, 
  TaskPriority, 
  Project,
  TaskComment,
  TaskAssignment,
  TeamLabel
} from './contact';

// ============================================================================
// MEDIA ATTACHMENTS
// ============================================================================

export interface TaskMedia {
  id: number;
  tarea_id: number;
  nombre_archivo: string;
  tipo_mime: string;
  tamaño_bytes: number;
  storage_path: string;
  url_publica?: string | null;
  descripcion?: string | null;
  es_portada: boolean;
  subido_por?: number | null;
  created_at: string;
  
  // Joined
  uploader?: { id: number; nombre: string; apellido: string } | null;
}

export interface CreateMediaPayload {
  tarea_id: number;
  nombre_archivo: string;
  tipo_mime: string;
  tamaño_bytes: number;
  storage_path: string;
  url_publica?: string;
  descripcion?: string;
  es_portada?: boolean;
}

// Tipos MIME permitidos
export const ALLOWED_MIME_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  presentations: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  archives: ['application/zip', 'application/x-rar-compressed'],
  text: ['text/plain', 'text/csv', 'text/markdown']
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function isAllowedMimeType(mimeType: string): boolean {
  return Object.values(ALLOWED_MIME_TYPES).flat().includes(mimeType);
}

export function getFileCategory(mimeType: string): string {
  for (const [category, types] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (types.includes(mimeType)) return category;
  }
  return 'other';
}

// ============================================================================
// ETIQUETAS (LABELS)
// ============================================================================

export interface TaskLabelRelation {
  tarea_id: number;
  etiqueta_id: number;
  created_at: string;
  
  // Joined
  etiqueta?: TeamLabel;
}

// ============================================================================
// HISTORIAL DE ACTIVIDAD (ACTIVITY LOG)
// ============================================================================

export type HistoryAction = 
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'due_date_changed'
  | 'description_updated'
  | 'assigned'
  | 'unassigned'
  | 'comment_added'
  | 'item_completed'
  | 'item_uncompleted'
  | 'label_added'
  | 'label_removed'
  | 'media_uploaded'
  | 'media_deleted';

export interface TaskHistory {
  id: number;
  tarea_id: number;
  accion: HistoryAction;
  campo_modificado?: string | null;
  valor_anterior?: string | null;
  valor_nuevo?: string | null;
  autor_id?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  
  // Joined
  autor?: { id: number; nombre: string; apellido: string } | null;
}

export const HISTORY_ACTION_LABELS: Record<HistoryAction, string> = {
  created: 'Tarea creada',
  status_changed: 'Estado cambiado',
  priority_changed: 'Prioridad cambiada',
  due_date_changed: 'Fecha de vencimiento cambiada',
  description_updated: 'Descripción actualizada',
  assigned: 'Miembro asignado',
  unassigned: 'Miembro removido',
  comment_added: 'Comentario añadido',
  item_completed: 'Item completado',
  item_uncompleted: 'Item desmarcado',
  label_added: 'Etiqueta añadida',
  label_removed: 'Etiqueta removida',
  media_uploaded: 'Archivo subido',
  media_deleted: 'Archivo eliminado'
};

export const HISTORY_ACTION_ICONS: Record<HistoryAction, string> = {
  created: 'Plus',
  status_changed: 'RefreshCw',
  priority_changed: 'Flag',
  due_date_changed: 'Calendar',
  description_updated: 'FileText',
  assigned: 'UserPlus',
  unassigned: 'UserMinus',
  comment_added: 'MessageSquare',
  item_completed: 'CheckSquare',
  item_uncompleted: 'Square',
  label_added: 'Tag',
  label_removed: 'X',
  media_uploaded: 'Upload',
  media_deleted: 'Trash2'
};

// ============================================================================
// REACCIONES A COMENTARIOS
// ============================================================================

export type ReactionEmoji = '👍' | '❤️' | '🎉' | '😄' | '😮' | '🤔';

export interface CommentReaction {
  comentario_id: number;
  usuario_id: number;
  emoji: ReactionEmoji;
  created_at: string;
  
  // Joined
  usuario?: { id: number; nombre: string } | null;
}

export const REACTION_EMOJIS: ReactionEmoji[] = ['👍', '❤️', '🎉', '😄', '😮', '🤔'];

export interface ReactionCount {
  emoji: ReactionEmoji;
  count: number;
  hasReacted: boolean; // Si el usuario actual ha reaccionado con este emoji
  reacted_by_me?: boolean; // Alias for compatibility
}

export type { TaskComment }; // Re-export TaskComment

// ============================================================================
// COSTOS DE PROYECTO
// ============================================================================

export type CostCategory = 'personal' | 'licencias' | 'infraestructura' | 'servicios' | 'general';

export interface ProjectCost {
  id: number;
  proyecto_id: number;
  concepto: string;
  categoria: CostCategory;
  monto: number;
  moneda: string;
  tarea_id?: number | null;
  fecha_costo: string;
  registrado_por?: number | null;
  comprobante_url?: string | null;
  notas?: string | null;
  created_at: string;
  
  // Joined
  registrador?: { id: number; nombre: string; apellido: string } | null;
  tarea?: { id: number; titulo: string } | null;
}

export interface CreateCostPayload {
  proyecto_id: number;
  concepto: string;
  categoria?: CostCategory;
  monto: number;
  moneda?: string;
  tarea_id?: number;
  fecha_costo?: string;
  comprobante_url?: string;
  notas?: string;
}

export interface UpdateCostPayload {
  concepto?: string;
  categoria?: CostCategory;
  monto?: number;
  moneda?: string;
  tarea_id?: number | null;
  fecha_costo?: string;
  comprobante_url?: string | null;
  notas?: string | null;
}

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  personal: 'Personal',
  licencias: 'Licencias',
  infraestructura: 'Infraestructura',
  servicios: 'Servicios Externos',
  general: 'General'
};

export const COST_CATEGORY_ICONS: Record<CostCategory, string> = {
  personal: 'Users',
  licencias: 'Key',
  infraestructura: 'Server',
  servicios: 'Package',
  general: 'Receipt'
};

export const COST_CATEGORY_COLORS: Record<CostCategory, string> = {
  personal: 'text-blue-400 bg-blue-500/10',
  licencias: 'text-purple-400 bg-purple-500/10',
  infraestructura: 'text-amber-400 bg-amber-500/10',
  servicios: 'text-emerald-400 bg-emerald-500/10',
  general: 'text-zinc-400 bg-zinc-500/10'
};

// ============================================================================
// EXTENSIONES DE TASK V3
// ============================================================================

export interface TaskV3 extends Task {
  // Campos nuevos V3
  descripcion_md?: string | null;
  portada_url?: string | null;
  tiempo_estimado_min?: number | null;
  tiempo_real_min?: number | null;
  costo_estimado?: number | null;
  costo_real?: number | null;
  moneda?: string;
  
  // Relaciones V3
  media?: TaskMedia[];
  etiquetas?: TaskLabelRelation[];
  historial?: TaskHistory[];
  comentarios?: TaskComment[];
  
  // Computed: Reacciones agrupadas por comentario
  _reacciones_por_comentario?: Record<number, ReactionCount[]>;
}

export interface TaskItemV3 extends TaskItem {
  asignado_a?: number | null;
  etiqueta_id?: number | null;
  
  // Joined
  asignado?: { id: number; nombre: string; apellido: string } | null;
  etiqueta?: TeamLabel | null;
}

// ============================================================================
// EXTENSIONES DE PROJECT V3
// ============================================================================

export interface ProjectV3 extends Project {
  // Campos nuevos V3
  contacto_id?: number | null;
  servicio_id?: number | null;
  presupuesto?: number | null;
  gasto_actual?: number | null;
  moneda?: string;
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
  fecha_fin_real?: string | null;
  
  // Relaciones V3
  contacto?: { 
    id: number; 
    nombre: string; 
    apellido: string; 
    telefono?: string;
    email?: string;
  } | null;
  servicio?: { 
    id: number; 
    nombre_servicio: string; 
    valor_total: number;
    estado: string;
  } | null;
  costos?: ProjectCost[];
  
  // Computed
  _porcentaje_completado?: number;
  _tareas_total?: number;
  _tareas_completadas?: number;
  _tareas_vencidas?: number;
}

export interface CreateProjectV3Payload {
  nombre: string;
  descripcion?: string;
  color?: string;
  icono?: string;
  contacto_id?: number;
  servicio_id?: number;
  presupuesto?: number;
  moneda?: string;
  fecha_inicio?: string;
  fecha_fin_estimada?: string;
}

export interface UpdateProjectV3Payload {
  nombre?: string;
  descripcion?: string | null;
  estado?: 'activo' | 'archivado' | 'completado';
  color?: string;
  icono?: string;
  orden?: number;
  contacto_id?: number | null;
  servicio_id?: number | null;
  presupuesto?: number | null;
  moneda?: string;
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
  fecha_fin_real?: string | null;
}

// ============================================================================
// FILTROS V3
// ============================================================================

export interface TaskFiltersV3 {
  search: string;
  estado: TaskStatus | null;
  prioridad: TaskPriority | null;
  asignadoA: number | null;
  tipo: 'contacto' | 'cita' | 'conversacion' | 'equipo' | 'general' | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  proyecto_id: number | null;
  etiqueta_ids: number[];
  soloVencidas: boolean;
  soloConMedia: boolean;
}

export const initialFiltersV3: TaskFiltersV3 = {
  search: '',
  estado: null,
  prioridad: null,
  asignadoA: null,
  tipo: null,
  fechaDesde: null,
  fechaHasta: null,
  proyecto_id: null,
  etiqueta_ids: [],
  soloVencidas: false,
  soloConMedia: false
};

// ============================================================================
// HELPERS Y UTILIDADES
// ============================================================================

/**
 * Formatea duración de minutos a string legible
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '-';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

/**
 * Formatea tamaño de archivo
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Calcula el porcentaje de presupuesto gastado
 */
export function calculateBudgetPercentage(project: ProjectV3): number {
  if (!project.presupuesto || project.presupuesto <= 0) return 0;
  const gastado = project.gasto_actual || 0;
  return Math.min(100, Math.round((gastado / project.presupuesto) * 100));
}

/**
 * Determina el color del presupuesto según el porcentaje gastado
 */
export function getBudgetStatusColor(percentage: number): string {
  if (percentage >= 100) return 'text-rose-400';
  if (percentage >= 80) return 'text-amber-400';
  if (percentage >= 50) return 'text-primary-400';
  return 'text-emerald-400';
}

/**
 * Agrupa reacciones por emoji con conteo
 */
export function groupReactions(
  reactions: CommentReaction[], 
  currentUserId: number
): ReactionCount[] {
  const grouped = new Map<ReactionEmoji, { count: number; hasReacted: boolean }>();
  
  for (const reaction of reactions) {
    const existing = grouped.get(reaction.emoji) || { count: 0, hasReacted: false };
    existing.count++;
    if (reaction.usuario_id === currentUserId) {
      existing.hasReacted = true;
    }
    grouped.set(reaction.emoji, existing);
  }
  
  return Array.from(grouped.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    hasReacted: data.hasReacted
  }));
}

/**
 * Genera texto descriptivo para una acción del historial
 */
export function getHistoryActionDescription(entry: TaskHistory): string {
  const autorNombre = entry.autor 
    ? `${entry.autor.nombre} ${entry.autor.apellido?.charAt(0) || ''}.`
    : 'Sistema';
  
  switch (entry.accion) {
    case 'created':
      return `${autorNombre} creó la tarea`;
    case 'status_changed':
      return `${autorNombre} cambió el estado de "${entry.valor_anterior}" a "${entry.valor_nuevo}"`;
    case 'priority_changed':
      return `${autorNombre} cambió la prioridad a "${entry.valor_nuevo}"`;
    case 'due_date_changed':
      return entry.valor_nuevo 
        ? `${autorNombre} estableció la fecha de vencimiento`
        : `${autorNombre} removió la fecha de vencimiento`;
    case 'assigned':
      return `${autorNombre} asignó a ${entry.valor_nuevo}`;
    case 'unassigned':
      return `${autorNombre} removió a ${entry.valor_anterior}`;
    case 'comment_added':
      return `${autorNombre} comentó`;
    case 'item_completed':
      return `${autorNombre} completó "${entry.valor_nuevo}"`;
    case 'item_uncompleted':
      return `${autorNombre} desmarcó "${entry.valor_nuevo}"`;
    case 'label_added':
      return `${autorNombre} añadió la etiqueta "${entry.valor_nuevo}"`;
    case 'label_removed':
      return `${autorNombre} removió la etiqueta "${entry.valor_anterior}"`;
    case 'media_uploaded':
      return `${autorNombre} subió "${entry.valor_nuevo}"`;
    case 'media_deleted':
      return `${autorNombre} eliminó un archivo`;
    default:
      return `${autorNombre} realizó una acción`;
  }
}

/**
 * Obtiene el icono para una categoría de costo
 */
export function getCostCategoryIcon(category: CostCategory): string {
  return COST_CATEGORY_ICONS[category] || 'Receipt';
}

/**
 * Valida si un archivo puede ser subido
 */
export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `El archivo excede el límite de ${formatFileSize(MAX_FILE_SIZE_BYTES)}` };
  }
  if (!isAllowedMimeType(file.type)) {
    return { valid: false, error: 'Tipo de archivo no permitido' };
  }
  return { valid: true };
}

// ============================================================================
// TIPOS DE NOTIFICACIÓN V3
// ============================================================================

export type TaskNotificationType = 
  | 'tarea_asignada'
  | 'tarea_mencion'
  | 'tarea_estado'
  | 'tarea_vencimiento_proximo'
  | 'tarea_vencida'
  | 'tarea_comentario'
  | 'tarea_item_completado'
  | 'proyecto_costo';

export const TASK_NOTIFICATION_ICONS: Record<TaskNotificationType, string> = {
  tarea_asignada: 'UserPlus',
  tarea_mencion: 'AtSign',
  tarea_estado: 'RefreshCw',
  tarea_vencimiento_proximo: 'Clock',
  tarea_vencida: 'AlertTriangle',
  tarea_comentario: 'MessageSquare',
  tarea_item_completado: 'CheckSquare',
  proyecto_costo: 'DollarSign'
};
