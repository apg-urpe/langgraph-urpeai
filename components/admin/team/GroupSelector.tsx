'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Users,
  Briefcase,
  Crown,
  Shield,
  Star,
  Tag,
  Heart,
  Zap,
  Target,
  Award,
  Plus,
  Search,
  Loader2,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useTeamStore } from '../../../store/teamStore';
import { TeamGroupConfig } from '../../../types/team';

// ── Icon & Color maps (shared with TeamView) ──

const ICON_MAP: Record<string, React.ElementType> = {
  Users, Briefcase, Crown, Shield, Star, Tag, Heart, Zap, Target, Award,
};

const getIcon = (name: string): React.ElementType => ICON_MAP[name] || Tag;

const COLOR_DOT: Record<string, string> = {
  blue:    'bg-blue-400',
  purple:  'bg-purple-400',
  amber:   'bg-amber-400',
  emerald: 'bg-emerald-400',
  red:     'bg-red-400',
  cyan:    'bg-cyan-400',
  pink:    'bg-pink-400',
};

const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: 'blue',    label: 'Azul' },
  { value: 'purple',  label: 'Morado' },
  { value: 'amber',   label: 'Ámbar' },
  { value: 'emerald', label: 'Verde' },
  { value: 'red',     label: 'Rojo' },
  { value: 'cyan',    label: 'Cyan' },
  { value: 'pink',    label: 'Rosa' },
];

// ── Props ──

interface GroupSelectorProps {
  value: string;
  onChange: (slug: string) => void;
  empresaId: number | null;
  disabled?: boolean;
}

// ── Component ──

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  value,
  onChange,
  empresaId,
  disabled = false,
}) => {
  const groups = useTeamStore(state => state.groups);
  const isLoadingGroups = useTeamStore(state => state.isLoadingGroups);
  const fetchGroups = useTeamStore(state => state.fetchGroups);
  const createGroup = useTeamStore(state => state.createGroup);

  // Safety net: fetch groups if empty and empresaId available
  useEffect(() => {
    if (empresaId && groups.length === 0 && !isLoadingGroups) {
      fetchGroups(empresaId);
    }
  }, [empresaId, groups.length, isLoadingGroups, fetchGroups]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = groups.find(g => g.slug === value);
  const SelectedIcon = selected ? getIcon(selected.icon) : Tag;

  const handleSelect = useCallback((slug: string) => {
    onChange(slug);
    setOpen(false);
    setSearch('');
    setShowCreate(false);
  }, [onChange]);

  const handleCreate = async () => {
    if (!newName.trim() || !empresaId) return;
    setIsCreating(true);
    setCreateError(null);

    const result = await createGroup(empresaId, newName.trim(), 'Users', newColor);

    if (result) {
      handleSelect(result.slug);
      setNewName('');
      setNewColor('blue');
      setShowCreate(false);
    } else {
      const err = useTeamStore.getState().error;
      setCreateError(err || 'Error al crear grupo');
    }
    setIsCreating(false);
  };

  // ── Trigger button ──
  const triggerLabel = isLoadingGroups
    ? 'Cargando...'
    : selected
      ? selected.name
      : value || 'Seleccionar grupo';

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled || isLoadingGroups}
        onClick={() => setOpen(!open)}
        className={`
          w-full flex items-center gap-2 bg-[#131316] border border-white/10 rounded-lg px-3 py-2 text-sm text-left transition-colors
          ${open ? 'border-primary-500/50 ring-1 ring-primary-500/20' : 'hover:border-white/20'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isLoadingGroups ? (
          <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin shrink-0" />
        ) : selected ? (
          <>
            <div className={`w-2 h-2 rounded-full shrink-0 ${COLOR_DOT[selected.color] || COLOR_DOT.blue}`} />
            <SelectedIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </>
        ) : (
          <Tag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
        <span className={`flex-1 truncate ${selected ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {triggerLabel}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#131316] border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar grupo..."
                className="w-full bg-black/30 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-primary-500/30 transition-colors"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && !isLoadingGroups && (
              <div className="px-3 py-3 text-center text-xs text-zinc-500">
                {search ? 'Sin resultados' : 'No hay grupos'}
              </div>
            )}
            {filtered.map(g => {
              const GIcon = getIcon(g.icon);
              const isSelected = g.slug === value;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleSelect(g.slug)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors
                    ${isSelected
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100'
                    }
                  `}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${COLOR_DOT[g.color] || COLOR_DOT.blue}`} />
                  <GIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{g.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Divider + Create */}
          <div className="border-t border-white/5">
            {!showCreate ? (
              <button
                type="button"
                onClick={() => { setShowCreate(true); setCreateError(null); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary-400 hover:bg-primary-500/5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear nuevo grupo
              </button>
            ) : (
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.slice(0, 30))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
                    placeholder="Nombre del grupo..."
                    maxLength={30}
                    autoFocus
                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-primary-500/30 transition-colors"
                  />
                  <select
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none appearance-none cursor-pointer"
                  >
                    {COLOR_OPTIONS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newName.trim() || isCreating}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-primary-500 hover:bg-primary-600 text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); setNewName(''); setCreateError(null); }}
                    className="px-2.5 py-1 text-[11px] rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>

                {createError && (
                  <p className="text-[10px] text-red-400">{createError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
