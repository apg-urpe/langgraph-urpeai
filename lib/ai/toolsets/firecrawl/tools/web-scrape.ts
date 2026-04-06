/**
 * Web Scrape Tool
 * 
 * Extrae contenido de una URL específica usando Firecrawl API.
 * 
 * @module lib/ai/toolsets/firecrawl/tools/web-scrape
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const WebScrapeInputSchema = z.object({
  url: z.string()
    .url('URL inválida')
    .describe('URL completa de la página a scrapear (ej: https://example.com/page)'),
  
  onlyMainContent: z.boolean()
    .optional()
    .describe('Extraer solo el contenido principal, sin headers/footers (default: true)'),
  
  includeLinks: z.boolean()
    .optional()
    .describe('Incluir lista de links encontrados (default: false)')
});

export type WebScrapeInput = z.infer<typeof WebScrapeInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const WebScrapeOutputSchema = z.object({
  title: z.string().optional(),
  content: z.string(),
  url: z.string(),
  links: z.array(z.string()).optional(),
  metadata: z.object({
    description: z.string().optional(),
    language: z.string().optional(),
    sourceURL: z.string().optional()
  }).optional()
});

export type WebScrapeOutput = z.infer<typeof WebScrapeOutputSchema>;

// ============================================================================
// FIRECRAWL API CONFIG
// ============================================================================

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const webScrapeTool: BaseTool<WebScrapeInput, WebScrapeOutput> = {
  name: 'web_scrape',
  description: `🌐 SCRAPING DE PÁGINAS WEB

Extrae el contenido completo de una página web específica.

USAR CUANDO:
- "Lee el contenido de esta URL"
- "Extrae información de [url]"
- "Qué dice esta página web"
- "Analiza el contenido de [sitio]"

EJEMPLOS:
- web_scrape(url: "https://example.com/about")
- web_scrape(url: "https://blog.example.com/article", onlyMainContent: true)

RETORNA: Título, contenido en markdown, y metadata de la página.

⚠️ NOTA: Para buscar en múltiples sitios, usa web_search primero.`,
  
  category: 'lab',
  readOnly: true,
  tags: ['web', 'scrape', 'firecrawl', 'internet'],
  
  inputSchema: WebScrapeInputSchema,
  outputSchema: WebScrapeOutputSchema,
  
  async execute(input, context): Promise<ToolResult<WebScrapeOutput>> {
    const { logger } = context.services;
    const startTime = Date.now();
    
    try {
      if (!FIRECRAWL_API_KEY) {
        return {
          success: false,
          error: 'Firecrawl API key no configurada. Contacta al administrador.'
        };
      }

      const { url, onlyMainContent = true, includeLinks = false } = input;
      
      logger.info('[Tool:web_scrape] Executing', { url });

      // Build formats array
      const formats: string[] = ['markdown'];
      if (includeLinks) formats.push('links');

      const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
        },
        body: JSON.stringify({
          url,
          formats,
          onlyMainContent
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[Tool:web_scrape] API error', { status: response.status, error: errorText });
        
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

      const scraped = data.data;
      const durationMs = Date.now() - startTime;
      
      logger.info('[Tool:web_scrape] Success', { 
        url, 
        contentLength: scraped.markdown?.length || 0,
        durationMs 
      });

      // Truncar contenido si es muy largo
      let content = scraped.markdown || '';
      const MAX_CONTENT_LENGTH = 15000;
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n... [contenido truncado]';
      }

      return {
        success: true,
        data: {
          title: scraped.metadata?.title || '',
          content,
          url: scraped.metadata?.sourceURL || url,
          links: scraped.links?.slice(0, 20), // Limitar links
          metadata: {
            description: scraped.metadata?.description,
            language: scraped.metadata?.language,
            sourceURL: scraped.metadata?.sourceURL
          }
        },
        metadata: { durationMs }
      };

    } catch (err: any) {
      logger.error('[Tool:web_scrape] Exception', err);
      return { success: false, error: `Error inesperado: ${err.message}` };
    }
  }
};
