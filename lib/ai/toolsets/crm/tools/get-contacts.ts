/**
 * Get Contacts Tool
 * 
 * Buscar y obtener contactos del CRM.
 * 
 * @module lib/ai/toolsets/crm/tools/get-contacts
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';
import { 
  LimitSchema, 
  ContactEstadoSchema, 
  ContactCalificacionSchema,
  ContactOrderBySchema 
} from '../../schemas';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const GetContactsInputSchema = z.object({
  search: z.string()
    .optional()
    .describe('Término de búsqueda (nombre, teléfono, email)'),
  
  estado: ContactEstadoSchema
    .optional()
    .describe('Estado del contacto'),
  
  es_calificado: ContactCalificacionSchema
    .optional()
    .describe('Si el contacto está calificado'),
  
  is_active: z.boolean()
    .optional()
    .describe('Si el contacto está activo (no pausado)'),
  
  etapa_embudo_id: z.number()
    .optional()
    .describe('ID de la etapa del embudo de ventas'),
  
  asesor_id: z.number()
    .optional()
    .describe('ID del asesor asignado (team_humano_id)'),
  
  limit: z.number().int().min(1).max(100).optional()
    .describe('Número máximo de contactos a retornar (default: 10, max: 100)'),
  
  order_by: ContactOrderBySchema
    .optional()
    .describe('Campo para ordenar resultados')
});

export type GetContactsInput = z.infer<typeof GetContactsInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const GetContactsOutputSchema = z.object({
  contacts: z.array(z.object({
    id: z.number(),
    nombre: z.string(),
    apellido: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    estado: z.string().nullable().optional(),
    es_calificado: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    etapa_embudo: z.number().nullable().optional(),
    created_at: z.string().optional(),
    ultima_interaccion: z.string().nullable().optional()
  })),
  count: z.number(),
  message: z.string()
});

export type GetContactsOutput = z.infer<typeof GetContactsOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getContactsTool: BaseTool<GetContactsInput, GetContactsOutput> = {
  name: 'get_contacts',
  description: 'Buscar y obtener contactos del CRM. Puede filtrar por nombre, teléfono, email, estado, calificación, asesor asignado o etapa del embudo. Útil para encontrar clientes específicos o listar contactos con ciertos criterios.',
  category: 'crm',
  readOnly: true,
  tags: ['contacts', 'search', 'crm'],
  
  inputSchema: GetContactsInputSchema,
  outputSchema: GetContactsOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetContactsOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const limit = Math.min(input.limit || 10, 100);
      
      let query = supabase
        .from('wp_contactos')
        .select(`
          id,
          nombre,
          apellido,
          telefono,
          email,
          estado,
          es_calificado,
          is_active,
          etapa_embudo,
          created_at,
          ultima_interaccion
        `)
        .eq('empresa_id', context.enterpriseId);

      // Aplicar filtros
      if (input.search) {
        const searchTerm = `%${input.search}%`;
        query = query.or(`nombre.ilike.${searchTerm},apellido.ilike.${searchTerm},telefono.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }
      
      if (input.estado) {
        query = query.eq('estado', input.estado);
      }
      
      if (input.es_calificado) {
        query = query.eq('es_calificado', input.es_calificado);
      }
      
      if (input.is_active !== undefined) {
        query = query.eq('is_active', input.is_active);
      }
      
      if (input.etapa_embudo_id) {
        query = query.eq('etapa_embudo', input.etapa_embudo_id);
      }
      
      if (input.asesor_id) {
        query = query.eq('team_humano_id', input.asesor_id);
      }

      // Ordenar
      switch (input.order_by) {
        case 'nombre':
          query = query.order('nombre', { ascending: true });
          break;
        case 'created_at':
          query = query.order('created_at', { ascending: false });
          break;
        case 'ultima_interaccion':
          query = query.order('ultima_interaccion', { ascending: false, nullsFirst: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      query = query.limit(limit);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error fetching contacts:', error);
        return { 
          success: false, 
          error: `Error al buscar contactos: ${error.message}` 
        };
      }

      const contacts = data || [];
      const durationMs = Date.now() - startTime;

      return {
        success: true,
        data: {
          contacts,
          count: contacts.length,
          message: contacts.length 
            ? `Encontré ${contacts.length} contacto(s)` 
            : 'No se encontraron contactos con esos criterios'
        },
        metadata: {
          durationMs,
          dbQueriesCount: 1
        }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_contacts:', err);
      return { 
        success: false, 
        error: err.message || 'Error desconocido' 
      };
    }
  }
};
