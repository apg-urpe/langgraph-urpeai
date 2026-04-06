/**
 * Analytics Toolset
 * 
 * Toolset para métricas, embudo y analíticas.
 * 
 * @module lib/ai/toolsets/analytics/toolset
 */

import type { BaseToolset, BaseTool, ReadonlyContext, ToolCategory } from '../types';
import { getPipelineTool, getBusinessMetricsTool, getConversationalIntelligenceTool } from './tools';

export class AnalyticsToolset implements BaseToolset {
  name = 'analytics';
  description = 'Tools para métricas, embudo de ventas, analíticas de negocio e inteligencia conversacional';
  category: ToolCategory = 'analytics';
  
  private tools: BaseTool<unknown, unknown>[] = [
    getPipelineTool as BaseTool<unknown, unknown>,
    getBusinessMetricsTool as BaseTool<unknown, unknown>,
    getConversationalIntelligenceTool as BaseTool<unknown, unknown>,
  ];
  
  async getTools(_context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    return this.tools;
  }
  
  async close(): Promise<void> {}
}

export function createAnalyticsToolset(): AnalyticsToolset {
  return new AnalyticsToolset();
}
