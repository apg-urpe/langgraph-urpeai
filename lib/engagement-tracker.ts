/**
 * Engagement Tracker - Sistema de tracking de adopción y uso
 * 
 * Captura eventos de usuario para entender cómo usan la aplicación.
 * 
 * @module lib/engagement-tracker
 * 
 * Uso:
 * ```typescript
 * import { trackPageView, trackAction, trackFeatureUse } from '@/lib/engagement-tracker';
 * 
 * // Track cuando usuario ve una página/módulo
 * trackPageView('contacts', 'list_view');
 * 
 * // Track cuando usuario realiza una acción
 * trackAction('contacts', 'contact.create', { contactId: 123 });
 * 
 * // Track uso de feature específica
 * trackFeatureUse('chat', 'multimedia_upload', { fileType: 'image' });
 * ```
 */

import { supabase } from './supabase-client';
import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

export type EventType = 'page_view' | 'action' | 'feature_use' | 'session_start' | 'session_end';

export type ModuleName = 
  | 'dashboard' 
  | 'contacts' 
  | 'calendar' 
  | 'chat' 
  | 'tasks' 
  | 'activity'
  | 'marketing' 
  | 'team' 
  | 'observability'
  | 'funnel'
  | 'messages'
  | 'finance'
  | 'profile'
  | 'settings'
  | 'research'
  | 'emails'
  | 'artifacts'
  | 'email-marketing'
  | 'redaccion'
  | 'transcripciones';

export interface EngagementEvent {
  event_type: EventType;
  event_name: string;
  module: ModuleName;
  sub_module?: string;
  metadata?: Record<string, unknown>;
}

export interface EngagementContext {
  userId: string | null;
  teamHumanoId: number | null;
  enterpriseId: number | null;
  sessionId: string;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

let currentSessionId: string | null = null;
let sessionStartTime: number | null = null;
let lastActivityTime: number | null = null;
let currentContext: EngagementContext | null = null;

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Debounce tracking to prevent spam (min 2000ms between same events)
const eventDebounceMap = new Map<string, number>();
const DEBOUNCE_MS = 2000;

// Circuit breaker: disable tracking after repeated failures
let consecutiveFailures = 0;
const MAX_FAILURES = 5;
let trackingDisabled = false;
let trackingDisabledAt: number | null = null;
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // Re-enable after 5 minutes

/**
 * Genera un ID de sesión único
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `sess_${timestamp}_${random}`;
}

/**
 * Detecta el tipo de dispositivo
 */
function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Verifica si la sesión actual es válida o necesita renovarse
 */
function checkSessionValidity(): boolean {
  if (!currentSessionId || !lastActivityTime) return false;
  
  const now = Date.now();
  return (now - lastActivityTime) < SESSION_TIMEOUT_MS;
}

/**
 * Inicia o renueva la sesión de engagement
 */
export function initEngagementSession(context: Omit<EngagementContext, 'sessionId'>): string {
  const now = Date.now();
  
  // Si hay sesión válida, solo actualiza el contexto
  if (checkSessionValidity() && currentSessionId) {
    currentContext = { ...context, sessionId: currentSessionId };
    lastActivityTime = now;
    return currentSessionId;
  }
  
  // Crear nueva sesión
  currentSessionId = generateSessionId();
  sessionStartTime = now;
  lastActivityTime = now;
  currentContext = { ...context, sessionId: currentSessionId };
  
  // Track session start (non-blocking)
  trackEvent({
    event_type: 'session_start',
    event_name: 'session.started',
    module: 'dashboard', // Default module
    metadata: {
      device_type: getDeviceType(),
      viewport_width: typeof window !== 'undefined' ? window.innerWidth : null,
      viewport_height: typeof window !== 'undefined' ? window.innerHeight : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });
  
  logger.debug('[Engagement] New session started:', currentSessionId);
  
  return currentSessionId;
}

/**
 * Actualiza el contexto de la sesión (cuando cambia empresa, etc.)
 */
export function updateEngagementContext(context: Partial<Omit<EngagementContext, 'sessionId'>>): void {
  if (currentContext) {
    currentContext = { ...currentContext, ...context };
  }
}

/**
 * Termina la sesión actual
 */
export function endEngagementSession(): void {
  if (!currentSessionId || !sessionStartTime) return;
  
  const duration = Math.round((Date.now() - sessionStartTime) / 1000);
  
  trackEvent({
    event_type: 'session_end',
    event_name: 'session.ended',
    module: 'dashboard',
    metadata: {
      duration_seconds: duration
    }
  });
  
  logger.debug('[Engagement] Session ended, duration:', duration, 'seconds');
  
  currentSessionId = null;
  sessionStartTime = null;
  lastActivityTime = null;
}

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Verifica si el evento debe ser debounced
 */
function shouldDebounce(eventKey: string): boolean {
  const now = Date.now();
  const lastTime = eventDebounceMap.get(eventKey);
  
  if (lastTime && (now - lastTime) < DEBOUNCE_MS) {
    return true;
  }
  
  eventDebounceMap.set(eventKey, now);
  
  // Limpiar eventos antiguos cada 100 eventos
  if (eventDebounceMap.size > 100) {
    const cutoff = now - DEBOUNCE_MS * 2;
    eventDebounceMap.forEach((time, key) => {
      if (time < cutoff) eventDebounceMap.delete(key);
    });
  }
  
  return false;
}

/**
 * Track de evento genérico (interno)
 */
async function trackEvent(event: EngagementEvent): Promise<void> {
  // Circuit breaker: si el tracking está deshabilitado, verificar si ya pasó el periodo de reset
  if (trackingDisabled) {
    if (trackingDisabledAt && Date.now() - trackingDisabledAt >= CIRCUIT_BREAKER_RESET_MS) {
      trackingDisabled = false;
      trackingDisabledAt = null;
      consecutiveFailures = 0;
      logger.debug('[Engagement] Circuit breaker reset, re-enabling tracking');
    } else {
      return;
    }
  }
  
  // Skip si no hay contexto
  if (!currentContext?.userId) return;
  
  // Debounce check
  const eventKey = `${event.event_type}:${event.event_name}:${event.module}`;
  if (shouldDebounce(eventKey)) return;
  
  // Actualizar última actividad
  lastActivityTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('wp_user_engagement')
      .insert({
        user_id: currentContext.userId,
        team_humano_id: currentContext.teamHumanoId,
        empresa_id: currentContext.enterpriseId,
        event_type: event.event_type,
        event_name: event.event_name,
        module: event.module,
        sub_module: event.sub_module,
        metadata: event.metadata || {},
        session_id: currentContext.sessionId,
        device_type: getDeviceType(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    
    if (error) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES) {
        trackingDisabled = true;
        trackingDisabledAt = Date.now();
        logger.warn('[Engagement] Tracking disabled after repeated failures (RLS/table issue). Run ENGAGEMENT_TRACKING_SCHEMA.sql to fix.');
      }
      return;
    }
    
    // Reset failures on success
    consecutiveFailures = 0;
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_FAILURES) {
      trackingDisabled = true;
      logger.warn('[Engagement] Tracking disabled after repeated failures.');
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Track cuando el usuario ve una página/módulo
 */
export function trackPageView(
  module: ModuleName, 
  subModule?: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    event_type: 'page_view',
    event_name: `${module}.view${subModule ? `.${subModule}` : ''}`,
    module,
    sub_module: subModule,
    metadata
  });
}

/**
 * Track cuando el usuario realiza una acción
 */
export function trackAction(
  module: ModuleName,
  actionName: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    event_type: 'action',
    event_name: actionName,
    module,
    metadata
  });
}

/**
 * Track uso de una feature específica
 */
export function trackFeatureUse(
  module: ModuleName,
  featureName: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    event_type: 'feature_use',
    event_name: `${module}.${featureName}`,
    module,
    metadata
  });
}

/**
 * Track click en elemento específico (para heatmaps futuros)
 */
export function trackClick(
  module: ModuleName,
  elementId: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    event_type: 'action',
    event_name: `${module}.click.${elementId}`,
    module,
    metadata: {
      element_id: elementId,
      ...metadata
    }
  });
}

// ============================================================================
// ANALYTICS QUERIES (Client-side)
// ============================================================================

export interface RetentionMetrics {
  dau: number;
  wau: number;
  mau: number;
  retention_rate: number;
  avg_sessions_per_user: number;
  avg_modules_per_user: number;
}

export interface ModuleUsageStats {
  module: string;
  unique_users: number;
  total_views: number;
  total_actions: number;
  usage_percentage: number;
}

export interface DailyEngagement {
  date: string;
  total_events: number;
  unique_users: number;
  total_sessions: number;
}

/**
 * Obtiene métricas de retención para una empresa
 */
export async function getRetentionMetrics(enterpriseId: number): Promise<RetentionMetrics | null> {
  if (trackingDisabled) return null;
  
  try {
    const { data, error } = await supabase
      .rpc('get_retention_metrics', { p_empresa_id: enterpriseId, p_days: 30 });
    
    if (error) {
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        trackingDisabled = true;
        trackingDisabledAt = Date.now();
        logger.warn('[Engagement] RPC not found - tracking disabled. Run ENGAGEMENT_TRACKING_SCHEMA.sql.');
      }
      return null;
    }
    
    return data?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Obtiene estadísticas de uso por módulo
 */
export async function getModuleUsageStats(
  enterpriseId: number, 
  days: number = 7
): Promise<ModuleUsageStats[]> {
  if (trackingDisabled) return [];
  
  try {
    const { data, error } = await supabase
      .rpc('get_module_usage_stats', { p_empresa_id: enterpriseId, p_days: days });
    
    if (error) {
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        trackingDisabled = true;
        trackingDisabledAt = Date.now();
      }
      return [];
    }
    
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Obtiene engagement diario para gráficos
 */
export async function getDailyEngagement(
  enterpriseId: number,
  days: number = 30
): Promise<DailyEngagement[]> {
  if (trackingDisabled) return [];
  
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('wp_user_engagement_daily')
      .select('date, total_events, user_id, session_count')
      .eq('empresa_id', enterpriseId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });
    
    if (error) {
      if (error.code === '42501' || error.message?.includes('permission denied')) {
        trackingDisabled = true;
        trackingDisabledAt = Date.now();
      }
      return [];
    }
    
    // Agregar por fecha
    const dailyMap = new Map<string, DailyEngagement>();
    
    (data || []).forEach((row: any) => {
      const dateStr = row.date;
      const existing = dailyMap.get(dateStr);
      
      if (existing) {
        existing.total_events += row.total_events || 0;
        existing.unique_users += 1;
        existing.total_sessions += row.session_count || 0;
      } else {
        dailyMap.set(dateStr, {
          date: dateStr,
          total_events: row.total_events || 0,
          unique_users: 1,
          total_sessions: row.session_count || 0
        });
      }
    });
    
    return Array.from(dailyMap.values());
  } catch (err) {
    logger.error('[Engagement] Error fetching daily engagement:', err);
    return [];
  }
}

/**
 * Obtiene las features más usadas
 */
export async function getTopFeatures(
  enterpriseId: number,
  days: number = 7,
  limit: number = 10
): Promise<{ feature: string; count: number }[]> {
  if (trackingDisabled) return [];
  
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('wp_user_engagement')
      .select('event_name')
      .eq('empresa_id', enterpriseId)
      .eq('event_type', 'feature_use')
      .gte('created_at', startDate.toISOString());
    
    if (error) {
      if (error.code === '42501' || error.message?.includes('permission denied')) {
        trackingDisabled = true;
        trackingDisabledAt = Date.now();
      }
      return [];
    }
    
    // Count features
    const featureCount = new Map<string, number>();
    (data || []).forEach((row: any) => {
      const current = featureCount.get(row.event_name) || 0;
      featureCount.set(row.event_name, current + 1);
    });
    
    // Sort and limit
    return Array.from(featureCount.entries())
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch (err) {
    logger.error('[Engagement] Error fetching top features:', err);
    return [];
  }
}

// ============================================================================
// BROWSER LIFECYCLE HANDLERS
// ============================================================================

if (typeof window !== 'undefined') {
  // End session when user leaves
  window.addEventListener('beforeunload', () => {
    endEngagementSession();
  });
  
  // Track visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // User switched tabs/minimized - could end session after timeout
      lastActivityTime = Date.now();
    } else if (document.visibilityState === 'visible') {
      // User came back - check if session is still valid
      if (!checkSessionValidity() && currentContext) {
        initEngagementSession({
          userId: currentContext.userId,
          teamHumanoId: currentContext.teamHumanoId,
          enterpriseId: currentContext.enterpriseId
        });
      }
    }
  });
}
