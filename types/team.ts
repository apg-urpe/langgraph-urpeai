import { z } from 'zod';

// ==========================================
// NYLAS GRANT STATUS
// ==========================================

export type NylasGrantStatusType = 'valid' | 'invalid' | 'expired' | 'not_connected' | 'error';

export interface NylasGrantStatus {
  memberId: number;
  grantId: string | null;
  status: NylasGrantStatusType;
  email?: string;
  provider?: string;
  scopes?: string[];
  lastChecked: string;
  errorMessage?: string;
}

export interface NylasGrantsSummary {
  total: number;
  valid: number;
  invalid: number;
  notConnected: number;
  errors: number;
}

export interface NylasGrantsStatusResponse {
  success: boolean;
  grants: NylasGrantStatus[];
  summary: NylasGrantsSummary;
}

// Helper para obtener el color del estado de Nylas
export const getNylasStatusColor = (status: NylasGrantStatusType): string => {
  switch (status) {
    case 'valid':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'invalid':
    case 'expired':
      return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'not_connected':
      return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    case 'error':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    default:
      return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  }
};

// Helper para obtener el texto del estado de Nylas
export const getNylasStatusLabel = (status: NylasGrantStatusType): string => {
  switch (status) {
    case 'valid':
      return 'Conectado';
    case 'invalid':
      return 'Inválido';
    case 'expired':
      return 'Expirado';
    case 'not_connected':
      return 'Sin conectar';
    case 'error':
      return 'Error';
    default:
      return 'Desconocido';
  }
};

export interface AvailabilitySlot {
  inicio: string; // "09:00"
  fin: string; // "15:00"
}

// System roles from system_roles table
export interface SystemRole {
  id: number;
  name: string;
  description?: string | null;
  enterprise_id?: number | null; // null = global system role
  is_super_admin: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySchedule {
  lunes: AvailabilitySlot[];
  martes: AvailabilitySlot[];
  miercoles: AvailabilitySlot[];
  jueves: AvailabilitySlot[];
  viernes: AvailabilitySlot[];
  sabado?: AvailabilitySlot[];
  domingo?: AvailabilitySlot[];
}

export interface AvailabilityConfig {
  horarios_normales: AvailabilitySchedule;
  horarios_especiales: any[]; // Define structure if known
  vacaciones: any[]; // Define structure if known
  buffer_entre_citas: number;
  duracion_maxima_cita: number;
  permite_fines_semana: boolean;
}

// Team group configuration (from team_groups table)
export interface TeamGroupConfig {
  id: number;
  empresa_id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface TeamMemberProfile {
  id: number;
  empresa_id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  rol: string;
  especialidad?: string | null;
  is_active: boolean;
  prioridad?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  timezone?: string | null;
  disponibilidad?: AvailabilityConfig | null;
  calendly?: string | null;
  grupo_whatsapp?: string | null;
  webinar?: string | null;
  slack_id?: string | null;
  ultima_asignacion?: string | null;
  deleted?: string | null;
  grant_id?: string | null;
  id_contacto?: number | null;
  duracion_cita_minutos?: number | null;
  acepta_citas?: boolean | null;
  notetaker?: boolean | null;
  auth_uid?: string | null;
  analisis_asesor?: string | null;
  role_id?: number | null;
  enterprise_id?: number | null;
  multimedia?: string | null;
  temporal_nylas?: string | null;
}

export interface CreateTeamMemberPayload {
  empresa_id: number;
  enterprise_id?: number; // Should ALWAYS equal empresa_id for non-dev team users
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  rol: string;
  role_id?: number;
  is_active?: boolean;
  especialidad?: string;
  prioridad?: string;
  timezone?: string;
  disponibilidad?: AvailabilityConfig;
}

export interface UpdateTeamMemberPayload extends Partial<CreateTeamMemberPayload> {
  id: number;
  // Add other updatable fields
  calendly?: string;
  grupo_whatsapp?: string;
  webinar?: string;
  slack_id?: string;
  duracion_cita_minutos?: number;
  acepta_citas?: boolean;
  notetaker?: boolean;
  deleted?: string | null;
}

export type ContactTransferStrategy = 'reassign' | 'remove';

export type ContactTransferMode = 'single_target' | 'round_robin';

export interface ContactTransferDistributionItem {
  team_member_id: number;
  contacts_count: number;
}

export interface ContactTransferPreview {
  principal_contacts_count: number;
  secondary_collaborator_count: number;
  secondary_observer_count: number;
  target_existing_assignment_merges_count: number;
  future_appointments_count: number;
  eligible_team_members_count: number;
  round_robin_distribution: ContactTransferDistributionItem[];
}

export interface ContactTransferPreviewPayload {
  empresa_id: number;
  from_team_member_id: number;
  to_team_member_id?: number | null;
  transfer_mode?: ContactTransferMode;
  eligible_team_member_ids?: number[];
}

export interface TransferContactsBetweenMembersPayload {
  empresa_id: number;
  from_team_member_id: number;
  to_team_member_id?: number | null;
  collaborator_strategy: ContactTransferStrategy;
  observer_strategy: ContactTransferStrategy;
  actor_team_member_id?: number | null;
  transfer_mode?: ContactTransferMode;
  eligible_team_member_ids?: number[];
}

export interface TransferContactsBetweenMembersResult {
  principal_contacts_transferred: number;
  collaborator_assignments_reassigned: number;
  collaborator_assignments_removed: number;
  observer_assignments_reassigned: number;
  observer_assignments_removed: number;
  target_existing_assignment_merges: number;
  future_appointment_participants_added: number;
  eligible_team_members_count: number;
  round_robin_distribution: ContactTransferDistributionItem[];
}

// ==========================================
// TEAM INVITATIONS
// ==========================================

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface TeamInvitation {
  id: number;
  token: string;
  email: string;
  rol: TeamMemberProfile['rol'];
  role_id: number;
  empresa_id: number;
  invited_by: number | null;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  team_member_id: number | null;
  metadata?: Record<string, any>;
  // Joined data
  inviter?: {
    nombre: string;
    apellido: string;
  };
  empresa?: {
    nombre: string;
  };
}

export interface CreateInvitationPayload {
  email: string;
  rol: TeamMemberProfile['rol'];
  role_id: number;
  empresa_id: number;
  invited_by: number;
}

export interface AcceptInvitationPayload {
  token: string;
  nombre: string;
  apellido: string;
  telefono?: string;
  auth_uid?: string;
}

export interface AcceptInvitationResult {
  success: boolean;
  message: string;
  member_id: number | null;
  empresa_id: number | null;
}

// Helper para generar URL de invitación
export const generateInviteUrl = (token: string): string => {
  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/invite/${token}`;
};

// Helper para verificar si una invitación está expirada
export const isInvitationExpired = (expiresAt: string): boolean => {
  return new Date(expiresAt) < new Date();
};

// Helper para formatear tiempo restante
export const getInvitationTimeRemaining = (expiresAt: string): string => {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  
  if (diff <= 0) return 'Expirada';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m`;
};

// ==========================================
// ZOD SCHEMAS FOR VALIDATION
// ==========================================

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Email validation schema
export const EmailSchema = z.string()
  .min(1, 'Email es requerido')
  .email('Formato de email inválido')
  .max(255, 'Email muy largo')
  .transform(val => val.toLowerCase().trim());

// Token validation schema (UUID v4)
export const InvitationTokenSchema = z.string()
  .min(1, 'Token es requerido')
  .regex(UUID_REGEX, 'Token inválido - formato incorrecto');

// Rol validation (dynamic - any non-empty string)
export const TeamRolSchema = z.string().min(1, 'Grupo es requerido');

// Create invitation payload schema
export const CreateInvitationSchema = z.object({
  email: EmailSchema,
  rol: TeamRolSchema,
  role_id: z.number().int().positive('Role ID debe ser positivo'),
  empresa_id: z.number().int().positive('Empresa ID debe ser positivo'),
  invited_by: z.number().int().positive('Invited by debe ser positivo')
});

// Accept invitation payload schema
export const AcceptInvitationSchema = z.object({
  token: InvitationTokenSchema,
  nombre: z.string()
    .min(1, 'Nombre es requerido')
    .max(100, 'Nombre muy largo')
    .transform(val => val.trim()),
  apellido: z.string()
    .min(1, 'Apellido es requerido')
    .max(100, 'Apellido muy largo')
    .transform(val => val.trim()),
  telefono: z.string()
    .max(20, 'Teléfono muy largo')
    .optional()
    .transform(val => val?.trim() || undefined),
  auth_uid: z.string().uuid().optional()
});

// ==========================================
// VALIDATION HELPERS
// ==========================================

export type CreateInvitationValidated = z.infer<typeof CreateInvitationSchema>;
export type AcceptInvitationValidated = z.infer<typeof AcceptInvitationSchema>;

/**
 * Valida payload de creación de invitación
 * @returns { success: true, data } | { success: false, error: string }
 */
export const validateCreateInvitation = (payload: unknown): 
  { success: true; data: CreateInvitationValidated } | 
  { success: false; error: string } => {
  try {
    const data = CreateInvitationSchema.parse(payload);
    return { success: true, data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.errors.map(e => e.message).join(', ');
      return { success: false, error: message };
    }
    return { success: false, error: 'Error de validación desconocido' };
  }
};

/**
 * Valida payload de aceptación de invitación
 * @returns { success: true, data } | { success: false, error: string }
 */
export const validateAcceptInvitation = (payload: unknown): 
  { success: true; data: AcceptInvitationValidated } | 
  { success: false; error: string } => {
  try {
    const data = AcceptInvitationSchema.parse(payload);
    return { success: true, data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.errors.map(e => e.message).join(', ');
      return { success: false, error: message };
    }
    return { success: false, error: 'Error de validación desconocido' };
  }
};

/**
 * Valida formato de token de invitación
 */
export const isValidInvitationToken = (token: string): boolean => {
  return UUID_REGEX.test(token);
};

/**
 * Sanitiza y valida email
 */
export const sanitizeEmail = (email: string): string | null => {
  const result = EmailSchema.safeParse(email);
  return result.success ? result.data : null;
};
