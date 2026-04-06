/**
 * MCP-Inspired Tool System - Core Types
 * 
 * Tipos base para el sistema de tools profesional.
 * Inspirado en Google ADK y Model Context Protocol.
 * 
 * @module lib/ai/toolsets/types
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

export type ToolCategory = 
  | 'crm'        // Contactos, notas, embudo
  | 'calendar'   // Citas, agenda
  | 'tasks'      // Tareas, proyectos
  | 'marketing'  // Campañas, envíos
  | 'analytics'  // Métricas, reportes
  | 'team'       // Equipo, roles
  | 'lab'        // Experimental/Beta
  | 'system';    // Delegación, utilidades

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  crm: 'CRM',
  calendar: 'Calendario',
  tasks: 'Tareas',
  marketing: 'Marketing',
  analytics: 'Analíticas',
  team: 'Equipo',
  lab: 'Lab',
  system: 'Sistema'
};

// ============================================================================
// TOOL RESULT
// ============================================================================

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    /** Tiempo de ejecución en ms */
    durationMs?: number;
    /** Número de queries a DB */
    dbQueriesCount?: number;
    /** Si los datos fueron truncados */
    truncated?: boolean;
    /** Conteo original si fue truncado */
    originalCount?: number;
  };
}

// ============================================================================
// SESSION STATE
// ============================================================================

export interface SessionState {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  getAll(): Record<string, unknown>;
}

/** Implementación en memoria del SessionState */
export class InMemorySessionState implements SessionState {
  private state: Map<string, unknown> = new Map();

  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.state.set(key, value);
  }

  delete(key: string): void {
    this.state.delete(key);
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.state);
  }
}

// ============================================================================
// TOOL ACTIONS
// ============================================================================

export interface ToolActions {
  /** Saltar summarization del resultado */
  skipSummarization(): void;
  
  /** Transferir a otro agente/rol */
  transferToAgent(agentId: string): void;
  
  /** Solicitar confirmación del usuario */
  requestConfirmation(message: string): void;
  
  /** Escalar a humano */
  escalateToHuman(reason: string): void;
  
  /** Obtener acciones pendientes */
  getPendingActions(): PendingAction[];
}

export type PendingActionType = 
  | 'skip_summarization'
  | 'transfer_agent'
  | 'request_confirmation'
  | 'escalate_human';

export interface PendingAction {
  type: PendingActionType;
  payload?: unknown;
}

/** Implementación de ToolActions */
export class ToolActionsImpl implements ToolActions {
  private pendingActions: PendingAction[] = [];

  skipSummarization(): void {
    this.pendingActions.push({ type: 'skip_summarization' });
  }

  transferToAgent(agentId: string): void {
    this.pendingActions.push({ type: 'transfer_agent', payload: { agentId } });
  }

  requestConfirmation(message: string): void {
    this.pendingActions.push({ type: 'request_confirmation', payload: { message } });
  }

  escalateToHuman(reason: string): void {
    this.pendingActions.push({ type: 'escalate_human', payload: { reason } });
  }

  getPendingActions(): PendingAction[] {
    return [...this.pendingActions];
  }
}

// ============================================================================
// TOOL CONTEXT
// ============================================================================

export interface ToolContextServices {
  supabase: SupabaseClient;
  logger: ToolLogger;
  metrics: MetricsCollector;
}

export interface ToolLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface MetricsCollector {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  timing(metric: string, durationMs: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
}

export interface ToolContextMetadata {
  userTimezone: string;
  language: string;
  roleId?: string;
  roleName?: string;
}

export interface ToolContext {
  // Identificación
  requestId: string;
  functionCallId: string;
  
  // Multi-tenancy
  enterpriseId: number;
  userId?: number;
  
  // Estado de sesión (read/write)
  state: SessionState;
  
  // Acciones post-ejecución
  actions: ToolActions;
  
  // Servicios
  services: ToolContextServices;
  
  // Metadata
  metadata: ToolContextMetadata;
}

// ============================================================================
// READONLY CONTEXT (para getTools)
// ============================================================================

export interface ReadonlyContext {
  enterpriseId: number;
  userId?: number;
  roleId?: string;
  state: Readonly<Record<string, unknown>>;
}

// ============================================================================
// BASE TOOL DEFINITION
// ============================================================================

export interface ToolDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType
> {
  /** Nombre único de la tool (verb_noun format) */
  name: string;
  
  /** Descripción clara para el LLM */
  description: string;
  
  /** Schema Zod para validación de entrada */
  inputSchema: TInput;
  
  /** Schema Zod para validación de salida (opcional) */
  outputSchema?: TOutput;
  
  /** Categoría para agrupación */
  category: ToolCategory;
  
  /** Si requiere confirmación del usuario */
  requiresConfirmation?: boolean;
  
  /** Si es una tool de solo lectura */
  readOnly?: boolean;
  
  /** Tags para filtrado adicional */
  tags?: string[];
}

// ============================================================================
// BASE TOOL INTERFACE
// ============================================================================

export interface BaseTool<TInput = unknown, TOutput = unknown> 
  extends ToolDefinition<z.ZodType<TInput>, z.ZodType<TOutput>> {
  
  /** Ejecuta la tool con contexto */
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

// ============================================================================
// BASE TOOLSET INTERFACE
// ============================================================================

export interface BaseToolset {
  /** Nombre único del toolset */
  name: string;
  
  /** Descripción del toolset */
  description: string;
  
  /** Categoría principal */
  category: ToolCategory;
  
  /** Obtiene tools disponibles según contexto */
  getTools(context?: ReadonlyContext): Promise<BaseTool<unknown, unknown>[]>;
  
  /** Limpieza de recursos */
  close(): Promise<void>;
}

// ============================================================================
// TOOL TRACE (Observabilidad)
// ============================================================================

export interface EnhancedToolTrace {
  // Identificación
  id: string;
  requestId: string;
  functionCallId: string;
  
  // Timing
  startedAt: number;
  completedAt: number;
  durationMs: number;
  
  // Tool info
  toolName: string;
  toolCategory: ToolCategory;
  toolsetName: string;
  
  // Input/Output
  inputArgs: Record<string, unknown>;
  inputValid: boolean;
  inputErrors?: string[];
  
  outputData?: unknown;
  outputValid: boolean;
  outputErrors?: string[];
  
  // Result
  success: boolean;
  error?: string;
  
  // Metrics
  metadata?: {
    dbQueriesCount?: number;
    dbQueryDurationMs?: number;
    truncated?: boolean;
  };
}

// ============================================================================
// GEMINI FORMAT TYPES
// ============================================================================

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GeminiToolsConfig {
  functionDeclarations: GeminiFunctionDeclaration[];
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/** Extrae el tipo de input de una tool */
export type ToolInput<T extends BaseTool<unknown, unknown>> = 
  T extends BaseTool<infer I, unknown> ? I : never;

/** Extrae el tipo de output de una tool */
export type ToolOutput<T extends BaseTool<unknown, unknown>> = 
  T extends BaseTool<unknown, infer O> ? O : never;
