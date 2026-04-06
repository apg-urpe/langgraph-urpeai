'use client';

import React, { useState } from 'react';
import { 
  CheckSquare, 
  Plus, 
  GripVertical, 
  Trash2, 
  User, 
  Tag,
  MoreHorizontal,
  X
} from 'lucide-react';
import { TaskV3, TaskItemV3 } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { cn } from '@/lib/utils';
import { TeamLabel } from '@/types/contact';

interface TaskChecklistProps {
  task: TaskV3;
  expanded?: boolean;
}

export const TaskChecklist: React.FC<TaskChecklistProps> = ({ task, expanded = false }) => {
  const { addTaskItem, updateTaskItem, toggleTaskItem, deleteTaskItem } = useTareasStore();
  const [newItemText, setNewItemText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Sorting: Pending first, then Completed
  const sortedItems = [...(task.items || [])].sort((a, b) => {
    if (a.completado === b.completado) return (a.orden || 0) - (b.orden || 0);
    return a.completado ? 1 : -1;
  });

  const completedCount = task.items?.filter(i => i.completado).length || 0;
  const totalCount = task.items?.length || 0;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    try {
      await addTaskItem(task.id, newItemText.trim());
      setNewItemText('');
      setIsAdding(false);
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleToggleItem = async (itemId: number, currentStatus: boolean) => {
    try {
      await toggleTaskItem(itemId, !currentStatus);
    } catch (error) {
      console.error('Error toggling item:', error);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('¿Eliminar este item?')) return;
    try {
      await deleteTaskItem(itemId);
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const startEditing = (item: TaskItemV3) => {
    setEditingItemId(item.id);
    setEditText(item.texto);
  };

  const saveEdit = async () => {
    if (!editingItemId || !editText.trim()) return;
    try {
      await updateTaskItem(editingItemId, editText.trim());
      setEditingItemId(null);
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  return (
    <div className={cn("space-y-4", expanded ? "h-full flex flex-col" : "")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-400">Subtareas</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-medium">
            {completedCount}/{totalCount}
          </span>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="p-1.5 text-zinc-500 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Items List */}
      <div className={cn("space-y-1", expanded ? "flex-1 overflow-y-auto custom-scrollbar" : "")}>
        {sortedItems.map((item) => (
          <div 
            key={item.id}
            className="group flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors group"
          >
            <div className="mt-0.5">
               <button
                onClick={() => handleToggleItem(item.id, item.completado)}
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-all duration-200",
                  item.completado 
                    ? "bg-primary-500 border-primary-500 text-black" 
                    : "border-zinc-600 hover:border-zinc-400 bg-transparent"
                )}
              >
                {item.completado && (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>

            {editingItemId === item.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-primary-500"
                  autoFocus
                />
                <button onClick={saveEdit} className="text-primary-400 hover:text-primary-300 text-xs">Guardar</button>
              </div>
            ) : (
              <div className="flex-1">
                <p 
                  className={cn(
                    "text-sm transition-colors cursor-text",
                    item.completado ? "text-zinc-600 line-through" : "text-zinc-300"
                  )}
                  onClick={() => startEditing(item as TaskItemV3)}
                >
                  {item.texto}
                </p>
                
                {/* V3 Meta: Assignee & Labels (Read only for now) */}
                {((item as TaskItemV3).asignado_a || (item as TaskItemV3).etiqueta_id) && (
                  <div className="flex items-center gap-2 mt-1">
                    {(item as TaskItemV3).asignado && (
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                        <User className="w-3 h-3" />
                        <span>{(item as TaskItemV3).asignado?.nombre}</span>
                      </div>
                    )}
                    {(item as TaskItemV3).etiqueta && (
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                        <Tag className="w-3 h-3" />
                        <span>{(item as TaskItemV3).etiqueta?.nombre}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
              <button className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors">
                <GripVertical className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => handleDeleteItem(item.id)}
                className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {isAdding && (
          <form onSubmit={handleAddItem} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg border border-white/5 animate-in fade-in slide-in-from-top-1">
            <div className="w-4 h-4 rounded border border-zinc-700 border-dashed" />
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Nueva subtarea..."
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
              autoFocus
            />
            <div className="flex items-center gap-1">
              <button 
                type="submit"
                disabled={!newItemText.trim()}
                className="px-2 py-1 bg-primary-500/10 text-primary-400 text-xs font-medium rounded hover:bg-primary-500/20 disabled:opacity-50"
              >
                Agregar
              </button>
              <button 
                type="button" 
                onClick={() => setIsAdding(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
