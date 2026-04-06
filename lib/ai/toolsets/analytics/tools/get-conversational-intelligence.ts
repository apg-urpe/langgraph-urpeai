/**
 * Get Conversational Intelligence Tool
 * 
 * Analiza bloques de conversaciones con mensajes RAW para identificar 
 * patrones, métricas de calidad, puntos de abandono y tendencias.
 * 
 * Ideal para análisis cualitativo de big data conversacional.
 * 
 * @module lib/ai/toolsets/analytics/tools/get-conversational-intelligence
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const GetConversationalIntelligenceInputSchema = z.object({
  start_date: z.string()
    .describe('Fecha inicio YYYY-MM-DD (ej: 2025-01-01). REQUERIDO.'),
  
  end_date: z.string()
    .describe('Fecha fin YYYY-MM-DD (ej: 2025-01-31). REQUERIDO.'),
  
  ordenar_por: z.enum(['created_at', 'updated_at'])
    .optional()
    .describe('Campo para ordenar: created_at (fecha creación) o updated_at (última actividad). Default: updated_at'),
  
  orden: z.enum(['desc', 'asc'])
    .optional()
    .describe('Dirección: desc (recientes primero) o asc (antiguos primero). Default: desc'),
  
  limite: z.number().int().min(1).max(500)
    .optional()
    .describe('Máximo de conversaciones (1-500). Default: 100. Si necesitas más, usa ventanas de fechas.')
});

export type GetConversationalIntelligenceInput = z.infer<typeof GetConversationalIntelligenceInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const MessageSchema = z.object({
  contenido: z.string(),
  remitente: z.string(),
  timestamp: z.string()
});

const ConversationWithMessagesSchema = z.object({
  id_conversacion: z.number(),
  contacto_id: z.number().nullable(),
  telefono: z.string().nullable(),
  created_at: z.string(),
  canal: z.string().nullable(),
  estado: z.enum(['creada', 'reactivada']),
  mensajes_count: z.number(),
  mensajes: z.array(MessageSchema)
});

export const GetConversationalIntelligenceOutputSchema = z.object({
  periodo: z.object({
    fecha_inicio: z.string(),
    fecha_fin: z.string()
  }),
  metricas: z.object({
    chats_total: z.number(),
    chats_creados: z.number(),
    chats_reactivados: z.number(),
    mensajes_total: z.number(),
    mensajes_enviados: z.number(),
    mensajes_recibidos: z.number()
  }),
  muestra: z.object({
    total: z.number(),
    conversaciones: z.array(ConversationWithMessagesSchema)
  }),
  resumen_para_analisis: z.string()
});

export type GetConversationalIntelligenceOutput = z.infer<typeof GetConversationalIntelligenceOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const getConversationalIntelligenceTool: BaseTool<GetConversationalIntelligenceInput, GetConversationalIntelligenceOutput> = {
  name: 'get_conversational_intelligence',
  description: `🔬 ANÁLISIS DE CONVERSACIONES RAW - BIG DATA CUALITATIVO

Obtiene bloques de conversaciones con TODOS los mensajes para análisis profundo de patrones, tendencias y comportamientos.

📊 DATOS QUE RETORNA:
- Métricas del periodo (chats totales, creados, reactivados, mensajes)
- Conversaciones con mensajes completos
- Clasificación: conversación creada vs reactivada
- Teléfono del contacto para tracking

🎯 CUÁNDO USAR (ANÁLISIS CUALITATIVO):
- "Analiza por qué abandonan los prospectos"
- "Busca patrones en las conversaciones del mes"
- "¿Qué preguntas hacen antes de abandonar?"
- "Identifica tendencias de comunicación"
- "Evalúa la calidad de respuestas del agente"
- "Detecta objeciones comunes"

⚠️ LÍMITES:
- Máximo 500 conversaciones por llamada
- Si necesitas más datos, usa ventanas de fechas diferentes
- Para datos cuantitativos usa get_business_metrics

💡 EJEMPLO:
Para analizar enero 2025:
get_conversational_intelligence({
  start_date: "2025-01-01",
  end_date: "2025-01-31",
  limite: 200
})`,
  
  category: 'analytics',
  readOnly: true,
  tags: ['analytics', 'conversations', 'intelligence', 'quality', 'bigdata', 'qualitative'],
  
  inputSchema: GetConversationalIntelligenceInputSchema,
  outputSchema: GetConversationalIntelligenceOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetConversationalIntelligenceOutput>> {
    const { logger } = context.services;
    const startTime = Date.now();
    
    logger.info('get_conversational_intelligence called', { 
      enterpriseId: context.enterpriseId,
      start_date: input.start_date,
      end_date: input.end_date,
      limite: input.limite 
    });
    
    try {
      // Llamar a la Edge Function de Supabase
      const response = await fetch(
        'https://vecspltvmyopwbjzerow.supabase.co/functions/v1/-obtener_mensajes_conversaciones',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            empresa_id: context.enterpriseId,
            fecha_inicio: input.start_date,
            fecha_fin: input.end_date,
            ordenar_por: input.ordenar_por || 'updated_at',
            orden: input.orden || 'desc',
            limite: input.limite || 100
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Edge Function error:', { status: response.status, error: errorText });
        return { 
          success: false, 
          error: `Error en edge function (${response.status}): ${errorText.substring(0, 200)}` 
        };
      }

      const data = await response.json();
      
      // Mapear respuesta de la edge function
      // Estructura: { periodo_evaluado, metricas_periodo, muestra: { conversaciones } }
      const periodo = data.periodo_evaluado || {};
      const metricas = data.metricas_periodo || {};
      const muestra = data.muestra || {};
      const conversaciones = muestra.conversaciones || [];
      
      logger.info('Edge function response', {
        conversaciones_count: conversaciones.length,
        metricas_chats_total: metricas.chats_total
      });

      // Generar resumen para el modelo
      const totalMensajes = conversaciones.reduce(
        (sum: number, c: any) => sum + (c.mensajes_count || 0), 0
      );
      
      const canales = conversaciones.reduce((acc: Record<string, number>, c: any) => {
        const canal = c.canal || 'desconocido';
        acc[canal] = (acc[canal] || 0) + 1;
        return acc;
      }, {});
      
      const resumenParaAnalisis = `
📅 Periodo: ${input.start_date} a ${input.end_date}
📊 Métricas del periodo completo:
- Chats totales: ${metricas.chats_total || 0}
- Nuevos (creados): ${metricas.chats_creados || 0}
- Reactivados: ${metricas.chats_reactivados || 0}
- Mensajes: ${metricas.mensajes_total || 0} (enviados: ${metricas.mensajes_enviados || 0}, recibidos: ${metricas.mensajes_recibidos || 0})

📦 Muestra obtenida: ${conversaciones.length} conversaciones con ${totalMensajes} mensajes
📱 Por canal: ${Object.entries(canales).map(([k, v]) => `${k}: ${v}`).join(', ')}

🔍 Usa los mensajes de cada conversación para análisis cualitativo profundo.
`.trim();

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        data: {
          periodo: {
            fecha_inicio: periodo.fecha_inicio || input.start_date,
            fecha_fin: periodo.fecha_fin || input.end_date
          },
          metricas: {
            chats_total: metricas.chats_total || 0,
            chats_creados: metricas.chats_creados || 0,
            chats_reactivados: metricas.chats_reactivados || 0,
            mensajes_total: metricas.mensajes_total || 0,
            mensajes_enviados: metricas.mensajes_enviados || 0,
            mensajes_recibidos: metricas.mensajes_recibidos || 0
          },
          muestra: {
            total: conversaciones.length,
            conversaciones: conversaciones.map((c: any) => ({
              id_conversacion: c.id_conversacion,
              contacto_id: c.contacto_id,
              telefono: c.telefono,
              created_at: c.created_at,
              canal: c.canal,
              estado: c.estado,
              mensajes_count: c.mensajes_count || 0,
              mensajes: (c.mensajes || []).map((m: any) => ({
                contenido: m.contenido || '',
                remitente: m.remitente || 'desconocido',
                timestamp: m.timestamp || ''
              }))
            }))
          },
          resumen_para_analisis: resumenParaAnalisis
        },
        metadata: {
          durationMs,
          dbQueriesCount: 1
        }
      };
      
    } catch (err: any) {
      logger.error('Exception in get_conversational_intelligence:', err);
      return { 
        success: false, 
        error: err.message || 'Error obteniendo inteligencia conversacional' 
      };
    }
  }
};
