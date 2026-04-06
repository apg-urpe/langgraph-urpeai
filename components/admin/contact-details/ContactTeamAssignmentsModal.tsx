import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, UserPlus, Trash2, Star, Users, Loader2, AlertTriangle, UserCheck, Search, CheckCircle2 } from 'lucide-react';
import { useContactStore } from '@/store/contactStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { Contact, ContactTeamAssignment, RolAsignacion, ROL_ASIGNACION_LABELS, ROL_ASIGNACION_COLORS } from '@/types/contact';
import { logger } from '@/lib/logger';

interface ContactTeamAssignmentsModalProps {
  contact: Contact;
  onClose: () => void;
  onUpdate?: () => void;
}

export const ContactTeamAssignmentsModal: React.FC<ContactTeamAssignmentsModalProps> = ({
  contact,
  onClose,
  onUpdate
}) => {
  const [assignments, setAssignments] = useState<ContactTeamAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<number | null>(contact.team_humano_id || null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedRol, setSelectedRol] = useState<RolAsignacion>('colaborador');
  const [memberQuery, setMemberQuery] = useState('');

  const teamMembers = useContactStore(state => state.teamMembers);
  const userContext = useContactStore(state => state.userContext);
  const updateContactField = useContactStore(state => state.updateContactField);
  const fetchContactAssignments = useContactStore(state => state.fetchContactAssignments);
  const addContactAssignment = useContactStore(state => state.addContactAssignment);
  const updateContactAssignment = useContactStore(state => state.updateContactAssignment);
  const deleteContactAssignment = useContactStore(state => state.deleteContactAssignment);
  const createNotification = useNotificationsStore(state => state.createNotification);

  const canManageAssignments = userContext?.roleId === 1 || userContext?.roleId === 2 || userContext?.roleId === 4;

  const loadAssignments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      let data = await fetchContactAssignments(contact.id);

      // FIX: Si la tabla pivot está vacía pero el contacto YA tiene un principal asignado
      // (gap de backfill), auto-insertar al principal existente para mantener consistencia
      if (data.length === 0 && contact.team_humano_id && contact.empresa_id) {
        logger.info('[ContactTeamAssignmentsModal] Pivot vacío pero contact.team_humano_id existe, reconciliando...', {
          contactId: contact.id,
          teamHumanoId: contact.team_humano_id
        });
        const reconcileResult = await addContactAssignment({
          contacto_id: contact.id,
          team_humano_id: contact.team_humano_id,
          es_principal: true,
          rol_asignacion: 'principal',
          empresa_id: contact.empresa_id
        });
        if (reconcileResult.success) {
          data = await fetchContactAssignments(contact.id);
          logger.info('[ContactTeamAssignmentsModal] ✅ Principal reconciliado en tabla pivot');
        } else {
          logger.warn('[ContactTeamAssignmentsModal] ⚠️ No se pudo reconciliar principal:', reconcileResult.error);
        }
      }

      setAssignments(data);
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error loading assignments:', err);
      setError('Error al cargar asignaciones');
    } finally {
      setIsLoading(false);
    }
  }, [contact.id, contact.team_humano_id, contact.empresa_id, fetchContactAssignments, addContactAssignment]);

  // Cargar asignaciones al abrir
  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const principalAssignment = useMemo(() => {
    if (!assignments.length) return null;
    return assignments.find(a => a.es_principal)
      || assignments.find(a => contact.team_humano_id != null && a.team_humano_id === contact.team_humano_id)
      || null;
  }, [assignments, contact.team_humano_id]);

  const currentResponsibleId = principalAssignment?.team_humano_id ?? contact.team_humano_id ?? null;

  const currentResponsibleMember = useMemo(() => {
    if (!currentResponsibleId) return null;
    return teamMembers.find(member => member.id === currentResponsibleId) || null;
  }, [teamMembers, currentResponsibleId]);

  const secondaryAssignments = useMemo(() => {
    if (!principalAssignment) return assignments;
    return assignments.filter(assignment => assignment.id !== principalAssignment.id);
  }, [assignments, principalAssignment]);

  const responsibleOptions = useMemo(() => {
    return teamMembers.filter(member => member.is_active || member.id === currentResponsibleId);
  }, [teamMembers, currentResponsibleId]);

  const collaboratorCount = useMemo(() => {
    return secondaryAssignments.filter(assignment => assignment.rol_asignacion !== 'observador').length;
  }, [secondaryAssignments]);

  const observerCount = useMemo(() => {
    return secondaryAssignments.filter(assignment => assignment.rol_asignacion === 'observador').length;
  }, [secondaryAssignments]);

  const orderedAssignments = useMemo(() => {
    return principalAssignment ? [principalAssignment, ...secondaryAssignments] : secondaryAssignments;
  }, [principalAssignment, secondaryAssignments]);

  useEffect(() => {
    setSelectedResponsibleId(currentResponsibleId);
  }, [currentResponsibleId]);

  // Team members disponibles (excluir ya asignados)
  const availableMembers = useMemo(() => {
    const assignedIds = new Set(assignments.map(a => a.team_humano_id));
    return teamMembers.filter(m => !assignedIds.has(m.id) && m.is_active);
  }, [teamMembers, assignments]);

  const filteredAvailableMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return availableMembers;

    return availableMembers.filter(member => {
      const haystack = `${member.nombre} ${member.apellido} ${member.email}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availableMembers, memberQuery]);

  const notifyResponsibleAssigned = useCallback(async (memberId: number) => {
    const newResponsible = teamMembers.find(member => member.id === memberId);
    if (!newResponsible) return;

    try {
      await createNotification({
        tipo: 'sistema',
        contacto_id: contact.id,
        mensaje: `Te han asignado como responsable del contacto ${contact.nombre || ''} ${contact.apellido || ''}`.trim(),
        asesor_id: memberId,
        empresa_id: contact.empresa_id || userContext?.empresaId,
        requiere_respuesta: false,
        origen: 'asignacion_responsable_contacto'
      });
    } catch (notificationError) {
      logger.warn('[ContactTeamAssignmentsModal] No se pudo crear la notificación al responsable:', notificationError);
    }
  }, [teamMembers, createNotification, contact.id, contact.nombre, contact.apellido, contact.empresa_id, userContext?.empresaId]);

  const handleSaveResponsible = async () => {
    if (selectedResponsibleId === currentResponsibleId) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (selectedResponsibleId === null) {
        await updateContactField(contact.id, 'team_humano_id', null);
      } else {
        const existingAssignment = assignments.find(assignment => assignment.team_humano_id === selectedResponsibleId);

        if (existingAssignment) {
          const result = await updateContactAssignment({
            id: existingAssignment.id,
            es_principal: true
          });

          if (!result.success) {
            setError(result.error || 'Error al actualizar responsable');
            return;
          }
        } else {
          if (!contact.empresa_id) {
            setError('El contacto no tiene empresa válida para asignar responsable');
            return;
          }

          const result = await addContactAssignment({
            contacto_id: contact.id,
            team_humano_id: selectedResponsibleId,
            es_principal: true,
            rol_asignacion: 'principal',
            empresa_id: contact.empresa_id
          });

          if (!result.success) {
            setError(result.error || 'Error al asignar responsable');
            return;
          }
        }

        await notifyResponsibleAssigned(selectedResponsibleId);
      }

      await loadAssignments();
      setSuccessMessage(selectedResponsibleId === null ? 'Responsable eliminado del contacto.' : 'Responsable actualizado correctamente.');
      onUpdate?.();
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error saving responsible:', err);
      setError('Error al actualizar responsable');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearResponsible = async () => {
    if (currentResponsibleId === null) return;

    setSelectedResponsibleId(null);
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateContactField(contact.id, 'team_humano_id', null);
      await loadAssignments();
      setSuccessMessage('El contacto quedó sin responsable principal.');
      onUpdate?.();
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error clearing responsible:', err);
      setError('Error al quitar responsable');
      setSelectedResponsibleId(currentResponsibleId);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAssignment = async () => {
    if (!selectedTeamId || !contact.empresa_id) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const selectedMember = teamMembers.find(member => member.id === selectedTeamId);
      const shouldBePrincipal = selectedRol === 'principal';
      const result = await addContactAssignment({
        contacto_id: contact.id,
        team_humano_id: selectedTeamId,
        es_principal: shouldBePrincipal,
        rol_asignacion: shouldBePrincipal ? 'principal' : selectedRol,
        empresa_id: contact.empresa_id
      });

      if (result.success) {
        if (shouldBePrincipal) {
          await notifyResponsibleAssigned(selectedTeamId);
        }
        await loadAssignments();
        setSelectedTeamId(null);
        setSelectedRol('colaborador');
        setMemberQuery('');
        setSuccessMessage(shouldBePrincipal
          ? `${selectedMember?.nombre || 'Miembro'} asignado como responsable.`
          : `${selectedMember?.nombre || 'Miembro'} agregado al equipo del contacto.`);
        onUpdate?.();
      } else {
        setError(result.error || 'Error al agregar asignación');
      }
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error adding assignment:', err);
      setError('Error al agregar asignación');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePrincipal = async (assignmentId: number, currentValue: boolean) => {
    if (currentValue) return; // Ya es principal, no hacer nada

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const targetAssignment = assignments.find(assignment => assignment.id === assignmentId);
      const result = await updateContactAssignment({
        id: assignmentId,
        es_principal: true
      });

      if (result.success) {
        if (targetAssignment) {
          await notifyResponsibleAssigned(targetAssignment.team_humano_id);
        }
        await loadAssignments();
        setSuccessMessage('Responsable actualizado correctamente.');
        onUpdate?.();
      } else {
        setError(result.error || 'Error al actualizar asignación');
      }
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error updating assignment:', err);
      setError('Error al actualizar asignación');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeAssignmentRole = async (assignment: ContactTeamAssignment, nextRole: Exclude<RolAsignacion, 'principal'>) => {
    if (assignment.es_principal || assignment.rol_asignacion === nextRole) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await updateContactAssignment({
        id: assignment.id,
        rol_asignacion: nextRole
      });

      if (result.success) {
        await loadAssignments();
        setSuccessMessage(`Rol actualizado a ${ROL_ASIGNACION_LABELS[nextRole].toLowerCase()}.`);
        onUpdate?.();
      } else {
        setError(result.error || 'Error al actualizar rol');
      }
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error updating assignment role:', err);
      setError('Error al actualizar rol');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!confirm('¿Eliminar esta asignación?')) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await deleteContactAssignment(assignmentId);

      if (result.success) {
        await loadAssignments();
        setSuccessMessage('Asignación eliminada del equipo del contacto.');
        onUpdate?.();
      } else {
        setError(result.error || 'Error al eliminar asignación');
      }
    } catch (err) {
      logger.error('[ContactTeamAssignmentsModal] Error deleting assignment:', err);
      setError('Error al eliminar asignación');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-pop-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Users className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Responsable y colaboradores</h2>
              <p className="text-xs text-zinc-500">
                {contact.nombre} {contact.apellido}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Responsable</div>
              <div className="mt-2 text-sm font-medium text-zinc-200">
                {currentResponsibleMember
                  ? `${currentResponsibleMember.nombre} ${currentResponsibleMember.apellido}`
                  : 'Sin asignar'}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Colaboradores</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-100">{collaboratorCount}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Observadores</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-100">{observerCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-2 space-y-4">
              <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <UserCheck className="w-4 h-4 text-primary-400" />
                  Responsable actual
                </div>

                <div className="p-4 rounded-lg border border-white/5 bg-[#101014]">
                  {currentResponsibleMember ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center text-primary-400 font-bold text-sm border border-primary-500/20 shrink-0">
                          {currentResponsibleMember.nombre?.[0] || '?'}{currentResponsibleMember.apellido?.[0] || ''}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">
                            {currentResponsibleMember.nombre} {currentResponsibleMember.apellido}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">{currentResponsibleMember.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-1 rounded border text-primary-400 bg-primary-500/10 border-primary-500/20 shrink-0">
                        Responsable
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm text-zinc-500">
                        Este contacto no tiene responsable asignado.
                      </div>
                      <div className="text-xs text-zinc-600">
                        Puedes asignarlo desde el selector inferior o promoviendo a un miembro del equipo.
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/5 bg-[#101014] px-3 py-2">
                    <div className="text-[11px] text-zinc-500">Colaboradores</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-100">{collaboratorCount}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#101014] px-3 py-2">
                    <div className="text-[11px] text-zinc-500">Observadores</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-100">{observerCount}</div>
                  </div>
                </div>
              </div>

              {canManageAssignments && (
                <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-lg space-y-3">
                  <div className="text-sm font-medium text-zinc-300">Cambiar responsable</div>
                  <select
                    value={selectedResponsibleId ?? ''}
                    onChange={(e) => setSelectedResponsibleId(e.target.value ? Number(e.target.value) : null)}
                    disabled={isSaving}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
                  >
                    <option value="">Sin responsable</option>
                    {responsibleOptions.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.nombre} {member.apellido}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSaveResponsible}
                      disabled={isSaving || selectedResponsibleId === currentResponsibleId}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      {currentResponsibleId ? 'Actualizar responsable' : 'Asignar responsable'}
                    </button>
                    <button
                      onClick={handleClearResponsible}
                      disabled={isSaving || currentResponsibleId === null}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Dejar sin responsable
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="xl:col-span-3 space-y-4">
              {canManageAssignments && (
                <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-lg space-y-3">
                  <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary-400" />
                    Agregar al equipo del contacto
                  </h3>

                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Buscar miembro por nombre o email..."
                      disabled={isSaving || availableMembers.length === 0}
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                      value={selectedTeamId || ''}
                      onChange={(e) => setSelectedTeamId(Number(e.target.value) || null)}
                      disabled={isSaving || filteredAvailableMembers.length === 0}
                      className="md:col-span-2 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
                    >
                      <option value="">
                        {availableMembers.length === 0
                          ? 'Todos los miembros activos ya están asignados'
                          : filteredAvailableMembers.length === 0
                            ? 'Sin resultados para la búsqueda'
                            : 'Seleccionar miembro...'}
                      </option>
                      {filteredAvailableMembers.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.nombre} {member.apellido} · {member.email}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedRol}
                      onChange={(e) => setSelectedRol(e.target.value as RolAsignacion)}
                      disabled={isSaving}
                      className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
                    >
                      <option value="colaborador">Colaborador</option>
                      <option value="observador">Observador</option>
                      <option value="principal">Responsable</option>
                    </select>

                    <button
                      onClick={handleAddAssignment}
                      disabled={!selectedTeamId || isSaving}
                      className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-400 px-1">
                  Equipo asignado ({orderedAssignments.length})
                </h3>

                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                  </div>
                ) : orderedAssignments.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-sm bg-zinc-900/20 border border-white/5 rounded-lg">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No hay miembros asignados a este contacto</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderedAssignments.map(assignment => {
                      const rolColor = assignment.rol_asignacion
                        ? ROL_ASIGNACION_COLORS[assignment.rol_asignacion]
                        : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
                      const isPrimary = assignment.es_principal;

                      return (
                        <div
                          key={assignment.id}
                          className={`flex flex-col gap-3 p-3 border rounded-2xl transition-colors ${
                            isPrimary
                              ? 'bg-primary-500/5 border-primary-500/20'
                              : 'bg-zinc-900/30 border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center text-primary-400 font-bold text-sm border border-primary-500/20 shrink-0">
                                {assignment.team_nombre?.[0] || '?'}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium text-zinc-200 truncate">
                                    {assignment.team_nombre} {assignment.team_apellido}
                                  </p>
                                  {isPrimary && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-primary-500/20 bg-primary-500/10 text-primary-300">
                                      Actual
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 truncate">
                                  {assignment.team_email}
                                </p>
                              </div>
                            </div>

                            {assignment.rol_asignacion && (
                              <span className={`text-[10px] px-2 py-1 rounded-full border ${rolColor} shrink-0`}>
                                {ROL_ASIGNACION_LABELS[assignment.rol_asignacion]}
                              </span>
                            )}
                          </div>

                          {canManageAssignments && (
                            <div className="flex flex-wrap items-center gap-2">
                              {!isPrimary && (
                                <>
                                  <button
                                    onClick={() => handleTogglePrincipal(assignment.id, assignment.es_principal)}
                                    disabled={isSaving}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                    title="Convertir en responsable"
                                  >
                                    <Star className="w-3.5 h-3.5" />
                                    Responsable
                                  </button>
                                  <button
                                    onClick={() => handleChangeAssignmentRole(assignment, 'colaborador')}
                                    disabled={isSaving || assignment.rol_asignacion === 'colaborador'}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 transition-colors disabled:opacity-50"
                                  >
                                    Colaborador
                                  </button>
                                  <button
                                    onClick={() => handleChangeAssignmentRole(assignment, 'observador')}
                                    disabled={isSaving || assignment.rol_asignacion === 'observador'}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-zinc-500/20 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/15 transition-colors disabled:opacity-50"
                                  >
                                    Observador
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleDeleteAssignment(assignment.id)}
                                disabled={isSaving}
                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                                title="Eliminar del equipo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
