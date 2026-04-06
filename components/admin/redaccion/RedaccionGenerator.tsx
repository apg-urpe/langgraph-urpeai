'use client';

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  Ban,
} from 'lucide-react';
import {
  useRedaccionStore,
  selectTipos,
  selectIsGenerating,
  selectGenerationProgress,
  selectContextOrganized,
  selectContextPhase,
  selectContextSources,
} from '@/store/redaccionStore';
import { useContactStore, selectSelectedEnterpriseId } from '@/store/contactStore';
import type { GenerationPhase } from '@/types/redaccion';
import { ContextManager } from './ContextManager';
import { ContactPicker } from './ContactPicker';

// ============================================================================
// REDACCION GENERATOR — Modal para generar documentos con IA
// ============================================================================

const PHASE_LABELS: Record<GenerationPhase, string> = {
  idle: '',
  planning: 'Planificando estructura del documento...',
  writing: 'Redactando secciones...',
  complete: 'Documento generado exitosamente',
  error: 'Error en la generación',
};

export const RedaccionGenerator: React.FC = () => {
  const enterpriseId = useContactStore(selectSelectedEnterpriseId);
  const tipos = useRedaccionStore(selectTipos);
  const isGenerating = useRedaccionStore(selectIsGenerating);
  const progress = useRedaccionStore(selectGenerationProgress);

  const contextOrganized = useRedaccionStore(selectContextOrganized);
  const contextPhase = useRedaccionStore(selectContextPhase);
  const contextSources = useRedaccionStore(selectContextSources);

  const setShowGenerator = useRedaccionStore(state => state.setShowGenerator);
  const startGeneration = useRedaccionStore(state => state.startGeneration);
  const cancelGeneration = useRedaccionStore(state => state.cancelGeneration);
  const resetGeneration = useRedaccionStore(state => state.resetGeneration);
  const selectRedaccion = useRedaccionStore(state => state.selectRedaccion);
  const fetchRedacciones = useRedaccionStore(state => state.fetchRedacciones);
  const clearContext = useRedaccionStore(state => state.clearContext);

  // Form state
  const [notasAdicionales, setNotasAdicionales] = useState('');
  const [tipoId, setTipoId] = useState<number | null>(null);
  const [contactoId, setContactoId] = useState<number | null>(null);

  // Can submit: either organized context is ready OR user typed enough notes manually
  const hasContext = contextPhase === 'ready' && contextOrganized !== null;
  const hasManualNotes = notasAdicionales.trim().length >= 10;
  const canSubmit = (hasContext || hasManualNotes) && tipoId !== null && !isGenerating;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !enterpriseId || !tipoId) return;

    // Build contexto: organized JSON + optional manual notes
    const parts: string[] = [];
    if (contextOrganized) {
      parts.push('## DATOS ORGANIZADOS\n' + JSON.stringify(contextOrganized, null, 2));
    }
    if (notasAdicionales.trim()) {
      parts.push('## NOTAS ADICIONALES\n' + notasAdicionales.trim());
    }

    await startGeneration({
      contexto: parts.join('\n\n'),
      tipo_id: tipoId,
      empresa_id: enterpriseId,
      contacto_id: contactoId || undefined,
      contexto_structured: contextOrganized || undefined,
    });
  }, [canSubmit, enterpriseId, tipoId, contextOrganized, notasAdicionales, startGeneration, contactoId]);

  const handleClose = useCallback(() => {
    if (isGenerating) return;
    resetGeneration();
    clearContext();
    setShowGenerator(false);
  }, [isGenerating, resetGeneration, clearContext, setShowGenerator]);

  const handleViewDocument = useCallback(async () => {
    if (!progress.redaccionId || !enterpriseId) return;
    // Refresh list to include the new doc, then navigate
    await fetchRedacciones(enterpriseId);
    const redacciones = useRedaccionStore.getState().redacciones;
    const newDoc = redacciones.find(r => r.id === progress.redaccionId);
    if (newDoc) {
      selectRedaccion(newDoc);
    }
    resetGeneration();
    setShowGenerator(false);
  }, [progress.redaccionId, enterpriseId, fetchRedacciones, selectRedaccion, resetGeneration, setShowGenerator]);

  const selectedTipo = tipos.find(t => t.id === tipoId);
  const progressPercent = progress.totalSections > 0
    ? Math.round((progress.currentSection / progress.totalSections) * 100)
    : 0;

  const isIdle = progress.phase === 'idle';
  const isComplete = progress.phase === 'complete';
  const isError = progress.phase === 'error';
  const showForm = isIdle || isError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111114] border border-zinc-800/60 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-zinc-100">Generar con IA</h3>
          </div>
          {!isGenerating && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ======== FORM STATE ======== */}
          {showForm && (
            <>
              {/* Error banner */}
              {isError && progress.error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{progress.error}</p>
                </div>
              )}

              {/* Tipo selector */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Tipo de documento
                </label>
                <select
                  value={tipoId ?? ''}
                  onChange={e => setTipoId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-900/60 border border-zinc-700/50 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                >
                  <option value="">Seleccionar tipo...</option>
                  {tipos.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre} ({t.partes} partes)</option>
                  ))}
                </select>
              </div>

              {/* Tipo info */}
              {selectedTipo && (
                <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30 space-y-1">
                  <p className="text-xs text-zinc-500">
                    <span className="text-zinc-400 font-medium">Partes:</span> {selectedTipo.partes}
                    {selectedTipo.longitud && <> · <span className="text-zinc-400 font-medium">~{selectedTipo.longitud} palabras/sección</span></>}
                  </p>
                  {selectedTipo.objetivo && (
                    <p className="text-xs text-zinc-500">
                      <span className="text-zinc-400 font-medium">Objetivo:</span> {selectedTipo.objetivo}
                    </p>
                  )}
                </div>
              )}

              {/* Contacto (opcional) */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Contacto asociado (opcional)
                </label>
                <ContactPicker
                  empresaId={enterpriseId}
                  selectedContactId={contactoId}
                  onSelect={(id) => setContactoId(id)}
                />
              </div>

              {/* Context Manager */}
              <div className="border border-zinc-800/40 rounded-lg p-3 bg-zinc-900/20">
                <ContextManager />
              </div>

              {/* Notas adicionales */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Notas adicionales (opcional)
                </label>
                <textarea
                  value={notasAdicionales}
                  onChange={e => setNotasAdicionales(e.target.value)}
                  placeholder="Instrucciones extras, aclaraciones, o contexto manual..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-900/60 border border-zinc-700/50 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary-500/50 resize-none"
                />
                {!hasContext && (
                  <p className="text-xs text-zinc-600 mt-1">
                    {hasManualNotes ? '✓ Notas como contexto' : 'Sube archivos arriba o escribe al menos 10 caracteres'}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ======== PROGRESS STATE ======== */}
          {(progress.phase === 'planning' || progress.phase === 'writing') && (
            <div className="space-y-4">
              {/* Phase label */}
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-sm text-zinc-300">{PHASE_LABELS[progress.phase]}</span>
              </div>

              {/* Progress bar */}
              {progress.phase === 'writing' && progress.totalSections > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Sección {progress.currentSection} de {progress.totalSections}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {progress.currentTitle && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <FileText className="w-3 h-3" />
                      <span>Redactando: {progress.currentTitle}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Planning animation */}
              {progress.phase === 'planning' && (
                <div className="flex flex-col items-center py-6 gap-3">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
                      <Sparkles className="w-7 h-7 text-amber-400 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 text-center">
                    La IA está analizando el contexto y planificando<br />la estructura del documento...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ======== COMPLETE STATE ======== */}
          {isComplete && (
            <div className="flex flex-col items-center py-6 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-200">Documento generado</p>
                <p className="text-xs text-zinc-500">
                  {progress.totalSections} secciones redactadas exitosamente
                </p>
              </div>
              <button
                onClick={handleViewDocument}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 transition-colors text-sm font-medium"
              >
                <FileText className="w-4 h-4" />
                Ver documento
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/50 flex items-center justify-end gap-2">
          {isGenerating && (
            <button
              onClick={cancelGeneration}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancelar
            </button>
          )}

          {showForm && (
            <>
              <button
                onClick={handleClose}
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generar documento
              </button>
            </>
          )}

          {isComplete && (
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RedaccionGenerator;
