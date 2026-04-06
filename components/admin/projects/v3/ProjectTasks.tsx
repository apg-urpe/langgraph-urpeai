'use client';

import React, { useEffect, useState } from 'react';
import { 
  CheckSquare, 
  Plus, 
  EyeOff, 
  Eye,
  User,
  X,
  AlertCircle,
  Clock
} from 'lucide-react';
import { useTareasStore } from '@/store/tareasStore';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '@/store/contactStore';
import { Task, CreateTaskPayload } from '@/types/contact';
import { TaskCard } from '@/components/admin/tasks/TaskCard';
import { TaskModal } from '@/components/admin/tasks/TaskModal';
import { TaskDetailModal } from '@/components/admin/tasks/v3/TaskDetailModal';
import { cn } from '@/lib/utils';

interface ProjectTasksProps {
  projectId: number;
  projectName: string;
}

export const ProjectTasks: React.FC<ProjectTasksProps> = ({ projectId, projectName }) => {
  const { tasks, fetchTasks, toggleTaskItem, deleteTask, createTask } = useTareasStore();
  // PERF: Granular selectors
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);

  // Filter tasks for this project
  const projectTasks = tasks.filter(t => 
    (t as { proyecto_id?: number | null }).proyecto_id === projectId
  );

  // Apply quick filters
  let filteredTasks = projectTasks;
  
  if (hideCompleted) {
    filteredTasks = filteredTasks.filter(t => t.estado !== 'completada');
  }
  
  if (showOnlyMine && userContext?.id) {
    filteredTasks = filteredTasks.filter(t => 
      t.asignado_a === userContext.id || t.creado_por === userContext.id
    );
  }

  // Stats
  const pendingCount = projectTasks.filter(t => t.estado === 'pendiente').length;
  const inProgressCount = projectTasks.filter(t => t.estado === 'en_progreso').length;
  const completedCount = projectTasks.filter(t => t.estado === 'completada').length;
  const now = new Date();
  const overdueCount = projectTasks.filter(t => 
    t.fecha_vencimiento && 
    new Date(t.fecha_vencimiento) < now && 
    t.estado !== 'completada'
  ).length;

  const handleToggleItem = async (itemId: number, completado: boolean) => {
    await toggleTaskItem(itemId, completado);
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await deleteTask(taskId);
  };

  const handleOpenTask = (task: Task) => {
    setDetailTaskId(task.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-5 h-5 text-primary-400" />
          <h3 className="text-lg font-semibold text-zinc-100">Tareas del Proyecto</h3>
        </div>
        
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            bg-primary-500/10 border border-primary-500/30 text-primary-400
            hover:bg-primary-500/20 hover:border-primary-500/40 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nueva Tarea
        </button>
      </div>

      {/* Quick Stats */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800/80 text-zinc-400 border border-white/5">
          {pendingCount} pendientes
        </span>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary-500/10 text-primary-400 border border-primary-500/20">
          {inProgressCount} en progreso
        </span>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {completedCount} completadas
        </span>
        {overdueCount > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {overdueCount} atrasadas
          </span>
        )}
      </div>

      {/* Notion-style Quick Filters */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            hideCompleted
              ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
          )}
        >
          {hideCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>Ocultar completadas</span>
        </button>
        
        <button
          onClick={() => setShowOnlyMine(!showOnlyMine)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            showOnlyMine
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
          )}
        >
          <User className="w-3.5 h-3.5" />
          <span>Ver mías</span>
        </button>
        
        {(hideCompleted || showOnlyMine) && (
          <button
            onClick={() => { setHideCompleted(false); setShowOnlyMine(false); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 ml-auto"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}
      </div>

      {/* Tasks List */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm text-zinc-500">
              {projectTasks.length === 0 
                ? 'No hay tareas en este proyecto' 
                : 'No hay tareas que coincidan con los filtros'}
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 text-sm text-primary-400 hover:text-primary-300"
            >
              + Crear primera tarea
            </button>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onToggleItem={handleToggleItem}
              onEditTask={() => {}}
              onDeleteTask={handleDeleteTask}
              onSelectTask={handleOpenTask}
              onNavigateToContact={() => {}}
              compact
            />
          ))
        )}
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <TaskModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          projectId={projectId}
          onSave={async (payload: CreateTaskPayload) => {
            if (!selectedEnterpriseId || !userContext?.id) return;
            await createTask(selectedEnterpriseId, userContext.id, {
              ...payload,
              proyecto_id: projectId
            });
            setIsCreateModalOpen(false);
          }}
        />
      )}

      {/* Detail Modal */}
      {detailTaskId && (
        <TaskDetailModal
          isOpen={!!detailTaskId}
          onClose={() => {
            setDetailTaskId(null);
            // Refresh tasks
            if (selectedEnterpriseId) fetchTasks(selectedEnterpriseId);
          }}
          taskId={detailTaskId}
        />
      )}
    </div>
  );
};
