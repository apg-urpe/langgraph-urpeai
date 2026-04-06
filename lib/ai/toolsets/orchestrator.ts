/**
 * Tool Orchestrator
 * Coordinador central del sistema de tools de Monica AI.
 * 
 * Responsabilidades:
 * - Resolución de tools desde múltiples toolsets
 * - Validación de inputs con Zod schemas
 * - Ejecución de tools con timing y error handling
 * - Generación de traces para observability
 * - Conversión a formato Gemini para function calling
 * 
 * Arquitectura:
 * - Cache de tools: Map<toolName, BaseTool>
 * - Toolset mapping: Map<toolName, toolsetName>
 * - Configuración: maxIterations, maxTraceDataSize, validateOutputs
 * 
 * Flujo de ejecución:
 * 1. Resolver tools desde toolsets
 * 2. Ejecutar con validación (Zod input → execute → Zod output opcional)
 * 3. Generar trace con timing
 * 4. Retornar ToolResult con metadata
 * 
 * @module lib/ai/toolsets/orchestrator
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
// Logger simple para evitar dependencias circulares
const logger = {
  debug: (...args: unknown[]) => console.debug('[Orchestrator]', ...args),
  info: (...args: unknown[]) => console.info('[Orchestrator]', ...args),
  warn: (...args: unknown[]) => console.warn('[Orchestrator]', ...args),
  error: (...args: unknown[]) => console.error('[Orchestrator]', ...args)
};
import {
  BaseTool,
  BaseToolset,
  ToolContext,
  ToolResult,
  ReadonlyContext,
  GeminiToolsConfig,
  EnhancedToolTrace,
  ToolCategory,
  SessionState,
  ToolActions,
  InMemorySessionState,
  ToolActionsImpl,
  ToolContextServices,
  ToolContextMetadata
} from './types';
import { 
  toolToGeminiDeclaration, 
  validateInput, 
  truncateDataForTrace 
} from './utils';

// ============================================================================
// ORCHESTRATOR CONFIG
// Configuración por defecto y tipos
// ============================================================================

export interface OrchestratorConfig {
  /** Máximo de iteraciones de tool calling por request (default: 5) */
  maxIterations?: number;
  /** Tamaño máximo de datos en traces, en bytes (default: 50KB) */
  maxTraceDataSize?: number;
  /** Si validar outputs de tools contra Zod schemas (default: true) */
  validateOutputs?: boolean;
}

const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  maxIterations: 5,
  maxTraceDataSize: 50 * 1024,
  validateOutputs: true
};

// ============================================================================
// TOOL ORCHESTRATOR
// Clase principal que coordina la resolución y ejecución de tools
// ============================================================================

export class ToolOrchestrator {
  private toolsets: BaseToolset[];
  private toolCache: Map<string, BaseTool<unknown, unknown>>;
  private toolsetMap: Map<string, string>; // toolName -> toolsetName
  private config: Required<OrchestratorConfig>;
  private supabase: SupabaseClient;

  constructor(
    toolsets: BaseToolset[],
    supabase: SupabaseClient,
    config?: OrchestratorConfig
  ) {
    this.toolsets = toolsets;
    this.supabase = supabase;
    this.toolCache = new Map();
    this.toolsetMap = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // TOOL RESOLUTION
  // ==========================================================================

  /**
   * Resuelve todas las tools disponibles según el contexto.
   * 
   * @param context - Contexto de solo lectura para filtrar tools
   * @returns Array de tools únicas (sin duplicados por nombre)
   * 
   * Proceso:
   * 1. Itera sobre todos los toolsets registrados
   * 2. Llama getTools(context) en cada toolset
   * 3. Evita duplicados usando toolCache
   * 4. Loguea advertencias para nombres duplicados
   * 
   * Caching: Las tools se almacenan en toolCache para acceso O(1)
   * y se mapean a su toolset de origen en toolsetMap.
   */
  async resolveTools(context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]> {
    const tools: BaseTool<unknown, unknown>[] = [];

    for (const toolset of this.toolsets) {
      try {
        const toolsetTools = await toolset.getTools(context);
        
        for (const tool of toolsetTools) {
          // Evitar duplicados
          if (!this.toolCache.has(tool.name)) {
            this.toolCache.set(tool.name, tool);
            this.toolsetMap.set(tool.name, toolset.name);
            tools.push(tool);
          } else {
            logger.warn(`[Orchestrator] Duplicate tool name: ${tool.name}`);
          }
        }
      } catch (error) {
        logger.error(`[Orchestrator] Error resolving tools from ${toolset.name}:`, error);
      }
    }

    logger.debug(`[Orchestrator] Resolved ${tools.length} tools from ${this.toolsets.length} toolsets`);
    return tools;
  }

  /**
   * Obtiene una tool por nombre
   */
  getTool(name: string): BaseTool<unknown, unknown> | undefined {
    return this.toolCache.get(name);
  }

  /**
   * Obtiene el nombre del toolset de una tool
   */
  getToolsetName(toolName: string): string {
    return this.toolsetMap.get(toolName) || 'unknown';
  }

  /**
   * Lista todas las tools cacheadas
   */
  listTools(): string[] {
    return Array.from(this.toolCache.keys());
  }

  // ==========================================================================
  // TOOL EXECUTION
  // ==========================================================================

  /**
   * Ejecuta una tool con validación completa de input/output.
   * 
   * @param toolName - Nombre de la tool a ejecutar
   * @param args - Argumentos raw (se validan contra inputSchema)
   * @param context - Contexto de ejecución con enterpriseId, services, etc.
   * @returns ToolResult con success, data/error, y metadata de timing
   * 
   * Flujo de ejecución:
   * 1. Buscar tool en cache → 404 si no existe
   * 2. Validar input con Zod schema
   *    - Si falla: retorna error de validación
   * 3. Ejecutar tool.execute(validatedData, context)
   * 4. Medir durationMs
   * 5. Validar output (opcional, si validateOutputs=true y outputSchema existe)
   *    - Si falla: solo loguea warning, no falla la ejecución
   * 6. Retornar resultado con metadata de timing
   * 
   * Error handling:
   * - Tool not found: Error 404 con lista de tools disponibles
   * - Input validation: Error de validación con detalles
   * - Runtime error: Catch exception, loguea y retorna error
   * - Output validation: Warning en logs, no afecta resultado
   */
  async execute(
    toolName: string,
    args: unknown,
    context: ToolContext
  ): Promise<ToolResult<unknown>> {
    const tool = this.toolCache.get(toolName);
    
    if (!tool) {
      return { 
        success: false, 
        error: `Tool "${toolName}" not found. Available: ${this.listTools().join(', ')}` 
      };
    }

    // 1. Validar input con Zod
    const inputValidation = validateInput(tool.inputSchema, args);
    
    if (!inputValidation.success) {
      logger.warn(`[Orchestrator] Input validation failed for ${toolName}:`, inputValidation.errors);
      return {
        success: false,
        error: `Invalid input: ${(inputValidation as { success: false; errors: string[] }).errors.join('; ')}`
      };
    }

    // 2. Ejecutar tool
    const startTime = Date.now();
    
    try {
      const result = await tool.execute(inputValidation.data, context);
      const durationMs = Date.now() - startTime;

      // 3. Validar output (opcional)
      if (this.config.validateOutputs && tool.outputSchema && result.success && result.data) {
        const outputValidation = tool.outputSchema.safeParse(result.data);
        
        if (!outputValidation.success) {
          logger.warn(
            `[Orchestrator] Output validation failed for ${toolName}:`,
            outputValidation.error.errors
          );
          // No fallamos, solo logueamos
        }
      }

      // 4. Añadir metadata de timing
      return {
        ...result,
        metadata: {
          ...result.metadata,
          durationMs
        }
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.error(`[Orchestrator] Error executing ${toolName}:`, error);
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        metadata: { durationMs }
      };
    }
  }

  // ==========================================================================
  // TRACE GENERATION
  // ==========================================================================

  /**
   * Crea un trace inicial para una ejecución de tool.
   * 
   * @param toolName - Nombre de la tool
   * @param args - Argumentos de entrada
   * @param context - Contexto de ejecución
   * @returns EnhancedToolTrace inicial (sin completar)
   * 
   * El trace se completa con finalizeTrace después de la ejecución.
   * Campos inicializados:
   * - id: UUID único
   * - requestId, functionCallId: Desde context
   * - startedAt: timestamp actual
   * - success: false (se actualiza al finalizar)
   * - inputValid/outputValid: true (se actualizan si fallan validaciones)
   */
  createTrace(
    toolName: string,
    args: unknown,
    context: ToolContext
  ): EnhancedToolTrace {
    const tool = this.toolCache.get(toolName);
    
    return {
      id: crypto.randomUUID(),
      requestId: context.requestId,
      functionCallId: context.functionCallId,
      startedAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      toolName,
      toolCategory: tool?.category || 'system',
      toolsetName: this.getToolsetName(toolName),
      inputArgs: args as Record<string, unknown>,
      inputValid: true,
      outputValid: true,
      success: false
    };
  }

  /**
   * Finaliza un trace con el resultado de la ejecución.
   * 
   * @param trace - Trace inicial creado con createTrace
   * @param result - Resultado de tool.execute()
   * @returns EnhancedToolTrace completo con timing y datos
   * 
   * Actualiza:
   * - completedAt: timestamp de finalización
   * - durationMs: Tiempo total de ejecución
   * - success: Resultado de la ejecución
   * - error: Mensaje de error si success=false
   * - outputData: Datos truncados si success=true
   * - metadata: Metadata adicional del resultado
   * 
   * Truncamiento: Los datos se truncan si exceden maxTraceDataSize
   * para evitar traces gigantes en la base de datos.
   */
  finalizeTrace(
    trace: EnhancedToolTrace,
    result: ToolResult<unknown>
  ): EnhancedToolTrace {
    const completedAt = Date.now();
    
    return {
      ...trace,
      completedAt,
      durationMs: completedAt - trace.startedAt,
      success: result.success,
      error: result.error,
      outputData: result.success 
        ? truncateDataForTrace(result.data, this.config.maxTraceDataSize)
        : undefined,
      metadata: result.metadata
    };
  }

  // ==========================================================================
  // GEMINI FORMAT CONVERSION
  // Conversión de tools a formato compatible con Gemini AI
  // ==========================================================================

  /**
   * Convierte todas las tools cacheadas a formato Gemini FunctionDeclarations.
   * 
   * @param tools - Subset de tools a convertir (default: todas las cacheadas)
   * @returns GeminiToolsConfig con functionDeclarations
   * 
   * Uso: Pasar directamente a la API de Gemini para function calling.
   * Cada tool se convierte usando toolToGeminiDeclaration() que extrae:
   * - name, description de la tool
   * - parameters desde inputSchema de Zod
   */
  toGeminiFormat(tools?: BaseTool<unknown, unknown>[]): GeminiToolsConfig {
    const toolsToConvert = tools || Array.from(this.toolCache.values());
    
    return {
      functionDeclarations: toolsToConvert.map(tool => toolToGeminiDeclaration(tool))
    };
  }

  /**
   * Filtra tools por nombres permitidos
   */
  filterToolsByNames(allowedNames: string[]): BaseTool<unknown, unknown>[] {
    const allowedSet = new Set(allowedNames);
    return Array.from(this.toolCache.values()).filter(tool => 
      allowedSet.has(tool.name)
    );
  }

  /**
   * Filtra tools por categoría
   */
  filterToolsByCategory(category: ToolCategory): BaseTool<unknown, unknown>[] {
    return Array.from(this.toolCache.values()).filter(tool => 
      tool.category === category
    );
  }

  /**
   * Filtra tools de solo lectura
   */
  getReadOnlyTools(): BaseTool<unknown, unknown>[] {
    return Array.from(this.toolCache.values()).filter(tool => 
      tool.readOnly === true
    );
  }

  // ==========================================================================
  // CONTEXT CREATION
  // Factory para crear ToolContext con servicios configurados
  // ==========================================================================

  /**
   * Crea un ToolContext completo para una ejecución.
   * 
   * @param options.requestId - ID único del request (para tracing)
   * @param options.functionCallId - ID de la llamada de función de Gemini
   * @param options.enterpriseId - ID de la empresa (multi-tenancy)
   * @param options.userId - ID del usuario (opcional)
   * @param options.metadata - Metadatos adicionales (timezone, language, role)
   * @param options.existingState - Estado de sesión existente (para continuar)
   * @returns ToolContext configurado con servicios
   * 
   * Servicios incluidos:
   * - supabase: Cliente de Supabase del orchestrator
   * - logger: Logger con prefijo [Tool:requestId]
   * - metrics: Stub (TODO: implementar métricas reales)
   * - state: InMemorySessionState (o existingState si se proporciona)
   * - actions: ToolActionsImpl para side effects
   * 
   * Metadatos defaults:
   * - userTimezone: 'America/Lima'
   * - language: 'es'
   */
  createContext(options: {
    requestId: string;
    functionCallId: string;
    enterpriseId: number;
    userId?: number;
    metadata?: Partial<ToolContextMetadata>;
    existingState?: SessionState;
  }): ToolContext {
    return {
      requestId: options.requestId,
      functionCallId: options.functionCallId,
      enterpriseId: options.enterpriseId,
      userId: options.userId,
      state: options.existingState || new InMemorySessionState(),
      actions: new ToolActionsImpl(),
      services: {
        supabase: this.supabase,
        logger: {
          debug: (...args) => logger.debug(`[Tool:${options.requestId}]`, ...args),
          info: (...args) => logger.info(`[Tool:${options.requestId}]`, ...args),
          warn: (...args) => logger.warn(`[Tool:${options.requestId}]`, ...args),
          error: (...args) => logger.error(`[Tool:${options.requestId}]`, ...args)
        },
        metrics: {
          increment: () => {}, // TODO: Implementar métricas reales
          timing: () => {},
          gauge: () => {}
        }
      },
      metadata: {
        userTimezone: options.metadata?.userTimezone || 'America/Lima',
        language: options.metadata?.language || 'es',
        roleId: options.metadata?.roleId,
        roleName: options.metadata?.roleName
      }
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // Gestión de toolsets dinámicos y cleanup de recursos
  // ==========================================================================

  /**
   * Cierra todos los toolsets y limpia recursos.
   * 
   * @returns Promise que se resuelve cuando todos los toolsets están cerrados
   * 
   * Itera sobre cada toolset registrado y llama close() para liberar
   * recursos (conexiones, caches, etc.). Si un toolset falla al cerrar,
   * loguea el error pero continúa con los demás.
   * 
   * Al finalizar, limpia el toolCache y toolsetMap.
   */
  async close(): Promise<void> {
    for (const toolset of this.toolsets) {
      try {
        await toolset.close();
      } catch (error) {
        logger.error(`[Orchestrator] Error closing ${toolset.name}:`, error);
      }
    }
    
    this.toolCache.clear();
    this.toolsetMap.clear();
  }

  /**
   * Añade un toolset dinámicamente al orchestrator.
   * 
   * @param toolset - Toolset a añadir
   * @param context - Contexto de solo lectura para filtrar tools
   * 
   * Registra el toolset y resuelve sus tools inmediatamente.
   * Solo añade tools con nombres únicos (no duplicados).
   */
  async addToolset(toolset: BaseToolset, context?: ReadonlyContext): Promise<void> {
    this.toolsets.push(toolset);
    
    // Resolver tools del nuevo toolset
    const tools = await toolset.getTools(context);
    for (const tool of tools) {
      if (!this.toolCache.has(tool.name)) {
        this.toolCache.set(tool.name, tool);
        this.toolsetMap.set(tool.name, toolset.name);
      }
    }
  }

  /**
   * Remueve un toolset por nombre.
   * 
   * @param name - Nombre del toolset a remover
   * @returns true si se encontró y removió, false si no existía
   * 
   * También remueve todas las tools asociadas a este toolset del cache.
   */
  removeToolset(name: string): boolean {
    const index = this.toolsets.findIndex(ts => ts.name === name);
    if (index === -1) return false;

    // Remover tools de este toolset del cache
    // Collect keys to delete first to avoid modifying while iterating
    const keysToDelete: string[] = [];
    this.toolsetMap.forEach((tsName, toolName) => {
      if (tsName === name) {
        keysToDelete.push(toolName);
      }
    });
    
    keysToDelete.forEach(toolName => {
      this.toolCache.delete(toolName);
      this.toolsetMap.delete(toolName);
    });

    this.toolsets.splice(index, 1);
    return true;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Crea una instancia del orchestrator con toolsets.
 * 
 * @param toolsets - Array de toolsets a registrar
 * @param supabase - Cliente de Supabase para queries
 * @param config - Configuración opcional del orchestrator
 * @returns ToolOrchestrator configurado y listo para usar
 * 
 * @example
 * ```typescript
 * const orchestrator = createToolOrchestrator(
 *   [new MonicaTools(), new CrmTools()],
 *   supabaseClient,
 *   { maxIterations: 10, validateOutputs: true }
 * );
 * ```
 */
export function createToolOrchestrator(
  toolsets: BaseToolset[],
  supabase: SupabaseClient,
  config?: OrchestratorConfig
): ToolOrchestrator {
  return new ToolOrchestrator(toolsets, supabase, config);
}
