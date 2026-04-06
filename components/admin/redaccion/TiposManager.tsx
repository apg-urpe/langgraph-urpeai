'use client';

import React, { useState, useCallback } from 'react';
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Save,
  Loader2,
  FileType,
  AlertTriangle,
} from 'lucide-react';
import { useRedaccionStore, selectTipos, selectIsLoadingTipos } from '@/store/redaccionStore';
import { useContactStore, selectSelectedEnterpriseId } from '@/store/contactStore';
import { RedaccionTipo } from '@/types/redaccion';

// ============================================================================
// FORM STATE
// ============================================================================

interface TipoForm {
  nombre: string;
  partes: number;
  instrucciones: string;
  longitud: number | null;
  objetivo: string;
  requerimientos: string;
}

const EMPTY_FORM: TipoForm = {
  nombre: '',
  partes: 1,
  instrucciones: '',
  longitud: null,
  objetivo: '',
  requerimientos: '',
};

// ============================================================================
// TIPOS MANAGER
// ============================================================================

export const TiposManager: React.FC = () => {
  const tipos = useRedaccionStore(selectTipos);
  const isLoadingTipos = useRedaccionStore(selectIsLoadingTipos);
  const isSaving = useRedaccionStore(state => state.isSavingTipo);
  const error = useRedaccionStore(state => state.error);
  const createTipo = useRedaccionStore(state => state.createTipo);
  const updateTipo = useRedaccionStore(state => state.updateTipo);
  const deleteTipo = useRedaccionStore(state => state.deleteTipo);
  const setShowTiposManager = useRedaccionStore(state => state.setShowTiposManager);
  const clearError = useRedaccionStore(state => state.clearError);

  const enterpriseId = useContactStore(selectSelectedEnterpriseId);

  // Local UI state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<TipoForm>({ ...EMPTY_FORM });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ========== HANDLERS ==========

  const startCreate = useCallback(() => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setIsCreating(true);
    clearError();
  }, [clearError]);

  const startEdit = useCallback((tipo: RedaccionTipo) => {
    setIsCreating(false);
    setEditingId(tipo.id);
    setForm({
      nombre: tipo.nombre,
      partes: tipo.partes,
      instrucciones: tipo.instrucciones || '',
      longitud: tipo.longitud,
      objetivo: tipo.objetivo || '',
      requerimientos: tipo.requerimientos || '',
    });
    clearError();
  }, [clearError]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setIsCreating(false);
    setForm({ ...EMPTY_FORM });
    clearError();
  }, [clearError]);

  const handleSave = useCallback(async () => {
    if (!form.nombre.trim()) return;
    if (!enterpriseId) return;

    if (isCreating) {
      const result = await createTipo({
        nombre: form.nombre.trim(),
        partes: form.partes,
        instrucciones: form.instrucciones.trim() || null,
        longitud: form.longitud,
        objetivo: form.objetivo.trim() || null,
        requerimientos: form.requerimientos.trim() || null,
        empresa_id: enterpriseId,
      });
      if (result) {
        cancelEdit();
      }
    } else if (editingId !== null) {
      const success = await updateTipo(editingId, {
        nombre: form.nombre.trim(),
        partes: form.partes,
        instrucciones: form.instrucciones.trim() || null,
        longitud: form.longitud,
        objetivo: form.objetivo.trim() || null,
        requerimientos: form.requerimientos.trim() || null,
      });
      if (success) {
        cancelEdit();
      }
    }
  }, [form, isCreating, editingId, enterpriseId, createTipo, updateTipo, cancelEdit]);

  const handleDelete = useCallback(async (id: number) => {
    const success = await deleteTipo(id);
    if (success) {
      setConfirmDeleteId(null);
    }
  }, [deleteTipo]);

  // ========== RENDER ==========

  const isEditing = isCreating || editingId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <FileType className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-100">Tipos de Documento</h2>
            <span className="text-xs text-zinc-500 ml-1">({tipos.length})</span>
          </div>
          <button
            onClick={() => setShowTiposManager(false)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Form (crear/editar) */}
          {isEditing && (
            <div className="mb-4 p-4 bg-zinc-800/40 border border-zinc-700/40 rounded-xl">
              <h3 className="text-sm font-medium text-zinc-200 mb-3">
                {isCreating ? 'Nuevo Tipo' : 'Editar Tipo'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Nombre */}
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Nombre *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Solicitud de insolvencia"
                    className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50"
                    autoFocus
                  />
                </div>

                {/* Partes */}
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Nº Partes</label>
                  <input
                    type="number"
                    min={1}
                    value={form.partes}
                    onChange={(e) => setForm({ ...form, partes: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-primary-500/50"
                  />
                </div>

                {/* Longitud */}
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Longitud (palabras)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.longitud ?? ''}
                    onChange={(e) => setForm({ ...form, longitud: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50"
                  />
                </div>

                {/* Objetivo */}
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Objetivo</label>
                  <input
                    type="text"
                    value={form.objetivo}
                    onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
                    placeholder="Ej: Documento de solicitud de insolvencia"
                    className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50"
                  />
                </div>

                {/* Instrucciones */}
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Instrucciones</label>
                  <textarea
                    value={form.instrucciones}
                    onChange={(e) => setForm({ ...form, instrucciones: e.target.value })}
                    placeholder="Instrucciones para la IA al redactar..."
                    rows={3}
                    className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 resize-none"
                  />
                </div>

                {/* Requerimientos */}
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Requerimientos</label>
                  <textarea
                    value={form.requerimientos}
                    onChange={(e) => setForm({ ...form, requerimientos: e.target.value })}
                    placeholder="Requerimientos del documento..."
                    rows={2}
                    className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 resize-none"
                  />
                </div>
              </div>

              {/* Form actions */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !form.nombre.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-500/20 border border-primary-500/30 text-primary-400 text-xs font-medium rounded-lg hover:bg-primary-500/30 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {isCreating ? 'Crear' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {/* Lista de tipos */}
          {isLoadingTipos ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
            </div>
          ) : tipos.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <FileType className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay tipos de documento</p>
              <p className="text-xs mt-1">Crea uno para comenzar</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tipos.map(tipo => (
                <div
                  key={tipo.id}
                  className={`group p-3 rounded-xl border transition-all ${
                    editingId === tipo.id
                      ? 'border-primary-500/30 bg-primary-500/5'
                      : 'border-zinc-800/40 bg-zinc-900/30 hover:border-zinc-700/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-zinc-200">{tipo.nombre}</h4>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500">
                        <span>{tipo.partes} {tipo.partes === 1 ? 'parte' : 'partes'}</span>
                        {tipo.longitud && <span>{tipo.longitud} palabras</span>}
                        {tipo.objetivo && <span className="truncate max-w-[200px]">{tipo.objetivo}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(tipo)}
                        disabled={isSaving}
                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {confirmDeleteId === tipo.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(tipo.id)}
                            disabled={isSaving}
                            className="px-2 py-1 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Eliminar'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(tipo.id)}
                          disabled={isSaving}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Instrucciones preview */}
                  {tipo.instrucciones && (
                    <p className="mt-2 text-[11px] text-zinc-500 line-clamp-2">
                      {tipo.instrucciones}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-zinc-800/50 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">{tipos.length} tipos de documento</span>
          {!isEditing && (
            <button
              onClick={startCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-500/20 border border-primary-500/30 text-primary-400 text-xs font-medium rounded-lg hover:bg-primary-500/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Tipo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
