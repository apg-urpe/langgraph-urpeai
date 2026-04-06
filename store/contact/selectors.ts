/**
 * Contact Store — Selectors
 * @module store/contact/selectors
 */

import type { ContactState } from './types';

// Selectors for performance
export const selectContacts = (state: ContactState) => state.contacts;
export const selectIsLoading = (state: ContactState) => state.isLoading;
export const selectIsLoadingUserContext = (state: ContactState) => state.isLoadingUserContext;
export const selectError = (state: ContactState) => state.error;
export const selectFilters = (state: ContactState) => state.filters;
export const selectPagination = (state: ContactState) => state.pagination;
export const selectUserContext = (state: ContactState) => state.userContext;
export const selectAvailableEnterprises = (state: ContactState) => state.availableEnterprises;
export const selectSelectedEnterpriseId = (state: ContactState) => state.selectedEnterpriseId;
export const selectEnterpriseProfile = (state: ContactState) => state.enterpriseProfile;
export const selectEnterpriseProfileLoading = (state: ContactState) => state.enterpriseProfileLoading;
export const selectEnterpriseProfileError = (state: ContactState) => state.enterpriseProfileError;
export const selectFunnelStages = (state: ContactState) => state.funnelStages; // Added selector
export const selectStageCounts = (state: ContactState) => state.stageCounts; // Total contacts per stage
export const selectTeamMembers = (state: ContactState) => state.teamMembers; // Team members selector
export const selectOrigenOptions = (state: ContactState) => state.origenOptions; // Origen options selector
export const selectSelectedContactId = (state: ContactState) => state.selectedContactId;
export const selectActiveContact = (state: ContactState) => state.activeContact; // Added selector
export const selectActiveContactData = (state: ContactState) => state.activeContactData;
export const selectActiveConversationMessages = (state: ContactState) => state.activeConversationMessages;
export const selectIsLoadingMessages = (state: ContactState) => state.isLoadingMessages;
export const selectRecentConversations = (state: ContactState) => state.recentConversations;
export const selectIsLoadingRecentConversations = (state: ContactState) => state.isLoadingRecentConversations;
export const selectIsLoadingMoreRecentConversations = (state: ContactState) => state.isLoadingMoreRecentConversations;
export const selectRecentConversationsHasMore = (state: ContactState) => state.recentConversationsHasMore;
export const selectRecentConversationsTotalCount = (state: ContactState) => state.recentConversationsTotalCount;
export const selectContactsLastFetch = (state: ContactState) => state.contactsLastFetch;
export const selectAppointmentsLastFetch = (state: ContactState) => state.appointmentsLastFetch;
export const selectIsObservationMode = (state: ContactState) => state.isObservationMode;
export const selectHomeEnterpriseId = (state: ContactState) => state.homeEnterpriseId;

// ============================================
// MEMOIZED SELECTORS (Derived State)
// ============================================

// Get contacts filtered by funnel stage
export const selectContactsByStage = (stageId: number | null) => 
  (state: ContactState) => 
    stageId === null 
      ? state.contacts.filter(c => !c.etapa_embudo)
      : state.contacts.filter(c => c.etapa_embudo === stageId);

// Get contacts count by status
export const selectContactCountsByStatus = (state: ContactState) => ({
  total: state.contacts.length,
  activo: state.contacts.filter(c => c.estado === 'activo').length,
  inactivo: state.contacts.filter(c => c.estado === 'inactivo').length,
  calificado: state.contacts.filter(c => c.es_calificado === 'si').length
});

// Get contacts by assignee
export const selectContactsByAssignee = (assigneeId: number | null) =>
  (state: ContactState) =>
    assigneeId === null
      ? state.contacts.filter(c => !c.team_humano_id)
      : state.contacts.filter(c => c.team_humano_id === assigneeId);

// Get upcoming appointments (next 7 days)
export const selectUpcomingAppointments = (state: ContactState) => {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return state.enterpriseAppointments.filter(apt => {
    const aptDate = new Date(apt.fecha_hora || '');
    return aptDate >= now && aptDate <= weekFromNow;
  }).slice(0, 10);
};

// Get today's appointments
export const selectTodayAppointments = (state: ContactState) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return state.enterpriseAppointments.filter(apt => {
    const aptDate = new Date(apt.fecha_hora || '');
    return aptDate >= today && aptDate < tomorrow;
  });
};

// Check if any data is loading
export const selectIsAnyLoading = (state: ContactState) => 
  state.isLoading || 
  state.enterpriseProfileLoading || 
  state.activeContactData.isLoading ||
  state.isLoadingMessages;

// Get active filters count (for UI badge)
export const selectActiveFiltersCount = (state: ContactState) => {
  let count = 0;
  if (state.filters.search) count++;
  if (state.filters.estado) count++;
  if (state.filters.calificacion) count++;
  if (state.filters.origen) count++;
  if (state.filters.asesorIds && state.filters.asesorIds.length > 0) count++;
  if (state.filters.etapaEmbudoId) count++;
  if (state.filters.dateRange.from || state.filters.dateRange.to) count++;
  return count;
};

// Get enterprise appointments count
export const selectEnterpriseAppointments = (state: ContactState) => state.enterpriseAppointments;
export const selectEnterpriseAppointmentsCount = (state: ContactState) => state.enterpriseAppointments.length;
