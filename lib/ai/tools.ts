/**
 * Monica AI Tools - Function Calling Definitions
 * 
 * ⚠️ DEPRECATED: Este archivo es LEGACY
 * Las tools ahora están definidas directamente en app/api/chat/route.ts
 * Este archivo se mantiene para compatibilidad con imports existentes.
 * 
 * TOOLS ACTUALES (en route.ts):
 * 1. searchContacts - Búsqueda de contactos
 * 2. getContactContext - Contexto completo de un contacto
 * 3. createNote - Crear nota
 * 4. countContacts - Contar contactos
 * 5. getConversationalIntelligence - Análisis de conversaciones
 * 6. webSearch - Búsqueda en internet (Firecrawl)
 * 7. webScrape - Scraping de URLs (Firecrawl)
 * 8. executePython - Ejecución de código (E2B)
 * 9. getAppointments - Citas programadas
 * 10. getTasks - Tareas del CRM
 * 11. getProjects - Proyectos
 * 12. getTeamMembers - Miembros del equipo
 * 13. getMetrics - Métricas y KPIs
 * 14. getFunnelStats - Estadísticas del embudo
 */

// Tool declaration format for Gemini Function Calling
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required?: string[];
  };
}

// All available tools for Monica - Minimalista y Robusto
export const MONICA_TOOLS: ToolDeclaration[] = [
  // ============================================
  // BÚSQUEDA AVANZADA (Lectura)
  // ============================================
  {
    name: 'search_contacts_deep',
    description: `🔎 BÚSQUEDA PROFUNDA EN CRM
    
Busca en MÚLTIPLES fuentes simultáneamente:
- Datos del contacto (nombre, teléfono, email)
- Contenido de mensajes de WhatsApp
- Metadata y campos personalizados
- Notas y resúmenes de conversaciones

CUÁNDO USAR:
- "Busca a Juan Pérez" → query: "Juan Pérez"
- "¿Quién habló de precios?" → query: "precio", scope: "messages"
- "Contactos que mencionaron descuento" → query: "descuento"

SCOPES DISPONIBLES:
- all: Busca en todas las fuentes (default)
- contacts: Solo datos de contacto
- messages: Solo contenido de mensajes
- metadata: Solo campos personalizados
- notes: Solo notas`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Término de búsqueda (nombre, palabra clave, teléfono, etc.)'
        },
        scope: {
          type: 'string',
          description: 'Alcance de búsqueda',
          enum: ['all', 'contacts', 'messages', 'metadata', 'notes']
        },
        include_inactive: {
          type: 'boolean',
          description: 'Incluir contactos inactivos (default: false)'
        },
        limit: {
          type: 'number',
          description: 'Máximo de resultados (default: 15, max: 30)'
        }
      },
      required: ['query']
    }
  },

  // ============================================
  // CONTEXTO COMPLETO 360° (Lectura)
  // ============================================
  {
    name: 'get_full_contact_context',
    description: `📋 CONTEXTO COMPLETO DE UN CONTACTO (Vista 360°)
    
Obtiene TODA la información de un contacto en una sola llamada:
- Datos personales y estado
- Conversaciones recientes
- Citas (pasadas y futuras)
- Tareas pendientes
- Notas del equipo
- Multimedia compartida
- Campañas de email inscritas
- Resumen de actividad

CUÁNDO USAR:
- "Dame el contexto de Juan" → Primero buscar ID con search_contacts_deep
- "¿Qué sabemos del contacto 123?" → contact_id: 123
- "Resumen completo del cliente" → Después de obtener el ID`,
    parameters: {
      type: 'object',
      properties: {
        contact_id: {
          type: 'number',
          description: 'ID del contacto (obtenido de search_contacts_deep)'
        }
      },
      required: ['contact_id']
    }
  },

  // ============================================
  // INTELIGENCIA CONVERSACIONAL (Lectura / Análisis)
  // ============================================
  {
    name: 'get_conversational_intelligence',
    description: `🎯 ANÁLISIS PROSPECTIVO E INTELIGENCIA CONVERSACIONAL
    
Analiza bloques de conversaciones para identificar patrones, métricas de calidad y puntos de abandono.
Usa esta herramienta para investigación cualitativa y detección de tendencias.

CUÁNDO USAR:
- "¿Por qué están abandonando los prospectos?"
- "Analiza la calidad de las conversaciones de este mes"
- "Busca patrones en los cierres de venta"
- "Compara el rendimiento de WhatsApp vs Manychat"
- "Resumen de inteligencia de las últimas 500 charlas"

LÍMITE: Máximo 500 conversaciones por llamada.`,
    parameters: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Fecha inicio YYYY-MM-DD (ej: 2025-07-01). Si no se especifica, usa hace 30 días.'
        },
        end_date: {
          type: 'string',
          description: 'Fecha fin YYYY-MM-DD (ej: 2025-07-31). Si no se especifica, usa hoy.'
        },
        incluir_metadata: {
          type: 'boolean',
          description: 'Incluir nombres de contactos y agentes (recomendado: true)'
        },
        ordenar_por: {
          type: 'string',
          description: 'Campo para ordenar',
          enum: ['fecha_inicio', 'evaluacion', 'fecha_analisis']
        },
        orden: {
          type: 'string',
          description: 'Dirección del orden',
          enum: ['desc', 'asc']
        },
        limite: {
          type: 'number',
          description: 'Máximo de registros (default: 500, max: 500)'
        },
        query: {
          type: 'string',
          description: 'Filtro SQL específico (ej: "evaluacion > 7" o "canal = \'whatsapp\'")'
        }
      },
      required: []
    }
  },

  // ============================================
  // ESCRITURA (Nota)
  // ============================================
  {
    name: 'create_note',
    description: `📝 CREAR NOTA PARA CONTACTO
    
Registra información importante en la ficha del contacto.

CUÁNDO USAR:
- "Anota que Juan llamó preguntando por el servicio X"
- "Registra que el cliente pidió cotización"
- "Guarda que mencionó que viaja en enero"`,
    parameters: {
      type: 'object',
      properties: {
        contact_id: {
          type: 'number',
          description: 'ID del contacto'
        },
        titulo: {
          type: 'string',
          description: 'Título breve de la nota (opcional)'
        },
        descripcion: {
          type: 'string',
          description: 'Contenido de la nota'
        },
        etiquetas: {
          type: 'array',
          description: 'Tags para categorizar',
          items: { type: 'string' }
        }
      },
      required: ['contact_id', 'descripcion']
    }
  }
];

// Convert to Gemini API format
export const getGeminiToolsConfig = () => ({
  functionDeclarations: MONICA_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }))
});

// Tool names for type safety
export type ToolName = typeof MONICA_TOOLS[number]['name'];
