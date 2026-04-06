/**
 * Transcripcion Store — Store independiente para el módulo Transcripciones
 * 
 * Gestiona la lista de transcripciones de Nylas Notetaker por empresa,
 * con filtrado por rol y búsqueda.
 * 
 * Solo consume: supabase client + selectedEnterpriseId/userContext de contactStore.
 * 
 * @module store/transcripcionStore
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import {
  TranscripcionWithContext,
  TranscripcionFilters,
  DEFAULT_TRANSCRIPCION_FILTERS,
} from '../types/transcripcion';

// ============================================================================
// CACHE CONFIG
// ============================================================================

const CACHE_DURATION_MS = 300000; // 5 minutos
const PAGE_SIZE = 20;

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface TranscripcionState {
  // Data
  transcripciones: TranscripcionWithContext[];
  selectedTranscripcion: TranscripcionWithContext | null;

  // UI State
  filters: TranscripcionFilters;
  view: 'list' | 'detail';

  // Loading States
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;

  // Pagination
  page: number;
  hasMore: boolean;

  // Cache
  lastFetchTime: number | null;
  lastEnterpriseId: number | null;
  // Cached grant_id → member lookup (shared across pages)
  _grantMap: Map<string, { id: number; nombre: string; apellido: string; empresa_id: number }> | null;
  _fetchParams: { enterpriseId: number; userRoleId: number; userId: number; userGrantId?: string | null } | null;

  // Actions
  fetchTranscripciones: (enterpriseId: number, userRoleId: number, userId: number, userGrantId?: string | null) => Promise<void>;
  fetchMore: () => Promise<void>;
  selectTranscripcion: (transcripcion: TranscripcionWithContext | null) => void;
  setFilters: (filters: Partial<TranscripcionFilters>) => void;
  resetFilters: () => void;
  setView: (view: 'list' | 'detail') => void;
  clearStore: () => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useTranscripcionStore = create<TranscripcionState>((set, get) => ({
  // Initial state
  transcripciones: [],
  selectedTranscripcion: null,
  filters: { ...DEFAULT_TRANSCRIPCION_FILTERS },
  view: 'list',
  isLoading: false,
  isLoadingMore: false,
  error: null,
  page: 0,
  hasMore: true,
  lastFetchTime: null,
  lastEnterpriseId: null,
  _grantMap: null,
  _fetchParams: null,

  // ========================================================================
  // FETCH TRANSCRIPCIONES
  // ========================================================================
  fetchTranscripciones: async (enterpriseId, userRoleId, userId, userGrantId) => {
    const { lastFetchTime, lastEnterpriseId, isLoading } = get();

    // Dedup guard
    if (isLoading) return;

    // Cache check (same enterprise, within TTL)
    if (
      lastEnterpriseId === enterpriseId &&
      lastFetchTime &&
      Date.now() - lastFetchTime < CACHE_DURATION_MS
    ) {
      logger.debug('[TranscripcionStore] Cache hit, skipping fetch');
      return;
    }

    set({ isLoading: true, error: null, transcripciones: [], page: 0, hasMore: true });

    // Save params for fetchMore
    const fetchParams = { enterpriseId, userRoleId, userId, userGrantId };

    try {
      // 1. Fetch grant_id mapping for the enterprise
      const { data: grantMembers } = await supabase
        .from('wp_team_humano')
        .select('id, nombre, apellido, empresa_id, grant_id')
        .eq('empresa_id', enterpriseId)
        .not('grant_id', 'is', null);

      const grantMap = new Map<string, { id: number; nombre: string; apellido: string; empresa_id: number }>();
      const grantIds: string[] = [];
      
      if (grantMembers) {
        for (const m of grantMembers) {
          if (m.grant_id) {
            grantMap.set(m.grant_id, m);
            grantIds.push(m.grant_id);
          }
        }
      }

      // If no team members have Nylas connected, there can't be transcriptions
      if (grantIds.length === 0) {
        set({
          transcripciones: [],
          isLoading: false,
          page: 0,
          hasMore: false,
          lastFetchTime: Date.now(),
          lastEnterpriseId: enterpriseId,
          _grantMap: grantMap,
          _fetchParams: fetchParams,
        });
        return;
      }

      // 2. Fetch transcriptions for this enterprise (Parallel explicit fetch)
      const rangeFrom = 0;
      const rangeTo = PAGE_SIZE - 1;

      // Query A: Transcripciones with a cita belonging to this enterprise
      const queryCitas = supabase
        .from('transcripciones')
        .select(`
          *,
          cita:wp_citas!inner (
            id,
            titulo,
            fecha_hora,
            estado,
            empresa_id,
            team_humano_id,
            contacto_id,
            ubicacion,
            contact:wp_contactos (
              nombre,
              apellido
            ),
            team_member:wp_team_humano (
              nombre,
              apellido
            )
          )
        `)
        .eq('cita.empresa_id', enterpriseId)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo);

      // Query B: Transcripciones without cita, but grant_id belongs to this enterprise
      let queryNoCitas: any = null;
      if (grantIds.length > 0) {
        queryNoCitas = supabase
          .from('transcripciones')
          .select(`
            *,
            cita:wp_citas (
              id,
              titulo,
              fecha_hora,
              estado,
              empresa_id,
              team_humano_id,
              contacto_id,
              ubicacion,
              contact:wp_contactos (
                nombre,
                apellido
              ),
              team_member:wp_team_humano (
                nombre,
                apellido
              )
            )
          `)
          .is('cita_id', null)
          .in('grant_id', grantIds)
          .order('created_at', { ascending: false })
          .range(rangeFrom, rangeTo);
      }

      const [resCitas, resNoCitas] = await Promise.all([
        queryCitas,
        queryNoCitas ? queryNoCitas : Promise.resolve({ data: [], error: null })
      ]);

      if (resCitas.error) {
        logger.error('[TranscripcionStore] Fetch error (Citas):', resCitas.error);
        set({ error: resCitas.error.message, isLoading: false });
        return;
      }
      if (resNoCitas.error) {
        logger.error('[TranscripcionStore] Fetch error (No Citas):', resNoCitas.error);
        set({ error: resNoCitas.error.message, isLoading: false });
        return;
      }

      // Merge, sort, and slice to PAGE_SIZE
      const rowsCitas = resCitas.data || [];
      const rowsNoCitas = resNoCitas.data || [];
      
      const mergedRows = [...rowsCitas, ...rowsNoCitas]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, PAGE_SIZE);

      const transformed = transformRows(mergedRows, grantMap);

      logger.debug(`[TranscripcionStore] Page 0: Fetched ${rowsCitas.length} with cita, ${rowsNoCitas.length} without. Merged to ${mergedRows.length}`);

      set({
        transcripciones: transformed,
        isLoading: false,
        page: 0,
        hasMore: mergedRows.length === PAGE_SIZE,
        lastFetchTime: Date.now(),
        lastEnterpriseId: enterpriseId,
        _grantMap: grantMap,
        _fetchParams: fetchParams,
      });
    } catch (err: any) {
      logger.error('[TranscripcionStore] Exception:', err);
      set({ error: err.message || 'Error al cargar transcripciones', isLoading: false });
    }
  },

  // ========================================================================
  // FETCH MORE (infinite scroll)
  // ========================================================================
  fetchMore: async () => {
    const { isLoadingMore, isLoading, hasMore, page, _grantMap, _fetchParams, transcripciones } = get();

    if (isLoadingMore || isLoading || !hasMore || !_fetchParams) return;

    set({ isLoadingMore: true });

    try {
      const nextPage = page + 1;
      const rangeFrom = nextPage * PAGE_SIZE;
      const rangeTo = rangeFrom + PAGE_SIZE - 1;

      // Filter by the cached grant_ids to maintain enterprise scope
      const grantIds = Array.from(_grantMap ? _grantMap.keys() : []);
      
      const queryCitas = supabase
        .from('transcripciones')
        .select(`
          *,
          cita:wp_citas!inner (
            id,
            titulo,
            fecha_hora,
            estado,
            empresa_id,
            team_humano_id,
            contacto_id,
            ubicacion,
            contact:wp_contactos (
              nombre,
              apellido
            ),
            team_member:wp_team_humano (
              nombre,
              apellido
            )
          )
        `)
        .eq('cita.empresa_id', _fetchParams.enterpriseId)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo);

      let queryNoCitas: any = null;
      if (grantIds.length > 0) {
        queryNoCitas = supabase
          .from('transcripciones')
          .select(`
            *,
            cita:wp_citas (
              id,
              titulo,
              fecha_hora,
              estado,
              empresa_id,
              team_humano_id,
              contacto_id,
              ubicacion,
              contact:wp_contactos (
                nombre,
                apellido
              ),
              team_member:wp_team_humano (
                nombre,
                apellido
              )
            )
          `)
          .is('cita_id', null)
          .in('grant_id', grantIds)
          .order('created_at', { ascending: false })
          .range(rangeFrom, rangeTo);
      }

      const [resCitas, resNoCitas] = await Promise.all([
        queryCitas,
        queryNoCitas ? queryNoCitas : Promise.resolve({ data: [], error: null })
      ]);

      if (resCitas.error) {
        logger.error('[TranscripcionStore] FetchMore error (Citas):', resCitas.error);
        set({ isLoadingMore: false });
        return;
      }
      if (resNoCitas.error) {
        logger.error('[TranscripcionStore] FetchMore error (No Citas):', resNoCitas.error);
        set({ isLoadingMore: false });
        return;
      }

      const rowsCitas = resCitas.data || [];
      const rowsNoCitas = resNoCitas.data || [];
      
      const mergedRows = [...rowsCitas, ...rowsNoCitas]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, PAGE_SIZE);

      const transformed = transformRows(mergedRows, _grantMap || new Map());

      logger.debug(`[TranscripcionStore] Page ${nextPage}: Fetched ${rowsCitas.length} with cita, ${rowsNoCitas.length} without. Merged to ${mergedRows.length}`);

      set({
        transcripciones: [...transcripciones, ...transformed],
        isLoadingMore: false,
        page: nextPage,
        hasMore: mergedRows.length === PAGE_SIZE,
      });
    } catch (err: any) {
      logger.error('[TranscripcionStore] FetchMore exception:', err);
      set({ isLoadingMore: false });
    }
  },

  // ========================================================================
  // SELECTION
  // ========================================================================
  selectTranscripcion: (transcripcion) => {
    set({
      selectedTranscripcion: transcripcion,
      view: transcripcion ? 'detail' : 'list',
    });
  },

  // ========================================================================
  // FILTERS
  // ========================================================================
  setFilters: (partial) => {
    set(state => ({
      filters: { ...state.filters, ...partial },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_TRANSCRIPCION_FILTERS } });
  },

  // ========================================================================
  // VIEW
  // ========================================================================
  setView: (view) => {
    set({ view });
    if (view === 'list') {
      set({ selectedTranscripcion: null });
    }
  },

  // ========================================================================
  // CLEAR
  // ========================================================================
  clearStore: () => {
    set({
      transcripciones: [],
      selectedTranscripcion: null,
      filters: { ...DEFAULT_TRANSCRIPCION_FILTERS },
      view: 'list',
      isLoading: false,
      isLoadingMore: false,
      error: null,
      page: 0,
      hasMore: true,
      lastFetchTime: null,
      lastEnterpriseId: null,
      _grantMap: null,
      _fetchParams: null,
    });
  },
}));

// ============================================================================
// TRANSFORM HELPER (shared between fetchTranscripciones and fetchMore)
// ============================================================================

function transformRows(
  rows: any[],
  grantMap: Map<string, { id: number; nombre: string; apellido: string; empresa_id: number }>
): TranscripcionWithContext[] {
  return rows.map((row: any) => {
    const cita = row.cita;
    const fallbackMember = !cita && row.grant_id ? grantMap.get(row.grant_id) : null;
    return {
      id: row.id,
      created_at: row.created_at,
      grant_id: row.grant_id,
      transcripcion: row.transcripcion,
      notetaker_id: row.notetaker_id,
      duracion: row.duracion,
      resumen: row.resumen,
      cita_id: row.cita_id,
      resumen_cita: row.resumen_cita,
      reunion_id: row.reunion_id,
      cita_titulo: cita?.titulo || null,
      cita_fecha: cita?.fecha_hora || null,
      cita_estado: cita?.estado || null,
      cita_empresa_id: cita?.empresa_id || fallbackMember?.empresa_id || null,
      cita_team_humano_id: cita?.team_humano_id || fallbackMember?.id || null,
      cita_contacto_id: cita?.contacto_id || null,
      cita_ubicacion: cita?.ubicacion || null,
      asesor_nombre: cita?.team_member?.nombre || fallbackMember?.nombre || null,
      asesor_apellido: cita?.team_member?.apellido || fallbackMember?.apellido || null,
      contacto_nombre: cita?.contact?.nombre || null,
      contacto_apellido: cita?.contact?.apellido || null,
    };
  });
}

// ============================================================================
// SELECTORS
// ============================================================================

export const selectTranscripciones = (s: TranscripcionState) => s.transcripciones;
export const selectSelectedTranscripcion = (s: TranscripcionState) => s.selectedTranscripcion;
export const selectTranscripcionFilters = (s: TranscripcionState) => s.filters;
export const selectTranscripcionView = (s: TranscripcionState) => s.view;
export const selectIsLoadingTranscripciones = (s: TranscripcionState) => s.isLoading;
export const selectIsLoadingMore = (s: TranscripcionState) => s.isLoadingMore;
export const selectHasMore = (s: TranscripcionState) => s.hasMore;
export const selectTranscripcionError = (s: TranscripcionState) => s.error;
