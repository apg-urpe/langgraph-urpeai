import { useAdminStore, selectGlobalTeamMemberIds } from '../store/adminStore';
import { useContactStore, selectTeamMembers } from '../store/contactStore';
import { useMemo } from 'react';

/**
 * Hook que retorna los IDs de miembros filtrados.
 * Los chips de grupo ahora seleccionan miembros directamente en selectedMemberIds,
 * así que este hook solo necesita retornar esos IDs o todos si no hay filtro.
 */
export const useCombinedTeamFilter = (): number[] => {
  const selectedMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const teamMembers = useContactStore(selectTeamMembers);

  return useMemo(() => {
    if (selectedMemberIds.length === 0) {
      return teamMembers.map((member: any) => member.id);
    }
    return selectedMemberIds;
  }, [selectedMemberIds, teamMembers]);
};

/**
 * Hook que verifica si hay filtros activos
 */
export const useHasActiveFilters = (): boolean => {
  const selectedMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  return selectedMemberIds.length > 0;
};
