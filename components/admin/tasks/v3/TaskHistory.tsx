'use client';

import React, { useEffect } from 'react';
import { 
  History, 
  User, 
  Calendar, 
  CheckSquare, 
  MessageSquare, 
  Tag, 
  FileText,
  Upload,
  Trash2,
  RefreshCw,
  Plus,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Clock,
  X,
  Flag,
  PlayCircle
} from 'lucide-react';
import { TaskV3, TaskHistory as TaskHistoryType, HistoryAction } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { cn } from '@/lib/utils';
import { getHistoryActionDescription } from '@/types/tasks-v3';

interface TaskHistoryProps {
  task: TaskV3;
}

export const TaskHistory: React.FC<TaskHistoryProps> = ({ task }) => {
  const { fetchTaskHistory } = useTareasStore();

  useEffect(() => {
    fetchTaskHistory(task.id);
  }, [task.id, fetchTaskHistory]);

  // Use local history from task object (updated by store)
  const history = task.historial || [];

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
        <History className="w-12 h-12 mb-3 opacity-20" />
        <p>No hay actividad registrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-medium text-zinc-400">Actividad reciente</h3>
      </div>

      <div className="relative border-l border-white/10 ml-3 space-y-6">
        {history.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
};

const HistoryItem = ({ entry }: { entry: TaskHistoryType }) => {
  return (
    <div className="relative pl-6">
      {/* Timeline Dot */}
      <div className={cn(
        "absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0c0e]",
        getActionColor(entry.accion)
      )} />

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300 font-medium">
            {entry.autor?.nombre} {entry.autor?.apellido}
          </span>
          <span className="text-xs text-zinc-500">
            {new Date(entry.created_at).toLocaleString('es-ES', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
        
        <p className="text-sm text-zinc-400">
          {getHistoryActionDescription(entry)}
        </p>

        {/* Optional: Show metadata diff if needed */}
        {/* <div className="text-xs text-zinc-600 font-mono mt-1">
           {entry.accion}
        </div> */}
      </div>
    </div>
  );
};

function getActionColor(action: HistoryAction): string {
  switch (action) {
    case 'created': return 'bg-emerald-500';
    case 'status_changed': return 'bg-blue-500';
    case 'priority_changed': return 'bg-amber-500';
    case 'due_date_changed': return 'bg-purple-500';
    case 'comment_added': return 'bg-indigo-500';
    case 'item_completed': return 'bg-emerald-400';
    case 'media_uploaded': return 'bg-cyan-500';
    case 'media_deleted': return 'bg-red-500';
    default: return 'bg-zinc-500';
  }
}
