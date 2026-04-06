'use client';

import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Plus, 
  Loader2, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Settings2,
  Trash2,
  Edit3,
  GripVertical,
  Users,
  AlertTriangle
} from 'lucide-react';
import { useContactStore, selectFunnelStages, selectSelectedEnterpriseId, selectUserContext, selectIsObservationMode } from '../../../store/contactStore';
import { 
  FunnelStage, 
  FunnelStageDescripcion,
  FunnelSeguimientoConfig,
  DEFAULT_SEGUIMIENTO_CONFIG,
  DEFAULT_STAGE_DESCRIPCION
} from '../../../types/contact';
import { FunnelStageEditor } from './FunnelStageEditor';

export const FunnelConfigSection: React.FC = () => {
  const funnelStages = useContactStore(selectFunnelStages);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const isObservationMode = useContactStore(selectIsObservationMode);
  
  const fetchFunnelStages = useContactStore(s => s.fetchFunnelStages);
  const createFunnelStage = useContactStore(s => s.createFunnelStage);
  const updateFunnelStage = useContactStore(s => s.updateFunnelStage);
  const deleteFunnelStage = useContactStore(s => s.deleteFunnelStage);
  const reorderFunnelStages = useContactStore(s => s.reorderFunnelStages);
  
  const [isLoading, setIsLoading] = useState(false);
  const [editingStage, setEditingStage] = useState<FunnelStage | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedStageId, setExpandedStageId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Roles 1 (Dev/Admin) and 2 (Team Lead) can edit funnel stages
  // Note: isObservationMode no longer blocks - role 1 can edit any enterprise
  const canEdit = [1, 2].includes(userContext?.roleId ?? 999);
  
  useEffect(() => {
    if (selectedEnterpriseId) {
      loadStages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnterpriseId]); // loadStages excluded - defined below
  
  const loadStages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchFunnelStages(true);
    } catch (err) {
      setError('Error al cargar etapas del embudo');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCreate = async (data: {
    nombre_etapa: string;
    descripcion: FunnelStageDescripcion;
    configuracion_seguimiento: FunnelSeguimientoConfig;
  }) => {
    if (!selectedEnterpriseId) return;
    
    setIsLoading(true);
    setError(null);
    
    const result = await createFunnelStage({
      nombre_etapa: data.nombre_etapa,
      orden_etapa: 0, // Store calculates correct order from DB via RPC
      empresa_id: selectedEnterpriseId,
      descripcion: data.descripcion,
      configuracion_seguimiento: data.configuracion_seguimiento
    });
    
    setIsLoading(false);
    
    if (result) {
      setIsCreating(false);
    } else {
      setError('Error al crear la etapa. Verifica que el nombre sea único.');
    }
  };
  
  const handleUpdate = async (data: {
    nombre_etapa: string;
    descripcion: FunnelStageDescripcion;
    configuracion_seguimiento: FunnelSeguimientoConfig;
  }) => {
    if (!editingStage) return;
    
    // Diagnóstico previo
    console.log('[FunnelConfig] 🔄 handleUpdate called:', {
      stageId: editingStage.id,
      stageName: editingStage.nombre_etapa,
      selectedEnterpriseId,
      isObservationMode,
      canEdit,
      userRoleId: userContext?.roleId
    });
    
    if (!canEdit) {
      setError('⛔ No tienes permisos para editar');
      console.warn('[FunnelConfig] ⛔ Update blocked: canEdit = false');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    console.log('[FunnelConfig] 📤 Calling updateFunnelStage with:', {
      stageId: editingStage.id,
      empresa_id: selectedEnterpriseId,
      fieldsToUpdate: Object.keys(data)
    });
    
    const success = await updateFunnelStage(editingStage.id, {
      nombre_etapa: data.nombre_etapa,
      descripcion: data.descripcion,
      configuracion_seguimiento: data.configuracion_seguimiento,
      empresa_id: selectedEnterpriseId ?? undefined
    });
    
    setIsLoading(false);
    
    console.log('[FunnelConfig] 📥 updateFunnelStage result:', success);
    
    if (success) {
      setEditingStage(null);
    } else {
      setError('Error al actualizar la etapa. Revisa la consola (F12) para más detalles.');
    }
  };
  
  const handleDelete = async (stageId: number) => {
    setIsLoading(true);
    setError(null);
    
    const success = await deleteFunnelStage(stageId);
    
    setIsLoading(false);
    setDeleteConfirmId(null);
    
    if (!success) {
      setError('No se puede eliminar: hay contactos en esta etapa');
    }
  };
  
  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    
    const newOrder = [...funnelStages];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    
    setIsLoading(true);
    await reorderFunnelStages(newOrder.map(s => s.id));
    setIsLoading(false);
  };
  
  const handleMoveDown = async (index: number) => {
    if (index === funnelStages.length - 1) return;
    
    const newOrder = [...funnelStages];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    
    setIsLoading(true);
    await reorderFunnelStages(newOrder.map(s => s.id));
    setIsLoading(false);
  };
  
  const getStageColor = (stage: FunnelStage): string => {
    return (stage.descripcion as FunnelStageDescripcion)?.color || '#6366f1';
  };
  
  const getStageIcon = (stage: FunnelStage): string => {
    return (stage.descripcion as FunnelStageDescripcion)?.icono || '📌';
  };
  
  const getStageDescription = (stage: FunnelStage): string => {
    return (stage.descripcion as FunnelStageDescripcion)?.que_es || '';
  };
  
  if (!selectedEnterpriseId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitBranch className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-zinc-400">Selecciona una empresa</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Etapas del Embudo</h3>
            <p className="text-xs text-zinc-500">
              {funnelStages.length} etapa{funnelStages.length !== 1 ? 's' : ''} configurada{funnelStages.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadStages}
            disabled={isLoading}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          {canEdit && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500/10 border border-primary-500/20 text-primary-400 hover:bg-primary-500/20 transition-all text-xs font-medium"
            >
              <Plus className="w-4 h-4" />
              Nueva Etapa
            </button>
          )}
        </div>
      </div>

      {/* External enterprise info banner */}
      {isObservationMode && (
        <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-cyan-400">Empresa Externa</p>
            <p className="text-xs text-cyan-400/70 mt-0.5">
              Estás editando el embudo de otra empresa. Los cambios se aplicarán a esta empresa.
            </p>
          </div>
        </div>
      )}
      
      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}
      
      {/* Loading */}
      {isLoading && funnelStages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-3" />
          <p className="text-sm text-zinc-400">Cargando etapas...</p>
        </div>
      )}
      
      {/* Empty state */}
      {!isLoading && funnelStages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
            <GitBranch className="w-7 h-7 text-zinc-500" />
          </div>
          <h4 className="text-lg font-semibold text-zinc-300 mb-2">Sin etapas configuradas</h4>
          <p className="text-sm text-zinc-500 max-w-xs mb-4">
            Configura las etapas del embudo para organizar el flujo de tus contactos.
          </p>
          {canEdit && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/20 border border-primary-500/30 text-primary-400 hover:bg-primary-500/30 transition-all text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Crear Primera Etapa
            </button>
          )}
        </div>
      )}
      
      {/* Stages list */}
      {funnelStages.length > 0 && (
        <div className="space-y-2">
          {funnelStages.map((stage, index) => (
            <div
              key={stage.id}
              className="bg-[#131316] border border-white/5 rounded-xl overflow-hidden"
            >
              {/* Stage header */}
              <div className="flex items-center gap-3 p-4">
                {/* Drag handle & order controls */}
                {canEdit && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || isLoading}
                      className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === funnelStages.length - 1 || isLoading}
                      className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
                
                {/* Color indicator */}
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                  style={{ backgroundColor: `${getStageColor(stage)}20` }}
                >
                  {getStageIcon(stage)}
                </div>
                
                {/* Stage info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: getStageColor(stage) }}
                    >
                      {stage.orden_etapa}
                    </span>
                    <h4 className="text-sm font-medium text-zinc-200 truncate">
                      {stage.nombre_etapa}
                    </h4>
                  </div>
                  {getStageDescription(stage) && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                      {getStageDescription(stage)}
                    </p>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedStageId(expandedStageId === stage.id ? null : stage.id)}
                    className="p-2 rounded-lg border border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
                    title="Ver detalles"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                  
                  {canEdit && (
                    <>
                      <button
                        onClick={() => setEditingStage(stage)}
                        className="p-2 rounded-lg border border-white/5 text-zinc-400 hover:text-primary-400 hover:border-primary-500/20 transition-all"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={() => setDeleteConfirmId(stage.id)}
                        className="p-2 rounded-lg border border-white/5 text-zinc-400 hover:text-red-400 hover:border-red-500/20 transition-all"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Expanded details */}
              {expandedStageId === stage.id && (
                <div className="px-4 pb-4 pt-2 border-t border-white/5 bg-black/20">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-zinc-500 uppercase tracking-wider font-bold mb-1">Instrucciones IA</p>
                      <p className="text-zinc-300">
                        {typeof (stage.descripcion as FunnelStageDescripcion)?.instrucciones_agente === 'string'
                          ? (stage.descripcion as FunnelStageDescripcion)?.instrucciones_agente || 'Sin instrucciones'
                          : 'Configuración avanzada'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-zinc-500 uppercase tracking-wider font-bold mb-1">Acciones</p>
                      <p className="text-zinc-300">
                        {(stage.descripcion as FunnelStageDescripcion)?.acciones_agente?.length || 0} definidas
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-zinc-500 uppercase tracking-wider font-bold mb-1">Criterios Avance</p>
                      <p className="text-zinc-300">
                        {(stage.descripcion as FunnelStageDescripcion)?.criterios_avance?.length || 0} definidos
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Delete confirmation */}
              {deleteConfirmId === stage.id && (
                <div className="px-4 py-3 border-t border-red-500/20 bg-red-500/5 flex items-center justify-between">
                  <p className="text-xs text-red-400">
                    ¿Eliminar esta etapa? Los contactos en esta etapa quedarán sin etapa asignada.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleDelete(stage.id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-xs font-medium flex items-center gap-1"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Create Modal */}
      {isCreating && (
        <FunnelStageEditor
          stage={null}
          isNew
          onClose={() => setIsCreating(false)}
          onSave={handleCreate}
          canEdit={canEdit}
        />
      )}
      
      {/* Edit Modal */}
      {editingStage && (
        <FunnelStageEditor
          stage={editingStage}
          onClose={() => setEditingStage(null)}
          onSave={handleUpdate}
          canEdit={canEdit}
        />
      )}
    </div>
  );
};
