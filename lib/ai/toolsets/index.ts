/**
 * MCP-Inspired Tool System
 * 
 * Sistema profesional de tools inspirado en Google ADK y Model Context Protocol.
 * 
 * @module lib/ai/toolsets
 * 
 * @example
 * ```typescript
 * import { 
 *   ToolOrchestrator, 
 *   createToolOrchestrator,
 *   BaseTool, 
 *   BaseToolset 
 * } from '@/lib/ai/toolsets';
 * 
 * // Crear orchestrator con toolsets
 * const orchestrator = createToolOrchestrator([
 *   new CrmToolset(),
 *   new CalendarToolset()
 * ], supabase);
 * 
 * // Resolver tools
 * await orchestrator.resolveTools(context);
 * 
 * // Ejecutar tool
 * const result = await orchestrator.execute('get_contacts', { limit: 10 }, toolContext);
 * ```
 */

// Types
export type {
  // Core types
  ToolCategory,
  ToolResult,
  SessionState,
  ToolActions,
  PendingAction,
  PendingActionType,
  ToolContext,
  ToolContextServices,
  ToolContextMetadata,
  ToolLogger,
  MetricsCollector,
  ReadonlyContext,
  
  // Tool definition
  ToolDefinition,
  BaseTool,
  BaseToolset,
  
  // Traces
  EnhancedToolTrace,
  
  // Gemini
  GeminiFunctionDeclaration,
  GeminiToolsConfig,
  
  // Helper types
  ToolInput,
  ToolOutput
} from './types';

// Implementations
export {
  InMemorySessionState,
  ToolActionsImpl,
  TOOL_CATEGORY_LABELS
} from './types';

// Orchestrator
export { 
  ToolOrchestrator, 
  createToolOrchestrator,
  type OrchestratorConfig 
} from './orchestrator';

export { createPaytonyToolset } from './paytony';

// Utilities
export {
  zodToJsonSchema,
  toolToGeminiDeclaration,
  successResult,
  errorResult,
  truncateDataForTrace,
  validateInput,
  isValidToolName,
  getToolVerb,
  isReadOnlyTool
} from './utils';

// Schemas
export * from './schemas';

// Toolsets
export { CrmToolset, createCrmToolset } from './crm';
export { CalendarToolset, createCalendarToolset } from './calendar/toolset';
export { AnalyticsToolset, createAnalyticsToolset } from './analytics/toolset';
export { TeamToolset, createTeamToolset } from './team/toolset';
export { FirecrawlToolset, createFirecrawlToolset } from './firecrawl';

// Vercel AI SDK Adapter
export { 
  toVercelTools, 
  toVercelTool, 
  mergeVercelTools, 
  filterVercelTools,
  type VercelToolsRecord,
  type AdapterOptions 
} from './vercel-adapter';
