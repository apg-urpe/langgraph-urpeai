/**
 * Contact Store — Main Entry Point
 * Assembles all slices into a single Zustand store with persistence.
 * @module store/contact/index
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ContactState } from './types';
import { initialFilters, initialPagination, initialActiveContactData } from './types';
import { STORAGE_KEY } from './constants';
import { createAuthSlice } from './authSlice';
import { createSearchSlice } from './searchSlice';
import { createDetailsSlice } from './detailsSlice';
import { createAppointmentsSlice } from './appointmentsSlice';
import { createConversationsSlice } from './conversationsSlice';
import { createFunnelSlice } from './funnelSlice';
import { createActionsSlice } from './actionsSlice';

// ============================================
// STORE CREATION
// ============================================

export const useContactStore = create<ContactState>()(
  persist(
    (set, get) => ({
      // ── Initial State ──────────────────────────────
      contacts: [],
      userContext: null,
      availableEnterprises: [],
      selectedEnterpriseId: null,
      enterpriseProfile: null,
      enterpriseProfileLoading: false,
      enterpriseProfileError: null,
      funnelStages: [],
      stageCounts: {},
      enterpriseAppointments: [],
      teamMembers: [],
      teamMembersEnterpriseId: null,
      origenOptions: [],
      origenOptionsEnterpriseId: null,

      // Observation Mode
      isObservationMode: false,
      homeEnterpriseId: null,

      // Cache timestamps
      contactsLastFetch: null,
      appointmentsLastFetch: null,
      appointmentsCachedRange: null,
      appointmentsCacheKey: null,
      funnelStagesLastFetch: null,

      selectedContactId: null,
      activeContact: null,
      activeContactData: { ...initialActiveContactData },

      activeConversationMessages: [],
      isLoadingMessages: false,

      recentConversations: [],
      isLoadingRecentConversations: false,
      isLoadingMoreRecentConversations: false,
      recentConversationsSearch: '',
      recentConversationsTotalCount: 0,
      recentConversationsHasMore: false,

      isLoading: false,
      isLoadingUserContext: false,
      error: null,
      filters: initialFilters,
      pagination: initialPagination,

      // ── Slices ─────────────────────────────────────
      ...createAuthSlice(set, get),
      ...createSearchSlice(set, get),
      ...createDetailsSlice(set, get),
      ...createAppointmentsSlice(set, get),
      ...createConversationsSlice(set, get),
      ...createFunnelSlice(set, get),
      ...createActionsSlice(set, get),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        selectedEnterpriseId: state.selectedEnterpriseId,
        // Persist filter configuration (excluding transient search)
        filters: {
          asesorIds: state.filters.asesorIds,
          etapaEmbudoId: state.filters.etapaEmbudoId,
          estado: state.filters.estado,
          calificacion: state.filters.calificacion,
          origen: state.filters.origen,
          estadoCobranza: state.filters.estadoCobranza,
          sortBy: state.filters.sortBy
        }
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        // Merge filters properly, keeping search transient
        filters: {
          ...currentState.filters,
          ...(persistedState?.filters || {})
        }
      })
    }
  )
);

// ── Re-exports ────────────────────────────────────
export type { ContactState } from './types';
export {
  initialFilters,
  initialPagination,
  initialActiveContactData
} from './types';

export {
  PIPELINE_PAGE_SIZE,
  LIST_PAGE_SIZE,
  PRELOAD_CACHE_MS,
  URPE_LAB_ENTERPRISE_ID,
  DEV_TEAM_ROLE_ID,
  isViewingOtherEnterprise,
  SEARCH_RESULT_LIMIT,
  SEARCH_QUERY_LIMIT,
  SEARCH_DEBOUNCE_MS,
  MAX_CONTACTS_IN_MEMORY,
  STORAGE_KEY,
  normalizePhone,
  looksLikePhone,
  removeAccents
} from './constants';

export {
  selectContacts,
  selectIsLoading,
  selectIsLoadingUserContext,
  selectError,
  selectFilters,
  selectPagination,
  selectUserContext,
  selectAvailableEnterprises,
  selectSelectedEnterpriseId,
  selectEnterpriseProfile,
  selectEnterpriseProfileLoading,
  selectEnterpriseProfileError,
  selectFunnelStages,
  selectStageCounts,
  selectTeamMembers,
  selectOrigenOptions,
  selectSelectedContactId,
  selectActiveContact,
  selectActiveContactData,
  selectActiveConversationMessages,
  selectIsLoadingMessages,
  selectRecentConversations,
  selectIsLoadingRecentConversations,
  selectIsLoadingMoreRecentConversations,
  selectRecentConversationsHasMore,
  selectRecentConversationsTotalCount,
  selectContactsLastFetch,
  selectAppointmentsLastFetch,
  selectIsObservationMode,
  selectHomeEnterpriseId,
  selectContactsByStage,
  selectContactCountsByStatus,
  selectContactsByAssignee,
  selectUpcomingAppointments,
  selectTodayAppointments,
  selectIsAnyLoading,
  selectActiveFiltersCount,
  selectEnterpriseAppointments,
  selectEnterpriseAppointmentsCount
} from './selectors';
