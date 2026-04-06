'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  ArrowRightLeft,
  Briefcase, 
  Clock, 
  Calendar, 
  Shield, 
  Save, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Bot,
  Video,
  CalendarOff,
  Link2,
  Unlink,
  RefreshCw,
  Chrome,
  Building2
} from 'lucide-react';
import { CreateTeamMemberPayload, TeamMemberProfile, UpdateTeamMemberPayload } from '../../../types/team';
import { useTeamStore } from '../../../store/teamStore';
import { useContactStore } from '../../../store/contactStore';
import { Key } from 'lucide-react';
import { GroupSelector } from './GroupSelector';
import { TransferContactsBetweenMembersModal } from './TransferContactsBetweenMembersModal';

interface TeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberToEdit?: TeamMemberProfile | null;
  startDeactivationFlow?: boolean;
}

const PRIORITIES = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' }
];

export const TeamMemberModal: React.FC<TeamMemberModalProps> = ({ 
  isOpen, 
  onClose, 
  memberToEdit,
  startDeactivationFlow = false
}) => {
  const createMember = useTeamStore(state => state.createMember);
  const updateMember = useTeamStore(state => state.updateMember);
  const toggleNotetaker = useTeamStore(state => state.toggleNotetaker);
  const isLoading = useTeamStore(state => state.isLoading);
  const storeError = useTeamStore(state => state.error);
  const systemRoles = useTeamStore(state => state.systemRoles);
  const groups = useTeamStore(state => state.groups);
  const fetchGroups = useTeamStore(state => state.fetchGroups);
  const isLoadingGroups = useTeamStore(state => state.isLoadingGroups);
  const getNylasStatusForMember = useTeamStore(state => state.getNylasStatusForMember);
  const disconnectGrant = useTeamStore(state => state.disconnectGrant);

  // Nylas calendar status for the member being edited
  const nylasStatus = memberToEdit ? getNylasStatusForMember(memberToEdit.id) : null;
  const hasValidCalendar = !!memberToEdit?.grant_id && nylasStatus?.status === 'valid';
  const hasCalendarIssue = !!memberToEdit?.grant_id && nylasStatus?.status !== 'valid' && nylasStatus?.status !== undefined;
  const noCalendar = !memberToEdit?.grant_id;
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const currentUserId = useContactStore(state => state.userContext?.id);
  const userRoleId = useContactStore(state => state.userContext?.roleId);
  const isEditingSelf = memberToEdit ? memberToEdit.id === currentUserId : false;
  const canTransferContacts = !!memberToEdit && !!selectedEnterpriseId && (userRoleId === 1 || userRoleId === 2);
  
  const [isTogglingNotetaker, setIsTogglingNotetaker] = useState(false);
  const [notetakerError, setNotetakerError] = useState<string | null>(null);
  const [notetakerEnabled, setNotetakerEnabled] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [pendingDeactivationAfterTransfer, setPendingDeactivationAfterTransfer] = useState(false);

  // Nylas disconnect state
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<CreateTeamMemberPayload & { acepta_citas?: boolean; duracion_cita_minutos?: number }>>({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    rol: 'asesor',
    especialidad: '',
    prioridad: 'media',
    is_active: true,
    timezone: 'America/Bogota',
    role_id: 3,
    acepta_citas: false,
    duracion_cita_minutos: 30
  });

  const [error, setError] = useState<string | null>(null);

  // Fetch groups when modal opens
  useEffect(() => {
    if (isOpen && selectedEnterpriseId) {
      fetchGroups(selectedEnterpriseId);
    }
  }, [isOpen, selectedEnterpriseId, fetchGroups]);

  // Sync rol to first available group when groups load (new member only)
  useEffect(() => {
    if (!memberToEdit && groups.length > 0 && !groups.some(g => g.slug === formData.rol)) {
      setFormData(prev => ({ ...prev, rol: groups[0].slug }));
    }
  }, [groups, memberToEdit]);

  useEffect(() => {
    if (memberToEdit) {
      setFormData({
        nombre: memberToEdit.nombre,
        apellido: memberToEdit.apellido,
        email: memberToEdit.email,
        telefono: memberToEdit.telefono || '',
        rol: memberToEdit.rol,
        especialidad: memberToEdit.especialidad || '',
        prioridad: memberToEdit.prioridad || 'media',
        is_active: memberToEdit.is_active,
        timezone: memberToEdit.timezone || 'America/Bogota',
        role_id: memberToEdit.role_id || 3,
        acepta_citas: memberToEdit.acepta_citas || false,
        duracion_cita_minutos: memberToEdit.duracion_cita_minutos || 30
      });
      setNotetakerEnabled(!!memberToEdit.notetaker);
    } else {
      // Reset for new member
      setFormData({
        nombre: '',
        apellido: '',
        email: '',
        telefono: '',
        rol: 'asesor',
        especialidad: '',
        prioridad: 'media',
        is_active: true,
        timezone: 'America/Bogota',
        role_id: 3,
        acepta_citas: false,
        duracion_cita_minutos: 30
      });
      setNotetakerEnabled(false);
    }
    setError(null);
    setNotetakerError(null);
    setPendingDeactivationAfterTransfer(false);
  }, [memberToEdit, isOpen]);

  useEffect(() => {
    if (!isOpen || !memberToEdit || !startDeactivationFlow) return;

    setFormData(prev => ({ ...prev, is_active: false }));

    if (memberToEdit.is_active && canTransferContacts) {
      setPendingDeactivationAfterTransfer(true);
      setIsTransferModalOpen(true);
    }
  }, [isOpen, memberToEdit, startDeactivationFlow, canTransferContacts]);

  useEffect(() => {
    if (!isOpen) {
      setIsTransferModalOpen(false);
      setPendingDeactivationAfterTransfer(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const persistMemberChanges = async () => {
    try {
      let result: TeamMemberProfile | null = null;

      if (memberToEdit) {
        result = await updateMember(memberToEdit.id, formData as UpdateTeamMemberPayload);
      } else {
        result = await createMember({
          ...formData,
          empresa_id: selectedEnterpriseId,
          enterprise_id: selectedEnterpriseId
        } as CreateTeamMemberPayload);
      }

      if (result) {
        return result;
      }

      setTimeout(() => {
        const currentError = useTeamStore.getState().error;
        if (currentError) {
          setError(currentError);
        } else {
          setError('Error al guardar los cambios. Por favor intenta de nuevo.');
        }
      }, 100);

      return null;
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!selectedEnterpriseId) {
      setError('No hay empresa seleccionada');
      return;
    }

    if (!formData.nombre || !formData.apellido || !formData.email || !formData.rol) {
      setError('Por favor complete los campos obligatorios');
      return;
    }

    const shouldTransferBeforeDeactivation = !!memberToEdit
      && memberToEdit.is_active
      && formData.is_active === false
      && canTransferContacts;

    if (shouldTransferBeforeDeactivation) {
      setPendingDeactivationAfterTransfer(true);
      setIsTransferModalOpen(true);
      return;
    }

    const result = await persistMemberChanges();
    if (result) {
      onClose();
    }
  };

  const handleTransferClose = () => {
    setIsTransferModalOpen(false);
    setPendingDeactivationAfterTransfer(false);
  };

  const handleTransferSuccess = () => {
    if (!pendingDeactivationAfterTransfer) {
      setIsTransferModalOpen(false);
      return;
    }

    void (async () => {
      const result = await persistMemberChanges();

      setIsTransferModalOpen(false);
      setPendingDeactivationAfterTransfer(false);

      if (result) {
        onClose();
      }
    })();
  };

  return (
    <>
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#131316]">
          <div>
            <h2 className="text-lg font-semibold text-zinc-200">
              {memberToEdit ? 'Editar Miembro' : 'Nuevo Miembro del Equipo'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {memberToEdit ? 'Modifica los datos del usuario' : 'Registra un nuevo usuario en la empresa'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-400">{error}</div>
            </div>
          )}

          <form id="team-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary-400 uppercase tracking-wider">
                <User className="w-4 h-4" />
                Información Personal
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Nombre *</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                    className="w-full bg-[#131316] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                    placeholder="Ej. Juan"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Apellido *</label>
                  <input
                    type="text"
                    value={formData.apellido}
                    onChange={(e) => setFormData(prev => ({ ...prev, apellido: e.target.value }))}
                    className="w-full bg-[#131316] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                    placeholder="Ej. Pérez"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Email *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full bg-[#131316] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                      placeholder="juan@empresa.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Teléfono</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                      className="w-full bg-[#131316] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                      placeholder="+51 999 999 999"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Role & Config */}
            <div className="space-y-4 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 text-sm font-medium text-primary-400 uppercase tracking-wider">
                <Shield className="w-4 h-4" />
                Rol y Configuración
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Grupo *</label>
                  <GroupSelector
                    value={formData.rol || ''}
                    onChange={(slug) => setFormData(prev => ({ ...prev, rol: slug }))}
                    empresaId={selectedEnterpriseId}
                  />
                </div>

                {/* System Role ID Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Rol de Permisos 🔒 *</label>
                  <div className="relative">
                    <select
                      value={formData.role_id || 3}
                      onChange={(e) => setFormData(prev => ({ ...prev, role_id: parseInt(e.target.value, 10) }))}
                      className="w-full bg-[#131316] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none appearance-none cursor-pointer transition-colors"
                    >
                      {systemRoles.length > 0 ? (
                        systemRoles
                          .filter(role => role.id !== 1)
                          .map(role => (
                            <option key={role.id} value={role.id}>
                              {role.id} - {role.name}
                            </option>
                          ))
                      ) : (
                        <>
                          <option value={2}>2 - Admin</option>
                          <option value={3}>3 - Asesor</option>
                          <option value={4}>4 - Supervisor</option>
                        </>
                      )}
                    </select>
                    <Key className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-zinc-600">Determina los permisos del usuario en el sistema</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Prioridad de Asignación</label>
                  <div className="relative">
                    <select
                      value={formData.prioridad}
                      onChange={(e) => setFormData(prev => ({ ...prev, prioridad: e.target.value }))}
                      className="w-full bg-[#131316] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none appearance-none cursor-pointer transition-colors"
                    >
                      {PRIORITIES.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <CheckCircle2 className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Especialidad</label>
                  <input
                    type="text"
                    value={formData.especialidad}
                    onChange={(e) => setFormData(prev => ({ ...prev, especialidad: e.target.value }))}
                    className="w-full bg-[#131316] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                    placeholder="Ej. Ventas, Soporte, Técnico"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Zona Horaria</label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formData.timezone}
                      onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-full bg-[#131316] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                      placeholder="America/Bogota"
                    />
                  </div>
                </div>

                {/* Active Toggle */}
                <div className="col-span-1 md:col-span-2 pt-2">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-[#131316] cursor-pointer hover:border-white/10 transition-colors">
                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.is_active ? 'bg-primary-500' : 'bg-zinc-700'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-zinc-200">Usuario Activo</div>
                      <div className="text-xs text-zinc-500">Permitir acceso y asignación de tareas</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Integraciones — Conectar/Desconectar Nylas */}
            {memberToEdit && (
              <div className="space-y-4 pt-2 border-t border-white/5">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-400 uppercase tracking-wider">
                  <Link2 className="w-4 h-4" />
                  Integraciones
                </div>

                {/* Estado: Conectado válido */}
                {hasValidCalendar && nylasStatus && (
                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-emerald-300">Conectado</span>
                          {nylasStatus.provider && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">{nylasStatus.provider}</span>
                          )}
                        </div>
                        {nylasStatus.email && (
                          <p className="text-xs text-zinc-400 truncate">{nylasStatus.email}</p>
                        )}
                        {nylasStatus.scopes && nylasStatus.scopes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {nylasStatus.scopes.some(s => s.includes('calendar')) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Calendar className="w-2.5 h-2.5 inline mr-0.5" />Calendario
                              </span>
                            )}
                            {nylasStatus.scopes.some(s => s.includes('gmail') || s.includes('mail') || s.includes('Mail')) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Mail className="w-2.5 h-2.5 inline mr-0.5" />Email
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acciones: Reconectar (solo propio) / Desconectar (admin) */}
                    <div className="flex items-center gap-2 pt-1">
                      {isEditingSelf && (
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = `/api/nylas/auth?team_member_id=${memberToEdit.id}&provider=${nylasStatus.provider || 'google'}&redirect_after=${encodeURIComponent(window.location.pathname)}`;
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reconectar
                        </button>
                      )}
                      {!showDisconnectConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowDisconnectConfirm(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                        >
                          <Unlink className="w-3 h-3" />
                          Desconectar
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDisconnecting}
                            onClick={async () => {
                              setIsDisconnecting(true);
                              setDisconnectError(null);
                              const ok = await disconnectGrant(memberToEdit.id);
                              if (!ok) {
                                setDisconnectError(useTeamStore.getState().error || 'Error al desconectar');
                              }
                              setIsDisconnecting(false);
                              setShowDisconnectConfirm(false);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                          >
                            {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDisconnectConfirm(false)}
                            className="px-2.5 py-1.5 text-xs rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                    {disconnectError && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">{disconnectError}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Estado: Grant inválido / expirado */}
                {hasCalendarIssue && nylasStatus && (
                  <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-amber-300">Conexión inválida</span>
                        {nylasStatus.email && (
                          <p className="text-xs text-zinc-400 truncate">{nylasStatus.email} ({nylasStatus.provider || 'desconocido'})</p>
                        )}
                        <p className="text-xs text-amber-400/70 mt-0.5">Necesita reconexión para restaurar acceso a calendario y email.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {isEditingSelf && (
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = `/api/nylas/auth?team_member_id=${memberToEdit.id}&provider=${nylasStatus.provider || 'google'}&redirect_after=${encodeURIComponent(window.location.pathname)}`;
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reconectar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isDisconnecting}
                        onClick={async () => {
                          setIsDisconnecting(true);
                          setDisconnectError(null);
                          const ok = await disconnectGrant(memberToEdit.id);
                          if (!ok) {
                            setDisconnectError(useTeamStore.getState().error || 'Error al desconectar');
                          }
                          setIsDisconnecting(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-50"
                      >
                        {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                        Desconectar
                      </button>
                    </div>
                    {disconnectError && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">{disconnectError}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Estado: Sin conectar */}
                {noCalendar && (
                  <div className="p-4 rounded-xl border border-zinc-700/50 bg-zinc-800/30 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-700/30 flex items-center justify-center shrink-0">
                        <CalendarOff className="w-5 h-5 text-zinc-500" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-zinc-300">Sin cuenta conectada</span>
                        <p className="text-xs text-zinc-500">
                          {isEditingSelf
                            ? 'Conecta tu cuenta de Google o Microsoft para sincronizar calendario y emails.'
                            : 'Este miembro debe conectar su propia cuenta desde su perfil (Configuración > Integraciones).'
                          }
                        </p>
                      </div>
                    </div>
                    {isEditingSelf && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = `/api/nylas/auth?team_member_id=${memberToEdit.id}&provider=google&redirect_after=${encodeURIComponent(window.location.pathname)}`;
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-white hover:bg-zinc-100 text-zinc-800 transition-colors shadow-sm"
                        >
                          <Chrome className="w-3.5 h-3.5" />
                          Conectar Google
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = `/api/nylas/auth?team_member_id=${memberToEdit.id}&provider=microsoft&redirect_after=${encodeURIComponent(window.location.pathname)}`;
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white transition-colors"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          Conectar Microsoft
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Monica AI - Solo si tiene calendario conectado */}
            {memberToEdit && hasValidCalendar && (
              <div className="space-y-4 pt-2 border-t border-white/5">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-400 uppercase tracking-wider">
                  <Bot className="w-4 h-4" />
                  Monica AI
                </div>
                <div className="space-y-2">
                  <label className="flex items-start gap-4 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 cursor-pointer hover:border-purple-500/30 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-zinc-200">Monica sube a la llamada</h4>
                      <p className="text-xs text-zinc-500 mt-1">
                        Monica se unirá automáticamente a las videollamadas para tomar notas, 
                        transcribir y generar resúmenes de las reuniones.
                      </p>
                      {notetakerEnabled && (
                        <p className="text-[10px] text-purple-400/70 mt-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                          Calendar Sync activo — Nylas Notetaker configurado
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isTogglingNotetaker}
                      onClick={async (e) => {
                        e.preventDefault();
                        setNotetakerError(null);
                        setIsTogglingNotetaker(true);
                        const nextEnabled = !notetakerEnabled;
                        const success = await toggleNotetaker(memberToEdit.id, nextEnabled);
                        if (!success) {
                          const storeErr = useTeamStore.getState().error;
                          setNotetakerError(storeErr || 'Error al configurar Calendar Sync en Nylas');
                        } else {
                          setNotetakerEnabled(nextEnabled);
                        }
                        setIsTogglingNotetaker(false);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0
                        ${notetakerEnabled ? 'bg-purple-500' : 'bg-zinc-700'}
                        ${isTogglingNotetaker ? 'opacity-50 cursor-wait' : ''}
                      `}
                    >
                      {isTogglingNotetaker ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
                      ) : (
                        <span
                          className={`
                            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                            ${notetakerEnabled ? 'translate-x-6' : 'translate-x-1'}
                          `}
                        />
                      )}
                    </button>
                  </label>
                  {notetakerError && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{notetakerError}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Appointments Configuration */}
            <div className="space-y-4 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 text-sm font-medium text-primary-400 uppercase tracking-wider">
                <Calendar className="w-4 h-4" />
                Configuración de Citas
              </div>

              {/* Warning: No calendar connected */}
              {memberToEdit && noCalendar && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <CalendarOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">Sin calendario conectado</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      Este miembro debe vincular su calendario (Nylas) para poder recibir citas. Sin calendario conectado, las citas no se agendarán.
                    </p>
                  </div>
                </div>
              )}

              {/* Warning: Calendar with issues */}
              {memberToEdit && hasCalendarIssue && (
                <div className={`flex items-start gap-3 p-3 rounded-xl ${formData.acepta_citas ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/5 border border-amber-500/20'}`}>
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${formData.acepta_citas ? 'text-red-400' : 'text-amber-400'}`} />
                  <div>
                    <p className={`text-sm font-medium ${formData.acepta_citas ? 'text-red-400' : 'text-amber-400'}`}>
                      {formData.acepta_citas ? 'Citas activas sin calendario válido' : 'Problema con el calendario'}
                    </p>
                    <p className={`text-xs mt-0.5 ${formData.acepta_citas ? 'text-red-400/70' : 'text-amber-400/70'}`}>
                      {formData.acepta_citas
                        ? 'Este miembro tiene citas habilitadas pero su calendario presenta problemas. Las citas no se agendarán correctamente hasta que se resuelva.'
                        : 'El calendario de este miembro tiene problemas de conexión. Debe reconectarlo antes de habilitar citas.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Accepts Appointments Toggle */}
                <div className="col-span-1 md:col-span-2">
                  <label className={`flex items-center gap-3 p-3 rounded-xl border bg-[#131316] transition-colors ${
                    !hasValidCalendar && memberToEdit
                      ? 'border-white/5 opacity-50 cursor-not-allowed'
                      : 'border-white/5 cursor-pointer hover:border-white/10'
                  }`}>
                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.acepta_citas && hasValidCalendar ? 'bg-primary-500' : 'bg-zinc-700'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.acepta_citas && hasValidCalendar ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.acepta_citas}
                      disabled={!hasValidCalendar && !!memberToEdit}
                      onChange={(e) => setFormData(prev => ({ ...prev, acepta_citas: e.target.checked }))}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-zinc-200">Acepta Citas</div>
                      <div className="text-xs text-zinc-500">
                        {!hasValidCalendar && memberToEdit
                          ? 'Requiere calendario conectado para habilitar citas'
                          : 'Permitir que este usuario reciba asignaciones de citas'}
                      </div>
                    </div>
                  </label>
                </div>

                {/* Appointment Duration */}
                {formData.acepta_citas && hasValidCalendar && (
                  <div className="space-y-1.5 col-span-1 md:col-span-2">
                    <label className="text-xs font-medium text-zinc-400">Duración de Cita (minutos)</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        min="15"
                        max="240"
                        step="15"
                        value={formData.duracion_cita_minutos}
                        onChange={(e) => setFormData(prev => ({ ...prev, duracion_cita_minutos: parseInt(e.target.value, 10) || 30 }))}
                        className="w-full bg-[#131316] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                        placeholder="30"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-600">Duración predeterminada para las citas de este usuario</p>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-[#131316] flex items-center justify-between gap-3">
          <div>
            {canTransferContacts && memberToEdit && (
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-primary-500/20 bg-primary-500/10 text-primary-300 hover:bg-primary-500/15 transition-colors flex items-center gap-2"
              >
                <ArrowRightLeft className="w-4 h-4" />
                Transferir contactos
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="team-form"
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {memberToEdit ? 'Guardar Cambios' : 'Crear Miembro'}
            </button>
          </div>
        </div>
      </div>
    </div>
    {memberToEdit && (
      <TransferContactsBetweenMembersModal
        isOpen={isTransferModalOpen}
        fromMember={memberToEdit}
        onClose={handleTransferClose}
        onTransferred={handleTransferSuccess}
      />
    )}
    </>
  );
};
