'use client';

import React, { useState, useMemo, memo } from 'react';
import { ChevronDown, ChevronUp, Wrench, Clock, CheckCircle, XCircle, Eye, Database } from 'lucide-react';
import { RequestTrace, ToolTrace } from '@/types/observability';

interface TraceAccordionProps {
  trace: RequestTrace;
  onViewDetail: () => void;
}

// Format duration in human-readable format
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// Tool name to friendly name mapping
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
};

// Get data preview summary
const getDataPreview = (data: any): string => {
  if (!data) return '';
  if (Array.isArray(data)) {
    return `${data.length} resultados`;
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.includes('data') && Array.isArray(data.data)) {
      return `${data.data.length} resultados`;
    }
    if (keys.includes('count')) {
      return `${data.count} items`;
    }
    return `${keys.length} campos`;
  }
  return String(data).slice(0, 30);
};

const TraceAccordion: React.FC<TraceAccordionProps> = memo(({ trace, onViewDetail }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { totalTools, successfulTools, totalDuration } = useMemo(() => ({
    totalTools: trace.toolTraces.length,
    successfulTools: trace.toolTraces.filter(t => t.success).length,
    totalDuration: trace.totalDurationMs || (Date.now() - trace.startedAt)
  }), [trace]);

  // Don't render if no tools were called
  if (totalTools === 0) {
    return null;
  }

  return (
    <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-900/50 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Wrench className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs text-zinc-300">
            <span className="font-medium text-cyan-400">{totalTools}</span>
            {' '}tool{totalTools !== 1 ? 's' : ''}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(totalDuration)}
          </span>
          {successfulTools < totalTools && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-xs text-amber-400">
                {totalTools - successfulTools} error{totalTools - successfulTools !== 1 ? 'es' : ''}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-zinc-700/50">
          {/* Tool list with data preview */}
          <div className="px-3 py-2 space-y-1.5">
            {trace.toolTraces.map((tool) => (
              <ToolTraceRow key={tool.id} tool={tool} />
            ))}
          </div>
          
          {/* View detail button */}
          <div className="px-3 py-2 border-t border-zinc-700/50 bg-zinc-800/30">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDetail();
              }}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Ver detalle completo
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
TraceAccordion.displayName = 'TraceAccordion';

// Individual tool trace row with data preview
const ToolTraceRow: React.FC<{ tool: ToolTrace }> = memo(({ tool }) => {
  const displayName = TOOL_DISPLAY_NAMES[tool.toolName] || tool.toolName;
  const dataPreview = useMemo(() => getDataPreview(tool.data), [tool.data]);
  
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded bg-zinc-800/30">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {tool.success ? (
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
        )}
        <span className="text-xs text-zinc-300 truncate">{displayName}</span>
        {/* Data preview badge */}
        {dataPreview && tool.success && (
          <span className="text-[10px] text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Database className="w-2.5 h-2.5" />
            {dataPreview}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-zinc-500 font-mono">
          {formatDuration(tool.durationMs)}
        </span>
      </div>
    </div>
  );
});
ToolTraceRow.displayName = 'ToolTraceRow';

export default TraceAccordion;
