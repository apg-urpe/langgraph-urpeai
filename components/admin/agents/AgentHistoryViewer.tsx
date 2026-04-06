'use client';

import React, { useEffect, useState } from 'react';
import { X, History, RotateCcw, ChevronDown, User, Clock } from 'lucide-react';
import { useAgentsStore } from '../../../store/agentsStore';
import { AGENT_FIELDS } from '../../../types/agent';

interface AgentHistoryViewerProps {
  agentId: number;
  onClose: () => void;
}

export const AgentHistoryViewer: React.FC<AgentHistoryViewerProps> = ({
  agentId,
  onClose
}) => {
  const fetchHistory = useAgentsStore(s => s.fetchHistory);
  const restoreFromHistory = useAgentsStore(s => s.restoreFromHistory);
  const history = useAgentsStore(s => s.history);
  const isLoading = useAgentsStore(s => s.isLoadingHistory);
  const isSaving = useAgentsStore(s => s.isSaving);
  
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  
  useEffect(() => {
    fetchHistory(agentId, selectedField || undefined);
  }, [agentId, selectedField, fetchHistory]);
  
  const toggleExpand = (entryId: number) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };
  
  const handleRestore = async (historialId: number) => {
    if (confirm('¿Restaurar este valor? Esto creará un nuevo registro en el historial.')) {
      await restoreFromHistory(historialId);
      fetchHistory(agentId, selectedField || undefined);
    }
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  const getFieldLabel = (fieldKey: string) => {
    const field = AGENT_FIELDS.find(f => f.key === fieldKey);
    return field?.label || fieldKey;
  };
  
  // Get unique fields in history
  const uniqueFields = Array.from(new Set(history.map(h => h.campo)));
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <History className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Historial de Cambios</h2>
              <p className="text-xs text-zinc-500">Registro de todas las modificaciones</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Filter */}
        <div className="px-6 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedField(null)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${!selectedField 
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' 
                  : 'bg-zinc-900/50 text-zinc-400 border border-white/5 hover:border-white/10'
                }
              `}
            >
              Todos
            </button>
            {uniqueFields.map(field => (
              <button
                key={field}
                onClick={() => setSelectedField(field)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${selectedField === field 
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' 
                    : 'bg-zinc-900/50 text-zinc-400 border border-white/5 hover:border-white/10'
                  }
                `}
              >
                {getFieldLabel(field)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
              <p className="text-zinc-400">Sin historial de cambios</p>
              <p className="text-xs text-zinc-600 mt-1">
                Los cambios aparecerán aquí cuando se modifique la configuración
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => {
                const isExpanded = expandedEntries.has(entry.id);
                
                return (
                  <div 
                    key={entry.id}
                    className="rounded-xl border border-white/5 bg-zinc-900/30 overflow-hidden"
                  >
                    {/* Entry header */}
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800/50 flex items-center justify-center">
                          <User className="w-4 h-4 text-zinc-500" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm text-zinc-200">
                            {entry.usuario 
                              ? `${entry.usuario.nombre} ${entry.usuario.apellido?.charAt(0)}.`
                              : 'Sistema'
                            }
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              {getFieldLabel(entry.campo)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(entry.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <ChevronDown className={`
                        w-4 h-4 text-zinc-500 transition-transform
                        ${isExpanded ? 'rotate-180' : ''}
                      `} />
                    </button>
                    
                    {/* Entry content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {entry.mensaje_commit && (
                          <p className="text-xs text-zinc-400 italic border-l-2 border-violet-500/30 pl-3">
                            &quot;{entry.mensaje_commit}&quot;
                          </p>
                        )}
                        
                        <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                          {entry.valor_anterior && (
                            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                              <p className="text-[10px] text-red-400/60 uppercase tracking-wider mb-1">Valor anterior</p>
                              <pre className="text-red-300/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                                {entry.valor_anterior}
                              </pre>
                            </div>
                          )}
                          
                          {entry.valor_nuevo && (
                            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                              <p className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-1">Valor nuevo</p>
                              <pre className="text-emerald-300/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                                {entry.valor_nuevo}
                              </pre>
                            </div>
                          )}
                        </div>
                        
                        {entry.valor_anterior && (
                          <button
                            onClick={() => handleRestore(entry.id)}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar valor anterior
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
