'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ChevronDown,
  Star,
  TrendingUp,
  Headphones,
  Megaphone,
  BarChart3,
  Wand2,
  Check,
  Plus,
  Settings
} from 'lucide-react';
import { useMonicaRolesStore, useActiveMonicaRole } from '../../store/monicaRolesStore';
import { MonicaRole, MonicaRolePreview, MonicaRoleCategory, getRoleColorClasses } from '../../types/monica';
import { RoleEditorModal } from './RoleEditorModal';

const CATEGORY_ICONS: Record<MonicaRoleCategory, React.ElementType> = {
  general: Sparkles,
  ventas: TrendingUp,
  soporte: Headphones,
  marketing: Megaphone,
  analisis: BarChart3,
  custom: Wand2
};

interface RoleSelectorProps {
  compact?: boolean;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<MonicaRole | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Store
  const roles = useMonicaRolesStore(state => state.roles);
  const activeRoleId = useMonicaRolesStore(state => state.activeRoleId);
  const favorites = useMonicaRolesStore(state => state.favorites);
  const isLoading = useMonicaRolesStore(state => state.isLoading);
  const fetchRoles = useMonicaRolesStore(state => state.fetchRoles);
  const setActiveRole = useMonicaRolesStore(state => state.setActiveRole);
  const toggleFavorite = useMonicaRolesStore(state => state.toggleFavorite);

  const activeRole = useActiveMonicaRole();

  // Fetch roles on mount
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get role previews with favorites
  const rolePreviews: MonicaRolePreview[] = roles.map(r => ({
    id: r.id,
    nombre: r.nombre,
    slug: r.slug,
    descripcion: r.descripcion,
    avatar_url: r.avatar_url,
    color_theme: r.color_theme,
    icono: r.icono,
    is_default: r.is_default,
    is_favorite: favorites.includes(r.id),
    categoria: r.categoria,
    usage_count: r.usage_count
  }));

  // Sort: favorites first, then default, then by usage
  const sortedRoles = [...rolePreviews].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return b.usage_count - a.usage_count;
  });

  const handleSelectRole = (roleId: string) => {
    setActiveRole(roleId);
    setIsOpen(false);
  };

  const handleToggleFavorite = (e: React.MouseEvent, roleId: string) => {
    e.stopPropagation();
    toggleFavorite(roleId);
  };

  // Get icon component for role
  const getRoleIcon = (categoria: MonicaRoleCategory) => {
    return CATEGORY_ICONS[categoria] || Sparkles;
  };

  // Current role display
  const currentRoleIcon = activeRole ? getRoleIcon(activeRole.categoria) : Sparkles;
  const CurrentIcon = currentRoleIcon;
  const colorClasses = activeRole ? getRoleColorClasses(activeRole.color_theme) : getRoleColorClasses('cyan');

  if (isLoading && roles.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 animate-pulse">
        <div className="w-4 h-4 rounded bg-white/10" />
        <div className="w-16 h-3 rounded bg-white/10" />
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all hover:bg-white/5 active:scale-95 ${
          isOpen ? 'bg-white/5' : ''
        }`}
      >
        <div className={`w-5 h-5 rounded-md ${colorClasses.bg} ${colorClasses.border} border flex items-center justify-center`}>
          <CurrentIcon className={`w-3 h-3 ${colorClasses.text}`} />
        </div>
        {!compact && (
          <>
            <span className="text-xs font-medium text-zinc-300 max-w-[100px] truncate">
              {activeRole?.nombre || 'Monica'}
            </span>
            <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-[#0a0a0c] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-pop-in backdrop-blur-2xl z-50">
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/5">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Rol de Monica</p>
          </div>

          {/* Roles List */}
          <div className="max-h-64 overflow-y-auto scrollbar-thin">
            {sortedRoles.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-xs">
                No hay roles disponibles
              </div>
            ) : (
              sortedRoles.map((role) => {
                const RoleIcon = getRoleIcon(role.categoria);
                const roleColors = getRoleColorClasses(role.color_theme);
                const isActive = role.id === activeRoleId || (role.is_default && !activeRoleId);

                return (
                  <div
                    key={role.id}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all hover:bg-white/5 cursor-pointer ${
                      isActive ? 'bg-white/5' : ''
                    }`}
                    onClick={() => handleSelectRole(role.id)}
                  >
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg ${roleColors.bg} ${roleColors.border} border flex items-center justify-center flex-shrink-0`}>
                      <RoleIcon className={`w-4 h-4 ${roleColors.text}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-200 truncate">
                          {role.nombre}
                        </span>
                        {role.is_default && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-primary-500/20 text-primary-400 rounded">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      {role.descripcion && (
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {role.descripcion}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Favorite */}
                      <button
                        onClick={(e) => handleToggleFavorite(e, role.id)}
                        className={`p-1 rounded transition-all hover:bg-white/10 ${
                          role.is_favorite ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${role.is_favorite ? 'fill-current' : ''}`} />
                      </button>

                      {/* Active indicator */}
                      {isActive && (
                        <Check className="w-4 h-4 text-primary-400" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer - Create New */}
          <div className="p-2 border-t border-white/5 bg-white/[0.02]">
            <button
              onClick={() => {
                setEditingRole(null);
                setIsEditorOpen(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-primary-400 hover:bg-primary-500/10 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-medium">Crear Nuevo Agente</span>
            </button>
          </div>
        </div>
      )}

      {/* Role Editor Modal */}
      <RoleEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingRole(null);
        }}
        editingRole={editingRole}
      />
    </div>
  );
};
