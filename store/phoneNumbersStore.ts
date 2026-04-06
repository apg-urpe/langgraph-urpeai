import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { PhoneNumberRecord } from '../types/phone-number';

const ALLOWED_VIEW_ROLES = [1, 2];
const CACHE_DURATION_MS = 5 * 60 * 1000;

interface PhoneNumbersState {
  numbers: PhoneNumberRecord[];
  isLoading: boolean;
  error: string | null;
  lastFetch: number | null;
  lastEnterpriseId: number | null;
  fetchPhoneNumbers: (enterpriseId: number, forceRefresh?: boolean) => Promise<void>;
  addPhoneNumber: (number: PhoneNumberRecord) => void;
  canViewPhoneNumbers: (userRoleId: number | null | undefined) => boolean;
  clearError: () => void;
  resetStore: () => void;
}

const initialState = {
  numbers: [],
  isLoading: false,
  error: null,
  lastFetch: null,
  lastEnterpriseId: null
};

export const usePhoneNumbersStore = create<PhoneNumbersState>((set, get) => ({
  ...initialState,

  fetchPhoneNumbers: async (enterpriseId, forceRefresh = false) => {
    const { isLoading, lastFetch, lastEnterpriseId } = get();

    if (lastEnterpriseId !== enterpriseId) {
      set({ numbers: [] });
    }

    if (
      !forceRefresh &&
      lastFetch &&
      lastEnterpriseId === enterpriseId &&
      Date.now() - lastFetch < CACHE_DURATION_MS
    ) {
      logger.debug('[PhoneNumbersStore] Using cached phone numbers');
      return;
    }

    if (isLoading) return;

    set({
      isLoading: true,
      error: null,
      numbers: lastEnterpriseId !== enterpriseId ? [] : get().numbers
    });

    try {
      const { data, error } = await supabase
        .from('wp_numeros')
        .select(`
          id,
          telefono,
          nombre,
          activo,
          created_at,
          updated_at,
          empresa_id,
          agente_id,
          canal,
          id_kapso,
          agent:wp_agentes!wp_numeros_agente_id_fkey(id, nombre_agente)
        `)
        .eq('empresa_id', enterpriseId)
        .order('activo', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const numbers = (data || []).map((item: any) => ({
        ...item,
        id: Number(item.id),
        empresa_id: item.empresa_id ? Number(item.empresa_id) : null,
        agente_id: item.agente_id ? Number(item.agente_id) : null,
        agent: Array.isArray(item.agent)
          ? item.agent[0]
            ? { ...item.agent[0], id: Number(item.agent[0].id) }
            : null
          : item.agent
            ? { ...item.agent, id: Number(item.agent.id) }
            : null,
      })) as PhoneNumberRecord[];

      set({
        numbers,
        isLoading: false,
        error: null,
        lastFetch: Date.now(),
        lastEnterpriseId: enterpriseId
      });

      logger.debug('[PhoneNumbersStore] Fetched phone numbers:', numbers.length);
    } catch (err: any) {
      logger.error('[PhoneNumbersStore] Error fetching phone numbers:', err);
      set({
        isLoading: false,
        error: err?.message || 'Error al cargar números telefónicos'
      });
    }
  },

  addPhoneNumber: (number) => {
    set((state) => ({
      numbers: [number, ...state.numbers],
    }));
  },

  canViewPhoneNumbers: (userRoleId) => {
    if (userRoleId === null || userRoleId === undefined) return false;
    return ALLOWED_VIEW_ROLES.includes(userRoleId);
  },

  clearError: () => set({ error: null }),

  resetStore: () => set(initialState)
}));

export const selectPhoneNumbers = (state: PhoneNumbersState) => state.numbers;
export const selectPhoneNumbersLoading = (state: PhoneNumbersState) => state.isLoading;
export const selectPhoneNumbersError = (state: PhoneNumbersState) => state.error;
