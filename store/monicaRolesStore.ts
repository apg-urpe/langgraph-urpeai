/**
 * Monica Roles Store
 * Gestión de roles/agentes personalizados de Monica AI
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  MonicaRole,
  MonicaRolePreview,
  CreateMonicaRolePayload,
  UpdateMonicaRolePayload,
  MonicaRolesState,
  DEFAULT_ROLE_SLUG,
  generateRoleSlug,
  ALL_MONICA_TOOLS
} from '@/types/monica';

// =====================================================
// CONSTANTS
// =====================================================

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SCHEMA = 'adaptive_interface';

// =====================================================
// STORE INTERFACE
// =====================================================

interface MonicaRolesStore extends MonicaRolesState {
  // Actions
  fetchRoles: (forceRefresh?: boolean) => Promise<void>;
  fetchRoleById: (roleId: string) => Promise<MonicaRole | null>;
  setActiveRole: (roleId: string | null) => void;
  createRole: (payload: CreateMonicaRolePayload) => Promise<MonicaRole | null>;
  updateRole: (roleId: string, updates: UpdateMonicaRolePayload) => Promise<boolean>;
  deleteRole: (roleId: string) => Promise<boolean>;
  toggleFavorite: (roleId: string) => Promise<boolean>;
  incrementUsage: (roleId: string) => Promise<void>;
  
  // Selectors
  getActiveRole: () => MonicaRole | null;
  getDefaultRole: () => MonicaRole | null;
  getRolesByCategory: (categoria: string) => MonicaRole[];
  getFavoriteRoles: () => MonicaRole[];
  getRolePreviews: () => MonicaRolePreview[];
  
  // Helpers
  clearError: () => void;
  resetStore: () => void;
}

// =====================================================
// INITIAL STATE
// =====================================================

const initialState: MonicaRolesState = {
  roles: [],
  activeRoleId: null,
  favorites: [],
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  lastFetchedAt: null,
  error: null
};

// =====================================================
// STORE IMPLEMENTATION
// =====================================================

export const useMonicaRolesStore = create<MonicaRolesStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // =====================================================
      // FETCH ROLES
      // =====================================================
      fetchRoles: async (forceRefresh = false) => {
        const state = get();
        
        // Check cache
        if (!forceRefresh && state.lastFetchedAt) {
          const elapsed = Date.now() - state.lastFetchedAt;
          if (elapsed < CACHE_DURATION_MS && state.roles.length > 0) {
            logger.debug('[MonicaRoles] Using cached roles');
            return;
          }
        }

        set({ isLoading: true, error: null });

        try {
          // Fetch roles from DB
          const { data: roles, error } = await supabase
            .schema(SCHEMA as any)
            .from('monica_roles')
            .select('*')
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .order('usage_count', { ascending: false })
            .order('nombre', { ascending: true });

          if (error) throw error;

          // Fetch favorites
          const { data: favData } = await supabase
            .schema(SCHEMA as any)
            .from('monica_roles_favoritos')
            .select('role_id');

          const favoriteIds = (favData || []).map(f => f.role_id);

          set({
            roles: roles || [],
            favorites: favoriteIds,
            isLoading: false,
            lastFetchedAt: Date.now()
          });

          logger.debug('[MonicaRoles] Fetched', roles?.length, 'roles');

          // Set default role as active if none selected
          if (!get().activeRoleId && roles?.length) {
            const defaultRole = roles.find(r => r.is_default);
            if (defaultRole) {
              set({ activeRoleId: defaultRole.id });
            }
          }

        } catch (error: any) {
          logger.error('[MonicaRoles] Fetch error:', error);
          set({ isLoading: false, error: error.message });
        }
      },

      // =====================================================
      // FETCH SINGLE ROLE
      // =====================================================
      fetchRoleById: async (roleId: string) => {
        try {
          const { data, error } = await supabase
            .schema(SCHEMA as any)
            .from('monica_roles')
            .select('*')
            .eq('id', roleId)
            .single();

          if (error) throw error;
          return data as MonicaRole;
        } catch (error: any) {
          logger.error('[MonicaRoles] Fetch by ID error:', error);
          return null;
        }
      },

      // =====================================================
      // SET ACTIVE ROLE
      // =====================================================
      setActiveRole: (roleId: string | null) => {
        set({ activeRoleId: roleId });
        logger.debug('[MonicaRoles] Active role set to:', roleId);
        
        // Increment usage if selecting a role
        if (roleId) {
          get().incrementUsage(roleId);
        }
      },

      // =====================================================
      // CREATE ROLE
      // =====================================================
      createRole: async (payload: CreateMonicaRolePayload) => {
        set({ isCreating: true, error: null });

        try {
          // Get current user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('User not authenticated');

          // Generate slug if not provided
          const slug = payload.slug || generateRoleSlug(payload.nombre);

          // Prepare insert data
          const insertData = {
            nombre: payload.nombre,
            slug,
            descripcion: payload.descripcion || null,
            system_prompt: payload.system_prompt,
            welcome_message: payload.welcome_message || null,
            temperatura: payload.temperatura ?? 0.7,
            max_tokens: payload.max_tokens ?? 4096,
            tools_enabled: payload.tools_enabled || ALL_MONICA_TOOLS,
            avatar_url: payload.avatar_url || null,
            color_theme: payload.color_theme || 'cyan',
            icono: payload.icono || 'Sparkles',
            created_by: user.id,
            empresa_id: payload.empresa_id ?? null,
            is_public: payload.is_public ?? false,
            is_default: false,
            is_active: true,
            categoria: payload.categoria || 'custom',
            tags: payload.tags || []
          };

          const { data, error } = await supabase
            .schema(SCHEMA as any)
            .from('monica_roles')
            .insert(insertData)
            .select()
            .single();

          if (error) throw error;

          // Add to local state
          const newRole = data as MonicaRole;
          set(state => ({
            roles: [...state.roles, newRole],
            isCreating: false
          }));

          logger.debug('[MonicaRoles] Created role:', newRole.nombre);
          return newRole;

        } catch (error: any) {
          logger.error('[MonicaRoles] Create error:', error);
          set({ isCreating: false, error: error.message });
          return null;
        }
      },

      // =====================================================
      // UPDATE ROLE
      // =====================================================
      updateRole: async (roleId: string, updates: UpdateMonicaRolePayload) => {
        set({ isUpdating: true, error: null });

        try {
          const { error } = await supabase
            .schema(SCHEMA as any)
            .from('monica_roles')
            .update(updates)
            .eq('id', roleId);

          if (error) throw error;

          // Update local state
          set(state => ({
            roles: state.roles.map(r => 
              r.id === roleId ? { ...r, ...updates, updated_at: new Date().toISOString() } : r
            ),
            isUpdating: false
          }));

          logger.debug('[MonicaRoles] Updated role:', roleId);
          return true;

        } catch (error: any) {
          logger.error('[MonicaRoles] Update error:', error);
          set({ isUpdating: false, error: error.message });
          return false;
        }
      },

      // =====================================================
      // DELETE ROLE (Soft delete)
      // =====================================================
      deleteRole: async (roleId: string) => {
        try {
          const role = get().roles.find(r => r.id === roleId);
          if (role?.is_default) {
            logger.warn('[MonicaRoles] Cannot delete default role');
            return false;
          }

          const { error } = await supabase
            .schema(SCHEMA as any)
            .from('monica_roles')
            .update({ is_active: false })
            .eq('id', roleId);

          if (error) throw error;

          // Remove from local state
          set(state => ({
            roles: state.roles.filter(r => r.id !== roleId),
            activeRoleId: state.activeRoleId === roleId ? null : state.activeRoleId
          }));

          logger.debug('[MonicaRoles] Deleted role:', roleId);
          return true;

        } catch (error: any) {
          logger.error('[MonicaRoles] Delete error:', error);
          set({ error: error.message });
          return false;
        }
      },

      // =====================================================
      // TOGGLE FAVORITE
      // =====================================================
      toggleFavorite: async (roleId: string) => {
        const { favorites } = get();
        const isFavorite = favorites.includes(roleId);

        try {
          if (isFavorite) {
            // Remove from favorites
            const { error } = await supabase
              .schema(SCHEMA as any)
              .from('monica_roles_favoritos')
              .delete()
              .eq('role_id', roleId);

            if (error) throw error;

            set(state => ({
              favorites: state.favorites.filter(id => id !== roleId)
            }));
          } else {
            // Add to favorites
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabase
              .schema(SCHEMA as any)
              .from('monica_roles_favoritos')
              .insert({ user_id: user.id, role_id: roleId });

            if (error) throw error;

            set(state => ({
              favorites: [...state.favorites, roleId]
            }));
          }

          logger.debug('[MonicaRoles] Toggled favorite:', roleId, !isFavorite);
          return true;

        } catch (error: any) {
          logger.error('[MonicaRoles] Toggle favorite error:', error);
          return false;
        }
      },

      // =====================================================
      // INCREMENT USAGE
      // =====================================================
      incrementUsage: async (roleId: string) => {
        try {
          // Get current usage count from local state
          const currentRole = get().roles.find(r => r.id === roleId);
          const newCount = (currentRole?.usage_count || 0) + 1;
          const now = new Date().toISOString();

          // Update in DB with incremented value
          await supabase
            .schema(SCHEMA as any)
            .from('monica_roles')
            .update({
              usage_count: newCount,
              last_used_at: now
            })
            .eq('id', roleId);

          // Update local state
          set(state => ({
            roles: state.roles.map(r =>
              r.id === roleId
                ? { ...r, usage_count: newCount, last_used_at: now }
                : r
            )
          }));

        } catch (error) {
          // Silent fail - not critical
          logger.debug('[MonicaRoles] Increment usage failed:', error);
        }
      },

      // =====================================================
      // SELECTORS
      // =====================================================
      getActiveRole: () => {
        const { roles, activeRoleId } = get();
        if (!activeRoleId) return get().getDefaultRole();
        return roles.find(r => r.id === activeRoleId) || null;
      },

      getDefaultRole: () => {
        const { roles } = get();
        return roles.find(r => r.is_default) || roles[0] || null;
      },

      getRolesByCategory: (categoria: string) => {
        return get().roles.filter(r => r.categoria === categoria);
      },

      getFavoriteRoles: () => {
        const { roles, favorites } = get();
        return roles.filter(r => favorites.includes(r.id));
      },

      getRolePreviews: () => {
        const { roles, favorites } = get();
        return roles.map(r => ({
          id: r.id,
          nombre: r.nombre,
          slug: r.slug,
          descripcion: r.descripcion,
          avatar_url: r.avatar_url,
          color_theme: r.color_theme,
          icono: r.icono,
          is_default: r.is_default,
          is_favorite: favorites.includes(r.id),
          categoria: r.categoria,
          usage_count: r.usage_count
        }));
      },

      // =====================================================
      // HELPERS
      // =====================================================
      clearError: () => set({ error: null }),

      resetStore: () => set(initialState)
    }),
    {
      name: 'monica-roles-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeRoleId: state.activeRoleId,
        favorites: state.favorites
      })
    }
  )
);

// =====================================================
// SELECTORS (For use with shallow comparison)
// =====================================================

export const selectRoles = (state: MonicaRolesStore) => state.roles;
export const selectActiveRoleId = (state: MonicaRolesStore) => state.activeRoleId;
export const selectFavorites = (state: MonicaRolesStore) => state.favorites;
export const selectIsLoading = (state: MonicaRolesStore) => state.isLoading;
export const selectError = (state: MonicaRolesStore) => state.error;

// =====================================================
// HOOKS HELPERS
// =====================================================

/**
 * Get active role with memoization helper
 */
export function useActiveMonicaRole(): MonicaRole | null {
  return useMonicaRolesStore(state => {
    const { roles, activeRoleId } = state;
    if (!activeRoleId) {
      return roles.find(r => r.is_default) || null;
    }
    return roles.find(r => r.id === activeRoleId) || null;
  });
}

/**
 * Check if roles are loaded
 */
export function useRolesLoaded(): boolean {
  return useMonicaRolesStore(state => state.roles.length > 0);
}
