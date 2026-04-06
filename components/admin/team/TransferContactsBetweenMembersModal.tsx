'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Search,
  Users,
  X
} from 'lucide-react';
import { useTeamStore } from '../../../store/teamStore';
import { useContactStore } from '../../../store/contactStore';
import {
  ContactTransferPreview,
  ContactTransferMode,
  ContactTransferStrategy,
  TeamMemberProfile,
  TransferContactsBetweenMembersResult
} from '../../../types/team';

interface TransferContactsBetweenMembersModalProps {
  isOpen: boolean;
  fromMember: TeamMemberProfile;
  onClose: () => void;
  onTransferred?: (result: TransferContactsBetweenMembersResult) => void;
}

const STRATEGY_OPTIONS: Array<{ value: ContactTransferStrategy; label: string; description: string }> = [
  {
    value: 'reassign',
    label: 'Reasignar al destino',
    description: 'Mantiene la cobertura del contacto y mueve la participación del miembro saliente al nuevo responsable.'
  },
  {
    value: 'remove',
    label: 'Eliminar del contacto',
    description: 'Quita al miembro saliente de ese rol sin añadir automáticamente al destino en esa asignación secundaria.'
  }
];

const TRANSFER_MODE_OPTIONS: Array<{ value: ContactTransferMode; label: string; description: string }> = [
  {
    value: 'single_target',
    label: 'Destino único',
    description: 'Transfiere todos los responsables principales al mismo miembro destino.'
  },
  {
    value: 'round_robin',
    label: 'Round-robin automático',
    description: 'Reparte responsables principales entre miembros activos, con acepta_citas y grant válido.'
  }
];

export const TransferContactsBetweenMembersModal: React.FC<TransferContactsBetweenMembersModalProps> = ({
  isOpen,
  fromMember,
  onClose,
  onTransferred
}) => {
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const actorTeamMemberId = useContactStore(state => state.userContext?.id ?? null);
  const refreshContacts = useContactStore(state => state.refreshContacts);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);

  const members = useTeamStore(state => state.members);
  const isLoading = useTeamStore(state => state.isLoading);
  const isLoadingNylasStatus = useTeamStore(state => state.isLoadingNylasStatus);
  const storeError = useTeamStore(state => state.error);
  const previewContactTransfer = useTeamStore(state => state.previewContactTransfer);
  const transferContactsBetweenMembers = useTeamStore(state => state.transferContactsBetweenMembers);
  const fetchNylasGrantsStatus = useTeamStore(state => state.fetchNylasGrantsStatus);
  const getNylasStatusForMember = useTeamStore(state => state.getNylasStatusForMember);

  const [transferMode, setTransferMode] = useState<ContactTransferMode>('single_target');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [collaboratorStrategy, setCollaboratorStrategy] = useState<ContactTransferStrategy>('reassign');
  const [observerStrategy, setObserverStrategy] = useState<ContactTransferStrategy>('reassign');
  const [searchQuery, setSearchQuery] = useState('');
  const [preview, setPreview] = useState<ContactTransferPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const destinationOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return members
      .filter(member => member.id !== fromMember.id && member.is_active)
      .filter(member => {
        if (!query) return true;
        const fullName = `${member.nombre} ${member.apellido}`.toLowerCase();
        return fullName.includes(query) || member.email.toLowerCase().includes(query);
      });
  }, [members, fromMember.id, searchQuery]);

  const eligibleRoundRobinMembers = useMemo(() => {
    return members
      .filter(member => member.id !== fromMember.id && member.is_active)
      .filter(member => member.acepta_citas === true)
      .filter(member => {
        const status = getNylasStatusForMember(member.id);
        return !!member.grant_id && status?.status === 'valid';
      })
      .sort((a, b) => a.id - b.id);
  }, [members, fromMember.id, getNylasStatusForMember]);

  const eligibleRoundRobinIds = useMemo(
    () => eligibleRoundRobinMembers.map(member => member.id),
    [eligibleRoundRobinMembers]
  );

  const distributionItems = useMemo(() => {
    return (preview?.round_robin_distribution ?? []).map(item => {
      const member = members.find(candidate => candidate.id === item.team_member_id);
      return {
        ...item,
        memberLabel: member ? `${member.nombre} ${member.apellido}` : `Miembro #${item.team_member_id}`
      };
    });
  }, [members, preview?.round_robin_distribution]);

  useEffect(() => {
    if (!isOpen) return;

    setTransferMode('single_target');
    setSelectedMemberId(null);
    setCollaboratorStrategy('reassign');
    setObserverStrategy('reassign');
    setSearchQuery('');
    setPreview(null);
    setPreviewError(null);
    setSuccessMessage(null);

    if (selectedEnterpriseId) {
      void fetchTeamMembers(true, selectedEnterpriseId);
      void fetchNylasGrantsStatus(selectedEnterpriseId);
    }
  }, [isOpen, selectedEnterpriseId, fetchTeamMembers, fetchNylasGrantsStatus]);

  useEffect(() => {
    if (!isOpen || !selectedEnterpriseId) return;

    if (transferMode === 'single_target' && !selectedMemberId) {
      setPreview(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    if (transferMode === 'round_robin' && eligibleRoundRobinIds.length === 0) {
      setPreview(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      setIsPreviewLoading(true);
      setPreviewError(null);

      const result = await previewContactTransfer({
        empresa_id: selectedEnterpriseId,
        from_team_member_id: fromMember.id,
        to_team_member_id: transferMode === 'single_target' ? selectedMemberId : null,
        transfer_mode: transferMode,
        eligible_team_member_ids: transferMode === 'round_robin' ? eligibleRoundRobinIds : undefined
      });

      if (cancelled) return;

      if (!result) {
        setPreview(null);
        setPreviewError(useTeamStore.getState().error || 'No se pudo cargar la vista previa');
      } else {
        setPreview(result);
      }

      setIsPreviewLoading(false);
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    selectedEnterpriseId,
    fromMember.id,
    selectedMemberId,
    transferMode,
    eligibleRoundRobinIds,
    previewContactTransfer
  ]);

  if (!isOpen) return null;

  const canSubmit = !!selectedEnterpriseId
    && !isLoading
    && !isLoadingNylasStatus
    && (
      (transferMode === 'single_target' && !!selectedMemberId && selectedMemberId !== fromMember.id)
      || (transferMode === 'round_robin' && eligibleRoundRobinIds.length > 0)
    );

  const handleTransfer = async () => {
    if (!selectedEnterpriseId) {
      setPreviewError('No se encontró la empresa activa para continuar.');
      return;
    }

    if (transferMode === 'single_target' && !selectedMemberId) {
      setPreviewError('Selecciona un miembro destino para continuar.');
      return;
    }

    if (transferMode === 'round_robin' && eligibleRoundRobinIds.length === 0) {
      setPreviewError('No hay miembros elegibles para repartir contactos en round-robin.');
      return;
    }

    setSuccessMessage(null);
    setPreviewError(null);

    const result = await transferContactsBetweenMembers({
      empresa_id: selectedEnterpriseId,
      from_team_member_id: fromMember.id,
      to_team_member_id: transferMode === 'single_target' ? selectedMemberId : null,
      collaborator_strategy: collaboratorStrategy,
      observer_strategy: observerStrategy,
      actor_team_member_id: actorTeamMemberId,
      transfer_mode: transferMode,
      eligible_team_member_ids: transferMode === 'round_robin' ? eligibleRoundRobinIds : undefined
    });

    if (!result) {
      setPreviewError(useTeamStore.getState().error || 'No se pudo completar la transferencia.');
      return;
    }

    await refreshContacts();
    await fetchTeamMembers(true, selectedEnterpriseId);

    setSuccessMessage(
      `Se transfirieron ${result.principal_contacts_transferred} contacto(s) principales y se añadieron ${result.future_appointment_participants_added} participante(s) en citas futuras.`
    );

    onTransferred?.(result);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#131316]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Transferir contactos</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Moverás los contactos principales y resolverás las asignaciones secundarias de {fromMember.nombre} {fromMember.apellido}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {(previewError || storeError) && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-400">{previewError || storeError}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-300">{successMessage}</div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Miembro saliente</label>
                <div className="p-4 rounded-xl border border-white/10 bg-[#131316]">
                  <div className="text-sm font-medium text-zinc-100">{fromMember.nombre} {fromMember.apellido}</div>
                  <div className="text-xs text-zinc-500 mt-1">{fromMember.email}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-zinc-400 mb-2">Modo de transferencia</div>
                  <div className="space-y-2">
                    {TRANSFER_MODE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setTransferMode(option.value);
                          setPreview(null);
                          setPreviewError(null);
                          setSuccessMessage(null);
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-colors ${
                          transferMode === option.value
                            ? 'border-primary-500/40 bg-primary-500/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="text-sm font-medium text-zinc-100">{option.label}</div>
                        <div className="text-xs text-zinc-500 mt-1">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {transferMode === 'single_target' ? 'Miembro destino' : 'Pool elegible round-robin'}
                  </label>
                  <span className="text-[11px] text-zinc-600">
                    {transferMode === 'single_target'
                      ? 'Solo miembros activos'
                      : 'Activos + acepta_citas + grant válido'}
                  </span>
                </div>

                {transferMode === 'single_target' ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre o email..."
                        className="w-full bg-[#131316] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-200 focus:border-primary-500/50 outline-none transition-colors"
                      />
                    </div>

                    <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                      {destinationOptions.map(member => {
                        const isSelected = selectedMemberId === member.id;
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              setSelectedMemberId(member.id);
                              setSuccessMessage(null);
                            }}
                            className={`w-full text-left p-4 rounded-xl border transition-colors ${
                              isSelected
                                ? 'border-primary-500/40 bg-primary-500/10'
                                : 'border-white/10 bg-[#131316] hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                                isSelected ? 'bg-primary-500/20 text-primary-300' : 'bg-zinc-800 text-zinc-400'
                              }`}>
                                {member.nombre?.[0]}{member.apellido?.[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`text-sm font-medium truncate ${isSelected ? 'text-primary-300' : 'text-zinc-100'}`}>
                                  {member.nombre} {member.apellido}
                                </div>
                                <div className="text-xs text-zinc-500 truncate">{member.email}</div>
                              </div>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-primary-300" />}
                            </div>
                          </button>
                        );
                      })}

                      {destinationOptions.length === 0 && (
                        <div className="p-6 rounded-xl border border-dashed border-white/10 bg-[#131316] text-center text-sm text-zinc-500">
                          No se encontraron miembros destino con ese criterio.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border border-white/10 bg-black/20 text-xs text-zinc-400">
                      Se usarán automáticamente todos los miembros elegibles de la empresa, excluyendo al miembro saliente.
                    </div>

                    <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                      {eligibleRoundRobinMembers.map(member => (
                        <div
                          key={member.id}
                          className="w-full text-left p-4 rounded-xl border border-white/10 bg-[#131316]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-zinc-800 text-zinc-300">
                              {member.nombre?.[0]}{member.apellido?.[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate text-zinc-100">
                                {member.nombre} {member.apellido}
                              </div>
                              <div className="text-xs text-zinc-500 truncate">{member.email}</div>
                            </div>
                            <div className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                              Elegible
                            </div>
                          </div>
                        </div>
                      ))}

                      {!isLoadingNylasStatus && eligibleRoundRobinMembers.length === 0 && (
                        <div className="p-6 rounded-xl border border-dashed border-white/10 bg-[#131316] text-center text-sm text-zinc-500">
                          No hay miembros elegibles con acepta_citas y grant válido.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-white/10 bg-[#131316] space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-zinc-100">Resolución de asignaciones secundarias</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Define qué hacer con las colaboraciones y observaciones donde el miembro saliente no es responsable principal.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-zinc-400 mb-2">Colaboradores</div>
                    <div className="space-y-2">
                      {STRATEGY_OPTIONS.map(option => (
                        <button
                          key={`collab-${option.value}`}
                          type="button"
                          onClick={() => setCollaboratorStrategy(option.value)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${
                            collaboratorStrategy === option.value
                              ? 'border-primary-500/40 bg-primary-500/10'
                              : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="text-sm font-medium text-zinc-100">{option.label}</div>
                          <div className="text-xs text-zinc-500 mt-1">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-zinc-400 mb-2">Observadores</div>
                    <div className="space-y-2">
                      {STRATEGY_OPTIONS.map(option => (
                        <button
                          key={`observer-${option.value}`}
                          type="button"
                          onClick={() => setObserverStrategy(option.value)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${
                            observerStrategy === option.value
                              ? 'border-primary-500/40 bg-primary-500/10'
                              : 'border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="text-sm font-medium text-zinc-100">{option.label}</div>
                          <div className="text-xs text-zinc-500 mt-1">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10 bg-[#131316] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">Vista previa</h3>
                    <p className="text-xs text-zinc-500 mt-1">Impacto estimado antes de ejecutar la transferencia.</p>
                  </div>
                  {isPreviewLoading && <Loader2 className="w-4 h-4 animate-spin text-primary-400" />}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Principales</div>
                    <div className="text-2xl font-semibold text-zinc-100 mt-1">{preview?.principal_contacts_count ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Colaboradores</div>
                    <div className="text-2xl font-semibold text-zinc-100 mt-1">{preview?.secondary_collaborator_count ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Observadores</div>
                    <div className="text-2xl font-semibold text-zinc-100 mt-1">{preview?.secondary_observer_count ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Merges</div>
                    <div className="text-2xl font-semibold text-zinc-100 mt-1">{preview?.target_existing_assignment_merges_count ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Citas futuras</div>
                    <div className="text-2xl font-semibold text-zinc-100 mt-1">{preview?.future_appointments_count ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Elegibles</div>
                    <div className="text-2xl font-semibold text-zinc-100 mt-1">{preview?.eligible_team_members_count ?? '—'}</div>
                  </div>
                </div>

                {transferMode === 'round_robin' && distributionItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Distribución estimada</div>
                    <div className="space-y-2">
                      {distributionItems.map(item => (
                        <div
                          key={item.team_member_id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/5"
                        >
                          <div className="text-sm text-zinc-200 truncate">{item.memberLabel}</div>
                          <div className="text-sm font-medium text-primary-300">{item.contacts_count} contacto(s)</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-amber-300">Acción sensible</div>
                  <div className="text-xs text-amber-400/80 mt-1">
                    Esta transferencia actualiza responsables principales en bloque y resuelve asignaciones secundarias del miembro saliente.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-[#131316] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Ejecutar transferencia
          </button>
        </div>
      </div>
    </div>
  );
};
