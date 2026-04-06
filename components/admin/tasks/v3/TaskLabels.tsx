'use client';

import React, { useState, useEffect } from 'react';
import { Tag, Plus, X, Check, Search } from 'lucide-react';
import { TaskV3 } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { cn } from '@/lib/utils';
import { TeamLabel } from '@/types/contact';

// Paleta de colores coherente con la app (minimalista, dark theme)
const LABEL_COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  // Primary/Brand
  '#6366f1': { bg: 'bg-primary-500/15', text: 'text-primary-400', dot: 'bg-primary-400' },
  '#8b5cf6': { bg: 'bg-violet-500/15', text: 'text-violet-400', dot: 'bg-violet-400' },
  // Success/Green
  '#10b981': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  '#22c55e': { bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-400' },
  // Warning/Orange
  '#f59e0b': { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  '#f97316': { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
  // Error/Red
  '#ef4444': { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  '#f43f5e': { bg: 'bg-rose-500/15', text: 'text-rose-400', dot: 'bg-rose-400' },
  // Info/Blue
  '#3b82f6': { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  '#06b6d4': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  // Neutral
  '#71717a': { bg: 'bg-zinc-500/15', text: 'text-zinc-400', dot: 'bg-zinc-400' },
  '#a1a1aa': { bg: 'bg-zinc-400/15', text: 'text-zinc-300', dot: 'bg-zinc-400' },
};

// Función para obtener estilos de color coherentes
const getLabelStyles = (hexColor: string) => {
  // Buscar coincidencia exacta o aproximada
  const normalizedColor = hexColor.toLowerCase();
  if (LABEL_COLOR_MAP[normalizedColor]) {
    return LABEL_COLOR_MAP[normalizedColor];
  }
  
  // Mapear por tonalidad aproximada
  const colorLower = normalizedColor;
  if (colorLower.includes('f4') || colorLower.includes('ef') || colorLower.includes('dc') && colorLower.includes('26')) {
    return LABEL_COLOR_MAP['#ef4444']; // Red tones
  }
  if (colorLower.includes('f9') || colorLower.includes('f5') || colorLower.includes('fb')) {
    return LABEL_COLOR_MAP['#f59e0b']; // Orange/Amber tones
  }
  if (colorLower.includes('22') || colorLower.includes('10') || colorLower.includes('16')) {
    return LABEL_COLOR_MAP['#10b981']; // Green tones
  }
  if (colorLower.includes('3b') || colorLower.includes('06') || colorLower.includes('0e')) {
    return LABEL_COLOR_MAP['#3b82f6']; // Blue tones
  }
  if (colorLower.includes('8b') || colorLower.includes('a8') || colorLower.includes('63')) {
    return LABEL_COLOR_MAP['#8b5cf6']; // Purple tones
  }
  
  // Fallback a estilo por defecto usando el color original pero con opacidades coherentes
  return { bg: 'bg-zinc-800/50', text: 'text-zinc-300', dot: 'bg-zinc-400' };
};

interface TaskLabelsProps {
  task: TaskV3;
  compact?: boolean;
}

export const TaskLabels: React.FC<TaskLabelsProps> = ({ task, compact = false }) => {
  const { addTaskLabel, removeTaskLabel, teamLabels, fetchTeamLabels } = useTareasStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (teamLabels.length === 0 && task.empresa_id) {
      fetchTeamLabels(task.empresa_id);
    }
  }, [task.empresa_id, teamLabels.length, fetchTeamLabels]);

  const taskLabelIds = new Set(task.etiquetas?.map(e => e.etiqueta_id) || []);

  const filteredLabels = teamLabels.filter(label => 
    label.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleLabel = async (labelId: number) => {
    if (taskLabelIds.has(labelId)) {
      await removeTaskLabel(task.id, labelId);
    } else {
      await addTaskLabel(task.id, labelId);
    }
    // Don't close dropdown to allow multiple selections
  };

  const activeLabels = task.etiquetas?.filter(rel => rel.etiqueta) || [];

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
        <Tag className="w-3 h-3" />
        Etiquetas
      </label>

      <div className="flex flex-wrap gap-1.5">
        {/* Active Labels - Pill style con paleta coherente */}
        {activeLabels.map((rel) => {
          if (!rel.etiqueta) return null;
          const styles = getLabelStyles(rel.etiqueta.color);
          return (
            <div 
              key={rel.etiqueta_id}
              className={cn(
                "group flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium transition-all hover:pr-2",
                styles.bg, styles.text
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", styles.dot)} />
              <span className="truncate max-w-[100px]">{rel.etiqueta.nombre}</span>
              <button
                onClick={() => removeTaskLabel(task.id, rel.etiqueta_id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/20 rounded-full transition-all"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}

        {/* Add Button - Más sutil */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
              "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-zinc-700/50"
            )}
          >
            <Plus className="w-3 h-3" />
            {!compact && <span>Añadir</span>}
          </button>

          {/* Dropdown mejorado */}
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute top-full left-0 mt-1.5 w-52 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {/* Search */}
                <div className="p-2 border-b border-zinc-800">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
                      autoFocus
                    />
                  </div>
                </div>
                
                {/* Labels List */}
                <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
                  {filteredLabels.length > 0 ? (
                    filteredLabels.map((label) => {
                      const isActive = taskLabelIds.has(label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => handleToggleLabel(label.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors",
                            isActive 
                              ? "bg-primary-500/10" 
                              : "hover:bg-zinc-800"
                          )}
                        >
                          <span 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: label.color }}
                          />
                          <span className={cn(
                            "flex-1 text-left truncate",
                            isActive ? "text-primary-400" : "text-zinc-300"
                          )}>
                            {label.nombre}
                          </span>
                          {isActive && (
                            <Check className="w-3 h-3 text-primary-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-4 text-center">
                      <p className="text-[10px] text-zinc-500">Sin resultados</p>
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-900/50">
                  <p className="text-[9px] text-zinc-600 text-center">
                    Click para añadir/quitar
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
