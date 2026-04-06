/**
 * Redaccion Store — Store independiente para el módulo Lab Redacción
 * 
 * Gestiona:
 * - Tipos de documento (redaccion_tipos)
 * - Documentos (redaccion)
 * - Secciones/detalles de documentos (redaccion_detalles)
 * 
 * Sin dependencias bloqueantes del resto del sistema.
 * Solo consume: supabase client + selectedEnterpriseId de contactStore.
 * 
 * @module store/redaccionStore
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import {
  RedaccionTipo,
  Redaccion,
  RedaccionDetalle,
  RedaccionFilters,
  RedaccionEstado,
  DEFAULT_REDACCION_FILTERS,
  GenerateRedaccionRequest,
  GenerationProgress,
  GenerationSSEEvent,
  INITIAL_GENERATION_PROGRESS,
  ContextSource,
  ContextOrganized,
  ContextPhase,
} from '../types/redaccion';

// ============================================================================
// CACHE CONFIG
// ============================================================================

const CACHE_DURATION_MS = 300000; // 5 minutos

// ============================================================================
// HISTORIAL TYPE
// ============================================================================

export interface DetalleHistorial {
  id: number;
  detalle_id: number;
  empresa_id: number;
  titulo: string | null;
  contenido: string | null;
  changed_by: string | null;
  change_type: 'manual' | 'ai_assist' | 'ai_generate';
  change_summary: string | null;
  created_at: string;
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface RedaccionState {
  // Data
  tipos: RedaccionTipo[];
  redacciones: Redaccion[];
  detalles: RedaccionDetalle[];
  selectedRedaccion: Redaccion | null;

  // UI State
  filters: RedaccionFilters;
  view: 'list' | 'detail';

  // Loading States
  isLoadingTipos: boolean;
  isLoadingRedacciones: boolean;
  isLoadingDetalles: boolean;
  isSavingTipo: boolean;
  error: string | null;

  // Cache
  lastFetchTipos: number | null;
  lastFetchRedacciones: number | null;
  lastEnterpriseId: number | null;

  // CRUD Tipos UI
  showTiposManager: boolean;
  setShowTiposManager: (show: boolean) => void;

  // Generation IA
  isGenerating: boolean;
  generationProgress: GenerationProgress;
  showGenerator: boolean;
  setShowGenerator: (show: boolean) => void;
  generationAbortController: AbortController | null;

  // Context Manager
  contextSources: ContextSource[];
  contextOrganized: ContextOrganized | null;
  contextPhase: ContextPhase;
  contextError: string | null;

  // ========== FETCH ACTIONS ==========
  fetchTipos: (empresaId: number) => Promise<void>;
  fetchRedacciones: (empresaId: number) => Promise<void>;
  fetchDetalles: (redaccionId: number) => Promise<void>;

  // ========== SELECTION ACTIONS ==========
  selectRedaccion: (redaccion: Redaccion | null) => void;
  goToList: () => void;

  // ========== FILTER ACTIONS ==========
  setFilters: (filters: Partial<RedaccionFilters>) => void;
  resetFilters: () => void;

  // ========== CRUD REDACCION ==========
  updateRedaccion: (id: number, changes: Partial<Pick<Redaccion, 'nombre' | 'descripcion' | 'estado' | 'url_doc' | 'contacto_id'>>) => Promise<boolean>;

  // ========== CRUD DETALLES ==========
  updateDetalle: (id: number, changes: Partial<Pick<RedaccionDetalle, 'titulo' | 'contenido' | 'orden'>>) => Promise<boolean>;

  // ========== HISTORIAL ==========
  detalleHistorial: DetalleHistorial[];
  isLoadingHistorial: boolean;
  fetchDetalleHistorial: (detalleId: number) => Promise<void>;
  restoreHistorial: (historialId: number) => Promise<boolean>;

  // ========== CRUD TIPOS ==========
  createTipo: (tipo: Omit<RedaccionTipo, 'id' | 'created_at' | 'updated_at'>) => Promise<RedaccionTipo | null>;
  updateTipo: (id: number, changes: Partial<Omit<RedaccionTipo, 'id' | 'created_at' | 'updated_at'>>) => Promise<boolean>;
  deleteTipo: (id: number) => Promise<boolean>;

  // ========== CONTEXT MANAGER ==========
  addContextSource: (source: ContextSource) => void;
  removeContextSource: (id: string) => void;
  processContext: (empresaId: number) => Promise<void>;
  clearContext: () => void;

  // ========== GENERATION IA ==========
  startGeneration: (params: GenerateRedaccionRequest) => Promise<void>;
  cancelGeneration: () => void;
  resetGeneration: () => void;

  // ========== UTILITY ==========
  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// SELECTORS
// ============================================================================

export const selectTipos = (state: RedaccionState) => state.tipos;
export const selectRedacciones = (state: RedaccionState) => state.redacciones;
export const selectDetalles = (state: RedaccionState) => state.detalles;
export const selectSelectedRedaccion = (state: RedaccionState) => state.selectedRedaccion;
export const selectRedaccionView = (state: RedaccionState) => state.view;
export const selectRedaccionFilters = (state: RedaccionState) => state.filters;
export const selectIsLoadingRedacciones = (state: RedaccionState) => state.isLoadingRedacciones;
export const selectIsLoadingDetalles = (state: RedaccionState) => state.isLoadingDetalles;
export const selectIsLoadingTipos = (state: RedaccionState) => state.isLoadingTipos;
export const selectRedaccionError = (state: RedaccionState) => state.error;
export const selectIsGenerating = (state: RedaccionState) => state.isGenerating;
export const selectGenerationProgress = (state: RedaccionState) => state.generationProgress;
export const selectShowGenerator = (state: RedaccionState) => state.showGenerator;
export const selectContextSources = (state: RedaccionState) => state.contextSources;
export const selectContextOrganized = (state: RedaccionState) => state.contextOrganized;
export const selectContextPhase = (state: RedaccionState) => state.contextPhase;
export const selectContextError = (state: RedaccionState) => state.contextError;

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useRedaccionStore = create<RedaccionState>()((set, get) => ({
  // Initial state
  tipos: [],
  redacciones: [],
  detalles: [],
  selectedRedaccion: null,
  filters: { ...DEFAULT_REDACCION_FILTERS },
  view: 'list',
  isLoadingTipos: false,
  isLoadingRedacciones: false,
  isLoadingDetalles: false,
  isSavingTipo: false,
  error: null,
  showTiposManager: false,
  setShowTiposManager: (show: boolean) => set({ showTiposManager: show }),
  isGenerating: false,
  generationProgress: { ...INITIAL_GENERATION_PROGRESS },
  showGenerator: false,
  setShowGenerator: (show: boolean) => set({ showGenerator: show }),
  generationAbortController: null,
  contextSources: [],
  contextOrganized: null,
  contextPhase: 'idle',
  contextError: null,
  lastFetchTipos: null,
  lastFetchRedacciones: null,
  lastEnterpriseId: null,
  detalleHistorial: [],
  isLoadingHistorial: false,

  // ========== FETCH ACTIONS ==========

  fetchTipos: async (empresaId: number) => {
    const { lastFetchTipos, lastEnterpriseId } = get();
    const now = Date.now();

    // Cache check: skip if same enterprise and cache is fresh
    if (
      lastEnterpriseId === empresaId &&
      lastFetchTipos &&
      now - lastFetchTipos < CACHE_DURATION_MS
    ) {
      logger.debug('[RedaccionStore] Tipos cache valid, skipping fetch');
      return;
    }

    set({ isLoadingTipos: true, error: null });

    try {
      const { data, error } = await supabase
        .from('redaccion_tipos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true });

      if (error) throw error;

      set({
        tipos: data || [],
        isLoadingTipos: false,
        lastFetchTipos: now,
        lastEnterpriseId: empresaId,
      });

      logger.debug('[RedaccionStore] Tipos loaded:', data?.length);
    } catch (err: any) {
      logger.error('[RedaccionStore] Error fetching tipos:', err);
      set({ isLoadingTipos: false, error: err.message || 'Error cargando tipos' });
    }
  },

  fetchRedacciones: async (empresaId: number) => {
    const { lastFetchRedacciones, lastEnterpriseId } = get();
    const now = Date.now();

    // Cache check
    if (
      lastEnterpriseId === empresaId &&
      lastFetchRedacciones &&
      now - lastFetchRedacciones < CACHE_DURATION_MS
    ) {
      logger.debug('[RedaccionStore] Redacciones cache valid, skipping fetch');
      return;
    }

    set({ isLoadingRedacciones: true, error: null });

    try {
      // Paso 1: obtener tipo_ids de la empresa
      const tipos = get().tipos;
      let tipoIds = tipos.map(t => t.id);

      // Si no hay tipos cargados aún, fetch directo
      if (tipoIds.length === 0) {
        const { data: tiposData, error: tiposError } = await supabase
          .from('redaccion_tipos')
          .select('id')
          .eq('empresa_id', empresaId);
        if (tiposError) throw tiposError;
        tipoIds = (tiposData || []).map(t => t.id);
      }

      if (tipoIds.length === 0) {
        set({ redacciones: [], isLoadingRedacciones: false, lastFetchRedacciones: now, lastEnterpriseId: empresaId });
        logger.debug('[RedaccionStore] No tipos for enterprise, 0 redacciones');
        return;
      }

      // Paso 2: fetch redacciones filtradas por tipo_id + join para datos del tipo
      const { data, error } = await supabase
        .from('redaccion')
        .select(`
          *,
          tipo:redaccion_tipos (
            id,
            nombre,
            partes,
            instrucciones,
            longitud,
            objetivo,
            requerimientos,
            empresa_id,
            created_at,
            updated_at
          ),
          contacto:wp_contactos (
            id,
            nombre,
            apellido,
            telefono
          )
        `)
        .in('tipo_id', tipoIds)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      set({
        redacciones: data || [],
        isLoadingRedacciones: false,
        lastFetchRedacciones: now,
        lastEnterpriseId: empresaId,
      });

      logger.debug('[RedaccionStore] Redacciones loaded:', data?.length);
    } catch (err: any) {
      logger.error('[RedaccionStore] Error fetching redacciones:', err);
      set({ isLoadingRedacciones: false, error: err.message || 'Error cargando redacciones' });
    }
  },

  fetchDetalles: async (redaccionId: number) => {
    set({ isLoadingDetalles: true, error: null });

    try {
      const { data, error } = await supabase
        .from('redaccion_detalles')
        .select('*')
        .eq('redaccion_id', redaccionId)
        .order('orden', { ascending: true });

      if (error) throw error;

      set({
        detalles: data || [],
        isLoadingDetalles: false,
      });

      logger.debug('[RedaccionStore] Detalles loaded:', data?.length, 'for redaccion:', redaccionId);
    } catch (err: any) {
      logger.error('[RedaccionStore] Error fetching detalles:', err);
      set({ isLoadingDetalles: false, error: err.message || 'Error cargando detalles' });
    }
  },

  // ========== SELECTION ACTIONS ==========

  selectRedaccion: (redaccion) => {
    set({ selectedRedaccion: redaccion, view: redaccion ? 'detail' : 'list', detalles: [] });
    if (redaccion) {
      get().fetchDetalles(redaccion.id);
    }
  },

  goToList: () => {
    set({ view: 'list', selectedRedaccion: null, detalles: [] });
  },

  // ========== FILTER ACTIONS ==========

  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_REDACCION_FILTERS } });
  },

  // ========== CRUD REDACCION ==========

  updateRedaccion: async (id, changes) => {
    const prev = get().selectedRedaccion;
    // Optimistic update
    if (prev && prev.id === id) {
      set({ selectedRedaccion: { ...prev, ...changes } as any });
    }
    try {
      const { data, error } = await supabase
        .from('redaccion')
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      set((state) => ({
        redacciones: state.redacciones.map(r => r.id === id ? { ...r, ...data } : r),
        selectedRedaccion: state.selectedRedaccion?.id === id ? { ...state.selectedRedaccion, ...data } : state.selectedRedaccion,
        lastFetchRedacciones: null,
      }));
      logger.debug('[RedaccionStore] Redaccion updated:', id);
      return true;
    } catch (err: any) {
      // Rollback
      if (prev && prev.id === id) set({ selectedRedaccion: prev });
      logger.error('[RedaccionStore] Error updating redaccion:', err);
      set({ error: err.message || 'Error actualizando documento' });
      return false;
    }
  },

  // ========== CRUD DETALLES ==========

  updateDetalle: async (id, changes) => {
    const prevDetalles = get().detalles;
    // Optimistic update
    set((state) => ({
      detalles: state.detalles.map(d => d.id === id ? { ...d, ...changes } : d),
    }));
    try {
      const { data, error } = await supabase
        .from('redaccion_detalles')
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      set((state) => ({
        detalles: state.detalles.map(d => d.id === id ? data : d),
      }));
      logger.debug('[RedaccionStore] Detalle updated:', id);
      return true;
    } catch (err: any) {
      // Rollback
      set({ detalles: prevDetalles });
      logger.error('[RedaccionStore] Error updating detalle:', err);
      set({ error: err.message || 'Error actualizando sección' });
      return false;
    }
  },

  // ========== HISTORIAL ==========

  fetchDetalleHistorial: async (detalleId: number) => {
    set({ isLoadingHistorial: true, detalleHistorial: [] });
    try {
      const { data, error } = await supabase
        .from('redaccion_detalle_historial')
        .select('*')
        .eq('detalle_id', detalleId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      set({ detalleHistorial: data || [], isLoadingHistorial: false });
    } catch (err: any) {
      logger.error('[RedaccionStore] Error fetching historial:', err);
      set({ isLoadingHistorial: false });
    }
  },

  restoreHistorial: async (historialId: number) => {
    const { detalleHistorial } = get();
    const entry = detalleHistorial.find(h => h.id === historialId);
    if (!entry) return false;

    const changes: Partial<Pick<RedaccionDetalle, 'titulo' | 'contenido'>> = {};
    if (entry.titulo !== null) changes.titulo = entry.titulo;
    if (entry.contenido !== null) changes.contenido = entry.contenido;

    return await get().updateDetalle(entry.detalle_id, changes);
  },

  // ========== CRUD TIPOS ==========

  createTipo: async (tipo) => {
    set({ isSavingTipo: true, error: null });
    try {
      const { data, error } = await supabase
        .from('redaccion_tipos')
        .insert(tipo)
        .select()
        .single();
      if (error) throw error;
      set((state) => ({
        tipos: [...state.tipos, data].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        isSavingTipo: false,
        lastFetchTipos: null,
      }));
      logger.debug('[RedaccionStore] Tipo created:', data.id);
      return data;
    } catch (err: any) {
      logger.error('[RedaccionStore] Error creating tipo:', err);
      set({ isSavingTipo: false, error: err.message || 'Error creando tipo' });
      return null;
    }
  },

  updateTipo: async (id, changes) => {
    set({ isSavingTipo: true, error: null });
    try {
      const { data, error } = await supabase
        .from('redaccion_tipos')
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      set((state) => ({
        tipos: state.tipos.map(t => t.id === id ? data : t).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        isSavingTipo: false,
        lastFetchTipos: null,
      }));
      logger.debug('[RedaccionStore] Tipo updated:', id);
      return true;
    } catch (err: any) {
      logger.error('[RedaccionStore] Error updating tipo:', err);
      set({ isSavingTipo: false, error: err.message || 'Error actualizando tipo' });
      return false;
    }
  },

  deleteTipo: async (id) => {
    set({ isSavingTipo: true, error: null });
    try {
      const { error } = await supabase
        .from('redaccion_tipos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      set((state) => ({
        tipos: state.tipos.filter(t => t.id !== id),
        isSavingTipo: false,
        lastFetchTipos: null,
      }));
      logger.debug('[RedaccionStore] Tipo deleted:', id);
      return true;
    } catch (err: any) {
      logger.error('[RedaccionStore] Error deleting tipo:', err);
      set({ isSavingTipo: false, error: err.message || 'Error eliminando tipo' });
      return false;
    }
  },

  // ========== CONTEXT MANAGER ==========

  addContextSource: (source: ContextSource) => {
    set((state) => ({
      contextSources: [...state.contextSources, source],
      contextPhase: 'adding',
      // Invalidate organized JSON when sources change
      contextOrganized: null,
    }));
  },

  removeContextSource: (id: string) => {
    set((state) => ({
      contextSources: state.contextSources.filter(s => s.id !== id),
      // Invalidate organized JSON when sources change
      contextOrganized: null,
      contextPhase: state.contextSources.length <= 1 ? 'idle' : state.contextPhase,
    }));
  },

  processContext: async (empresaId: number) => {
    const { contextSources } = get();
    if (contextSources.length === 0) return;

    set({ contextPhase: 'processing', contextError: null });

    try {
      const formData = new FormData();
      formData.append('empresa_id', String(empresaId));

      // Separate file sources from text/url sources
      const textSources: Array<{ name: string; type: string; content: string }> = [];
      const urls: string[] = [];

      for (const source of contextSources) {
        if (source.type === 'url') {
          urls.push(source.rawContent);
        } else {
          textSources.push({
            name: source.name,
            type: source.type,
            content: source.rawContent,
          });
        }
      }

      if (textSources.length > 0) {
        formData.append('text_sources', JSON.stringify(textSources));
      }
      if (urls.length > 0) {
        formData.append('urls', JSON.stringify(urls));
      }

      const { useAuthStore } = await import('./authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch('/api/redaccion/process-context', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        }
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Error de servidor' }));
        throw new Error(errBody.error || `HTTP ${response.status}`);
      }

      const { organized } = await response.json();

      set({
        contextOrganized: organized,
        contextPhase: 'ready',
        contextError: null,
      });

      logger.debug('[RedaccionStore] Context processed:', organized?.categorias?.length, 'categories');
    } catch (err: any) {
      logger.error('[RedaccionStore] Process context error:', err);
      set({
        contextPhase: 'error',
        contextError: err.message || 'Error procesando contexto',
      });
    }
  },

  clearContext: () => {
    set({
      contextSources: [],
      contextOrganized: null,
      contextPhase: 'idle',
      contextError: null,
    });
  },

  // ========== GENERATION IA ==========

  startGeneration: async (params: GenerateRedaccionRequest) => {
    const abortController = new AbortController();
    set({
      isGenerating: true,
      generationAbortController: abortController,
      generationProgress: {
        phase: 'planning',
        currentSection: 0,
        totalSections: 0,
        currentTitle: '',
        redaccionId: null,
        error: null,
      },
    });

    try {
      const { useAuthStore } = await import('./authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch('/api/redaccion/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        credentials: 'include',
        body: JSON.stringify(params),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Error de servidor' }));
        throw new Error(errBody.error || `HTTP ${response.status}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as GenerationSSEEvent;

            switch (event.type) {
              case 'plan_created':
                set({
                  generationProgress: {
                    phase: 'writing',
                    currentSection: 0,
                    totalSections: event.totalSections,
                    currentTitle: event.nombre,
                    redaccionId: event.redaccionId,
                    error: null,
                  },
                });
                break;

              case 'writing_section':
                set((state) => ({
                  generationProgress: {
                    ...state.generationProgress,
                    currentSection: event.orden,
                    currentTitle: event.titulo,
                  },
                }));
                break;

              case 'section_complete':
                // Progress already updated by writing_section
                break;

              case 'complete': {
                const redaccionId = event.redaccionId;
                set({
                  isGenerating: false,
                  generationAbortController: null,
                  generationProgress: {
                    phase: 'complete',
                    currentSection: get().generationProgress.totalSections,
                    totalSections: get().generationProgress.totalSections,
                    currentTitle: '',
                    redaccionId,
                    error: null,
                  },
                  // Invalidate cache so next fetch picks up the new doc
                  lastFetchRedacciones: null,
                });
                break;
              }

              case 'error':
                set({
                  isGenerating: false,
                  generationAbortController: null,
                  generationProgress: {
                    ...get().generationProgress,
                    phase: 'error',
                    error: event.message,
                  },
                });
                break;
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.debug('[RedaccionStore] Generation cancelled by user');
        set({
          isGenerating: false,
          generationAbortController: null,
          generationProgress: { ...INITIAL_GENERATION_PROGRESS },
        });
        return;
      }
      logger.error('[RedaccionStore] Generation error:', err);
      set({
        isGenerating: false,
        generationAbortController: null,
        generationProgress: {
          ...get().generationProgress,
          phase: 'error',
          error: err.message || 'Error de generación',
        },
      });
    }
  },

  cancelGeneration: () => {
    const { generationAbortController } = get();
    if (generationAbortController) {
      generationAbortController.abort();
    }
  },

  resetGeneration: () => {
    set({
      isGenerating: false,
      generationAbortController: null,
      generationProgress: { ...INITIAL_GENERATION_PROGRESS },
    });
  },

  // ========== UTILITY ==========

  clearError: () => set({ error: null }),

  reset: () => set({
    tipos: [],
    redacciones: [],
    detalles: [],
    selectedRedaccion: null,
    filters: { ...DEFAULT_REDACCION_FILTERS },
    view: 'list',
    isLoadingTipos: false,
    isLoadingRedacciones: false,
    isLoadingDetalles: false,
    isSavingTipo: false,
    error: null,
    showTiposManager: false,
    isGenerating: false,
    generationProgress: { ...INITIAL_GENERATION_PROGRESS },
    showGenerator: false,
    generationAbortController: null,
    contextSources: [],
    contextOrganized: null,
    contextPhase: 'idle',
    contextError: null,
    lastFetchTipos: null,
    lastFetchRedacciones: null,
    lastEnterpriseId: null,
  }),
}));
