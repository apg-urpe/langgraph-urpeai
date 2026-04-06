/**
 * Monica Chat Observability Types
 * Tipos para captura y visualización de traces de Gemini Function Calling
 */

// Trace de una llamada individual a una herramienta
export interface ToolTrace {
  id: string;
  iteration: number;
  timestamp: number;
  
  // Tool Call
  toolName: string;
  toolArgs: Record<string, any>;
  
  // Tool Result
  success: boolean;
  data?: any;
  error?: string;
  durationMs: number;
}

// Trace de un sub-agente
export type SubAgentName = 'crm_searcher';

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
  
  // Tools usadas por el sub-agente
  toolTraces: ToolTrace[];
  iterations: number;
  
  // Output
  success: boolean;
  resultSummary?: string;
  error?: string;
}

// Trace completo de un request
export interface RequestTrace {
  id: string;
  sessionId: string;
  
  // Timing
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  
  // Input
  userMessage: string;
  historyLength: number;
  
  // Tool Traces (directas del router)
  toolTraces: ToolTrace[];
  totalIterations: number;
  
  // Sub-Agent Traces
  subAgentTraces?: SubAgentTrace[];
  
  // Output
  status: 'in_progress' | 'completed' | 'error';
  error?: string;
}

// Estado para el store
export interface ObservabilityState {
  // Map de messageId -> RequestTrace
  traces: Record<string, RequestTrace>;
  
  // UI State
  expandedTraceId: string | null;
  isDetailModalOpen: boolean;
  selectedTraceId: string | null;
}

// Props para componentes
export interface TraceAccordionProps {
  trace: RequestTrace;
  onViewDetail: () => void;
}

export interface TraceDetailModalProps {
  trace: RequestTrace | null;
  isOpen: boolean;
  onClose: () => void;
}

export interface JsonViewerProps {
  data: any;
  collapsed?: boolean;
  name?: string;
  theme?: 'dark' | 'light';
}

// Response extendida del API con trace
export interface ChatApiResponse {
  trace?: RequestTrace;
}

// Helper para crear un trace vacío
export const createEmptyTrace = (sessionId: string, userMessage: string, historyLength: number): RequestTrace => ({
  id: crypto.randomUUID(),
  sessionId,
  startedAt: Date.now(),
  userMessage,
  historyLength,
  toolTraces: [],
  totalIterations: 0,
  status: 'in_progress'
});

// Helper para crear un tool trace
export const createToolTrace = (
  iteration: number,
  toolName: string,
  toolArgs: Record<string, any>
): ToolTrace => ({
  id: crypto.randomUUID(),
  iteration,
  timestamp: Date.now(),
  toolName,
  toolArgs,
  success: false,
  durationMs: 0
});
