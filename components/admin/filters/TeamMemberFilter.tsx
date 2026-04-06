'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Users, ChevronDown, ChevronRight, Lock, Check, X, Search, Briefcase, Crown, CheckCircle, XCircle, Minus, Tag, Star, Shield, Heart, Zap, Target, Award } from 'lucide-react';
import { useContactStore, selectTeamMembers, selectUserContext } from '../../../store/contactStore';
import { 
  useAdminStore, 
  selectGlobalTeamMemberIds,
  selectIsTeamFilterRestricted,
  TeamGroup
} from '../../../store/adminStore';
import { useTeamStore } from '../../../store/teamStore';
import { filterMembersByGroups } from '../../../lib/team-filters';

// Icon lookup for dynamic groups
const ICON_MAP: Record<string, React.ElementType> = {
  Users, Briefcase, Crown, CheckCircle, XCircle, Tag, Star, Shield, Heart, Zap, Target, Award,
};

// Color lookup: color name → Tailwind classes
const COLOR_MAP: Record<string, { dotClass: string; textClass: string }> = {
  blue:    { dotClass: 'bg-blue-400',    textClass: 'text-blue-400' },
  purple:  { dotClass: 'bg-purple-400',  textClass: 'text-purple-400' },
  amber:   { dotClass: 'bg-amber-400',   textClass: 'text-amber-400' },
  emerald: { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400' },
  red:     { dotClass: 'bg-red-400',     textClass: 'text-red-400' },
  cyan:    { dotClass: 'bg-cyan-400',    textClass: 'text-cyan-400' },
  pink:    { dotClass: 'bg-pink-400',    textClass: 'text-pink-400' },
  zinc:    { dotClass: 'bg-zinc-400',    textClass: 'text-zinc-400' },
};

const getColorClasses = (color: string) => COLOR_MAP[color] || COLOR_MAP.blue;
const getIcon = (iconName: string) => ICON_MAP[iconName] || Tag;

// Role label helper — uses role_id for permission badges
const getRolLabel = (member: { rol?: string | null; role_id?: number | null }): string | null => {
  if (member.role_id === 1) return 'Lead';
  if (member.role_id === 2) return 'Sup';
  return null;
};

const getRolClass = (member: { rol?: string | null; role_id?: number | null }): string => {
  if (member.role_id === 2) return 'text-purple-400 bg-purple-500/10';
  if (member.role_id === 1) return 'text-amber-400 bg-amber-500/10';
  return '';
};

interface TeamMemberFilterProps {
  className?: string;
  compact?: boolean;
}

export const TeamMemberFilter: React.FC<TeamMemberFilterProps> = ({ 
  className = '',
  compact = false 
}) => {
  const teamMembers = useContactStore(selectTeamMembers);
  const userContext = useContactStore(selectUserContext);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  const selectedMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const isRestricted = useAdminStore(selectIsTeamFilterRestricted);
  const toggleTeamMember = useAdminStore(state => state.toggleTeamMember);
  const setGlobalTeamFilter = useAdminStore(state => state.setGlobalTeamFilter);
  const initializeTeamFilter = useAdminStore(state => state.initializeTeamFilter);

  const groups = useTeamStore(state => state.groups);
  const fetchGroups = useTeamStore(state => state.fetchGroups);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroups, setShowGroups] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Build chips from dynamic groups + built-in activos/inactivos
  const groupChips = useMemo(() => {
    const dynamic = groups.map(g => ({
      id: g.slug as TeamGroup,
      label: g.name,
      icon: getIcon(g.icon),
      ...getColorClasses(g.color),
    }));
    // Built-in groups always at the end
    return [
      ...dynamic,
      { id: 'activos' as TeamGroup, label: 'Activos', icon: CheckCircle, ...getColorClasses('emerald') },
      { id: 'inactivos' as TeamGroup, label: 'Inactivos', icon: XCircle, ...getColorClasses('zinc') },
    ];
  }, [groups]);

  // Compute group membership counts and which groups are fully selected
  const groupInfo = useMemo(() => {
    const info: Record<string, { memberIds: number[]; count: number; allSelected: boolean; someSelected: boolean }> = {};
    for (const chip of groupChips) {
      const members = filterMembersByGroups(teamMembers, [chip.id]);
      const ids = members.map(m => m.id);
      const selectedInGroup = ids.filter(id => selectedMemberIds.includes(id));
      info[chip.id] = {
        memberIds: ids,
        count: ids.length,
        allSelected: ids.length > 0 && selectedInGroup.length === ids.length,
        someSelected: selectedInGroup.length > 0 && selectedInGroup.length < ids.length,
      };
    }
    return info;
  }, [teamMembers, selectedMemberIds, groupChips]);

  // Handle group chip click: select all or deselect all members in that group
  const handleGroupClick = useCallback((groupId: TeamGroup) => {
    const gi = groupInfo[groupId];
    if (!gi) return;
    const { memberIds, allSelected } = gi;
    if (memberIds.length === 0) return;

    if (allSelected) {
      // Deselect all members of this group
      const newIds = selectedMemberIds.filter(id => !memberIds.includes(id));
      setGlobalTeamFilter(newIds);
    } else {
      // Select all members of this group (add to existing selection)
      const combined = new Set([...selectedMemberIds, ...memberIds]);
      setGlobalTeamFilter(Array.from(combined));
    }
  }, [groupInfo, selectedMemberIds, setGlobalTeamFilter]);

  // Filtered members for the list (search only, no group visual filter)
  const visibleMembers = useMemo(() => {
    let members = [...teamMembers];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      members = members.filter(m =>
        m.nombre?.toLowerCase().includes(q) ||
        m.apellido?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
      );
    }
    return members;
  }, [teamMembers, searchQuery]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Fetch team members and groups on enterprise change
  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchTeamMembers(true);
      fetchGroups(selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, fetchTeamMembers, fetchGroups]);

  // Initialize filter based on user role
  useEffect(() => {
    if (userContext) initializeTeamFilter(userContext.roleId, userContext.id);
  }, [userContext, initializeTeamFilter]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasAnyFilter = selectedMemberIds.length > 0;

  // Trigger label
  const getLabel = (): string => {
    if (!hasAnyFilter) return 'Todo el Equipo';
    if (selectedMemberIds.length === 1) {
      const m = teamMembers.find(m => m.id === selectedMemberIds[0]);
      return m ? (compact ? `${m.nombre} ${m.apellido.charAt(0)}.` : `${m.nombre} ${m.apellido}`) : '1 miembro';
    }
    // Check if selection matches exactly a group
    for (const chip of groupChips) {
      const gi = groupInfo[chip.id];
      if (gi && gi.allSelected && gi.count === selectedMemberIds.length) {
        return chip.label;
      }
    }
    return `${selectedMemberIds.length} miembros`;
  };

  const handleClearAll = () => {
    setGlobalTeamFilter([]);
  };

  const handleSelectAll = () => {
    setGlobalTeamFilter(teamMembers.map(m => m.id));
  };

  if (teamMembers.length === 0 && !isRestricted) return null;

  // Restricted view (role 3)
  if (isRestricted) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Users className="w-4 h-4 text-zinc-500 shrink-0" />
        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900/50 border border-white/5 rounded-md">
          <span className="text-xs text-zinc-400">
            {userContext ? `${userContext.nombre} ${userContext.apellido}` : 'Mi cuenta'}
          </span>
          <Lock className="w-3 h-3 text-zinc-600" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`} ref={dropdownRef}>
      <Users className="w-4 h-4 text-zinc-500 shrink-0" />

      <div className="relative flex-1 min-w-0">
        {/* Trigger */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-xs text-zinc-200 hover:border-white/20 focus:outline-none focus:border-primary-500/50 cursor-pointer transition-colors"
        >
          <span className="truncate">{getLabel()}</span>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {hasAnyFilter && (
              <span className="bg-primary-500/20 text-primary-400 px-1.5 rounded text-[10px] font-medium">
                {selectedMemberIds.length}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* Unified Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-[#0a0a0c] border border-white/10 rounded-lg shadow-2xl z-50 max-h-[440px] overflow-hidden flex flex-col backdrop-blur-xl">

            {/* Search */}
            <div className="p-2 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar miembro..."
                  className="w-full bg-black/40 border border-white/10 rounded-md pl-7 pr-7 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Group List — collapsible quick select/deselect */}
            {!searchQuery && (
              <div className="border-b border-white/5">
                <button
                  onClick={() => setShowGroups(!showGroups)}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-white/5 transition-colors"
                >
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Grupos</span>
                  <ChevronRight className={`w-3 h-3 text-zinc-500 transition-transform ${showGroups ? 'rotate-90' : ''}`} />
                </button>
                {showGroups && (
                  <div className="pb-1">
                    {groupChips.map(g => {
                      const gi = groupInfo[g.id];
                      if (!gi || gi.count === 0) return null;
                      const Icon = g.icon;
                      const isActive = gi.allSelected;
                      const isPartial = gi.someSelected;
                      return (
                        <div
                          key={g.id}
                          onClick={() => handleGroupClick(g.id)}
                          className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/5 transition-colors ${
                            isActive ? 'bg-white/[0.03]' : ''
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            isActive
                              ? `${g.dotClass} border-transparent`
                              : isPartial
                                ? `${g.dotClass} border-transparent opacity-50`
                                : 'border-zinc-600'
                          }`}>
                            {isActive && <Check className="w-2.5 h-2.5 text-white" />}
                            {isPartial && !isActive && <Minus className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <Icon className={`w-3 h-3 ${isActive ? g.textClass : isPartial ? `${g.textClass} opacity-60` : 'text-zinc-500'}`} />
                          <span className={`text-[11px] flex-1 ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`}>
                            {g.label}
                          </span>
                          <span className={`text-[9px] ${isActive ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            {gi.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Header with actions */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 bg-zinc-900/50">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                {searchQuery ? `Resultados (${visibleMembers.length})` : `Miembros (${visibleMembers.length})`}
              </span>
              <div className="flex items-center gap-1">
                {hasAnyFilter ? (
                  <button
                    onClick={handleClearAll}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-white/5"
                  >
                    <X className="w-2.5 h-2.5" />
                    Limpiar
                  </button>
                ) : (
                  <button
                    onClick={handleSelectAll}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-white/5"
                  >
                    <Check className="w-2.5 h-2.5" />
                    Todos
                  </button>
                )}
              </div>
            </div>

            {/* Members List */}
            <div className="overflow-y-auto flex-1 min-h-0 py-0.5">
              {/* "Todo el Equipo" option */}
              {!searchQuery && (
                <div
                  onClick={handleClearAll}
                  className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5 transition-colors ${
                    !hasAnyFilter ? 'bg-primary-500/10' : ''
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                    !hasAnyFilter ? 'bg-primary-500 border-primary-500' : 'border-zinc-600'
                  }`}>
                    {!hasAnyFilter && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-xs text-zinc-200 font-medium">Todo el Equipo</span>
                  <span className="ml-auto text-[10px] text-zinc-600">{teamMembers.length}</span>
                </div>
              )}

              {visibleMembers.length > 0 ? (
                visibleMembers.map(member => {
                  const isSelected = selectedMemberIds.includes(member.id);
                  const rolLabel = getRolLabel(member);
                  const rolClass = getRolClass(member);
                  return (
                    <div
                      key={member.id}
                      onClick={() => toggleTeamMember(member.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5 transition-colors ${
                        isSelected ? 'bg-primary-500/10' : ''
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'border-zinc-600'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`text-xs truncate ${member.is_active ? 'text-zinc-200' : 'text-zinc-500'}`}>
                          {member.nombre} {member.apellido}
                        </span>
                        {searchQuery && member.email && (
                          <span className="text-[10px] text-zinc-500 truncate">{member.email}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                        {rolLabel && (
                          <span className={`text-[9px] px-1 py-0.5 rounded ${rolClass}`}>
                            {rolLabel}
                          </span>
                        )}
                        {!member.is_active && (
                          <span className="text-[9px] text-zinc-600 bg-zinc-800/50 px-1 py-0.5 rounded">off</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-zinc-500">Sin resultados</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-[10px] text-primary-400 hover:text-primary-300 mt-1"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamMemberFilter;
