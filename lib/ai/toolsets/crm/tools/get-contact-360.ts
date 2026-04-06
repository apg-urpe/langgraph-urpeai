/**
 * Get Contact 360 Tool
 * 
 * Vista completa de UN contacto: perfil + notas + conversaciones + citas + tareas + cartera.
 * TODO el contexto en UNA sola llamada.
 * 
 * @module lib/ai/toolsets/crm/tools/get-contact-360
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

function extractFunnelColor(descripcion: unknown): string | null {
  if (!descripcion) return null;

  let parsedValue = descripcion;
  if (typeof parsedValue === 'string') {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch {
      return null;
    }
  }

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    return null;
  }

  const color = (parsedValue as Record<string, unknown>).color;
  return typeof color === 'string' && color.trim().length > 0 ? color : null;
}

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const GetContact360InputSchema = z.object({
  contact_id: z.number()
    .describe('ID del contacto (obtenido de search_crm)')
});

export type GetContact360Input = z.infer<typeof GetContact360InputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const GetContact360OutputSchema = z.object({
  contact: z.object({
    id: z.number(),
    nombre: z.string(),
    apellido: z.string().nullable(),
    telefono: z.string().nullable(),
    email: z.string().nullable(),
    estado: z.string().nullable(),
    es_calificado: z.string().nullable(),
    origen: z.string().nullable(),
    is_active: z.boolean(),
    paused_until: z.string().nullable(),
    created_at: z.string(),
    ultima_interaccion: z.string().nullable(),
    metadata: z.any().nullable()
  }),
  funnel_stage: z.object({
    id: z.number(),
    nombre_etapa: z.string(),
    color: z.string().nullable()
  }).nullable(),
  assigned_to: z.object({
    id: z.number(),
    nombre: z.string(),
    apellido: z.string().nullable()
  }).nullable(),
  notes: z.array(z.object({
    id: z.number(),
    titulo: z.string().nullable(),
    descripcion: z.string(),
    created_at: z.string(),
    es_fijado: z.boolean().nullable()
  })),
  conversations: z.array(z.object({
    id: z.number(),
    canal: z.string().nullable(),
    status: z.string().nullable(),
    fecha_inicio: z.string().nullable(),
    resumen: z.string().nullable(),
    message_count: z.number()
  })),
  appointments: z.array(z.object({
    id: z.number(),
    titulo: z.string().nullable(),
    fecha_hora: z.string(),
    estado: z.string().nullable(),
    duracion: z.number().nullable()
  })),
  tasks: z.array(z.object({
    id: z.number(),
    titulo: z.string(),
    estado: z.string(),
    prioridad: z.number().nullable(),
    fecha_vencimiento: z.string().nullable()
  })),
  campaigns: z.array(z.object({
    id: z.number(),
    campaign_name: z.string(),
    estado: z.string()
  })),
  services: z.array(z.object({
    id: z.number(),
    nombre: z.string(),
    monto_total: z.number(),
    monto_pagado: z.number(),
    estado: z.string()
  })),
  summary: z.object({
    total_notes: z.number(),
    total_conversations: z.number(),
    total_appointments: z.number(),
    total_tasks: z.number(),
    pending_tasks: z.number(),
    active_campaigns: z.number()
  })
});

export type GetContact360Output = z.infer<typeof GetContact360OutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getContact360Tool: BaseTool<GetContact360Input, GetContact360Output> = {
  name: 'get_contact_360',
  description: `👤 CONTEXTO COMPLETO DE UN CONTACTO

USAR después de search_crm cuando necesites TODOS los detalles de UN contacto específico.
Retorna TODO el contexto en UNA sola llamada.

INCLUYE:
✅ Perfil completo (datos, estado, calificación, origen)
✅ Etapa del embudo de ventas
✅ Asesor asignado
✅ Notas del equipo (últimas 10)
✅ Conversaciones con resumen (últimas 5)
✅ Citas programadas y pasadas (últimas 10)
✅ Tareas relacionadas
✅ Campañas donde está inscrito
✅ Servicios/Cartera (finanzas)

NO NECESITAS llamar otras tools después de esta.`,
  
  category: 'crm',
  readOnly: true,
  tags: ['contact', 'details', '360', 'complete'],
  
  inputSchema: GetContact360InputSchema,
  outputSchema: GetContact360OutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetContact360Output>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const { contact_id } = input;
      
      // ========================================
      // 1. Obtener contacto con verificación de empresa
      // ========================================
      const { data: contact, error: contactError } = await supabase
        .from('wp_contactos')
        .select(`
          id, nombre, apellido, telefono, email, estado, es_calificado, origen,
          is_active, paused_until, created_at, ultima_interaccion, metadata,
          etapa_embudo, team_humano_id
        `)
        .eq('id', contact_id)
        .eq('empresa_id', context.enterpriseId)
        .single();
      
      if (contactError || !contact) {
        return {
          success: false,
          error: 'Contacto no encontrado o sin acceso'
        };
      }

      // ========================================
      // 2. Fetch paralelo de datos relacionados
      // ========================================
      const [
        funnelRes,
        teamRes,
        notesRes,
        conversationsRes,
        appointmentsRes,
        tasksRes,
        campaignsRes,
        servicesRes
      ] = await Promise.all([
        // Etapa del embudo
        contact.etapa_embudo 
          ? supabase
              .from('wp_empresa_embudo')
              .select('id, nombre_etapa, descripcion')
              .eq('id', contact.etapa_embudo)
              .eq('empresa_id', context.enterpriseId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        
        // Asesor asignado
        contact.team_humano_id
          ? supabase
              .from('wp_team_humano')
              .select('id, nombre, apellido')
              .eq('id', contact.team_humano_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
        
        // Notas (últimas 10, solo visibles para IA)
        supabase
          .from('wp_contactos_nota')
          .select('id, titulo, descripcion, created_at, es_fijado')
          .eq('contacto_id', contact_id)
          .neq('visible_ia', false) // Solo notas visibles para IA
          .order('es_fijado', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(10),
        
        // Conversaciones con conteo de mensajes (últimas 5)
        supabase
          .from('wp_conversaciones')
          .select('id, canal, status, fecha_inicio, resumen')
          .eq('contacto_id', contact_id)
          .order('fecha_inicio', { ascending: false })
          .limit(5),
        
        // Citas (próximas + últimas, total 10)
        supabase
          .from('wp_citas')
          .select('id, titulo, fecha_hora, estado, duracion')
          .eq('contacto_id', contact_id)
          .order('fecha_hora', { ascending: false })
          .limit(10),
        
        // Tareas relacionadas
        supabase
          .from('wp_tareas')
          .select('id, titulo, estado, prioridad, fecha_vencimiento')
          .eq('contacto_id', contact_id)
          .order('created_at', { ascending: false })
          .limit(10),
        
        // Campañas donde está inscrito
        supabase
          .from('wp_email_contacto_campana')
          .select(`
            id, estado,
            wp_email_campanas(nombre)
          `)
          .eq('contacto_id', contact_id)
          .limit(5),
        
        // Servicios/Cartera
        supabase
          .from('wp_crm_servicios')
          .select('id, nombre, monto_total, monto_pagado, estado')
          .eq('contacto_id', contact_id)
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      // ========================================
      // 3. Procesar conversaciones con conteo de mensajes
      // ========================================
      const conversations = (conversationsRes.data || []).map((conv: any) => ({
        id: conv.id,
        canal: conv.canal,
        status: conv.status,
        fecha_inicio: conv.fecha_inicio,
        resumen: conv.resumen,
        message_count: 0 // TODO: Podría añadirse un count si es necesario
      }));

      // ========================================
      // 4. Procesar campañas
      // ========================================
      const campaigns = (campaignsRes.data || []).map((c: any) => ({
        id: c.id,
        campaign_name: c.wp_email_campanas?.nombre || 'Sin nombre',
        estado: c.estado
      }));

      // ========================================
      // 5. Calcular resumen
      // ========================================
      const notes = notesRes.data || [];
      const appointments = appointmentsRes.data || [];
      const tasks = tasksRes.data || [];
      const services = servicesRes.data || [];

      const summary = {
        total_notes: notes.length,
        total_conversations: conversations.length,
        total_appointments: appointments.length,
        total_tasks: tasks.length,
        pending_tasks: tasks.filter((t: any) => t.estado === 'pendiente' || t.estado === 'en_progreso').length,
        active_campaigns: campaigns.filter(c => c.estado === 'activo').length
      };

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        data: {
          contact: {
            id: contact.id,
            nombre: contact.nombre,
            apellido: contact.apellido,
            telefono: contact.telefono,
            email: contact.email,
            estado: contact.estado,
            es_calificado: contact.es_calificado,
            origen: contact.origen,
            is_active: contact.is_active,
            paused_until: contact.paused_until,
            created_at: contact.created_at,
            ultima_interaccion: contact.ultima_interaccion,
            metadata: contact.metadata
          },
          funnel_stage: funnelRes.data
            ? {
                id: funnelRes.data.id,
                nombre_etapa: funnelRes.data.nombre_etapa,
                color: extractFunnelColor(funnelRes.data.descripcion)
              }
            : null,
          assigned_to: teamRes.data,
          notes: notes.map((n: any) => ({
            id: n.id,
            titulo: n.titulo,
            descripcion: n.descripcion,
            created_at: n.created_at,
            es_fijado: n.es_fijado
          })),
          conversations,
          appointments: appointments.map((a: any) => ({
            id: a.id,
            titulo: a.titulo,
            fecha_hora: a.fecha_hora,
            estado: a.estado,
            duracion: a.duracion
          })),
          tasks: tasks.map((t: any) => ({
            id: t.id,
            titulo: t.titulo,
            estado: t.estado,
            prioridad: t.prioridad,
            fecha_vencimiento: t.fecha_vencimiento
          })),
          campaigns,
          services: services.map((s: any) => ({
            id: s.id,
            nombre: s.nombre,
            monto_total: s.monto_total,
            monto_pagado: s.monto_pagado,
            estado: s.estado
          })),
          summary
        },
        metadata: {
          durationMs,
          dbQueriesCount: 8
        }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_contact_360:', err);
      return { 
        success: false, 
        error: err.message || 'Error obteniendo contexto del contacto' 
      };
    }
  }
};
