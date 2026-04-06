'use client';

import React, { useEffect, useState } from 'react';
import { ProjectDetailModal } from '../projects/v3/ProjectDetailModal';
import { TasksStatsCards } from './TasksStatsCards';
import { 
  Inbox, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown,
  MoreHorizontal, 
  Archive,
  Trash2,
  Edit2,
  Check,
  X,
  Layout,
  ExternalLink,
  Play
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useProyectosStore } from '../../../store/proyectosStore';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '../../../store/contactStore';
import { Project, PROJECT_COLORS } from '../../../types/contact';

interface ProjectsSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  // Stats
  stats?: {
    tasksDueToday: number;
    overdueTasks: number;
    inProgress: number;
    completedThisWeek: number;
  };
}

export const ProjectsSidebar: React.FC<ProjectsSidebarProps> = ({
  collapsed = false,
  onToggle,
  stats
}) => {
  // PERF: Granular selectors
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const {
    projects,
    inboxCount,
    selectedProjectId,
    isLoading,
    fetchProjects,
    fetchInboxCount,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    setSelectedProject
  } = useProyectosStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  
  // V3 Detail Modal State
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchProjects(selectedEnterpriseId);
      fetchInboxCount(selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, fetchProjects, fetchInboxCount]);

  const handleOpenDetail = (projectId: number) => {
    setDetailProjectId(projectId);
    setMenuOpenId(null);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedEnterpriseId || !userContext?.id) return;
    
    await createProject(selectedEnterpriseId, userContext.id, {
      nombre: newProjectName.trim()
    });
    
    setNewProjectName('');
    setIsCreating(false);
  };

  const handleUpdateName = async (projectId: number) => {
    if (!editingName.trim()) return;
    
    await updateProject(projectId, { nombre: editingName.trim() });
    setEditingId(null);
    setEditingName('');
  };

  const handleArchive = async (projectId: number) => {
    await archiveProject(projectId);
    setMenuOpenId(null);
  };

  const handleDelete = async (projectId: number) => {
    if (confirm('¿Eliminar este proyecto? Las tareas se moverán a Inbox.')) {
      await deleteProject(projectId);
    }
    setMenuOpenId(null);
  };

  const getIconComponent = (iconName: string) => {
    const capitalizedName = iconName.charAt(0).toUpperCase() + iconName.slice(1);
    const IconComponent = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[capitalizedName];
    return IconComponent || LucideIcons.Folder;
  };

  const getColorClass = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: 'text-blue-400',
      purple: 'text-purple-400',
      pink: 'text-pink-400',
      rose: 'text-rose-400',
      red: 'text-red-400',
      orange: 'text-orange-400',
      amber: 'text-amber-400',
      yellow: 'text-yellow-400',
      lime: 'text-lime-400',
      green: 'text-green-400',
      emerald: 'text-emerald-400',
      teal: 'text-teal-400',
      cyan: 'text-cyan-400',
      sky: 'text-sky-400',
      indigo: 'text-indigo-400',
      violet: 'text-violet-400',
      zinc: 'text-zinc-400'
    };
    return colorMap[color] || 'text-zinc-400';
  };

  const activeProjects = projects.filter(p => p.estado === 'activo');

  if (collapsed) {
    return (
      <div className="w-12 border-r border-zinc-800 bg-zinc-900/50 flex flex-col items-center py-3 gap-2">
        <button
          onClick={() => setSelectedProject(null)}
          className={`relative p-2 rounded-lg transition-colors ${
            selectedProjectId === null 
              ? 'bg-primary-500/20 text-primary-400' 
              : 'text-zinc-400 hover:bg-zinc-800'
          }`}
          title="Sin Proyecto"
        >
          <Inbox className="w-5 h-5" />
          {inboxCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 text-white text-[9px] flex items-center justify-center rounded-full border border-[#0c0c0e]">
              {inboxCount > 9 ? '9+' : inboxCount}
            </span>
          )}
        </button>
        
        <div className="w-6 h-px bg-zinc-700 my-1" />
        
        {activeProjects.map(project => {
          const Icon = getIconComponent(project.icono);
          return (
            <button
              key={project.id}
              onClick={() => setSelectedProject(project.id)}
              className={`p-2 rounded-lg transition-colors ${
                selectedProjectId === project.id 
                  ? 'bg-primary-500/20 text-primary-400' 
                  : `${getColorClass(project.color)} hover:bg-zinc-800`
              }`}
              title={project.nombre}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
        
        <button
          onClick={onToggle}
          className="p-2 text-zinc-500 hover:text-zinc-300 mt-auto"
          title="Expandir"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col h-full">
      {/* Stats Section - Tareas Label */}
      {stats && (
        <div className="py-2 border-b border-zinc-800">
          <div className="px-3 pb-2">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Tareas
            </h3>
          </div>
          <TasksStatsCards
            tasksDueToday={stats.tasksDueToday}
            overdueTasks={stats.overdueTasks}
            inProgress={stats.inProgress}
            completedThisWeek={stats.completedThisWeek}
            variant="sidebar"
          />
        </div>
      )}

      {/* Sin Proyecto (formerly Inbox) */}
      <button
        onClick={() => setSelectedProject(null)}
        className={`flex items-center gap-3 px-3 py-2 mx-2 mt-2 rounded-lg transition-colors ${
          selectedProjectId === null 
            ? 'bg-primary-500/20 text-primary-400' 
            : 'text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <Inbox className="w-4 h-4" />
        <span className="text-sm font-medium flex-1 text-left">Sin Proyecto</span>
        {inboxCount > 0 && (
          <span className="text-xs text-zinc-500">
            {inboxCount}
          </span>
        )}
      </button>

      {/* Proyectos Header - Now below Sin Proyecto */}
      <div className="px-3 pt-3 pb-1">
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          Proyectos
        </h3>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 min-h-0">
        {isLoading && projects.length === 0 ? (
          <div className="text-xs text-zinc-500 px-3 py-2">Cargando...</div>
        ) : (
          activeProjects.map(project => {
            const Icon = getIconComponent(project.icono);
            const isEditing = editingId === project.id;
            const isMenuOpen = menuOpenId === project.id;

            return (
              <div key={project.id} className="relative group">
                {isEditing ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateName(project.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 bg-zinc-800 text-sm px-2 py-1 rounded border border-zinc-700 focus:border-primary-500 outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateName(project.id)}
                      className="p-1 text-emerald-400 hover:bg-zinc-700 rounded"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-zinc-400 hover:bg-zinc-700 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-lg transition-colors ${
                      selectedProjectId === project.id 
                        ? 'bg-primary-500/10 border border-primary-500/20' 
                        : 'hover:bg-zinc-800/50 border border-transparent'
                    }`}
                  >
                    {/* Select project button */}
                    <button
                      onClick={() => setSelectedProject(project.id)}
                      className={`p-1.5 rounded-md transition-colors ${
                        selectedProjectId === project.id
                          ? 'bg-primary-500/20 text-primary-400'
                          : 'hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300'
                      }`}
                      title="Filtrar tareas"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                    
                    {/* Project name - clickeable para abrir detalle */}
                    <button
                      onClick={() => handleOpenDetail(project.id)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0 group/name"
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${getColorClass(project.color)}`} />
                      <span className={`text-sm truncate ${
                        selectedProjectId === project.id ? 'text-primary-300 font-medium' : 'text-zinc-300 group-hover/name:text-zinc-100'
                      }`}>
                        {project.nombre}
                      </span>
                      <ExternalLink className="w-3 h-3 text-zinc-600 opacity-0 group-hover/name:opacity-100 flex-shrink-0 transition-opacity" />
                    </button>
                    
                    {/* Task count */}
                    {project._task_count !== undefined && project._task_count > 0 && (
                      <span className="text-[10px] text-zinc-500 tabular-nums flex-shrink-0">
                        {project._completed_count}/{project._task_count}
                      </span>
                    )}
                    
                    {/* Menu button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(isMenuOpen ? null : project.id);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 rounded flex-shrink-0"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Context Menu */}
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-32">
                    <button
                      onClick={() => handleOpenDetail(project.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      <Layout className="w-3 h-3" />
                      Detalles
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(project.id);
                        setEditingName(project.nombre);
                        setMenuOpenId(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      <Edit2 className="w-3 h-3" />
                      Renombrar
                    </button>
                    <button
                      onClick={() => handleArchive(project.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      <Archive className="w-3 h-3" />
                      Archivar
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-rose-400 hover:bg-zinc-700"
                    >
                      <Trash2 className="w-3 h-3" />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Project */}
      <div className="p-2 border-t border-zinc-800">
        {isCreating ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              placeholder="Nombre del proyecto..."
              className="flex-1 bg-zinc-800 text-sm px-2 py-1.5 rounded border border-zinc-700 focus:border-primary-500 outline-none"
              autoFocus
            />
            <button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim()}
              className="p-1.5 text-emerald-400 hover:bg-zinc-700 rounded disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewProjectName('');
              }}
              className="p-1.5 text-zinc-400 hover:bg-zinc-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            Nuevo Proyecto
          </button>
        )}
      </div>

      {/* Click outside to close menu */}
      {menuOpenId && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setMenuOpenId(null)}
        />
      )}

      {/* V3 Project Detail Modal */}
      {detailProjectId && (
        <ProjectDetailModal
          isOpen={!!detailProjectId}
          onClose={() => setDetailProjectId(null)}
          projectId={detailProjectId}
        />
      )}
    </div>
  );
};
