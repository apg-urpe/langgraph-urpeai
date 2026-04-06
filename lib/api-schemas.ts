/**
 * API Request/Response Validation Schemas
 * 
 * Propósito:
 * - Validación de payloads entrantes en API routes
 * - Prevención de inyecciones y datos malformados
 * - Tipado seguro para requests/responses
 * - Documentación implícita de contratos de API
 * 
 * Uso en API routes:
 * ```typescript
 * import { MonicaRequestSchema } from '@/lib/api-schemas';
 * 
 * const body = await req.json();
 * const validated = MonicaRequestSchema.parse(body);
 * ```
 */

import { z } from 'zod';

// ============================================
// MONICA AI API SCHEMAS
// ============================================

export const MonicaMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty')
});

export const MonicaContextSchema = z.object({
  contacto: z.object({
    id: z.number().optional(),
    nombre: z.string().optional(),
    apellido: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    estado: z.string().optional(),
    origen: z.string().optional(),
    es_calificado: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
  }).optional(),
  conversaciones: z.array(z.object({
    id: z.number(),
    fecha: z.string(),
    mensajes_count: z.number().optional()
  })).optional(),
  citas: z.array(z.object({
    id: z.number(),
    fecha: z.string(),
    estado: z.string().optional(),
    notas: z.string().optional()
  })).optional(),
  notas: z.array(z.object({
    id: z.number(),
    descripcion: z.string(),
    created_at: z.string()
  })).optional(),
  tareas: z.array(z.object({
    id: z.number(),
    titulo: z.string(),
    estado: z.string(),
    prioridad: z.string().optional()
  })).optional()
}).optional();

export const MonicaRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  contactId: z.number().positive('Contact ID is required'),
  context: MonicaContextSchema,
  history: z.array(MonicaMessageSchema).max(50, 'History too long').optional()
});

export const MonicaResponseSchema = z.object({
  text: z.string(),
  error: z.string().optional()
});

// ============================================
// TASK SUGGESTION API SCHEMAS
// ============================================

export const TaskSuggestionRequestSchema = z.object({
  contactId: z.number().positive('Contact ID must be positive'),
  empresaId: z.number().positive('Empresa ID must be positive'),
  context: z.object({
    nombre: z.string().optional(),
    estado: z.string().optional(),
    ultima_interaccion: z.string().optional(),
    conversaciones_count: z.number().optional(),
    citas_count: z.number().optional(),
    notas_recientes: z.array(z.string()).optional()
  }).optional()
});

export const TaskSuggestionResponseSchema = z.object({
  suggestions: z.array(z.object({
    titulo: z.string(),
    descripcion: z.string().optional(),
    prioridad: z.enum(['baja', 'media', 'alta', 'urgente']),
    tipo: z.string().optional()
  })),
  error: z.string().optional()
});

// ============================================
// NYLAS EVENTS API SCHEMAS
// ============================================

export const NylasEventRequestSchema = z.object({
  title: z.string().min(1, 'Event title is required'),
  description: z.string().optional(),
  start_time: z.number().positive('Start time must be a valid Unix timestamp'),
  end_time: z.number().positive('End time must be a valid Unix timestamp'),
  participants: z.array(z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().optional()
  })).optional(),
  location: z.string().optional(),
  calendar_id: z.string().optional()
}).refine(
  (data) => data.end_time > data.start_time,
  { message: 'End time must be after start time' }
);

export const NylasEventResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  start_time: z.number(),
  end_time: z.number(),
  status: z.string(),
  error: z.string().optional()
});

// ============================================
// CONTACT API SCHEMAS
// ============================================

export const CreateContactRequestSchema = z.object({
  nombre: z.string().min(1, 'Nombre is required'),
  apellido: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  estado: z.string().optional(),
  origen: z.string().optional(),
  empresa_id: z.number().positive('Empresa ID is required'),
  team_humano_id: z.number().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const UpdateContactRequestSchema = CreateContactRequestSchema.partial().extend({
  id: z.number().positive('Contact ID is required')
});

// ============================================
// APPOINTMENT API SCHEMAS
// ============================================

export const CreateAppointmentRequestSchema = z.object({
  contacto_id: z.number().positive('Contact ID is required'),
  empresa_id: z.number().positive('Empresa ID is required'),
  fecha: z.string().datetime('Invalid datetime format'),
  duracion_minutos: z.number().positive().optional(),
  tipo: z.string().optional(),
  estado: z.enum(['pendiente', 'confirmada', 'completada', 'cancelada']).optional(),
  notas: z.string().optional(),
  ubicacion: z.string().optional(),
  team_humano_id: z.number().optional()
});

export const UpdateAppointmentRequestSchema = CreateAppointmentRequestSchema.partial().extend({
  id: z.number().positive('Appointment ID is required')
});

// ============================================
// MARKETING CAMPAIGN API SCHEMAS
// ============================================

export const CreateCampaignRequestSchema = z.object({
  nombre: z.string().min(1, 'Campaign name is required'),
  descripcion: z.string().optional(),
  empresa_id: z.number().positive('Empresa ID is required'),
  cadencia_dias: z.number().positive('Cadencia must be positive').optional(),
  total_toques: z.number().positive('Total toques must be positive').optional(),
  estado: z.enum(['borrador', 'activa', 'pausada', 'archivada']).optional(),
  instrucciones_ai: z.string().optional()
});

export const EnrollContactsRequestSchema = z.object({
  campana_id: z.number().positive('Campaign ID is required'),
  contacto_ids: z.array(z.number().positive()).min(1, 'At least one contact required')
});

// ============================================
// TASK API SCHEMAS
// ============================================

export const CreateTaskRequestSchema = z.object({
  titulo: z.string().min(1, 'Task title is required'),
  descripcion: z.string().optional(),
  empresa_id: z.number().positive('Empresa ID is required'),
  contacto_id: z.number().optional(),
  cita_id: z.number().optional(),
  conversacion_id: z.number().optional(),
  prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
  estado: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).optional(),
  fecha_vencimiento: z.string().datetime().optional(),
  asignado_a: z.number().optional()
});

export const CreateTaskItemRequestSchema = z.object({
  tarea_id: z.number().positive('Task ID is required'),
  descripcion: z.string().min(1, 'Item description is required'),
  orden: z.number().optional()
});

// ============================================
// CHAT API SCHEMAS (V2 - Anti-Error)
// ============================================

export const ChatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  attachments: z.array(z.object({
    name: z.string().optional(),
    type: z.string().optional(),
    data: z.string().optional(),
    url: z.string().optional(),
    storagePath: z.string().optional()
  }).passthrough()).optional()
});

// === MONICA FULL CONTEXT SCHEMA ===
// Schema expandido para soportar contexto completo del cliente
export const EnterpriseContextSchema = z.object({
  identity: z.object({
    nombre: z.string(),
    rubro: z.string().optional(),
    mision: z.string().optional(),
    servicios: z.string().optional(),      // Servicios de la empresa
    informacion: z.string().optional(),    // Info empresarial adicional
    // Usuario actual que hace la pregunta
    usuario: z.object({
      nombre: z.string(),
      rol: z.string().optional(),
      email: z.string().optional()
    }).optional()
  }).optional(),
  contact: z.object({
    // Datos base
    id: z.number().optional(),
    nombre: z.string().optional(),
    apellido: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().optional(),
    estado: z.string().optional(),
    es_calificado: z.string().optional(),
    origen: z.string().optional(),
    is_active: z.boolean().optional(),
    paused_until: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    created_at: z.string().optional(),
    ultima_interaccion: z.string().nullable().optional(),
    
    // Embudo con descripción
    embudo: z.object({
      etapa_id: z.number().optional(),
      nombre: z.string().optional(),
      descripcion: z.any().optional(),
      orden: z.number().optional()
    }).optional(),
    
    // Asesor asignado
    asesor: z.object({
      id: z.number(),
      nombre: z.string(),
      email: z.string().optional(),
      rol: z.string().optional()
    }).nullable().optional(),
    
    // Conversaciones con mensajes
    conversaciones: z.array(z.any()).optional(),
    
    // Citas completas
    citas: z.array(z.any()).optional(),
    
    // Transcripciones completas
    transcripciones: z.array(z.any()).optional(),
    
    // Notas completas
    notas: z.array(z.any()).optional(),
    
    // Tareas con items
    tareas: z.array(z.any()).optional(),
    
    // Cartera (servicios + pagos)
    cartera: z.object({
      resumen: z.object({
        total_contratado: z.number().optional(),
        total_pagado: z.number().optional(),
        total_pendiente: z.number().optional()
      }).optional(),
      servicios: z.array(z.any()).optional()
    }).optional(),
    
    // Fechas importantes
    fechas_importantes: z.object({
      creacion: z.string().nullable().optional(),
      ultima_interaccion: z.string().nullable().optional(),
      primera_cita: z.string().nullable().optional(),
      proxima_cita: z.string().nullable().optional(),
      ultimo_pago: z.string().nullable().optional()
    }).optional()
  }).optional()
}).optional();

export const ChatRequestSchema = z.object({
  chatInput: z.string().min(1, 'chatInput is required').optional(),
  history: z.array(ChatHistoryMessageSchema).optional().default([]),
  enterpriseContext: EnterpriseContextSchema,
  enterpriseId: z.number().optional(),
  userId: z.string().optional(),
  userRoleId: z.number().optional(),
  sessionId: z.string().optional(),
  userTimezone: z.string().optional(),
  roleId: z.string().nullish(),
  attachments: z.array(z.any()).optional()
}).refine(data => data.chatInput || (data.attachments && data.attachments.length > 0), {
  message: "Either chatInput or attachments must be provided"
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;


export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type MonicaRequest = z.infer<typeof MonicaRequestSchema>;
export type MonicaResponse = z.infer<typeof MonicaResponseSchema>;
export type TaskSuggestionRequest = z.infer<typeof TaskSuggestionRequestSchema>;
export type TaskSuggestionResponse = z.infer<typeof TaskSuggestionResponseSchema>;
export type NylasEventRequest = z.infer<typeof NylasEventRequestSchema>;
export type NylasEventResponse = z.infer<typeof NylasEventResponseSchema>;
export type CreateContactRequest = z.infer<typeof CreateContactRequestSchema>;
export type UpdateContactRequest = z.infer<typeof UpdateContactRequestSchema>;
export type CreateAppointmentRequest = z.infer<typeof CreateAppointmentRequestSchema>;
export type UpdateAppointmentRequest = z.infer<typeof UpdateAppointmentRequestSchema>;
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;
export type EnrollContactsRequest = z.infer<typeof EnrollContactsRequestSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type CreateTaskItemRequest = z.infer<typeof CreateTaskItemRequestSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Valida y parsea un request body con manejo de errores
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details: z.ZodError } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      return {
        success: false,
        error: errorMessage,
        details: error
      };
    }
    
    return {
      success: false,
      error: 'Unknown validation error',
      details: error as z.ZodError
    };
  }
}

/**
 * Middleware helper para validar requests en API routes
 */
export async function validateApiRequest<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<{ valid: true; data: T } | { valid: false; response: Response }> {
  try {
    const body = await req.json();
    const result = validateRequest(schema, body);
    
    if (!result.success) {
      return {
        valid: false,
        response: new Response(
          JSON.stringify({
            error: 'Validation error',
            message: result.error,
            details: result.details.errors
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      };
    }
    
    return { valid: true, data: result.data };
  } catch (error) {
    return {
      valid: false,
      response: new Response(
        JSON.stringify({
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    };
  }
}
