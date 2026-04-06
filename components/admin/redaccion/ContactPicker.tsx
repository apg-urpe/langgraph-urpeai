'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, User, X, Loader2, Phone, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

// ============================================================================
// TYPES
// ============================================================================

interface ContactOption {
  id: number;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
}

interface ContactPickerProps {
  empresaId: number | null;
  selectedContactId: number | null;
  selectedContactName?: string | null;
  onSelect: (contactId: number | null, contact?: ContactOption | null) => void;
  onNavigate?: (contactId: number) => void;
  compact?: boolean;
}

// ============================================================================
// CONTACT PICKER — Mini-selector de contactos por empresa
// ============================================================================

export const ContactPicker: React.FC<ContactPickerProps> = ({
  empresaId,
  selectedContactId,
  selectedContactName,
  onSelect,
  onNavigate,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  // Search contacts
  const searchContacts = useCallback(async (query: string) => {
    if (!empresaId) return;
    setIsLoading(true);

    try {
      let q = supabase
        .from('wp_contactos')
        .select('id, nombre, apellido, telefono')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true })
        .limit(15);

      if (query.trim()) {
        q = q.or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,telefono.ilike.%${query}%`);
      }

      const { data, error } = await q;
      if (error) {
        console.error('[ContactPicker] Error:', error);
        return;
      }
      setOptions(data || []);
    } catch (err) {
      console.error('[ContactPicker] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchContacts(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, isOpen, searchContacts]);

  // Load initial on open
  useEffect(() => {
    if (isOpen && options.length === 0) {
      searchContacts('');
    }
  }, [isOpen, searchContacts, options.length]);

  const formatName = (c: ContactOption) => {
    const parts = [c.nombre, c.apellido].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : c.telefono || `#${c.id}`;
  };

  const displayLabel = selectedContactName
    || (selectedContactId ? `Contacto #${selectedContactId}` : null);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      {selectedContactId ? (
        <div className={`flex items-center gap-1.5 ${compact ? '' : 'px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20'}`}>
          <button
            onClick={() => onNavigate?.(selectedContactId)}
            className={`flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 hover:underline transition-colors ${compact ? '' : 'flex-1 min-w-0'}`}
            title="Ver contacto"
          >
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-zinc-600 hover:text-cyan-400 transition-colors shrink-0"
            title="Cambiar contacto"
          >
            <RefreshCw className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => onSelect(null, null)}
            className="text-zinc-600 hover:text-rose-400 transition-colors shrink-0"
            title="Desvincular contacto"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            compact
              ? 'text-zinc-500 hover:text-zinc-300'
              : 'px-2.5 py-1.5 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 hover:bg-white/[0.02]'
          }`}
        >
          <User className="w-3 h-3" />
          Vincular contacto
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-[#131316] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contacto..."
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/30"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[240px] overflow-y-auto py-1 custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              </div>
            ) : options.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-600">
                {search ? 'Sin resultados' : 'Sin contactos'}
              </div>
            ) : (
              options.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelect(c.id, c);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all text-xs
                    ${selectedContactId === c.id
                      ? 'bg-primary-500/10 text-primary-300'
                      : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                    }
                  `}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{formatName(c)}</p>
                    {c.telefono && (
                      <p className="text-[10px] text-zinc-600 flex items-center gap-1 mt-0.5">
                        <Phone className="w-2.5 h-2.5" />
                        {c.telefono}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
