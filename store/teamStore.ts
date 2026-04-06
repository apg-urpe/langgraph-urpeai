import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { 
  TeamMemberProfile, 
  CreateTeamMemberPayload, 
  UpdateTeamMemberPayload, 
  SystemRole,
  TeamInvitation,
  CreateInvitationPayload,
  AcceptInvitationPayload,
  AcceptInvitationResult,
  generateInviteUrl,
  validateCreateInvitation,
  validateAcceptInvitation,
  isValidInvitationToken,
  NylasGrantStatus,
  NylasGrantsSummary,
  NylasGrantsStatusResponse,
  TeamGroupConfig,
  ContactTransferPreview,
  ContactTransferPreviewPayload,
  ContactTransferDistributionItem,
  TransferContactsBetweenMembersPayload,
  TransferContactsBetweenMembersResult
} from '../types/team';

interface TeamState {
  members: TeamMemberProfile[];
  archivedMembers: TeamMemberProfile[];
  systemRoles: SystemRole[];
  invitations: TeamInvitation[];
  groups: TeamGroupConfig[];
  isLoading: boolean;
  isLoadingArchived: boolean;
  isLoadingInvitations: boolean;
  isLoadingGroups: boolean;
  error: string | null;
  selectedMember: TeamMemberProfile | null;
  
  // Nylas Grants Status
  nylasGrants: NylasGrantStatus[];
  nylasGrantsSummary: NylasGrantsSummary | null;
  isLoadingNylasStatus: boolean;
  
  // Member Actions
  fetchMembers: (empresaId: number) => Promise<void>;
  fetchArchivedMembers: (empresaId: number) => Promise<void>;
  fetchSystemRoles: (empresaId?: number | null) => Promise<void>;
  createMember: (member: CreateTeamMemberPayload) => Promise<TeamMemberProfile | null>;
  updateMember: (id: number, updates: Partial<UpdateTeamMemberPayload>) => Promise<TeamMemberProfile | null>;
  deleteMember: (id: number) => Promise<boolean>;
  restoreMember: (id: number) => Promise<boolean>;
  setSelectedMember: (member: TeamMemberProfile | null) => void;
  getRoleName: (roleId: number | null | undefined) => string;
  canEditTeam: (userRoleId: number | null | undefined) => boolean;
  toggleNotetaker: (memberId: number, enabled: boolean) => Promise<boolean>;
  previewContactTransfer: (payload: ContactTransferPreviewPayload) => Promise<ContactTransferPreview | null>;
  transferContactsBetweenMembers: (payload: TransferContactsBetweenMembersPayload) => Promise<TransferContactsBetweenMembersResult | null>;
  
  // Nylas Grants Actions
  fetchNylasGrantsStatus: (empresaId: number) => Promise<void>;
  getNylasStatusForMember: (memberId: number) => NylasGrantStatus | null;
  disconnectGrant: (memberId: number) => Promise<boolean>;
  
  // Invitation Actions
  fetchInvitations: (empresaId: number) => Promise<void>;
  createInvitation: (payload: CreateInvitationPayload) => Promise<{ invitation: TeamInvitation | null; inviteUrl: string | null }>;
  cancelInvitation: (invitationId: number) => Promise<boolean>;
  resendInvitation: (invitationId: number) => Promise<boolean>;
  
  // Group Actions
  fetchGroups: (empresaId: number) => Promise<void>;
  createGroup: (empresaId: number, name: string, icon?: string, color?: string) => Promise<TeamGroupConfig | null>;
  updateGroup: (id: number, updates: Partial<Pick<TeamGroupConfig, 'name' | 'icon' | 'color' | 'sort_order' | 'is_active'>>) => Promise<boolean>;
  deleteGroup: (id: number) => Promise<boolean>;
}

// Permission check: only role_id 1, 2 (admin/leader) can edit/archive team members
const ALLOWED_EDIT_ROLES = [1, 2];

const parseTransferDistribution = (value: unknown): ContactTransferDistributionItem[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const record = item as Record<string, unknown>;
      const teamMemberId = Number(record.team_member_id ?? 0);
      const contactsCount = Number(record.contacts_count ?? 0);

      if (!Number.isFinite(teamMemberId) || teamMemberId <= 0) return null;

      return {
        team_member_id: teamMemberId,
        contacts_count: Number.isFinite(contactsCount) ? contactsCount : 0,
      };
    })
    .filter((item): item is ContactTransferDistributionItem => item !== null);
};

const isMissingTransferRpcSignature = (message: string | undefined, functionName: string) => {
  if (!message) return false;

  return message.includes(`Could not find the function public.${functionName}`)
    || message.includes(`Could not find the function ${functionName}`);
};

const getTransferRpcCompatibilityError = (mode: 'single_target' | 'round_robin') => {
  if (mode === 'round_robin') {
    return 'La base de datos aún no tiene aplicada la versión nueva de la transferencia con round-robin. Ejecuta el script TRANSFER_CONTACTS_BETWEEN_TEAM_MEMBERS.sql en Supabase.';
  }

  return 'La base de datos aún no tiene aplicada la versión nueva de la transferencia. Se usará el modo compatible sin métricas extendidas cuando sea posible.';
};

export const useTeamStore = create<TeamState>((set, get) => ({
  members: [],
  archivedMembers: [],
  systemRoles: [],
  invitations: [],
  groups: [],
  isLoading: false,
  isLoadingArchived: false,
  isLoadingInvitations: false,
  isLoadingGroups: false,
  error: null,
  selectedMember: null,
  
  // Nylas Grants Status
  nylasGrants: [],
  nylasGrantsSummary: null,
  isLoadingNylasStatus: false,

  fetchMembers: async (empresaId: number) => {
    set({ isLoading: true, error: null });
    try {
      // Solo traer miembros ACTIVOS (is_active=true)
      // Los miembros con is_active=false son invitaciones pendientes
      const { data, error } = await supabase
        .from('wp_team_humano')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('is_active', true)
        .is('deleted', null)
        .order('nombre', { ascending: true });

      if (error) throw error;

      set({ members: data || [], isLoading: false });
    } catch (error: any) {
      logger.error('[TeamStore] Error fetching team members:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  fetchArchivedMembers: async (empresaId: number) => {
    set({ isLoadingArchived: true, error: null });
    try {
      // Traer miembros ARCHIVADOS (is_active=false y deleted != null)
      const { data, error } = await supabase
        .from('wp_team_humano')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('is_active', false)
        .not('deleted', 'is', null)
        .order('deleted', { ascending: false });

      if (error) throw error;

      set({ archivedMembers: data || [], isLoadingArchived: false });
    } catch (error: any) {
      logger.error('[TeamStore] Error fetching archived members:', error);
      set({ error: error.message, isLoadingArchived: false });
    }
  },

  fetchSystemRoles: async (empresaId?: number | null) => {
    try {
      // Fetch global roles (enterprise_id is null) + enterprise-specific roles
      let query = supabase
        .from('system_roles')
        .select('*')
        .eq('active', true)
        .order('id', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      // Filter: global roles (null enterprise_id) or matching enterprise_id
      const filteredRoles = (data || []).filter(
        (role: SystemRole) => role.enterprise_id === null || role.enterprise_id === empresaId
      );

      set({ systemRoles: filteredRoles });
    } catch (error: any) {
      logger.error('[TeamStore] Error fetching system roles:', error);
    }
  },

  createMember: async (payload: CreateTeamMemberPayload) => {
    set({ isLoading: true, error: null });
    try {
      // Pre-validation: Check if email already exists
      if (payload.email) {
        const { data: existing } = await supabase
          .from('wp_team_humano')
          .select('id, email, is_active, deleted')
          .eq('email', payload.email.toLowerCase().trim())
          .maybeSingle();
        
        if (existing) {
          // Check if it's an archived member that could be restored
          if (!existing.is_active || existing.deleted) {
            const errorMsg = `El email "${payload.email}" pertenece a un miembro archivado. Puedes restaurarlo desde la sección de archivados.`;
            logger.warn('[TeamStore] Attempted to create member with archived email:', payload.email);
            set({ error: errorMsg, isLoading: false });
            return null;
          }
          // Active member with same email
          const errorMsg = `El email "${payload.email}" ya está registrado en el equipo.`;
          logger.warn('[TeamStore] Duplicate email attempted:', payload.email);
          set({ error: errorMsg, isLoading: false });
          return null;
        }
      }

      const { data, error } = await supabase
        .from('wp_team_humano')
        .insert([{
          ...payload,
          email: payload.email?.toLowerCase().trim() // Normalize email
        }])
        .select()
        .maybeSingle();

      if (error) {
        // Handle specific database errors with user-friendly messages
        if (error.code === '23505') {
          // Unique constraint violation
          if (error.message.includes('email')) {
            throw new Error(`El email "${payload.email}" ya está registrado. Verifica los miembros existentes o archivados.`);
          }
          throw new Error('Ya existe un registro con estos datos. Verifica la información e intenta nuevamente.');
        }
        throw error;
      }

      const newMember = data as TeamMemberProfile;
      set((state) => ({
        members: [...state.members, newMember],
        isLoading: false
      }));
      logger.info('[TeamStore] ✅ Member created successfully:', newMember.email);
      return newMember;
    } catch (error: any) {
      logger.error('[TeamStore] Error creating team member:', error);
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  updateMember: async (id: number, updates: Partial<UpdateTeamMemberPayload>) => {
    set({ isLoading: true, error: null });
    try {
      // Pre-validation: Check if email change conflicts with existing member
      if (updates.email) {
        const normalizedEmail = updates.email.toLowerCase().trim();
        const { data: existing } = await supabase
          .from('wp_team_humano')
          .select('id, email')
          .eq('email', normalizedEmail)
          .neq('id', id) // Exclude current member
          .maybeSingle();
        
        if (existing) {
          const errorMsg = `El email "${updates.email}" ya está en uso por otro miembro del equipo.`;
          logger.warn('[TeamStore] Email conflict on update:', { id, email: updates.email, conflictId: existing.id });
          set({ error: errorMsg, isLoading: false });
          return null;
        }
        // Normalize email in updates
        updates.email = normalizedEmail;
      }

      // Si is_active pasa a false → tratar como archivado (igual que deleteMember)
      if (updates.is_active === false && !updates.deleted) {
        updates.deleted = new Date().toISOString();
      }
      // Si is_active vuelve a true → limpiar deleted
      if (updates.is_active === true) {
        updates.deleted = null;
      }

      const { data, error } = await supabase
        .from('wp_team_humano')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        // Handle specific database errors
        if (error.code === '23505') {
          if (error.message.includes('email')) {
            throw new Error(`El email "${updates.email}" ya está registrado por otro usuario.`);
          }
          throw new Error('Conflicto de datos: ya existe un registro con esta información.');
        }
        throw error;
      }

      // Handle case where RLS blocked the update or member not found
      if (!data) {
        const errorMsg = 'No se pudo actualizar el miembro. Puede que no tengas permisos o el registro no existe.';
        logger.warn('[TeamStore] Update returned no data (possible RLS block):', { id });
        set({ error: errorMsg, isLoading: false });
        return null;
      }

      const updatedMember = data as TeamMemberProfile;
      set((state) => {
        // Si is_active cambió a false → mover a archivados
        if (!updatedMember.is_active) {
          const alreadyArchived = state.archivedMembers.some((m) => m.id === id);
          return {
            members: state.members.filter((m) => m.id !== id),
            archivedMembers: alreadyArchived
              ? state.archivedMembers.map((m) => (m.id === id ? updatedMember : m))
              : [updatedMember, ...state.archivedMembers],
            selectedMember: state.selectedMember?.id === id ? null : state.selectedMember,
            isLoading: false
          };
        }
        // Si is_active es true → sacar de archivados y agregar/actualizar en members
        const existsInMembers = state.members.some((m) => m.id === id);
        return {
          members: existsInMembers
            ? state.members.map((m) => (m.id === id ? updatedMember : m))
            : [...state.members, updatedMember],
          archivedMembers: state.archivedMembers.filter((m) => m.id !== id),
          selectedMember: state.selectedMember?.id === id ? updatedMember : state.selectedMember,
          isLoading: false
        };
      });
      logger.info('[TeamStore] ✅ Member updated successfully:', id);
      return updatedMember;
    } catch (error: any) {
      logger.error('[TeamStore] Error updating team member:', error);
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  deleteMember: async (id: number) => {
    set({ isLoading: true, error: null });
    logger.info('[TeamStore] Attempting to archive member:', { id });
    
    try {
      // Archive member by setting is_active to false and deleted timestamp (not hard delete)
      const { data, error } = await supabase
        .from('wp_team_humano')
        .update({ 
          is_active: false,
          deleted: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) {
        logger.error('[TeamStore] Supabase error archiving member:', error);
        throw error;
      }

      logger.info('[TeamStore] Member archived successfully:', { id, data });

      // Remover miembro del estado local (ya no aparecerá en la lista de activos)
      set((state) => ({
        members: state.members.filter((m) => m.id !== id),
        selectedMember: state.selectedMember?.id === id ? null : state.selectedMember,
        isLoading: false
      }));
      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error archiving team member:', error);
      set({ error: error.message, isLoading: false });
      return false;
    }
  },

  restoreMember: async (id: number) => {
    set({ isLoading: true, error: null });
    logger.info('[TeamStore] Attempting to restore member:', { id });
    
    try {
      // Restaurar miembro: is_active=true, deleted=null
      const { data, error } = await supabase
        .from('wp_team_humano')
        .update({ 
          is_active: true,
          deleted: null
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        logger.error('[TeamStore] Supabase error restoring member:', error);
        throw error;
      }

      logger.info('[TeamStore] Member restored successfully:', { id, data });

      const restoredMember = data as TeamMemberProfile;

      // Mover de archivados a activos
      set((state) => ({
        archivedMembers: state.archivedMembers.filter((m) => m.id !== id),
        members: [...state.members, restoredMember],
        isLoading: false
      }));
      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error restoring team member:', error);
      set({ error: error.message, isLoading: false });
      return false;
    }
  },

  previewContactTransfer: async (payload: ContactTransferPreviewPayload) => {
    set({ error: null });

    try {
      const rpcPayload = {
        p_empresa_id: payload.empresa_id,
        p_from_team_member_id: payload.from_team_member_id,
        p_to_team_member_id: payload.to_team_member_id ?? null,
        p_transfer_mode: payload.transfer_mode ?? 'single_target',
        p_eligible_team_member_ids: payload.eligible_team_member_ids ?? null
      };

      let { data, error } = await supabase.rpc('preview_transfer_contacts_between_team_members', rpcPayload);

      if (error && isMissingTransferRpcSignature(error.message, 'preview_transfer_contacts_between_team_members')) {
        const transferMode = payload.transfer_mode ?? 'single_target';

        if (transferMode === 'round_robin') {
          const compatibilityError = getTransferRpcCompatibilityError(transferMode);
          logger.error('[TeamStore] Preview transfer RPC requires new DB signature for round-robin:', error);
          set({ error: compatibilityError });
          return null;
        }

        logger.warn('[TeamStore] Preview transfer RPC new signature not available, using legacy fallback');
        set({ error: getTransferRpcCompatibilityError('single_target') });

        const legacyResponse = await supabase.rpc('preview_transfer_contacts_between_team_members', {
          p_empresa_id: payload.empresa_id,
          p_from_team_member_id: payload.from_team_member_id,
          p_to_team_member_id: payload.to_team_member_id ?? null
        });

        data = legacyResponse.data;
        error = legacyResponse.error;
      }

      if (error) {
        logger.error('[TeamStore] Error previewing contact transfer:', error);
        set({ error: error.message || 'No se pudo calcular la vista previa de transferencia' });
        return null;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return {
          principal_contacts_count: 0,
          secondary_collaborator_count: 0,
          secondary_observer_count: 0,
          target_existing_assignment_merges_count: 0,
          future_appointments_count: 0,
          eligible_team_members_count: 0,
          round_robin_distribution: []
        };
      }

      return {
        principal_contacts_count: Number(row.principal_contacts_count || 0),
        secondary_collaborator_count: Number(row.secondary_collaborator_count || 0),
        secondary_observer_count: Number(row.secondary_observer_count || 0),
        target_existing_assignment_merges_count: Number(row.target_existing_assignment_merges_count || 0),
        future_appointments_count: Number(row.future_appointments_count || 0),
        eligible_team_members_count: Number(row.eligible_team_members_count || 0),
        round_robin_distribution: parseTransferDistribution(row.round_robin_distribution)
      };
    } catch (error: any) {
      logger.error('[TeamStore] Exception previewing contact transfer:', error);
      set({ error: error.message || 'Error al calcular la vista previa de transferencia' });
      return null;
    }
  },

  transferContactsBetweenMembers: async (payload: TransferContactsBetweenMembersPayload) => {
    set({ isLoading: true, error: null });

    try {
      const rpcPayload = {
        p_empresa_id: payload.empresa_id,
        p_from_team_member_id: payload.from_team_member_id,
        p_to_team_member_id: payload.to_team_member_id ?? null,
        p_collaborator_strategy: payload.collaborator_strategy,
        p_observer_strategy: payload.observer_strategy,
        p_actor_team_member_id: payload.actor_team_member_id ?? null,
        p_transfer_mode: payload.transfer_mode ?? 'single_target',
        p_eligible_team_member_ids: payload.eligible_team_member_ids ?? null
      };

      let { data, error } = await supabase.rpc('transfer_contacts_between_team_members', rpcPayload);

      if (error && isMissingTransferRpcSignature(error.message, 'transfer_contacts_between_team_members')) {
        const transferMode = payload.transfer_mode ?? 'single_target';

        if (transferMode === 'round_robin') {
          const compatibilityError = getTransferRpcCompatibilityError(transferMode);
          logger.error('[TeamStore] Transfer RPC requires new DB signature for round-robin:', error);
          set({ error: compatibilityError, isLoading: false });
          return null;
        }

        logger.warn('[TeamStore] Transfer RPC new signature not available, using legacy fallback');
        set({ error: getTransferRpcCompatibilityError('single_target') });

        const legacyResponse = await supabase.rpc('transfer_contacts_between_team_members', {
          p_empresa_id: payload.empresa_id,
          p_from_team_member_id: payload.from_team_member_id,
          p_to_team_member_id: payload.to_team_member_id ?? null,
          p_collaborator_strategy: payload.collaborator_strategy,
          p_observer_strategy: payload.observer_strategy,
          p_actor_team_member_id: payload.actor_team_member_id ?? null
        });

        data = legacyResponse.data;
        error = legacyResponse.error;
      }

      if (error) {
        logger.error('[TeamStore] Error transferring contacts between members:', error);
        set({ error: error.message || 'No se pudo completar la transferencia de contactos', isLoading: false });
        return null;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const result: TransferContactsBetweenMembersResult = {
        principal_contacts_transferred: Number(row?.principal_contacts_transferred || 0),
        collaborator_assignments_reassigned: Number(row?.collaborator_assignments_reassigned || 0),
        collaborator_assignments_removed: Number(row?.collaborator_assignments_removed || 0),
        observer_assignments_reassigned: Number(row?.observer_assignments_reassigned || 0),
        observer_assignments_removed: Number(row?.observer_assignments_removed || 0),
        target_existing_assignment_merges: Number(row?.target_existing_assignment_merges || 0),
        future_appointment_participants_added: Number(row?.future_appointment_participants_added || 0),
        eligible_team_members_count: Number(row?.eligible_team_members_count || 0),
        round_robin_distribution: parseTransferDistribution(row?.round_robin_distribution)
      };

      logger.info('[TeamStore] ✅ Contact transfer completed:', result);
      set({ isLoading: false });
      return result;
    } catch (error: any) {
      logger.error('[TeamStore] Exception transferring contacts between members:', error);
      set({ error: error.message || 'Error al transferir contactos', isLoading: false });
      return null;
    }
  },

  setSelectedMember: (member) => set({ selectedMember: member }),

  getRoleName: (roleId: number | null | undefined) => {
    if (roleId === null || roleId === undefined) return 'Sin rol';
    const { systemRoles } = get();
    const role = systemRoles.find((r) => r.id === roleId);
    return role?.name || `Rol #${roleId}`;
  },

  canEditTeam: (userRoleId: number | null | undefined) => {
    if (userRoleId === null || userRoleId === undefined) return false;
    return ALLOWED_EDIT_ROLES.includes(userRoleId);
  },

  // ==========================================
  // INVITATION ACTIONS
  // ==========================================

  fetchInvitations: async (empresaId: number) => {
    set({ isLoadingInvitations: true });
    try {
      logger.debug('[TeamStore] Fetching invitations for empresa:', empresaId);
      
      const { data, error } = await supabase
        .from('wp_team_invitations')
        .select(`
          *,
          inviter:invited_by(nombre, apellido),
          empresa:empresa_id(nombre)
        `)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('[TeamStore] ❌ Error fetching invitations:', {
          code: error.code,
          message: error.message,
          hint: error.hint
        });
        throw error;
      }

      logger.info('[TeamStore] ✅ Invitaciones cargadas:', { count: data?.length || 0 });
      set({ invitations: data || [], isLoadingInvitations: false });
    } catch (error: any) {
      logger.error('[TeamStore] Error fetching invitations:', error);
      set({ isLoadingInvitations: false });
    }
  },

  createInvitation: async (payload: CreateInvitationPayload) => {
    set({ isLoading: true, error: null });
    try {
      const normalizedEmail = payload.email.trim().toLowerCase();
      logger.info('[TeamStore] 📨 Creando invitación:', { 
        email: normalizedEmail, 
        rol: payload.rol, 
        role_id: payload.role_id,
        empresa_id: payload.empresa_id 
      });

      // ============================================
      // RPC que crea invitación + miembro inactivo
      // SECURITY DEFINER bypassa RLS
      // Maneja: duplicados, email en otra empresa, miembros existentes
      // ============================================
      let result: any = null;

      const { data, error } = await supabase.rpc('create_team_invitation_v2', {
        p_email: normalizedEmail,
        p_rol: payload.rol,
        p_role_id: payload.role_id,
        p_empresa_id: payload.empresa_id,
        p_invited_by: payload.invited_by
      });

      if (error) {
        logger.error('[TeamStore] ❌ RPC error:', { code: error.code, message: error.message });
        
        // RPC no existe
        if (error.code === 'PGRST202' || error.message?.includes('not found')) {
          set({ error: 'Función de invitaciones no instalada. Contacta al administrador.', isLoading: false });
          return { invitation: null, inviteUrl: null };
        }
        
        // Unique constraint violation → auto-recuperar buscando la existente
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          logger.info('[TeamStore] 🔄 Duplicado detectado, buscando invitación existente...');
          const { data: existing } = await supabase
            .from('wp_team_invitations')
            .select('id, token, team_member_id')
            .eq('email', normalizedEmail)
            .eq('empresa_id', payload.empresa_id)
            .eq('status', 'pending')
            .maybeSingle();
          
          if (existing) {
            result = {
              success: true,
              message: 'Invitación pendiente existente - link regenerado',
              invitation_id: existing.id,
              invitation_token: existing.token,
              member_id: existing.team_member_id
            };
          } else {
            set({ error: 'Error temporal. Por favor intenta de nuevo.', isLoading: false });
            return { invitation: null, inviteUrl: null };
          }
        } else {
          set({ error: 'Error al crear la invitación. Intenta de nuevo.', isLoading: false });
          return { invitation: null, inviteUrl: null };
        }
      }

      // RPC returns array, get first row
      if (!result) {
        result = Array.isArray(data) ? data[0] : data;
      }
      
      logger.debug('[TeamStore] RPC result:', result);

      if (!result?.success) {
        const msg = result?.message || 'Error al crear invitación';
        logger.warn('[TeamStore] ⚠️ RPC returned success=false:', msg);
        set({ error: msg, isLoading: false });
        return { invitation: null, inviteUrl: null };
      }

      if (!result.invitation_token) {
        logger.error('[TeamStore] ❌ RPC success but no token!', result);
        set({ error: 'Error interno: no se generó token', isLoading: false });
        return { invitation: null, inviteUrl: null };
      }

      const inviteUrl = generateInviteUrl(result.invitation_token);

      // ============================================
      // Construir datos de invitación (fallback-first para evitar RLS)
      // ============================================
      const invitationData: TeamInvitation = {
        id: Number(result.invitation_id),
        token: result.invitation_token,
        email: normalizedEmail,
        rol: payload.rol,
        role_id: payload.role_id,
        empresa_id: payload.empresa_id,
        invited_by: payload.invited_by,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        team_member_id: result.member_id || null,
      };

      // Agregar al estado local (evitar duplicados)
      set((state) => ({
        invitations: state.invitations.some(i => i.id === invitationData.id)
          ? state.invitations
          : [invitationData, ...state.invitations],
        isLoading: false
      }));

      logger.info('[TeamStore] ✅ Invitación lista:', { 
        id: invitationData.id, email: normalizedEmail, inviteUrl,
        isExisting: result.message?.includes('existente')
      });

      // ============================================
      // Enviar Magic Link (silencioso - no bloquea ni muestra errores)
      // ============================================
      fetch('/api/invite/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          invitationToken: result.invitation_token,
          empresaNombre: 'Urpe AI Lab'
        })
      }).then(res => {
        if (res.ok) logger.info('[TeamStore] ✅ Magic Link enviado a:', normalizedEmail);
        else logger.warn('[TeamStore] ⚠️ Magic Link no enviado (rate limit o error) - link manual disponible');
      }).catch(() => {
        logger.warn('[TeamStore] ⚠️ Magic Link error de red - link manual disponible');
      });
      
      return { invitation: invitationData, inviteUrl };
    } catch (error: any) {
      logger.error('[TeamStore] ❌ Error creating invitation:', {
        message: error.message, code: error.code
      });
      set({ error: 'Error al crear la invitación. Intenta de nuevo.', isLoading: false });
      return { invitation: null, inviteUrl: null };
    }
  },

  cancelInvitation: async (invitationId: number) => {
    try {
      const { error } = await supabase
        .from('wp_team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      if (error) throw error;

      set((state) => ({
        invitations: state.invitations.map((inv) =>
          inv.id === invitationId ? { ...inv, status: 'cancelled' as const } : inv
        )
      }));

      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error cancelling invitation:', error);
      return false;
    }
  },

  resendInvitation: async (invitationId: number) => {
    try {
      // Extend expiration by 7 days from now
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 7);

      const { data, error } = await supabase
        .from('wp_team_invitations')
        .update({ 
          expires_at: newExpiry.toISOString(),
          status: 'pending'
        })
        .eq('id', invitationId)
        .select()
        .maybeSingle();

      if (error) throw error;

      set((state) => ({
        invitations: state.invitations.map((inv) =>
          inv.id === invitationId ? { ...inv, ...data } : inv
        )
      }));

      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error resending invitation:', error);
      return false;
    }
  },

  toggleNotetaker: async (memberId: number, enabled: boolean) => {
    logger.info('[TeamStore] Toggling Notetaker (Calendar Sync):', { memberId, enabled });
    
    try {
      // Obtener token de sesión para autenticación
      const { useAuthStore } = await import('./authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      // Llamar al endpoint que configura Calendar Sync en Nylas + actualiza BD
      const response = await fetch('/api/nylas/calendar-sync', {
        method: 'PUT',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        body: JSON.stringify({
          team_humano_id: memberId,
          enabled,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || 'Error al configurar Calendar Sync';
        logger.error('[TeamStore] ❌ Calendar Sync error:', errorMsg);
        set({ error: errorMsg });
        return false;
      }

      // Actualizar estado local del miembro
      set((state) => ({
        members: state.members.map((m) =>
          m.id === memberId ? { ...m, notetaker: enabled } : m
        ),
      }));
      
      logger.info('[TeamStore] ✅ Calendar Sync toggled:', { memberId, enabled, message: result.message });
      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error toggling Calendar Sync:', error);
      set({ error: error.message || 'Error de conexión al configurar Calendar Sync' });
      return false;
    }
  },

  // ==========================================
  // NYLAS GRANTS STATUS ACTIONS
  // ==========================================

  fetchNylasGrantsStatus: async (empresaId: number) => {
    set({ isLoadingNylasStatus: true });
    logger.info('[TeamStore] Fetching Nylas grants status for empresa:', empresaId);

    try {
      const { useAuthStore } = await import('./authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch(`/api/nylas/grants-status?empresa_id=${empresaId}`, { 
        credentials: 'include',
        headers: {
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: NylasGrantsStatusResponse = await response.json();

      if (data.success) {
        set({
          nylasGrants: data.grants,
          nylasGrantsSummary: data.summary,
          isLoadingNylasStatus: false,
        });
        logger.info('[TeamStore] ✅ Nylas grants status fetched:', data.summary);
      } else {
        throw new Error('Failed to fetch Nylas grants status');
      }
    } catch (error: any) {
      logger.error('[TeamStore] Error fetching Nylas grants status:', error);
      set({ isLoadingNylasStatus: false });
    }
  },

  getNylasStatusForMember: (memberId: number) => {
    const { nylasGrants } = get();
    return nylasGrants.find(g => g.memberId === memberId) || null;
  },

  disconnectGrant: async (memberId: number): Promise<boolean> => {
    logger.info('[TeamStore] Disconnecting grant for member:', memberId);
    try {
      const { useAuthStore } = await import('./authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch('/api/nylas/disconnect', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        body: JSON.stringify({ team_member_id: memberId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg = errorData.error || `HTTP ${response.status}`;
        set({ error: msg });
        logger.error('[TeamStore] Disconnect grant failed:', msg);
        return false;
      }

      // Actualizar miembro local
      set(state => ({
        members: state.members.map(m =>
          m.id === memberId ? { ...m, grant_id: null, notetaker: false, temporal_nylas: null } : m
        ),
        nylasGrants: state.nylasGrants.map(g =>
          g.memberId === memberId
            ? { ...g, grantId: null, status: 'not_connected' as const, scopes: [], email: undefined, provider: undefined, errorMessage: undefined, lastChecked: new Date().toISOString() }
            : g
        ),
      }));

      // Recalcular summary
      const { nylasGrants } = get();
      const summary = { total: nylasGrants.length, valid: 0, invalid: 0, notConnected: 0, errors: 0 };
      for (const g of nylasGrants) {
        switch (g.status) {
          case 'valid': summary.valid++; break;
          case 'invalid': case 'expired': summary.invalid++; break;
          case 'not_connected': summary.notConnected++; break;
          case 'error': summary.errors++; break;
        }
      }
      set({ nylasGrantsSummary: summary });

      logger.info('[TeamStore] ✅ Grant disconnected for member:', memberId);
      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Exception disconnecting grant:', error);
      set({ error: error.message || 'Error al desconectar' });
      return false;
    }
  },

  // ==========================================
  // GROUP ACTIONS
  // ==========================================

  fetchGroups: async (empresaId: number) => {
    set({ isLoadingGroups: true });

    // In-memory fallback defaults (used when DB query AND seed both fail)
    const buildFallbackGroups = (): TeamGroupConfig[] => [
      { id: -1, empresa_id: empresaId, name: 'Asesor',         slug: 'asesor',         icon: 'Users',     color: 'blue',   sort_order: 1, is_active: true, created_at: new Date().toISOString() },
      { id: -2, empresa_id: empresaId, name: 'Marketing',      slug: 'marketing',      icon: 'Target',    color: 'pink',   sort_order: 2, is_active: true, created_at: new Date().toISOString() },
      { id: -3, empresa_id: empresaId, name: 'Supervisor',     slug: 'supervisor',     icon: 'Briefcase', color: 'purple', sort_order: 3, is_active: true, created_at: new Date().toISOString() },
      { id: -4, empresa_id: empresaId, name: 'RRHH',           slug: 'rrhh',           icon: 'Heart',     color: 'red',    sort_order: 4, is_active: true, created_at: new Date().toISOString() },
      { id: -5, empresa_id: empresaId, name: 'Administrativo', slug: 'administrativo', icon: 'Shield',    color: 'amber',  sort_order: 5, is_active: true, created_at: new Date().toISOString() },
      { id: -6, empresa_id: empresaId, name: 'Operaciones',    slug: 'operaciones',    icon: 'Zap',       color: 'cyan',   sort_order: 6, is_active: true, created_at: new Date().toISOString() },
    ];

    try {
      const { data, error } = await supabase
        .from('team_groups')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        logger.warn('[TeamStore] No groups found in DB; using in-memory fallback groups');
        set({ groups: buildFallbackGroups(), isLoadingGroups: false });
        return;
      }

      set({ groups: data || [], isLoadingGroups: false });
      logger.debug('[TeamStore] Groups fetched:', { count: data?.length || 0 });
    } catch (error: any) {
      logger.error('[TeamStore] Error fetching groups:', error);
      // Fallback: use in-memory defaults so the UI never shows "No hay grupos"
      logger.warn('[TeamStore] Using in-memory fallback groups (table missing or query failed)');
      set({ groups: buildFallbackGroups(), isLoadingGroups: false });
    }
  },

  createGroup: async (empresaId: number, name: string, icon = 'Users', color = 'blue') => {
    set({ error: null });
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const { groups } = get();
      const maxSort = groups.reduce((max, g) => Math.max(max, g.sort_order), 0);

      const { data, error } = await supabase
        .from('team_groups')
        .insert([{ empresa_id: empresaId, name, slug, icon, color, sort_order: maxSort + 1 }])
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          set({ error: `El grupo "${name}" ya existe.` });
          return null;
        }
        throw error;
      }

      const newGroup = data as TeamGroupConfig;
      set((state) => ({ groups: [...state.groups, newGroup] }));
      logger.info('[TeamStore] ✅ Group created:', name);
      return newGroup;
    } catch (error: any) {
      logger.error('[TeamStore] Error creating group:', error);
      set({ error: error.message });
      return null;
    }
  },

  updateGroup: async (id: number, updates) => {
    try {
      const { error } = await supabase
        .from('team_groups')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        groups: state.groups.map(g => g.id === id ? { ...g, ...updates } : g)
      }));
      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error updating group:', error);
      set({ error: error.message });
      return false;
    }
  },

  deleteGroup: async (id: number) => {
    try {
      const { error } = await supabase
        .from('team_groups')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        groups: state.groups.filter(g => g.id !== id)
      }));
      logger.info('[TeamStore] ✅ Group deleted (soft):', id);
      return true;
    } catch (error: any) {
      logger.error('[TeamStore] Error deleting group:', error);
      set({ error: error.message });
      return false;
    }
  },
}));

// ==========================================
// STANDALONE FUNCTIONS (for use without auth)
// ==========================================

/**
 * Obtiene una invitación por su token UUID
 * Usa API Route server-side para bypasear RLS (el invitado no tiene sesión)
 * @param token - UUID de la invitación
 * @returns TeamInvitation | null
 */
export const getInvitationByToken = async (token: string): Promise<TeamInvitation | null> => {
  // Validar formato del token antes de consultar
  if (!token || !isValidInvitationToken(token)) {
    logger.warn('[TeamStore] Invalid token format:', { token: token?.substring(0, 8) + '...' });
    return null;
  }

  try {
    logger.debug('[TeamStore] Fetching invitation via API:', { token: token.substring(0, 8) + '...' });
    
    const response = await fetch(`/api/invite/verify?token=${encodeURIComponent(token)}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        logger.debug('[TeamStore] No invitation found for token');
        return null;
      }
      logger.error('[TeamStore] API error fetching invitation:', { 
        status: response.status, 
        error: errorData.error 
      });
      return null;
    }

    const { invitation } = await response.json();

    if (!invitation) {
      logger.debug('[TeamStore] No invitation in API response');
      return null;
    }

    logger.debug('[TeamStore] Invitation found:', { 
      id: invitation.id, 
      status: invitation.status,
      empresa: invitation.empresa?.nombre 
    });
    
    return invitation as TeamInvitation;
  } catch (error: any) {
    logger.error('[TeamStore] Exception fetching invitation by token:', {
      message: error.message,
      stack: error.stack?.substring(0, 200)
    });
    return null;
  }
};

/**
 * Acepta una invitación y activa el miembro del equipo
 * Usa API Route server-side para bypasear RLS
 * @param payload - Datos de aceptación
 * @returns AcceptInvitationResult
 */
export const acceptInvitation = async (payload: AcceptInvitationPayload): Promise<AcceptInvitationResult> => {
  // Validar payload con Zod
  const validation = validateAcceptInvitation(payload);
  if (!validation.success) {
    logger.warn('[TeamStore] Invalid accept invitation payload:', { error: validation.error });
    return {
      success: false,
      message: validation.error,
      member_id: null,
      empresa_id: null
    };
  }

  const validatedData = validation.data;

  try {
    logger.debug('[TeamStore] Accepting invitation via API:', { 
      token: validatedData.token.substring(0, 8) + '...',
      nombre: validatedData.nombre,
      hasAuthUid: !!validatedData.auth_uid
    });

    const response = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: validatedData.token,
        nombre: validatedData.nombre,
        apellido: validatedData.apellido,
        telefono: validatedData.telefono || null,
        auth_uid: validatedData.auth_uid || null
      })
    });

    const result = await response.json();

    if (result.success) {
      logger.info('[TeamStore] Invitation accepted successfully:', { 
        member_id: result.member_id,
        empresa_id: result.empresa_id 
      });
    } else {
      logger.warn('[TeamStore] Invitation acceptance failed:', { 
        message: result.message,
        status: response.status 
      });
    }

    return {
      success: result.success ?? false,
      message: result.message || (result.success ? 'Invitación aceptada' : 'Error desconocido'),
      member_id: result.member_id ?? null,
      empresa_id: result.empresa_id ?? null
    };

  } catch (error: any) {
    logger.error('[TeamStore] Exception accepting invitation:', {
      message: error.message,
      stack: error.stack?.substring(0, 200)
    });

    const userMessage = !navigator.onLine 
      ? 'Error de conexión. Verifica tu internet e intenta de nuevo.'
      : 'Error al procesar la invitación. Por favor intenta de nuevo.';

    return {
      success: false,
      message: userMessage,
      member_id: null,
      empresa_id: null
    };
  }
};
