import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { 
  Project, 
  ProjectStatus,
  CreateProjectPayload,
  UpdateProjectPayload,
  ProjectConfig
} from '../types/contact';
import {
  ProjectV3,
  ProjectCost,
  CreateCostPayload,
  UpdateCostPayload,
  CreateProjectV3Payload,
  UpdateProjectV3Payload
} from '../types/tasks-v3';

interface ProyectosState {
  // Data
  projects: ProjectV3[];
  selectedProject: ProjectV3 | null;
  inboxCount: number;
  selectedProjectId: number | null;
  
  // UI State
  isLoading: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  
  // Cache
  lastFetch: number | null;
  
  // Actions - Fetch
  fetchProjects: (empresaId: number, forceRefresh?: boolean) => Promise<void>;
  fetchInboxCount: (empresaId: number) => Promise<void>;
  fetchProjectById: (projectId: number) => Promise<ProjectV3 | null>;
  fetchProjectWithDetails: (projectId: number) => Promise<ProjectV3 | null>;
  
  // Actions - CRUD Projects
  createProject: (empresaId: number, creadoPor: number, payload: CreateProjectV3Payload) => Promise<ProjectV3 | null>;
  updateProject: (projectId: number, payload: UpdateProjectV3Payload) => Promise<ProjectV3 | null>;
  archiveProject: (projectId: number) => Promise<boolean>;
  deleteProject: (projectId: number) => Promise<boolean>;
  
  // Actions - V3: Costs
  fetchProjectCosts: (projectId: number) => Promise<ProjectCost[]>;
  addProjectCost: (payload: CreateCostPayload, registradoPor: number) => Promise<ProjectCost | null>;
  updateProjectCost: (costId: number, payload: UpdateCostPayload) => Promise<ProjectCost | null>;
  deleteProjectCost: (costId: number) => Promise<boolean>;
  
  // Actions - UI
  setSelectedProject: (projectId: number | null) => void;
  clearError: () => void;
  
  // Actions - Reset (for enterprise change)
  clearProjects: () => void;
  
  // Actions - Sync
  updateProjectCounts: (projectId: number, delta: { tasks?: number; completed?: number }) => void;
  updateInboxCount: (delta: number) => void;
  
  // Computed
  getProjectById: (projectId: number) => ProjectV3 | undefined;
  getActiveProjects: () => ProjectV3[];
}

const CACHE_MS = 300000; // 5 minutes

const DEFAULT_CONFIG: ProjectConfig = {
  vista_default: 'lista',
  columnas_kanban: ['pendiente', 'en_progreso', 'completada']
};

export const useProyectosStore = create<ProyectosState>((set, get) => ({
  // Initial State
  projects: [],
  selectedProject: null,
  inboxCount: 0,
  selectedProjectId: null,
  isLoading: false,
  isLoadingDetail: false,
  error: null,
  lastFetch: null,

  // ============================================================================
  // FETCH ACTIONS
  // ============================================================================

  fetchProjects: async (empresaId: number, forceRefresh = false) => {
    const { lastFetch } = get();
    
    if (!forceRefresh && lastFetch && Date.now() - lastFetch < CACHE_MS) {
      logger.debug('[ProyectosStore] Using cached projects');
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Fetch projects with contacto (owner)
      const { data, error } = await supabase
        .from('wp_proyectos')
        .select(`
          *,
          creador:wp_team_humano!creado_por(id, nombre, apellido),
          contacto:wp_contactos(id, nombre, apellido, telefono, email)
        `)
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch task counts for each project
      const projectsWithCounts = await Promise.all(
        (data || []).map(async (project) => {
          const { count: taskCount } = await supabase
            .from('wp_tareas')
            .select('id', { count: 'exact', head: true })
            .eq('proyecto_id', project.id);

          const { count: completedCount } = await supabase
            .from('wp_tareas')
            .select('id', { count: 'exact', head: true })
            .eq('proyecto_id', project.id)
            .eq('estado', 'completada');

          return {
            ...project,
            _task_count: taskCount || 0,
            _completed_count: completedCount || 0
          } as Project;
        })
      );

      // Fetch Inbox Count (tasks with no project)
      const { count: inboxCount } = await supabase
        .from('wp_tareas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .is('proyecto_id', null);

      set({ 
        projects: projectsWithCounts,
        inboxCount: inboxCount || 0,
        isLoading: false,
        lastFetch: Date.now()
      });

      logger.debug('[ProyectosStore]', `Fetched ${projectsWithCounts.length} projects`);
    } catch (error) {
      logger.error('[ProyectosStore] Error fetching projects:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Error al cargar proyectos',
        isLoading: false 
      });
    }
  },

  fetchInboxCount: async (empresaId: number) => {
    try {
      const { count } = await supabase
        .from('wp_tareas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .is('proyecto_id', null)
        .in('estado', ['pendiente', 'en_progreso']); // Only count active tasks
        
      set({ inboxCount: count || 0 });
    } catch (error) {
      logger.error('[ProyectosStore] Error fetching inbox count:', error);
    }
  },

  fetchProjectById: async (projectId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_proyectos')
        .select(`
          *,
          creador:wp_team_humano!creado_por(id, nombre, apellido)
        `)
        .eq('id', projectId)
        .single();

      if (error) throw error;
      return data as ProjectV3;
    } catch (error) {
      logger.error('[ProyectosStore] Error fetching project:', error);
      return null;
    }
  },

  fetchProjectWithDetails: async (projectId: number) => {
    set({ isLoadingDetail: true });
    try {
      // Fetch project with relations
      const { data: project, error } = await supabase
        .from('wp_proyectos')
        .select(`
          *,
          creador:wp_team_humano!creado_por(id, nombre, apellido),
          contacto:wp_contactos(id, nombre, apellido, telefono, email),
          servicio:wp_crm_servicios(id, nombre_servicio, valor_total, estado)
        `)
        .eq('id', projectId)
        .single();

      if (error) throw error;

      // Fetch task counts
      const [taskCount, completedCount, overdueCount] = await Promise.all([
        supabase
          .from('wp_tareas')
          .select('id', { count: 'exact', head: true })
          .eq('proyecto_id', projectId),
        supabase
          .from('wp_tareas')
          .select('id', { count: 'exact', head: true })
          .eq('proyecto_id', projectId)
          .eq('estado', 'completada'),
        supabase
          .from('wp_tareas')
          .select('id', { count: 'exact', head: true })
          .eq('proyecto_id', projectId)
          .not('estado', 'in', '("completada","cancelada")')
          .lt('fecha_vencimiento', new Date().toISOString())
      ]);

      // Fetch costs
      const { data: costs } = await supabase
        .from('wp_proyectos_costos')
        .select(`
          *,
          registrador:wp_team_humano!registrado_por(id, nombre, apellido),
          tarea:wp_tareas!tarea_id(id, titulo)
        `)
        .eq('proyecto_id', projectId)
        .order('fecha_costo', { ascending: false });

      const projectWithDetails: ProjectV3 = {
        ...project,
        _task_count: taskCount.count || 0,
        _completed_count: completedCount.count || 0,
        _tareas_total: taskCount.count || 0,
        _tareas_completadas: completedCount.count || 0,
        _tareas_vencidas: overdueCount.count || 0,
        _porcentaje_completado: taskCount.count 
          ? Math.round(((completedCount.count || 0) / taskCount.count) * 100) 
          : 0,
        costos: costs as ProjectCost[] || []
      };

      set({ selectedProject: projectWithDetails, isLoadingDetail: false });
      return projectWithDetails;
    } catch (error) {
      logger.error('[ProyectosStore] Error fetching project details:', error);
      set({ isLoadingDetail: false, error: error instanceof Error ? error.message : 'Error' });
      return null;
    }
  },

  // ============================================================================
  // CRUD ACTIONS
  // ============================================================================

  createProject: async (empresaId: number, creadoPor: number, payload: CreateProjectPayload) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_proyectos')
        .insert({
          empresa_id: empresaId,
          creado_por: creadoPor,
          nombre: payload.nombre,
          descripcion: payload.descripcion || null,
          color: payload.color || 'blue',
          icono: payload.icono || 'folder',
          config: DEFAULT_CONFIG
        })
        .select(`
          *,
          creador:wp_team_humano!creado_por(id, nombre, apellido)
        `)
        .single();

      if (error) throw error;

      const newProject: Project = {
        ...data,
        _task_count: 0,
        _completed_count: 0
      };

      set(state => ({
        projects: [...state.projects, newProject],
        isLoading: false
      }));

      logger.debug('[ProyectosStore] Project created:', newProject.id);
      return newProject;
    } catch (error) {
      logger.error('[ProyectosStore] Error creating project:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Error al crear proyecto',
        isLoading: false 
      });
      return null;
    }
  },

  updateProject: async (projectId: number, payload: UpdateProjectPayload) => {
    set({ isLoading: true, error: null });

    try {
      const updateData: Record<string, unknown> = {};
      
      if (payload.nombre !== undefined) updateData.nombre = payload.nombre;
      if (payload.descripcion !== undefined) updateData.descripcion = payload.descripcion;
      if (payload.estado !== undefined) updateData.estado = payload.estado;
      if (payload.color !== undefined) updateData.color = payload.color;
      if (payload.icono !== undefined) updateData.icono = payload.icono;
      if (payload.orden !== undefined) updateData.orden = payload.orden;
      
      if (payload.config) {
        const currentProject = get().projects.find(p => p.id === projectId);
        updateData.config = {
          ...(currentProject?.config || DEFAULT_CONFIG),
          ...payload.config
        };
      }

      const { data, error } = await supabase
        .from('wp_proyectos')
        .update(updateData)
        .eq('id', projectId)
        .select(`
          *,
          creador:wp_team_humano!creado_por(id, nombre, apellido)
        `)
        .single();

      if (error) throw error;

      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { ...data, _task_count: p._task_count, _completed_count: p._completed_count } 
            : p
        ),
        isLoading: false
      }));

      logger.debug('[ProyectosStore] Project updated:', projectId);
      return data as Project;
    } catch (error) {
      logger.error('[ProyectosStore] Error updating project:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Error al actualizar proyecto',
        isLoading: false 
      });
      return null;
    }
  },

  archiveProject: async (projectId: number) => {
    const result = await get().updateProject(projectId, { estado: 'archivado' });
    return result !== null;
  },

  deleteProject: async (projectId: number) => {
    set({ isLoading: true, error: null });

    try {
      // First, unassign all tasks from this project
      await supabase
        .from('wp_tareas')
        .update({ proyecto_id: null })
        .eq('proyecto_id', projectId);

      // Then delete the project
      const { error } = await supabase
        .from('wp_proyectos')
        .delete()
        .eq('id', projectId);

      if (error) throw error;

      set(state => ({
        projects: state.projects.filter(p => p.id !== projectId),
        selectedProjectId: state.selectedProjectId === projectId ? null : state.selectedProjectId,
        selectedProject: state.selectedProject?.id === projectId ? null : state.selectedProject,
        isLoading: false
      }));

      logger.debug('[ProyectosStore] Project deleted:', projectId);
      return true;
    } catch (error) {
      logger.error('[ProyectosStore] Error deleting project:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Error al eliminar proyecto',
        isLoading: false 
      });
      return false;
    }
  },

  // ============================================================================
  // V3: PROJECT COSTS
  // ============================================================================

  fetchProjectCosts: async (projectId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_proyectos_costos')
        .select(`
          *,
          registrador:wp_team_humano!registrado_por(id, nombre, apellido),
          tarea:wp_tareas!tarea_id(id, titulo)
        `)
        .eq('proyecto_id', projectId)
        .order('fecha_costo', { ascending: false });

      if (error) throw error;

      // Update selectedProject if viewing this project
      const { selectedProject } = get();
      if (selectedProject?.id === projectId) {
        set({
          selectedProject: {
            ...selectedProject,
            costos: data as ProjectCost[]
          }
        });
      }

      return data as ProjectCost[];
    } catch (error) {
      logger.error('[ProyectosStore] Error fetching costs:', error);
      return [];
    }
  },

  addProjectCost: async (payload: CreateCostPayload, registradoPor: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_proyectos_costos')
        .insert({
          proyecto_id: payload.proyecto_id,
          concepto: payload.concepto,
          categoria: payload.categoria || 'general',
          monto: payload.monto,
          moneda: payload.moneda || 'USD',
          tarea_id: payload.tarea_id || null,
          fecha_costo: payload.fecha_costo || new Date().toISOString().split('T')[0],
          comprobante_url: payload.comprobante_url || null,
          notas: payload.notas || null,
          registrado_por: registradoPor
        })
        .select(`
          *,
          registrador:wp_team_humano!registrado_por(id, nombre, apellido),
          tarea:wp_tareas!tarea_id(id, titulo)
        `)
        .single();

      if (error) throw error;

      // Update selectedProject costs
      const { selectedProject } = get();
      if (selectedProject?.id === payload.proyecto_id) {
        const newGasto = (selectedProject.gasto_actual || 0) + payload.monto;
        set({
          selectedProject: {
            ...selectedProject,
            gasto_actual: newGasto,
            costos: [data as ProjectCost, ...(selectedProject.costos || [])]
          }
        });
      }

      // Update project in list
      set(state => ({
        projects: state.projects.map(p => 
          p.id === payload.proyecto_id 
            ? { ...p, gasto_actual: (p.gasto_actual || 0) + payload.monto }
            : p
        )
      }));

      logger.debug('[ProyectosStore] Cost added:', data.id);
      return data as ProjectCost;
    } catch (error) {
      logger.error('[ProyectosStore] Error adding cost:', error);
      set({ error: error instanceof Error ? error.message : 'Error al agregar costo' });
      return null;
    }
  },

  updateProjectCost: async (costId: number, payload: UpdateCostPayload) => {
    try {
      // Get current cost for delta calculation
      const { data: currentCost } = await supabase
        .from('wp_proyectos_costos')
        .select('proyecto_id, monto')
        .eq('id', costId)
        .single();

      if (!currentCost) throw new Error('Cost not found');

      const { data, error } = await supabase
        .from('wp_proyectos_costos')
        .update(payload)
        .eq('id', costId)
        .select(`
          *,
          registrador:wp_team_humano!registrado_por(id, nombre, apellido),
          tarea:wp_tareas!tarea_id(id, titulo)
        `)
        .single();

      if (error) throw error;

      // Calculate delta if monto changed
      const montoDelta = payload.monto !== undefined 
        ? payload.monto - currentCost.monto 
        : 0;

      // Update selectedProject
      const { selectedProject } = get();
      if (selectedProject && selectedProject.id === currentCost.proyecto_id) {
        set({
          selectedProject: {
            ...selectedProject,
            gasto_actual: (selectedProject.gasto_actual || 0) + montoDelta,
            costos: (selectedProject.costos || []).map(c => 
              c.id === costId ? data as ProjectCost : c
            )
          } as ProjectV3
        });
      }

      // Update project in list
      if (montoDelta !== 0) {
        set(state => ({
          projects: state.projects.map(p => 
            p.id === currentCost.proyecto_id 
              ? { ...p, gasto_actual: (p.gasto_actual || 0) + montoDelta }
              : p
          )
        }));
      }

      return data as ProjectCost;
    } catch (error) {
      logger.error('[ProyectosStore] Error updating cost:', error);
      return null;
    }
  },

  deleteProjectCost: async (costId: number) => {
    try {
      // Get cost info first
      const { data: cost } = await supabase
        .from('wp_proyectos_costos')
        .select('proyecto_id, monto')
        .eq('id', costId)
        .single();

      if (!cost) throw new Error('Cost not found');

      const { error } = await supabase
        .from('wp_proyectos_costos')
        .delete()
        .eq('id', costId);

      if (error) throw error;

      // Update selectedProject
      const { selectedProject } = get();
      if (selectedProject && selectedProject.id === cost.proyecto_id) {
        set({
          selectedProject: {
            ...selectedProject,
            gasto_actual: Math.max(0, (selectedProject.gasto_actual || 0) - cost.monto),
            costos: (selectedProject.costos || []).filter(c => c.id !== costId)
          } as ProjectV3
        });
      }

      // Update project in list
      set(state => ({
        projects: state.projects.map(p => 
          p.id === cost.proyecto_id 
            ? { ...p, gasto_actual: Math.max(0, (p.gasto_actual || 0) - cost.monto) }
            : p
        )
      }));

      logger.debug('[ProyectosStore] Cost deleted:', costId);
      return true;
    } catch (error) {
      logger.error('[ProyectosStore] Error deleting cost:', error);
      return false;
    }
  },

  // ============================================================================
  // UI ACTIONS
  // ============================================================================

  setSelectedProject: (projectId: number | null) => {
    set({ selectedProjectId: projectId });
    logger.debug('[ProyectosStore] Selected project:', projectId ?? 'Inbox');
  },

  clearError: () => set({ error: null }),
  
  clearProjects: () => {
    set({ 
      projects: [], 
      selectedProject: null, 
      selectedProjectId: null,
      inboxCount: 0,
      lastFetch: null,
      error: null 
    });
    logger.debug('[ProyectosStore] Projects cleared for enterprise change');
  },

  // Actions - Sync
  updateProjectCounts: (projectId: number, delta: { tasks?: number; completed?: number }) => {
    set(state => ({
      projects: state.projects.map(p => {
        if (p.id !== projectId) return p;
        
        return {
          ...p,
          _task_count: Math.max(0, (p._task_count || 0) + (delta.tasks || 0)),
          _completed_count: Math.max(0, (p._completed_count || 0) + (delta.completed || 0))
        };
      })
    }));
  },

  updateInboxCount: (delta: number) => {
    set(state => ({
      inboxCount: Math.max(0, state.inboxCount + delta)
    }));
  },

  // ============================================================================
  // COMPUTED
  // ============================================================================

  getProjectById: (projectId: number) => {
    return get().projects.find(p => p.id === projectId);
  },

  getActiveProjects: () => {
    return get().projects.filter(p => p.estado === 'activo');
  }
}));
