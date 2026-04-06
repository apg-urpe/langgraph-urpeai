/**
 * Get Business Metrics Tool
 * 
 * KPIs y métricas agregadas del negocio.
 * 
 * @module lib/ai/toolsets/analytics/tools/get-business-metrics
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const GetBusinessMetricsInputSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter', 'year'])
    .optional()
    .describe('Período de tiempo para las métricas (default: week)'),
  
  metric: z.enum(['all', 'conversion', 'appointments', 'messages', 'leads', 'tasks'])
    .optional()
    .describe('Tipo de métrica específica o todas (default: all)'),
  
  asesor_id: z.number()
    .optional()
    .describe('Filtrar métricas por asesor'),
  
  campaign_id: z.number()
    .optional()
    .describe('Métricas de una campaña específica')
});

export type GetBusinessMetricsInput = z.infer<typeof GetBusinessMetricsInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const GetBusinessMetricsOutputSchema = z.object({
  period: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  metrics: z.object({
    contacts: z.object({
      total: z.number(),
      new_in_period: z.number(),
      qualified: z.number(),
      conversion_rate: z.number(),
      refunds_requested: z.number().optional().describe('Contactos con estado "Rembolsos Solicitado"'),
      refunds_completed: z.number().optional().describe('Contactos con estado "Rembolso Realizado"')
    }),
    appointments: z.object({
      total: z.number(),
      completed: z.number(),
      cancelled: z.number(),
      completion_rate: z.number()
    }),
    messages: z.object({
      total: z.number(),
      inbound: z.number(),
      outbound: z.number()
    }),
    tasks: z.object({
      total: z.number(),
      completed: z.number(),
      pending: z.number(),
      completion_rate: z.number()
    }),
    campaigns: z.object({
      active: z.number(),
      total_sends: z.number(),
      open_rate: z.number()
    }).optional()
  }),
  message: z.string()
});

export type GetBusinessMetricsOutput = z.infer<typeof GetBusinessMetricsOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getBusinessMetricsTool: BaseTool<GetBusinessMetricsInput, GetBusinessMetricsOutput> = {
  name: 'get_business_metrics',
  description: `📈 MÉTRICAS Y KPIS DEL NEGOCIO

USAR para reportes, estadísticas, rendimiento.

EJEMPLOS:
- "Métricas de hoy" → get_business_metrics(period: "today")
- "¿Cómo va la conversión?" → get_business_metrics(metric: "conversion")
- "Rendimiento del mes" → get_business_metrics(period: "month")
- "Estadísticas de citas" → get_business_metrics(metric: "appointments")`,
  
  category: 'analytics',
  readOnly: true,
  tags: ['metrics', 'kpi', 'analytics'],
  
  inputSchema: GetBusinessMetricsInputSchema,
  outputSchema: GetBusinessMetricsOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetBusinessMetricsOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const period = input.period ?? 'week';
      const metric = input.metric ?? 'all';
      const { asesor_id } = input;
      
      // Calcular fechas del período
      const now = new Date();
      let periodStart: Date;
      
      switch (period) {
        case 'today':
          periodStart = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          periodStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      
      const periodStartISO = periodStart.toISOString();
      const periodEndISO = new Date().toISOString();
      
      // Queries paralelas para métricas
      const [
        contactsRes,
        newContactsRes,
        appointmentsRes,
        messagesRes,
        tasksRes,
        campaignsRes
      ] = await Promise.all([
        // Total contactos
        supabase
          .from('wp_contactos')
          .select('id, es_calificado, estado', { count: 'exact' })
          .eq('empresa_id', context.enterpriseId)
          .eq('is_active', true)
          .then(r => {
            if (asesor_id) {
              return supabase
                .from('wp_contactos')
                .select('id, es_calificado, estado', { count: 'exact' })
                .eq('empresa_id', context.enterpriseId)
                .eq('is_active', true)
                .eq('team_humano_id', asesor_id);
            }
            return r;
          }),
        
        // Nuevos contactos en período
        (() => {
          let q = supabase
            .from('wp_contactos')
            .select('id', { count: 'exact' })
            .eq('empresa_id', context.enterpriseId)
            .gte('created_at', periodStartISO);
          if (asesor_id) q = q.eq('team_humano_id', asesor_id);
          return q;
        })(),
        
        // Citas en período
        supabase
          .from('wp_citas')
          .select(`
            id, estado,
            wp_contactos!inner(empresa_id)
          `)
          .eq('wp_contactos.empresa_id', context.enterpriseId)
          .gte('fecha_hora', periodStartISO)
          .lte('fecha_hora', periodEndISO),
        
        // Mensajes en período
        supabase
          .from('wp_mensajes')
          .select(`
            id, remitente,
            wp_conversaciones!inner(
              wp_contactos!inner(empresa_id)
            )
          `)
          .eq('wp_conversaciones.wp_contactos.empresa_id', context.enterpriseId)
          .gte('created_at', periodStartISO),
        
        // Tareas
        (() => {
          let q = supabase
            .from('wp_tareas')
            .select('id, estado')
            .eq('empresa_id', context.enterpriseId);
          if (asesor_id) q = q.eq('asignado_a', asesor_id);
          return q;
        })(),
        
        // Campañas activas
        supabase
          .from('wp_email_campanas')
          .select('id')
          .eq('empresa_id', context.enterpriseId)
          .eq('estado', 'activa')
      ]);
      
      // Procesar métricas de contactos
      const contacts = contactsRes.data || [];
      const totalContacts = contacts.length;
      const qualifiedContacts = contacts.filter((c: any) => c.es_calificado === 'si').length;
      const clientContacts = contacts.filter((c: any) => c.estado === 'cliente').length;
      const refundsRequested = contacts.filter((c: any) => c.estado === 'rembolsos solicitado').length;
      const refundsCompleted = contacts.filter((c: any) => c.estado === 'rembolso realizado').length;
      const newContacts = newContactsRes.count || 0;
      
      // Procesar métricas de citas
      const appointments = appointmentsRes.data || [];
      const totalAppointments = appointments.length;
      const completedAppointments = appointments.filter((a: any) => a.estado === 'completada').length;
      const cancelledAppointments = appointments.filter((a: any) => a.estado === 'cancelada').length;
      
      // Procesar métricas de mensajes
      const messages = messagesRes.data || [];
      const totalMessages = messages.length;
      const inboundMessages = messages.filter((m: any) => m.remitente === 'cliente').length;
      const outboundMessages = messages.filter((m: any) => m.remitente !== 'cliente').length;
      
      // Procesar métricas de tareas
      const tasks = tasksRes.data || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t: any) => t.estado === 'completada').length;
      const pendingTasks = tasks.filter((t: any) => t.estado === 'pendiente' || t.estado === 'en_progreso').length;
      
      // Campañas
      const activeCampaigns = campaignsRes.data?.length || 0;
      
      // Calcular tasas
      const conversionRate = totalContacts > 0 ? Math.round((clientContacts / totalContacts) * 100) : 0;
      const appointmentCompletionRate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;
      const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      const periodLabels: Record<string, string> = {
        today: 'Hoy',
        week: 'Última semana',
        month: 'Último mes',
        quarter: 'Último trimestre',
        year: 'Último año'
      };
      
      const durationMs = Date.now() - startTime;
      
      return {
        success: true,
        data: {
          period: periodLabels[period],
          period_start: periodStartISO,
          period_end: periodEndISO,
          metrics: {
            contacts: {
              total: totalContacts,
              new_in_period: newContacts,
              qualified: qualifiedContacts,
              conversion_rate: conversionRate,
              refunds_requested: refundsRequested,
              refunds_completed: refundsCompleted
            },
            appointments: {
              total: totalAppointments,
              completed: completedAppointments,
              cancelled: cancelledAppointments,
              completion_rate: appointmentCompletionRate
            },
            messages: {
              total: totalMessages,
              inbound: inboundMessages,
              outbound: outboundMessages
            },
            tasks: {
              total: totalTasks,
              completed: completedTasks,
              pending: pendingTasks,
              completion_rate: taskCompletionRate
            },
            campaigns: {
              active: activeCampaigns,
              total_sends: 0, // TODO: Implementar
              open_rate: 0
            }
          },
          message: `Métricas del período: ${newContacts} contactos nuevos, ${totalAppointments} citas, ${conversionRate}% conversión`
        },
        metadata: { durationMs, dbQueriesCount: 6 }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_business_metrics:', err);
      return { success: false, error: err.message };
    }
  }
};
