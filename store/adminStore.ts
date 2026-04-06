import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UIBlock } from '../types/chat';
import { logger } from '../lib/logger';

export type AdminView = 'dashboard' | 'contacts' | 'funnel' | 'portfolio' | 'calendar' | 'tasks' | 'activity' | 'settings' | 'team' | 'profile' | 'observability' | 'research' | 'emails' | 'artifacts' | 'email-marketing' | 'academy' | 'marketing' | 'redaccion' | 'transcripciones' | 'chat-inbox';

interface FocusedContactNavigation {
  id: number | null;
  label: string | null;
}

interface FocusedTemplateNavigation {
  id: number | null;
  label: string | null;
}

// Global team filter state
export interface GlobalTeamFilter {
  selectedMemberIds: number[]; // empty = "Todos"
  selectedGroups: TeamGroup[]; // Groups selected (e.g., ['asesores', 'supervisores'])
  isRestricted: boolean; // true if user role=3 (can only see own data)
}

// Team groups - dynamic slugs from team_groups table + built-in 'activos'/'inactivos'
export type TeamGroup = string;

// Circuit breaker states
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface DashboardState {
  blocks: UIBlock[];
  isLoading: boolean;
  error: string | null;
  lastFetchTime: number | null;
  fetchCount: number;
  circuitState: CircuitState;
  circuitOpenedAt: number | null;
  consecutiveFailures: number;
}

// Circuit breaker config
const CIRCUIT_FAILURE_THRESHOLD = 3; // Opens after 3 consecutive failures
const CIRCUIT_RESET_TIMEOUT_MS = 60000; // 1 minute before trying again
const MIN_FETCH_INTERVAL_MS = 30000; // Minimum 30s between fetches
const CACHE_DURATION_MS = 300000; // 5 minutes cache

// Preload cache timestamps per module
export interface ModuleCacheState {
  contacts: { lastFetchTime: number | null; isStale: boolean };
  appointments: { lastFetchTime: number | null; isStale: boolean };
  campaigns: { lastFetchTime: number | null; isStale: boolean };
  funnelStages: { lastFetchTime: number | null; isStale: boolean };
}

const initialModuleCache: ModuleCacheState = {
  contacts: { lastFetchTime: null, isStale: true },
  appointments: { lastFetchTime: null, isStale: true },
  campaigns: { lastFetchTime: null, isStale: true },
  funnelStages: { lastFetchTime: null, isStale: true }
};

// Panel width constraints in pixels
export const ADMIN_PANEL_MIN_WIDTH = 350;
export const ADMIN_PANEL_MAX_WIDTH = 2400; // Increased to allow ~70% on large screens
export const ADMIN_PANEL_DEFAULT_WIDTH = 450;

// Dashboard content width constraints (for readability)
export const DASHBOARD_CONTENT_MIN_WIDTH = 600;
export const DASHBOARD_CONTENT_MAX_WIDTH_NORMAL = 800;
export const DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED = 1800;

interface AdminState {
  // Panel visibility
  isAdminPanelOpen: boolean;
  
  // Maximized mode: panel takes full width (hides chat)
  isMaximized: boolean;
  
  // Mobile menu state
  isMobileMenuOpen: boolean;
  
  // Current active view
  activeView: AdminView;
  
  // Panel width in pixels (for draggable resize)
  adminPanelWidth: number;
  
  // Dashboard KPI state
  dashboard: DashboardState;
  
  // Module cache state for preloading
  moduleCache: ModuleCacheState;
  
  // Preload status
  isPreloading: boolean;
  preloadProgress: number; // 0-100
  
  // Global team filter (shared across views)
  globalTeamFilter: GlobalTeamFilter;
  focusedContactNavigation: FocusedContactNavigation;
  focusedTemplateNavigation: FocusedTemplateNavigation;

  // Actions
  toggleAdminPanel: () => void;
  openAdminPanel: () => void;
  closeAdminPanel: () => void;
  setActiveView: (view: AdminView) => void;
  focusContactNavigation: (contactId: number, label?: string | null) => void;
  clearFocusedContactNavigation: () => void;
  focusTemplateNavigation: (templateId: number, label?: string | null) => void;
  clearFocusedTemplateNavigation: () => void;
  setAdminPanelWidth: (width: number) => void;
  toggleMaximized: () => void;
  setMaximized: (maximized: boolean) => void;
  
  // Dashboard actions
  setDashboardLoading: (loading: boolean) => void;
  setDashboardBlocks: (blocks: UIBlock[]) => void;
  setDashboardError: (error: string | null) => void;
  recordDashboardFetch: () => void;
  recordDashboardFailure: () => void;
  recordDashboardSuccess: () => void;
  resetCircuit: () => void;
  canFetchDashboard: () => boolean;
  shouldUseCachedData: () => boolean;
  
  // Module cache actions
  setModuleCacheTime: (module: keyof ModuleCacheState) => void;
  isModuleCacheValid: (module: keyof ModuleCacheState) => boolean;
  markModuleStale: (module: keyof ModuleCacheState) => void;
  markAllModulesStale: () => void;
  setPreloading: (isPreloading: boolean, progress?: number) => void;
  
  // Global team filter actions
  setGlobalTeamFilter: (memberIds: number[]) => void;
  toggleTeamMember: (memberId: number) => void;
  toggleTeamGroup: (group: TeamGroup) => void;
  setTeamGroups: (groups: TeamGroup[]) => void;
  initializeTeamFilter: (userRoleId: number, userId: number) => void;
  resetGlobalTeamFilter: () => void;
  
  // Mobile menu actions
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
  toggleMobileMenu: () => void;
}

// Selectors for performance
export const selectIsAdminPanelOpen = (state: AdminState) => state.isAdminPanelOpen;
export const selectIsMaximized = (state: AdminState) => state.isMaximized;
export const selectActiveView = (state: AdminState) => state.activeView;
export const selectAdminPanelWidth = (state: AdminState) => state.adminPanelWidth;
export const selectDashboard = (state: AdminState) => state.dashboard;
export const selectDashboardBlocks = (state: AdminState) => state.dashboard.blocks;
export const selectDashboardLoading = (state: AdminState) => state.dashboard.isLoading;
export const selectDashboardError = (state: AdminState) => state.dashboard.error;
export const selectCircuitState = (state: AdminState) => state.dashboard.circuitState;

// Global team filter selectors
export const selectGlobalTeamFilter = (state: AdminState) => state.globalTeamFilter;
export const selectGlobalTeamMemberIds = (state: AdminState) => state.globalTeamFilter.selectedMemberIds;
export const selectGlobalTeamGroups = (state: AdminState) => state.globalTeamFilter.selectedGroups;
export const selectFocusedContactNavigation = (state: AdminState) => state.focusedContactNavigation;
export const selectFocusedContactId = (state: AdminState) => state.focusedContactNavigation.id;
export const selectFocusedContactLabel = (state: AdminState) => state.focusedContactNavigation.label;
export const selectFocusedTemplateNavigation = (state: AdminState) => state.focusedTemplateNavigation;
export const selectFocusedTemplateId = (state: AdminState) => state.focusedTemplateNavigation.id;
// Legacy selector for single ID (first selected or null)
export const selectGlobalTeamMemberId = (state: AdminState) => 
  state.globalTeamFilter.selectedMemberIds.length > 0 
    ? state.globalTeamFilter.selectedMemberIds[0] 
    : null;
export const selectIsTeamFilterRestricted = (state: AdminState) => state.globalTeamFilter.isRestricted;

// Mobile menu selectors
export const selectIsMobileMenuOpen = (state: AdminState) => state.isMobileMenuOpen;

// Legacy selector for compatibility
export const selectPanelWidth = (state: AdminState) => state.adminPanelWidth;

// Initial dashboard state
const initialDashboardState: DashboardState = {
  blocks: [],
  isLoading: false,
  error: null,
  lastFetchTime: null,
  fetchCount: 0,
  circuitState: 'closed',
  circuitOpenedAt: null,
  consecutiveFailures: 0,
};

const initialGlobalTeamFilter: GlobalTeamFilter = {
  selectedMemberIds: [],
  selectedGroups: [],
  isRestricted: false,
};

 const initialFocusedContactNavigation: FocusedContactNavigation = {
  id: null,
  label: null,
 };

 const initialFocusedTemplateNavigation: FocusedTemplateNavigation = {
  id: null,
  label: null,
 };

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      isAdminPanelOpen: false,
      isMaximized: false,
      isMobileMenuOpen: false,
      activeView: 'dashboard',
      adminPanelWidth: ADMIN_PANEL_DEFAULT_WIDTH,
      dashboard: initialDashboardState,
      moduleCache: initialModuleCache,
      isPreloading: false,
      preloadProgress: 0,
      globalTeamFilter: initialGlobalTeamFilter,
      focusedContactNavigation: initialFocusedContactNavigation,
      focusedTemplateNavigation: initialFocusedTemplateNavigation,

      toggleAdminPanel: () => set((state) => ({ 
        isAdminPanelOpen: !state.isAdminPanelOpen,
        isMaximized: state.isAdminPanelOpen ? false : state.isMaximized // Reset max if closing
      })),
      
      openAdminPanel: () => set({ isAdminPanelOpen: true }),
      
      closeAdminPanel: () => set({ isAdminPanelOpen: false, isMaximized: false }),
      
      setActiveView: (view) => set(() => ({ 
        activeView: view,
        isAdminPanelOpen: true, // Auto-open when selecting a view
        focusedContactNavigation: initialFocusedContactNavigation
      })),

      focusContactNavigation: (contactId, label = null) => set({
        activeView: 'contacts',
        isAdminPanelOpen: true,
        focusedContactNavigation: {
          id: contactId,
          label: label?.trim() || null
        }
      }),

      clearFocusedContactNavigation: () => set({
        focusedContactNavigation: initialFocusedContactNavigation
      }),

      focusTemplateNavigation: (templateId, label = null) => set({
        activeView: 'settings',
        isAdminPanelOpen: true,
        focusedTemplateNavigation: {
          id: templateId,
          label: label?.trim() || null
        }
      }),

      clearFocusedTemplateNavigation: () => set({
        focusedTemplateNavigation: initialFocusedTemplateNavigation
      }),
      
      setAdminPanelWidth: (width) => set((state) => ({ 
        adminPanelWidth: Math.min(Math.max(width, ADMIN_PANEL_MIN_WIDTH), ADMIN_PANEL_MAX_WIDTH),
        // Exit maximized mode when manually resizing
        isMaximized: false
      })),
      
      toggleMaximized: () => set((state) => ({
        isMaximized: !state.isMaximized,
        isAdminPanelOpen: true // Ensure panel is open when maximizing
      })),
      
      setMaximized: (maximized) => set({
        isMaximized: maximized,
        isAdminPanelOpen: maximized ? true : undefined // Keep open if maximizing
      } as Partial<AdminState>),

      // Dashboard actions
      setDashboardLoading: (loading) => set((state) => ({
        dashboard: { ...state.dashboard, isLoading: loading }
      })),

      setDashboardBlocks: (blocks) => set((state) => ({
        dashboard: { 
          ...state.dashboard, 
          blocks,
          lastFetchTime: Date.now(),
          error: null,
          isLoading: false
        }
      })),

      setDashboardError: (error) => set((state) => ({
        dashboard: { ...state.dashboard, error, isLoading: false }
      })),

      recordDashboardFetch: () => set((state) => ({
        dashboard: { 
          ...state.dashboard, 
          fetchCount: state.dashboard.fetchCount + 1,
          isLoading: true
        }
      })),

      recordDashboardFailure: () => set((state) => {
        const newFailures = state.dashboard.consecutiveFailures + 1;
        const shouldOpenCircuit = newFailures >= CIRCUIT_FAILURE_THRESHOLD;
        
        return {
          dashboard: {
            ...state.dashboard,
            consecutiveFailures: newFailures,
            isLoading: false,
            circuitState: shouldOpenCircuit ? 'open' : state.dashboard.circuitState,
            circuitOpenedAt: shouldOpenCircuit ? Date.now() : state.dashboard.circuitOpenedAt
          }
        };
      }),

      recordDashboardSuccess: () => set((state) => ({
        dashboard: {
          ...state.dashboard,
          consecutiveFailures: 0,
          circuitState: 'closed',
          circuitOpenedAt: null,
          isLoading: false
        }
      })),

      resetCircuit: () => set((state) => ({
        dashboard: {
          ...state.dashboard,
          circuitState: 'half-open',
          consecutiveFailures: 0
        }
      })),

      canFetchDashboard: () => {
        const { dashboard } = get();
        const now = Date.now();

        // If already loading, don't fetch again
        if (dashboard.isLoading) {
          logger.debug('[Dashboard] Already loading, skipping fetch');
          return false;
        }

        // Circuit breaker: if open, check if timeout has passed
        if (dashboard.circuitState === 'open') {
          const timeSinceOpen = now - (dashboard.circuitOpenedAt || 0);
          if (timeSinceOpen < CIRCUIT_RESET_TIMEOUT_MS) {
            logger.debug('[Dashboard] Circuit OPEN, waiting');
            return false;
          }
          // Time to try again - move to half-open
          get().resetCircuit();
          logger.debug('[Dashboard] Circuit HALF-OPEN, allowing test request');
          return true;
        }

        // Rate limiting: minimum interval between fetches
        if (dashboard.lastFetchTime) {
          const timeSinceLastFetch = now - dashboard.lastFetchTime;
          if (timeSinceLastFetch < MIN_FETCH_INTERVAL_MS) {
            logger.debug('[Dashboard] Rate limited');
            return false;
          }
        }

        return true;
      },

      shouldUseCachedData: () => {
        const { dashboard } = get();
        if (!dashboard.lastFetchTime || dashboard.blocks.length === 0) {
          return false;
        }
        const age = Date.now() - dashboard.lastFetchTime;
        return age < CACHE_DURATION_MS;
      },

      // Module cache actions
      setModuleCacheTime: (module) => set((state) => ({
        moduleCache: {
          ...state.moduleCache,
          [module]: { lastFetchTime: Date.now(), isStale: false }
        }
      })),

      isModuleCacheValid: (module) => {
        const { moduleCache } = get();
        const cache = moduleCache[module];
        if (!cache.lastFetchTime || cache.isStale) return false;
        const age = Date.now() - cache.lastFetchTime;
        return age < CACHE_DURATION_MS;
      },

      markModuleStale: (module) => set((state) => ({
        moduleCache: {
          ...state.moduleCache,
          [module]: { ...state.moduleCache[module], isStale: true }
        }
      })),

      markAllModulesStale: () => set({ moduleCache: initialModuleCache }),

      setPreloading: (isPreloading, progress = 0) => set({ 
        isPreloading, 
        preloadProgress: progress 
      }),

      // Global team filter actions
      setGlobalTeamFilter: (memberIds) => {
        const { globalTeamFilter } = get();
        // Role 3 users cannot change filter (always restricted to their own data)
        if (globalTeamFilter.isRestricted) {
          logger.debug('[AdminStore] Team filter restricted, cannot change');
          return;
        }
        set({ 
          globalTeamFilter: { ...globalTeamFilter, selectedMemberIds: memberIds },
          // Invalidate dashboard cache when filter changes
          dashboard: { ...get().dashboard, lastFetchTime: null }
        });
        // Mark all modules as stale since filter changed
        get().markAllModulesStale();
        logger.debug('[AdminStore] Global team filter set to:', memberIds);
      },

      toggleTeamMember: (memberId) => {
        const { globalTeamFilter } = get();
        if (globalTeamFilter.isRestricted) {
          logger.debug('[AdminStore] Team filter restricted, cannot toggle');
          return;
        }
        const currentIds = globalTeamFilter.selectedMemberIds;
        const newIds = currentIds.includes(memberId)
          ? currentIds.filter(id => id !== memberId)
          : [...currentIds, memberId];
        set({ 
          globalTeamFilter: { ...globalTeamFilter, selectedMemberIds: newIds },
          dashboard: { ...get().dashboard, lastFetchTime: null }
        });
        get().markAllModulesStale();
        logger.debug('[AdminStore] Team member toggled:', memberId, 'New selection:', newIds);
      },

      toggleTeamGroup: (group) => {
        const { globalTeamFilter } = get();
        if (globalTeamFilter.isRestricted) {
          logger.debug('[AdminStore] Team filter restricted, cannot toggle group');
          return;
        }
        const currentGroups = globalTeamFilter.selectedGroups;
        const newGroups = currentGroups.includes(group)
          ? currentGroups.filter(g => g !== group)
          : [...currentGroups, group];
        set({ 
          globalTeamFilter: { ...globalTeamFilter, selectedGroups: newGroups },
          dashboard: { ...get().dashboard, lastFetchTime: null }
        });
        get().markAllModulesStale();
        logger.debug('[AdminStore] Team group toggled:', group, 'New groups:', newGroups);
      },

      setTeamGroups: (groups) => {
        const { globalTeamFilter } = get();
        if (globalTeamFilter.isRestricted) {
          logger.debug('[AdminStore] Team filter restricted, cannot set groups');
          return;
        }
        set({ 
          globalTeamFilter: { ...globalTeamFilter, selectedGroups: groups },
          dashboard: { ...get().dashboard, lastFetchTime: null }
        });
        get().markAllModulesStale();
        logger.debug('[AdminStore] Team groups set to:', groups);
      },

      initializeTeamFilter: (userRoleId, userId) => {
        // Role 3 = restricted to own data only
        const isRestricted = userRoleId === 3;
        set({
          globalTeamFilter: {
            selectedMemberIds: isRestricted ? [userId] : [],
            selectedGroups: [],
            isRestricted
          }
        });
        logger.debug('[AdminStore] Team filter initialized:', { isRestricted });
      },

      resetGlobalTeamFilter: () => {
        const { globalTeamFilter } = get();
        if (!globalTeamFilter.isRestricted) {
          set({ globalTeamFilter: initialGlobalTeamFilter });
        }
      },

      // Mobile menu actions
      openMobileMenu: () => set({ isMobileMenuOpen: true }),
      closeMobileMenu: () => set({ isMobileMenuOpen: false }),
      toggleMobileMenu: () => set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
    }),
    {
      name: 'urpe-admin-store',
      partialize: (state) => ({ 
        activeView: state.activeView,
        adminPanelWidth: state.adminPanelWidth,
        // Don't persist isAdminPanelOpen - start closed
      }),
    }
  )
);
