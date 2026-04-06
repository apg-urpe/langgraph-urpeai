/**
 * Common Zod Schemas
 * 
 * Schemas reutilizables para validación de tools.
 * 
 * @module lib/ai/toolsets/schemas/common
 */

import { z } from 'zod';

// ============================================================================
// PRIMITIVOS
// ============================================================================

/** ID numérico positivo */
export const IdSchema = z.number().int().positive();

/** Límite de resultados (1-100, default 10) */
export const LimitSchema = z.number().int().min(1).max(100).default(10);

/** Offset para paginación */
export const OffsetSchema = z.number().int().min(0).default(0);

/** Fecha en formato ISO */
export const ISODateSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/** Fecha opcional */
export const OptionalDateSchema = ISODateSchema.optional().nullable();

// ============================================================================
// CONTACTOS
// ============================================================================

export const ContactEstadoSchema = z.enum([
  'prospecto',
  'cliente', 
  'inactivo',
  'perdido'
]);

export const ContactCalificacionSchema = z.enum([
  'si',
  'no',
  'evaluando'
]);

export const ContactOrderBySchema = z.enum([
  'nombre',
  'created_at',
  'ultima_interaccion'
]);

// ============================================================================
// CITAS
// ============================================================================

export const AppointmentEstadoSchema = z.enum([
  'pendiente',
  'confirmada',
  'completada',
  'cancelada',
  'no_asistio'
]);

// ============================================================================
// TAREAS
// ============================================================================

export const TaskEstadoSchema = z.enum([
  'pendiente',
  'en_progreso',
  'completada',
  'cancelada'
]);

export const TaskPrioridadSchema = z.number().int().min(1).max(4);

// ============================================================================
// CONVERSACIONES
// ============================================================================

export const ConversationStatusSchema = z.enum([
  'active',
  'closed',
  'pending'
]);

// ============================================================================
// PERÍODOS DE TIEMPO
// ============================================================================

export const TimePeriodSchema = z.enum([
  'today',
  'week',
  'month',
  'quarter',
  'year'
]);

// ============================================================================
// ROLES DE EQUIPO
// ============================================================================

export const TeamRolSchema = z.string().min(1);

// ============================================================================
// BÚSQUEDA
// ============================================================================

export const SearchScopeSchema = z.enum([
  'all',
  'contacts',
  'messages',
  'metadata',
  'notes'
]);

// ============================================================================
// OUTPUT SCHEMAS COMUNES
// ============================================================================

/** Respuesta de lista con conteo */
export const ListResponseSchema = <T extends z.ZodType>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  count: z.number(),
  message: z.string().optional()
});

/** Respuesta de entidad única */
export const SingleResponseSchema = <T extends z.ZodType>(itemSchema: T) => z.object({
  item: itemSchema,
  message: z.string().optional()
});

/** Respuesta de operación */
export const OperationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  id: z.number().optional()
});

// ============================================================================
// CONTACTO SCHEMA (para outputs)
// ============================================================================

export const ContactBasicSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  apellido: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  estado: ContactEstadoSchema.optional(),
  es_calificado: ContactCalificacionSchema.optional(),
  is_active: z.boolean().optional(),
  etapa_embudo: z.number().nullable().optional(),
  created_at: z.string().optional(),
  ultima_interaccion: z.string().nullable().optional()
});

export const ContactDetailSchema = ContactBasicSchema.extend({
  notas: z.string().nullable().optional(),
  origen: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  team_humano_id: z.number().nullable().optional()
});

// ============================================================================
// CITA SCHEMA (para outputs)
// ============================================================================

export const AppointmentBasicSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  descripcion: z.string().nullable().optional(),
  fecha_hora: z.string(),
  duracion: z.number().optional(),
  estado: AppointmentEstadoSchema,
  ubicacion: z.string().nullable().optional(),
  contacto_id: z.number().nullable().optional(),
  team_humano_id: z.number().nullable().optional()
});

// ============================================================================
// TAREA SCHEMA (para outputs)
// ============================================================================

export const TaskBasicSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  descripcion: z.string().nullable().optional(),
  estado: TaskEstadoSchema,
  prioridad: TaskPrioridadSchema,
  fecha_vencimiento: z.string().nullable().optional(),
  asignado_a: z.number().nullable().optional(),
  contacto_id: z.number().nullable().optional(),
  created_at: z.string().optional()
});

// ============================================================================
// TEAM MEMBER SCHEMA (para outputs)
// ============================================================================

export const TeamMemberBasicSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  apellido: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  rol: TeamRolSchema.optional(),
  is_active: z.boolean().optional(),
  especialidad: z.string().nullable().optional()
});

// ============================================================================
// NOTA SCHEMA (para outputs)
// ============================================================================

export const NoteBasicSchema = z.object({
  id: z.number(),
  titulo: z.string().nullable().optional(),
  descripcion: z.string(),
  etiquetas: z.array(z.string()).optional(),
  es_fijado: z.boolean().optional(),
  created_at: z.string()
});

// ============================================================================
// CONVERSACIÓN SCHEMA (para outputs)
// ============================================================================

export const ConversationBasicSchema = z.object({
  id: z.number(),
  fecha_inicio: z.string(),
  status: ConversationStatusSchema.optional(),
  resumen: z.string().nullable().optional(),
  contacto_id: z.number().nullable().optional()
});

// ============================================================================
// FUNNEL SCHEMA (para outputs)
// ============================================================================

export const FunnelStageSchema = z.object({
  id: z.number(),
  nombre_etapa: z.string(),
  descripcion: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  orden_etapa: z.number()
});

export const FunnelStatsSchema = FunnelStageSchema.extend({
  contactCount: z.number()
});

// ============================================================================
// METRICS SCHEMA (para outputs)
// ============================================================================

export const MetricsSchema = z.object({
  totalContacts: z.number(),
  newContacts: z.number(),
  totalAppointments: z.number(),
  completedAppointments: z.number(),
  activeConversations: z.number(),
  conversionRate: z.number()
});
