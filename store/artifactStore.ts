import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import {
  Artifact,
  ArtifactVersion,
  ArtifactType,
  ArtifactStatus,
  ArtifactFilters,
  ArtifactPanelState,
  CreateArtifactPayload,
  UpdateArtifactPayload,
  CreateVersionPayload,
  DEFAULT_ARTIFACT_FILTERS,
  DEFAULT_ARTIFACT_PANEL_STATE,
  detectArtifactType,
  generateArtifactTitle
} from '../types/artifact';

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface ArtifactState {
  // Data
  artifacts: Artifact[];
  activeArtifact: Artifact | null;
  versions: ArtifactVersion[];
  starredIds: Set<string>;
  
  // UI State
  panel: ArtifactPanelState;
  filters: ArtifactFilters;
  
  // Loading States
  isLoading: boolean;
  isLoadingVersions: boolean;
  isSaving: boolean;
  error: string | null;
  
  // Cache
  lastFetch: number | null;
  
  // ========== PANEL ACTIONS ==========
  openArtifact: (content: string, options?: { type?: ArtifactType; title?: string; sessionId?: string; messageId?: string }) => void;
  openExistingArtifact: (artifactId: string) => Promise<void>;
  closeArtifact: () => void;
  setMode: (mode: 'preview' | 'code' | 'edit') => void;
  setPreviewSize: (size: 'desktop' | 'tablet' | 'mobile') => void;
  setStatus: (status: ArtifactStatus) => void;
  updateEditContent: (content: string) => void;
  
  // ========== CRUD ACTIONS ==========
  fetchArtifacts: (userId: string, forceRefresh?: boolean) => Promise<void>;
  fetchArtifactById: (artifactId: string) => Promise<Artifact | null>;
  createArtifact: (userId: string, payload: CreateArtifactPayload) => Promise<Artifact | null>;
  updateArtifact: (artifactId: string, payload: UpdateArtifactPayload) => Promise<Artifact | null>;
  deleteArtifact: (artifactId: string) => Promise<boolean>;
  
  // ========== VERSION ACTIONS ==========
  fetchVersions: (artifactId: string) => Promise<void>;
  createVersion: (artifactId: string, payload: CreateVersionPayload) => Promise<ArtifactVersion | null>;
  restoreVersion: (artifactId: string, versionId: string) => Promise<boolean>;
  setCurrentVersionIndex: (index: number) => void;
  
  // ========== STAR ACTIONS ==========
  toggleStar: (userId: string, artifactId: string) => Promise<boolean>;
  fetchStarredIds: (userId: string) => Promise<void>;
  
  // ========== SHARE ACTIONS ==========
  makePublic: (artifactId: string) => Promise<string | null>;
  makePrivate: (artifactId: string) => Promise<boolean>;
  forkArtifact: (artifactId: string) => Promise<string | null>;
  
  // ========== FILTER ACTIONS ==========
  setFilters: (filters: Partial<ArtifactFilters>) => void;
  resetFilters: () => void;
  
  // ========== SAVE ACTIONS ==========
  saveCurrentArtifact: (userId: string) => Promise<Artifact | null>;
  autoSaveVersion: (artifactId: string) => Promise<void>;
  
  // ========== UTILITY ==========
  clearError: () => void;
  resetStore: () => void;
}

// Cache duration (5 minutes)
const CACHE_MS = 300000;

// ============================================================================
// SELECTORS
// ============================================================================

export const selectArtifacts = (state: ArtifactState) => state.artifacts;
export const selectActiveArtifact = (state: ArtifactState) => state.activeArtifact;
export const selectVersions = (state: ArtifactState) => state.versions;
export const selectPanel = (state: ArtifactState) => state.panel;
export const selectFilters = (state: ArtifactState) => state.filters;
export const selectIsLoading = (state: ArtifactState) => state.isLoading;
export const selectIsSaving = (state: ArtifactState) => state.isSaving;
export const selectError = (state: ArtifactState) => state.error;

// Derived selectors
export const selectFilteredArtifacts = (state: ArtifactState) => {
  let filtered = [...state.artifacts];
  const { type, search, tags, is_pinned, is_starred, session_id, sort_by, sort_order } = state.filters;
  
  if (type) {
    filtered = filtered.filter(a => a.type === type);
  }
  
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(a => 
      a.title.toLowerCase().includes(searchLower) ||
      a.description?.toLowerCase().includes(searchLower) ||
      a.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  }
  
  if (tags && tags.length > 0) {
    filtered = filtered.filter(a => tags.some(t => a.tags.includes(t)));
  }
  
  if (is_pinned) {
    filtered = filtered.filter(a => a.is_pinned);
  }
  
  if (is_starred) {
    filtered = filtered.filter(a => state.starredIds.has(a.id));
  }
  
  if (session_id) {
    filtered = filtered.filter(a => a.session_id === session_id);
  }
  
  // Sort
  filtered.sort((a, b) => {
    let comparison = 0;
    switch (sort_by) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'created_at':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'updated_at':
      default:
        comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    }
    return sort_order === 'asc' ? comparison : -comparison;
  });
  
  // Pinned always first
  return filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
};

export const selectSessionArtifacts = (sessionId: string) => (state: ArtifactState) =>
  state.artifacts.filter(a => a.session_id === sessionId);

export const selectCurrentVersion = (state: ArtifactState) => {
  if (state.panel.currentVersionIndex === -1 || state.versions.length === 0) {
    return null;
  }
  return state.versions[state.panel.currentVersionIndex] || null;
};

// ============================================================================
// STORE
// ============================================================================

export const useArtifactStore = create<ArtifactState>()(
  persist(
    (set, get) => ({
      // Initial State
      artifacts: [],
      activeArtifact: null,
      versions: [],
      starredIds: new Set(),
      panel: DEFAULT_ARTIFACT_PANEL_STATE,
      filters: DEFAULT_ARTIFACT_FILTERS,
      isLoading: false,
      isLoadingVersions: false,
      isSaving: false,
      error: null,
      lastFetch: null,

      // ========================================================================
      // PANEL ACTIONS
      // ========================================================================

      openArtifact: (content, options = {}) => {
        const type = options.type || detectArtifactType(content);
        const title = options.title || generateArtifactTitle(content, type);
        
        // Create a temporary artifact (not yet persisted)
        const tempArtifact: Artifact = {
          id: `temp-${Date.now()}`,
          user_id: '',
          session_id: options.sessionId || null,
          message_id: options.messageId || null,
          title,
          content,
          type,
          tags: [],
          is_pinned: false,
          is_public: false,
          view_count: 0,
          fork_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        set({
          activeArtifact: tempArtifact,
          versions: [],
          panel: {
            ...DEFAULT_ARTIFACT_PANEL_STATE,
            isOpen: true,
            activeArtifactId: tempArtifact.id,
            editContent: content,
            status: 'ready'
          }
        });
        
        logger.info('[ArtifactStore] Opened new artifact', { type, title });
      },

      openExistingArtifact: async (artifactId) => {
        set({ isLoading: true, error: null });
        
        try {
          const artifact = await get().fetchArtifactById(artifactId);
          if (!artifact) {
            throw new Error('Artifact not found');
          }
          
          set({
            activeArtifact: artifact,
            panel: {
              ...DEFAULT_ARTIFACT_PANEL_STATE,
              isOpen: true,
              activeArtifactId: artifact.id,
              editContent: artifact.content,
              status: 'ready'
            }
          });
          
          // Fetch versions in background
          get().fetchVersions(artifactId);
          
          logger.info('[ArtifactStore] Opened existing artifact', { id: artifactId });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error loading artifact';
          set({ error: message });
          logger.error('[ArtifactStore] Error opening artifact', err);
        } finally {
          set({ isLoading: false });
        }
      },

      closeArtifact: () => {
        set({
          panel: { ...get().panel, isOpen: false },
          activeArtifact: null,
          versions: []
        });
        logger.debug('[ArtifactStore] Closed artifact panel');
      },

      setMode: (mode) => set({ panel: { ...get().panel, mode } }),
      
      setPreviewSize: (size) => set({ panel: { ...get().panel, previewSize: size } }),
      
      setStatus: (status) => set({ panel: { ...get().panel, status } }),
      
      updateEditContent: (content) => {
        const { activeArtifact, panel } = get();
        const hasChanges = activeArtifact ? content !== activeArtifact.content : false;
        set({
          panel: {
            ...panel,
            editContent: content,
            hasUnsavedChanges: hasChanges
          }
        });
      },

      // ========================================================================
      // CRUD ACTIONS
      // ========================================================================

      fetchArtifacts: async (userId, forceRefresh = false) => {
        const { lastFetch } = get();
        
        if (!forceRefresh && lastFetch && Date.now() - lastFetch < CACHE_MS) {
          logger.debug('[ArtifactStore] Using cached artifacts');
          return;
        }
        
        set({ isLoading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('artifacts')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });
          
          if (error) throw error;
          
          set({
            artifacts: data || [],
            lastFetch: Date.now()
          });
          
          logger.info('[ArtifactStore] Fetched artifacts', { count: data?.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error fetching artifacts';
          set({ error: message });
          logger.error('[ArtifactStore] Error fetching artifacts', err);
        } finally {
          set({ isLoading: false });
        }
      },

      fetchArtifactById: async (artifactId) => {
        try {
          const { data, error } = await supabase
            .from('artifacts')
            .select('*')
            .eq('id', artifactId)
            .single();
          
          if (error) throw error;
          return data as Artifact;
        } catch (err) {
          logger.error('[ArtifactStore] Error fetching artifact by ID', err);
          return null;
        }
      },

      createArtifact: async (userId, payload) => {
        set({ isSaving: true, error: null });
        
        try {
          const type = payload.type || detectArtifactType(payload.content);
          const title = payload.title || generateArtifactTitle(payload.content, type);
          
          const { data, error } = await supabase
            .from('artifacts')
            .insert({
              user_id: userId,
              session_id: payload.session_id || null,
              message_id: payload.message_id || null,
              title,
              content: payload.content,
              type,
              language: payload.language || null,
              description: payload.description || null,
              tags: payload.tags || []
            })
            .select()
            .single();
          
          if (error) throw error;
          
          const artifact = data as Artifact;
          
          // Add to local state
          set(state => ({
            artifacts: [artifact, ...state.artifacts],
            activeArtifact: artifact,
            panel: {
              ...state.panel,
              activeArtifactId: artifact.id,
              hasUnsavedChanges: false
            }
          }));
          
          logger.info('[ArtifactStore] Created artifact', { id: artifact.id, type });
          return artifact;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error creating artifact';
          set({ error: message });
          logger.error('[ArtifactStore] Error creating artifact', err);
          return null;
        } finally {
          set({ isSaving: false });
        }
      },

      updateArtifact: async (artifactId, payload) => {
        set({ isSaving: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('artifacts')
            .update(payload)
            .eq('id', artifactId)
            .select()
            .single();
          
          if (error) throw error;
          
          const artifact = data as Artifact;
          
          // Update local state
          set(state => ({
            artifacts: state.artifacts.map(a => a.id === artifactId ? artifact : a),
            activeArtifact: state.activeArtifact?.id === artifactId ? artifact : state.activeArtifact,
            panel: {
              ...state.panel,
              hasUnsavedChanges: false
            }
          }));
          
          logger.info('[ArtifactStore] Updated artifact', { id: artifactId });
          return artifact;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error updating artifact';
          set({ error: message });
          logger.error('[ArtifactStore] Error updating artifact', err);
          return null;
        } finally {
          set({ isSaving: false });
        }
      },

      deleteArtifact: async (artifactId) => {
        try {
          const { error } = await supabase
            .from('artifacts')
            .delete()
            .eq('id', artifactId);
          
          if (error) throw error;
          
          // Remove from local state
          set(state => ({
            artifacts: state.artifacts.filter(a => a.id !== artifactId),
            activeArtifact: state.activeArtifact?.id === artifactId ? null : state.activeArtifact,
            panel: state.activeArtifact?.id === artifactId 
              ? { ...state.panel, isOpen: false }
              : state.panel
          }));
          
          logger.info('[ArtifactStore] Deleted artifact', { id: artifactId });
          return true;
        } catch (err) {
          logger.error('[ArtifactStore] Error deleting artifact', err);
          return false;
        }
      },

      // ========================================================================
      // VERSION ACTIONS
      // ========================================================================

      fetchVersions: async (artifactId) => {
        set({ isLoadingVersions: true });
        
        try {
          const { data, error } = await supabase
            .from('artifact_versions')
            .select('*')
            .eq('artifact_id', artifactId)
            .order('version_number', { ascending: false });
          
          if (error) throw error;
          
          set({ versions: data || [] });
          logger.debug('[ArtifactStore] Fetched versions', { count: data?.length });
        } catch (err) {
          logger.error('[ArtifactStore] Error fetching versions', err);
        } finally {
          set({ isLoadingVersions: false });
        }
      },

      createVersion: async (artifactId, payload) => {
        try {
          const { data, error } = await supabase
            .from('artifact_versions')
            .insert({
              artifact_id: artifactId,
              content: payload.content,
              title: payload.title || null,
              description: payload.description || null,
              change_description: payload.change_description || null,
              is_auto_save: payload.is_auto_save || false
            })
            .select()
            .single();
          
          if (error) throw error;
          
          const version = data as ArtifactVersion;
          
          // Add to local state
          set(state => ({
            versions: [version, ...state.versions]
          }));
          
          logger.info('[ArtifactStore] Created version', { artifactId, versionNumber: version.version_number });
          return version;
        } catch (err) {
          logger.error('[ArtifactStore] Error creating version', err);
          return null;
        }
      },

      restoreVersion: async (artifactId, versionId) => {
        try {
          // Get version content
          const { data: version, error: versionError } = await supabase
            .from('artifact_versions')
            .select('content, title')
            .eq('id', versionId)
            .single();
          
          if (versionError) throw versionError;
          
          // Update artifact with version content
          const { error: updateError } = await supabase
            .from('artifacts')
            .update({ content: version.content })
            .eq('id', artifactId);
          
          if (updateError) throw updateError;
          
          // Create a new version marking the restore
          await get().createVersion(artifactId, {
            content: version.content,
            change_description: `Restored from version`,
            is_auto_save: false
          });
          
          // Update local state
          set(state => ({
            activeArtifact: state.activeArtifact?.id === artifactId 
              ? { ...state.activeArtifact, content: version.content }
              : state.activeArtifact,
            panel: {
              ...state.panel,
              editContent: version.content,
              currentVersionIndex: -1
            }
          }));
          
          logger.info('[ArtifactStore] Restored version', { artifactId, versionId });
          return true;
        } catch (err) {
          logger.error('[ArtifactStore] Error restoring version', err);
          return false;
        }
      },

      setCurrentVersionIndex: (index) => {
        set({ panel: { ...get().panel, currentVersionIndex: index } });
      },

      // ========================================================================
      // STAR ACTIONS
      // ========================================================================

      toggleStar: async (userId, artifactId) => {
        const isStarred = get().starredIds.has(artifactId);
        
        try {
          if (isStarred) {
            const { error } = await supabase
              .from('artifact_stars')
              .delete()
              .eq('user_id', userId)
              .eq('artifact_id', artifactId);
            
            if (error) throw error;
            
            set(state => {
              const newSet = new Set(state.starredIds);
              newSet.delete(artifactId);
              return { starredIds: newSet };
            });
          } else {
            const { error } = await supabase
              .from('artifact_stars')
              .insert({ user_id: userId, artifact_id: artifactId });
            
            if (error) throw error;
            
            set(state => {
              const newSet = new Set(state.starredIds);
              newSet.add(artifactId);
              return { starredIds: newSet };
            });
          }
          
          return true;
        } catch (err) {
          logger.error('[ArtifactStore] Error toggling star', err);
          return false;
        }
      },

      fetchStarredIds: async (userId) => {
        try {
          const { data, error } = await supabase
            .from('artifact_stars')
            .select('artifact_id')
            .eq('user_id', userId);
          
          if (error) throw error;
          
          const ids = new Set(data?.map(s => s.artifact_id) || []);
          set({ starredIds: ids });
        } catch (err) {
          logger.error('[ArtifactStore] Error fetching starred IDs', err);
        }
      },

      // ========================================================================
      // SHARE ACTIONS
      // ========================================================================

      makePublic: async (artifactId) => {
        try {
          const { data, error } = await supabase
            .rpc('make_artifact_public', { artifact_uuid: artifactId });
          
          if (error) throw error;
          
          const slug = data as string;
          
          // Update local state
          set(state => ({
            artifacts: state.artifacts.map(a => 
              a.id === artifactId ? { ...a, is_public: true, public_slug: slug } : a
            ),
            activeArtifact: state.activeArtifact?.id === artifactId 
              ? { ...state.activeArtifact, is_public: true, public_slug: slug }
              : state.activeArtifact
          }));
          
          logger.info('[ArtifactStore] Made artifact public', { artifactId, slug });
          return slug;
        } catch (err) {
          logger.error('[ArtifactStore] Error making artifact public', err);
          return null;
        }
      },

      makePrivate: async (artifactId) => {
        try {
          const { error } = await supabase
            .from('artifacts')
            .update({ is_public: false, public_slug: null })
            .eq('id', artifactId);
          
          if (error) throw error;
          
          // Update local state
          set(state => ({
            artifacts: state.artifacts.map(a => 
              a.id === artifactId ? { ...a, is_public: false, public_slug: null } : a
            ),
            activeArtifact: state.activeArtifact?.id === artifactId 
              ? { ...state.activeArtifact, is_public: false, public_slug: null }
              : state.activeArtifact
          }));
          
          logger.info('[ArtifactStore] Made artifact private', { artifactId });
          return true;
        } catch (err) {
          logger.error('[ArtifactStore] Error making artifact private', err);
          return false;
        }
      },

      forkArtifact: async (artifactId) => {
        try {
          const { data, error } = await supabase
            .rpc('fork_artifact', { source_artifact_id: artifactId });
          
          if (error) throw error;
          
          const newId = data as string;
          
          // Refresh artifacts to get the new one
          const { activeArtifact } = get();
          if (activeArtifact?.user_id) {
            await get().fetchArtifacts(activeArtifact.user_id, true);
          }
          
          logger.info('[ArtifactStore] Forked artifact', { source: artifactId, new: newId });
          return newId;
        } catch (err) {
          logger.error('[ArtifactStore] Error forking artifact', err);
          return null;
        }
      },

      // ========================================================================
      // FILTER ACTIONS
      // ========================================================================

      setFilters: (filters) => set(state => ({
        filters: { ...state.filters, ...filters }
      })),
      
      resetFilters: () => set({ filters: DEFAULT_ARTIFACT_FILTERS }),

      // ========================================================================
      // SAVE ACTIONS
      // ========================================================================

      saveCurrentArtifact: async (userId) => {
        const { activeArtifact, panel } = get();
        
        if (!panel.hasUnsavedChanges) {
          return activeArtifact;
        }
        
        // If it's a temp artifact, create it
        if (activeArtifact?.id.startsWith('temp-')) {
          return await get().createArtifact(userId, {
            content: panel.editContent,
            type: activeArtifact.type,
            title: activeArtifact.title,
            session_id: activeArtifact.session_id || undefined,
            message_id: activeArtifact.message_id || undefined
          });
        }
        
        // Otherwise, update existing
        if (activeArtifact) {
          // Create a version first
          await get().createVersion(activeArtifact.id, {
            content: panel.editContent,
            is_auto_save: false
          });
          
          return await get().updateArtifact(activeArtifact.id, {
            content: panel.editContent
          });
        }
        
        return null;
      },

      autoSaveVersion: async (artifactId) => {
        const { panel } = get();
        
        if (!panel.hasUnsavedChanges || artifactId.startsWith('temp-')) {
          return;
        }
        
        await get().createVersion(artifactId, {
          content: panel.editContent,
          is_auto_save: true
        });
        
        logger.debug('[ArtifactStore] Auto-saved version', { artifactId });
      },

      // ========================================================================
      // UTILITY
      // ========================================================================

      clearError: () => set({ error: null }),
      
      resetStore: () => set({
        artifacts: [],
        activeArtifact: null,
        versions: [],
        starredIds: new Set(),
        panel: DEFAULT_ARTIFACT_PANEL_STATE,
        filters: DEFAULT_ARTIFACT_FILTERS,
        isLoading: false,
        isLoadingVersions: false,
        isSaving: false,
        error: null,
        lastFetch: null
      })
    }),
    {
      name: 'artifact-store',
      partialize: (state) => ({
        filters: state.filters
        // Don't persist artifacts - they come from DB
      })
    }
  )
);
