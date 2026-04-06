'use client';

import React, { useState } from 'react';
import { 
  CheckSquare, 
  Square, 
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertCircle,
  ExternalLink,
  User,
  CornerDownRight
} from 'lucide-react';
import { 
  Task, 
  TaskItem,
  getTaskType,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS
} from '../../../types/contact';

// Square UI Style - Priority Colors (más compacto)
const PRIORITY_STYLES: Record<number, { bg: string; text: string }> = {
  4: { bg: 'bg-red-500/20', text: 'text-red-400' },      // Urgente
  3: { bg: 'bg-amber-500/20', text: 'text-amber-400' },  // Alta
  2: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' }, // Media
  1: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' }, // Baja
};

// Square UI Style - Status Colors
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pendiente: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', dot: 'bg-zinc-400' },
  en_progreso: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  completada: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  cancelada: { bg: 'bg-rose-500/15', text: 'text-rose-400', dot: 'bg-rose-400' },
};

interface TaskCardProps {
  task: Task;
  onToggleItem?: (itemId: number, completado: boolean) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: number) => void;
  onSelectTask?: (task: Task) => void;
  onNavigateToContact?: (contactId: number) => void;
  compact?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  onToggleItem,
  onEditTask,
  onDeleteTask,
  onSelectTask,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false); // Colapsado por defecto
  const [showMenu, setShowMenu] = useState(false);

  const taskType = getTaskType(task);
  const items = task.items || [];
  const completedCount = items.filter(i => i.completado).length;
  const totalCount = items.length;

  const isOverdue = task.fecha_vencimiento && 
    new Date(task.fecha_vencimiento) < new Date() && 
    task.estado !== 'completada';

  const priorityStyle = PRIORITY_STYLES[task.prioridad] || PRIORITY_STYLES[1];
  const statusStyle = STATUS_STYLES[task.estado] || STATUS_STYLES.pendiente;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  // Get initials for avatar
  const getInitials = (nombre?: string, apellido?: string) => {
    const first = nombre?.charAt(0)?.toUpperCase() || '';
    const last = apellido?.charAt(0)?.toUpperCase() || '';
    return first + last || '?';
  };

  return (
    <div 
      className={`group rounded-lg border border-transparent bg-transparent p-3 cursor-pointer
        transition-all duration-150 hover:bg-white/[0.03] hover:border-white/5
        active:scale-[0.995] touch-manipulation
        ${isOverdue ? 'border-l-2 !border-l-rose-500/60' : ''}
        ${task.estado === 'completada' ? 'opacity-60' : ''}
      `}
      onClick={() => onSelectTask?.(task)}
    >
      {/* Header compacto - Título + Prioridad + Menú */}
      <div className="flex items-start gap-2 mb-2">
        {/* Priority dot */}
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${priorityStyle.bg.replace('/20', '')}`} 
          title={TASK_PRIORITY_LABELS[task.prioridad]}
        />
        
        <h3 className={`flex-1 text-sm md:text-[13px] font-medium leading-snug line-clamp-2
          ${task.estado === 'completada' ? 'line-through text-zinc-600' : 'text-zinc-200'}
        `}>
          {task.titulo}
        </h3>
        
        {/* Menu - solo visible en hover */}
        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-zinc-300"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[100px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTask?.(task);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-white/5 flex items-center gap-2"
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTask?.(task.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-rose-400 hover:bg-white/5 flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" />
                  Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Meta row compacta */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Estado */}
        <span className={`inline-flex items-center gap-1 text-[10px] ${statusStyle.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
          {TASK_STATUS_LABELS[task.estado]}
        </span>
        
        {/* Fecha */}
        {task.fecha_vencimiento && (
          <span className={`text-[10px] ${isOverdue ? 'text-rose-400 font-medium' : 'text-zinc-500'}`}>
            {isOverdue && '⚠ '}{formatDate(task.fecha_vencimiento)}
          </span>
        )}
        
        {/* Checklist toggle */}
        {totalCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors
              ${completedCount === totalCount 
                ? 'text-emerald-400 bg-emerald-500/10' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}
            `}
          >
            <CheckSquare className="w-3 h-3" />
            {completedCount}/{totalCount}
            {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        )}
        
        {/* Contacto/Contexto */}
        {task.contacto && (
          <span className="text-[10px] text-cyan-400/70 truncate max-w-[100px]">
            @{task.contacto.nombre}
          </span>
        )}
        
        {/* Spacer + Avatar */}
        <div className="flex-1" />
        {task.asignado && (
          <div 
            className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-500/80 to-primary-600/80 flex items-center justify-center text-[7px] font-medium text-white"
            title={`${task.asignado.nombre} ${task.asignado.apellido || ''}`}
          >
            {getInitials(task.asignado.nombre, task.asignado.apellido)}
          </div>
        )}
      </div>

      {/* Checklist Items - Expandable - Notion Style */}
      {isExpanded && totalCount > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-0.5">
          {items.map((item) => (
            <div 
              key={item.id}
              className="flex items-center gap-2.5 py-1.5 group/item rounded hover:bg-white/[0.02] px-1 -mx-1"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleItem?.(item.id, !item.completado);
                }}
                className={`flex-shrink-0 w-4 h-4 rounded border transition-all duration-200
                  ${item.completado 
                    ? 'bg-primary-500 border-primary-500 text-black' 
                    : 'border-zinc-600 hover:border-zinc-400 bg-transparent'
                  }
                  flex items-center justify-center
                `}
              >
                {item.completado && (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <span className={`text-xs flex-1 transition-colors
                ${item.completado ? 'line-through text-zinc-600' : 'text-zinc-400'}
              `}>
                {item.texto}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.estado === nextProps.task.estado &&
    prevProps.task.prioridad === nextProps.task.prioridad &&
    prevProps.compact === nextProps.compact &&
    JSON.stringify(prevProps.task.items) === JSON.stringify(nextProps.task.items)
  );
});

TaskCard.displayName = 'TaskCard';

export default TaskCard;
