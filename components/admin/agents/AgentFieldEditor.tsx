'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Save, 
  Eye, 
  Code, 
  History,
  Maximize2,
  Minimize2,
  RotateCcw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Agent, AGENT_FIELDS } from '../../../types/agent';
import { useAgentsStore } from '../../../store/agentsStore';

type EditorMode = 'edit' | 'preview' | 'history';

interface AgentFieldEditorProps {
  agent: Agent;
  fieldKey: string;
  onClose: () => void;
  onSave: (value: any) => void;
  canEdit: boolean;
}

export const AgentFieldEditor: React.FC<AgentFieldEditorProps> = ({
  agent,
  fieldKey,
  onClose,
  onSave,
  canEdit
}) => {
  const field = AGENT_FIELDS.find(f => f.key === fieldKey);
  const initialValue = (agent as any)[fieldKey] || '';
  
  const [value, setValue] = useState<string>(
    typeof initialValue === 'object' 
      ? JSON.stringify(initialValue, null, 2) 
      : String(initialValue || '')
  );
  const [mode, setMode] = useState<EditorMode>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  const fetchHistory = useAgentsStore(s => s.fetchHistory);
  const history = useAgentsStore(s => s.history);
  const isLoadingHistory = useAgentsStore(s => s.isLoadingHistory);
  
  const hasChanges = value !== (typeof initialValue === 'object' 
    ? JSON.stringify(initialValue, null, 2) 
    : String(initialValue || ''));
  
  const isJson = field?.type === 'json';
  
  // Load history when switching to history mode
  useEffect(() => {
    if (mode === 'history') {
      fetchHistory(agent.id, fieldKey);
    }
  }, [mode, agent.id, fieldKey, fetchHistory]);
  
  // Validate JSON
  useEffect(() => {
    if (isJson && value.trim()) {
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch (e: any) {
        setJsonError(e.message);
      }
    } else {
      setJsonError(null);
    }
  }, [value, isJson]);
  
  const handleSave = () => {
    if (isJson) {
      try {
        const parsed = value.trim() ? JSON.parse(value) : null;
        onSave(parsed);
      } catch {
        return; // Don't save invalid JSON
      }
    } else {
      onSave(value || null);
    }
  };
  
  const handleRestore = (historicalValue: string | null) => {
    if (historicalValue !== null) {
      setValue(historicalValue);
      setMode('edit');
    }
  };
  
  const handleClose = () => {
    if (hasChanges && canEdit) {
      if (confirm('¿Descartar cambios sin guardar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  // Format date for history
  const formatHistoryDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div 
        className={`
          bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl flex flex-col
          ${isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-full max-w-4xl h-[85vh] mx-4'
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {field?.label || fieldKey}
            </h2>
            {field?.description && (
              <p className="text-xs text-zinc-500 mt-0.5">{field.description}</p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Mode tabs */}
            <div className="flex items-center bg-zinc-900/50 rounded-lg p-1 mr-2">
              <button
                onClick={() => setMode('edit')}
                className={`
                  px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                  ${mode === 'edit' 
                    ? 'bg-violet-500/20 text-violet-400' 
                    : 'text-zinc-500 hover:text-zinc-300'
                  }
                `}
              >
                <Code className="w-3 h-3 inline mr-1" />
                Editar
              </button>
              <button
                onClick={() => setMode('preview')}
                className={`
                  px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                  ${mode === 'preview' 
                    ? 'bg-violet-500/20 text-violet-400' 
                    : 'text-zinc-500 hover:text-zinc-300'
                  }
                `}
              >
                <Eye className="w-3 h-3 inline mr-1" />
                Vista
              </button>
              <button
                onClick={() => setMode('history')}
                className={`
                  px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                  ${mode === 'history' 
                    ? 'bg-violet-500/20 text-violet-400' 
                    : 'text-zinc-500 hover:text-zinc-300'
                  }
                `}
              >
                <History className="w-3 h-3 inline mr-1" />
                Historial
              </button>
            </div>
            
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            
            {/* Close */}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {mode === 'edit' && (
            <div className="h-full p-4">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!canEdit}
                placeholder={field?.placeholder || 'Escribe aquí...'}
                className={`
                  w-full h-full bg-black/40 border rounded-xl px-4 py-3 text-sm text-zinc-200 
                  placeholder:text-zinc-600 outline-none resize-none font-mono
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${jsonError 
                    ? 'border-red-500/40 focus:border-red-500/60' 
                    : 'border-white/10 focus:border-violet-500/50'
                  }
                `}
                spellCheck={!isJson}
              />
              {jsonError && (
                <p className="text-xs text-red-400 mt-2">JSON inválido: {jsonError}</p>
              )}
            </div>
          )}
          
          {mode === 'preview' && (
            <div className="h-full p-6 overflow-y-auto">
              {value.trim() ? (
                isJson ? (
                  <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(value), null, 2);
                      } catch {
                        return value;
                      }
                    })()}
                  </pre>
                ) : (
                  <div className="prose prose-invert max-w-none prose-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {value}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                <p className="text-zinc-600 italic">Sin contenido</p>
              )}
            </div>
          )}
          
          {mode === 'history' && (
            <div className="h-full p-4 overflow-y-auto">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">Sin historial de cambios</p>
                  <p className="text-xs text-zinc-600 mt-1">Los cambios aparecerán aquí después de guardar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div 
                      key={entry.id}
                      className="p-4 rounded-xl bg-zinc-900/50 border border-white/5"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm text-zinc-300">
                            {entry.usuario 
                              ? `${entry.usuario.nombre} ${entry.usuario.apellido?.charAt(0)}.`
                              : 'Sistema'
                            }
                          </p>
                          <p className="text-[10px] text-zinc-600">
                            {formatHistoryDate(entry.created_at)}
                          </p>
                        </div>
                        
                        {canEdit && entry.valor_anterior !== null && (
                          <button
                            onClick={() => handleRestore(entry.valor_anterior)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px]"
                            title="Restaurar esta versión"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar
                          </button>
                        )}
                      </div>
                      
                      {entry.mensaje_commit && (
                        <p className="text-xs text-zinc-400 italic mb-2">
                          &quot;{entry.mensaje_commit}&quot;
                        </p>
                      )}
                      
                      <div className="text-[10px] font-mono">
                        {entry.valor_anterior && (
                          <div className="p-2 rounded bg-red-500/10 text-red-400/80 mb-1 line-clamp-3">
                            - {entry.valor_anterior.slice(0, 200)}
                            {(entry.valor_anterior.length || 0) > 200 && '...'}
                          </div>
                        )}
                        {entry.valor_nuevo && (
                          <div className="p-2 rounded bg-emerald-500/10 text-emerald-400/80 line-clamp-3">
                            + {entry.valor_nuevo.slice(0, 200)}
                            {(entry.valor_nuevo.length || 0) > 200 && '...'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <div className="text-xs text-zinc-600">
            {hasChanges && canEdit && (
              <span className="text-amber-400">● Cambios sin guardar</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-sm"
            >
              {hasChanges && canEdit ? 'Descartar' : 'Cerrar'}
            </button>
            
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={!hasChanges || (isJson && !!jsonError)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${hasChanges && !jsonError
                    ? 'bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30'
                    : 'bg-zinc-900/50 border border-white/5 text-zinc-600 cursor-not-allowed'
                  }
                `}
              >
                <Save className="w-4 h-4" />
                Aplicar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
