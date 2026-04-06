'use client';

import React, { useState, useEffect } from 'react';
import { X, Bot, Loader2, Plus, Globe } from 'lucide-react';
import { useAgentsStore, selectRoles, selectIsSaving, selectSaveError } from '../../../store/agentsStore';

interface CreateAgentModalProps {
  onClose: () => void;
  enterpriseId: number;
}

export const CreateAgentModal: React.FC<CreateAgentModalProps> = ({ onClose, enterpriseId }) => {
  const roles = useAgentsStore(selectRoles);
  const isSaving = useAgentsStore(selectIsSaving);
  const saveError = useAgentsStore(selectSaveError);
  
  const fetchRoles = useAgentsStore(s => s.fetchRoles);
  const createAgent = useAgentsStore(s => s.createAgent);
  const selectAgent = useAgentsStore(s => s.selectAgent);
  
  const [formData, setFormData] = useState({
    nombre_agente: '',
    idioma: 'es',
    id_rol: '' as string | number,
    instrucciones: ''
  });
  
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nombre_agente.trim()) return;
    
    const newAgent = await createAgent({
      nombre_agente: formData.nombre_agente.trim(),
      empresa_id: enterpriseId,
      idioma: formData.idioma,
      id_rol: formData.id_rol ? Number(formData.id_rol) : undefined,
      instrucciones: formData.instrucciones.trim() || undefined
    });
    
    if (newAgent) {
      selectAgent(newAgent.id);
      onClose();
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Nuevo Agente</h2>
              <p className="text-xs text-zinc-500">Configura un nuevo agente IA</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
              Nombre del Agente *
            </label>
            <input
              type="text"
              value={formData.nombre_agente}
              onChange={(e) => setFormData(prev => ({ ...prev, nombre_agente: e.target.value }))}
              placeholder="Ej: Asistente de Ventas"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none"
              autoFocus
            />
          </div>
          
          {/* Idioma y Rol */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                Idioma
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={formData.idioma}
                  onChange={(e) => setFormData(prev => ({ ...prev, idioma: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500/50 outline-none appearance-none"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                Rol (Opcional)
              </label>
              <select
                value={formData.id_rol}
                onChange={(e) => setFormData(prev => ({ ...prev, id_rol: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500/50 outline-none appearance-none"
              >
                <option value="">Sin rol</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.nombre_rol}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Instrucciones iniciales */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
              Instrucciones Iniciales (Opcional)
            </label>
            <textarea
              value={formData.instrucciones}
              onChange={(e) => setFormData(prev => ({ ...prev, instrucciones: e.target.value }))}
              placeholder="Describe el comportamiento inicial del agente..."
              rows={4}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none resize-y"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Puedes configurar más detalles después de crear el agente.
            </p>
          </div>
          
          {/* Error */}
          {saveError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {saveError}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!formData.nombre_agente.trim() || isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Crear Agente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
