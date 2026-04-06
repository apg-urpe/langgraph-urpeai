import { TeamMember } from '../types/contact';
import { TeamGroup } from '../store/adminStore';
import { TeamGroupConfig } from '../types/team';

// Built-in groups that always exist (not stored in DB)
export const BUILTIN_GROUPS = ['activos', 'inactivos'] as const;

/**
 * Verifica si un miembro pertenece a un grupo específico
 * Matching dinámico: compara member.rol con el slug del grupo
 * Built-in: 'activos' e 'inactivos' se evalúan por is_active
 */
const memberMatchesGroup = (member: TeamMember, groupSlug: TeamGroup): boolean => {
  // Built-in groups
  if (groupSlug === 'activos') return member.is_active === true;
  if (groupSlug === 'inactivos') return member.is_active === false;

  // Dynamic groups: match by rol field (slug)
  return member.rol === groupSlug;
};

/**
 * Filtra miembros del equipo según los grupos seleccionados
 */
export const filterMembersByGroups = (
  members: TeamMember[], 
  selectedGroups: TeamGroup[]
): TeamMember[] => {
  if (selectedGroups.length === 0) {
    return members;
  }

  return members.filter(member => {
    return selectedGroups.some(group => memberMatchesGroup(member, group));
  });
};

/**
 * Obtiene los IDs de los miembros que pertenecen a los grupos seleccionados
 */
export const getMemberIdsByGroups = (
  members: TeamMember[], 
  selectedGroups: TeamGroup[]
): number[] => {
  const filteredMembers = filterMembersByGroups(members, selectedGroups);
  return filteredMembers.map(member => member.id);
};

/**
 * Combina filtros de grupos y selección individual de miembros
 */
export const combineFilters = (
  members: TeamMember[],
  selectedGroups: TeamGroup[],
  selectedMemberIds: number[]
): TeamMember[] => {
  let filtered = members;

  // Aplicar filtro por grupos primero
  if (selectedGroups.length > 0) {
    filtered = filterMembersByGroups(filtered, selectedGroups);
  }

  // Aplicar filtro por miembros individuales
  if (selectedMemberIds.length > 0) {
    filtered = filtered.filter(member => selectedMemberIds.includes(member.id));
  }

  return filtered;
};

/**
 * Verifica si un miembro pertenece a un grupo específico
 */
export const isMemberInGroup = (member: TeamMember, group: TeamGroup): boolean => {
  return memberMatchesGroup(member, group);
};

/**
 * Obtiene los grupos a los que pertenece un miembro (dinámico)
 */
export const getMemberGroups = (member: TeamMember, availableGroups: TeamGroupConfig[] = []): TeamGroup[] => {
  const slugs = availableGroups.map(g => g.slug);
  const builtIn: TeamGroup[] = ['activos', 'inactivos'];
  const all = [...slugs, ...builtIn];
  return all.filter(g => memberMatchesGroup(member, g));
};
