'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Receipt, 
  DollarSign, 
  Calendar,
  MoreHorizontal,
  FileText,
  X,
  Save
} from 'lucide-react';
import { 
  ProjectV3, 
  ProjectCost, 
  CreateCostPayload, 
  UpdateCostPayload,
  CostCategory,
  COST_CATEGORY_LABELS, 
  COST_CATEGORY_ICONS,
  COST_CATEGORY_COLORS 
} from '@/types/tasks-v3';
import { useProyectosStore } from '@/store/proyectosStore';
import { useContactStore, selectUserContext } from '@/store/contactStore';
import { cn } from '@/lib/utils';

interface ProjectCostsProps {
  project: ProjectV3;
}

export const ProjectCosts: React.FC<ProjectCostsProps> = ({ project }) => {
  const { fetchProjectCosts, addProjectCost, updateProjectCost, deleteProjectCost } = useProyectosStore();
  // PERF: Granular selector
  const userContext = useContactStore(selectUserContext);
  const [isAdding, setIsAdding] = useState(false);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);

  useEffect(() => {
    if (project.id) {
      fetchProjectCosts(project.id);
    }
  }, [project.id, fetchProjectCosts]);

  // Form State
  const [formData, setFormData] = useState<Partial<CreateCostPayload>>({
    moneda: project.moneda || 'USD',
    fecha_costo: new Date().toISOString().split('T')[0]
  });

  const handleSave = async () => {
    if (!formData.concepto || !formData.monto || !userContext?.id) return;

    try {
      if (editingCostId) {
        await updateProjectCost(editingCostId, formData as UpdateCostPayload);
      } else {
        await addProjectCost({
          proyecto_id: project.id,
          concepto: formData.concepto,
          monto: Number(formData.monto),
          categoria: formData.categoria as CostCategory || 'general',
          moneda: formData.moneda,
          fecha_costo: formData.fecha_costo,
          notas: formData.notas
        }, userContext.id);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving cost:', error);
    }
  };

  const handleDelete = async (costId: number) => {
    if (confirm('¿Eliminar este registro de costo?')) {
      await deleteProjectCost(costId);
    }
  };

  const startEdit = (cost: ProjectCost) => {
    setEditingCostId(cost.id);
    setFormData({
      concepto: cost.concepto,
      monto: cost.monto,
      categoria: cost.categoria,
      moneda: cost.moneda,
      fecha_costo: cost.fecha_costo,
      notas: cost.notas || ''
    });
    setIsAdding(true);
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingCostId(null);
    setFormData({
      moneda: project.moneda || 'USD',
      fecha_costo: new Date().toISOString().split('T')[0]
    });
  };

  const costs = project.costos || [];
  const totalCost = costs.reduce((sum, c) => sum + c.monto, 0);

  return (
    <div className="space-y-6">
      
      {/* Header & Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Registro de Costos</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Total: <span className="text-zinc-200 font-mono">{project.moneda} {totalCost.toLocaleString()}</span>
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 text-primary-400 border border-primary-500/20 rounded-lg text-sm font-medium hover:bg-primary-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar Costo
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="bg-[#1a1a1c] border border-white/10 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <h4 className="text-sm font-medium text-zinc-300">
              {editingCostId ? 'Editar Costo' : 'Nuevo Costo'}
            </h4>
            <button onClick={resetForm} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1.5">Concepto</label>
              <input
                type="text"
                value={formData.concepto || ''}
                onChange={e => setFormData({...formData, concepto: e.target.value})}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
                placeholder="Ej. Pago diseño UX"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">
                  {formData.moneda}
                </span>
                <input
                  type="number"
                  value={formData.monto || ''}
                  onChange={e => setFormData({...formData, monto: Number(e.target.value)})}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Categoría</label>
              <select
                value={formData.categoria || 'general'}
                onChange={e => setFormData({...formData, categoria: e.target.value as CostCategory})}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
              >
                {Object.entries(COST_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Fecha</label>
              <input
                type="date"
                value={formData.fecha_costo || ''}
                onChange={e => setFormData({...formData, fecha_costo: e.target.value})}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1.5">Notas (Opcional)</label>
              <textarea
                value={formData.notas || ''}
                onChange={e => setFormData({...formData, notas: e.target.value})}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 resize-none"
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.concepto || !formData.monto}
              className="px-3 py-1.5 bg-primary-500 text-white text-xs font-medium rounded-lg hover:bg-primary-400 transition-colors disabled:opacity-50"
            >
              {editingCostId ? 'Guardar Cambios' : 'Registrar Costo'}
            </button>
          </div>
        </div>
      )}

      {/* Costs List */}
      <div className="space-y-2">
        {costs.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
            <Receipt className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No hay costos registrados</p>
          </div>
        ) : (
          costs.map((cost) => (
            <div 
              key={cost.id}
              className="group flex items-center justify-between p-3 bg-zinc-900/30 border border-white/5 rounded-lg hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center border",
                  COST_CATEGORY_COLORS[cost.categoria].replace('bg-', 'border-').replace('/10', '/20'),
                  COST_CATEGORY_COLORS[cost.categoria]
                )}>
                  <CostIcon category={cost.categoria} className="w-5 h-5" />
                </div>
                
                <div>
                  <p className="text-sm font-medium text-zinc-200">{cost.concepto}</p>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(cost.fecha_costo).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span>{cost.registrador?.nombre} {cost.registrador?.apellido?.charAt(0)}.</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-zinc-300">
                  {cost.moneda} {cost.monto.toLocaleString()}
                </span>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => startEdit(cost)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => handleDelete(cost.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const CostIcon = ({ category, className }: { category: CostCategory, className?: string }) => {
  // Simple mapping since we don't have lucide icons map in this file directly
  // This is a placeholder, ideally import icons dynamically
  return <Receipt className={className} />;
};
