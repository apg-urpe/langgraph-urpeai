'use client';

import React, { useState } from 'react';
import { 
  Calendar, 
  Flag, 
  User, 
  Briefcase, 
  Tag, 
  Clock, 
  AlertCircle,
  Hash,
  Copy,
  CheckCircle2,
  XCircle,
  PlayCircle,
  ExternalLink,
  Phone,
  Mail
} from 'lucide-react';
import { TaskV3 } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { useProyectosStore } from '@/store/proyectosStore';
import { useContactStore } from '@/store/contactStore';
import { 
  TaskStatus, 
  TaskPriority, 
  TASK_STATUS_LABELS, 
  TASK_PRIORITY_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_COLORS
} from '@/types/contact';
import { cn } from '@/lib/utils';
import { TaskLabels } from './TaskLabels';

interface TaskSidebarProps {
  task: TaskV3;
}

export const TaskSidebar: React.FC<TaskSidebarProps> = ({ task }) => {
  const { updateTask } = useTareasStore();
  const { projects } = useProyectosStore();
  // We assume team members are available in contact store or context
  // This is a simplification; in a real app we might need a dedicated hook/store for team members
  const teamMembers = useContactStore(state => state.teamMembers || []); 

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);

  const handleStatusChange = async (status: TaskStatus) => {
    await updateTask(task.id, { estado: status });
    setIsStatusOpen(false);
  };

  const handlePriorityChange = async (priority: TaskPriority) => {
    await updateTask(task.id, { prioridad: priority });
    setIsPriorityOpen(false);
  };

  const handleAssigneeChange = async (userId: number | null) => {
    await updateTask(task.id, { asignado_a: userId });
    setIsAssigneeOpen(false);
  };

  const handleProjectChange = async (projectId: number | null) => {
    await updateTask(task.id, { proyecto_id: projectId });
    setIsProjectOpen(false);
  };

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    await updateTask(task.id, { fecha_vencimiento: date || null });
  };

  const copyTaskId = () => {
    navigator.clipboard.writeText(`#${task.id}`);
    // Could add toast here
  };

  return (
    <div className="p-6 space-y-8">
      
      {/* STATUS & ACTIONS */}
      <div className="space-y-4">
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          Estado
        </label>
        <div className="relative">
          <button
            onClick={() => setIsStatusOpen(!isStatusOpen)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all",
              "hover:brightness-110 active:scale-[0.98]",
              getStatusColorClasses(task.estado)
            )}
          >
            <div className="flex items-center gap-2">
              {getStatusIcon(task.estado)}
              <span className="text-sm font-medium">{TASK_STATUS_LABELS[task.estado]}</span>
            </div>
            {/* Chevron? */}
          </button>
          
          {isStatusOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    {getStatusIcon(status)}
                    <span>{TASK_STATUS_LABELS[status]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* PROPERTIES GRID */}
      <div className="space-y-6">
        
        {/* Priority */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <Flag className="w-3 h-3" />
            Prioridad
          </label>
          <div className="relative">
            <button
              onClick={() => setIsPriorityOpen(!isPriorityOpen)}
              className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <div className={cn("w-2 h-2 rounded-full", getPriorityColorClass(task.prioridad))} />
              <span>{TASK_PRIORITY_LABELS[task.prioridad]}</span>
            </button>
            
            {isPriorityOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsPriorityOpen(false)} />
                <div className="absolute top-full left-0 mt-1 w-40 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                  {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      <div className={cn("w-2 h-2 rounded-full", getPriorityColorClass(p))} />
                      <span>{TASK_PRIORITY_LABELS[p]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Assignee */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <User className="w-3 h-3" />
            Asignado a
          </label>
          <div className="relative">
            <button
              onClick={() => setIsAssigneeOpen(!isAssigneeOpen)}
              className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
            >
              {task.asignado ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-[10px] font-medium">
                    {task.asignado.nombre[0]}
                  </div>
                  <span>{task.asignado.nombre} {task.asignado.apellido}</span>
                </>
              ) : (
                <span className="text-zinc-500 italic">Sin asignar</span>
              )}
            </button>
             {/* Simple Dropdown for now */}
            {isAssigneeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAssigneeOpen(false)} />
                <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                  <button
                    onClick={() => handleAssigneeChange(null)}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  >
                    Sin asignar
                  </button>
                  {teamMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => handleAssigneeChange(member.id)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                    >
                      <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[9px]">
                        {member.nombre[0]}
                      </div>
                      {member.nombre} {member.apellido}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Contacto Relacionado - Clickeable */}
        {task.contacto && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3" />
              Contacto Relacionado
            </label>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('openContactDetail', { detail: { contactId: task.contacto!.id } }));
              }}
              className="flex flex-col gap-2 p-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/20 transition-colors group text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-300">
                  {task.contacto.nombre} {task.contacto.apellido || ''}
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {task.contacto.telefono && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Phone className="w-3 h-3" />
                  <span>{task.contacto.telefono}</span>
                </div>
              )}
              {task.contacto.email && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Mail className="w-3 h-3" />
                  <span className="truncate">{task.contacto.email}</span>
                </div>
              )}
            </button>
          </div>
        )}

        {/* Project */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            Proyecto
          </label>
          <div className="relative">
             <button
              onClick={() => setIsProjectOpen(!isProjectOpen)}
              className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors text-left"
            >
              {task.proyecto ? (
                <span className="truncate max-w-[200px]" style={{ color: task.proyecto.color }}>
                  {task.proyecto.nombre}
                </span>
              ) : (
                <span className="text-zinc-500 italic">Sin proyecto</span>
              )}
            </button>
             {isProjectOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsProjectOpen(false)} />
                <div className="absolute top-full left-0 mt-1 w-64 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                  <button
                    onClick={() => handleProjectChange(null)}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  >
                    Sin proyecto
                  </button>
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectChange(project.id)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="truncate">{project.nombre}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Due Date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Fecha límite
          </label>
          <input
            type="date"
            value={task.fecha_vencimiento ? task.fecha_vencimiento.split('T')[0] : ''}
            onChange={handleDateChange}
            className="bg-transparent text-sm text-zinc-300 focus:outline-none focus:text-white w-full cursor-pointer"
          />
        </div>

      </div>

      <div className="h-px bg-white/5" />

      {/* LABELS */}
      <TaskLabels task={task} />

      <div className="h-px bg-white/5" />

      {/* META INFO */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            ID Tarea
          </span>
          <button 
            onClick={copyTaskId}
            className="hover:text-zinc-300 flex items-center gap-1 font-mono transition-colors"
          >
            #{task.id}
            <Copy className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Creada
          </span>
          <span>
            {new Date(task.created_at).toLocaleDateString('es-ES', { 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric' 
            })}
          </span>
        </div>

        {task.creador && (
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              Creada por
            </span>
            <span>
              {task.creador.nombre} {task.creador.apellido}
            </span>
          </div>
        )}
      </div>

    </div>
  );
};

// Helpers

function getStatusIcon(status: TaskStatus) {
  switch (status) {
    case 'completada': return <CheckCircle2 className="w-4 h-4" />;
    case 'cancelada': return <XCircle className="w-4 h-4" />;
    case 'en_progreso': return <PlayCircle className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getStatusColorClasses(status: TaskStatus) {
  switch (status) {
    case 'completada': return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20";
    case 'en_progreso': return "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20";
    case 'cancelada': return "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20";
    case 'pendiente': return "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700";
    default: return "bg-zinc-800 text-zinc-300 border-zinc-700";
  }
}

function getPriorityColorClass(priority: TaskPriority) {
  switch (priority) {
    case 1: return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"; // Urgente
    case 2: return "bg-amber-500"; // Alta
    case 3: return "bg-blue-500"; // Media
    case 4: return "bg-zinc-500"; // Baja
    default: return "bg-zinc-500";
  }
}
