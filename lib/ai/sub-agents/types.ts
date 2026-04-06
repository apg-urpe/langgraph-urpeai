/**
 * Sub-Agent Types
 * Tipos compartidos para el sistema de sub-agentes
 */

import { ToolTrace } from '@/types/observability';
import { ToolContext } from '../tool-executor';

// =====================================================
// SUB-AGENT TRACE
// =====================================================

export interface SubAgentTrace {
  id: string;
  parentRequestId: string;
  agentName: SubAgentName;
  
  // Input
  task: string;
  hints?: Record<string, any>;
  
  // Timing
  startedAt: number;
  completedAt: number;
  durationMs: number;
  
  // Tools usadas
  toolTraces: ToolTrace[];
  iterations: number;
  
  // Output
  success: boolean;
  resultSummary?: string;
  error?: string;
}

// =====================================================
// SUB-AGENT REQUEST/RESPONSE
// =====================================================

export interface SubAgentRequest {
  task: string;
  hints?: Record<string, any>;
  parentTraceId: string;
  context: ToolContext;
}

export interface SubAgentResponse {
  success: boolean;
  data: any;
  summary?: string;
  trace: SubAgentTrace;
}

// =====================================================
// SUB-AGENT NAMES
// =====================================================

// DEPRECATED: Sub-agentes eliminados - tools unificadas en route.ts
export type SubAgentName = 'deprecated';

// =====================================================
// SUB-AGENT CONFIG
// =====================================================

export interface SubAgentConfig {
  name: SubAgentName;
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
}

// =====================================================
// HELPERS
// =====================================================

export function createSubAgentTrace(
  parentRequestId: string,
  agentName: SubAgentName,
  task: string,
  hints?: Record<string, any>
): SubAgentTrace {
  return {
    id: crypto.randomUUID(),
    parentRequestId,
    agentName,
    task,
    hints,
    startedAt: Date.now(),
    completedAt: 0,
    durationMs: 0,
    toolTraces: [],
    iterations: 0,
    success: false
  };
}

export function finalizeSubAgentTrace(
  trace: SubAgentTrace,
  success: boolean,
  summary?: string,
  error?: string
): SubAgentTrace {
  const completedAt = Date.now();
  return {
    ...trace,
    completedAt,
    durationMs: completedAt - trace.startedAt,
    success,
    resultSummary: summary,
    error
  };
}
