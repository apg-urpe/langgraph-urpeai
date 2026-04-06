/**
 * Agents Store
 * Gestión de agentes IA (wp_agentes) y roles (wp_agente_roles)
 * 
 * Permisos:
 * - Lectura: Rol 1 y 2
 * - Edición agentes: Rol 1 y 2
 * - Edición roles: Solo Rol 1
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { 
  Agent, 
  AgentRole, 
  CreateAgentPayload, 
  UpdateAgentPayload,
  CreateAgentRolePayload,
  UpdateAgentRolePayload,
  AgentHistoryEntry
} from '../types/agent';
import { logger } from '../lib/logger';

// Permisos
const ALLOWED_VIEW_ROLES = [1, 2];
const ALLOWED_EDIT_ROLES = [1, 2];
const ALLOWED_ROLE_EDIT_ROLES = [1]; // Solo Dev puede editar roles

// Cache duration
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// =====================================================
// STORE STATE
// =====================================================

interface AgentsState {
  // Agents
  agents: Agent[];
  selectedAgentId: number | null;
  isLoadingAgents: boolean;
  agentsError: string | null;
  agentsLastFetch: number | null;
  showArchived: boolean; // Toggle to show/hide archived agents
  
  // Roles
  roles: AgentRole[];
  isLoadingRoles: boolean;
  rolesError: string | null;
  rolesLastFetch: number | null;
  
  // History
  history: AgentHistoryEntry[];
  isLoadingHistory: boolean;
  historyError: string | null;
  
  // Editor state
  editingField: string | null;
  unsavedChanges: Partial<Agent> | null;
  isSaving: boolean;
  saveError: string | null;
  
  // Actions - Agents
  fetchAgents: (enterpriseId: number, forceRefresh?: boolean) => Promise<void>;
  selectAgent: (agentId: number | null) => void;
  createAgent: (payload: CreateAgentPayload) => Promise<Agent | null>;
  updateAgent: (agentId: number, updates: UpdateAgentPayload, commitMessage?: string) => Promise<boolean>;
  archiveAgent: (agentId: number) => Promise<boolean>;
  unarchiveAgent: (agentId: number) => Promise<boolean>;
  setShowArchived: (show: boolean) => void;
  
  // Actions - Roles
  fetchRoles: (forceRefresh?: boolean) => Promise<void>;
  createRole: (payload: CreateAgentRolePayload) => Promise<AgentRole | null>;
  updateRole: (roleId: number, updates: UpdateAgentRolePayload) => Promise<boolean>;
  deleteRole: (roleId: number) => Promise<boolean>;
  
  // Actions - History
  fetchHistory: (agentId: number, campo?: string) => Promise<void>;
  restoreFromHistory: (historialId: number, userId?: number) => Promise<boolean>;
  
  // Actions - Editor
  setEditingField: (field: string | null) => void;
  setUnsavedChanges: (changes: Partial<Agent> | null) => void;
  discardChanges: () => void;
  
  // Selectors
  getSelectedAgent: () => Agent | null;
  canEditAgents: (userRoleId: number | null | undefined) => boolean;
  canEditRoles: (userRoleId: number | null | undefined) => boolean;
  canViewAgents: (userRoleId: number | null | undefined) => boolean;
  
  // Helpers
  clearError: () => void;
  resetStore: () => void;
}

// =====================================================
// INITIAL STATE
// =====================================================

const initialState = {
  agents: [],
  selectedAgentId: null,
  isLoadingAgents: false,
  agentsError: null,
  agentsLastFetch: null,
  showArchived: false,
  
  roles: [],
  isLoadingRoles: false,
  rolesError: null,
  rolesLastFetch: null,
  
  history: [],
  isLoadingHistory: false,
  historyError: null,
  
  editingField: null,
  unsavedChanges: null,
  isSaving: false,
  saveError: null,
};

// =====================================================
// STORE
// =====================================================

export const useAgentsStore = create<AgentsState>((set, get) => ({
  ...initialState,
  
  // ===================================================
  // AGENTS ACTIONS
  // ===================================================
  
  fetchAgents: async (enterpriseId: number, forceRefresh = false) => {
    const { agentsLastFetch, isLoadingAgents } = get();
    
    // Check cache
    if (!forceRefresh && agentsLastFetch && Date.now() - agentsLastFetch < CACHE_DURATION_MS) {
      logger.debug('[AgentsStore] Using cached agents');
      return;
    }
    
    if (isLoadingAgents) return;
    
    set({ isLoadingAgents: true, agentsError: null });
    
    try {
      const { data, error } = await supabase
        .from('wp_agentes')
        .select(`
          *,
          role:wp_agente_roles(id, nombre_rol, instrucciones_rol)
        `)
        .eq('empresa_id', enterpriseId)
        .order('nombre_agente');
      
      if (error) throw error;
      
      const agents = (data || []).map(agent => ({
        ...agent,
        role: Array.isArray(agent.role) ? agent.role[0] : agent.role
      }));
      
      set({ 
        agents, 
        isLoadingAgents: false,
        agentsLastFetch: Date.now()
      });
      
      logger.debug('[AgentsStore] Fetched agents:', agents.length);
    } catch (err: any) {
      logger.error('[AgentsStore] Error fetching agents:', err);
      set({ 
        isLoadingAgents: false, 
        agentsError: err.message || 'Error al cargar agentes' 
      });
    }
  },
  
  selectAgent: (agentId) => {
    set({ 
      selectedAgentId: agentId,
      editingField: null,
      unsavedChanges: null,
      history: [],
      historyError: null
    });
  },
  
  createAgent: async (payload) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { data, error } = await supabase
        .from('wp_agentes')
        .insert(payload)
        .select()
        .single();
      
      if (error) throw error;
      
      set(state => ({
        agents: [...state.agents, data],
        isSaving: false,
        selectedAgentId: data.id
      }));
      
      logger.info('[AgentsStore] Created agent:', data.id);
      return data;
    } catch (err: any) {
      logger.error('[AgentsStore] Error creating agent:', err);
      set({ isSaving: false, saveError: err.message });
      return null;
    }
  },
  
  updateAgent: async (agentId, updates, commitMessage) => {
    set({ isSaving: true, saveError: null });
    
    try {
      // Update agent
      const { error } = await supabase
        .from('wp_agentes')
        .update({
          ...updates,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', agentId);
      
      if (error) throw error;
      
      // If commit message provided, update the latest history entry
      if (commitMessage) {
        await supabase
          .from('wp_agentes_historial')
          .update({ mensaje_commit: commitMessage })
          .eq('agente_id', agentId)
          .order('created_at', { ascending: false })
          .limit(1);
      }
      
      // Update local state
      set(state => ({
        agents: state.agents.map(a => 
          a.id === agentId ? { ...a, ...updates } : a
        ),
        isSaving: false,
        unsavedChanges: null
      }));
      
      logger.info('[AgentsStore] Updated agent:', agentId);
      return true;
    } catch (err: any) {
      logger.error('[AgentsStore] Error updating agent:', err);
      set({ isSaving: false, saveError: err.message });
      return false;
    }
  },
  
  archiveAgent: async (agentId) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { error } = await supabase
        .from('wp_agentes')
        .update({ archivado: true, fecha_actualizacion: new Date().toISOString() })
        .eq('id', agentId);
      
      if (error) throw error;
      
      set(state => ({
        agents: state.agents.map(a => 
          a.id === agentId ? { ...a, archivado: true } : a
        ),
        selectedAgentId: state.selectedAgentId === agentId ? null : state.selectedAgentId,
        isSaving: false
      }));
      
      logger.info('[AgentsStore] Archived agent:', agentId);
      return true;
    } catch (err: any) {
      logger.error('[AgentsStore] Error archiving agent:', err);
      set({ isSaving: false, saveError: err.message });
      return false;
    }
  },
  
  unarchiveAgent: async (agentId) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { error } = await supabase
        .from('wp_agentes')
        .update({ archivado: false, fecha_actualizacion: new Date().toISOString() })
        .eq('id', agentId);
      
      if (error) throw error;
      
      set(state => ({
        agents: state.agents.map(a => 
          a.id === agentId ? { ...a, archivado: false } : a
        ),
        isSaving: false
      }));
      
      logger.info('[AgentsStore] Unarchived agent:', agentId);
      return true;
    } catch (err: any) {
      logger.error('[AgentsStore] Error unarchiving agent:', err);
      set({ isSaving: false, saveError: err.message });
      return false;
    }
  },
  
  setShowArchived: (show) => set({ showArchived: show }),
  
  // ===================================================
  // ROLES ACTIONS
  // ===================================================
  
  fetchRoles: async (forceRefresh = false) => {
    const { rolesLastFetch, isLoadingRoles } = get();
    
    if (!forceRefresh && rolesLastFetch && Date.now() - rolesLastFetch < CACHE_DURATION_MS) {
      return;
    }
    
    if (isLoadingRoles) return;
    
    set({ isLoadingRoles: true, rolesError: null });
    
    try {
      const { data, error } = await supabase
        .from('wp_agente_roles')
        .select('*')
        .order('nombre_rol');
      
      if (error) throw error;
      
      set({ 
        roles: data || [], 
        isLoadingRoles: false,
        rolesLastFetch: Date.now()
      });
    } catch (err: any) {
      logger.error('[AgentsStore] Error fetching roles:', err);
      set({ 
        isLoadingRoles: false, 
        rolesError: err.message 
      });
    }
  },
  
  createRole: async (payload) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { data, error } = await supabase
        .from('wp_agente_roles')
        .insert(payload)
        .select()
        .single();
      
      if (error) throw error;
      
      set(state => ({
        roles: [...state.roles, data],
        isSaving: false
      }));
      
      return data;
    } catch (err: any) {
      logger.error('[AgentsStore] Error creating role:', err);
      set({ isSaving: false, saveError: err.message });
      return null;
    }
  },
  
  updateRole: async (roleId, updates) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { error } = await supabase
        .from('wp_agente_roles')
        .update(updates)
        .eq('id', roleId);
      
      if (error) throw error;
      
      set(state => ({
        roles: state.roles.map(r => 
          r.id === roleId ? { ...r, ...updates } : r
        ),
        isSaving: false
      }));
      
      return true;
    } catch (err: any) {
      logger.error('[AgentsStore] Error updating role:', err);
      set({ isSaving: false, saveError: err.message });
      return false;
    }
  },
  
  deleteRole: async (roleId) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { error } = await supabase
        .from('wp_agente_roles')
        .delete()
        .eq('id', roleId);
      
      if (error) throw error;
      
      set(state => ({
        roles: state.roles.filter(r => r.id !== roleId),
        isSaving: false
      }));
      
      return true;
    } catch (err: any) {
      logger.error('[AgentsStore] Error deleting role:', err);
      set({ isSaving: false, saveError: err.message });
      return false;
    }
  },
  
  // ===================================================
  // HISTORY ACTIONS
  // ===================================================
  
  fetchHistory: async (agentId, campo) => {
    set({ isLoadingHistory: true, historyError: null });
    
    try {
      // Usar la función RPC que ya incluye el JOIN con usuario
      const { data, error } = await supabase.rpc('fn_get_agent_history', {
        p_agente_id: agentId,
        p_campo: campo || null,
        p_limit: 50
      });
      
      if (error) throw error;
      
      // Mapear resultado a la estructura esperada
      const history: AgentHistoryEntry[] = (data || []).map((entry: any) => ({
        id: entry.id,
        agente_id: entry.agente_id,
        campo: entry.campo,
        valor_anterior: entry.valor_anterior,
        valor_nuevo: entry.valor_nuevo,
        usuario_id: entry.usuario_id,
        mensaje_commit: entry.mensaje_commit,
        created_at: entry.created_at,
        usuario: entry.usuario_nombre ? {
          id: entry.usuario_id || 0,
          nombre: entry.usuario_nombre.split(' ')[0] || 'Sistema',
          apellido: entry.usuario_nombre.split(' ').slice(1).join(' ') || ''
        } : null
      }));
      
      set({ history, isLoadingHistory: false });
    } catch (err: any) {
      logger.error('[AgentsStore] Error fetching history:', err);
      set({ 
        isLoadingHistory: false, 
        historyError: err.message 
      });
    }
  },
  
  restoreFromHistory: async (historialId, userId) => {
    set({ isSaving: true, saveError: null });
    
    try {
      const { data, error } = await supabase.rpc('fn_restore_agent_field', {
        p_historial_id: historialId,
        p_usuario_id: userId || null
      });
      
      if (error) throw error;
      
      // Refresh agents after restore
      const { selectedAgentId, agents } = get();
      if (selectedAgentId) {
        const agent = agents.find(a => a.id === selectedAgentId);
        if (agent?.empresa_id) {
          await get().fetchAgents(agent.empresa_id, true);
        }
      }
      
      set({ isSaving: false });
      return true;
    } catch (err: any) {
      logger.error('[AgentsStore] Error restoring from history:', err);
      set({ isSaving: false, saveError: err.message });
      return false;
    }
  },
  
  // ===================================================
  // EDITOR ACTIONS
  // ===================================================
  
  setEditingField: (field) => set({ editingField: field }),
  
  setUnsavedChanges: (changes) => set({ unsavedChanges: changes }),
  
  discardChanges: () => set({ unsavedChanges: null, editingField: null }),
  
  // ===================================================
  // SELECTORS
  // ===================================================
  
  getSelectedAgent: () => {
    const { agents, selectedAgentId } = get();
    return agents.find(a => a.id === selectedAgentId) || null;
  },
  
  canViewAgents: (userRoleId) => {
    if (userRoleId === null || userRoleId === undefined) return false;
    return ALLOWED_VIEW_ROLES.includes(userRoleId);
  },
  
  canEditAgents: (userRoleId) => {
    if (userRoleId === null || userRoleId === undefined) return false;
    return ALLOWED_EDIT_ROLES.includes(userRoleId);
  },
  
  canEditRoles: (userRoleId) => {
    if (userRoleId === null || userRoleId === undefined) return false;
    return ALLOWED_ROLE_EDIT_ROLES.includes(userRoleId);
  },
  
  // ===================================================
  // HELPERS
  // ===================================================
  
  clearError: () => set({ 
    agentsError: null, 
    rolesError: null, 
    historyError: null,
    saveError: null 
  }),
  
  resetStore: () => set(initialState),
}));

// =====================================================
// SELECTORS (for performance)
// =====================================================

export const selectAgents = (state: AgentsState) => state.agents;
export const selectActiveAgents = (state: AgentsState) => (state.agents || []).filter(a => !a.archivado);
export const selectArchivedAgents = (state: AgentsState) => (state.agents || []).filter(a => a.archivado);
export const selectShowArchived = (state: AgentsState) => state.showArchived;
export const selectSelectedAgentId = (state: AgentsState) => state.selectedAgentId;
export const selectIsLoadingAgents = (state: AgentsState) => state.isLoadingAgents;
export const selectAgentsError = (state: AgentsState) => state.agentsError;
export const selectRoles = (state: AgentsState) => state.roles;
export const selectIsLoadingRoles = (state: AgentsState) => state.isLoadingRoles;
export const selectHistory = (state: AgentsState) => state.history;
export const selectIsLoadingHistory = (state: AgentsState) => state.isLoadingHistory;
export const selectEditingField = (state: AgentsState) => state.editingField;
export const selectUnsavedChanges = (state: AgentsState) => state.unsavedChanges;
export const selectIsSaving = (state: AgentsState) => state.isSaving;
export const selectSaveError = (state: AgentsState) => state.saveError;
