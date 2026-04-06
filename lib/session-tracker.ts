/**
 * Session Tracker - Seguimiento de Sesiones de Usuario
 * 
 * Captura datos de sesión para análisis de comportamiento:
 * - Duración de sesiones
 * - Páginas visitadas
 * - Acciones realizadas
 * - Dispositivo y navegador
 */

import { supabase } from './supabase-client';
import { logWarning } from './error-logger';

// ============================================
// TYPES
// ============================================

export interface SessionData {
  sessionId: string;
  userId: string | null;
  empresaId: number | null;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  pageViews: number;
  actions: number;
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  lastActivity: Date;
  isActive: boolean;
}

interface SessionEvent {
  type: 'page_view' | 'action' | 'error' | 'performance';
  name: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ============================================
// SESSION STATE
// ============================================

let currentSession: SessionData | null = null;
let sessionEvents: SessionEvent[] = [];
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity = new session
const FLUSH_INTERVAL_MS = 60 * 1000; // Flush to DB every minute

// ============================================
// HELPERS
// ============================================

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function detectDevice(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  
  const ua = navigator.userAgent.toLowerCase();
  
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }
  
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  }
  
  return 'desktop';
}

function detectBrowser(): string {
  if (typeof window === 'undefined') return 'unknown';
  
  const ua = navigator.userAgent;
  
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('SamsungBrowser')) return 'Samsung';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  
  return 'Other';
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Initialize or resume a session
 */
export function initSession(userId?: string | null, empresaId?: number | null): SessionData | null {
  // Check for existing session in localStorage
  if (typeof window !== 'undefined') {
    const storedSession = localStorage.getItem('urpe_session');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        const lastActivity = new Date(parsed.lastActivity);
        
        // Resume if within timeout
        if (Date.now() - lastActivity.getTime() < SESSION_TIMEOUT_MS) {
          currentSession = {
            ...parsed,
            startTime: new Date(parsed.startTime),
            lastActivity: new Date(),
            userId: userId || parsed.userId,
            empresaId: empresaId || parsed.empresaId,
            isActive: true
          };
          saveSessionToStorage();
          return currentSession;
        }
      } catch {
        // Invalid stored session, create new
      }
    }
  }

  // Create new session
  currentSession = {
    sessionId: generateSessionId(),
    userId: userId || null,
    empresaId: empresaId || null,
    startTime: new Date(),
    pageViews: 0,
    actions: 0,
    device: detectDevice(),
    browser: detectBrowser(),
    lastActivity: new Date(),
    isActive: true
  };

  saveSessionToStorage();
  
  // Start flush interval
  if (typeof window !== 'undefined') {
    setInterval(flushSession, FLUSH_INTERVAL_MS);
    
    // Track page unload
    window.addEventListener('beforeunload', () => {
      endSession();
    });
    
    // Track visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        flushSession();
      } else {
        updateActivity();
      }
    });
  }

  return currentSession;
}

/**
 * Get current session
 */
export function getSession(): SessionData | null {
  return currentSession;
}

/**
 * Update user context in session
 */
export function updateSessionUser(userId: string, empresaId?: number): void {
  if (currentSession) {
    currentSession.userId = userId;
    if (empresaId) currentSession.empresaId = empresaId;
    saveSessionToStorage();
  }
}

/**
 * Track a page view
 */
export function trackPageView(pageName: string): void {
  if (!currentSession) return;
  
  currentSession.pageViews++;
  updateActivity();
  
  sessionEvents.push({
    type: 'page_view',
    name: pageName,
    timestamp: new Date()
  });
}

/**
 * Track an action
 */
export function trackAction(actionName: string, data?: Record<string, unknown>): void {
  if (!currentSession) return;
  
  currentSession.actions++;
  updateActivity();
  
  sessionEvents.push({
    type: 'action',
    name: actionName,
    timestamp: new Date(),
    data
  });
}

/**
 * Update last activity timestamp
 */
function updateActivity(): void {
  if (currentSession) {
    currentSession.lastActivity = new Date();
    saveSessionToStorage();
  }
}

/**
 * Save session to localStorage
 */
function saveSessionToStorage(): void {
  if (typeof window !== 'undefined' && currentSession) {
    localStorage.setItem('urpe_session', JSON.stringify(currentSession));
  }
}

/**
 * Flush session data to database
 */
async function flushSession(): Promise<void> {
  if (!currentSession) return;
  
  try {
    // Calculate duration
    const duration = Math.floor((Date.now() - currentSession.startTime.getTime()) / 1000);
    
    const sessionData = {
      session_id: currentSession.sessionId,
      user_id: currentSession.userId,
      empresa_id: currentSession.empresaId,
      session_start: currentSession.startTime.toISOString(),
      duration_seconds: duration,
      page_views: currentSession.pageViews,
      actions_count: currentSession.actions,
      device_type: currentSession.device,
      browser: currentSession.browser,
      last_activity: currentSession.lastActivity.toISOString()
    };

    // Upsert session data
    await supabase
      .from('wp_sessions_log')
      .upsert(sessionData, { 
        onConflict: 'session_id',
        ignoreDuplicates: false 
      });

    // Clear flushed events
    sessionEvents = [];
  } catch (error) {
    // Don't block on session tracking errors
    if (process.env.NODE_ENV === 'development') {
      console.warn('[SessionTracker] Flush failed:', error);
    }
  }
}

/**
 * End the current session
 */
export async function endSession(): Promise<void> {
  if (!currentSession) return;
  
  currentSession.isActive = false;
  currentSession.endTime = new Date();
  currentSession.duration = Math.floor(
    (currentSession.endTime.getTime() - currentSession.startTime.getTime()) / 1000
  );
  
  await flushSession();
  
  // Clear storage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('urpe_session');
  }
  
  currentSession = null;
}

/**
 * Get session statistics
 */
export function getSessionStats(): {
  duration: number;
  pageViews: number;
  actions: number;
  actionsPerMinute: number;
} | null {
  if (!currentSession) return null;
  
  const durationMinutes = (Date.now() - currentSession.startTime.getTime()) / 60000;
  
  return {
    duration: Math.floor(durationMinutes),
    pageViews: currentSession.pageViews,
    actions: currentSession.actions,
    actionsPerMinute: durationMinutes > 0 
      ? Math.round((currentSession.actions / durationMinutes) * 10) / 10 
      : 0
  };
}

// ============================================
// HOOKS FOR REACT
// ============================================

/**
 * Hook to get current session in React components
 */
export function useSession() {
  return {
    session: currentSession,
    trackPageView,
    trackAction,
    getStats: getSessionStats
  };
}
