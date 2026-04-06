/**
 * Get Agenda Tool
 * 
 * Citas, disponibilidad y calendario.
 * 
 * @module lib/ai/toolsets/calendar/tools/get-agenda
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const GetAgendaInputSchema = z.object({
  view: z.enum(['today', 'tomorrow', 'week', 'month', 'all'])
    .optional()
    .describe('Período de tiempo a consultar (default: week)'),
  
  contact_id: z.number()
    .optional()
    .describe('Filtrar citas de un contacto específico'),
  
  asesor_id: z.number()
    .optional()
    .describe('Filtrar citas de un asesor específico'),
  
  estado: z.enum(['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'])
    .optional()
    .describe('Filtrar por estado de la cita'),
  
  only_upcoming: z.boolean()
    .optional()
    .describe('Solo citas futuras (default: true)'),
  
  limit: z.number().int().min(1).max(50)
    .optional()
    .describe('Máximo de citas a retornar (default: 20)')
});

export type GetAgendaInput = z.infer<typeof GetAgendaInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const GetAgendaOutputSchema = z.object({
  appointments: z.array(z.object({
    id: z.number(),
    titulo: z.string().nullable(),
    fecha_hora: z.string(),
    estado: z.string().nullable(),
    duracion: z.number().nullable(),
    contact: z.object({
      id: z.number(),
      nombre: z.string(),
      telefono: z.string().nullable()
    }).nullable(),
    asesor: z.object({
      id: z.number(),
      nombre: z.string()
    }).nullable(),
    notas: z.string().nullable()
  })),
  count: z.number(),
  period: z.string(),
  message: z.string(),
  warnings: z.array(z.string()).optional()
});

export type GetAgendaOutput = z.infer<typeof GetAgendaOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getAgendaTool: BaseTool<GetAgendaInput, GetAgendaOutput> = {
  name: 'get_agenda',
  description: `📅 CITAS Y CALENDARIO

USAR para preguntas sobre citas, agenda, disponibilidad.

EJEMPLOS:
- "¿Qué citas tengo hoy?" → get_agenda(view: "today")
- "Citas de la semana" → get_agenda(view: "week")
- "Citas de Juan Pérez" → get_agenda(contact_id: 123)
- "Citas pendientes" → get_agenda(estado: "pendiente")
- "Historial de citas" → get_agenda(only_upcoming: false)`,
  
  category: 'calendar',
  readOnly: true,
  tags: ['appointments', 'calendar', 'agenda'],
  
  inputSchema: GetAgendaInputSchema,
  outputSchema: GetAgendaOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetAgendaOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const { contact_id, asesor_id, estado } = input;
      const view = input.view ?? 'week';
      const only_upcoming = input.only_upcoming ?? true;
      const limit = input.limit ?? 20;
      const now = new Date();
      
      let query = supabase
        .from('wp_citas')
        .select(`
          id, titulo, fecha_hora, estado, duracion, notas,
          wp_contactos!inner(id, nombre, telefono, empresa_id),
          wp_team_humano!team_humano_id(id, nombre)
        `)
        .eq('wp_contactos.empresa_id', context.enterpriseId);
      
      // Filtros de período
      if (only_upcoming) {
        query = query.gte('fecha_hora', now.toISOString());
      }
      
      if (view === 'today') {
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('fecha_hora', endOfDay.toISOString());
        if (!only_upcoming) {
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          query = query.gte('fecha_hora', startOfDay.toISOString());
        }
      } else if (view === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const endOfTomorrow = new Date(tomorrow);
        endOfTomorrow.setHours(23, 59, 59, 999);
        query = query.gte('fecha_hora', tomorrow.toISOString()).lte('fecha_hora', endOfTomorrow.toISOString());
      } else if (view === 'week') {
        const endOfWeek = new Date(now);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        query = query.lte('fecha_hora', endOfWeek.toISOString());
      } else if (view === 'month') {
        const endOfMonth = new Date(now);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);
        query = query.lte('fecha_hora', endOfMonth.toISOString());
      }
      
      // Filtros adicionales
      if (contact_id) {
        query = query.eq('contacto_id', contact_id);
      }
      
      if (asesor_id) {
        query = query.eq('team_humano_id', asesor_id);
      }
      
      if (estado) {
        query = query.eq('estado', estado);
      }
      
      query = query
        .order('fecha_hora', { ascending: true })
        .limit(limit || 20);
      
      const { data, error } = await query;
      
      if (error) {
        logger.error('Error fetching agenda:', error);
        return { success: false, error: `Error al obtener agenda: ${error.message}` };
      }
      
      const appointments = (data || []).map((apt: any) => ({
        id: apt.id,
        titulo: apt.titulo,
        fecha_hora: apt.fecha_hora,
        estado: apt.estado,
        duracion: apt.duracion,
        contact: apt.wp_contactos ? {
          id: apt.wp_contactos.id,
          nombre: apt.wp_contactos.nombre,
          telefono: apt.wp_contactos.telefono
        } : null,
        asesor: apt.wp_team_humano ? {
          id: apt.wp_team_humano.id,
          nombre: apt.wp_team_humano.nombre
        } : null,
        notas: apt.notas
      }));
      
      const periodLabels: Record<string, string> = {
        today: 'hoy',
        tomorrow: 'mañana',
        week: 'esta semana',
        month: 'este mes',
        all: 'todas'
      };
      
      const durationMs = Date.now() - startTime;
      
      // Warnings para detección de anomalías
      const warnings: string[] = [];
      if (appointments.length === 0) {
        if (contact_id) {
          warnings.push('Este contacto no tiene citas programadas');
        } else if (view === 'today') {
          warnings.push('No hay citas programadas para hoy');
        } else {
          warnings.push(`No hay citas programadas ${periodLabels[view || 'week']}`);
        }
      }
      
      return {
        success: true,
        data: {
          appointments,
          count: appointments.length,
          period: periodLabels[view || 'week'],
          message: appointments.length 
            ? `Tienes ${appointments.length} cita(s) ${periodLabels[view || 'week']}`
            : `No hay citas programadas ${periodLabels[view || 'week']}`,
          warnings: warnings.length > 0 ? warnings : undefined
        },
        metadata: { durationMs, dbQueriesCount: 1 }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_agenda:', err);
      return { success: false, error: err.message };
    }
  }
};
