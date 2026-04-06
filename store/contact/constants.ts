/**
 * Contact Store — Constants & Helper Functions
 * @module store/contact/constants
 */

// Pipeline mode constants - for Kanban view that needs more contacts
export const PIPELINE_PAGE_SIZE = 200;  // Para vista Kanban (full pipeline)
export const LIST_PAGE_SIZE = 25;       // Para vista Tabla (paginada)

// Cache duration for preload (5 minutes)
export const PRELOAD_CACHE_MS = 300000;

// ============================================
// DEV TEAM / OBSERVATION MODE CONSTANTS
// ============================================
export const URPE_LAB_ENTERPRISE_ID = 13; // Urpe AI Lab - Base enterprise for dev team
export const DEV_TEAM_ROLE_ID = 1; // Role ID for development/QA/observability team

// Helper to check if user is viewing another enterprise (informational only)
// Note: Role 1 (Dev Team) can write to any enterprise - this is now just for UI awareness
export const isViewingOtherEnterprise = (isObservationMode: boolean): boolean => {
  return isObservationMode;
};

// PERFORMANCE: In-flight locks to prevent duplicate simultaneous fetches
// fetchEnterpriseAppointments: called by ContactsView + FunnelView + CalendarView + preload
export let appointmentsFetchInFlight: Promise<void> | null = null;
export let appointmentsFetchInFlightKey: string | null = null;
export let appointmentsLatestRequestKey: string | null = null;
export const getAppointmentsFetchInFlightKey = () => appointmentsFetchInFlightKey;
export const getAppointmentsLatestRequestKey = () => appointmentsLatestRequestKey;
export const setAppointmentsFetchInFlight = (p: Promise<void> | null, key: string | null = null) => {
  appointmentsFetchInFlight = p;
  appointmentsFetchInFlightKey = key;
};
export const setAppointmentsLatestRequestKey = (key: string | null) => { appointmentsLatestRequestKey = key; };
// fetchContacts: called by ContactsView + FunnelView + AdminPanel preload
export let contactsFetchInFlight: Promise<void> | null = null;
export const setContactsFetchInFlight = (p: Promise<void> | null) => { contactsFetchInFlight = p; };

// PERFORMANCE: Search optimization constants (optimized for slow connections)
export const SEARCH_RESULT_LIMIT = 40;  // Max contacts to return from search (reduced from 50)
export const SEARCH_QUERY_LIMIT = 40;   // Max results per sub-query (reduced from 50)
export const SEARCH_DEBOUNCE_MS = 350;  // Debounce for search input (increased)
export const MAX_CONTACTS_IN_MEMORY = 150; // LRU-style limit for contacts array (reduced from 200)

// Storage key for persistence
export const STORAGE_KEY = 'admin-enterprise-selection';

// Helper to normalize phone numbers for search (removes all non-numeric characters)
export const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

// Check if a search term looks like a phone number
export const looksLikePhone = (term: string): boolean => {
  // Contains digits and possibly +, spaces, -, /
  const digitsOnly = term.replace(/\D/g, '');
  return digitsOnly.length >= 3 && /^\d+$/.test(digitsOnly);
};

// Remove accents/diacritics for accent-insensitive search
// e.g. "José" -> "Jose", "María" -> "Maria"
export const removeAccents = (text: string): string => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};
