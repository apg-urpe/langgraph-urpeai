/**
 * Get Team Config Tool
 * 
 * Equipo, roles y configuración del sistema.
 * 
 * @module lib/ai/toolsets/team/tools/get-team-config
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

export const GetTeamConfigInputSchema = z.object({
  view: z.enum(['members', 'funnel_stages', 'availability', 'roles'])
    .optional()
    .describe('Tipo de información: members=equipo, funnel_stages=etapas embudo, availability=disponibilidad, roles=roles (default: members)'),
  
  only_active: z.boolean()
    .optional()
    .describe('Solo miembros activos (default: true)')
});

export type GetTeamConfigInput = z.infer<typeof GetTeamConfigInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const GetTeamConfigOutputSchema = z.object({
  team_members: z.array(z.object({
    id: z.number(),
    nombre: z.string(),
    apellido: z.string().nullable(),
    email: z.string().nullable(),
    rol: z.string().nullable(),
    is_active: z.boolean(),
    acepta_citas: z.boolean().nullable(),
    especialidad: z.string().nullable()
  })).optional(),
  funnel_stages: z.array(z.object({
    id: z.number(),
    nombre_etapa: z.string(),
    color: z.string().nullable(),
    orden: z.number().nullable()
  })).optional(),
  roles: z.array(z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable()
  })).optional(),
  message: z.string()
});

export type GetTeamConfigOutput = z.infer<typeof GetTeamConfigOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getTeamConfigTool: BaseTool<GetTeamConfigInput, GetTeamConfigOutput> = {
  name: 'get_team_config',
  description: `👥 EQUIPO Y CONFIGURACIÓN

USAR para información del equipo, roles, configuración del sistema.

EJEMPLOS:
- "¿Quiénes son los asesores?" → get_team_config(view: "members")
- "Etapas del embudo" → get_team_config(view: "funnel_stages")
- "Roles del sistema" → get_team_config(view: "roles")`,
  
  category: 'team',
  readOnly: true,
  tags: ['team', 'config', 'members'],
  
  inputSchema: GetTeamConfigInputSchema,
  outputSchema: GetTeamConfigOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetTeamConfigOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const view = input.view ?? 'members';
      const only_active = input.only_active ?? true;
      
      const result: GetTeamConfigOutput = {
        message: ''
      };
      
      if (view === 'members' || view === 'availability') {
        let query = supabase
          .from('wp_team_humano')
          .select('id, nombre, apellido, email, rol, is_active, acepta_citas, especialidad, disponibilidad')
          .eq('empresa_id', context.enterpriseId);
        
        if (only_active) {
          query = query.eq('is_active', true);
        }
        
        query = query.order('nombre', { ascending: true });
        
        const { data, error } = await query;
        
        if (error) {
          return { success: false, error: `Error obteniendo equipo: ${error.message}` };
        }
        
        result.team_members = (data || []).map((m: any) => ({
          id: m.id,
          nombre: m.nombre,
          apellido: m.apellido,
          email: m.email,
          rol: m.rol,
          is_active: m.is_active,
          acepta_citas: m.acepta_citas,
          especialidad: m.especialidad
        }));
        
        result.message = `Equipo: ${result.team_members.length} miembro(s)${only_active ? ' activos' : ''}`;
      }
      
      if (view === 'funnel_stages') {
        const { data, error } = await supabase
          .from('wp_empresa_embudo')
          .select('id, nombre_etapa, descripcion, orden_etapa')
          .eq('empresa_id', context.enterpriseId)
          .order('orden_etapa', { ascending: true });
        
        if (error) {
          return { success: false, error: `Error obteniendo etapas: ${error.message}` };
        }
        
        result.funnel_stages = (data || []).map((stage: any) => ({
          id: stage.id,
          nombre_etapa: stage.nombre_etapa,
          color: extractFunnelColor(stage.descripcion),
          orden: stage.orden_etapa
        }));
        result.message = `Embudo configurado con ${result.funnel_stages.length} etapas`;
      }
      
      if (view === 'roles') {
        const { data, error } = await supabase
          .from('system_roles')
          .select('id, name, description')
          .or(`enterprise_id.is.null,enterprise_id.eq.${context.enterpriseId}`)
          .order('id', { ascending: true });
        
        if (error) {
          return { success: false, error: `Error obteniendo roles: ${error.message}` };
        }
        
        result.roles = data || [];
        result.message = `${result.roles.length} roles disponibles`;
      }
      
      const durationMs = Date.now() - startTime;
      
      return {
        success: true,
        data: result,
        metadata: { durationMs, dbQueriesCount: 1 }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_team_config:', err);
      return { success: false, error: err.message };
    }
  }
};
