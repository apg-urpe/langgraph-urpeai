'use client';

import React from 'react';
import { BlockActions } from './BlockActions';

interface Task {
  id?: string;
  title: string;
  status?: string;
  priority?: 'high' | 'medium' | 'low';
  assignee?: string;
  due_date?: string;
  description?: string;
  [key: string]: any;
}

interface TaskBoardProps {
  title?: string;
  tasks: Task[];
  assignees?: string[];
  view?: 'board' | 'list';
  actions?: Array<{
    id: string;
    label: string;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    payload?: any;
    [key: string]: any;
  }>;
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

const priorityColors: Record<string, string> = {
  high: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const statusColumns = ['pending', 'in_progress', 'done'];
const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completado',
};
const statusColors: Record<string, string> = {
  pending: 'border-zinc-700 bg-zinc-900/40',
  in_progress: 'border-amber-500/30 bg-amber-950/10',
  done: 'border-emerald-500/30 bg-emerald-950/10',
};

const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
  const normalizedStatus = (task.status || 'pending').toLowerCase().replace(/\s+/g, '_');
  const priority = task.priority?.toLowerCase() || 'medium';

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2 hover:border-white/20 transition-colors duration-200">
      <div className="flex items-start justify-between gap-2">
        <span className="text-zinc-100 text-sm font-medium leading-snug">{task.title}</span>
        {task.priority && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border ${priorityColors[priority] || priorityColors.medium}`}>
            {priority}
          </span>
        )}
      </div>
      {task.description && (
        <p className="text-zinc-400 text-xs leading-relaxed">{task.description}</p>
      )}
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        {task.assignee && (
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-zinc-700 inline-flex items-center justify-center text-[9px] font-bold text-zinc-300 uppercase">
              {task.assignee[0]}
            </span>
            {task.assignee}
          </span>
        )}
        {task.due_date && (
          <span>{task.due_date}</span>
        )}
      </div>
    </div>
  );
};

export const TaskBoard: React.FC<TaskBoardProps> = ({
  title = 'Tareas',
  tasks,
  view = 'board',
  actions,
  onInteract,
  disabled = false,
}) => {
  const handleAction = (actionData: any) => {
    if (onInteract) {
      onInteract({ type: 'BLOCK_ACTION', action: actionData });
    }
  };

  const tasksByStatus = statusColumns.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col] = tasks.filter(t => {
      const s = (t.status || 'pending').toLowerCase().replace(/\s+/g, '_');
      return s === col;
    });
    return acc;
  }, {});

  // Tasks with unknown status fall into pending
  tasks.forEach(t => {
    const s = (t.status || 'pending').toLowerCase().replace(/\s+/g, '_');
    if (!statusColumns.includes(s)) {
      tasksByStatus['pending'].push(t);
    }
  });

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md bg-black/40">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 bg-zinc-900/20">
        <h3 className="text-zinc-100 text-base font-bold">{title}</h3>
        <p className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wider">
          {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Body */}
      <div className="p-4">
        {view === 'board' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {statusColumns.map(col => (
              <div key={col} className={`rounded-xl border p-3 space-y-2 ${statusColors[col]}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                  {statusLabels[col]}
                  <span className="ml-2 text-zinc-600">({tasksByStatus[col].length})</span>
                </div>
                {tasksByStatus[col].length === 0 ? (
                  <p className="text-zinc-600 text-xs text-center py-4">Sin tareas</p>
                ) : (
                  tasksByStatus[col].map((task, idx) => (
                    <TaskCard key={task.id || idx} task={task} />
                  ))
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-6">Sin tareas</p>
            ) : (
              tasks.map((task, idx) => <TaskCard key={task.id || idx} task={task} />)
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="border-t border-white/5 px-4 py-3">
          <BlockActions actions={actions} onInteract={handleAction} disabled={disabled} />
        </div>
      )}
    </div>
  );
};
