'use client';

import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2, 
  Save,
  X,
  Tag
} from 'lucide-react';
import { useAgentsStore, selectRoles, selectIsLoadingRoles } from '../../../store/agentsStore';
import { AgentRole } from '../../../types/agent';

interface AgentRolesSectionProps {
  onBack: () => void;
}

export const AgentRolesSection: React.FC<AgentRolesSectionProps> = ({ onBack }) => {
  const roles = useAgentsStore(selectRoles);
  const isLoading = useAgentsStore(selectIsLoadingRoles);
  const isSaving = useAgentsStore(s => s.isSaving);
  
  const fetchRoles = useAgentsStore(s => s.fetchRoles);
  const createRole = useAgentsStore(s => s.createRole);
  const updateRole = useAgentsStore(s => s.updateRole);
  const deleteRole = useAgentsStore(s => s.deleteRole);
  
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ nombre_rol: '', instrucciones_rol: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);
  
  const handleCreate = async () => {
    if (!formData.nombre_rol.trim()) return;
    
    const newRole = await createRole({
      nombre_rol: formData.nombre_rol.trim(),
      instrucciones_rol: formData.instrucciones_rol.trim() || undefined
    });
    
    if (newRole) {
      setIsCreating(false);
      setFormData({ nombre_rol: '', instrucciones_rol: '' });
    }
  };
  
  const handleUpdate = async () => {
    if (!editingRole || !formData.nombre_rol.trim()) return;
    
    const success = await updateRole(editingRole.id, {
      nombre_rol: formData.nombre_rol.trim(),
      instrucciones_rol: formData.instrucciones_rol.trim() || undefined
    });
    
    if (success) {
      setEditingRole(null);
      setFormData({ nombre_rol: '', instrucciones_rol: '' });
    }
  };
  
  const handleDelete = async (roleId: number) => {
    const success = await deleteRole(roleId);
    if (success) {
      setDeleteConfirmId(null);
    }
  };
  
  const startEditing = (role: AgentRole) => {
    setEditingRole(role);
    setFormData({
      nombre_rol: role.nombre_rol || '',
      instrucciones_rol: role.instrucciones_rol || ''
    });
    setIsCreating(false);
  };
  
  const startCreating = () => {
    setIsCreating(true);
    setEditingRole(null);
    setFormData({ nombre_rol: '', instrucciones_rol: '' });
  };
  
  const cancelEdit = () => {
    setIsCreating(false);
    setEditingRole(null);
    setFormData({ nombre_rol: '', instrucciones_rol: '' });
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Roles de Agentes</h2>
            <p className="text-xs text-zinc-500">
              {roles.length} rol{roles.length !== 1 ? 'es' : ''} definido{roles.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <button
          onClick={startCreating}
          disabled={isCreating || editingRole !== null}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all text-xs font-medium disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Nuevo Rol
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto mt-4 space-y-3">
        {/* Create form */}
        {isCreating && (
          <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
            <h3 className="text-sm font-medium text-violet-300 mb-3">Nuevo Rol</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">
                  Nombre del Rol *
                </label>
                <input
                  type="text"
                  value={formData.nombre_rol}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre_rol: e.target.value }))}
                  placeholder="Ej: Ventas, Soporte, General"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">
                  Instrucciones del Rol
                </label>
                <textarea
                  value={formData.instrucciones_rol}
                  onChange={(e) => setFormData(prev => ({ ...prev, instrucciones_rol: e.target.value }))}
                  placeholder="Instrucciones específicas para este rol..."
                  rows={4}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none resize-y"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-xs"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formData.nombre_rol.trim() || isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 text-xs font-medium disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Loading */}
        {isLoading && roles.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}
        
        {/* Empty state */}
        {!isLoading && roles.length === 0 && !isCreating && (
          <div className="text-center py-12">
            <Tag className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400">Sin roles definidos</p>
            <p className="text-xs text-zinc-600 mt-1">Crea un rol para categorizar tus agentes</p>
          </div>
        )}
        
        {/* Roles list */}
        {roles.map((role) => (
          <div 
            key={role.id}
            className={`
              p-4 rounded-xl border transition-all
              ${editingRole?.id === role.id 
                ? 'bg-violet-500/5 border-violet-500/20' 
                : 'bg-[#131316] border-white/5 hover:border-white/10'
              }
            `}
          >
            {editingRole?.id === role.id ? (
              // Edit form
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">
                    Nombre del Rol *
                  </label>
                  <input
                    type="text"
                    value={formData.nombre_rol}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre_rol: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-violet-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1">
                    Instrucciones del Rol
                  </label>
                  <textarea
                    value={formData.instrucciones_rol}
                    onChange={(e) => setFormData(prev => ({ ...prev, instrucciones_rol: e.target.value }))}
                    rows={4}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-violet-500/50 outline-none resize-y"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={!formData.nombre_rol.trim() || isSaving}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 text-xs font-medium disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Guardar
                  </button>
                </div>
              </div>
            ) : deleteConfirmId === role.id ? (
              // Delete confirmation
              <div className="space-y-3">
                <p className="text-sm text-red-400">
                  ¿Eliminar el rol &quot;{role.nombre_rol}&quot;?
                </p>
                <p className="text-xs text-zinc-500">
                  Esta acción no se puede deshacer. Los agentes con este rol quedarán sin asignación.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(role.id)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              // Display mode
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-violet-400" />
                    <h3 className="font-medium text-zinc-200">{role.nombre_rol}</h3>
                  </div>
                  {role.instrucciones_rol && (
                    <p className="text-xs text-zinc-500 line-clamp-2 mt-1">
                      {role.instrucciones_rol}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-2">
                    Actualizado: {new Date(role.fecha_actualizacion).toLocaleDateString('es')}
                  </p>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditing(role)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(role.id)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
