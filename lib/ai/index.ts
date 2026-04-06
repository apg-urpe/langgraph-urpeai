/**
 * Monica AI - Function Calling Module
 * 
 * NOTA: Las tools ahora están unificadas directamente en app/api/chat/route.ts
 * Este archivo mantiene exports legacy para compatibilidad.
 */

export { MONICA_TOOLS, getGeminiToolsConfig, type ToolDeclaration, type ToolName } from './tools';
export { executeTool, type ToolContext, type ToolResult } from './tool-executor';

// Sub-Agents types (DEPRECATED - tools ahora en route.ts)
export type { SubAgentRequest, SubAgentResponse, SubAgentTrace, SubAgentName } from './sub-agents';
