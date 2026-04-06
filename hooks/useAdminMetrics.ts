/**
 * useAdminMetrics - Hook para métricas del dashboard administrativo
 * 
 * Proporciona datos en tiempo real para el dashboard de métricas incluyendo:
 * - Conteos de mensajes, conversaciones, citas y contactos
 * - Análisis de calificación de leads
 * - Rendimiento por etapa del funnel
 * - Contactos "fantasma" (sin interacción reciente)
 * - Métricas de inteligencia v2 (citas por estado, leads calientes, rendimiento de agentes)
 * 
 * ## Filtros Soportados
 * 
 * - Rango de fechas (from/to)
 * - Filtrado por miembro del equipo (vía adminStore.globalTeamFilter)
 * 
 * ## Performance
 * 
 * - Debounce de 600ms para cambios de filtros
 * - Intervalo mínimo de 8s entre fetches
 * - Límites de query: 500 contactos, 1000 mensajes
 * - Caché automática con react-query pattern
 * 
 * @returns DashboardMetrics con todos los datos y estados de carga
 * 
 * @example
 * ```tsx
 * const { 
 *   totalMessages, 
 *   activeConversations, 
 *   qualificationBreakdown,
 *   funnelStages,
 *   isLoading 
 * } = useAdminMetrics();
 * ```
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase-client';
import { UIBlock } from '../types/chat';
import { useContactStore } from '../store/contactStore';
import { useAdminStore } from '../store/adminStore';
import { useCombinedTeamFilter } from './useCombinedTeamFilter';
import { logger } from '../lib/logger';
import { trackMetric } from '../lib/performance-monitor';

// PERFORMANCE: Cache and debounce constants
const FILTER_DEBOUNCE_MS = 600;  // Debounce filter changes (increased)
const TEAM_FILTER_DEBOUNCE_MS = 250; // Faster for team filter (dropdown selection)
const MIN_FETCH_INTERVAL_MS = 8000; // Minimum 8s between fetches (increased)
const QUERY_LIMIT_CONTACTS = 500; // Max contacts per query (reduced from 10000)
const QUERY_LIMIT_MESSAGES = 1000; // Max messages for bounce analysis (reduced from 2000)

export interface DashboardMetrics {
  totalMessages: number;
  activeConversations: number;
  appointmentsCount: number;
  newContactsCount: number;
  recentChats: any[];
  nextAppointments: any[];
  isLoading: boolean;
  error: string | null;
  // Qualification metrics
  qualificationBreakdown: { si: number; no: number; evaluando: number; pendiente: number };
  funnelStages: Array<{ name: string; count: number; id: number; conversionRate?: number }>;
  ghostedContacts: number;
  // v2 Intelligence Metrics
  appointmentsByStatus: { realizadas: number; canceladas: number; pendientes: number; total: number };
  appointmentEffectiveness: number; // % realizadas / (realizadas + canceladas)
  hotLeadsToday: Array<{ id: number; nombre: string; ultimaInteraccion: string; esCalificado: string }>;
  agentPerformance: Array<{ id: number; nombre: string; citas: number; realizadas: number; tasa: number }>;
}

export interface DashboardFilters {
  dateRange: {
    from: string | null;
    to: string | null;
  };
  // teamMemberId is now managed globally via adminStore
}

// Helper: Calculate previous period dates
const getPreviousPeriod = (from: string | null, to: string | null): { prevFrom: string; prevTo: string } | null => {
  if (!from || !to) return null;
  
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const periodMs = toDate.getTime() - fromDate.getTime();
  
  const prevTo = new Date(fromDate.getTime() - 1); // 1ms before current period start
  const prevFrom = new Date(prevTo.getTime() - periodMs);
  
  return {
    prevFrom: prevFrom.toISOString(),
    prevTo: prevTo.toISOString()
  };
};

// Helper: Calculate trend percentage
const calcTrend = (current: number, previous: number): { trend: string; direction: 'up' | 'down' | 'neutral' } => {
  if (previous === 0) {
    // No previous data - show "Nuevo" or neutral if also zero
    if (current > 0) return { trend: 'Nuevo', direction: 'up' };
    return { trend: '—', direction: 'neutral' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { trend: `+${pct}%`, direction: 'up' };
  if (pct < 0) return { trend: `${pct}%`, direction: 'down' };
  return { trend: '0%', direction: 'neutral' };
};

// Helper: Format date for chart display (shorter format)
// IMPORTANT: RPC returns `date` as 'YYYY-MM-DD'. Using `new Date('YYYY-MM-DD')` applies UTC parsing
// and can shift the day in America/Lima. We parse as local date to keep labels stable.
const formatChartDate = (dateStr: string): string => {
  const raw = String(dateStr || '').trim();
  const yyyyMmDd = raw.length >= 10 ? raw.slice(0, 10) : raw;

  if (/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const local = new Date(y, (m || 1) - 1, d || 1);
    return local.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  const dt = new Date(raw);
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

export const useAdminMetrics = () => {
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const userContext = useContactStore(state => state.userContext);
  
  // Use Global Store for Persistence
  const blocks = useAdminStore(state => state.dashboard.blocks);
  const isLoadingStore = useAdminStore(state => state.dashboard.isLoading);
  const errorStore = useAdminStore(state => state.dashboard.error);
  const lastFetchTime = useAdminStore(state => state.dashboard.lastFetchTime);
  const shouldUseCachedData = useAdminStore(state => state.shouldUseCachedData);
  
  const setDashboardBlocks = useAdminStore(state => state.setDashboardBlocks);
  const setDashboardLoading = useAdminStore(state => state.setDashboardLoading);
  const setDashboardError = useAdminStore(state => state.setDashboardError);
  
  // Global team filter from adminStore (array of selected member IDs)
  const globalTeamMemberIds = useCombinedTeamFilter();
  
  // SECURITY: For role 3, ensure filter is always applied even if globalTeamMemberIds is empty
  const isBasicRole = userContext?.roleId === 3;
  const effectiveTeamMemberIds = useMemo(() => {
    if (isBasicRole && userContext?.id) {
      // Role 3: Always filter by own ID
      return globalTeamMemberIds.length > 0 ? globalTeamMemberIds : [userContext.id];
    }
    return globalTeamMemberIds;
  }, [isBasicRole, userContext?.id, globalTeamMemberIds]);
  
  // Track if this is a background refresh (stale-while-revalidate)
  const [isBackgroundRefresh, setIsBackgroundRefresh] = useState(false);
  
  // PERFORMANCE: Refs for debouncing and preventing duplicate fetches
  const lastFetchTimeRef = useRef<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const blocksRef = useRef<typeof blocks>(blocks);
  const isFirstTeamFilterRender = useRef<boolean>(true);
  const effectiveTeamMemberIdsRef = useRef<number[]>(effectiveTeamMemberIds);
  
  // Keep refs in sync
  blocksRef.current = blocks;
  effectiveTeamMemberIdsRef.current = effectiveTeamMemberIds;

  const [filters, setFilters] = useState<DashboardFilters>({
    dateRange: { from: null, to: null }
  });

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalMessages: 0,
    activeConversations: 0,
    appointmentsCount: 0,
    newContactsCount: 0,
    recentChats: [],
    nextAppointments: [],
    isLoading: true,
    error: null,
    qualificationBreakdown: { si: 0, no: 0, evaluando: 0, pendiente: 0 },
    funnelStages: [],
    ghostedContacts: 0,
    // v2 Intelligence Metrics
    appointmentsByStatus: { realizadas: 0, canceladas: 0, pendientes: 0, total: 0 },
    appointmentEffectiveness: 0,
    hotLeadsToday: [],
    agentPerformance: []
  });

  const fetchMetrics = useCallback(async (forceRefresh = false) => {
    if (!selectedEnterpriseId) {
      setDashboardLoading(false);
      return;
    }
    
    // PERFORMANCE: Prevent duplicate fetches
    if (fetchInProgressRef.current && !forceRefresh) {
      logger.debug('[AdminMetrics] ⏩ Fetch already in progress, skipping');
      return;
    }
    
    // PERFORMANCE: Rate limiting - minimum interval between fetches
    const now = Date.now();
    if (!forceRefresh && (now - lastFetchTimeRef.current) < MIN_FETCH_INTERVAL_MS) {
      logger.debug('[AdminMetrics] ⏩ Rate limited, skipping fetch');
      return;
    }

    // Stale-while-revalidate: if we have cached data, show it and refresh in background
    const hasCachedData = blocksRef.current.length > 0;
    const cacheValid = shouldUseCachedData();
    
    if (!forceRefresh && cacheValid && hasCachedData) {
      logger.debug('[AdminMetrics] ⏩ Using cached dashboard data');
      return;
    }
    
    // PERFORMANCE: Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    fetchInProgressRef.current = true;
    lastFetchTimeRef.current = now;

    // If we have stale data, do a background refresh (no loading spinner)
    if (hasCachedData && !forceRefresh) {
      setIsBackgroundRefresh(true);
      logger.debug('[AdminMetrics] 🔄 Background refresh with stale data visible');
    } else {
      setDashboardLoading(true);
    }
    
    const fetchStartTime = performance.now();
    const metricsTimeout = 30000; // 30s timeout - increased while waiting for DB indexes
    
    try {
      logger.debug('[AdminMetrics] Fetching for enterprise:', selectedEnterpriseId, 'Filters:', filters, 'TeamMembers:', effectiveTeamMemberIds);

      // Create a timeout promise to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), metricsTimeout)
      );

      // ============================================
      // OPTIMIZED: Real Data Strategy
      // ============================================
      
      // 1. Calculate Periods
      const dateFrom = filters.dateRange.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const dateTo = filters.dateRange.to || new Date().toISOString();
      const prevPeriod = getPreviousPeriod(dateFrom, dateTo);

      // 2. Define lightweight queries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queries: any[] = [
        // [0] Contacts (Current) - Need created_at for chart
        // NOTE: No limit on count to match Monica's getMetrics tool
        (() => {
          let q = supabase
            .from('wp_contactos')
            .select('created_at, origen', { count: 'exact' })
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [1] Appointments (Current) - Need created_at for chart
        // NOTE: No limit on count to match Monica's getMetrics tool
        (() => {
          let q = supabase
            .from('wp_citas')
            .select('created_at', { count: 'exact' })
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
          
        // [2] Messages (Current) - Count only
        supabase
          .from('wp_mensajes')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', selectedEnterpriseId)
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo),
          
        // [3] Next 4 Appointments - Full data
        (() => {
          let q = supabase
            .from('wp_citas')
            .select(`
              id,
              fecha_hora,
              titulo,
              estado,
              contacto:wp_contactos!inner(id, nombre, apellido)
            `)
            .eq('empresa_id', selectedEnterpriseId)
            .gte('fecha_hora', new Date().toISOString())
            .neq('estado', 'cancelada')
            .order('fecha_hora', { ascending: true })
            .limit(4);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [7] Qualification breakdown - All contacts with es_calificado field
        (() => {
          let q = supabase
            .from('wp_contactos')
            .select('es_calificado')
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [8] Funnel stages with contact counts
        supabase
          .from('wp_empresa_embudo')
          .select('id, nombre_etapa, orden_etapa')
          .eq('empresa_id', selectedEnterpriseId)
          .order('orden_etapa', { ascending: true }),
        
        // [9] Contacts by funnel stage (all contacts for funnel distribution)
        (() => {
          let q = supabase
            .from('wp_contactos')
            .select('etapa_embudo')
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [7] Awaiting Response - Contacts with last outbound message and no reply
        // Uses ultima_interaccion < 3 days + is_active to find stale leads
        (() => {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
          let q = supabase
            .from('wp_contactos')
            .select(`
              id,
              nombre,
              apellido,
              ultima_interaccion,
              created_at,
              etapa_embudo,
              es_calificado
            `)
            .eq('empresa_id', selectedEnterpriseId)
            .eq('is_active', true)
            .lt('ultima_interaccion', threeDaysAgo)
            .not('ultima_interaccion', 'is', null)
            .order('ultima_interaccion', { ascending: true })
            .limit(50);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [8] Appointments by status (for effectiveness calculation)
        (() => {
          let q = supabase
            .from('wp_citas')
            .select('estado, team_humano_id')
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [9] Hot leads TODAY - contacts with recent interaction (last 24h) + qualified or active
        (() => {
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          let q = supabase
            .from('wp_contactos')
            .select('id, nombre, apellido, ultima_interaccion, es_calificado')
            .eq('empresa_id', selectedEnterpriseId)
            .eq('is_active', true)
            .gte('ultima_interaccion', oneDayAgo)
            .order('ultima_interaccion', { ascending: false })
            .limit(10);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [10] Team members for agent performance
        supabase
          .from('wp_team_humano')
          .select('id, nombre, apellido')
          .eq('empresa_id', selectedEnterpriseId)
          .eq('is_active', true),
        
        // [11] Bounce rate - messages grouped by conversation with remitente
        // PERF: Reduced limit from 2000 to QUERY_LIMIT_MESSAGES
        supabase
          .from('wp_mensajes')
          .select('conversacion_id, remitente')
          .eq('empresa_id', selectedEnterpriseId)
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: true })
          .limit(QUERY_LIMIT_MESSAGES),
        
        // [12] Contacts metadata & fields for pattern analysis
        // PERF: Reduced limit from 1000 to 300 (patterns need fewer samples)
        (() => {
          let q = supabase
            .from('wp_contactos')
            .select('metadata, estado, etapa_emocional, origen, es_calificado')
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo)
            .limit(300);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [13] Contacts with email but no appointment
        (() => {
          let q = supabase
            .from('wp_contactos')
            .select('id, nombre, email')
            .eq('empresa_id', selectedEnterpriseId)
            .not('email', 'is', null)
            .neq('email', '')
            .gte('created_at', dateFrom)
            .lte('created_at', dateTo);
          if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
          return q;
        })(),
        
        // [14] Contact IDs that have appointments (to exclude)
        supabase
          .from('wp_citas')
          .select('contacto_id')
          .eq('empresa_id', selectedEnterpriseId)
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo),
        
        // [15] Marketing metrics - email sends
        supabase
          .from('wp_email_envio')
          .select('estado, contacto:contacto_id!inner(empresa_id)')
          .eq('contacto.empresa_id', selectedEnterpriseId)
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
      ];

      // Add previous period queries if possible
      if (prevPeriod) {
        queries.push(
          // [4] Contacts (Previous) - Count only
          (() => {
            let q = supabase
              .from('wp_contactos')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', selectedEnterpriseId)
              .gte('created_at', prevPeriod.prevFrom)
              .lte('created_at', prevPeriod.prevTo);
            if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
            return q;
          })(),
            
          // [5] Appointments (Previous) - Count only
          (() => {
            let q = supabase
              .from('wp_citas')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', selectedEnterpriseId)
              .gte('created_at', prevPeriod.prevFrom)
              .lte('created_at', prevPeriod.prevTo);
            if (effectiveTeamMemberIds.length > 0) q = q.in('team_humano_id', effectiveTeamMemberIds);
            return q;
          })(),
            
          // [6] Messages (Previous) - Count only
          supabase
            .from('wp_mensajes')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', selectedEnterpriseId)
            .gte('created_at', prevPeriod.prevFrom)
            .lte('created_at', prevPeriod.prevTo)
        );
      }

      // 3. Execute all in parallel with timeout
      const results = await Promise.race([
        Promise.all(queries),
        timeoutPromise
      ]) as any[];

      // 4. Extract Results
      const contactsData = results[0].data || [];
      const contactsCount = results[0].count || 0;
      
      const appointmentsData = results[1].data || [];
      const appointmentsCount = results[1].count || 0;
      
      const messagesCount = results[2].count || 0;
      const nextAppointments = results[3].data || [];
      
      let prevContactsCount = 0;
      let prevAppointmentsCount = 0;
      let prevMessagesCount = 0;

      // Previous period queries are added at the end of the array (after 16 base queries)
      // Base queries: 0-15 (16 total), Previous period: 16, 17, 18
      const BASE_QUERY_COUNT = 16;
      if (prevPeriod && results.length > BASE_QUERY_COUNT) {
        prevContactsCount = results[BASE_QUERY_COUNT]?.count || 0;
        prevAppointmentsCount = results[BASE_QUERY_COUNT + 1]?.count || 0;
        prevMessagesCount = results[BASE_QUERY_COUNT + 2]?.count || 0;
        logger.debug('[AdminMetrics] Previous period:', { prevContactsCount, prevAppointmentsCount, prevMessagesCount });
      }
      
      // ============================================
      // PROCESS NEW METRICS
      // ============================================
      
      // [4] Qualification breakdown
      const qualificationData = results[4]?.data || [];
      const qualificationBreakdown = { si: 0, no: 0, evaluando: 0, pendiente: 0 };
      qualificationData.forEach((c: any) => {
        const qual = (c.es_calificado || 'pendiente').toLowerCase();
        if (qual === 'si') qualificationBreakdown.si++;
        else if (qual === 'no') qualificationBreakdown.no++;
        else if (qual === 'evaluando') qualificationBreakdown.evaluando++;
        else qualificationBreakdown.pendiente++;
      });
      
      // [5] Funnel stages definition
      const funnelStagesData = results[5]?.data || [];
      
      // [6] Contacts by funnel stage
      const contactsByStageData = results[6]?.data || [];
      const stageCountMap = new Map<number, number>();
      contactsByStageData.forEach((c: any) => {
        const stageId = c.etapa_embudo;
        if (stageId) {
          stageCountMap.set(stageId, (stageCountMap.get(stageId) || 0) + 1);
        }
      });
      
      // Build funnel stages with counts
      const funnelStages = funnelStagesData.map((stage: any) => ({
        id: stage.id,
        name: stage.nombre_etapa,
        count: stageCountMap.get(stage.id) || 0
      }));
      
      // [7] Awaiting Response - Contacts with stale ultima_interaccion
      const awaitingResponseData = results[7]?.data || [];
      const awaitingResponseContacts = awaitingResponseData.map((c: any) => {
        const lastInteraction = c.ultima_interaccion ? new Date(c.ultima_interaccion) : null;
        const daysSinceInteraction = lastInteraction 
          ? Math.floor((Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          id: c.id,
          nombre: `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Sin nombre',
          diasSinRespuesta: daysSinceInteraction,
          ultimaInteraccion: c.ultima_interaccion,
          esCalificado: c.es_calificado
        };
      });
      const ghostedContacts = awaitingResponseContacts.length;
      
      // ============================================
      // v2 INTELLIGENCE METRICS PROCESSING
      // ============================================
      
      // [8] Appointments by status
      const appointmentsByStatusData = results[8]?.data || [];
      const appointmentsByStatus = { realizadas: 0, canceladas: 0, pendientes: 0, total: 0 };
      const agentCitasMap = new Map<number, { citas: number; realizadas: number }>();
      
      appointmentsByStatusData.forEach((apt: any) => {
        appointmentsByStatus.total++;
        const estado = (apt.estado || '').toLowerCase();
        if (estado === 'realizada') appointmentsByStatus.realizadas++;
        else if (estado === 'cancelada') appointmentsByStatus.canceladas++;
        else appointmentsByStatus.pendientes++;
        
        // Track by agent for performance
        if (apt.team_humano_id) {
          const current = agentCitasMap.get(apt.team_humano_id) || { citas: 0, realizadas: 0 };
          current.citas++;
          if (estado === 'realizada') current.realizadas++;
          agentCitasMap.set(apt.team_humano_id, current);
        }
      });
      
      // Calculate effectiveness: realizadas / (realizadas + canceladas)
      const closedAppointments = appointmentsByStatus.realizadas + appointmentsByStatus.canceladas;
      const appointmentEffectiveness = closedAppointments > 0 
        ? Math.round((appointmentsByStatus.realizadas / closedAppointments) * 100) 
        : 0;
      
      // [9] Hot leads TODAY
      const hotLeadsData = results[9]?.data || [];
      const hotLeadsToday = hotLeadsData.map((c: any) => ({
        id: c.id,
        nombre: `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Sin nombre',
        ultimaInteraccion: c.ultima_interaccion,
        esCalificado: c.es_calificado || 'pendiente'
      }));
      
      // [10] Team members + agent performance
      const teamMembersData = results[10]?.data || [];
      const agentPerformance = teamMembersData
        .map((member: any) => {
          const stats = agentCitasMap.get(member.id) || { citas: 0, realizadas: 0 };
          return {
            id: member.id,
            nombre: `${member.nombre || ''} ${member.apellido?.charAt(0) || ''}.`.trim(),
            citas: stats.citas,
            realizadas: stats.realizadas,
            tasa: stats.citas > 0 ? Math.round((stats.realizadas / stats.citas) * 100) : 0
          };
        })
        .filter((a: any) => a.citas > 0)
        .sort((a: any, b: any) => b.tasa - a.tasa);
      
      // ============================================
      // [11] BOUNCE RATE - Contacts with 3+ agent msgs without client response
      // ============================================
      const bounceMessagesData = results[11]?.data || [];
      const conversationMessages = new Map<number, { agent: number; client: number }>();
      
      bounceMessagesData.forEach((msg: any) => {
        const convId = msg.conversacion_id;
        if (!convId) return;
        
        const current = conversationMessages.get(convId) || { agent: 0, client: 0 };
        const remitente = (msg.remitente || '').toLowerCase();
        
        // Agent messages: agente, sistema, asistente, humano
        if (['agente', 'sistema', 'asistente', 'humano', 'assistant', 'model'].includes(remitente)) {
          current.agent++;
        }
        // Client messages: cliente, user, usuario
        else if (['cliente', 'user', 'usuario'].includes(remitente)) {
          current.client++;
        }
        conversationMessages.set(convId, current);
      });
      
      // Count bounced: less than 2 client messages
      let bouncedContacts = 0;
      let totalContactsWithMessages = 0;
      conversationMessages.forEach((stats) => {
        if (stats.agent > 0) totalContactsWithMessages++;
        if (stats.agent > 0 && stats.client < 2) bouncedContacts++;
      });
      
      const bounceRate = totalContactsWithMessages > 0
        ? Math.round((bouncedContacts / totalContactsWithMessages) * 100)
        : 0;
      
      // ============================================
      // [12] METADATA & FIELD PATTERNS - Analyze repeated values
      // ============================================
      const patternsData = results[12]?.data || [];
      const patternCounts = new Map<string, number>();
      
      // Helper: Check if value looks like a timestamp/date
      const isTimestampLike = (val: string): boolean => {
        if (!val) return true;
        // ISO dates, timestamps with T/Z, numeric-heavy strings
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) return true; // 2024-01-01...
        if (/T\d{2}:\d{2}/.test(val)) return true; // Contains T00:00
        if (/\d{2}:\d{2}:\d{2}/.test(val)) return true; // HH:MM:SS
        if (/^\d+$/.test(val) && val.length > 6) return true; // Long numbers
        return false;
      };
      
      // Helper: Check if key should be excluded
      const isExcludedKey = (key: string): boolean => {
        const k = key.toLowerCase();
        const excludePatterns = ['fecha', 'date', 'created', 'updated', 'timestamp', 'time', '_at', '_id', 'id', 'token', 'password', 'secret', 'key', 'url', 'link', 'path'];
        return excludePatterns.some(p => k.includes(p));
      };
      
      patternsData.forEach((c: any) => {
        // 1. Analyze direct fields that represent segments (PRIORITY)
        const segments = [
          { key: 'Estado', value: c.estado },
          { key: 'Etapa Emocional', value: c.etapa_emocional },
          { key: 'Origen', value: c.origen },
          { key: 'Calificado', value: c.es_calificado }
        ];

        segments.forEach(seg => {
          if (seg.value && typeof seg.value === 'string' && seg.value !== 'null' && seg.value.length < 50) {
            const label = `${seg.key}: ${seg.value}`;
            patternCounts.set(label, (patternCounts.get(label) || 0) + 1);
          }
        });

        // 2. Analyze JSON metadata (only categorical fields)
        if (c.metadata && typeof c.metadata === 'object') {
          const meta = c.metadata;
          const goodFields = ['nacionalidad', 'pais', 'ciudad', 'origen', 'fuente', 'tipo', 'categoria', 'interes', 'servicio', 'producto', 'plan', 'nivel', 'segmento', 'industria', 'sector'];
          
          Object.entries(meta).forEach(([key, value]) => {
            // Skip excluded keys
            if (isExcludedKey(key)) return;
            
            const keyLower = key.toLowerCase();
            const isGoodField = goodFields.some(f => keyLower.includes(f));
            
            // Only process good fields or short categorical strings
            if (value && typeof value === 'string' && !isTimestampLike(value)) {
              const trimmed = value.trim();
              // Must be short (categorical) and not a timestamp
              if (trimmed.length > 0 && trimmed.length < 40 && (isGoodField || trimmed.length < 25)) {
                const label = `${key}: ${trimmed}`;
                patternCounts.set(label, (patternCounts.get(label) || 0) + 1);
              }
            }
          });
        }
      });
      
      // Convert to sorted array - only patterns with 2+ occurrences (real patterns)
      const metadataPatterns = Array.from(patternCounts.entries())
        .filter(([_, count]) => count >= 2) // Only real patterns
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, contactos: count }));
      
      // ============================================
      // [13-14] CONTACTS WITH EMAIL BUT NO APPOINTMENT
      // ============================================
      const contactsWithEmailData = results[13]?.data || [];
      const contactsWithAppointmentsData = results[14]?.data || [];
      const appointmentContactIds = new Set(
        contactsWithAppointmentsData.map((a: any) => a.contacto_id)
      );
      const contactsWithEmailNoAppointment = contactsWithEmailData.filter(
        (c: any) => !appointmentContactIds.has(c.id)
      ).length;
      
      // ============================================
      // [15] MARKETING METRICS - Email campaigns
      // ============================================
      const emailEnviosData = results[15]?.data || [];
      const emailStats = { enviados: 0, abiertos: 0, clics: 0, fallidos: 0 };
      emailEnviosData.forEach((e: any) => {
        const estado = (e.estado || '').toLowerCase();
        if (['enviado', 'abierto', 'clic'].includes(estado)) emailStats.enviados++;
        if (estado === 'abierto' || estado === 'clic') emailStats.abiertos++;
        if (estado === 'clic') emailStats.clics++;
        if (estado === 'fallido') emailStats.fallidos++;
      });
      const emailOpenRate = emailStats.enviados > 0 
        ? Math.round((emailStats.abiertos / emailStats.enviados) * 100) 
        : 0;
      
      // Calculate qualification percentages
      const totalQualified = qualificationBreakdown.si + qualificationBreakdown.no + qualificationBreakdown.evaluando + qualificationBreakdown.pendiente;
      const qualificationPct = {
        si: totalQualified > 0 ? Math.round((qualificationBreakdown.si / totalQualified) * 100) : 0,
        no: totalQualified > 0 ? Math.round((qualificationBreakdown.no / totalQualified) * 100) : 0,
        evaluando: totalQualified > 0 ? Math.round((qualificationBreakdown.evaluando / totalQualified) * 100) : 0
      };

      // 5. Real Trend Calculation
      const contactsTrend = calcTrend(contactsCount, prevContactsCount);
      const appointmentsTrend = calcTrend(appointmentsCount, prevAppointmentsCount);
      const messagesTrend = calcTrend(messagesCount, prevMessagesCount);
      
      const conversionRate = contactsCount > 0 
        ? Math.round((appointmentsCount / contactsCount) * 100) 
        : 0;
      const prevConversionRate = prevContactsCount > 0
        ? Math.round((prevAppointmentsCount / prevContactsCount) * 100)
        : 0;
      const conversionTrend = calcTrend(conversionRate, prevConversionRate);

      // 6. Build Chart Data (client-side aggregation from already-fetched data)
      const chartMap = new Map<string, { date: string; displayDate: string; contactos: number; citas: number }>();
      
      // IMPORTANT: Use local date (America/Lima) to match filter ranges, NOT UTC
      const processDate = (dateStr: string | null): string | null => {
        if (!dateStr) return null;
        try {
          const d = new Date(dateStr);
          // Format as YYYY-MM-DD in local timezone (not UTC)
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        } catch { return null; }
      };

      // Populate with Contacts
      contactsData.forEach((c: any) => {
        const date = processDate(c.created_at);
        if (date) {
          if (!chartMap.has(date)) {
            chartMap.set(date, { date, displayDate: formatChartDate(date), contactos: 0, citas: 0 });
          }
          chartMap.get(date)!.contactos++;
        }
      });

      // Populate with Appointments
      appointmentsData.forEach((a: any) => {
        const date = processDate(a.created_at);
        if (date) {
          if (!chartMap.has(date)) {
            chartMap.set(date, { date, displayDate: formatChartDate(date), contactos: 0, citas: 0 });
          }
          chartMap.get(date)!.citas++;
        }
      });

      const chartData = Array.from(chartMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ displayDate, contactos, citas }) => ({ name: displayDate, contactos, citas }));

      // 7. Contacts by Origin (Top 8 + Otros)
      const originCounts = new Map<string, number>();
      contactsData.forEach((contact: any) => {
        const rawOrigin = typeof contact.origen === 'string' ? contact.origen.trim() : '';
        const origin = rawOrigin || 'Sin origen';
        originCounts.set(origin, (originCounts.get(origin) || 0) + 1);
      });

      const originEntries = Array.from(originCounts.entries())
        .sort((a, b) => b[1] - a[1]);
      const maxOriginItems = 8;
      const originChartData = originEntries
        .slice(0, maxOriginItems)
        .map(([name, count]) => ({ name, contactos: count }));
      const otherOriginsCount = originEntries
        .slice(maxOriginItems)
        .reduce((sum, [, count]) => sum + count, 0);
      if (otherOriginsCount > 0) {
        originChartData.push({ name: 'Otros', contactos: otherOriginsCount });
      }

      // ============================================
      // CONSTRUCT UI BLOCKS - Dashboard v3 Redesign
      // Layout: KPIs (6) → Tendencia → Análisis (2x2) → Inteligencia
      // ============================================
      const newBlocks: UIBlock[] = [
        // ═══════════════════════════════════════════
        // ROW 1: KPIs PRINCIPALES (6 tarjetas)
        // ═══════════════════════════════════════════
        {
          type: 'kpi_card',
          title: 'Nuevos Contactos',
          data: {
            value: contactsCount,
            trend: contactsTrend.trend,
            trendDirection: contactsTrend.direction,
            description: 'vs periodo anterior'
          }
        },
        {
          type: 'kpi_card',
          title: 'Citas Agendadas',
          data: {
            value: appointmentsCount,
            trend: appointmentsTrend.trend,
            trendDirection: appointmentsTrend.direction,
            description: 'vs periodo anterior'
          }
        },
        {
          type: 'kpi_card',
          title: 'Agendamiento',
          data: {
            value: `${conversionRate}%`,
            trend: conversionTrend.trend,
            trendDirection: conversionTrend.direction,
            description: 'Contacto → Cita'
          }
        },
        {
          type: 'kpi_card',
          title: '📧 Con Email',
          theme: contactsWithEmailNoAppointment > 10 ? 'warning' : 'info',
          data: {
            value: contactsWithEmailNoAppointment,
            trend: contactsCount > 0 ? `${Math.round((contactsWithEmailNoAppointment / contactsCount) * 100)}% del total` : '',
            trendDirection: contactsWithEmailNoAppointment > 0 ? 'up' : 'neutral',
            description: 'Sin cita aún'
          }
        },
        {
          type: 'kpi_card',
          title: '📉 Rebote',
          theme: bounceRate > 30 ? 'warning' : bounceRate > 15 ? 'info' : 'success',
          data: {
            value: `${bounceRate}%`,
            trend: `${bouncedContacts} conv`,
            trendDirection: bounceRate > 20 ? 'down' : 'neutral',
            description: '< 2 msgs del contacto'
          }
        },
        {
          type: 'kpi_card',
          title: '📤 Correos Enviados',
          theme: emailStats.enviados > 0 ? 'info' : 'neutral',
          data: {
            value: emailStats.enviados,
            trend: emailStats.abiertos > 0 ? `${emailOpenRate}% abiertos` : '',
            trendDirection: emailOpenRate >= 30 ? 'up' : emailOpenRate > 0 ? 'neutral' : 'neutral',
            description: 'Campañas email'
          }
        },
        
        // ═══════════════════════════════════════════
        // ROW 2: GRÁFICO TENDENCIA (full width)
        // ═══════════════════════════════════════════
        {
          type: 'chart',
          title: '📈 Tendencia: Contactos vs Citas',
          data: {
            chartType: 'area',
            data: chartData,
            xKey: 'name',
            series: ['contactos', 'citas'],  // EXPLICIT ORDER - prevents Object.keys() issues
            colors: ['#8b5cf6', '#06b6d4'],  // contactos=purple, citas=cyan
            yUnit: ''
          }
        },
        
        // ═══════════════════════════════════════════
        // ROW 3: CITAS POR ESTADO + CALIFICACIÓN (2 columnas)
        // ═══════════════════════════════════════════
        {
          type: 'chart',
          title: '📅 Citas por Estado',
          data: {
            chartType: 'pie',
            data: [
              { name: `✓ Realizadas (${appointmentsByStatus.total > 0 ? Math.round((appointmentsByStatus.realizadas / appointmentsByStatus.total) * 100) : 0}%)`, value: appointmentsByStatus.realizadas },
              { name: `✗ Canceladas (${appointmentsByStatus.total > 0 ? Math.round((appointmentsByStatus.canceladas / appointmentsByStatus.total) * 100) : 0}%)`, value: appointmentsByStatus.canceladas },
              { name: `⏳ Pendientes (${appointmentsByStatus.total > 0 ? Math.round((appointmentsByStatus.pendientes / appointmentsByStatus.total) * 100) : 0}%)`, value: appointmentsByStatus.pendientes }
            ].filter(d => d.value > 0),
            colors: ['#22c55e', '#ef4444', '#f59e0b']
          }
        },
        {
          type: 'chart',
          title: '🎯 Calificación de Leads',
          data: {
            chartType: 'pie',
            data: [
              { name: `✓ Calificados (${qualificationPct.si}%)`, value: qualificationBreakdown.si },
              { name: `✗ No Calificados (${qualificationPct.no}%)`, value: qualificationBreakdown.no },
              { name: `⏳ Evaluando (${qualificationPct.evaluando}%)`, value: qualificationBreakdown.evaluando },
              { name: '○ Pendiente', value: qualificationBreakdown.pendiente }
            ].filter(d => d.value > 0),
            colors: ['#22c55e', '#ef4444', '#f59e0b', '#71717a']
          }
        },
        ...(originChartData.length > 0 ? [{
          type: 'chart' as const,
          title: '🧭 Contactos por Origen',
          data: {
            chartType: 'bar' as const,
            orientation: 'horizontal' as const,
            data: originChartData,
            xKey: 'name',
            colors: ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#f97316', '#84cc16']
          }
        }] : []),
        ...(funnelStages.length > 0 ? [{
          type: 'chart' as const,
          title: '🔄 Embudo de Ventas',
          data: {
            chartType: 'bar' as const,
            orientation: 'horizontal' as const,
            data: funnelStages.map((stage: any) => ({
              name: stage.name,
              contactos: stage.count
            })),
            xKey: 'name',
            colors: ['#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e']
          }
        }] : []),
        
        // ═══════════════════════════════════════════
        // ROW 4: MARKETING + PATRONES (2 columnas)
        // ═══════════════════════════════════════════
        {
          type: 'chart',
          title: '📬 Marketing: Correos',
          data: {
            chartType: 'pie',
            data: [
              { name: `Abiertos (${emailOpenRate}%)`, value: emailStats.abiertos },
              { name: 'No abiertos', value: Math.max(0, emailStats.enviados - emailStats.abiertos) },
              { name: 'Fallidos', value: emailStats.fallidos }
            ].filter(d => d.value > 0),
            colors: ['#22c55e', '#71717a', '#ef4444']
          }
        },
        ...(metadataPatterns.length > 0 ? [{
          type: 'chart' as const,
          title: '🏷️ Patrones en Contactos',
          data: {
            chartType: 'bar' as const,
            orientation: 'horizontal' as const,
            data: metadataPatterns,
            xKey: 'name',
            colors: ['#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#f97316', '#84cc16']
          }
        }] : [])
      ];

      setMetrics({
        totalMessages: messagesCount,
        activeConversations: 0,
        appointmentsCount: appointmentsCount,
        newContactsCount: contactsCount,
        recentChats: [],
        nextAppointments: nextAppointments || [],
        isLoading: false,
        error: null,
        qualificationBreakdown,
        funnelStages,
        ghostedContacts,
        // v2 Intelligence Metrics
        appointmentsByStatus,
        appointmentEffectiveness,
        hotLeadsToday,
        agentPerformance
      });

      setDashboardBlocks(newBlocks);
      setIsBackgroundRefresh(false);
      fetchInProgressRef.current = false;
      
      // PERFORMANCE: Track fetch duration
      const fetchDuration = performance.now() - fetchStartTime;
      trackMetric('dashboard_fetch_time', fetchDuration, 'ms', {
        contactsCount,
        appointmentsCount,
        messagesCount
      });
      logger.debug(`[AdminMetrics] ✅ Dashboard loaded in ${fetchDuration.toFixed(0)}ms`);

    } catch (err: any) {
      // PERFORMANCE: Don't log aborted requests as errors
      if (err.name === 'AbortError') {
        logger.debug('[AdminMetrics] Request aborted (superseded by newer request)');
        return;
      }
      
      const fetchDuration = performance.now() - fetchStartTime;
      logger.error(`[AdminMetrics] Error after ${fetchDuration.toFixed(0)}ms:`, err);
      
      // Provide user-friendly error messages
      let errorMessage = err.message;
      if (err.message === 'TIMEOUT') {
        errorMessage = 'Las consultas tardaron demasiado. Intenta con un rango de fechas más corto.';
      }
      
      setDashboardLoading(false);
      setDashboardError(errorMessage);
      setIsBackgroundRefresh(false);
      fetchInProgressRef.current = false;
    }
  }, [selectedEnterpriseId, filters, shouldUseCachedData]);

  // Initial fetch - use cache if available, otherwise fetch
  useEffect(() => {
    const hasCachedData = blocks.length > 0;
    if (!hasCachedData || !shouldUseCachedData()) {
      fetchMetrics();
    }
  }, [selectedEnterpriseId]); // Only re-fetch on enterprise change
  
  // PERFORMANCE: Memoize filter change detection
  const filterKey = useMemo(() => 
    `${filters.dateRange.from || ''}-${filters.dateRange.to || ''}`,
    [filters.dateRange.from, filters.dateRange.to]
  );

  // Fetch when filters change (debounced)
  useEffect(() => {
    // Skip initial mount and only fetch if filters have actual values
    if (filters.dateRange.from) {
      const timer = setTimeout(() => {
        fetchMetrics(true);
      }, FILTER_DEBOUNCE_MS); // PERFORMANCE: Increased debounce
      return () => clearTimeout(timer);
    }
  }, [filterKey]); // PERFORMANCE: Use memoized key instead of individual values

  // Fetch when global team filter changes (faster debounce for dropdown)
  // Skip initial mount to avoid double-fetch with the enterprise useEffect
  useEffect(() => {
    if (isFirstTeamFilterRender.current) {
      isFirstTeamFilterRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchMetrics(true);
    }, TEAM_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(effectiveTeamMemberIds)]);
  
  // PERFORMANCE: Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    blocks,
    isLoading: isLoadingStore && !isBackgroundRefresh, // Don't show loading if background refresh
    error: errorStore,
    refresh: () => fetchMetrics(true), // Force refresh on manual refresh
    metrics,
    filters,
    setFilters,
    lastFetchTime,
    isBackgroundRefresh
  };
};
