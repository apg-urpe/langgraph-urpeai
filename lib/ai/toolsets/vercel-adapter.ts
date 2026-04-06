/**
 * Vercel AI SDK Adapter
 * 
 * Convierte nuestras BaseTool (MCP-style) al formato Tool de Vercel AI SDK 6.
 * Permite usar nuestro sistema de toolsets con streamText/generateText.
 * 
 * @module lib/ai/toolsets/vercel-adapter
 */

import { tool } from 'ai';
import type { BaseTool, ToolContext, ToolResult } from './types';

// ============================================================================
// TYPES
// ============================================================================

/** Formato de tools compatible con Vercel AI SDK */
// eslint-disable-next-line
export type VercelToolsRecord = Record<string, any>;

/** Opciones para la conversión */
export interface AdapterOptions {
  /** Si incluir metadata de ejecución en el resultado */
  includeMetadata?: boolean;
  /** Callback cuando una tool termina de ejecutar */
  onToolExecute?: (toolName: string, args: unknown, result: ToolResult<unknown>) => void;
  /** Callback para errores */
  onToolError?: (toolName: string, error: Error) => void;
}

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Crea un ejecutor de tool que inyecta el contexto
 */
function createToolExecutor(
  baseTool: BaseTool<unknown, unknown>,
  context: ToolContext,
  options?: AdapterOptions
) {
  return async (args: Record<string, unknown>) => {
    const startTime = Date.now();
    
    try {
      const result = await baseTool.execute(args, context);
      
      if (options?.onToolExecute) {
        options.onToolExecute(baseTool.name, args, result);
      }
      
      if (!result.success) {
        const error = new Error(result.error || 'Tool execution failed');
        if (options?.onToolError) {
          options.onToolError(baseTool.name, error);
        }
        throw error;
      }
      
      if (options?.includeMetadata && result.metadata && typeof result.data === 'object' && result.data !== null) {
        return {
          ...(result.data as object),
          _metadata: {
            ...result.metadata,
            durationMs: Date.now() - startTime
          }
        };
      }
      
      return result.data;
      
    } catch (error: unknown) {
      if (options?.onToolError && error instanceof Error) {
        options.onToolError(baseTool.name, error);
      }
      throw error;
    }
  };
}

/**
 * Convierte un array de BaseTool a un Record de Tool para Vercel AI SDK.
 * Inyecta automáticamente el ToolContext en cada ejecución.
 * 
 * @example
 * ```typescript
 * const myTools = await orchestrator.resolveTools();
 * const context = orchestrator.createContext({ ... });
 * 
 * const result = streamText({
 *   model: google('gemini-3-flash-preview-exp'),
 *   messages,
 *   tools: toVercelTools(myTools, context),
 *   maxSteps: 5
 * });
 * ```
 */
export function toVercelTools(
  tools: BaseTool<unknown, unknown>[],
  context: ToolContext,
  options?: AdapterOptions
): VercelToolsRecord {
  const vercelTools: VercelToolsRecord = {};

  for (const baseTool of tools) {
    // Crear tool con la estructura que el SDK espera
    // Usamos 'as unknown as any' para bypass de tipos estrictos del SDK
    vercelTools[baseTool.name] = tool({
      description: baseTool.description,
      parameters: baseTool.inputSchema,
      execute: createToolExecutor(baseTool, context, options)
    } as unknown as Parameters<typeof tool>[0]);
  }

  return vercelTools;
}

/**
 * Convierte una sola BaseTool a Tool de Vercel
 */
export function toVercelTool(
  baseTool: BaseTool<unknown, unknown>,
  context: ToolContext
) {
  // eslint-disable-next-line
  return tool({
    description: baseTool.description,
    parameters: baseTool.inputSchema,
    execute: createToolExecutor(baseTool, context)
  } as any);
}

// ============================================================================
// HELPER: MERGE TOOLS
// ============================================================================

/**
 * Combina múltiples records de tools en uno solo
 */
export function mergeVercelTools(
  ...toolRecords: VercelToolsRecord[]
): VercelToolsRecord {
  return Object.assign({}, ...toolRecords);
}

// ============================================================================
// HELPER: FILTER TOOLS
// ============================================================================

/**
 * Filtra tools por nombres permitidos
 */
export function filterVercelTools(
  tools: VercelToolsRecord,
  allowedNames: string[]
): VercelToolsRecord {
  const allowedSet = new Set(allowedNames);
  const filtered: VercelToolsRecord = {};
  
  for (const [name, tool] of Object.entries(tools)) {
    if (allowedSet.has(name)) {
      filtered[name] = tool;
    }
  }
  
  return filtered;
}

// ============================================================================
// TRACE INTEGRATION
// ============================================================================

/**
 * Crea callbacks de observabilidad para usar con toVercelTools
 */
export function createTraceCallbacks(
  traceCollector: {
    addToolTrace: (trace: {
      toolName: string;
      args: unknown;
      result: ToolResult<unknown>;
      durationMs: number;
    }) => void;
  }
): AdapterOptions {
  const startTimes = new Map<string, number>();
  
  return {
    includeMetadata: false,
    onToolExecute: (toolName, args, result) => {
      const startTime = startTimes.get(toolName) || Date.now();
      traceCollector.addToolTrace({
        toolName,
        args,
        result,
        durationMs: Date.now() - startTime
      });
    },
    onToolError: (toolName, error) => {
      const startTime = startTimes.get(toolName) || Date.now();
      traceCollector.addToolTrace({
        toolName,
        args: {},
        result: { success: false, error: error.message },
        durationMs: Date.now() - startTime
      });
    }
  };
}
