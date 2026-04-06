/**
 * Firecrawl Toolset
 * 
 * Toolset para web scraping y búsqueda en internet usando Firecrawl.
 * 
 * @module lib/ai/toolsets/firecrawl/toolset
 */

import type { BaseToolset, BaseTool, ReadonlyContext, ToolCategory } from '../types';
import { webScrapeTool, webSearchTool } from './tools';

// ============================================================================
// FIRECRAWL TOOLSET
// ============================================================================

export class FirecrawlToolset implements BaseToolset {
  name = 'firecrawl';
  description = 'Tools para web scraping y búsqueda en internet';
  category: ToolCategory = 'lab';
  
  private tools: BaseTool<unknown, unknown>[] = [
    webSearchTool as BaseTool<unknown, unknown>,   // 🔎 Búsqueda en internet
    webScrapeTool as BaseTool<unknown, unknown>,   // 🌐 Scraping de URLs
  ];
  
  /**
   * Obtiene las tools disponibles según el contexto.
   */
  async getTools(context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    // Verificar que la API key está configurada
    if (!process.env.FIRECRAWL_API_KEY) {
      console.warn('[FirecrawlToolset] FIRECRAWL_API_KEY no configurada - tools deshabilitadas');
      return [];
    }
    
    return this.tools;
  }
  
  /**
   * Limpieza de recursos
   */
  async close(): Promise<void> {
    // No hay recursos que limpiar
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createFirecrawlToolset(): FirecrawlToolset {
  return new FirecrawlToolset();
}
