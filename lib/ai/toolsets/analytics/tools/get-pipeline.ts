/**
 * Get Pipeline Tool
 * 
 * Estado del embudo de ventas y contactos por etapa.
 * 
 * @module lib/ai/toolsets/analytics/tools/get-pipeline
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

export const GetPipelineInputSchema = z.object({
  view: z.enum(['overview', 'by_stage', 'hot_leads', 'stale'])
    .optional()
    .describe('Tipo de vista: overview=resumen, by_stage=detalle por etapa, hot_leads=leads calientes, stale=sin actividad (default: overview)'),
  
  etapa_id: z.number()
    .optional()
    .describe('Filtrar por etapa específica del embudo'),
  
  asesor_id: z.number()
    .optional()
    .describe('Filtrar por asesor'),
  
  limit: z.number().int().min(1).max(50)
    .optional()
    .describe('Máximo de contactos por etapa (default: 20)')
});

export type GetPipelineInput = z.infer<typeof GetPipelineInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const GetPipelineOutputSchema = z.object({
  stages: z.array(z.object({
    id: z.number(),
    nombre_etapa: z.string(),
    color: z.string().nullable(),
    orden: z.number().nullable(),
    contact_count: z.number(),
    contacts: z.array(z.object({
      id: z.number(),
      nombre: z.string(),
      estado: z.string().nullable(),
      ultima_interaccion: z.string().nullable()
    })).optional()
  })),
  totals: z.object({
    total_contacts: z.number(),
    qualified_contacts: z.number(),
    active_contacts: z.number()
  }),
  message: z.string()
});

export type GetPipelineOutput = z.infer<typeof GetPipelineOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getPipelineTool: BaseTool<GetPipelineInput, GetPipelineOutput> = {
  name: 'get_pipeline',
  description: `📊 ESTADO DEL EMBUDO Y CONTACTOS POR ETAPA

USAR para ver el pipeline de ventas, contactos por etapa.

EJEMPLOS:
- "¿Cómo está el embudo?" → get_pipeline(view: "overview")
- "Contactos en negociación" → get_pipeline(etapa_id: 3)
- "Leads más calientes" → get_pipeline(view: "hot_leads")
- "Contactos sin actividad" → get_pipeline(view: "stale")`,
  
  category: 'analytics',
  readOnly: true,
  tags: ['pipeline', 'funnel', 'stages'],
  
  inputSchema: GetPipelineInputSchema,
  outputSchema: GetPipelineOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetPipelineOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const { etapa_id, asesor_id } = input;
      const view = input.view ?? 'overview';
      const limit = input.limit ?? 20;
      
      // 1. Obtener etapas del embudo
      const { data: stages, error: stagesError } = await supabase
        .from('wp_empresa_embudo')
        .select('id, nombre_etapa, descripcion, orden_etapa')
        .eq('empresa_id', context.enterpriseId)
        .order('orden_etapa', { ascending: true });
      
      if (stagesError) {
        return { success: false, error: `Error obteniendo etapas: ${stagesError.message}` };
      }
      
      // 2. Query base de contactos
      let contactsQuery = supabase
        .from('wp_contactos')
        .select('id, nombre, apellido, estado, es_calificado, is_active, etapa_embudo, ultima_interaccion, team_humano_id')
        .eq('empresa_id', context.enterpriseId)
        .eq('is_active', true);
      
      if (asesor_id) {
        contactsQuery = contactsQuery.eq('team_humano_id', asesor_id);
      }
      
      if (etapa_id) {
        contactsQuery = contactsQuery.eq('etapa_embudo', etapa_id);
      }
      
      // Filtros especiales según vista
      if (view === 'hot_leads') {
        contactsQuery = contactsQuery.eq('es_calificado', 'si');
      } else if (view === 'stale') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        contactsQuery = contactsQuery.or(`ultima_interaccion.is.null,ultima_interaccion.lt.${weekAgo}`);
      }
      
      contactsQuery = contactsQuery.order('ultima_interaccion', { ascending: false, nullsFirst: false });
      
      const { data: contacts, error: contactsError } = await contactsQuery;
      
      if (contactsError) {
        return { success: false, error: `Error obteniendo contactos: ${contactsError.message}` };
      }
      
      // 3. Agrupar contactos por etapa
      const contactsByStage = new Map<number, any[]>();
      let totalQualified = 0;
      
      for (const contact of contacts || []) {
        const stageId = contact.etapa_embudo || 0; // 0 para sin etapa
        if (!contactsByStage.has(stageId)) {
          contactsByStage.set(stageId, []);
        }
        contactsByStage.get(stageId)!.push(contact);
        
        if (contact.es_calificado === 'si') {
          totalQualified++;
        }
      }
      
      // 4. Construir resultado con etapas
      const stagesResult = (stages || []).map((stage: any) => {
        const stageContacts = contactsByStage.get(stage.id) || [];
        return {
          id: stage.id,
          nombre_etapa: stage.nombre_etapa,
          color: extractFunnelColor(stage.descripcion),
          orden: stage.orden_etapa,
          contact_count: stageContacts.length,
          contacts: view !== 'overview' ? stageContacts.slice(0, limit).map((c: any) => ({
            id: c.id,
            nombre: `${c.nombre} ${c.apellido || ''}`.trim(),
            estado: c.estado,
            ultima_interaccion: c.ultima_interaccion
          })) : undefined
        };
      });
      
      // Añadir contactos sin etapa si existen
      const noStageContacts = contactsByStage.get(0) || [];
      if (noStageContacts.length > 0) {
        stagesResult.push({
          id: 0,
          nombre_etapa: 'Sin etapa',
          color: '#6b7280',
          orden: 999,
          contact_count: noStageContacts.length,
          contacts: view !== 'overview' ? noStageContacts.slice(0, limit).map((c: any) => ({
            id: c.id,
            nombre: `${c.nombre} ${c.apellido || ''}`.trim(),
            estado: c.estado,
            ultima_interaccion: c.ultima_interaccion
          })) : undefined
        });
      }
      
      const totalContacts = contacts?.length || 0;
      const durationMs = Date.now() - startTime;
      
      return {
        success: true,
        data: {
          stages: stagesResult,
          totals: {
            total_contacts: totalContacts,
            qualified_contacts: totalQualified,
            active_contacts: contacts?.filter((c: any) => c.is_active).length || 0
          },
          message: `Embudo con ${stagesResult.length} etapas y ${totalContacts} contactos activos`
        },
        metadata: { durationMs, dbQueriesCount: 2 }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_pipeline:', err);
      return { success: false, error: err.message };
    }
  }
};
