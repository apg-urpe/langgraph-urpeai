'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDraftStorage } from '../../../hooks/useDraftStorage';
import { 
  Plus, 
  Filter,
  CheckSquare,
  AlertCircle,
  X,
  RefreshCw,
  ListTodo,
  PanelLeftClose,
  PanelLeft,
  EyeOff,
  User,
  Eye
} from 'lucide-react';
import { 
  useContactStore, 
  selectSelectedEnterpriseId,
  selectUserContext,
  selectIsObservationMode
} from '../../../store/contactStore';
import { useAdminStore, selectGlobalTeamMemberIds, selectIsTeamFilterRestricted } from '../../../store/adminStore';
import { useTareasStore } from '../../../store/tareasStore';
import { supabase } from '../../../lib/supabase-client';
import { logger } from '@/lib/logger';
import { useProyectosStore } from '../../../store/proyectosStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { ProjectsSidebar } from './ProjectsSidebar';
import { 
  Task, 
  TaskStatus, 
  TaskPriority,
  TaskType,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  CreateTaskPayload
} from '../../../types/contact';
import { TaskCard } from './TaskCard';
import { TaskModal } from './TaskModal';
import { TaskDetailModal } from './v3/TaskDetailModal';
import { TasksStatsCards } from './TasksStatsCards';
import { TaskSearchCreate } from './TaskSearchCreate';

interface TasksViewProps {
  contactId?: number;
  citaId?: number;
  embedded?: boolean;
  showProjectsSidebar?: boolean;
}

/**
 * PERFORMANCE: Specialized memoized component for task cards to prevent 
 * re-renders of the entire list when only one task changes or during scrolling.
 */
const MemoizedTaskCard = React.memo(({ 
  task, 
  onToggleItem, 
  onEditTask, 
  onDeleteTask, 
  onSelectTask, 
  onNavigateToContact, 
  compact 
}: {
  task: Task;
  onToggleItem: (itemId: number, completado: boolean) => Promise<void>;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: number) => Promise<void>;
  onSelectTask: (task: Task) => void;
  onNavigateToContact: (contactId: number) => void;
  compact: boolean;
}) => (
  <TaskCard
    task={task}
    onToggleItem={onToggleItem}
    onEditTask={onEditTask}
    onDeleteTask={onDeleteTask}
    onSelectTask={onSelectTask}
    onNavigateToContact={onNavigateToContact}
    compact={compact}
  />
));
MemoizedTaskCard.displayName = 'MemoizedTaskCard';

export const TasksView: React.FC<TasksViewProps> = ({
  contactId,
  citaId,
  embedded = false,
  showProjectsSidebar = true
}) => {
  // PERF: Granular selectors to prevent unnecessary re-renders
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const isObservationMode = useContactStore(selectIsObservationMode);
  const { projects, selectedProjectId } = useProyectosStore();
  
  // Engagement tracking
  usePageTracking('tasks');
  const trackAction = useActionTracking('tasks');

  const { 
    tasks, 
    isLoading, 
    error,
    filters,
    fetchTasks,
    fetchTasksByContact,
    fetchTasksByAppointment,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskItem,
    setFilters,
    resetFilters,
    clearError
  } = useTareasStore();

  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamMembers, setTeamMembers] = useState<Array<{ id: number; nombre: string; apellido: string }>>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Notion-style quick filters - persisted
  const [hideCompleted, setHideCompleted] = useDraftStorage<boolean>(
    'task_form',
    'filter_hide_completed',
    false
  );
  const [showOnlyMine, setShowOnlyMine] = useDraftStorage<boolean>(
    'task_form',
    'filter_show_mine',
    false
  );

  // Sync LOCAL filters with STORE filters on mount (Kaizen)
  useEffect(() => {
    if (hideCompleted || showOnlyMine) {
      logger.debug('[TasksView] Syncing local filters to store');
      // Si el store tuviera filtros de UI persistentes, los sincronizaríamos aquí.
      // Por ahora, localTasks en TasksView ya depende de hideCompleted y showOnlyMine directamente.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // hideCompleted, showOnlyMine excluded - mount-only sync
  
  // Global team filter from adminStore (array of selected IDs)
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const isTeamFilterRestricted = useAdminStore(selectIsTeamFilterRestricted);
  
  // SECURITY: For role 3, ensure filter is always applied
  const isBasicRole = userContext?.roleId === 3;
  const effectiveTeamMemberIds = React.useMemo(() => {
    if (isBasicRole && userContext?.id) {
      return globalTeamMemberIds.length > 0 ? globalTeamMemberIds : [userContext.id];
    }
    return globalTeamMemberIds;
  }, [isBasicRole, userContext?.id, globalTeamMemberIds]);

  // Fetch tasks based on context
  useEffect(() => {
    const loadTasks = async () => {
      if (contactId) {
        const contactTasks = await fetchTasksByContact(contactId);
        setLocalTasks(contactTasks);
      } else if (citaId) {
        const citaTasks = await fetchTasksByAppointment(citaId);
        setLocalTasks(citaTasks);
      } else if (selectedEnterpriseId) {
        await fetchTasks(selectedEnterpriseId);
      }
    };

    loadTasks();
  }, [selectedEnterpriseId, contactId, citaId, fetchTasks, fetchTasksByContact, fetchTasksByAppointment]);

  // Use store tasks when not in embedded mode, apply local filters
  useEffect(() => {
    if (!contactId && !citaId) {
      let filtered = tasks;
      
      // Filter by project (V2)
      if (selectedProjectId !== undefined) {
        filtered = filtered.filter(t => 
          (t as { proyecto_id?: number | null }).proyecto_id === selectedProjectId
        );
      }
      
      // Filter by team members (SECURITY: role 3 always filters by own ID)
      if (effectiveTeamMemberIds.length > 0) {
        filtered = filtered.filter(t => 
          effectiveTeamMemberIds.includes(t.asignado_a!) || effectiveTeamMemberIds.includes(t.creado_por!)
        );
      }
      
      // Búsqueda local
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t => 
          t.titulo.toLowerCase().includes(q) ||
          t.descripcion?.toLowerCase().includes(q) ||
          t.contacto?.nombre?.toLowerCase().includes(q) ||
          t.contacto?.apellido?.toLowerCase().includes(q)
        );
      }
      
      // Notion-style: Hide completed
      if (hideCompleted) {
        filtered = filtered.filter(t => t.estado !== 'completada');
      }
      
      // Notion-style: Show only mine
      if (showOnlyMine && userContext?.id) {
        filtered = filtered.filter(t => t.asignado_a === userContext.id || t.creado_por === userContext.id);
      }
      
      setLocalTasks(filtered);
    }
  }, [tasks, contactId, citaId, searchQuery, effectiveTeamMemberIds, selectedProjectId, hideCompleted, showOnlyMine, userContext?.id]);

  // Fetch team members for assignment
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!selectedEnterpriseId) return;
      
      const { data } = await supabase
        .from('wp_team_humano')
        .select('id, nombre, apellido')
        .eq('empresa_id', selectedEnterpriseId)
        .eq('is_active', true)
        .order('nombre');
      
      if (data) {
        setTeamMembers(data);
      }
    };

    fetchTeamMembers();
  }, [selectedEnterpriseId]);

  const handleCreateTask = async (payload: CreateTaskPayload) => {
    if (!selectedEnterpriseId || !userContext) return;
    
    const newTask = await createTask(selectedEnterpriseId, userContext.id, payload);
    
    if (newTask && (contactId || citaId)) {
      setLocalTasks(prev => [newTask, ...prev]);
    }
    // Refresh to ensure we get V3 fields if needed
    fetchTasks(selectedEnterpriseId, true);
  };

  const handleUpdateTask = async (taskId: number, payload: Partial<Task>) => {
    await updateTask(taskId, payload);
    // Local refresh handled by store subscription usually, but for localTasks:
    if (contactId || citaId) {
      if (contactId) {
        const updated = await fetchTasksByContact(contactId);
        setLocalTasks(updated);
      } else if (citaId) {
        const updated = await fetchTasksByAppointment(citaId);
        setLocalTasks(updated);
      }
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('¿Estás seguro de eliminar esta tarea?')) return;
    
    const success = await deleteTask(taskId);
    if (success) {
      if (contactId || citaId) {
        setLocalTasks(prev => prev.filter(t => t.id !== taskId));
      }
      if (detailTaskId === taskId) {
        setDetailTaskId(null);
      }
    }
  };

  const handleToggleItem = async (itemId: number, completado: boolean) => {
    try {
      trackAction('tasks.toggle_item', { itemId, completado });
      await toggleTaskItem(itemId, completado);
    } catch (err) {
      console.error('Error toggling task item:', err);
    }
  };

  const handleOpenTask = (task: Task) => {
    setDetailTaskId(task.id);
  };

  const handleCloseDetail = () => {
    setDetailTaskId(null);
    // Refresh tasks when closing detail to show updates
    if (selectedEnterpriseId) fetchTasks(selectedEnterpriseId);
  };

  const handleRefresh = () => {
    if (selectedEnterpriseId) {
      fetchTasks(selectedEnterpriseId, true);
    }
  };

  // Stats - Square UI Style
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const pendingCount = localTasks.filter(t => t.estado === 'pendiente').length;
  const inProgressCount = localTasks.filter(t => t.estado === 'en_progreso').length;
  const overdueCount = localTasks.filter(t => 
    t.fecha_vencimiento && 
    new Date(t.fecha_vencimiento) < now && 
    t.estado !== 'completada'
  ).length;
  
  // Tasks due today
  const tasksDueToday = localTasks.filter(t => {
    if (!t.fecha_vencimiento || t.estado === 'completada') return false;
    const dueDate = new Date(t.fecha_vencimiento);
    return dueDate.toDateString() === today.toDateString();
  }).length;
  
  // Completed this week
  const completedThisWeek = localTasks.filter(t => {
    if (t.estado !== 'completada') return false;
    const updatedAt = t.updated_at ? new Date(t.updated_at) : null;
    return updatedAt && updatedAt >= weekAgo;
  }).length;

  // Filter active
  const hasActiveFilters = filters.estado || filters.prioridad || filters.tipo || filters.search;

  const currentProjectName = selectedProjectId 
    ? projects.find(p => p.id === selectedProjectId)?.nombre 
    : 'Inbox';

  return (
    <div className={`h-full flex ${embedded ? 'flex-col' : 'overflow-hidden'}`}>
      {/* Projects Sidebar - Only show in full view on desktop */}
      {!embedded && showProjectsSidebar && (
        <div className="hidden md:flex h-full">
          <ProjectsSidebar 
            collapsed={sidebarCollapsed} 
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
            stats={{
              tasksDueToday,
              overdueTasks: overdueCount,
              inProgress: inProgressCount,
              completedThisWeek
            }}
          />
        </div>
      )}
      
      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${embedded ? '' : 'p-3 md:p-4'} overflow-hidden pb-20 md:pb-0`}>
        {/* Header - Mobile optimized */}
        <div className="flex flex-col gap-3 mb-3 md:mb-4">
          {/* Row 1: Title + Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Toggle sidebar button - desktop only */}
              {!embedded && showProjectsSidebar && (
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="hidden md:flex p-1.5 hover:bg-white/5 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
                  title={sidebarCollapsed ? 'Expandir proyectos' : 'Colapsar proyectos'}
                >
                  {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
              )}
              <CheckSquare className="w-4 h-4 text-primary-400" />
              <h2 className={`font-semibold text-zinc-200 ${embedded ? 'text-sm' : 'text-sm md:text-base'}`}>
                {!embedded && currentProjectName ? currentProjectName : 'Tareas'}
              </h2>
            </div>
          
            {/* Actions */}
            <div className="flex items-center gap-2">
          {!embedded && (
            <>
              <button
                onClick={handleRefresh}
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-zinc-600 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-1.5 rounded-lg transition-colors ${
                  hasActiveFilters 
                    ? 'bg-primary-500/10 text-primary-400' 
                    : 'hover:bg-white/5 text-zinc-600'
                }`}
                title="Filtros"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {/* Botón estilo Monica con glow */}
          <button
              onClick={() => setIsCreateModalOpen(true)}
              className="group relative flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-300
                bg-[#0c1a1a] border border-primary-500/40 text-primary-400
                hover:border-primary-400/60 hover:text-primary-300 hover:shadow-[0_0_20px_rgba(0,210,200,0.15)]
                active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{embedded ? '' : 'Nueva'}</span>
            </button>
            </div>
          </div>
          
          {/* Row 2: Quick Stats - Horizontal scroll on mobile */}
          {!embedded && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              <span className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium bg-zinc-800/80 text-zinc-400 border border-white/5">
                {pendingCount} pend.
              </span>
              <span className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium bg-primary-500/10 text-primary-400 border border-primary-500/20">
                {inProgressCount} progreso
              </span>
              {overdueCount > 0 && (
                <span className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertCircle className="w-2.5 h-2.5 inline mr-0.5" />
                  {overdueCount} atrasadas
                </span>
              )}
              <span className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {completedThisWeek} semana
              </span>
            </div>
          )}
        </div>

      {/* Stats Cards - Square UI Style - MOVED TO SIDEBAR */}
      {/* {!embedded && (
        <div className="mb-4">
          <TasksStatsCards
            tasksDueToday={tasksDueToday}
            overdueTasks={overdueCount}
            inProgress={inProgressCount}
            completedThisWeek={completedThisWeek}
          />
        </div>
      )} */}

      {/* Unified Search + Create Component */}
      {!embedded && (
        <div className="mb-4">
          <TaskSearchCreate
            onCreateTask={handleCreateTask}
            onSearch={setSearchQuery}
            searchQuery={searchQuery}
            projectId={selectedProjectId ?? undefined}
            disabled={false}
          />
        </div>
      )}

      {/* Notion-style Quick Filters */}
      {!embedded && (
        <div className="flex items-center gap-3 mb-4 px-1">
          {/* Hide Completed Toggle */}
          <button
            onClick={() => setHideCompleted(!hideCompleted)}
            className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              hideCompleted
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
            }`}
          >
            {hideCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>Ocultar completadas</span>
          </button>
          
          {/* Show Only Mine Toggle */}
          <button
            onClick={() => setShowOnlyMine(!showOnlyMine)}
            className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              showOnlyMine
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Ver mías</span>
          </button>
          
          {/* Active filters indicator */}
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
      )}

      {/* Filters Panel - Mobile optimized */}
      {showFilters && !embedded && (
        <div className="mb-3 md:mb-4 p-3 md:p-4 bg-zinc-900/50 border border-zinc-800/70 rounded-xl md:rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Filtros</span>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Limpiar
              </button>
            )}
          </div>
          
          <div className="flex flex-col md:flex-row md:flex-wrap gap-3 md:gap-2">
            {/* Estado - Chips */}
            <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-1">
              <span className="text-[10px] text-zinc-600">Estado:</span>
              <div className="flex flex-wrap gap-1">
                {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilters({ estado: filters.estado === value ? null : value as TaskStatus })}
                    className={`px-2 py-1.5 md:py-1 rounded-md text-[10px] font-medium transition-all ${
                      filters.estado === value
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                        : 'bg-zinc-900/50 text-zinc-500 border border-white/5 hover:border-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prioridad - Chips */}
            <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-1">
              <span className="text-[10px] text-zinc-600">Prioridad:</span>
              <div className="flex flex-wrap gap-1">
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilters({ prioridad: filters.prioridad === Number(value) ? null : Number(value) as TaskPriority })}
                    className={`px-2 py-1.5 md:py-1 rounded-md text-[10px] font-medium transition-all ${
                      filters.prioridad === Number(value)
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                        : 'bg-zinc-900/50 text-zinc-500 border border-white/5 hover:border-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo - Chips */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-600 mr-1">Tipo:</span>
              {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilters({ tipo: filters.tipo === value ? null : value as TaskType })}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                    filters.tipo === value
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'bg-zinc-900/50 text-zinc-500 border border-white/5 hover:border-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Asignado - Select pequeño */}
            {teamMembers.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-600 mr-1">Asignado:</span>
                <select
                  value={filters.asignadoA || ''}
                  onChange={(e) => setFilters({ asignadoA: e.target.value ? Number(e.target.value) : null })}
                  className="px-2 py-1 bg-zinc-900/50 border border-white/5 rounded-md text-[10px] text-zinc-400 focus:outline-none focus:border-primary-500/30 cursor-pointer"
                >
                  <option value="">Todos</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.nombre} {member.apellido?.charAt(0)}.
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-between">
          <span className="text-sm text-rose-400">{error}</span>
          <button onClick={clearError} className="text-rose-400 hover:text-rose-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {isLoading && localTasks.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : localTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 border border-white/5 flex items-center justify-center mb-4">
              <ListTodo className="w-8 h-8 text-zinc-700" />
            </div>
            {isBasicRole && !hasActiveFilters && !searchQuery ? (
              <>
                <p className="text-zinc-400 text-sm font-medium mb-1">Sin tareas asignadas</p>
                <p className="text-zinc-500 text-xs max-w-xs">
                  No tienes tareas asignadas. Las tareas aparecerán aquí cuando te sean asignadas o las crees.
                </p>
              </>
            ) : (
              <>
                <p className="text-zinc-500 text-sm mb-1">
                  {hasActiveFilters ? 'No hay tareas que coincidan con los filtros' : 'No hay tareas aún'}
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-primary-400 hover:text-primary-300 text-sm transition-colors"
                >
                  Crear primera tarea
                </button>
              </>
            )}
          </div>
        ) : (
          localTasks.map((task) => (
            <div key={task.id} className="perf-task-card">
              <MemoizedTaskCard
                task={task}
                onToggleItem={handleToggleItem}
                onEditTask={handleOpenTask}
                onDeleteTask={handleDeleteTask}
                onSelectTask={handleOpenTask}
                onNavigateToContact={(contactId) => {
                  // Dispatch event to open contact detail in admin panel
                  window.dispatchEvent(new CustomEvent('openContactDetail', { detail: { contactId } }));
                }}
                compact={embedded}
              />
            </div>
          ))
        )}
        </div>

        {/* V2 Modal for Creation */}
        <TaskModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={handleCreateTask}
          contactId={contactId}
          citaId={citaId}
          projectId={selectedProjectId || undefined}
          teamMembers={teamMembers}
        />

        {/* V3 Modal for Details/Editing */}
        {detailTaskId && (
          <TaskDetailModal
            isOpen={!!detailTaskId}
            onClose={handleCloseDetail}
            taskId={detailTaskId}
          />
        )}
      </div>
    </div>
  );
};

export default TasksView;
