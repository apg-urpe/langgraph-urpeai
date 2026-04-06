/**
 * Search CRM Tool
 * 
 * Búsqueda universal en el CRM: contactos, mensajes, notas.
 * HERRAMIENTA PRINCIPAL - Usar primero para cualquier búsqueda.
 * 
 * @module lib/ai/toolsets/crm/tools/search-crm
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const SearchCrmInputSchema = z.object({
  query: z.string()
    .min(1)
    .describe('Texto a buscar (nombre, teléfono, email, contenido de mensaje)'),
  
  scope: z.enum(['all', 'contacts', 'messages', 'notes'])
    .optional()
    .describe('Dónde buscar: all=todo, contacts=solo contactos, messages=mensajes, notes=notas (default: all)'),
  
  filter: z.enum(['none', 'created_today', 'active_week', 'hot_leads', 'no_response'])
    .optional()
    .describe('Filtro rápido adicional (default: none)'),
  
  include_inactive: z.boolean()
    .optional()
    .describe('Incluir contactos inactivos/pausados (default: false)'),
  
  limit: z.number().int().min(1).max(30)
    .optional()
    .describe('Máximo de resultados (default: 10, max: 30)')
});

export type SearchCrmInput = z.infer<typeof SearchCrmInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const ContactResultSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  apellido: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  es_calificado: z.string().nullable().optional(),
  ultima_interaccion: z.string().nullable().optional(),
  match_source: z.string().optional() // Indica dónde se encontró el match
});

export const SearchCrmOutputSchema = z.object({
  results: z.array(ContactResultSchema),
  count: z.number(),
  query: z.string(),
  scope: z.string(),
  message: z.string(),
  warnings: z.array(z.string()).optional()
});

export type SearchCrmOutput = z.infer<typeof SearchCrmOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const searchCrmTool: BaseTool<SearchCrmInput, SearchCrmOutput> = {
  name: 'search_crm',
  description: `🔍 BÚSQUEDA UNIVERSAL EN EL CRM

USAR SIEMPRE PRIMERO para encontrar contactos o información.

EJEMPLOS:
- "Busca a Juan" → search_crm(query: "Juan")
- "Contactos nuevos de hoy" → search_crm(filter: "created_today")
- "Quién habló de precios" → search_crm(query: "precios", scope: "messages")
- "Contactos sin respuesta" → search_crm(filter: "no_response")

RETORNA lista de contactos con contexto básico. Si necesitas más detalles de UN contacto específico, usa get_contact_360 después.`,
  
  category: 'crm',
  readOnly: true,
  tags: ['search', 'contacts', 'universal'],
  
  inputSchema: SearchCrmInputSchema,
  outputSchema: SearchCrmOutputSchema,
  
  async execute(input, context): Promise<ToolResult<SearchCrmOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const { query } = input;
      const scope = input.scope ?? 'all';
      const filter = input.filter ?? 'none';
      const include_inactive = input.include_inactive ?? false;
      const limit = input.limit ?? 10;
      const searchTerm = query.trim();
      const results: z.infer<typeof ContactResultSchema>[] = [];
      const seenIds = new Set<number>();
      
      // Helper para añadir resultados sin duplicados
      const addResult = (contact: any, matchSource: string) => {
        if (!seenIds.has(contact.id)) {
          seenIds.add(contact.id);
          results.push({
            id: contact.id,
            nombre: contact.nombre,
            apellido: contact.apellido,
            telefono: contact.telefono,
            email: contact.email,
            estado: contact.estado,
            es_calificado: contact.es_calificado,
            ultima_interaccion: contact.ultima_interaccion,
            match_source: matchSource
          });
        }
      };

      // ========================================
      // 1. Búsqueda en Contactos
      // ========================================
      if (scope === 'all' || scope === 'contacts') {
        let contactQuery = supabase
          .from('wp_contactos')
          .select('id, nombre, apellido, telefono, email, estado, es_calificado, ultima_interaccion, created_at, is_active')
          .eq('empresa_id', context.enterpriseId);
        
        // Filtro de activos
        if (!include_inactive) {
          contactQuery = contactQuery.eq('is_active', true);
        }
        
        // Búsqueda por texto
        const likeTerm = `%${searchTerm}%`;
        contactQuery = contactQuery.or(
          `nombre.ilike.${likeTerm},apellido.ilike.${likeTerm},telefono.ilike.${likeTerm},email.ilike.${likeTerm}`
        );
        
        // Filtros rápidos
        if (filter === 'created_today') {
          const today = new Date().toISOString().split('T')[0];
          contactQuery = contactQuery.gte('created_at', today);
        } else if (filter === 'active_week') {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          contactQuery = contactQuery.gte('ultima_interaccion', weekAgo);
        } else if (filter === 'hot_leads') {
          contactQuery = contactQuery.eq('es_calificado', 'si');
        } else if (filter === 'no_response') {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
          contactQuery = contactQuery.lte('ultima_interaccion', threeDaysAgo);
        }
        
        contactQuery = contactQuery
          .order('ultima_interaccion', { ascending: false, nullsFirst: false })
          .limit(limit);
        
        const { data: contacts, error } = await contactQuery;
        
        if (error) {
          logger.error('Error searching contacts:', error);
        } else if (contacts) {
          contacts.forEach(c => addResult(c, 'contact'));
        }
      }

      // ========================================
      // 2. Búsqueda en Mensajes
      // ========================================
      if ((scope === 'all' || scope === 'messages') && results.length < limit) {
        const remaining = limit - results.length;
        
        // Buscar en mensajes y obtener el contacto relacionado
        const { data: messages, error } = await supabase
          .from('wp_mensajes')
          .select(`
            id,
            contenido,
            conversacion_id,
            wp_conversaciones!inner(
              contacto_id,
              wp_contactos!inner(
                id, nombre, apellido, telefono, email, estado, es_calificado, ultima_interaccion, empresa_id
              )
            )
          `)
          .eq('wp_conversaciones.wp_contactos.empresa_id', context.enterpriseId)
          .ilike('contenido', `%${searchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(remaining * 2); // Multiplicamos porque puede haber duplicados
        
        if (error) {
          logger.warn('Error searching messages:', error.message);
        } else if (messages) {
          for (const msg of messages) {
            const conv = msg.wp_conversaciones as any;
            if (conv?.wp_contactos) {
              addResult(conv.wp_contactos, 'message');
              if (results.length >= limit) break;
            }
          }
        }
      }

      // ========================================
      // 3. Búsqueda en Notas
      // ========================================
      if ((scope === 'all' || scope === 'notes') && results.length < limit) {
        const remaining = limit - results.length;
        
        const { data: notes, error } = await supabase
          .from('wp_contactos_nota')
          .select(`
            id,
            descripcion,
            titulo,
            contacto_id,
            wp_contactos!inner(
              id, nombre, apellido, telefono, email, estado, es_calificado, ultima_interaccion, empresa_id
            )
          `)
          .eq('wp_contactos.empresa_id', context.enterpriseId)
          .neq('visible_ia', false) // Solo notas visibles para IA
          .or(`descripcion.ilike.%${searchTerm}%,titulo.ilike.%${searchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(remaining * 2);
        
        if (error) {
          logger.warn('Error searching notes:', error.message);
        } else if (notes) {
          for (const note of notes) {
            const contact = note.wp_contactos as any;
            if (contact) {
              addResult(contact, 'note');
              if (results.length >= limit) break;
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;
      
      // Warnings para detección de anomalías
      const warnings: string[] = [];
      if (results.length === 0) {
        warnings.push(`No se encontraron contactos para "${searchTerm}" - verifica la ortografía o amplía la búsqueda`);
      }
      
      return {
        success: true,
        data: {
          results: results.slice(0, limit),
          count: results.length,
          query: searchTerm,
          scope: scope || 'all',
          message: results.length 
            ? `Encontré ${results.length} contacto(s) para "${searchTerm}"`
            : `No encontré resultados para "${searchTerm}"`,
          warnings: warnings.length > 0 ? warnings : undefined
        },
        metadata: {
          durationMs,
          dbQueriesCount: scope === 'all' ? 3 : 1
        }
      };
      
    } catch (err: any) {
      logger.error('Exception in search_crm:', err);
      return { 
        success: false, 
        error: err.message || 'Error desconocido en búsqueda' 
      };
    }
  }
};
