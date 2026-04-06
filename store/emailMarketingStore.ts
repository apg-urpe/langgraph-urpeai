import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { MarketingAudience, AudienceContact, MarketingCampaignV2 } from '../types/marketing';

// ============================================================================
// FILTER TYPES
// ============================================================================

export type FilterField = 
  | 'created_at' 
  | 'ultima_interaccion' 
  | 'estado' 
  | 'etapa_embudo' 
  | 'es_calificado' 
  | 'origen' 
  | 'metadata' 
  | 'team_humano_id'
  | 'appointment_status'
  | 'portfolio_status'
  | 'last_payment_date'
  | 'total_paid'
  | 'total_pending'
  | 'service_type';

export type FilterOperator = 
  | 'eq' 
  | 'neq' 
  | 'gt' 
  | 'lt' 
  | 'gte' 
  | 'lte' 
  | 'contains' 
  | 'is_null' 
  | 'is_not_null';

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

export interface AudienceFilters {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

// ============================================================================
// CREATE PAYLOADS
// ============================================================================

export interface CreateAudiencePayload {
  empresa_id: number;
  nombre: string;
  descripcion?: string;
  tipo: 'estatica' | 'dinamica';
  filtros_json?: AudienceFilters;
  contacto_ids?: number[]; // Para audiencias estáticas
}

export interface UpdateAudiencePayload {
  nombre?: string;
  descripcion?: string;
  filtros_json?: AudienceFilters;
}

export interface CreateCampaignPayload {
  empresa_id: number;
  nombre: string;
  descripcion?: string;
  estado?: 'borrador' | 'activa' | 'pausada' | 'archivada';
  audiencia_id?: number;
  cadencia_dias?: number;
  total_toques?: number;
  instrucciones_ai?: string;
}

// ============================================================================
// STORE STATE
// ============================================================================

interface EmailMarketingState {
  // Data
  audiences: MarketingAudience[];
  campaigns: MarketingCampaignV2[];
  selectedAudience: MarketingAudience | null;
  audienceContacts: AudienceContact[];
  
  // Preview (para constructor de filtros)
  previewCount: number | null;
  isLoadingPreview: boolean;
  
  // UI State
  isLoading: boolean;
  isLoadingCampaigns: boolean;
  error: string | null;
  activeTab: 'audiences' | 'campaigns' | 'sends' | 'analytics';
  
  // Cache
  cachedEnterpriseId: number | null;
  lastFetch: number | null;

  // Actions - Audiences
  fetchAudiences: (empresaId: number, forceRefresh?: boolean) => Promise<void>;
  fetchAudienceById: (audienceId: number) => Promise<MarketingAudience | null>;
  createAudience: (payload: CreateAudiencePayload) => Promise<MarketingAudience | null>;
  updateAudience: (audienceId: number, payload: UpdateAudiencePayload) => Promise<MarketingAudience | null>;
  deleteAudience: (audienceId: number) => Promise<boolean>;
  
  // Actions - Audience Contacts (para estáticas)
  addContactsToAudience: (audienceId: number, contactIds: number[]) => Promise<boolean>;
  removeContactFromAudience: (audienceId: number, contactId: number) => Promise<boolean>;
  fetchAudienceContacts: (audienceId: number) => Promise<AudienceContact[]>;
  
  // Actions - Preview
  previewAudienceCount: (empresaId: number, filters: AudienceFilters) => Promise<number>;
  previewAudienceContacts: (empresaId: number, filters: AudienceFilters, limit?: number) => Promise<any[]>;
  
  // Actions - Campaigns
  fetchCampaigns: (empresaId: number) => Promise<void>;
  createCampaign: (payload: CreateCampaignPayload) => Promise<MarketingCampaignV2 | null>;
  updateCampaign: (campaignId: number, payload: Partial<CreateCampaignPayload>) => Promise<MarketingCampaignV2 | null>;
  deleteCampaign: (campaignId: number) => Promise<boolean>;
  
  // Actions - UI
  setActiveTab: (tab: 'audiences' | 'campaigns' | 'sends' | 'analytics') => void;
  setSelectedAudience: (audience: MarketingAudience | null) => void;
  clearError: () => void;
  resetStore: () => void;
}

const CACHE_MS = 300000; // 5 minutos

// ============================================================================
// HELPER: Filtros de elegibilidad para campañas de email marketing
// Debe coincidir con los filtros del RPC enroll_contacts_in_campaign
// ============================================================================
function applyEligibilityFilters(query: any): any {
  // DEBE coincidir con is_email_eligible() en PostgreSQL (EMAIL_MARKETING_REFACTOR_V3.sql)
  return query
    .not('email', 'is', null)    // Debe tener email
    .neq('email', '')            // Email no vacío
    .eq('is_active', true)       // Solo contactos activos
    .neq('estado', 'cliente')    // Excluir clientes
    .or('suscripcion.is.null,suscripcion.eq.true');  // Incluir NULL (default) y true, excluir solo false
}

// ============================================================================
// HELPER: Fetch contact IDs from related tables (for cross-table filtering)
// ============================================================================

type AppointmentStatus = 'realizadas' | 'canceladas' | 'programadas' | 'confirmadas' | 'sin_cita';
type PortfolioStatus = 'con_deuda' | 'al_dia' | 'sin_servicios';

async function fetchContactIdsByLastPaymentDate(
  empresaId: number,
  operator: FilterOperator,
  value: any
): Promise<number[]> {
  try {
    let query = supabase
      .from('wp_crm_pagos')
      .select('contacto_id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'confirmado');

    switch (operator) {
      case 'eq': query = query.eq('fecha_pago', value); break;
      case 'gt': query = query.gt('fecha_pago', value); break;
      case 'lt': query = query.lt('fecha_pago', value); break;
      case 'gte': query = query.gte('fecha_pago', value); break;
      case 'lte': query = query.lte('fecha_pago', value); break;
    }

    const { data, error } = await query;
    if (error) throw error;
    return Array.from(new Set((data || []).map(p => p.contacto_id)));
  } catch (err) {
    logger.error('[fetchContactIdsByLastPaymentDate] Error:', err);
    return [];
  }
}

async function fetchContactIdsByFinanceMetric(
  empresaId: number,
  metric: 'total_paid' | 'total_pending',
  operator: FilterOperator,
  value: any
): Promise<number[]> {
  try {
    const field = metric === 'total_paid' ? 'saldo_pagado' : 'saldo_pendiente';
    let query = supabase
      .from('wp_crm_servicios')
      .select('contacto_id')
      .eq('empresa_id', empresaId);

    const numValue = parseFloat(value);
    switch (operator) {
      case 'eq': query = query.eq(field, numValue); break;
      case 'gt': query = query.gt(field, numValue); break;
      case 'lt': query = query.lt(field, numValue); break;
      case 'gte': query = query.gte(field, numValue); break;
      case 'lte': query = query.lte(field, numValue); break;
    }

    const { data, error } = await query;
    if (error) throw error;
    return Array.from(new Set((data || []).map(s => s.contacto_id)));
  } catch (err) {
    logger.error('[fetchContactIdsByFinanceMetric] Error:', err);
    return [];
  }
}

async function fetchContactIdsByServiceType(
  empresaId: number,
  type: string
): Promise<number[]> {
  try {
    const { data, error } = await supabase
      .from('wp_crm_servicios')
      .select('contacto_id')
      .eq('empresa_id', empresaId)
      .eq('tipo_servicio', type);

    if (error) throw error;
    return Array.from(new Set((data || []).map(s => s.contacto_id)));
  } catch (err) {
    logger.error('[fetchContactIdsByServiceType] Error:', err);
    return [];
  }
}

async function fetchContactIdsByAppointmentStatus(
  empresaId: number,
  status: AppointmentStatus
): Promise<number[] | null> {
  try {
    if (status === 'sin_cita') {
      // Get IDs of contacts that DO have appointments (to exclude them)
      const { data: withAppointments, error } = await supabase
        .from('wp_citas')
        .select('contacto_id')
        .eq('empresa_id', empresaId)
        .not('contacto_id', 'is', null);
      
      if (error) {
        logger.error('[fetchContactIdsByAppointmentStatus] Error fetching sin_cita:', error);
        return null; // null signals query failure — caller should not apply filter
      }
      
      // Return IDs of contacts WITH appointments — caller will exclude them
      return (withAppointments || [])
        .map(c => c.contacto_id)
        .filter((v, i, a) => v != null && a.indexOf(v) === i);
    }
    
    // Map status to DB estado values
    const estadoMap: Record<string, string[]> = {
      'realizadas': ['completada'],
      'canceladas': ['cancelada'],
      'programadas': ['programada'],
      'confirmadas': ['confirmada']
    };
    
    const estados = estadoMap[status] || [];
    if (estados.length === 0) return [];
    
    const { data, error } = await supabase
      .from('wp_citas')
      .select('contacto_id')
      .eq('empresa_id', empresaId)
      .in('estado', estados)
      .not('contacto_id', 'is', null);
    
    if (error) {
      logger.error('[fetchContactIdsByAppointmentStatus] Error:', error);
      return null; // null signals query failure
    }
    
    // Deduplicate IDs
    return (data || [])
      .map(c => c.contacto_id)
      .filter((v, i, a) => v != null && a.indexOf(v) === i);
  } catch (err) {
    logger.error('[fetchContactIdsByAppointmentStatus] Exception:', err);
    return null;
  }
}

async function fetchContactIdsByPortfolioStatus(
  empresaId: number,
  status: PortfolioStatus
): Promise<{ ids: number[]; isExclusion: boolean }> {
  try {
    if (status === 'sin_servicios') {
      // Get contacts WITH services (to exclude)
      const { data } = await supabase
        .from('wp_crm_servicios')
        .select('contacto_id')
        .eq('empresa_id', empresaId);
      
      return { 
        ids: (data || []).map(c => c.contacto_id).filter((v, i, a) => a.indexOf(v) === i),
        isExclusion: true 
      };
    }
    
    if (status === 'con_deuda') {
      const { data, error } = await supabase
        .from('wp_crm_servicios')
        .select('contacto_id')
        .eq('empresa_id', empresaId)
        .gt('saldo_pendiente', 0);
      
      if (error) {
        logger.error('[fetchContactIdsByPortfolioStatus] Error:', error);
        return { ids: [], isExclusion: false };
      }
      
      return { 
        ids: (data || []).map(c => c.contacto_id).filter((v, i, a) => a.indexOf(v) === i),
        isExclusion: false 
      };
    }
    
    if (status === 'al_dia') {
      // Contacts with services but NO debt (saldo_pendiente = 0 or all paid)
      // Strategy: Get all with services, exclude those with debt
      const [allServices, withDebt] = await Promise.all([
        supabase
          .from('wp_crm_servicios')
          .select('contacto_id')
          .eq('empresa_id', empresaId),
        supabase
          .from('wp_crm_servicios')
          .select('contacto_id')
          .eq('empresa_id', empresaId)
          .gt('saldo_pendiente', 0)
      ]);
      
      const allIds = new Set((allServices.data || []).map(c => c.contacto_id));
      const debtIds = new Set((withDebt.data || []).map(c => c.contacto_id));
      
      // Return contacts that have services but no debt
      const alDiaIds = [...allIds].filter(id => !debtIds.has(id));
      return { ids: alDiaIds, isExclusion: false };
    }
    
    return { ids: [], isExclusion: false };
  } catch (err) {
    logger.error('[fetchContactIdsByPortfolioStatus] Exception:', err);
    return { ids: [], isExclusion: false };
  }
}

// ============================================================================
// HELPER: Build Supabase Query from Filters (async for cross-table filters)
// ============================================================================

async function buildFilterQuery(
  baseQuery: any,
  filters: AudienceFilters,
  empresaId: number
): Promise<any> {
  let query = baseQuery;
  
  for (const condition of filters.conditions) {
    const { field, operator, value } = condition;
    
    // Handle cross-table filters (require async prefetch)
    if (field === 'appointment_status') {
      if (!value || typeof value !== 'string') continue;
      const status = value as AppointmentStatus;
      const contactIds = await fetchContactIdsByAppointmentStatus(empresaId, status);
      
      // null means the query failed — skip filter to avoid wrong results
      if (contactIds === null) {
        logger.warn('[buildFilterQuery] appointment_status query failed, skipping filter for status:', status);
        continue;
      }
      
      if (status === 'sin_cita') {
        // Exclude contacts that have appointments (contactIds = those WITH appointments)
        if (contactIds.length > 0) {
          query = query.not('id', 'in', `(${contactIds.join(',')})`);
        }
        // If contactIds is empty → nobody has appointments → all contacts qualify, no filter needed
      } else {
        // Include only contacts with specific appointment status
        if (contactIds.length > 0) {
          query = query.in('id', contactIds);
        } else {
          // No contacts match this appointment status → return empty result
          query = query.eq('id', -1);
        }
      }
      continue;
    }
    
    if (field === 'portfolio_status') {
      if (!value || typeof value !== 'string') continue;
      const status = value as PortfolioStatus;
      const { ids: contactIds, isExclusion } = await fetchContactIdsByPortfolioStatus(empresaId, status);
      
      if (isExclusion) {
        // Exclude contacts (sin_servicios)
        if (contactIds.length > 0) {
          query = query.not('id', 'in', `(${contactIds.join(',')})`);
        }
      } else {
        // Include only these contacts
        if (contactIds.length > 0) {
          query = query.in('id', contactIds);
        } else {
          query = query.eq('id', -1); // No matches
        }
      }
      continue;
    }

    if (field === 'last_payment_date') {
      if (!value) continue;
      const contactIds = await fetchContactIdsByLastPaymentDate(empresaId, operator, value);
      if (contactIds.length > 0) {
        query = query.in('id', contactIds);
      } else {
        query = query.eq('id', -1);
      }
      continue;
    }

    if (field === 'total_paid' || field === 'total_pending') {
      if (value === null || value === undefined || value === '') continue;
      const contactIds = await fetchContactIdsByFinanceMetric(empresaId, field, operator, value);
      if (contactIds.length > 0) {
        query = query.in('id', contactIds);
      } else {
        query = query.eq('id', -1);
      }
      continue;
    }

    if (field === 'service_type') {
      if (!value || typeof value !== 'string') continue;
      const contactIds = await fetchContactIdsByServiceType(empresaId, value);
      if (contactIds.length > 0) {
        if (operator === 'neq') {
          query = query.not('id', 'in', `(${contactIds.join(',')})`);
        } else {
          query = query.in('id', contactIds);
        }
      } else {
        if (operator === 'neq') {
          // No contacts have this service type → all contacts match neq
        } else {
          query = query.eq('id', -1);
        }
      }
      continue;
    }

    // Skip conditions with null/empty values (user hasn't selected a value yet)
    if (value === null || value === undefined || value === '') {
      if (operator !== 'is_null' && operator !== 'is_not_null') {
        continue;
      }
    }

    // Standard field operators
    switch (operator) {
      case 'eq':
        if (value === null) {
          query = query.is(field, null);
        } else {
          query = query.eq(field, value);
        }
        break;
      case 'neq':
        if (value === null) {
          query = query.not(field, 'is', null);
        } else {
          query = query.neq(field, value);
        }
        break;
      case 'gt':
        query = query.gt(field, value);
        break;
      case 'lt':
        query = query.lt(field, value);
        break;
      case 'gte':
        query = query.gte(field, value);
        break;
      case 'lte':
        query = query.lte(field, value);
        break;
      case 'contains':
        if (field === 'metadata') {
          query = query.ilike(`${field}::text`, `%${value}%`);
        } else {
          query = query.ilike(field, `%${value}%`);
        }
        break;
      case 'is_null':
        query = query.is(field, null);
        break;
      case 'is_not_null':
        query = query.not(field, 'is', null);
        break;
    }
  }
  
  return query;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useEmailMarketingStore = create<EmailMarketingState>((set, get) => ({
  // Initial State
  audiences: [],
  campaigns: [],
  selectedAudience: null,
  audienceContacts: [],
  previewCount: null,
  isLoadingPreview: false,
  isLoading: false,
  isLoadingCampaigns: false,
  error: null,
  activeTab: 'analytics',
  cachedEnterpriseId: null,
  lastFetch: null,

  // ============================================================================
  // AUDIENCES CRUD
  // ============================================================================

  fetchAudiences: async (empresaId: number, forceRefresh = false) => {
    const { cachedEnterpriseId, lastFetch } = get();
    
    if (!forceRefresh && 
        cachedEnterpriseId === empresaId && 
        lastFetch && 
        Date.now() - lastFetch < CACHE_MS) {
      logger.debug('[EmailMarketingStore] Using cached audiences');
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Fetch audiences with static contact count
      const { data, error } = await supabase
        .from('wp_marketing_audiencias')
        .select(`
          *,
          static_count:wp_marketing_audiencia_contacto(count)
        `)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate contact counts - static uses join, dynamic uses filter query
      const audiences: MarketingAudience[] = await Promise.all(
        (data || []).map(async (a: any) => {
          let contactCount = 0;
          
          if (a.tipo === 'estatica') {
            // Static audiences: use the joined count
            contactCount = a.static_count?.[0]?.count || 0;
          } else if (a.tipo === 'dinamica' && a.filtros_json?.conditions?.length > 0) {
            // Dynamic audiences: calculate from filters + eligibility
            try {
              let query = supabase
                .from('wp_contactos')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', empresaId);
              query = applyEligibilityFilters(query);
              query = await buildFilterQuery(query, a.filtros_json, empresaId);
              const { count } = await query;
              contactCount = count || 0;
            } catch (countErr) {
              logger.warn('[EmailMarketingStore] Error counting dynamic audience:', a.id, countErr);
            }
          }
          
          return {
            ...a,
            contact_count: contactCount
          };
        })
      );

      set({
        audiences,
        cachedEnterpriseId: empresaId,
        lastFetch: Date.now(),
        isLoading: false
      });

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error fetching audiences:', err);
      set({ 
        error: err.message || 'Error al cargar audiencias',
        isLoading: false 
      });
    }
  },

  fetchAudienceById: async (audienceId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_marketing_audiencias')
        .select('*')
        .eq('id', audienceId)
        .single();

      if (error) throw error;

      return data as MarketingAudience;
    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error fetching audience:', err);
      return null;
    }
  },

  createAudience: async (payload: CreateAudiencePayload) => {
    set({ isLoading: true, error: null });

    try {
      // 1. Create the audience
      const { data: audienceData, error: audienceError } = await supabase
        .from('wp_marketing_audiencias')
        .insert([{
          empresa_id: payload.empresa_id,
          nombre: payload.nombre,
          descripcion: payload.descripcion || null,
          tipo: payload.tipo,
          filtros_json: payload.filtros_json || {},
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (audienceError) throw audienceError;

      const newAudience = audienceData as MarketingAudience;

      // 2. If static audience with contacts, add them
      if (payload.tipo === 'estatica' && payload.contacto_ids?.length) {
        const contactInserts = payload.contacto_ids.map(contactId => ({
          audiencia_id: newAudience.id,
          contacto_id: contactId,
          created_at: new Date().toISOString()
        }));

        const { error: contactsError } = await supabase
          .from('wp_marketing_audiencia_contacto')
          .insert(contactInserts);

        if (contactsError) {
          logger.warn('[EmailMarketingStore] Error adding contacts to audience:', contactsError);
        }
      }

      // 3. Calculate contact_count based on type
      let contactCount = 0;
      
      if (payload.tipo === 'estatica') {
        contactCount = payload.contacto_ids?.length || 0;
      } else if (payload.tipo === 'dinamica' && payload.filtros_json) {
        // For dynamic audiences, query the actual count based on filters
        try {
          let query = supabase
            .from('wp_contactos')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', payload.empresa_id);
          query = applyEligibilityFilters(query);

          // Apply filters
          if (payload.filtros_json.conditions?.length > 0) {
            query = await buildFilterQuery(query, payload.filtros_json, payload.empresa_id);
          }

          const { count } = await query;
          contactCount = count || 0;
        } catch (countErr) {
          logger.warn('[EmailMarketingStore] Error counting dynamic audience:', countErr);
        }
      }

      // Update local state
      set(state => ({
        audiences: [{ ...newAudience, contact_count: contactCount }, ...state.audiences],
        isLoading: false
      }));

      return newAudience;

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error creating audience:', err);
      set({ 
        error: err.message || 'Error al crear audiencia',
        isLoading: false 
      });
      return null;
    }
  },

  updateAudience: async (audienceId: number, payload: UpdateAudiencePayload) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_marketing_audiencias')
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', audienceId)
        .select()
        .single();

      if (error) throw error;

      const updatedAudience = data as MarketingAudience;

      set(state => ({
        audiences: state.audiences.map(a => 
          a.id === audienceId ? { ...a, ...updatedAudience } : a
        ),
        selectedAudience: state.selectedAudience?.id === audienceId 
          ? { ...state.selectedAudience, ...updatedAudience }
          : state.selectedAudience,
        isLoading: false
      }));

      return updatedAudience;

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error updating audience:', err);
      set({ 
        error: err.message || 'Error al actualizar audiencia',
        isLoading: false 
      });
      return null;
    }
  },

  deleteAudience: async (audienceId: number) => {
    set({ isLoading: true, error: null });

    try {
      const { error } = await supabase
        .from('wp_marketing_audiencias')
        .delete()
        .eq('id', audienceId);

      if (error) throw error;

      set(state => ({
        audiences: state.audiences.filter(a => a.id !== audienceId),
        selectedAudience: state.selectedAudience?.id === audienceId ? null : state.selectedAudience,
        isLoading: false
      }));

      return true;

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error deleting audience:', err);
      set({ 
        error: err.message || 'Error al eliminar audiencia',
        isLoading: false 
      });
      return false;
    }
  },

  // ============================================================================
  // AUDIENCE CONTACTS
  // ============================================================================

  addContactsToAudience: async (audienceId: number, contactIds: number[]) => {
    try {
      const inserts = contactIds.map(contactId => ({
        audiencia_id: audienceId,
        contacto_id: contactId,
        created_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('wp_marketing_audiencia_contacto')
        .upsert(inserts, { onConflict: 'audiencia_id,contacto_id' });

      if (error) throw error;

      // Update contact count in local state
      set(state => ({
        audiences: state.audiences.map(a => 
          a.id === audienceId 
            ? { ...a, contact_count: (a.contact_count || 0) + contactIds.length }
            : a
        )
      }));

      return true;
    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error adding contacts:', err);
      return false;
    }
  },

  removeContactFromAudience: async (audienceId: number, contactId: number) => {
    try {
      const { error } = await supabase
        .from('wp_marketing_audiencia_contacto')
        .delete()
        .eq('audiencia_id', audienceId)
        .eq('contacto_id', contactId);

      if (error) throw error;

      set(state => ({
        audiences: state.audiences.map(a => 
          a.id === audienceId 
            ? { ...a, contact_count: Math.max(0, (a.contact_count || 0) - 1) }
            : a
        ),
        audienceContacts: state.audienceContacts.filter(
          ac => !(ac.audiencia_id === audienceId && ac.contacto_id === contactId)
        )
      }));

      return true;
    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error removing contact:', err);
      return false;
    }
  },

  fetchAudienceContacts: async (audienceId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_marketing_audiencia_contacto')
        .select('*')
        .eq('audiencia_id', audienceId);

      if (error) throw error;

      const contacts = (data || []) as AudienceContact[];
      set({ audienceContacts: contacts });
      return contacts;
    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error fetching audience contacts:', err);
      return [];
    }
  },

  // ============================================================================
  // PREVIEW (para constructor de filtros dinámicos)
  // ============================================================================

  previewAudienceCount: async (empresaId: number, filters: AudienceFilters) => {
    set({ isLoadingPreview: true });

    try {
      let query = supabase
        .from('wp_contactos')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId);
      query = applyEligibilityFilters(query);

      // Apply filters
      if (filters.conditions.length > 0) {
        query = await buildFilterQuery(query, filters, empresaId);
      }

      const { count, error } = await query;

      if (error) throw error;

      const previewCount = count || 0;
      set({ previewCount, isLoadingPreview: false });
      return previewCount;

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error previewing count:', err);
      set({ previewCount: null, isLoadingPreview: false });
      return 0;
    }
  },

  previewAudienceContacts: async (empresaId: number, filters: AudienceFilters, limit = 5) => {
    try {
      let query = supabase
        .from('wp_contactos')
        .select('id, nombre, apellido, telefono, email, is_active, estado')
        .eq('empresa_id', empresaId)
        .limit(limit);
      query = applyEligibilityFilters(query);

      if (filters.conditions.length > 0) {
        query = await buildFilterQuery(query, filters, empresaId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error previewing contacts:', err);
      return [];
    }
  },

  // ============================================================================
  // CAMPAIGNS
  // ============================================================================

  fetchCampaigns: async (empresaId: number) => {
    set({ isLoadingCampaigns: true });

    try {
      const { data, error } = await supabase
        .from('wp_email_campanas')
        .select('*')
        .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({
        campaigns: (data || []) as MarketingCampaignV2[],
        isLoadingCampaigns: false
      });

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error fetching campaigns:', err);
      set({ isLoadingCampaigns: false });
    }
  },

  createCampaign: async (payload: CreateCampaignPayload) => {
    set({ isLoadingCampaigns: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_email_campanas')
        .insert([{
          empresa_id: payload.empresa_id,
          nombre: payload.nombre,
          descripcion: payload.descripcion || null,
          estado: payload.estado || 'borrador',
          audiencia_id: payload.audiencia_id || null,
          cadencia_dias: payload.cadencia_dias || 7,
          total_toques: payload.total_toques || null,
          instrucciones_ai: payload.instrucciones_ai || null,
          es_default_post_conversacion: false,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      const newCampaign = data as MarketingCampaignV2;

      if (newCampaign.estado === 'activa' && newCampaign.empresa_id && newCampaign.audiencia_id) {
        try {
          logger.info('[EmailMarketingStore] Campaign created active, calling resolve-audience Edge Function:', {
            campana_id: newCampaign.id,
            audiencia_id: newCampaign.audiencia_id,
            empresa_id: newCampaign.empresa_id
          });

          const { data: resolveData, error: resolveError } = await supabase.functions.invoke(
            'resolve-audience',
            {
              body: {
                campana_id: newCampaign.id,
                audiencia_id: newCampaign.audiencia_id,
                empresa_id: newCampaign.empresa_id,
                enroll: true,
                first_send_delay_minutes: 0
              }
            }
          );

          if (resolveError) {
            logger.error('[EmailMarketingStore] Edge Function resolve-audience error on create:', resolveError);
          } else {
            logger.info('[EmailMarketingStore] resolve-audience result on create:', {
              count: resolveData?.count,
              enrollment: resolveData?.enrollment
            });
          }
        } catch (enrollErr) {
          logger.error('[EmailMarketingStore] Enrollment exception on create:', enrollErr);
        }
      }

      set(state => ({
        campaigns: [newCampaign, ...state.campaigns],
        isLoadingCampaigns: false
      }));

      return newCampaign;

    } catch (err: any) {
      const errorDetail = err?.code ? `[${err.code}] ${err.message} | details: ${err.details} | hint: ${err.hint}` : (err.message || 'Error al crear campaña');
      logger.error('[EmailMarketingStore] Error creating campaign:', errorDetail, err);
      set({ 
        error: errorDetail,
        isLoadingCampaigns: false 
      });
      return null;
    }
  },

  updateCampaign: async (campaignId: number, payload: Partial<CreateCampaignPayload>) => {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (payload.nombre !== undefined) updateData.nombre = payload.nombre;
      if (payload.descripcion !== undefined) updateData.descripcion = payload.descripcion || null;
      if (payload.estado !== undefined) updateData.estado = payload.estado;
      if (payload.audiencia_id !== undefined) updateData.audiencia_id = payload.audiencia_id || null;
      if (payload.cadencia_dias !== undefined) updateData.cadencia_dias = payload.cadencia_dias;
      if (payload.total_toques !== undefined) updateData.total_toques = payload.total_toques || null;
      if (payload.instrucciones_ai !== undefined) updateData.instrucciones_ai = payload.instrucciones_ai || null;

      const { data, error } = await supabase
        .from('wp_email_campanas')
        .update(updateData)
        .eq('id', campaignId)
        .select()
        .single();

      if (error) throw error;

      const updatedCampaign = data as MarketingCampaignV2;

      if (updatedCampaign.estado === 'activa' && updatedCampaign.empresa_id && updatedCampaign.audiencia_id) {
        try {
          logger.info('[EmailMarketingStore] Campaign active with audience, calling resolve-audience Edge Function:', {
            campana_id: campaignId,
            audiencia_id: updatedCampaign.audiencia_id,
            empresa_id: updatedCampaign.empresa_id
          });

          const { data: resolveData, error: resolveError } = await supabase.functions.invoke(
            'resolve-audience',
            {
              body: {
                campana_id: campaignId,
                audiencia_id: updatedCampaign.audiencia_id,
                empresa_id: updatedCampaign.empresa_id,
                enroll: true,
                first_send_delay_minutes: 0
              }
            }
          );

          if (resolveError) {
            logger.error('[EmailMarketingStore] Edge Function resolve-audience error:', resolveError);
          } else {
            logger.info('[EmailMarketingStore] resolve-audience result:', {
              count: resolveData?.count,
              enrollment: resolveData?.enrollment
            });
          }
        } catch (enrollErr) {
          logger.error('[EmailMarketingStore] Enrollment exception:', enrollErr);
        }
      }

      set(state => ({
        campaigns: state.campaigns.map(c => 
          c.id === campaignId ? updatedCampaign : c
        )
      }));

      return updatedCampaign;

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error updating campaign:', err);
      set({ error: err.message || 'Error al actualizar campaña' });
      return null;
    }
  },

  deleteCampaign: async (campaignId: number) => {
    try {
      const { error } = await supabase
        .from('wp_email_campanas')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      set(state => ({
        campaigns: state.campaigns.filter(c => c.id !== campaignId)
      }));

      return true;

    } catch (err: any) {
      logger.error('[EmailMarketingStore] Error deleting campaign:', err);
      set({ error: err.message || 'Error al eliminar campaña' });
      return false;
    }
  },

  // ============================================================================
  // UI ACTIONS
  // ============================================================================

  setActiveTab: (tab) => set({ activeTab: tab }),
  
  setSelectedAudience: (audience) => set({ selectedAudience: audience }),
  
  clearError: () => set({ error: null }),
  
  resetStore: () => set({
    audiences: [],
    campaigns: [],
    selectedAudience: null,
    audienceContacts: [],
    previewCount: null,
    isLoadingPreview: false,
    isLoading: false,
    isLoadingCampaigns: false,
    error: null,
    activeTab: 'analytics',
    cachedEnterpriseId: null,
    lastFetch: null
  })
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectAudiences = (state: EmailMarketingState) => state.audiences;
export const selectCampaigns = (state: EmailMarketingState) => state.campaigns;
export const selectActiveTab = (state: EmailMarketingState) => state.activeTab;
export const selectIsLoading = (state: EmailMarketingState) => state.isLoading;
export const selectIsLoadingCampaigns = (state: EmailMarketingState) => state.isLoadingCampaigns;
export const selectPreviewCount = (state: EmailMarketingState) => state.previewCount;
export const selectIsLoadingPreview = (state: EmailMarketingState) => state.isLoadingPreview;
export const selectError = (state: EmailMarketingState) => state.error;
