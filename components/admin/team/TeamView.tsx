'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  Shield,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Loader2,
  UserPlus,
  Copy,
  RotateCcw,
  Clock,
  Calendar,
  RefreshCw,
  AlertTriangle,
  Briefcase,
  Crown,
  Tag,
  Star,
  Heart,
  Zap,
  Target,
  Award,
  CalendarOff,
  ChevronDown
} from 'lucide-react';
import { useTeamStore } from '../../../store/teamStore';
import { TeamGroupConfig } from '../../../types/team';
import { useContactStore, selectUserContext } from '../../../store/contactStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { TeamMemberModal } from './TeamMemberModal';
import { InviteTeamMemberModal } from './InviteTeamMemberModal';
import { 
  TeamMemberProfile, 
  TeamInvitation, 
  generateInviteUrl, 
  getInvitationTimeRemaining, 
  isInvitationExpired,
  NylasGrantStatus
} from '../../../types/team';
import { useAdminStore, selectGlobalTeamMemberIds } from '../../../store/adminStore';
import { usePresenceStore, selectOnlineMembers } from '../../../store/presenceStore';

// ============ Componentes Auxiliares ============

const TabButton: React.FC<{ 
  label: string; 
  count: number; 
  active: boolean; 
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap
      ${active 
        ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20' 
        : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50'
      }
    `}
  >
    <span>{label}</span>
    <span className={`text-[10px] ${active ? 'text-primary-400/70' : 'text-zinc-600'}`}>{count}</span>
  </button>
);

type TeamCalendarFilter = 'all' | 'connected' | 'issues' | 'without_calendar';

interface ActionDropdownItem {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
}

const ActionDropdown: React.FC<{
  label: string;
  icon: React.ElementType;
  items: ActionDropdownItem[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  variant?: 'default' | 'primary';
  loading?: boolean;
}> = ({
  label,
  icon: TriggerIcon,
  items,
  open,
  onToggle,
  onClose,
  variant = 'default',
  loading = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          variant === 'primary'
            ? open
              ? 'bg-primary-400 text-black'
              : 'bg-primary-500 hover:bg-primary-600 text-black'
            : open
              ? 'bg-zinc-700 border border-white/15 text-zinc-100'
              : 'bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200'
        }`}
      >
        <TriggerIcon className="w-3.5 h-3.5" />
        <span>{label}</span>
        {loading ? (
          <Loader2 className={`w-3.5 h-3.5 animate-spin ${variant === 'primary' ? 'text-black/70' : 'text-zinc-400'}`} />
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${variant === 'primary' ? 'text-black/70' : 'text-zinc-500'} ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[280px] overflow-hidden rounded-xl border border-white/10 bg-[#131316] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="max-h-[320px] overflow-y-auto p-1">
            {items.map((item) => {
              const ItemIcon = item.icon;

              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onClick();
                    onClose();
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    item.active
                      ? 'bg-primary-500/10 text-primary-300'
                      : 'text-zinc-200 hover:bg-white/[0.04]'
                  } ${item.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <div className={`mt-0.5 rounded-lg p-1.5 ${item.active ? 'bg-primary-500/15 text-primary-300' : 'bg-black/20 text-zinc-500'}`}>
                    <ItemIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{item.label}</span>
                      {item.badge && (
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                          item.active
                            ? 'border-primary-500/20 bg-primary-500/10 text-primary-300'
                            : 'border-white/10 bg-black/20 text-zinc-500'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-[11px] leading-relaxed ${item.active ? 'text-primary-300/70' : 'text-zinc-500'}`}>
                      {item.description}
                    </p>
                  </div>
                  {item.active && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const InvitationListItem: React.FC<{
  invitation: TeamInvitation;
  onCancel: () => void;
  onResend: () => void;
  canEdit: boolean;
}> = ({ invitation, onCancel, onResend, canEdit }) => {
  const [copied, setCopied] = useState(false);
  
  const getUrgencyInfo = (status: string, expiresAt: string) => {
    const isExpired = isInvitationExpired(expiresAt);
    const timeRemaining = getInvitationTimeRemaining(expiresAt);
    
    // Parse time remaining to detect urgency
    const isUrgent = !isExpired && status === 'pending' && 
      (timeRemaining.includes('hora') || timeRemaining.includes('minuto'));
    
    if (status === 'accepted') {
      return { 
        color: 'border-emerald-500/30 bg-emerald-500/10', 
        badgeColor: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
        label: 'Aceptada', 
        icon: CheckCircle2,
        urgency: 'none'
      };
    }
    if (status === 'cancelled') {
      return { 
        color: 'border-red-500/30 bg-red-500/10', 
        badgeColor: 'text-red-400 bg-red-500/20 border-red-500/30',
        label: 'Cancelada', 
        icon: XCircle,
        urgency: 'none'
      };
    }
    if (status === 'expired' || isExpired) {
      return { 
        color: 'border-zinc-500/30 bg-zinc-500/10 opacity-60', 
        badgeColor: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/30',
        label: 'Expirada', 
        icon: Clock,
        urgency: 'expired'
      };
    }
    if (isUrgent) {
      return { 
        color: 'border-red-500/40 bg-red-500/10', 
        badgeColor: 'text-red-400 bg-red-500/20 border-red-500/40 animate-pulse',
        label: 'Urgente', 
        icon: AlertTriangle,
        urgency: 'urgent'
      };
    }
    return { 
      color: 'border-amber-500/30 bg-amber-500/5', 
      badgeColor: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
      label: 'Pendiente', 
      icon: Mail,
      urgency: 'normal'
    };
  };

  const handleCopyLink = async () => {
    const url = generateInviteUrl(invitation.token);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const urgencyInfo = getUrgencyInfo(invitation.status, invitation.expires_at);
  const StatusIcon = urgencyInfo.icon;
  const isPending = invitation.status === 'pending' && !isInvitationExpired(invitation.expires_at);
  const isExpiredOrCancelled = invitation.status === 'cancelled' || invitation.status === 'expired' || isInvitationExpired(invitation.expires_at);

  return (
    <div className={`group border rounded-xl p-3 transition-all hover:shadow-lg ${urgencyInfo.color}`}>
      <div className="flex flex-col gap-2">
        {/* Fila 1: Email + Estado + Acciones */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300 border border-white/5 shrink-0">
            <Mail className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-200 truncate">{invitation.email}</p>
              <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${urgencyInfo.badgeColor}`}>
                <StatusIcon className="w-3 h-3" />
                {urgencyInfo.label}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className="text-zinc-500">Rol: <span className="text-zinc-400">{invitation.rol}</span></span>
              {isPending && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className={urgencyInfo.urgency === 'urgent' ? 'text-red-400 font-medium' : 'text-amber-400'}>
                    Expira en {getInvitationTimeRemaining(invitation.expires_at)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-1 shrink-0">
            {isPending && (
              <button
                onClick={handleCopyLink}
                className="p-1.5 text-zinc-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors"
                title={copied ? '¡Copiado!' : 'Copiar link'}
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
            {isExpiredOrCancelled && canEdit && (
              <button
                onClick={onResend}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reenviar</span>
              </button>
            )}
            {isPending && canEdit && (
              <button
                onClick={() => {
                  if (window.confirm('¿Cancelar esta invitación?')) {
                    onCancel();
                  }
                }}
                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Cancelar invitación"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Fila 2: Info adicional */}
        <div className="flex items-center gap-3 pl-[52px] text-xs text-zinc-500">
          <span>Invitado por: {(invitation.inviter as any)?.nombre || 'Sistema'} {(invitation.inviter as any)?.apellido?.charAt(0) || ''}.</span>
          <span>•</span>
          <span>{new Date(invitation.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {invitation.status === 'accepted' && invitation.accepted_at && (
            <>
              <span>•</span>
              <span className="text-emerald-400">Aceptada {new Date(invitation.accepted_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Icon options for the group icon selector
const ICON_OPTIONS: { name: string; icon: React.ElementType }[] = [
  { name: 'Users', icon: Users },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'Crown', icon: Crown },
  { name: 'Shield', icon: Shield },
  { name: 'Star', icon: Star },
  { name: 'Tag', icon: Tag },
  { name: 'Heart', icon: Heart },
  { name: 'Zap', icon: Zap },
  { name: 'Target', icon: Target },
  { name: 'Award', icon: Award },
];

const getIconComponent = (name: string): React.ElementType =>
  ICON_OPTIONS.find(i => i.name === name)?.icon || Tag;

// Static color dot map (safe for Tailwind purge)
const COLOR_DOT_MAP: Record<string, string> = {
  blue:    'bg-blue-400',
  purple:  'bg-purple-400',
  amber:   'bg-amber-400',
  emerald: 'bg-emerald-400',
  red:     'bg-red-400',
  cyan:    'bg-cyan-400',
  pink:    'bg-pink-400',
  zinc:    'bg-zinc-400',
};

// Dynamic role color from group config
const ROLE_COLOR_MAP: Record<string, string> = {
  blue:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  purple:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
  amber:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  red:     'text-red-400 bg-red-500/10 border-red-500/20',
  cyan:    'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  pink:    'text-pink-400 bg-pink-500/10 border-pink-500/20',
  zinc:    'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
};

const getDynamicRoleColor = (rol: string, groups: TeamGroupConfig[]): string => {
  const group = groups.find(g => g.slug === rol);
  if (group) return ROLE_COLOR_MAP[group.color] || ROLE_COLOR_MAP.blue;
  return ROLE_COLOR_MAP.emerald; // fallback
};

const TeamListItem: React.FC<{
  member: TeamMemberProfile;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  nylasStatus: NylasGrantStatus | null;
  groups: TeamGroupConfig[];
  isOnline: boolean;
}> = ({ member, onEdit, onDelete, canEdit, nylasStatus, groups, isOnline }) => {
  const getRoleColor = (role: string) => getDynamicRoleColor(role, groups);

  const initials = `${member.nombre.charAt(0)}${member.apellido.charAt(0)}`.toUpperCase();

  // Icono según estado de Nylas
  const getNylasIcon = () => {
    if (!nylasStatus) return null;
    switch (nylasStatus.status) {
      case 'valid':
        return <span title="Calendario conectado"><Calendar className="w-3.5 h-3.5 text-emerald-400" /></span>;
      case 'invalid':
      case 'expired':
        return <span title="Problema con calendario"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /></span>;
      case 'not_connected':
      default:
        return <span title="Sin calendario conectado"><Calendar className="w-3.5 h-3.5 text-zinc-600" /></span>;
    }
  };

  return (
    <div 
      onClick={onEdit}
      className="group flex items-center gap-3 p-3 bg-[#131316] border border-white/5 rounded-xl hover:border-primary-500/20 cursor-pointer transition-all"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 border border-white/5">
          {initials}
        </div>
        {isOnline && (
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#131316]"
            title="En línea"
          />
        )}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">{member.nombre} {member.apellido}</span>
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${getRoleColor(member.rol)}`}>
            {member.rol.toUpperCase()}
          </span>
          {member.notetaker && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border border-purple-500/20 bg-purple-500/10 text-purple-400">
              MONICA
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">{member.email}</p>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-2 shrink-0">
        {member.acepta_citas && nylasStatus?.status !== 'valid' && (
          <span title="Citas activas sin calendario válido" className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-red-500/20 bg-red-500/10 text-red-400">
            <CalendarOff className="w-3 h-3" />
            <span className="hidden sm:inline">Sin calendario</span>
          </span>
        )}
        {getNylasIcon()}
        <div className={`w-2 h-2 rounded-full ${member.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} title={member.is_active ? 'Cuenta activa' : 'Cuenta inactiva'} />
      </div>

      {/* Delete action (solo visible en hover) */}
      {canEdit && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
          title="Archivar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const ArchivedMemberItem: React.FC<{ 
  member: TeamMemberProfile; 
  onRestore: () => void;
  canEdit: boolean;
  getRoleName: (roleId: number | null | undefined) => string;
  groups: TeamGroupConfig[];
}> = ({ member, onRestore, canEdit, getRoleName, groups }) => {
  const getRoleColor = (role: string) => getDynamicRoleColor(role, groups);

  const initials = `${member.nombre.charAt(0)}${member.apellido.charAt(0)}`.toUpperCase();
  const systemRoleName = getRoleName(member.role_id);
  const deletedDate = member.deleted ? new Date(member.deleted).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) : null;

  return (
    <div className="group bg-[#131316] border border-white/5 rounded-xl p-3 opacity-60 hover:opacity-100 transition-opacity">
      <div className="flex flex-col gap-2 @container">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 border border-white/5 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-400 truncate">{member.nombre} {member.apellido}</h3>
              <div className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border opacity-50 ${getRoleColor(member.rol)}`}>
                {member.rol.toUpperCase()}
              </div>
            </div>
            <p className="text-xs text-zinc-600 truncate mt-0.5">{member.email}</p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {deletedDate && (
              <span className="text-xs text-zinc-600 hidden sm:inline">
                Archivado: {deletedDate}
              </span>
            )}
            {canEdit && (
              <button 
                onClick={onRestore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-colors"
                title="Restaurar miembro"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Restaurar</span>
              </button>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 pl-12 text-xs text-zinc-500">
          {member.telefono && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-zinc-700" />
              <span>{member.telefono}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800/60 border border-white/5">
            <Shield className="w-3 h-3 text-zinc-600" />
            <span className="text-zinc-600">{member.role_id || '?'}</span>
            <span className="text-zinc-500">{systemRoleName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ Componente Principal ============

export const TeamView: React.FC = () => {
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const onlineMembers = usePresenceStore(selectOnlineMembers);
  const { 
    members, 
    archivedMembers,
    invitations,
    groups,
    isLoading, 
    isLoadingArchived,
    isLoadingInvitations,
    isLoadingGroups,
    fetchMembers, 
    fetchArchivedMembers,
    fetchSystemRoles,
    fetchInvitations,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    error: storeError,
    cancelInvitation,
    resendInvitation,
    deleteMember,
    restoreMember,
    canEditTeam, 
    getRoleName,
    // Nylas Grants Status
    nylasGrantsSummary,
    isLoadingNylasStatus,
    fetchNylasGrantsStatus,
    getNylasStatusForMember
  } = useTeamStore();
  
  // Permission check: only role_id 1, 2, 3 can edit/delete
  const canEdit = canEditTeam(userContext?.roleId);
  
  // Engagement tracking
  usePageTracking('team');
  const trackAction = useActionTracking('team');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarFilter, setCalendarFilter] = useState<TeamCalendarFilter>('all');
  const [openActionMenu, setOpenActionMenu] = useState<'calendars' | 'invite' | 'create' | null>(null);
  const [memberToEdit, setMemberToEdit] = useState<TeamMemberProfile | null>(null);
  const [startDeactivationFlow, setStartDeactivationFlow] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'archived' | 'groups'>('members');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('blue');
  const [newGroupIcon, setNewGroupIcon] = useState('Users');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; color: string; icon: string }>({ name: '', color: '', icon: '' });
  const [groupError, setGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchMembers(selectedEnterpriseId);
      fetchSystemRoles(selectedEnterpriseId);
      fetchInvitations(selectedEnterpriseId);
      fetchArchivedMembers(selectedEnterpriseId);
      fetchGroups(selectedEnterpriseId);
      // Verificar estado de Nylas grants
      fetchNylasGrantsStatus(selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, fetchMembers, fetchSystemRoles, fetchInvitations, fetchArchivedMembers, fetchGroups, fetchNylasGrantsStatus]);

  const handleRefreshNylasStatus = () => {
    if (selectedEnterpriseId) {
      fetchNylasGrantsStatus(selectedEnterpriseId);
      trackAction('team.refresh_nylas_status');
    }
  };

  const handleCreate = () => {
    setMemberToEdit(null);
    setStartDeactivationFlow(false);
    setIsModalOpen(true);
    trackAction('team.add_member_click');
  };

  const handleEdit = (member: TeamMemberProfile) => {
    setMemberToEdit(member);
    setStartDeactivationFlow(false);
    setIsModalOpen(true);
    trackAction('team.edit_member_click', { memberId: member.id });
  };

  const handleDelete = async (member: TeamMemberProfile) => {
    if (window.confirm('¿Estás seguro de que deseas archivar este miembro?')) {
      setMemberToEdit(member);
      setStartDeactivationFlow(true);
      setIsModalOpen(true);
      trackAction('team.deactivate_member_flow_open', { memberId: member.id });
    }
  };

  const handleCloseMemberModal = () => {
    setIsModalOpen(false);
    setStartDeactivationFlow(false);
    setMemberToEdit(null);
  };

  const handleRestore = async (id: number) => {
    if (window.confirm('¿Restaurar este miembro al equipo activo?')) {
      const success = await restoreMember(id);
      if (success) {
        trackAction('team.restore_member_success', { memberId: id });
      } else {
        alert('Error al restaurar el miembro. Revisa la consola para más detalles.');
      }
    }
  };

  const handleCreateGroup = async () => {
    const trimmedName = newGroupName.trim();
    if (!selectedEnterpriseId || !trimmedName) return;

    setIsCreatingGroup(true);
    setGroupError(null);

    const created = await createGroup(selectedEnterpriseId, trimmedName, newGroupIcon, newGroupColor);
    if (!created) {
      setGroupError(useTeamStore.getState().error || 'No se pudo crear el grupo.');
    } else {
      setNewGroupName('');
      setNewGroupColor('blue');
      setNewGroupIcon('Users');
    }

    setIsCreatingGroup(false);
  };

  const handleStartEdit = (group: TeamGroupConfig) => {
    setEditingGroupId(group.id);
    setEditForm({
      name: group.name,
      color: group.color,
      icon: group.icon
    });
    setGroupError(null);
  };

  const handleSaveEdit = async (group: TeamGroupConfig) => {
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      setGroupError('El nombre del grupo es obligatorio.');
      return;
    }

    const success = await updateGroup(group.id, {
      name: trimmedName,
      color: editForm.color,
      icon: editForm.icon
    });

    if (!success) {
      setGroupError(useTeamStore.getState().error || 'No se pudo actualizar el grupo.');
      return;
    }

    setEditingGroupId(null);
    setGroupError(null);
  };

  const handleDeleteGroup = async (group: TeamGroupConfig) => {
    const memberCount = members.filter(member => member.rol === group.slug).length;
    if (memberCount > 0) {
      setGroupError(`No se puede eliminar "${group.name}" porque tiene ${memberCount} miembro(s) asignado(s).`);
      return;
    }

    if (!window.confirm(`¿Eliminar el grupo "${group.name}"?`)) {
      return;
    }

    const success = await deleteGroup(group.id);
    if (!success) {
      setGroupError(useTeamStore.getState().error || 'No se pudo eliminar el grupo.');
      return;
    }

    if (editingGroupId === group.id) {
      setEditingGroupId(null);
    }
    setGroupError(null);
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const hasGlobalTeamFilter = globalTeamMemberIds.length > 0;

  const filteredMembers = members.filter((member) => {
    if (hasGlobalTeamFilter && !globalTeamMemberIds.includes(member.id)) {
      return false;
    }

    const haystack = `${member.nombre} ${member.apellido} ${member.email}`.toLowerCase();
    if (normalizedSearchQuery && !haystack.includes(normalizedSearchQuery)) {
      return false;
    }

    const nylasStatus = getNylasStatusForMember(member.id);

    if (calendarFilter === 'connected') {
      return nylasStatus?.status === 'valid';
    }

    if (calendarFilter === 'issues') {
      return !!member.grant_id && nylasStatus?.status !== 'valid' && nylasStatus?.status !== undefined;
    }

    if (calendarFilter === 'without_calendar') {
      return !member.grant_id || nylasStatus?.status === 'not_connected' || nylasStatus?.status === undefined;
    }

    return true;
  });

  const filteredInvitations = invitations.filter((invitation) => {
    if (!normalizedSearchQuery) return true;
    const haystack = `${invitation.email} ${invitation.rol} ${invitation.status}`.toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  });

  const filteredArchivedMembers = archivedMembers.filter((member) => {
    if (!normalizedSearchQuery) return true;
    const haystack = `${member.nombre} ${member.apellido} ${member.email}`.toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  });

  const filteredGroupsList = groups.filter((group) => {
    if (!normalizedSearchQuery) return true;
    return group.name.toLowerCase().includes(normalizedSearchQuery);
  });

  const pendingInvitations = invitations.filter(
    invitation => invitation.status === 'pending' && !isInvitationExpired(invitation.expires_at)
  ).length;

  const selectedCalendarLabel = calendarFilter === 'connected'
    ? 'Conectados'
    : calendarFilter === 'issues'
      ? 'Con problemas'
      : calendarFilter === 'without_calendar'
        ? 'Sin calendario'
        : 'Todos';

  const searchPlaceholder = activeTab === 'members'
    ? 'Buscar miembro por nombre o email...'
    : activeTab === 'invitations'
      ? 'Buscar invitación por email, grupo o estado...'
      : activeTab === 'archived'
        ? 'Buscar archivado por nombre o email...'
        : 'Buscar grupo por nombre...';

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Equipo</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Administra miembros, calendarios, invitaciones y grupos de la empresa actual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshNylasStatus}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 transition-colors"
          >
            {isLoadingNylasStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refrescar calendarios
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invitar
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo miembro
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-4 space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <TabButton label="Miembros" count={members.length} active={activeTab === 'members'} onClick={() => setActiveTab('members')} />
            <TabButton label="Invitaciones" count={pendingInvitations} active={activeTab === 'invitations'} onClick={() => setActiveTab('invitations')} />
            <TabButton label="Archivados" count={archivedMembers.length} active={activeTab === 'archived'} onClick={() => setActiveTab('archived')} />
            {canEdit && (
              <TabButton label="Grupos" count={groups.length} active={activeTab === 'groups'} onClick={() => setActiveTab('groups')} />
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {activeTab === 'members' && calendarFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCalendarFilter('all')}
                className="px-2.5 py-1.5 rounded-lg border border-primary-500/20 bg-primary-500/10 text-xs text-primary-300 hover:bg-primary-500/15 transition-colors"
              >
                Calendario: {selectedCalendarLabel}
              </button>
            )}

            <div className="relative min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-[#131316] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="text-xs text-zinc-500 px-1">
          {activeTab === 'members'
            ? (() => {
                const onlineCount = onlineMembers.size;
                const base = hasSearchQuery || hasGlobalTeamFilter
                  ? `Mostrando ${filteredMembers.length} de ${members.length} miembros.`
                  : `Mostrando ${filteredMembers.length} miembros del equipo.`;
                return onlineCount > 0 ? `${base} ${onlineCount} en línea.` : base;
              })()
            : activeTab === 'invitations'
              ? 'Gestiona invitaciones activas, expiradas o canceladas.'
              : activeTab === 'archived'
                ? 'Revisa miembros archivados y restáuralos si es necesario.'
                : 'Administra grupos organizativos visibles en la empresa.'}
        </div>

        {activeTab === 'members' && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No hay miembros activos</p>
                <p className="text-sm text-zinc-600 mt-1">Crea o invita miembros para empezar a operar el equipo.</p>
                {canEdit && (
                  <button
                    onClick={handleCreate}
                    className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors"
                  >
                    Crear miembro
                  </button>
                )}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <Search className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No se encontraron miembros</p>
                <p className="text-sm text-zinc-600 mt-1">
                  {hasSearchQuery && hasGlobalTeamFilter
                    ? `No hay resultados para "${searchQuery}" con el filtro general actual.`
                    : hasSearchQuery
                      ? `No hay resultados para "${searchQuery}".`
                      : hasGlobalTeamFilter
                        ? 'No hay miembros que coincidan con el filtro general actual.'
                        : 'No hay miembros disponibles.'}
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCalendarFilter('all');
                  }}
                  className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  {hasSearchQuery ? 'Limpiar búsqueda' : 'Limpiar calendario'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((member) => (
                  <TeamListItem
                    key={member.id}
                    member={member}
                    onEdit={() => handleEdit(member)}
                    onDelete={() => handleDelete(member)}
                    canEdit={canEdit}
                    nylasStatus={getNylasStatusForMember(member.id)}
                    groups={groups}
                    isOnline={onlineMembers.has(member.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'invitations' && (
          // Tab: Invitaciones
          <>
            {isLoadingInvitations ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              </div>
            ) : invitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <UserPlus className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No hay invitaciones</p>
                <p className="text-sm text-zinc-600 mt-1">Las invitaciones enviadas aparecerán aquí</p>
                {canEdit && (
                  <button
                    onClick={() => setIsInviteModalOpen(true)}
                    className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors"
                  >
                    Invitar miembro
                  </button>
                )}
              </div>
            ) : filteredInvitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <Search className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No se encontraron invitaciones</p>
                <p className="text-sm text-zinc-600 mt-1">Ajusta o limpia la búsqueda actual.</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredInvitations.map((invitation) => (
                  <InvitationListItem
                    key={invitation.id}
                    invitation={invitation}
                    onCancel={() => cancelInvitation(invitation.id)}
                    onResend={() => resendInvitation(invitation.id)}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'archived' && (
          // Tab: Archivados
          <>
            {isLoadingArchived ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              </div>
            ) : archivedMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <Trash2 className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No hay miembros archivados</p>
                <p className="text-sm text-zinc-600 mt-1">Los miembros eliminados aparecerán aquí</p>
                <button
                  onClick={() => setActiveTab('members')}
                  className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Ver activos
                </button>
              </div>
            ) : filteredArchivedMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <Search className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No se encontraron archivados</p>
                <p className="text-sm text-zinc-600 mt-1">Ajusta o limpia la búsqueda actual.</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredArchivedMembers.map((member) => (
                  <ArchivedMemberItem 
                    key={member.id} 
                    member={member} 
                    onRestore={() => handleRestore(member.id)}
                    canEdit={canEdit}
                    getRoleName={getRoleName}
                    groups={groups}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'groups' && (
          // Tab: Grupos
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">
              Define los grupos de tu equipo. Los miembros se asignan a un grupo al crear o editar su perfil.
            </p>

            {/* Error feedback */}
            {groupError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {groupError}
                <button onClick={() => setGroupError(null)} className="ml-auto p-0.5 hover:text-red-300"><XCircle className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Create new group */}
            <div className="p-4 bg-[#131316] border border-white/5 rounded-xl space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Nuevo grupo</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value.slice(0, 30))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); }}
                    placeholder="Ej: Closer, SDR, Marketing..."
                    maxLength={30}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Color</label>
                  <select
                    value={newGroupColor}
                    onChange={(e) => setNewGroupColor(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none appearance-none cursor-pointer"
                  >
                    <option value="blue">Azul</option>
                    <option value="purple">Morado</option>
                    <option value="amber">Ámbar</option>
                    <option value="emerald">Verde</option>
                    <option value="red">Rojo</option>
                    <option value="cyan">Cyan</option>
                    <option value="pink">Rosa</option>
                  </select>
                </div>
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim() || isCreatingGroup}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-black text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Crear
                </button>
              </div>
              {/* Icon selector grid */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Icono</label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map(opt => {
                    const IconComp = opt.icon;
                    const isSelected = newGroupIcon === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => setNewGroupIcon(opt.name)}
                        className={`p-2 rounded-lg border transition-colors ${
                          isSelected
                            ? 'border-primary-500/50 bg-primary-500/10 text-primary-400'
                            : 'border-white/5 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                        }`}
                        title={opt.name}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Group list */}
            {isLoadingGroups ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No hay grupos configurados.</p>
            ) : filteredGroupsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  <Search className="w-6 h-6 text-zinc-600" />
                </div>
                <p className="text-zinc-400 font-medium">No se encontraron grupos</p>
                <p className="text-sm text-zinc-600 mt-1">Intenta con otro nombre o limpia la búsqueda.</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredGroupsList.map(g => {
                  const count = members.filter(m => m.rol === g.slug).length;
                  const GIcon = getIconComponent(g.icon);
                  const isEditing = editingGroupId === g.id;

                  if (isEditing) {
                    return (
                      <div key={g.id} className="p-3 bg-[#131316] border border-primary-500/20 rounded-xl space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value.slice(0, 30) }))}
                            maxLength={30}
                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:border-primary-500/50 outline-none"
                          />
                          <select
                            value={editForm.color}
                            onChange={(e) => setEditForm(f => ({ ...f, color: e.target.value }))}
                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 outline-none appearance-none cursor-pointer"
                          >
                            <option value="blue">Azul</option>
                            <option value="purple">Morado</option>
                            <option value="amber">Ámbar</option>
                            <option value="emerald">Verde</option>
                            <option value="red">Rojo</option>
                            <option value="cyan">Cyan</option>
                            <option value="pink">Rosa</option>
                          </select>
                          <button onClick={() => handleSaveEdit(g)} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Guardar">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingGroupId(null)} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors" title="Cancelar">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Icon selector for edit */}
                        <div className="flex flex-wrap gap-1.5">
                          {ICON_OPTIONS.map(opt => {
                            const IC = opt.icon;
                            const isSel = editForm.icon === opt.name;
                            return (
                              <button
                                key={opt.name}
                                onClick={() => setEditForm(f => ({ ...f, icon: opt.name }))}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  isSel
                                    ? 'border-primary-500/50 bg-primary-500/10 text-primary-400'
                                    : 'border-white/5 bg-black/20 text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                <IC className="w-3.5 h-3.5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={g.id} className="flex items-center gap-3 p-3 bg-[#131316] border border-white/5 rounded-xl hover:border-white/10 transition-colors">
                      <div className={`w-3 h-3 rounded-full ${COLOR_DOT_MAP[g.color] || COLOR_DOT_MAP.blue}`} />
                      <GIcon className="w-4 h-4 text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-200 flex-1">{g.name}</span>
                      <span className="text-xs text-zinc-500">{count} miembro{count !== 1 ? 's' : ''}</span>
                      <button
                        onClick={() => handleStartEdit(g)}
                        className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
                        title="Editar grupo"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g)}
                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title={count > 0 ? 'No se puede eliminar (tiene miembros)' : 'Eliminar grupo'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <TeamMemberModal 
        isOpen={isModalOpen} 
        onClose={handleCloseMemberModal}
        memberToEdit={memberToEdit}
        startDeactivationFlow={startDeactivationFlow}
      />

      <InviteTeamMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </div>
  );
};
