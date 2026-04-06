'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Globe,
  FileText,
  Trash2,
  BookOpen,
  Info
} from 'lucide-react';
import { sanitizeHtml } from '../lib/sanitize-html';
import { useDeepResearchStore, selectPanel, selectActiveJobs, selectRecentJobs, selectIsSubmitting, selectError } from '../store/deepResearchStore';
import { useArtifactStore } from '../store/artifactStore';
import { useAuthStore } from '../store/authStore';
import { 
  RESEARCH_STATUS_LABELS, 
  RESEARCH_STATUS_COLORS,
  formatResearchDuration,
  DeepResearchJob 
} from '../types/deep-research';

// ============================================================================
// DEEP RESEARCH PANEL - Monica Deep Research con Firecrawl
// Tema: Morado Minimalista
// ============================================================================

interface DeepResearchPanelProps {
  onOpenArtifactSidebar?: () => void;
}

export const DeepResearchPanel: React.FC<DeepResearchPanelProps> = ({ 
  onOpenArtifactSidebar 
}) => {
  const user = useAuthStore(state => state.user);
  
  // Store state
  const panel = useDeepResearchStore(selectPanel);
  const activeJobs = useDeepResearchStore(selectActiveJobs);
  const recentJobs = useDeepResearchStore(selectRecentJobs);
  const isSubmitting = useDeepResearchStore(selectIsSubmitting);
  const storeError = useDeepResearchStore(selectError);
  
  // Store actions
  const startResearch = useDeepResearchStore(state => state.startResearch);
  const cancelResearch = useDeepResearchStore(state => state.cancelResearch);
  const toggleExpanded = useDeepResearchStore(state => state.toggleExpanded);
  const setInputValue = useDeepResearchStore(state => state.setInputValue);
  const clearError = useDeepResearchStore(state => state.clearError);
  
  // Artifact store for opening results
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);
  const initialize = useDeepResearchStore(state => state.initialize);
  
  // Local state
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);

  // Initialize store (resume polling)
  useEffect(() => {
    initialize();
  }, [initialize]);

  const runDiagnostic = async () => {
    setIsDiagnosticRunning(true);
    setDiagnosticResult(null);
    try {
      const response = await fetch('/api/deep-research?diagnostic=true');
      const data = await response.json();
      setDiagnosticResult(data);
    } catch (e) {
      setDiagnosticResult({ status: 'error', message: 'No se pudo contactar con el servidor' });
    } finally {
      setIsDiagnosticRunning(false);
    }
  };
  
  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [panel.inputValue]);
  
  // Handle submit
  const handleSubmit = async () => {
    if (!panel.inputValue.trim() || isSubmitting || !user) return;
    
    const prompt = panel.inputValue.trim();
    // Don't clear input yet, wait for success or keep for retry
    
    const jobId = await startResearch(user.id, { prompt });
    if (jobId) {
      setInputValue('');
      clearError();
    }
  };

  const handleRetryJob = async (job: DeepResearchJob) => {
    if (!user) return;
    clearError();
    await startResearch(user.id, { 
      prompt: job.prompt,
      urls: job.urls,
      schema: job.schema
    });
  };

  const handleRetry = () => {
    handleSubmit();
  };
  
  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  // Open artifact result
  const handleOpenResult = (artifactId: string) => {
    openExistingArtifact(artifactId);
  };
  
  // Completed and failed jobs
  const completedWithArtifacts = recentJobs.filter(j => 
    j.status === 'completed' && j.artifact_id
  );

  const failedJobs = recentJobs.filter(j => j.status === 'failed');
  
  return (
    <div className="px-4 py-3">
      {/* Panel Container - Tema Morado */}
      <div className={`
        rounded-xl border transition-all duration-300
        ${panel.isExpanded || isFocused
          ? 'bg-violet-950/30 border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.15)]'
          : 'bg-zinc-900/50 border-white/5 hover:border-violet-500/20'
        }
      `}>
        {/* Header */}
        <button
          onClick={toggleExpanded}
          className="w-full flex items-center justify-between px-4 py-3 group"
        >
          <div className="flex items-center gap-3">
            <div className={`
              w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${panel.isExpanded 
                ? 'bg-violet-500/20 text-violet-400' 
                : 'bg-zinc-800 text-zinc-400 group-hover:bg-violet-500/10 group-hover:text-violet-400'
              }
            `}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex flex-col items-start">
              <span className={`text-sm font-semibold transition-colors ${
                panel.isExpanded ? 'text-violet-300' : 'text-zinc-300 group-hover:text-violet-300'
              }`}>
                Deep Research
              </span>
              <span className="text-[10px] text-zinc-500">Monica AI</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Active jobs indicator */}
            {activeJobs.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-violet-500/20 rounded-full">
                <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
                <span className="text-[10px] font-bold text-violet-400">
                  {activeJobs.length}
                </span>
              </div>
            )}
            
            {panel.isExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </button>
        
        {/* Expanded Content */}
        {panel.isExpanded && (
          <div className="px-4 pb-4 space-y-4 animate-fade-in">
            {/* Search Input */}
            <div className={`
              relative rounded-lg border transition-all
              ${isFocused 
                ? 'bg-black/40 border-violet-500/50 shadow-[0_0_10px_rgba(139,92,246,0.2)]' 
                : 'bg-black/20 border-white/10'
              }
            `}>
              <div className="absolute left-3 top-3 text-violet-400">
                <Globe className="w-4 h-4" />
              </div>
              
              <textarea
                ref={inputRef}
                value={panel.inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder="¿Qué deseas investigar en la web?"
                rows={1}
                className="w-full pl-10 pr-12 py-3 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                disabled={isSubmitting}
              />
              
              <button
                onClick={handleSubmit}
                disabled={!panel.inputValue.trim() || isSubmitting}
                className={`
                  absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all
                  ${panel.inputValue.trim() && !isSubmitting
                    ? 'bg-violet-500 text-white hover:bg-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.4)]'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }
                `}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Error Message with Retry */}
            {storeError && (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span className="text-xs text-rose-200">{sanitizeHtml(storeError)}</span>
                  </div>
                  <button
                    onClick={handleRetry}
                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300 uppercase tracking-wider"
                  >
                    Reintentar
                  </button>
                </div>
                
                <button
                  onClick={runDiagnostic}
                  disabled={isDiagnosticRunning}
                  className="w-full py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] rounded-lg border border-white/5 transition-all flex items-center justify-center gap-2"
                >
                  {isDiagnosticRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Info className="w-3 h-3" />
                  )}
                  Verificar Configuración del Sistema
                </button>

                {diagnosticResult && (
                  <div className="p-3 bg-black/40 border border-zinc-800 rounded-lg space-y-2 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1 mb-1">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Diagnóstico</span>
                      <button onClick={() => setDiagnosticResult(null)}><XCircle className="w-3 h-3 text-zinc-600 hover:text-zinc-400" /></button>
                    </div>
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-500">Base de Datos:</span>
                        <span className={diagnosticResult.database?.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                          {diagnosticResult.database?.status === 'ok' ? 'Conectado' : 'Error'}
                        </span>
                      </div>
                      {diagnosticResult.database?.status !== 'ok' && diagnosticResult.database?.message && (
                        <p className="text-[9px] text-rose-400/80 leading-tight border-l border-rose-500/30 pl-2 ml-1">
                          {diagnosticResult.database.message}
                        </p>
                      )}
                      {diagnosticResult.database?.hint && (
                        <p className="text-[9px] text-amber-400/80 leading-tight italic border-l border-amber-500/30 pl-2 ml-1">
                          💡 {diagnosticResult.database.hint}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-500">Firecrawl API:</span>
                        <span className={diagnosticResult.env?.hasFirecrawlKey ? 'text-emerald-400' : 'text-rose-400'}>
                          {diagnosticResult.env?.hasFirecrawlKey ? 'Configurada' : 'Faltante'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-500">Webhook URL:</span>
                        <span className={diagnosticResult.env?.appUrl !== 'not set' ? 'text-emerald-400' : 'text-amber-400'}>
                          {diagnosticResult.env?.appUrl !== 'not set' ? 'Detectada' : 'No configurada'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Active and Failed Jobs */}
            {(activeJobs.length > 0 || failedJobs.length > 0) && (
              <div className="space-y-2">
                {activeJobs.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-1">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Investigando...
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-violet-400/70 italic">
                        <Info className="w-3 h-3" />
                        Puedes cerrar esta pestaña, la búsqueda continuará
                      </div>
                    </div>
                    {activeJobs.map(job => (
                      <div
                        key={job.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20"
                      >
                        <div className="shrink-0">
                          <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-violet-200 truncate">
                            {sanitizeHtml(job.prompt)}
                          </p>
                          <p className="text-[10px] text-violet-400/70 mt-0.5">
                            {job.started_at && formatResearchDuration(job.started_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => cancelResearch(job.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Cancelar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {failedJobs.length > 0 && (
                  <>
                    <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider px-1 mt-2">
                      Fallidas / Errores
                    </div>
                    {failedJobs.map(job => (
                      <div
                        key={job.id}
                        className="flex flex-col gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="shrink-0">
                            <XCircle className="w-4 h-4 text-rose-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-rose-200 truncate">
                              {sanitizeHtml(job.prompt)}
                            </p>
                            <p className="text-[10px] text-rose-400/70 mt-0.5">
                              {sanitizeHtml(job.error || 'Error desconocido')}
                            </p>
                          </div>
                          <button
                            onClick={() => cancelResearch(job.id)}
                            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleRetryJob(job)}
                          className="w-full py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold uppercase tracking-wider rounded transition-all"
                        >
                          Reintentar Investigación
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            
            {/* Recent Completed */}
            {completedWithArtifacts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Investigaciones Recientes
                  </span>
                  {onOpenArtifactSidebar && (
                    <button
                      onClick={onOpenArtifactSidebar}
                      className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                    >
                      Ver todas <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                
                <div className="space-y-1.5">
                  {completedWithArtifacts.slice(0, 3).map(job => (
                    <button
                      key={job.id}
                      onClick={() => job.artifact_id && handleOpenResult(job.artifact_id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900/50 border border-white/5 hover:border-violet-500/30 hover:bg-violet-950/20 transition-all text-left group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-300 truncate group-hover:text-violet-300 transition-colors">
                          {sanitizeHtml(job.prompt)}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-zinc-600">
                            {job.completed_at && new Date(job.completed_at).toLocaleDateString('es', {
                              day: 'numeric',
                              month: 'short'
                            })}
                          </span>
                          {job.credits_used && (
                            <span className="text-[10px] text-zinc-600">
                              • {job.credits_used} créditos
                            </span>
                          )}
                        </div>
                      </div>
                      <FileText className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Empty state */}
            {activeJobs.length === 0 && completedWithArtifacts.length === 0 && (
              <div className="text-center py-4">
                <BookOpen className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">
                  Escribe tu consulta para comenzar una investigación profunda en la web
                </p>
              </div>
            )}
            
            {/* Footer tip */}
            <div className="flex items-center gap-2 px-1 pt-2 border-t border-white/5">
              <Sparkles className="w-3 h-3 text-violet-500" />
              <span className="text-[10px] text-zinc-600">
                Powered by Firecrawl Agent • Los resultados se guardan como artefactos
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeepResearchPanel;
