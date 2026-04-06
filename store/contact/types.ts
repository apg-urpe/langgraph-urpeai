/**
 * Contact Store — Types & Initial State
 * @module store/contact/types
 */

import { 
  Contact, 
  ContactFilters, 
  PaginationState, 
  UserContext, 
  Enterprise,
  EnterpriseProfile,
  Conversation,
  Appointment,
  AppointmentParticipant,
  Multimedia,
  ContactNote,
  FunnelStatus,
  ConversationMessage,
  FunnelStage,
  ContactSearchResult,
  SearchScope,
  Transcripcion,
  TeamMember,
  Task,
  ContactTeamAssignment,
  CreateAssignmentPayload,
  UpdateAssignmentPayload
} from '../../types/contact';
import { Service, Payment } from '../../types/finance';

// Re-export types used by consumers
export type { 
  Contact, 
  ContactFilters, 
  PaginationState, 
  UserContext, 
  Enterprise,
  EnterpriseProfile,
  Conversation,
  Appointment,
  AppointmentParticipant,
  Multimedia,
  ContactNote,
  FunnelStatus,
  ConversationMessage,
  FunnelStage,
  ContactSearchResult,
  SearchScope,
  Transcripcion,
  TeamMember,
  Task,
  ContactTeamAssignment,
  CreateAssignmentPayload,
  UpdateAssignmentPayload,
  Service,
  Payment
};

// Initial filter state
// DEFAULT: 'basic' for faster search (user can switch to 'all' for deep search)
export const initialFilters: ContactFilters = {
  search: '',
  searchScope: 'basic',
  estado: null,
  calificacion: null,
  origen: null,
  asesorIds: [], // Empty = all team members
  etapaEmbudoId: null,
  dateRange: { from: null, to: null },
  sortBy: 'leadScore',
  estadoCobranza: null
};

// Initial pagination
export const initialPagination: PaginationState = {
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 0
};

// Zustand setter/getter types for slices
export type ContactSet = (partial: Partial<ContactState> | ((state: ContactState) => Partial<ContactState>)) => void;
export type ContactGet = () => ContactState;

export interface ContactState {
  // Data
  contacts: Contact[];
  userContext: UserContext | null;
  availableEnterprises: Enterprise[];
  selectedEnterpriseId: number | null;
  enterpriseProfile: EnterpriseProfile | null;
  enterpriseProfileLoading: boolean;
  enterpriseProfileError: string | null;
  funnelStages: FunnelStage[]; // Added funnelStages
  stageCounts: Record<number, number>; // Total contacts per stage (from DB)
  enterpriseAppointments: Appointment[]; // Added for Calendar View
  teamMembers: TeamMember[]; // Team members for filter dropdown
  teamMembersEnterpriseId: number | null; // Cache key for team members
  origenOptions: string[]; // Distinct origen values for current enterprise
  origenOptionsEnterpriseId: number | null; // Cache key for origen options
  
  // Observation Mode (Dev Team)
  isObservationMode: boolean; // true when role 1 user is viewing an enterprise != home
  homeEnterpriseId: number | null; // Base enterprise for the user (13 for role 1)
  
  // Cache timestamps
  contactsLastFetch: number | null;
  appointmentsLastFetch: number | null;
  appointmentsCachedRange: { start: string; end: string } | null;
  appointmentsCacheKey: string | null;
  funnelStagesLastFetch: number | null;
  
  // Selected Contact Data
  selectedContactId: number | null;
  activeContact: Contact | null; // Added activeContact
  activeContactData: {
    conversations: Conversation[];
    appointments: Appointment[];
    multimedia: Multimedia[];
    notes: ContactNote[];
    transcripciones: Transcripcion[];
    funnelStatus: FunnelStatus | null;
    // NEW: Monica Full Context
    messages: ConversationMessage[];  // All messages from all conversations
    tasks: Task[];                     // Tasks with items
    services: (Service & { pagos?: Payment[] })[];  // Portfolio with payments
    funnelStage: FunnelStage | null;   // Funnel stage with description
    assignedAdvisor: TeamMember | null; // Assigned team member
    isLoading: boolean;
    error: string | null;
  };

  // Selected Conversation Messages
  activeConversationMessages: ConversationMessage[];
  isLoadingMessages: boolean;

  // Global Messages View
  recentConversations: Conversation[];
  isLoadingRecentConversations: boolean;
  isLoadingMoreRecentConversations: boolean;
  recentConversationsSearch: string;
  recentConversationsTotalCount: number;
  recentConversationsHasMore: boolean;
  
  // UI State
  isLoading: boolean;
  isLoadingUserContext: boolean; // Flag to prevent multiple simultaneous fetchUserContext calls
  error: string | null;
  filters: ContactFilters;
  pagination: PaginationState;
  
  // Actions
  fetchUserContext: () => Promise<void>;
  fetchEnterpriseProfile: (enterpriseId?: number | null, forceRefresh?: boolean) => Promise<void>;
  updateEnterpriseProfile: (enterpriseId: number, patch: Partial<EnterpriseProfile>) => Promise<EnterpriseProfile | null>;
  fetchContacts: (forceRefresh?: boolean, pageSizeOverride?: number) => Promise<void>;
  fetchFunnelStages: (forceRefresh?: boolean) => Promise<void>; // Added action
  fetchStageCounts: () => Promise<void>; // Fetch total contacts per stage
  fetchContactsByStage: (stageId: number, limit?: number) => Promise<void>; // Fetch contacts for a specific stage
  fetchTeamMembers: (forceRefresh?: boolean, enterpriseIdOverride?: number | null) => Promise<void>; // Fetch team members for filter
  fetchEnterpriseAppointments: (teamMemberIds?: number[] | null, dateRange?: { start: string; end: string } | null, forceRefresh?: boolean) => Promise<{ fromCache: boolean }>; // Updated for Calendar View - now accepts array of IDs
  fetchOrigenOptions: (forceRefresh?: boolean) => Promise<void>; // Fetch distinct origen values
  preloadEnterpriseData: () => Promise<void>; // NEW: Preload all data for enterprise
  setFilters: (filters: Partial<ContactFilters>) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  setSelectedEnterprise: (enterpriseId: number | null) => void;
  refreshContacts: () => Promise<void>;
  isCacheValid: (module: 'contacts' | 'appointments' | 'funnelStages') => boolean;
  
  // Contact Detail Actions
  selectContact: (contactId: number | null, initialContact?: Partial<Contact>) => void; // Updated signature
  fetchContactDetails: (contactId: number, options?: { priorityTab?: 'appointments' | 'conversations' }) => Promise<void>;
  createContact: (payload: {
    nombre?: string | null;
    apellido?: string | null;
    telefono?: string | null;
    email?: string | null;
    estado?: string;
    es_calificado?: string;
    origen?: string;
    notas?: string | null;
    empresa_id: number;
    team_humano_id?: number | null;
  }) => Promise<{ success: boolean; contact?: Contact; error?: string }>;
  updateContactStage: (contactId: number, stageId: number) => Promise<void>;
  updateContactField: (contactId: number, field: keyof Contact, value: string | number | boolean | null | Record<string, any>) => Promise<void>;
  addContactNote: (contactId: number, description: string, options?: { titulo?: string; etiquetas?: string[]; es_fijado?: boolean; archivos_urls?: string[]; visible_ia?: boolean }) => Promise<void>;
  updateContactNote: (noteId: number, description: string, options?: { titulo?: string; etiquetas?: string[]; es_fijado?: boolean; visible_ia?: boolean }) => Promise<void>;
  deleteContactNote: (noteId: number) => Promise<void>;
  
  // Contact Pause/Active Actions
  pauseContact: (contactId: number, durationMinutes: number | null) => Promise<boolean>;
  reactivateContact: (contactId: number) => Promise<boolean>;
  
  // Appointment Actions
  createAppointment: (payload: {
    titulo: string;
    descripcion?: string;
    fecha_inicio: string;
    fecha_fin: string;
    contacto_id?: number;
    team_humano_id: number;
    tipo?: 'llamada' | 'videollamada' | 'presencial';
    location?: string;
    metadata?: Record<string, any>;
    invitados_ids?: number[];
  }) => Promise<{ success: boolean; appointment?: Appointment; error?: string; code?: string }>;
  updateAppointment: (appointmentId: number | string, payload: {
    titulo?: string;
    descripcion?: string | null;
    fecha_inicio?: string;
    fecha_fin?: string;
    contacto_id?: number | null;
    estado?: string;
    location?: string | null;
    tipo?: 'llamada' | 'videollamada' | 'presencial';
    metadata?: Record<string, any>;
    invitados_ids?: number[];
    is_internal?: boolean;
  }) => Promise<{ success: boolean; appointment?: Appointment; error?: string; code?: string }>;
  updateAppointmentLocation: (appointmentId: number | string, location: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  updateAppointmentStatus: (appointmentId: number | string, status: string) => Promise<void>;
  updateAppointmentContact: (appointmentId: number | string, contactId: number) => Promise<boolean>;
  
  // Conversation Actions
  fetchConversationMessages: (conversationId: number) => Promise<void>;
  clearConversationMessages: () => void;
  fetchRecentConversations: (forceRefresh?: boolean) => Promise<void>;
  fetchMoreRecentConversations: () => Promise<void>;
  setRecentConversationsSearch: (search: string) => void;
  sendDirectMessage: (conversationId: number, contactId: number, content: string) => Promise<boolean>;
  
  // Funnel Stage CRUD Actions
  createFunnelStage: (payload: import('../../types/contact').CreateFunnelStagePayload) => Promise<import('../../types/contact').FunnelStage | null>;
  updateFunnelStage: (stageId: number, updates: import('../../types/contact').UpdateFunnelStagePayload) => Promise<boolean>;
  deleteFunnelStage: (stageId: number) => Promise<boolean>;
  reorderFunnelStages: (stageIds: number[]) => Promise<boolean>;
  
  // Contact Multimedia Actions
  uploadContactMultimedia: (contactId: number, empresaId: number, file: File) => Promise<{ success: boolean; multimedia?: Multimedia; error?: string }>;
  deleteContactMultimedia: (multimediaId: number, filePath: string) => Promise<boolean>;
  
  // Contact Team Assignments Actions
  fetchContactAssignments: (contactId: number) => Promise<ContactTeamAssignment[]>;
  addContactAssignment: (payload: CreateAssignmentPayload) => Promise<{ success: boolean; assignment?: ContactTeamAssignment; error?: string }>;
  updateContactAssignment: (payload: UpdateAssignmentPayload) => Promise<{ success: boolean; error?: string }>;
  deleteContactAssignment: (assignmentId: number) => Promise<{ success: boolean; error?: string }>;
  
  // Merge Contacts Actions
  mergeContacts: (primaryId: number, secondaryId: number, fieldChoices: Record<string, 'primary' | 'secondary'>, notesStrategy?: 'both' | 'primary_only' | 'secondary_only') => Promise<{ success: boolean; tablesUpdated?: Record<string, number>; error?: string }>;
  previewMerge: (primaryId: number, secondaryId: number) => Promise<{ success: boolean; primary?: any; secondary?: any; preview?: Record<string, number>; error?: string }>;
}

// Initial active contact data (reusable)
export const initialActiveContactData: ContactState['activeContactData'] = {
  conversations: [],
  appointments: [],
  multimedia: [],
  notes: [],
  transcripciones: [],
  funnelStatus: null,
  messages: [],
  tasks: [],
  services: [],
  funnelStage: null,
  assignedAdvisor: null,
  isLoading: false,
  error: null
};
