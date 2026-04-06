'use client';

import React, { useEffect, useMemo } from 'react';
import {
  Search,
  Loader2,
  PenTool,
  X,
  Filter,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useRedaccionStore, selectRedacciones, selectTipos, selectIsLoadingRedacciones, selectIsLoadingTipos, selectRedaccionFilters, selectRedaccionView, selectRedaccionError, selectShowGenerator } from '@/store/redaccionStore';
import { useContactStore, selectSelectedEnterpriseId } from '@/store/contactStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { RedaccionEstado, ESTADO_CONFIG } from '@/types/redaccion';
import { RedaccionCard } from './RedaccionCard';
import { RedaccionDetail } from './RedaccionDetail';
import { TiposManager } from './TiposManager';
import { RedaccionGenerator } from './RedaccionGenerator';

// ============================================================================
// REDACCION VIEW — Vista principal del módulo Lab Redacción
// ============================================================================

export const RedaccionView: React.FC = () => {
  const enterpriseId = useContactStore(selectSelectedEnterpriseId);

  // Store state
  const redacciones = useRedaccionStore(selectRedacciones);
  const tipos = useRedaccionStore(selectTipos);
  const isLoadingRedacciones = useRedaccionStore(selectIsLoadingRedacciones);
  const isLoadingTipos = useRedaccionStore(selectIsLoadingTipos);
  const filters = useRedaccionStore(selectRedaccionFilters);
  const view = useRedaccionStore(selectRedaccionView);
  const error = useRedaccionStore(selectRedaccionError);
  const showTiposManager = useRedaccionStore(state => state.showTiposManager);
  const setShowTiposManager = useRedaccionStore(state => state.setShowTiposManager);
  const showGenerator = useRedaccionStore(selectShowGenerator);
  const setShowGenerator = useRedaccionStore(state => state.setShowGenerator);

  // Store actions
  const fetchTipos = useRedaccionStore(state => state.fetchTipos);
  const fetchRedacciones = useRedaccionStore(state => state.fetchRedacciones);
  const setFilters = useRedaccionStore(state => state.setFilters);
  const resetFilters = useRedaccionStore(state => state.resetFilters);
  const selectRedaccion = useRedaccionStore(state => state.selectRedaccion);

  // Engagement tracking
  usePageTracking('redaccion');
  const trackAction = useActionTracking('redaccion');

  // Fetch data when enterprise changes
  useEffect(() => {
    if (enterpriseId) {
      fetchTipos(enterpriseId);
      fetchRedacciones(enterpriseId);
    }
  }, [enterpriseId, fetchTipos, fetchRedacciones]);

  // Filtered redacciones (client-side filtering)
  const filteredRedacciones = useMemo(() => {
    return redacciones.filter(r => {
      // Search filter
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesSearch =
          r.nombre.toLowerCase().includes(q) ||
          r.descripcion?.toLowerCase().includes(q) ||
          r.tipo?.nombre.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Tipo filter
      if (filters.tipoId !== null && r.tipo_id !== filters.tipoId) return false;

      // Estado filter
      if (filters.estado !== null && r.estado !== filters.estado) return false;

      return true;
    });
  }, [redacciones, filters]);

  const isLoading = isLoadingRedacciones || isLoadingTipos;
  const hasActiveFilters = filters.search || filters.tipoId !== null || filters.estado !== null;

  // If in detail view, render detail component
  if (view === 'detail') {
    return <RedaccionDetail />;
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0c]">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-zinc-800/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-100">Lab Redacción</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && (
              <span className="text-xs text-zinc-600">
                {filteredRedacciones.length} de {redacciones.length} documentos
              </span>
            )}
            <button
              onClick={() => setShowGenerator(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors text-xs font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generar con IA
            </button>
            <button
              onClick={() => setShowTiposManager(true)}
              className="p-1.5 rounded-lg hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Administrar tipos de documento"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar documentos..."
              value={filters.search}
              onChange={(e) => {
                setFilters({ search: e.target.value });
                trackAction('redaccion.search', { query: e.target.value });
              }}
              className="w-full pl-9 pr-8 py-2 bg-zinc-900/80 border border-zinc-800/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50 transition-colors"
            />
            {filters.search && (
              <button
                onClick={() => setFilters({ search: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tipo filter */}
          <select
            value={filters.tipoId ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              setFilters({ tipoId: val });
              trackAction('redaccion.filter_tipo', { tipoId: val });
            }}
            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800/50 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-primary-500/50 transition-colors min-w-[140px]"
          >
            <option value="">Todos los tipos</option>
            {tipos.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>

          {/* Estado filter */}
          <select
            value={filters.estado ?? ''}
            onChange={(e) => {
              const val = (e.target.value || null) as RedaccionEstado | null;
              setFilters({ estado: val });
              trackAction('redaccion.filter_estado', { estado: val });
            }}
            className="px-3 py-2 bg-zinc-900/80 border border-zinc-800/50 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-primary-500/50 transition-colors min-w-[130px]"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          {/* Reset filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                resetFilters();
                trackAction('redaccion.reset_filters');
              }}
              className="p-2 rounded-lg border border-zinc-800/50 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
              title="Limpiar filtros"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
              <span className="text-xs text-zinc-500">Cargando documentos...</span>
            </div>
          </div>
        ) : filteredRedacciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
            <PenTool className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">
              {hasActiveFilters
                ? 'No se encontraron documentos con esos filtros'
                : 'No hay documentos de redacción'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRedacciones.map(r => (
              <RedaccionCard
                key={r.id}
                redaccion={r}
                onSelect={(redaccion) => {
                  trackAction('redaccion.open', { redaccionId: redaccion.id });
                  selectRedaccion(redaccion);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 p-3 border-t border-zinc-800/50 text-xs text-zinc-500 text-center">
        {filteredRedacciones.length} de {redacciones.length} documentos
      </div>
      {/* Tipos Manager Modal */}
      {showTiposManager && <TiposManager />}
      {/* Generator Modal */}
      {showGenerator && <RedaccionGenerator />}
    </div>
  );
};

export default RedaccionView;
