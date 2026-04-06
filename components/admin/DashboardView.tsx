'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, Loader2, Zap } from 'lucide-react';
import { useAdminMetrics } from '../../hooks/useAdminMetrics';
import { DashboardSkeleton } from './dashboard/DashboardSkeleton';
import { DateRangeFilter, Period, DateRange } from './dashboard/DateRangeFilter';
import { SafeBlockRenderer } from '../SafeBlockRenderer';
import { VisualRenderer } from '../VisualRenderer';
import { UIBlock } from '../../types/chat';
import { supabase } from '../../lib/supabase-client';
import { logger } from '@/lib/logger';
import { useContactStore } from '../../store/contactStore';
import { useAdminStore, selectIsMaximized, DASHBOARD_CONTENT_MIN_WIDTH, DASHBOARD_CONTENT_MAX_WIDTH_NORMAL, DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED } from '../../store/adminStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';

const PERIOD_LABELS: Record<Period, string> = {
  'hoy': 'Hoy',
  '7d': 'Últimos 7 días',
  '15d': 'Últimos 15 días',
  '30d': 'Últimos 30 días',
  'trimestre': 'Este Trimestre',
  'año': 'Este Año',
  'custom': 'Personalizado'
};

/**
 * PERFORMANCE: Memoized metric block to prevent re-renders of all blocks
 * when only metrics update during streaming or periodic refreshes.
 */
const MetricBlock = React.memo(({ 
  block, 
  onInteract, 
  disabled 
}: { 
  block: UIBlock; 
  onInteract: (data: any) => void; 
  disabled: boolean; 
}) => (
  <SafeBlockRenderer
    block={block}
    onAction={onInteract}
    className="w-full h-full"
    disabled={disabled}
  />
));
MetricBlock.displayName = 'MetricBlock';

export const DashboardView: React.FC = () => {
  const {
    blocks,
    isLoading,
    error,
    refresh,
    metrics,
    filters,
    setFilters
  } = useAdminMetrics();
  
  // PERFORMANCE: Selectors to prevent unnecessary re-renders of the whole view
  const selectedEnterpriseId = useContactStore(s => s.selectedEnterpriseId);
  const enterpriseProfile = useContactStore(s => s.enterpriseProfile);
  const selectContact = useContactStore(s => s.selectContact);
  
  // PERFORMANCE: Specialized atomic selector for maximized state
  const isMaximized = useAdminStore(selectIsMaximized);
  const setActiveView = useAdminStore(state => state.setActiveView);
  
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('7d');
  const [isMobile, setIsMobile] = useState(false);

  // Engagement tracking
  usePageTracking('dashboard');
  const trackAction = useActionTracking('dashboard');

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    
    // Initial check
    checkMobile();
    
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Helper to calculate date range based on period
  const updateDateRange = useCallback((period: Period) => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999); // End of today

    let start = new Date(now);
    start.setHours(0, 0, 0, 0); // Start of today (default)

    switch (period) {
      case 'hoy':
        // Start is already start of today
        break;
      case '7d':
        start.setDate(now.getDate() - 7);
        break;
      case '15d':
        start.setDate(now.getDate() - 15);
        break;
      case '30d':
        start.setDate(now.getDate() - 30);
        break;
      case 'trimestre':
        start.setMonth(now.getMonth() - 3);
        break;
      case 'año':
        start.setFullYear(now.getFullYear() - 1);
        break;
    }

    setFilters({
      ...filters,
      dateRange: {
        from: start.toISOString(),
        to: end.toISOString()
      }
    });
  }, [filters, setFilters]);

  // Set default period on mount
  useEffect(() => {
    // Only set if not already set (to avoid infinite loops or overwrites if we persist filters later)
    if (!filters.dateRange.from) {
      updateDateRange('7d');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once

  const handlePeriodChange = (period: Period) => {
    if (period === 'custom') {
      setSelectedPeriod(period);
      return;
    }
    setSelectedPeriod(period);
    updateDateRange(period);
    trackAction('dashboard.period_change', { period });
  };

  const handleCustomRangeChange = (range: DateRange) => {
    setFilters({
      ...filters,
      dateRange: {
        from: range.from,
        to: range.to
      }
    });
    trackAction('dashboard.custom_range', { from: range.from, to: range.to });
  };

  // Handle block interactions
  const handleBlockInteract = useCallback((data: any) => {
    logger.debug('[Dashboard] Block interaction:', data);
    const action = data?.payload?.action;
    
    // Track dashboard interaction
    trackAction('dashboard.block_interact', { 
      blockId: data?.blockId, 
      action,
      type: data?.type 
    });

    if (action === 'view_appointments') {
      // Navigate to calendar
      setActiveView('calendar');
    } else if (action === 'view_chat') {
      // Navigate to contact details (which includes chat)
      if (data?.payload?.contactId) {
        selectContact(data.payload.contactId);
        setActiveView('contacts'); // Or 'messages' if that's the view name
      } else {
         // Fallback if no contact ID
         logger.warn('[Dashboard] No contact ID for view_chat');
      }
    } else if (action === 'new_contact') {
      // Open contact creation modal?
      setActiveView('contacts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveView, selectContact]); // trackAction excluded - stable reference from hook

  return (
    <div className="p-3 md:p-6 pb-24 md:pb-6 h-full overflow-y-auto">
      {/* Content wrapper with min/max-width for proper layout */}
      <div 
        className={`space-y-4 md:space-y-6 mx-auto transition-all duration-300 ${isMaximized ? 'px-4' : ''}`}
        style={{ 
          minWidth: isMobile ? 'auto' : `${DASHBOARD_CONTENT_MIN_WIDTH}px`,
          maxWidth: isMobile 
            ? '100%' 
            : isMaximized 
              ? `${DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED}px` 
              : `${DASHBOARD_CONTENT_MAX_WIDTH_NORMAL}px`
        }}
      >
      
      {/* Header */}
      <div className="flex flex-col gap-3 md:gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-base md:text-xl font-bold text-zinc-100 mb-0.5 md:mb-1">
              Dashboard de Métricas
            </h1>
            <p className="text-xs md:text-sm text-zinc-500 line-clamp-1 md:line-clamp-none">
              Rendimiento de tus agentes y progreso en tiempo real
            </p>
          </div>
          
          {/* Actions Row */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Refresh button - always visible */}
            <button
              onClick={refresh}
              disabled={isLoading}
              className={`
                p-1.5 md:p-2 rounded-lg border transition-all shrink-0
                ${isLoading
                  ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600 cursor-not-allowed'
                  : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                }
              `}
              title="Actualizar"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            selectedPeriod={selectedPeriod}
            dateRange={filters.dateRange}
            onPeriodChange={handlePeriodChange}
            onCustomRangeChange={handleCustomRangeChange}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error al cargar métricas</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state (first load) */}
      {isLoading && blocks.length === 0 && (
        <DashboardSkeleton />
      )}

      {/* Blocks from metrics hook - Order: KPIs → Chart → Grid */}
      {blocks.length > 0 && (
        <div className="space-y-4 md:space-y-6">
          {/* 1. KPI Cards - 1 col mobile, 2 tablet, 3 desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {blocks.filter((b: UIBlock) => b.type === 'kpi_card').map((block: UIBlock, index: number) => (
              <div key={block.id || `kpi-${index}`}>
                <MetricBlock
                  block={block}
                  onInteract={handleBlockInteract}
                  disabled={isLoading}
                />
              </div>
            ))}
          </div>
          
          {/* 2. Full-width Charts (Tendencia & Embudo) */}
          {blocks.filter((b: UIBlock) => 
            b.type === 'chart' && (b.title?.includes('Tendencia') || b.title?.includes('Embudo'))
          ).map((block: UIBlock, index: number) => (
            <div key={block.id || `chart-full-${index}`}>
              <MetricBlock
                block={block}
                onInteract={handleBlockInteract}
                disabled={isLoading}
              />
            </div>
          ))}
          
          {/* 3. Secondary Charts (Calificación, Marketing, Patrones) - 2 cols on desktop */}
          {(() => {
            const secondaryCharts = blocks.filter((b: UIBlock) => 
              b.type === 'chart' && 
              !b.title?.includes('Tendencia') && 
              !b.title?.includes('Embudo')
            );
            if (secondaryCharts.length === 0) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                {secondaryCharts.map((block: UIBlock, index: number) => (
                  <div key={block.id || `chart-sec-${index}`}>
                    <MetricBlock
                      block={block}
                      onInteract={handleBlockInteract}
                      disabled={isLoading}
                    />
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 3. Grid/Table Blocks - Full width */}
          <div className="grid grid-cols-1 gap-3 md:gap-4">
            {blocks.filter((b: UIBlock) => b.type === 'grid' || b.type === 'table').map((block: UIBlock, index: number) => (
              <div key={block.id || `grid-${index}`}>
                <MetricBlock
                  block={block}
                  onInteract={handleBlockInteract}
                  disabled={isLoading}
                />
              </div>
            ))}
          </div>
          
          {/* 4. Other block types */}
          {blocks.filter((b: UIBlock) => b.type !== 'kpi_card' && b.type !== 'grid' && b.type !== 'table' && b.type !== 'chart').map((block: UIBlock, index: number) => (
            <div key={block.id || `other-${index}`}>
              <MetricBlock
                block={block}
                onInteract={handleBlockInteract}
                disabled={isLoading}
              />
            </div>
          ))}
        </div>
      )}

      {/* Fallback: Static content when no blocks and not loading */}
      {blocks.length === 0 && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
             <p>No hay métricas disponibles para esta selección.</p>
        </div>
      )}

      </div>
    </div>
  );
};

// Fallback static dashboard
const FallbackDashboard: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const kpiData = [
    { label: 'Total Contactos', value: '—', change: '—', trend: 'neutral', color: 'from-emerald-500/20 to-emerald-600/5' },
    { label: 'Mensajes Enviados', value: '—', change: '—', trend: 'neutral', color: 'from-violet-500/20 to-violet-600/5' },
    { label: 'Citas Agendadas', value: '—', change: '—', trend: 'neutral', color: 'from-amber-500/20 to-amber-600/5' },
    { label: 'Tasa Conversión', value: '—', change: '—', trend: 'neutral', color: 'from-cyan-500/20 to-cyan-600/5' },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {kpiData.map((kpi, index) => (
          <div
            key={index}
            className={`
              relative overflow-hidden rounded-xl p-4
              bg-gradient-to-br ${kpi.color}
              border border-white/5
            `}
          >
            <p className="text-xs text-zinc-500 font-medium mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold text-zinc-600">{kpi.value}</p>
            <p className="text-xs text-zinc-600 mt-2">{kpi.change}</p>
          </div>
        ))}
      </div>

      <div className="text-center py-4">
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/10 border border-primary-500/20 text-primary-400 hover:bg-primary-500/20 transition-colors text-sm"
        >
          <Zap className="w-4 h-4" />
          Cargar métricas del agente
        </button>
      </div>
    </>
  );
};
