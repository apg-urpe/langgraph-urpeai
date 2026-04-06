/**
 * Web Search Tool
 * 
 * Búsqueda en internet con scraping opcional de resultados.
 * 
 * @module lib/ai/toolsets/firecrawl/tools/web-search
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const WebSearchInputSchema = z.object({
  query: z.string()
    .min(2, 'La búsqueda debe tener al menos 2 caracteres')
    .describe('Término de búsqueda en internet'),
  
  limit: z.number().int().min(1).max(10)
    .optional()
    .describe('Número máximo de resultados (default: 5, max: 10)'),
  
  scrapeResults: z.boolean()
    .optional()
    .describe('Extraer contenido de los resultados (default: false, más lento pero más información)')
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
  content: z.string().optional() // Solo si scrapeResults=true
});

export const WebSearchOutputSchema = z.object({
  results: z.array(SearchResultSchema),
  count: z.number(),
  query: z.string(),
  scraped: z.boolean()
});

export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

// ============================================================================
// FIRECRAWL API CONFIG
// ============================================================================

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const webSearchTool: BaseTool<WebSearchInput, WebSearchOutput> = {
  name: 'web_search',
  description: `🔎 BÚSQUEDA EN INTERNET

Busca información en la web y opcionalmente extrae el contenido de los resultados.

USAR CUANDO:
- "Busca en internet sobre [tema]"
- "Qué se dice en la web de [empresa]"
- "Investiga [tema] online"
- "Encuentra información sobre [producto/servicio]"

EJEMPLOS:
- web_search(query: "mejores prácticas CRM 2024")
- web_search(query: "Urpe AI Lab opiniones", limit: 5)
- web_search(query: "competidores de [empresa]", scrapeResults: true)

RETORNA: Lista de resultados con título, URL, descripción y opcionalmente contenido.

💡 TIPS:
- Sin scrapeResults: Rápido, retorna solo títulos/descripciones
- Con scrapeResults: Más lento, pero obtiene el contenido completo`,
  
  category: 'lab',
  readOnly: true,
  tags: ['web', 'search', 'firecrawl', 'internet', 'research'],
  
  inputSchema: WebSearchInputSchema,
  outputSchema: WebSearchOutputSchema,
  
  async execute(input, context): Promise<ToolResult<WebSearchOutput>> {
    const { logger } = context.services;
    const startTime = Date.now();
    
    try {
      if (!FIRECRAWL_API_KEY) {
        return {
          success: false,
          error: 'Firecrawl API key no configurada. Contacta al administrador.'
        };
      }

      const { query, limit = 5, scrapeResults = false } = input;
      
      logger.info('[Tool:web_search] Executing', { query, limit, scrapeResults });

      const requestBody: Record<string, unknown> = {
        query,
        limit
      };

      // Si queremos scrapear los resultados, añadir scrapeOptions
      if (scrapeResults) {
        requestBody.scrapeOptions = {
          formats: ['markdown'],
          onlyMainContent: true
        };
      }

      const response = await fetch(`${FIRECRAWL_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[Tool:web_search] API error', { status: response.status, error: errorText });
        
        if (response.status === 402) {
          return { success: false, error: 'Créditos de Firecrawl agotados.' };
        }
        if (response.status === 429) {
          return { success: false, error: 'Rate limit alcanzado. Intenta en unos segundos.' };
        }
        
        return { 
          success: false, 
          error: `Error de Firecrawl (${response.status}): ${errorText.substring(0, 200)}` 
        };
      }

      const data = await response.json();
      
      if (!data.success) {
        return { success: false, error: data.error || 'Error desconocido de Firecrawl' };
      }

      const results = (data.data || []).map((item: any) => {
        const result: any = {
          title: item.title || item.metadata?.title || 'Sin título',
          url: item.url || item.metadata?.sourceURL || '',
          description: item.description || item.metadata?.description || ''
        };

        // Si scrapeamos, incluir contenido (truncado)
        if (scrapeResults && item.markdown) {
          const MAX_CONTENT = 3000;
          result.content = item.markdown.length > MAX_CONTENT 
            ? item.markdown.substring(0, MAX_CONTENT) + '...'
            : item.markdown;
        }

        return result;
      });

      const durationMs = Date.now() - startTime;
      
      logger.info('[Tool:web_search] Success', { 
        query, 
        resultsCount: results.length,
        scraped: scrapeResults,
        durationMs 
      });

      return {
        success: true,
        data: {
          results,
          count: results.length,
          query,
          scraped: scrapeResults
        },
        metadata: { durationMs }
      };

    } catch (err: any) {
      logger.error('[Tool:web_search] Exception', err);
      return { success: false, error: `Error inesperado: ${err.message}` };
    }
  }
};
