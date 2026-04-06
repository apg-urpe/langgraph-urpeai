'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Wrench, 
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Zap,
  ArrowRight,
  Bot,
  Layers
} from 'lucide-react';
import { RequestTrace, ToolTrace, SubAgentTrace } from '@/types/observability';
import JsonViewer, { FullJsonViewer } from './JsonViewer';

interface TraceDetailModalProps {
  trace: RequestTrace | null;
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'timeline' | 'tools' | 'subagents' | 'raw';

// Format duration
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// Helper to parse data that might be a JSON string or already an object
const parseToolData = (data: any): any => {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') {
    // Try to parse JSON strings
    try {
      // Handle truncated strings like "... [truncated]"
      if (data.endsWith('[truncated]') || data.endsWith('...')) {
        const cleanData = data.replace(/\.{3}\s*\[truncated\]$/, '').replace(/\.{3}$/, '');
        try {
          return { _parsed: JSON.parse(cleanData), _wasTruncated: true };
        } catch {
          return { _rawString: data, _parseError: 'Could not parse truncated data' };
        }
      }
      return JSON.parse(data);
    } catch {
      // If not valid JSON, return as display object
      return { _rawString: data };
    }
  }
  return data;
};

// Format timestamp
const formatTime = (ts: number): string => {
  return new Date(ts).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
};

// Tool display names
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_contacts: 'Buscar Contactos',
  search_contacts_deep: 'Búsqueda Profunda',
  get_contact_details: 'Detalles de Contacto',
  get_appointments: 'Obtener Citas',
  get_conversations: 'Obtener Conversaciones',
  search_messages: 'Buscar Mensajes',
  get_team_members: 'Miembros del Equipo',
  get_funnel_stages: 'Etapas del Embudo',
  get_funnel_stats: 'Estadísticas del Embudo',
  get_metrics: 'Obtener Métricas',
  get_tasks: 'Obtener Tareas',
  get_contact_notes: 'Notas del Contacto',
  create_note: 'Crear Nota',
  updateAppointmentStatus: 'Actualizar Estado de Cita',
  getAppointments: 'Obtener Citas',
  getTasks: 'Obtener Tareas',
  getProjects: 'Obtener Proyectos',
  getTeamMembers: 'Miembros del Equipo',
  getMetrics: 'Métricas del Negocio',
  getFunnelStats: 'Estadísticas del Embudo',
  get_sorted_contacts: 'Contactos Ordenados',
  get_projects: 'Proyectos',
  get_project_details: 'Detalles de Proyecto',
  get_campaigns: 'Campañas',
  get_campaign_details: 'Detalles de Campaña',
};

// Generate a structured report for sharing with LLMs
const generateLLMReport = (trace: RequestTrace): string => {
  const report = {
    _meta: {
      type: 'Monica AI Request Trace',
      generated_at: new Date().toISOString(),
      trace_id: trace.id,
      session_id: trace.sessionId,
    },
    summary: {
      status: trace.status,
      total_duration_ms: trace.totalDurationMs || (Date.now() - trace.startedAt),
      total_iterations: trace.totalIterations,
      tools_executed: trace.toolTraces.length,
      tools_succeeded: trace.toolTraces.filter(t => t.success).length,
      tools_failed: trace.toolTraces.filter(t => !t.success).length,
      sub_agents_used: trace.subAgentTraces?.length || 0,
    },
    input: {
      user_message: trace.userMessage,
      history_length: trace.historyLength,
    },
    tools: trace.toolTraces.map(t => ({
      name: t.toolName,
      display_name: TOOL_DISPLAY_NAMES[t.toolName] || t.toolName,
      success: t.success,
      duration_ms: t.durationMs,
      iteration: t.iteration,
      args: t.toolArgs,
      result: t.success ? parseToolData(t.data) : null,
      error: t.error || null,
    })),
    sub_agents: trace.subAgentTraces?.map(sa => ({
      name: sa.agentName,
      task: sa.task,
      success: sa.success,
      duration_ms: sa.durationMs,
      iterations: sa.iterations,
      tools: sa.toolTraces.map(t => ({
        name: t.toolName,
        success: t.success,
        duration_ms: t.durationMs,
        args: t.toolArgs,
        result: t.success ? parseToolData(t.data) : null,
        error: t.error || null,
      })),
      result_summary: sa.resultSummary,
    })) || [],
    error: trace.error || null,
  };
  
  return JSON.stringify(report, null, 2);
};

const TraceDetailModal: React.FC<TraceDetailModalProps> = ({ trace, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('timeline');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [reportCopied, setReportCopied] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('timeline');
      setExpandedTools(new Set());
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !trace) return null;

  const totalTools = trace.toolTraces.length;
  const successfulTools = trace.toolTraces.filter(t => t.success).length;
  const totalDuration = trace.totalDurationMs || (Date.now() - trace.startedAt);
  const hasSubAgents = trace.subAgentTraces && trace.subAgentTraces.length > 0;
  
  // Calculate aggregate stats including sub-agents
  const subAgentToolsCount = hasSubAgents 
    ? trace.subAgentTraces!.reduce((sum, sa) => sum + sa.toolTraces.length, 0) 
    : 0;
  const totalToolsWithSubAgents = totalTools + subAgentToolsCount;

  const toggleToolExpanded = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div 
        className="w-full max-w-4xl max-h-[85vh] bg-zinc-900 rounded-xl border border-zinc-700/50 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50 bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Trace de Request</h2>
              <p className="text-xs text-zinc-500 font-mono">{trace.id.slice(0, 8)}...</p>
            </div>
          </div>
          
          {/* Summary badges */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 border border-zinc-700/50">
              <Wrench className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-zinc-300">
                {totalToolsWithSubAgents} tools
                {hasSubAgents && (
                  <span className="text-zinc-500 ml-1">({totalTools}+{subAgentToolsCount})</span>
                )}
              </span>
            </div>
            {hasSubAgents && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-violet-500/10 border border-violet-500/30">
                <Bot className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs text-violet-300">{trace.subAgentTraces!.length} sub-agent</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 border border-zinc-700/50">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-zinc-300">{formatDuration(totalDuration)}</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
              trace.status === 'completed' 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : trace.status === 'error'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              {trace.status === 'completed' ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              ) : trace.status === 'error' ? (
                <XCircle className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className={`text-xs ${
                trace.status === 'completed' ? 'text-emerald-400' :
                trace.status === 'error' ? 'text-red-400' : 'text-amber-400'
              }`}>
                {trace.status === 'completed' ? 'Completado' :
                 trace.status === 'error' ? 'Error' : 'En progreso'}
              </span>
            </div>
            
            {/* Copy LLM Report Button */}
            <button
              onClick={async () => {
                const report = generateLLMReport(trace);
                await navigator.clipboard.writeText(report);
                setReportCopied(true);
                setTimeout(() => setReportCopied(false), 2000);
              }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all ${
                reportCopied 
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                  : 'bg-zinc-800 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
              }`}
              title="Copiar reporte JSON para compartir con LLMs"
            >
              {reportCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="text-xs">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-xs">Reporte</span>
                </>
              )}
            </button>
            
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700/50 bg-zinc-800/30 overflow-x-auto">
          {[
            { id: 'timeline' as TabType, label: 'Timeline', icon: Clock },
            { id: 'tools' as TabType, label: 'Tools', icon: Wrench },
            ...(hasSubAgents ? [{ id: 'subagents' as TabType, label: `Sub-Agents (${trace.subAgentTraces!.length})`, icon: Bot }] : []),
            { id: 'raw' as TabType, label: 'Raw JSON', icon: MessageSquare },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-cyan-400 bg-cyan-400/5'
                  : 'text-zinc-400 border-transparent hover:text-zinc-300 hover:bg-zinc-700/30'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600">
          {activeTab === 'timeline' && (
            <TimelineView trace={trace} />
          )}
          {activeTab === 'tools' && (
            <ToolsView 
              tools={trace.toolTraces} 
              expandedTools={expandedTools}
              onToggle={toggleToolExpanded}
            />
          )}
          {activeTab === 'subagents' && hasSubAgents && (
            <SubAgentsView 
              subAgents={trace.subAgentTraces!}
              expandedTools={expandedTools}
              onToggle={toggleToolExpanded}
            />
          )}
          {activeTab === 'raw' && (
            <RawJsonView trace={trace} />
          )}
        </div>
      </div>
    </div>
  );
};

// Timeline View - Enhanced with sub-agent support
const TimelineView: React.FC<{ trace: RequestTrace }> = ({ trace }) => {
  const hasSubAgents = trace.subAgentTraces && trace.subAgentTraces.length > 0;
  const subAgentToolsCount = hasSubAgents 
    ? trace.subAgentTraces!.reduce((sum, sa) => sum + sa.toolTraces.length, 0) 
    : 0;
  
  // Build a map of delegation tool -> sub-agent for inline display (DEPRECATED)
  const delegationMap = new Map<string, SubAgentTrace>();
  
  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 overflow-hidden">
        <div className="px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/50 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-zinc-300">Input del Usuario</span>
          <span className="text-[10px] text-zinc-500 font-mono ml-auto">
            {formatTime(trace.startedAt)}
          </span>
        </div>
        <div className="p-3">
          <p className="text-sm text-zinc-300">{trace.userMessage}</p>
          <p className="text-xs text-zinc-500 mt-2">
            Historial: {trace.historyLength} mensajes previos
          </p>
        </div>
      </div>

      {/* Tool executions timeline */}
      {trace.toolTraces.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5" />
            Ejecución de Tools ({trace.toolTraces.length})
            {hasSubAgents && (
              <span className="text-violet-400 ml-1">
                (+{subAgentToolsCount} en sub-agentes)
              </span>
            )}
          </h3>
          
          <div className="relative pl-4 border-l-2 border-zinc-700/50 space-y-3">
            {trace.toolTraces.map((tool, index) => (
              <TimelineToolItem 
                key={tool.id} 
                tool={tool} 
                index={index}
                subAgent={delegationMap.get(tool.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Tiempo total</span>
          <span className="text-sm font-mono text-cyan-400">
            {formatDuration(trace.totalDurationMs || (Date.now() - trace.startedAt))}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-zinc-400">Iteraciones (Router)</span>
          <span className="text-sm font-mono text-zinc-300">{trace.totalIterations}</span>
        </div>
        {hasSubAgents && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-700/30">
            <span className="text-xs text-violet-400 flex items-center gap-1">
              <Bot className="w-3 h-3" /> Sub-agentes
            </span>
            <span className="text-sm font-mono text-violet-300">
              {trace.subAgentTraces!.length} ({subAgentToolsCount} tools)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Timeline tool item - Enhanced with sub-agent inline display
const TimelineToolItem: React.FC<{ 
  tool: ToolTrace; 
  index: number;
  subAgent?: SubAgentTrace;
}> = ({ tool, index, subAgent }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubAgentExpanded, setIsSubAgentExpanded] = useState(false);
  const displayName = TOOL_DISPLAY_NAMES[tool.toolName] || tool.toolName;
  const isDelegation = false; // Sub-agentes eliminados - tools unificadas

  return (
    <div className="relative">
      {/* Dot on timeline - purple for delegation */}
      <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 ${
        isDelegation
          ? 'bg-violet-500/20 border-violet-400'
          : tool.success 
            ? 'bg-emerald-500/20 border-emerald-400' 
            : 'bg-red-500/20 border-red-400'
      }`} />
      
      <div className={`rounded-lg border overflow-hidden ${
        isDelegation 
          ? 'border-violet-500/30 bg-violet-500/5' 
          : 'border-zinc-700/50 bg-zinc-800/30'
      }`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full px-3 py-2 flex items-center justify-between transition-colors ${
            isDelegation ? 'hover:bg-violet-500/10' : 'hover:bg-zinc-700/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {isDelegation ? (
              <Bot className="w-4 h-4 text-violet-400" />
            ) : tool.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
            <span className={`text-xs font-medium ${
              isDelegation ? 'text-violet-300' : 'text-zinc-300'
            }`}>
              {displayName}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">({tool.toolName})</span>
            {isDelegation && subAgent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                {subAgent.toolTraces.length} tools
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-mono">
              {formatDuration(tool.durationMs)}
            </span>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </button>
        
        {isExpanded && (
          <div className="border-t border-zinc-700/50 p-3 space-y-3">
            {/* Args */}
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Argumentos</h4>
              <FullJsonViewer data={tool.toolArgs} title="Args" maxHeight="150px" />
            </div>
            
            {/* Inline Sub-Agent Display for delegation */}
            {isDelegation && subAgent && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 overflow-hidden">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSubAgentExpanded(!isSubAgentExpanded);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-violet-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-medium text-violet-300">
                      Sub-Agente: CRM Searcher
                    </span>
                    {subAgent.success ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">
                      {subAgent.toolTraces.length} tools • {subAgent.iterations} iter
                    </span>
                    {isSubAgentExpanded ? (
                      <ChevronDown className="w-4 h-4 text-violet-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-violet-400" />
                    )}
                  </div>
                </button>
                
                {isSubAgentExpanded && (
                  <div className="border-t border-violet-500/20 p-3 space-y-2">
                    {/* Task */}
                    <div className="px-2 py-1.5 bg-zinc-900/50 rounded text-xs text-zinc-400">
                      <span className="text-zinc-500">Tarea:</span> {subAgent.task}
                    </div>
                    
                    {/* Mini timeline of sub-agent tools */}
                    <div className="relative pl-3 border-l-2 border-violet-500/30 space-y-2">
                      {subAgent.toolTraces.map((subTool) => (
                        <div 
                          key={subTool.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <div className={`w-2 h-2 rounded-full ${
                            subTool.success ? 'bg-emerald-400' : 'bg-red-400'
                          }`} />
                          <span className="text-zinc-400">
                            {TOOL_DISPLAY_NAMES[subTool.toolName] || subTool.toolName}
                          </span>
                          <span className="text-zinc-600 font-mono ml-auto">
                            {formatDuration(subTool.durationMs)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Summary */}
                    {subAgent.resultSummary && (
                      <div className="px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-300">
                        {subAgent.resultSummary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Result - Larger height for response data */}
            <div>
              <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                {tool.success ? 'Resultado' : 'Error'}
              </h4>
              <FullJsonViewer 
                data={tool.success ? parseToolData(tool.data) : { error: tool.error }} 
                title={tool.success ? 'Data' : 'Error'}
                maxHeight="400px"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Tools View (detailed)
const ToolsView: React.FC<{ 
  tools: ToolTrace[]; 
  expandedTools: Set<string>;
  onToggle: (id: string) => void;
}> = ({ tools, expandedTools, onToggle }) => {
  if (tools.length === 0) {
    return (
      <div className="text-center py-8">
        <Wrench className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">No se ejecutaron herramientas en este request</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tools.map((tool, index) => {
        const isExpanded = expandedTools.has(tool.id);
        const displayName = TOOL_DISPLAY_NAMES[tool.toolName] || tool.toolName;
        
        return (
          <div 
            key={tool.id}
            className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 overflow-hidden"
          >
            <button
              onClick={() => onToggle(tool.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  tool.success ? 'bg-emerald-500/20' : 'bg-red-500/20'
                }`}>
                  {tool.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-zinc-200">{displayName}</p>
                  <p className="text-xs text-zinc-500 font-mono">{tool.toolName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-mono text-cyan-400">{formatDuration(tool.durationMs)}</p>
                  <p className="text-[10px] text-zinc-500">Iteración {tool.iteration}</p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-zinc-500" />
                )}
              </div>
            </button>
            
            {isExpanded && (
              <div className="border-t border-zinc-700/50 p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> Argumentos Enviados
                  </h4>
                  <FullJsonViewer data={tool.toolArgs} title="Arguments" maxHeight="150px" />
                </div>
                
                <div>
                  <h4 className={`text-xs font-medium mb-2 flex items-center gap-1 ${
                    tool.success ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {tool.success ? (
                      <><CheckCircle className="w-3 h-3" /> Respuesta</>
                    ) : (
                      <><XCircle className="w-3 h-3" /> Error</>
                    )}
                  </h4>
                  <FullJsonViewer 
                    data={tool.success ? parseToolData(tool.data) : { error: tool.error }} 
                    title={tool.success ? 'Response' : 'Error'}
                    maxHeight="500px"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Sub-Agents View - Shows nested tool traces from sub-agents
const SubAgentsView: React.FC<{ 
  subAgents: SubAgentTrace[]; 
  expandedTools: Set<string>;
  onToggle: (id: string) => void;
}> = ({ subAgents, expandedTools, onToggle }) => {
  if (subAgents.length === 0) {
    return (
      <div className="text-center py-8">
        <Bot className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">No se ejecutaron sub-agentes en este request</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {subAgents.map((agent) => (
        <SubAgentCard 
          key={agent.id} 
          agent={agent}
          expandedTools={expandedTools}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
};

// Individual Sub-Agent Card with nested tools
const SubAgentCard: React.FC<{ 
  agent: SubAgentTrace;
  expandedTools: Set<string>;
  onToggle: (id: string) => void;
}> = ({ agent, expandedTools, onToggle }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
      {/* Agent Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-violet-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20">
            <Bot className="w-5 h-5 text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-violet-300 flex items-center gap-2">
              {agent.agentName}
              {agent.success ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
            </p>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">{agent.id.slice(0, 12)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-mono text-cyan-400">{formatDuration(agent.durationMs)}</p>
            <p className="text-[10px] text-zinc-500">
              {agent.toolTraces.length} tools • {agent.iterations} iter
            </p>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-zinc-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-violet-500/20">
          {/* Task */}
          <div className="px-4 py-3 bg-zinc-900/50 border-b border-zinc-700/30">
            <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Tarea Asignada</h4>
            <p className="text-sm text-zinc-300">{agent.task}</p>
            {agent.hints && Object.keys(agent.hints).length > 0 && (
              <div className="mt-2">
                <span className="text-[10px] text-zinc-500">Hints: </span>
                <span className="text-xs text-zinc-400 font-mono">
                  {JSON.stringify(agent.hints)}
                </span>
              </div>
            )}
          </div>

          {/* Nested Tool Traces */}
          <div className="p-4">
            <h4 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Tools del Sub-Agente ({agent.toolTraces.length})
            </h4>
            
            <div className="space-y-3">
              {agent.toolTraces.map((tool) => {
                const isToolExpanded = expandedTools.has(tool.id);
                const displayName = TOOL_DISPLAY_NAMES[tool.toolName] || tool.toolName;
                
                return (
                  <div 
                    key={tool.id}
                    className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 overflow-hidden"
                  >
                    <button
                      onClick={() => onToggle(tool.id)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-zinc-700/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {tool.success ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-xs font-medium text-zinc-300">{displayName}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">({tool.toolName})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {formatDuration(tool.durationMs)}
                        </span>
                        {isToolExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                    </button>
                    
                    {isToolExpanded && (
                      <div className="border-t border-zinc-700/50 p-3 space-y-3">
                        {/* Args */}
                        <div>
                          <h5 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                            Argumentos
                          </h5>
                          <FullJsonViewer data={tool.toolArgs} title="Args" maxHeight="120px" />
                        </div>
                        
                        {/* Result - Full data for debugging */}
                        <div>
                          <h5 className={`text-[10px] uppercase tracking-wide mb-1 ${
                            tool.success ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                            {tool.success ? '✓ Respuesta Completa' : '✗ Error'}
                          </h5>
                          <FullJsonViewer 
                            data={tool.success ? parseToolData(tool.data) : { error: tool.error }} 
                            title={tool.success ? 'Response' : 'Error'}
                            maxHeight="600px"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          {agent.resultSummary && (
            <div className="px-4 py-3 bg-zinc-900/50 border-t border-zinc-700/30">
              <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Resumen</h4>
              <p className="text-xs text-zinc-400">{agent.resultSummary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Raw JSON View
const RawJsonView: React.FC<{ trace: RequestTrace }> = ({ trace }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-400">Trace Completo</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 rounded transition-colors"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Copiar JSON</>
          )}
        </button>
      </div>
      
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-950/50 p-4 max-h-[500px] overflow-auto scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600">
        <JsonViewer data={trace} maxInitialDepth={3} />
      </div>
    </div>
  );
};

export default TraceDetailModal;
