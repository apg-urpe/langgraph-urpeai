import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { logTaskActivity } from '../lib/activity-logger';
import { 
  Task, 
  TaskItem,
  TaskStatus, 
  TaskPriority, 
  TaskType,
  TaskFilters,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskComment,
  TeamLabel
} from '../types/contact';
import { 
  TaskV3, 
  TaskMedia, 
  TaskHistory, 
  TaskLabelRelation,
  CommentReaction,
  ReactionEmoji,
  CreateMediaPayload,
  TaskFiltersV3,
  initialFiltersV3
} from '../types/tasks-v3';
import { useGamificationStore } from './gamificationStore';
import { useProyectosStore } from './proyectosStore';
import { useContactStore } from './contactStore';

// Storage bucket for task attachments
const TASK_ATTACHMENTS_BUCKET = 'task-attachments';

interface TareasState {
  // Data
  tasks: Task[];
  selectedTask: TaskV3 | null;
  teamLabels: TeamLabel[];
  
  // UI State
  isLoading: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  filters: TaskFiltersV3;
  
  // Cache
  lastFetch: number | null;
  
  // Actions - Fetch
  fetchTasks: (empresaId: number, forceRefresh?: boolean) => Promise<void>;
  fetchTaskById: (taskId: number) => Promise<TaskV3 | null>;
  fetchTasksByContact: (contactoId: number) => Promise<Task[]>;
  fetchTasksByAppointment: (citaId: number) => Promise<Task[]>;
  fetchTeamLabels: (empresaId: number) => Promise<void>;
  
  // Actions - CRUD Tasks
  createTask: (empresaId: number, creadoPor: number, payload: CreateTaskPayload) => Promise<Task | null>;
  updateTask: (taskId: number, payload: UpdateTaskPayload) => Promise<Task | null>;
  deleteTask: (taskId: number) => Promise<boolean>;
  
  // Actions - Task Items
  addTaskItem: (taskId: number, texto: string) => Promise<TaskItem | null>;
  updateTaskItem: (itemId: number, texto: string) => Promise<TaskItem | null>;
  toggleTaskItem: (itemId: number, completado: boolean, completadoPor?: number) => Promise<TaskItem | null>;
  deleteTaskItem: (itemId: number) => Promise<boolean>;
  reorderTaskItems: (taskId: number, itemIds: number[]) => Promise<boolean>;
  
  // Actions - V3: Media
  uploadTaskMedia: (taskId: number, file: File, subidoPor: number, descripcion?: string) => Promise<TaskMedia | null>;
  deleteTaskMedia: (mediaId: number) => Promise<boolean>;
  setTaskCover: (taskId: number, mediaId: number) => Promise<boolean>;
  
  // Actions - V3: Labels
  addTaskLabel: (taskId: number, etiquetaId: number) => Promise<boolean>;
  removeTaskLabel: (taskId: number, etiquetaId: number) => Promise<boolean>;
  
  // Actions - V3: History
  fetchTaskHistory: (taskId: number) => Promise<TaskHistory[]>;
  addTaskHistory: (taskId: number, accion: string, autorId: number, options?: { campoModificado?: string; valorAnterior?: string | null; valorNuevo?: string | null; metadata?: Record<string, unknown> }) => Promise<TaskHistory | null>;
  
  // Actions - V3: Comments & Reactions
  addComment: (taskId: number, contenido: string, autorId: number, mentions?: number[]) => Promise<TaskComment | null>;
  updateComment: (commentId: number, contenido: string) => Promise<TaskComment | null>;
  deleteComment: (commentId: number) => Promise<boolean>;
  toggleReaction: (commentId: number, usuarioId: number, emoji: ReactionEmoji) => Promise<boolean>;
  
  // Actions - UI
  setFilters: (filters: Partial<TaskFiltersV3>) => void;
  resetFilters: () => void;
  setSelectedTask: (task: TaskV3 | null) => void;
  clearError: () => void;
  
  // Actions - Reset (for enterprise change)
  clearTasks: () => void;
}

// Cache duration (5 minutes)
const CACHE_MS = 300000;

export const useTareasStore = create<TareasState>((set, get) => ({
  // Initial State
  tasks: [],
  selectedTask: null,
  teamLabels: [],
  isLoading: false,
  isLoadingDetail: false,
  error: null,
  filters: initialFiltersV3,
  lastFetch: null,

  // ============================================================================
  // FETCH ACTIONS
  // ============================================================================

  fetchTasks: async (empresaId: number, forceRefresh = false) => {
    const { lastFetch, filters } = get();
    
    // Check cache
    if (!forceRefresh && lastFetch && Date.now() - lastFetch < CACHE_MS) {
      logger.debug('[TareasStore] Using cached tasks');
      return;
    }

    set({ isLoading: true, error: null });

    try {
      let query = supabase
        .from('wp_tareas')
        .select(`
          *,
          items:wp_tareas_items(id, texto, orden, completado, completado_por, completado_at, created_at),
          asignado:wp_team_humano!asignado_a(id, nombre, apellido),
          creador:wp_team_humano!creado_por(id, nombre, apellido),
          contacto:wp_contactos(id, nombre, apellido, telefono),
          proyecto:wp_proyectos(id, nombre, color)
        `)
        .eq('empresa_id', empresaId)
        .order('prioridad', { ascending: false })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.estado) {
        query = query.eq('estado', filters.estado);
      }
      if (filters.prioridad) {
        query = query.eq('prioridad', filters.prioridad);
      }
      if (filters.asignadoA) {
        query = query.eq('asignado_a', filters.asignadoA);
      }
      if (filters.fechaDesde) {
        query = query.gte('fecha_vencimiento', filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        query = query.lte('fecha_vencimiento', filters.fechaHasta);
      }
      if (filters.search) {
        query = query.ilike('titulo', `%${filters.search}%`);
      }

      // Filter by task type (inferred from FKs)
      if (filters.tipo === 'contacto') {
        query = query.not('contacto_id', 'is', null);
      } else if (filters.tipo === 'cita') {
        query = query.not('cita_id', 'is', null);
      } else if (filters.tipo === 'conversacion') {
        query = query.not('conversacion_id', 'is', null);
      } else if (filters.tipo === 'equipo') {
        query = query
          .is('contacto_id', null)
          .is('cita_id', null)
          .is('conversacion_id', null)
          .not('asignado_a', 'is', null);
      } else if (filters.tipo === 'general') {
        query = query
          .is('contacto_id', null)
          .is('cita_id', null)
          .is('conversacion_id', null)
          .is('asignado_a', null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Sort items by orden
      const tasksWithSortedItems = (data || []).map((task: any) => ({
        ...task,
        items: (task.items || []).sort((a: TaskItem, b: TaskItem) => a.orden - b.orden)
      }));

      logger.debug('[TareasStore]', `Fetched ${tasksWithSortedItems.length} tasks`);

      set({ 
        tasks: tasksWithSortedItems as Task[], 
        isLoading: false,
        lastFetch: Date.now()
      });
    } catch (error: any) {
      logger.error('[TareasStore] Error fetching tasks:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  fetchTaskById: async (taskId: number) => {
    set({ isLoadingDetail: true });
    try {
      const { data, error } = await supabase
        .from('wp_tareas')
        .select(`
          *,
          items:wp_tareas_items(id, texto, orden, completado, completado_por, completado_at, created_at),
          asignado:wp_team_humano!asignado_a(id, nombre, apellido),
          creador:wp_team_humano!creado_por(id, nombre, apellido),
          contacto:wp_contactos(id, nombre, apellido, telefono, email),
          cita:wp_citas(id, titulo, fecha_hora),
          proyecto:wp_proyectos(id, nombre, color, contacto_id),
          comentarios:wp_tareas_comentarios(id, contenido, autor_id, created_at, editado, autor:wp_team_humano!autor_id(id, nombre, apellido)),
          etiquetas:wp_tareas_etiquetas(tarea_id, etiqueta_id, created_at, etiqueta:wp_etiquetas_equipo(id, nombre, color, descripcion))
        `)
        .eq('id', taskId)
        .single();

      if (error) throw error;

      const task = {
        ...data,
        items: (data.items || []).sort((a: TaskItem, b: TaskItem) => a.orden - b.orden),
        comentarios: (data.comentarios || []).sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      } as Task;

      set({ selectedTask: task, isLoadingDetail: false });
      return task;
    } catch (error: any) {
      logger.error('[TareasStore] Error fetching task:', error);
      set({ error: error.message, isLoadingDetail: false });
      return null;
    }
  },

  // SECURITY: Filter by empresa_id to ensure multi-tenant isolation
  fetchTasksByContact: async (contactoId: number, empresaId?: number) => {
    try {
      // Get empresaId from parameter or from contactStore
      let resolvedEmpresaId = empresaId;
      if (!resolvedEmpresaId) {
        const { useContactStore } = await import('./contactStore');
        resolvedEmpresaId = useContactStore.getState().selectedEnterpriseId ?? undefined;
      }
      
      if (!resolvedEmpresaId) {
        logger.error('[TareasStore] ⛔ No empresa_id available for fetchTasksByContact');
        return [];
      }

      const { data, error } = await supabase
        .from('wp_tareas')
        .select(`
          *,
          items:wp_tareas_items(id, texto, orden, completado, completado_por, completado_at, created_at),
          asignado:wp_team_humano!asignado_a(id, nombre, apellido)
        `)
        .eq('contacto_id', contactoId)
        .eq('empresa_id', resolvedEmpresaId)
        .order('prioridad', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((task: any) => ({
        ...task,
        items: (task.items || []).sort((a: TaskItem, b: TaskItem) => a.orden - b.orden)
      })) as Task[];
    } catch (error: any) {
      logger.error('[TareasStore] Error fetching contact tasks:', error);
      return [];
    }
  },

  // SECURITY: Filter by empresa_id to ensure multi-tenant isolation
  fetchTasksByAppointment: async (citaId: number, empresaId?: number) => {
    try {
      // Get empresaId from parameter or from contactStore
      let resolvedEmpresaId = empresaId;
      if (!resolvedEmpresaId) {
        const { useContactStore } = await import('./contactStore');
        resolvedEmpresaId = useContactStore.getState().selectedEnterpriseId ?? undefined;
      }
      
      if (!resolvedEmpresaId) {
        logger.error('[TareasStore] ⛔ No empresa_id available for fetchTasksByAppointment');
        return [];
      }

      const { data, error } = await supabase
        .from('wp_tareas')
        .select(`
          *,
          items:wp_tareas_items(id, texto, orden, completado, completado_por, completado_at, created_at),
          asignado:wp_team_humano!asignado_a(id, nombre, apellido)
        `)
        .eq('cita_id', citaId)
        .eq('empresa_id', resolvedEmpresaId)
        .order('prioridad', { ascending: false });

      if (error) throw error;

      return (data || []).map((task: any) => ({
        ...task,
        items: (task.items || []).sort((a: TaskItem, b: TaskItem) => a.orden - b.orden)
      })) as Task[];
    } catch (error: any) {
      logger.error('[TareasStore] Error fetching appointment tasks:', error);
      return [];
    }
  },

  // ============================================================================
  // CRUD ACTIONS - Tasks
  // ============================================================================

  createTask: async (empresaId: number, creadoPor: number, payload: CreateTaskPayload) => {
    set({ isLoading: true, error: null });

    // Validation
    if (!empresaId || empresaId <= 0) {
      logger.error('[TareasStore] createTask: Invalid empresaId');
      set({ error: 'ID de empresa inválido', isLoading: false });
      return null;
    }
    if (!creadoPor || creadoPor <= 0) {
      logger.error('[TareasStore] createTask: Invalid creadoPor');
      set({ error: 'ID de usuario inválido', isLoading: false });
      return null;
    }
    if (!payload.titulo?.trim()) {
      logger.error('[TareasStore] createTask: Empty titulo');
      set({ error: 'El título es requerido', isLoading: false });
      return null;
    }

    try {
      // Create task
      const { data: task, error: taskError } = await supabase
        .from('wp_tareas')
        .insert({
          titulo: payload.titulo,
          descripcion: payload.descripcion || null,
          prioridad: payload.prioridad || 2,
          empresa_id: empresaId,
          creado_por: creadoPor,
          asignado_a: payload.asignado_a || null,
          contacto_id: payload.contacto_id || null,
          cita_id: payload.cita_id || null,
          conversacion_id: payload.conversacion_id || null,
          proyecto_id: payload.proyecto_id || null,
          fecha_vencimiento: payload.fecha_vencimiento || null,
          estado: 'pendiente'
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Create assignment for statistics and notifications
      // Si no hay asignado_a, auto-asignamos al creador para que cuente en sus métricas de gamificación
      const targetAsignadoId = payload.asignado_a || creadoPor;
      if (targetAsignadoId) {
        const { error: assignError } = await supabase
          .from('wp_tareas_asignados')
          .insert({
            tarea_id: task.id,
            team_humano_id: targetAsignadoId,
            rol: 'responsable',
            asignado_por: creadoPor
          });
        
        if (assignError) {
          logger.warn('[TareasStore] Error creating assignment:', assignError);
        }
      }

      // Create items if provided
      if (payload.items && payload.items.length > 0) {
        const itemsToInsert = payload.items.map((texto, index) => ({
          tarea_id: task.id,
          texto,
          orden: index
        }));

        const { error: itemsError } = await supabase
          .from('wp_tareas_items')
          .insert(itemsToInsert);

        if (itemsError) {
          logger.warn('[TareasStore] Error creating items:', itemsError);
        }
      }

      // Refresh to get full task with relations
      const fullTask = await get().fetchTaskById(task.id);
      
      // Update local state
      if (fullTask) {
        set(state => ({ 
          tasks: [fullTask, ...state.tasks],
          isLoading: false 
        }));

        // Update Project Counts (if assigned to a project)
        if (fullTask.proyecto_id) {
          useProyectosStore.getState().updateProjectCounts(fullTask.proyecto_id, { tasks: 1 });
        } else {
          // Update Inbox Count (only if active)
          if (fullTask.estado === 'pendiente' || fullTask.estado === 'en_progreso') {
            useProyectosStore.getState().updateInboxCount(1);
          }
        }
      } else {
        // Fallback if fetchTaskById fails (shouldn't happen often, but handle it)
        logger.warn('[TareasStore] Could not fetch full task details, using basic task data');
        set(state => ({ 
          tasks: [task as Task, ...state.tasks],
          isLoading: false 
        }));
      }

      // Log activity (audit)
      logTaskActivity(
        'crear',
        task.id,
        empresaId,
        payload.contacto_id,
        `Tarea creada: ${payload.titulo}`,
        { despues: { ...payload, id: task.id } }
      );

      // Add task history (UI visible)
      get().addTaskHistory(task.id, 'created', creadoPor);

      logger.debug('[TareasStore] Created task:', task.id);
      return fullTask || (task as Task);
    } catch (error: any) {
      logger.error('[TareasStore] Error creating task:', error);
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  updateTask: async (taskId: number, payload: UpdateTaskPayload) => {
    // Validation
    if (!taskId || taskId <= 0) {
      logger.error('[TareasStore] updateTask: Invalid taskId');
      set({ error: 'ID de tarea inválido' });
      return null;
    }
    if (!payload || Object.keys(payload).length === 0) {
      logger.error('[TareasStore] updateTask: Empty payload');
      set({ error: 'No hay cambios para actualizar' });
      return null;
    }
    // Validate titulo if provided
    if (payload.titulo !== undefined && !payload.titulo?.trim()) {
      logger.error('[TareasStore] updateTask: Empty titulo');
      set({ error: 'El título no puede estar vacío' });
      return null;
    }

    try {
      const updateData: any = { ...payload };
      
      // If marking as completed, set fecha_completada
      if (payload.estado === 'completada') {
        updateData.fecha_completada = new Date().toISOString();
        
        // Award XP for completing the task
        const gamificationStore = useGamificationStore.getState();
        
        // Check if completed on time (before due date)
        const { tasks } = get();
        const task = tasks.find(t => t.id === taskId);
        const isOnTime = task?.fecha_vencimiento 
          ? new Date() <= new Date(task.fecha_vencimiento) 
          : true;
        
        gamificationStore.awardXP(
          isOnTime ? 'task_completed_on_time' : 'task_completed',
          `Tarea completada: ${task?.titulo || 'Sin título'}`,
          taskId,
          'task'
        );
      } else if (payload.estado) {
        // Any other status clears the completion date
        updateData.fecha_completada = null;
      }

      // Get current task state for project count updates
      const currentTask = get().tasks.find(t => t.id === taskId);

      const { data, error } = await supabase
        .from('wp_tareas')
        .update(updateData)
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      // Refresh full task
      const fullTask = await get().fetchTaskById(taskId);

      // Update local state
      if (fullTask) {
        set(state => ({
          tasks: state.tasks.map(t => t.id === taskId ? fullTask : t),
          selectedTask: state.selectedTask?.id === taskId ? fullTask : state.selectedTask
        }));

        // Handle Project & Inbox Counts
        const proyectosStore = useProyectosStore.getState();
        const wasActive = currentTask && (currentTask.estado === 'pendiente' || currentTask.estado === 'en_progreso');
        const isActive = fullTask.estado === 'pendiente' || fullTask.estado === 'en_progreso';
        const wasInInbox = currentTask && !currentTask.proyecto_id;
        const isInInbox = !fullTask.proyecto_id;
        
        // Case 1: Task stays in same project (status change only)
        if (currentTask && fullTask.proyecto_id && fullTask.proyecto_id === currentTask.proyecto_id) {
            const wasCompleted = currentTask.estado === 'completada';
            const isCompleted = fullTask.estado === 'completada';
            
            if (!wasCompleted && isCompleted) {
                proyectosStore.updateProjectCounts(fullTask.proyecto_id, { completed: 1 });
            } else if (wasCompleted && !isCompleted) {
                proyectosStore.updateProjectCounts(fullTask.proyecto_id, { completed: -1 });
            }
        }
        
        // Case 2: Task stays in Inbox (status change only)
        if (currentTask && wasInInbox && isInInbox) {
            if (wasActive && !isActive) {
                proyectosStore.updateInboxCount(-1);
            } else if (!wasActive && isActive) {
                proyectosStore.updateInboxCount(1);
            }
        }
        
        // Case 3: Task moved between projects or Inbox↔Project
        if (currentTask && currentTask.proyecto_id !== fullTask.proyecto_id) {
            // Remove from old location
            if (currentTask.proyecto_id) {
                proyectosStore.updateProjectCounts(currentTask.proyecto_id, { 
                    tasks: -1, 
                    completed: currentTask.estado === 'completada' ? -1 : 0 
                });
            } else if (wasActive) {
                // Was in Inbox and active
                proyectosStore.updateInboxCount(-1);
            }
            
            // Add to new location
            if (fullTask.proyecto_id) {
                proyectosStore.updateProjectCounts(fullTask.proyecto_id, { 
                    tasks: 1, 
                    completed: fullTask.estado === 'completada' ? 1 : 0 
                });
            } else if (isActive) {
                // Moved to Inbox and active
                proyectosStore.updateInboxCount(1);
            }
        }
      }

      // Log activity (audit)
      if (fullTask) {
        logTaskActivity(
          'actualizar',
          taskId,
          fullTask.empresa_id,
          fullTask.contacto_id ?? undefined,
          `Tarea actualizada: ${fullTask.titulo}`,
          { 
            antes: currentTask ? { estado: currentTask.estado, titulo: currentTask.titulo } : undefined,
            despues: payload as Record<string, unknown>
          }
        );

        // Add task history (UI visible) - track specific changes
        const autorId = fullTask.asignado_a || fullTask.creado_por;
        if (autorId && currentTask) {
          if (payload.estado && payload.estado !== currentTask.estado) {
            get().addTaskHistory(taskId, 'status_changed', autorId, {
              campoModificado: 'estado',
              valorAnterior: currentTask.estado,
              valorNuevo: payload.estado
            });
          }
          if (payload.prioridad && payload.prioridad !== currentTask.prioridad) {
            get().addTaskHistory(taskId, 'priority_changed', autorId, {
              campoModificado: 'prioridad',
              valorAnterior: String(currentTask.prioridad),
              valorNuevo: String(payload.prioridad)
            });
          }
          if (payload.fecha_vencimiento !== undefined && payload.fecha_vencimiento !== currentTask.fecha_vencimiento) {
            get().addTaskHistory(taskId, 'due_date_changed', autorId, {
              campoModificado: 'fecha_vencimiento',
              valorAnterior: currentTask.fecha_vencimiento || null,
              valorNuevo: payload.fecha_vencimiento || null
            });
          }
          if (payload.asignado_a !== undefined && payload.asignado_a !== currentTask.asignado_a) {
            get().addTaskHistory(taskId, payload.asignado_a ? 'assigned' : 'unassigned', autorId, {
              campoModificado: 'asignado_a',
              valorAnterior: currentTask.asignado_a ? String(currentTask.asignado_a) : null,
              valorNuevo: payload.asignado_a ? String(payload.asignado_a) : null
            });
          }
        }
      }

      logger.debug('[TareasStore] Updated task:', taskId);
      return fullTask;
    } catch (error: any) {
      logger.error('[TareasStore] Error updating task:', error);
      set({ error: error.message });
      return null;
    }
  },

  deleteTask: async (taskId: number) => {
    // Validation
    if (!taskId || taskId <= 0) {
      logger.error('[TareasStore] deleteTask: Invalid taskId');
      set({ error: 'ID de tarea inválido' });
      return false;
    }

    try {
      // Get task to update project counts
      const task = get().tasks.find(t => t.id === taskId);

      const { error } = await supabase
        .from('wp_tareas')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      // Update local state
      set(state => ({
        tasks: state.tasks.filter(t => t.id !== taskId),
        selectedTask: state.selectedTask?.id === taskId ? null : state.selectedTask
      }));

      // Update Project Counts or Inbox Count
      if (task) {
        if (task.proyecto_id) {
          useProyectosStore.getState().updateProjectCounts(task.proyecto_id, { 
              tasks: -1, 
              completed: task.estado === 'completada' ? -1 : 0 
          });
        } else if (task.estado === 'pendiente' || task.estado === 'en_progreso') {
          useProyectosStore.getState().updateInboxCount(-1);
        }
      }

      // Log activity
      if (task) {
        logTaskActivity(
          'eliminar',
          taskId,
          task.empresa_id,
          task.contacto_id ?? undefined,
          `Tarea eliminada: ${task.titulo}`,
          { antes: { id: task.id, titulo: task.titulo, estado: task.estado } }
        );
      }

      logger.debug('[TareasStore] Deleted task:', taskId);
      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error deleting task:', error);
      set({ error: error.message });
      return false;
    }
  },

  // ============================================================================
  // CRUD ACTIONS - Task Items
  // ============================================================================

  addTaskItem: async (taskId: number, texto: string) => {
    try {
      // Get current max order
      const { data: existing } = await supabase
        .from('wp_tareas_items')
        .select('orden')
        .eq('tarea_id', taskId)
        .order('orden', { ascending: false })
        .limit(1);

      const nextOrder = existing && existing.length > 0 ? existing[0].orden + 1 : 0;

      const { data, error } = await supabase
        .from('wp_tareas_items')
        .insert({
          tarea_id: taskId,
          texto,
          orden: nextOrder
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      set(state => ({
        tasks: state.tasks.map(t => {
          if (t.id === taskId) {
            return { ...t, items: [...(t.items || []), data as TaskItem] };
          }
          return t;
        }),
        selectedTask: state.selectedTask?.id === taskId 
          ? { ...state.selectedTask, items: [...(state.selectedTask.items || []), data as TaskItem] }
          : state.selectedTask
      }));

      return data as TaskItem;
    } catch (error: any) {
      logger.error('[TareasStore] Error adding item:', error);
      set({ error: error.message });
      return null;
    }
  },

  updateTaskItem: async (itemId: number, texto: string) => {
    try {
      const { data, error } = await supabase
        .from('wp_tareas_items')
        .update({ texto })
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      const item = data as TaskItem;
      set(state => ({
        tasks: state.tasks.map(t => ({
          ...t,
          items: (t.items || []).map(i => i.id === itemId ? item : i)
        })),
        selectedTask: state.selectedTask 
          ? { 
              ...state.selectedTask, 
              items: (state.selectedTask.items || []).map(i => i.id === itemId ? item : i) 
            }
          : null
      }));

      return item;
    } catch (error: any) {
      logger.error('[TareasStore] Error updating item:', error);
      set({ error: error.message });
      return null;
    }
  },

  toggleTaskItem: async (itemId: number, completado: boolean, completadoPor?: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_tareas_items')
        .update({ 
          completado,
          completado_por: completado ? completadoPor : null,
          completado_at: completado ? new Date().toISOString() : null
        })
        .eq('id', itemId)
        .select('*, tarea_id')
        .single();

      if (error) throw error;

      // Award XP for completing a task item (sub-task)
      if (completado) {
        const gamificationStore = useGamificationStore.getState();
        // Obtener el ID del usuario que completó el item (preferir completadoPor)
        const targetMemberId = completadoPor || useContactStore.getState().userContext?.id;
        
        if (targetMemberId) {
          gamificationStore.awardXP(
            'task_completed',
            'Item de tarea completado',
            itemId,
            'task_item'
          );
        }
      }

      // Update local state
      const item = data as TaskItem;
      set(state => ({
        tasks: state.tasks.map(t => ({
          ...t,
          items: (t.items || []).map(i => i.id === itemId ? item : i)
        })),
        selectedTask: state.selectedTask 
          ? { 
              ...state.selectedTask, 
              items: (state.selectedTask.items || []).map(i => i.id === itemId ? item : i) 
            }
          : null
      }));

      // Add task history for item completion
      if (completadoPor && data.tarea_id) {
        get().addTaskHistory(data.tarea_id, completado ? 'item_completed' : 'item_uncompleted', completadoPor, {
          metadata: { itemId, texto: item.texto }
        });
      }

      return item;
    } catch (error: any) {
      logger.error('[TareasStore] Error toggling item:', error);
      set({ error: error.message });
      return null;
    }
  },

  deleteTaskItem: async (itemId: number) => {
    try {
      // Get item to know its tarea_id
      const { data: item } = await supabase
        .from('wp_tareas_items')
        .select('tarea_id')
        .eq('id', itemId)
        .single();

      const { error } = await supabase
        .from('wp_tareas_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      set(state => ({
        tasks: state.tasks.map(t => ({
          ...t,
          items: (t.items || []).filter(i => i.id !== itemId)
        })),
        selectedTask: state.selectedTask 
          ? { 
              ...state.selectedTask, 
              items: (state.selectedTask.items || []).filter(i => i.id !== itemId) 
            }
          : null
      }));

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error deleting item:', error);
      set({ error: error.message });
      return false;
    }
  },

  reorderTaskItems: async (taskId: number, itemIds: number[]) => {
    try {
      // Update orden for each item
      const updates = itemIds.map((id, index) => 
        supabase
          .from('wp_tareas_items')
          .update({ orden: index })
          .eq('id', id)
      );

      await Promise.all(updates);

      // Refresh task
      await get().fetchTaskById(taskId);

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error reordering items:', error);
      set({ error: error.message });
      return false;
    }
  },

  // ============================================================================
  // V3: TEAM LABELS
  // ============================================================================

  fetchTeamLabels: async (empresaId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_etiquetas_equipo')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nombre');

      if (error) throw error;
      set({ teamLabels: data as TeamLabel[] });
    } catch (error: any) {
      logger.error('[TareasStore] Error fetching labels:', error);
    }
  },

  // ============================================================================
  // V3: MEDIA ATTACHMENTS
  // ============================================================================

  uploadTaskMedia: async (taskId: number, file: File, subidoPor: number, descripcion?: string) => {
    try {
      // Generate unique path
      const fileExt = file.name.split('.').pop();
      const fileName = `${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .getPublicUrl(fileName);

      // Create media record
      const { data, error } = await supabase
        .from('wp_tareas_media')
        .insert({
          tarea_id: taskId,
          nombre_archivo: file.name,
          tipo_mime: file.type,
          tamaño_bytes: file.size,
          storage_path: fileName,
          url_publica: urlData.publicUrl,
          descripcion: descripcion || null,
          subido_por: subidoPor
        })
        .select(`
          *,
          uploader:wp_team_humano!subido_por(id, nombre, apellido)
        `)
        .single();

      if (error) throw error;

      // Update selectedTask if viewing this task
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === taskId) {
        set({
          selectedTask: {
            ...selectedTask,
            media: [...(selectedTask.media || []), data as TaskMedia]
          } as TaskV3
        });
      }

      logger.debug('[TareasStore] Media uploaded:', data.id);
      return data as TaskMedia;
    } catch (error: any) {
      logger.error('[TareasStore] Error uploading media:', error);
      set({ error: error.message });
      return null;
    }
  },

  deleteTaskMedia: async (mediaId: number) => {
    try {
      // Get media to know storage path and task
      const { data: media, error: fetchError } = await supabase
        .from('wp_tareas_media')
        .select('storage_path, tarea_id')
        .eq('id', mediaId)
        .single();

      if (fetchError) throw fetchError;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .remove([media.storage_path]);

      if (storageError) throw storageError;

      // Delete record
      const { error } = await supabase
        .from('wp_tareas_media')
        .delete()
        .eq('id', mediaId);

      if (error) throw error;

      // Update selectedTask
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === media.tarea_id) {
        set({
          selectedTask: {
            ...selectedTask,
            media: (selectedTask.media || []).filter(m => m.id !== mediaId)
          } as TaskV3
        });
      }

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error deleting media:', error);
      set({ error: error.message });
      return false;
    }
  },

  // ============================================================================
  // V3: TASK HISTORY
  // ============================================================================

  addTaskHistory: async (
    taskId: number, 
    accion: string, 
    autorId: number,
    options?: { 
      campoModificado?: string; 
      valorAnterior?: string | null; 
      valorNuevo?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) => {
    try {
      const { data, error } = await supabase
        .from('wp_tareas_historial')
        .insert({
          tarea_id: taskId,
          accion,
          autor_id: autorId,
          campo_modificado: options?.campoModificado || null,
          valor_anterior: options?.valorAnterior || null,
          valor_nuevo: options?.valorNuevo || null,
          metadata: options?.metadata || null
        })
        .select(`
          *,
          autor:wp_team_humano!autor_id(id, nombre, apellido)
        `)
        .single();

      if (error) throw error;

      // Update selectedTask historial
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === taskId) {
        set({
          selectedTask: {
            ...selectedTask,
            historial: [data as TaskHistory, ...(selectedTask.historial || [])]
          } as TaskV3
        });
      }

      return data as TaskHistory;
    } catch (error: any) {
      logger.error('[TareasStore] Error adding history:', error);
      return null;
    }
  },

  setTaskCover: async (taskId: number, mediaId: number) => {
    try {
      const { error } = await supabase
        .from('wp_tareas')
        .update({ portada_url: mediaId })
        .eq('id', taskId);

      if (error) throw error;

      // Update selectedTask
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === taskId) {
        const coverMedia = selectedTask.media?.find(m => m.id === mediaId);
        set({
          selectedTask: {
            ...selectedTask,
            portada_url: coverMedia?.url_publica || null
          } as TaskV3
        });
      }

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error setting cover:', error);
      return false;
    }
  },

  // ============================================================================
  // V3: LABELS
  // ============================================================================

  addTaskLabel: async (taskId: number, etiquetaId: number) => {
    try {
      const { error } = await supabase
        .from('wp_tareas_etiquetas')
        .insert({ tarea_id: taskId, etiqueta_id: etiquetaId });

      if (error) throw error;

      // Update selectedTask
      const { selectedTask, teamLabels } = get();
      if (selectedTask && selectedTask.id === taskId) {
        const label = teamLabels.find(l => l.id === etiquetaId);
        if (label) {
          set({
            selectedTask: {
              ...selectedTask,
              etiquetas: [...(selectedTask.etiquetas || []), {
                tarea_id: taskId,
                etiqueta_id: etiquetaId,
                created_at: new Date().toISOString(),
                etiqueta: label
              }]
            } as TaskV3
          });
        }
      }

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error adding label:', error);
      return false;
    }
  },

  removeTaskLabel: async (taskId: number, etiquetaId: number) => {
    try {
      const { error } = await supabase
        .from('wp_tareas_etiquetas')
        .delete()
        .eq('tarea_id', taskId)
        .eq('etiqueta_id', etiquetaId);

      if (error) throw error;

      // Update selectedTask
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === taskId) {
        set({
          selectedTask: {
            ...selectedTask,
            etiquetas: (selectedTask.etiquetas || []).filter(e => e.etiqueta_id !== etiquetaId)
          } as TaskV3
        });
      }

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error removing label:', error);
      return false;
    }
  },

  // ============================================================================
  // V3: HISTORY
  // ============================================================================

  fetchTaskHistory: async (taskId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_tareas_historial')
        .select(`
          *,
          autor:wp_team_humano!autor_id(id, nombre, apellido)
        `)
        .eq('tarea_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Update selectedTask with history
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === taskId) {
        set({
          selectedTask: {
            ...selectedTask,
            historial: (data as TaskHistory[]) || []
          } as TaskV3
        });
      }

      return (data as TaskHistory[]) || [];
    } catch (error: any) {
      logger.error('[TareasStore] Error fetching history:', error);
      return [];
    }
  },

  // ============================================================================
  // V3: COMMENTS & REACTIONS
  // ============================================================================

  addComment: async (taskId: number, contenido: string, autorId: number, mentions?: number[]) => {
    try {
      const { data, error } = await supabase
        .from('wp_tareas_comentarios')
        .insert({
          tarea_id: taskId,
          contenido,
          autor_id: autorId,
          tipo: mentions?.length ? 'mencion' : 'comentario',
          metadata: mentions?.length ? { mentions } : {}
        })
        .select(`
          *,
          autor:wp_team_humano!autor_id(id, nombre, apellido)
        `)
        .single();

      if (error) throw error;

      // Update selectedTask with new comment
      const { selectedTask } = get();
      if (selectedTask && selectedTask.id === taskId) {
        set({
          selectedTask: {
            ...selectedTask,
            comentarios: [...(selectedTask.comentarios || []), data as TaskComment]
          } as TaskV3
        });
      }

      // Add task history for comment
      get().addTaskHistory(taskId, 'comment_added', autorId, {
        metadata: { commentId: data.id }
      });

      logger.debug('[TareasStore] Comment added:', data.id);
      return data as TaskComment;
    } catch (error: any) {
      logger.error('[TareasStore] Error adding comment:', error);
      set({ error: error.message });
      return null;
    }
  },

  updateComment: async (commentId: number, contenido: string) => {
    try {
      const { data, error } = await supabase
        .from('wp_tareas_comentarios')
        .update({ contenido, editado: true })
        .eq('id', commentId)
        .select(`
          *,
          autor:wp_team_humano!autor_id(id, nombre, apellido)
        `)
        .single();

      if (error) throw error;
      return data as TaskComment;
    } catch (error: any) {
      logger.error('[TareasStore] Error updating comment:', error);
      return null;
    }
  },

  deleteComment: async (commentId: number) => {
    try {
      const { error } = await supabase
        .from('wp_tareas_comentarios')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      // Update selectedTask removing the comment
      const { selectedTask } = get();
      if (selectedTask) {
        set({
          selectedTask: {
            ...selectedTask,
            comentarios: (selectedTask.comentarios || []).filter(c => c.id !== commentId)
          } as TaskV3
        });
      }

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error deleting comment:', error);
      return false;
    }
  },

  toggleReaction: async (commentId: number, usuarioId: number, emoji: ReactionEmoji) => {
    try {
      // Check if reaction exists
      const { data: existing } = await supabase
        .from('wp_tareas_reacciones')
        .select('*')
        .eq('comentario_id', commentId)
        .eq('usuario_id', usuarioId)
        .eq('emoji', emoji)
        .single();

      if (existing) {
        // Remove reaction
        const { error } = await supabase
          .from('wp_tareas_reacciones')
          .delete()
          .eq('comentario_id', commentId)
          .eq('usuario_id', usuarioId)
          .eq('emoji', emoji);

        if (error) throw error;
      } else {
        // Add reaction
        const { error } = await supabase
          .from('wp_tareas_reacciones')
          .insert({ comentario_id: commentId, usuario_id: usuarioId, emoji });

        if (error) throw error;
      }

      return true;
    } catch (error: any) {
      logger.error('[TareasStore] Error toggling reaction:', error);
      return false;
    }
  },

  // ============================================================================
  // UI ACTIONS
  // ============================================================================

  setFilters: (filters: Partial<TaskFiltersV3>) => {
    set(state => ({ 
      filters: { ...state.filters, ...filters },
      lastFetch: null // Invalidate cache when filters change
    }));
  },

  resetFilters: () => {
    set({ filters: initialFiltersV3, lastFetch: null });
  },

  setSelectedTask: (task: TaskV3 | null) => {
    set({ selectedTask: task });
  },

  clearError: () => {
    set({ error: null });
  },
  
  clearTasks: () => {
    set({ 
      tasks: [], 
      selectedTask: null, 
      teamLabels: [],
      lastFetch: null,
      error: null 
    });
    logger.debug('[TareasStore] Tasks cleared for enterprise change');
  }
}));

// ============================================================================
// SELECTORS (Memoized for performance)
// ============================================================================

// Filter tasks by project (null = Inbox)
export const selectTasksByProject = (proyectoId: number | null) => 
  (state: TareasState) => 
    state.tasks.filter(t => t.proyecto_id === proyectoId);

// Filter active tasks (pendiente/en_progreso)
export const selectActiveTasks = (state: TareasState) => 
  state.tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_progreso');

// Filter completed tasks
export const selectCompletedTasks = (state: TareasState) => 
  state.tasks.filter(t => t.estado === 'completada');

// Get task counts by status
export const selectTaskCounts = (state: TareasState) => ({
  total: state.tasks.length,
  pendiente: state.tasks.filter(t => t.estado === 'pendiente').length,
  en_progreso: state.tasks.filter(t => t.estado === 'en_progreso').length,
  completada: state.tasks.filter(t => t.estado === 'completada').length,
  cancelada: state.tasks.filter(t => t.estado === 'cancelada').length
});

// Filter tasks by assignee
export const selectTasksByAssignee = (asignadoA: number | null) => 
  (state: TareasState) => 
    asignadoA === null 
      ? state.tasks.filter(t => !t.asignado_a)
      : state.tasks.filter(t => t.asignado_a === asignadoA);

// Filter overdue tasks
export const selectOverdueTasks = (state: TareasState) => {
  const now = new Date();
  return state.tasks.filter(t => 
    t.fecha_vencimiento && 
    new Date(t.fecha_vencimiento) < now && 
    t.estado !== 'completada' && 
    t.estado !== 'cancelada'
  );
};

// Filter tasks due today
export const selectTasksDueToday = (state: TareasState) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return state.tasks.filter(t => {
    if (!t.fecha_vencimiento) return false;
    const dueDate = new Date(t.fecha_vencimiento);
    return dueDate >= today && dueDate < tomorrow;
  });
};

// Filter high priority tasks
export const selectHighPriorityTasks = (state: TareasState) => 
  state.tasks.filter(t => t.prioridad === 3 && t.estado !== 'completada' && t.estado !== 'cancelada');
