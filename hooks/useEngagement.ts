/**
 * useEngagement Hook
 * 
 * Hook para tracking automático de engagement en componentes React.
 * Inicializa la sesión y proporciona métodos de tracking.
 * 
 * @module hooks/useEngagement
 * 
 * Uso:
 * ```tsx
 * const { trackPageView, trackAction, trackFeature } = useEngagement();
 * 
 * // En un efecto o evento
 * useEffect(() => {
 *   trackPageView('contacts');
 * }, []);
 * ```
 */

import { useEffect, useCallback, useRef } from 'react';
import { useContactStore } from '@/store/contactStore';
import {
  initEngagementSession,
  updateEngagementContext,
  trackPageView as _trackPageView,
  trackAction as _trackAction,
  trackFeatureUse,
  trackClick as _trackClick,
  getRetentionMetrics,
  getModuleUsageStats,
  getDailyEngagement,
  getTopFeatures,
  type ModuleName,
  type RetentionMetrics,
  type ModuleUsageStats,
  type DailyEngagement
} from '@/lib/engagement-tracker';

interface UseEngagementOptions {
  autoTrackPageView?: boolean;
  module?: ModuleName;
  subModule?: string;
}

interface UseEngagementReturn {
  // Tracking methods
  trackPageView: (module: ModuleName, subModule?: string, metadata?: Record<string, unknown>) => void;
  trackAction: (module: ModuleName, actionName: string, metadata?: Record<string, unknown>) => void;
  trackFeature: (module: ModuleName, featureName: string, metadata?: Record<string, unknown>) => void;
  trackClick: (module: ModuleName, elementId: string, metadata?: Record<string, unknown>) => void;
  
  // Analytics fetchers
  fetchRetentionMetrics: () => Promise<RetentionMetrics | null>;
  fetchModuleUsage: (days?: number) => Promise<ModuleUsageStats[]>;
  fetchDailyEngagement: (days?: number) => Promise<DailyEngagement[]>;
  fetchTopFeatures: (days?: number, limit?: number) => Promise<{ feature: string; count: number }[]>;
}

/**
 * Hook principal de engagement
 */
export function useEngagement(options?: UseEngagementOptions): UseEngagementReturn {
  const userContext = useContactStore(state => state.userContext);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  
  const sessionInitialized = useRef(false);
  const lastEnterpriseId = useRef<number | null>(null);
  
  // Inicializar sesión cuando tengamos contexto de usuario
  useEffect(() => {
    if (!userContext?.authUid) return;
    
    // Solo inicializar una vez o cuando cambie el usuario
    if (!sessionInitialized.current) {
      initEngagementSession({
        userId: userContext.authUid,
        teamHumanoId: userContext.id || null,
        enterpriseId: selectedEnterpriseId
      });
      sessionInitialized.current = true;
      lastEnterpriseId.current = selectedEnterpriseId;
    }
  }, [userContext?.authUid, userContext?.id, selectedEnterpriseId]);
  
  // Actualizar contexto cuando cambie la empresa
  useEffect(() => {
    if (selectedEnterpriseId && selectedEnterpriseId !== lastEnterpriseId.current) {
      updateEngagementContext({ enterpriseId: selectedEnterpriseId });
      lastEnterpriseId.current = selectedEnterpriseId;
    }
  }, [selectedEnterpriseId]);
  
  // Auto-track page view si está configurado
  useEffect(() => {
    if (options?.autoTrackPageView && options?.module && sessionInitialized.current) {
      _trackPageView(options.module, options.subModule);
    }
  }, [options?.autoTrackPageView, options?.module, options?.subModule]);
  
  // Tracking methods (memoized)
  const trackPageView = useCallback((
    module: ModuleName, 
    subModule?: string, 
    metadata?: Record<string, unknown>
  ) => {
    _trackPageView(module, subModule, metadata);
  }, []);
  
  const trackAction = useCallback((
    module: ModuleName, 
    actionName: string, 
    metadata?: Record<string, unknown>
  ) => {
    _trackAction(module, actionName, metadata);
  }, []);
  
  const trackFeature = useCallback((
    module: ModuleName, 
    featureName: string, 
    metadata?: Record<string, unknown>
  ) => {
    trackFeatureUse(module, featureName, metadata);
  }, []);
  
  const trackClick = useCallback((
    module: ModuleName, 
    elementId: string, 
    metadata?: Record<string, unknown>
  ) => {
    _trackClick(module, elementId, metadata);
  }, []);
  
  // Analytics fetchers
  const fetchRetentionMetrics = useCallback(async () => {
    if (!selectedEnterpriseId) return null;
    return getRetentionMetrics(selectedEnterpriseId);
  }, [selectedEnterpriseId]);
  
  const fetchModuleUsage = useCallback(async (days: number = 7) => {
    if (!selectedEnterpriseId) return [];
    return getModuleUsageStats(selectedEnterpriseId, days);
  }, [selectedEnterpriseId]);
  
  const fetchDailyEngagement = useCallback(async (days: number = 30) => {
    if (!selectedEnterpriseId) return [];
    return getDailyEngagement(selectedEnterpriseId, days);
  }, [selectedEnterpriseId]);
  
  const fetchTopFeatures = useCallback(async (days: number = 7, limit: number = 10) => {
    if (!selectedEnterpriseId) return [];
    return getTopFeatures(selectedEnterpriseId, days, limit);
  }, [selectedEnterpriseId]);
  
  return {
    trackPageView,
    trackAction,
    trackFeature,
    trackClick,
    fetchRetentionMetrics,
    fetchModuleUsage,
    fetchDailyEngagement,
    fetchTopFeatures
  };
}

/**
 * Hook simplificado para tracking de página
 * Automáticamente trackea page view al montar
 */
export function usePageTracking(module: ModuleName, subModule?: string): void {
  const userContext = useContactStore(state => state.userContext);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const tracked = useRef(false);
  
  useEffect(() => {
    if (!userContext?.authUid || tracked.current) return;
    
    // Inicializar sesión si no existe
    initEngagementSession({
      userId: userContext.authUid,
      teamHumanoId: userContext.id || null,
      enterpriseId: selectedEnterpriseId
    });
    
    // Track page view
    _trackPageView(module, subModule);
    tracked.current = true;
  }, [userContext?.authUid, userContext?.id, selectedEnterpriseId, module, subModule]);
}

/**
 * Hook para tracking de acciones con debounce automático
 */
export function useActionTracking(module: ModuleName) {
  const track = useCallback((actionName: string, metadata?: Record<string, unknown>) => {
    _trackAction(module, actionName, metadata);
  }, [module]);
  
  return track;
}

export default useEngagement;
