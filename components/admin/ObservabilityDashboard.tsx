'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { 
  Activity, 
  AlertTriangle, 
  Clock, 
  Database, 
  Gauge, 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  MessageSquare,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { EngagementMetrics } from './EngagementMetrics';
import { supabase } from '@/lib/supabase-client';
import { getRecentAlerts, type Alert } from '@/lib/alert-service';
import { 
  useAdminStore, 
  selectIsMaximized, 
  DASHBOARD_CONTENT_MIN_WIDTH, 
  DASHBOARD_CONTENT_MAX_WIDTH_NORMAL, 
  DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED 
} from '@/store/adminStore';

interface MetricCard {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number; // percentage change
  trend?: 'up' | 'down' | 'neutral';
  status?: 'good' | 'warning' | 'error';
  icon: React.ReactNode;
  accentColor?: string; // for gradient effects
}

interface ErrorLog {
  id: string;
  function_name: string;
  error_message: string;
  severity: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  tipo: string;
  accion: string;
  descripcion: string;
  fecha_creacion: string;
  source?: 'CRM' | 'Chat';
  details?: any;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  last_active_at: string | null;
  total_sessions: number;
  total_messages: number;
}

// Time range options for filtering
type TimeRange = '1h' | '24h' | '7d';
const TIME_RANGES: { value: TimeRange; label: string; ms: number }[] = [
  { value: '1h', label: 'Última hora', ms: 60 * 60 * 1000 },
  { value: '24h', label: 'Últimas 24h', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Últimos 7 días', ms: 7 * 24 * 60 * 60 * 1000 },
];

// Safety limits to prevent heavy queries
const MAX_LOGS_DISPLAY = 50;
const MAX_ALERTS_DISPLAY = 10;

export const ObservabilityDashboard: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [recentErrors, setRecentErrors] = useState<ErrorLog[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'unknown'>('unknown');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [activeUsers, setActiveUsers] = useState<UserProfile[]>([]);
  const [monicaStats, setMonicaStats] = useState({ totalSessions: 0, totalMessages: 0, activeUsersCount: 0 });
  const [serverUptime, setServerUptime] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const isMaximized = useAdminStore(selectIsMaximized);

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      // Calculate time boundaries based on selected range
      const selectedRange = TIME_RANGES.find(r => r.value === timeRange) || TIME_RANGES[1];
      const rangeStart = new Date(Date.now() - selectedRange.ms).toISOString();
      // Previous equivalent period for comparison (e.g., if range is 1h, compare with the 1h before that)
      const prevRangeStart = new Date(Date.now() - selectedRange.ms * 2).toISOString();
      const prevRangeEnd = rangeStart;

      // SAFETY: All queries have date filters and limits to prevent heavy loads
      const results = await Promise.all([
        // Count errors in selected range (with date filter)
        supabase
          .from('wp_error_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', rangeStart),
        // Count errors in previous equivalent period (for comparison)
        supabase
          .from('wp_error_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevRangeStart)
          .lt('created_at', prevRangeEnd),
        // Count CRM activities in selected range
        supabase
          .from('wp_actividades_log')
          .select('id', { count: 'exact', head: true })
          .gte('fecha_creacion', rangeStart),
        // Count Chat activities in selected range
        supabase
          .schema('adaptive_interface')
          .from('activity_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', rangeStart),
        // Recent errors with LIMIT for safety
        supabase
          .from('wp_error_logs')
          .select('id, function_name, error_message, severity, created_at')
          .gte('created_at', rangeStart)
          .order('created_at', { ascending: false })
          .limit(MAX_LOGS_DISPLAY),
        // Recent CRM activities
        supabase
          .from('wp_actividades_log')
          .select('id, tipo, accion, descripcion, fecha_creacion')
          .gte('fecha_creacion', rangeStart)
          .order('fecha_creacion', { ascending: false })
          .limit(MAX_LOGS_DISPLAY),
        // Recent Chat activities
        supabase
          .schema('adaptive_interface')
          .from('activity_logs')
          .select('id, action, resource_type, details, created_at')
          .gte('created_at', rangeStart)
          .order('created_at', { ascending: false })
          .limit(MAX_LOGS_DISPLAY),
        // Active users in range (Monica usage) - with LIMIT for safety
        supabase
          .schema('adaptive_interface')
          .from('user_profiles')
          .select('id, display_name, last_active_at, total_sessions, total_messages')
          .gte('last_active_at', rangeStart)
          .order('last_active_at', { ascending: false })
          .limit(20),
        // Aggregate Monica stats (all time, but limited to active users for performance)
        supabase
          .schema('adaptive_interface')
          .from('user_profiles')
          .select('total_sessions, total_messages')
          .not('last_active_at', 'is', null)
          .limit(500)
      ]);

      // Process Results
      const [
        errorsInRange,
        errorsPrevPeriod,
        activitiesInRange,
        chatActivitiesInRange,
        recentErrorsData,
        recentActivitiesData,
        recentChatActivitiesData,
        activeUsersInRange,
        userProfilesStats
      ] = results;

      // Build metrics based on selected time range
      const errorCountInRange = errorsInRange.count || 0;
      const errorCountPrev = errorsPrevPeriod.count || 0;
      const crmActivityCount = activitiesInRange.count || 0;
      const chatActivityCount = chatActivitiesInRange.count || 0;
      const totalActivityCount = crmActivityCount + chatActivityCount;
      const rangeLabel = selectedRange.label;

      // Process Monica/user_profiles stats
      const activeUsersData = (activeUsersInRange.data || []) as UserProfile[];
      const statsData = (userProfilesStats.data || []) as { total_sessions: number; total_messages: number }[];
      
      // Aggregate totals (sum all user stats)
      const totalSessions = statsData.reduce((sum, u) => sum + (u.total_sessions || 0), 0);
      const totalMessages = statsData.reduce((sum, u) => sum + (u.total_messages || 0), 0);
      const activeUsersCount = activeUsersData.length;

      setActiveUsers(activeUsersData);
      setMonicaStats({ totalSessions, totalMessages, activeUsersCount });

      // Calculate change percentage vs previous equivalent period
      const errorChange = errorCountPrev > 0 ? Math.round(((errorCountInRange - errorCountPrev) / errorCountPrev) * 100) : 0;

      setMetrics([
        {
          title: `Errores`,
          value: errorCountInRange,
          subtitle: rangeLabel,
          change: errorChange,
          trend: errorCountInRange > errorCountPrev ? 'up' : 'down',
          status: errorCountInRange > 10 ? 'error' : errorCountInRange > 5 ? 'warning' : 'good',
          icon: <AlertTriangle className="w-5 h-5" />,
          accentColor: 'pink'
        },
        {
          title: `Actividades`,
          value: totalActivityCount,
          subtitle: `${chatActivityCount} AI / ${crmActivityCount} CRM`,
          trend: 'up',
          status: 'good',
          icon: <Activity className="w-5 h-5" />,
          accentColor: 'cyan'
        },
        {
          title: `Usuarios Activos`,
          value: activeUsersCount,
          subtitle: `${totalSessions.toLocaleString()} sesiones`,
          trend: activeUsersCount > 0 ? 'up' : 'neutral',
          status: activeUsersCount > 0 ? 'good' : 'warning',
          icon: <Users className="w-5 h-5" />,
          accentColor: 'emerald'
        },
        {
          title: 'Mensajes Monica',
          value: totalMessages.toLocaleString(),
          subtitle: 'Total histórico',
          trend: 'up',
          status: 'good',
          icon: <Bot className="w-5 h-5" />,
          accentColor: 'violet'
        },
        {
          title: 'Estado Sistema',
          value: healthStatus === 'healthy' ? 'Saludable' : healthStatus === 'degraded' ? 'Degradado' : 'Desconocido',
          status: healthStatus === 'healthy' ? 'good' : healthStatus === 'degraded' ? 'warning' : 'error',
          icon: <Gauge className="w-5 h-5" />,
          accentColor: healthStatus === 'healthy' ? 'emerald' : 'amber'
        },
        {
          title: 'Uptime Servidor',
          value: serverUptime != null
            ? serverUptime >= 86400
              ? `${Math.floor(serverUptime / 86400)}d ${Math.floor((serverUptime % 86400) / 3600)}h`
              : serverUptime >= 3600
                ? `${Math.floor(serverUptime / 3600)}h ${Math.floor((serverUptime % 3600) / 60)}m`
                : `${Math.floor(serverUptime / 60)}m`
            : '—',
          subtitle: 'Desde último deploy',
          status: serverUptime != null ? 'good' : 'warning',
          icon: <Zap className="w-5 h-5" />,
          accentColor: 'amber'
        }
      ]);

      setRecentErrors(recentErrorsData.data || []);

      // Normalize and merge activities
      const crmLogs: ActivityLog[] = (recentActivitiesData.data || []).map(log => ({
        ...log,
        source: 'CRM'
      }));

      const chatLogs: ActivityLog[] = (recentChatActivitiesData.data || []).map((log: any) => ({
        id: log.id,
        tipo: 'Chat AI',
        accion: log.action,
        descripcion: log.details?.tool_name 
          ? `Tool: ${log.details.tool_name}` 
          : log.details?.message_length 
            ? `Mensaje (${log.details.message_length} chars)`
            : log.resource_type || 'Actividad Chat',
        fecha_creacion: log.created_at,
        source: 'Chat',
        details: log.details
      }));

      // Combine and sort by date desc
      const allActivities = [...crmLogs, ...chatLogs].sort((a, b) => 
        new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime()
      ).slice(0, MAX_LOGS_DISPLAY);

      setRecentActivities(allActivities);

      // Fetch alerts with safety limit
      const alertsData = await getRecentAlerts(MAX_ALERTS_DISPLAY);
      setAlerts(alertsData);

      setLastRefresh(new Date());
    } catch (error) {
      logger.error('[ObservabilityDashboard] Error fetching metrics:', error);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthStatus, timeRange]);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health?deep=true');
      const data = await response.json();
      setHealthStatus(data.status);
      if (data.uptime != null) setServerUptime(data.uptime);
    } catch {
      setHealthStatus('unknown');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    fetchMetrics();

    // Refresh every 5 minutes
    const interval = setInterval(() => {
      checkHealth();
      fetchMetrics();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkHealth, fetchMetrics]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/10';
      case 'error': return 'text-red-400 bg-red-500/10';
      case 'warning': return 'text-amber-400 bg-amber-500/10';
      case 'info': return 'text-blue-400 bg-blue-500/10';
      default: return 'text-zinc-400 bg-zinc-500/10';
    }
  };

  const getStatusIcon = (status?: 'good' | 'warning' | 'error') => {
    switch (status) {
      case 'good': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return null;
    }
  };

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
              <h1 className="text-base md:text-xl font-bold text-zinc-100 mb-0.5 md:mb-1 flex items-center gap-2">
                <Database className="w-5 h-5 text-primary-400" />
                Observabilidad
              </h1>
              <p className="text-xs md:text-sm text-zinc-500 line-clamp-1 md:line-clamp-none">
                Monitoreo de salud y rendimiento del sistema
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-600 hidden md:inline">
                {lastRefresh.toLocaleTimeString()}
              </span>
              <button
                onClick={fetchMetrics}
                disabled={isLoading}
                className={`
                  p-1.5 md:p-2 rounded-lg border transition-all shrink-0
                  ${isLoading
                    ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                  }
                `}
                title="Refrescar datos"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-0.5">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    timeRange === range.value
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {range.value}
                </button>
              ))}
            </div>
          </div>
        </div>

      {/* Metric Cards - Square UI Style */}
      {/* Adjusted grid cols to be more responsive: 2 rows of 3 columns for better spacing */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {metrics.map((metric, index) => {
          // Check if value is a long string (like "Degradado") to adjust font size
          const isLongText = typeof metric.value === 'string' && metric.value.length > 5;
          
          return (
            <div
              key={index}
              className="bg-zinc-900/60 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all duration-200 group flex flex-col justify-between"
            >
              {/* Header: Title + Icon */}
              <div className="flex items-start justify-between mb-3 gap-2">
                <span className="text-xs font-medium text-zinc-400 line-clamp-2" title={metric.title}>
                  {metric.title}
                </span>
                <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  metric.status === 'good' ? 'text-emerald-400 group-hover:bg-emerald-500/10' :
                  metric.status === 'warning' ? 'text-amber-400 group-hover:bg-amber-500/10' :
                  metric.status === 'error' ? 'text-pink-400 group-hover:bg-pink-500/10' :
                  'text-zinc-500 group-hover:bg-zinc-800'
                }`}>
                  {metric.icon}
                </div>
              </div>

              {/* Value Box with Inner Background */}
              <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex-1 flex flex-col justify-center">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span 
                    className={`font-semibold tracking-tight text-zinc-100 min-w-0 break-words leading-tight ${
                      isLongText ? 'text-sm' : 'text-xl md:text-2xl'
                    }`}
                    title={String(metric.value)}
                  >
                    {metric.value}
                  </span>

                  {/* Trend/Change Indicator */}
                  {metric.change !== undefined && metric.trend && metric.trend !== 'neutral' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="h-6 w-px bg-zinc-700" />
                      <div
                        className={`flex items-center gap-1 ${
                          metric.trend === 'up' 
                            ? metric.status === 'error' ? 'text-pink-400' : 'text-emerald-400'
                            : metric.status === 'good' ? 'text-pink-400' : 'text-emerald-400'
                        }`}
                        style={{
                          textShadow: metric.trend === 'up' && metric.status !== 'error'
                            ? '0 1px 6px rgba(52, 211, 153, 0.3)'
                            : '0 1px 6px rgba(236, 72, 153, 0.3)',
                        }}
                      >
                        {metric.trend === 'up' ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        <span className="text-xs font-medium">{Math.abs(metric.change)}%</span>
                      </div>
                    </div>
                  )}

                  {/* Status indicator for non-trend metrics */}
                  {(metric.change === undefined || metric.trend === 'neutral') && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="h-6 w-px bg-zinc-700" />
                      {getStatusIcon(metric.status)}
                    </div>
                  )}
                </div>
              </div>

              {/* Subtitle */}
              {metric.subtitle && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500 overflow-hidden">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate" title={metric.subtitle}>{metric.subtitle}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Errors */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-pink-400" />
              <h3 className="font-medium text-sm sm:text-base text-zinc-200">Errores Recientes</h3>
            </div>
            {recentErrors.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                {recentErrors.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
            {recentErrors.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                No hay errores recientes
              </div>
            ) : (
              recentErrors.map((error) => (
                <div key={error.id} className="p-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getSeverityColor(error.severity)}`}>
                          {error.severity.toUpperCase()}
                        </span>
                        <span className="text-xs text-zinc-500 truncate">
                          {error.function_name}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 mt-1 truncate">
                        {error.error_message}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600 whitespace-nowrap">
                      {new Date(error.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-400" />
            <h3 className="font-medium text-zinc-200">Actividad Reciente</h3>
          </div>
          <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
            {recentActivities.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                No hay actividad reciente
              </div>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="p-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {/* Source Badge */}
                        {activity.source === 'Chat' ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-purple-500/30 bg-purple-500/10 text-purple-400">
                            AI
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-blue-500/30 bg-blue-500/10 text-blue-400">
                            CRM
                          </span>
                        )}
                        
                        {/* Type Badge */}
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          activity.source === 'Chat' 
                            ? 'bg-purple-500/10 text-purple-400' 
                            : 'bg-primary-500/10 text-primary-400'
                        }`}>
                          {activity.tipo}
                        </span>
                        
                        <span className="text-xs text-zinc-500">
                          {activity.accion}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 truncate pl-1">
                        {activity.descripcion || `${activity.tipo} - ${activity.accion}`}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600 whitespace-nowrap">
                      {new Date(activity.fecha_creacion).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Active Users Section - Monica Usage - TopPerformers Style */}
      {activeUsers.length > 0 && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <h3 className="font-medium text-sm sm:text-base text-zinc-200">Top Usuarios Monica</h3>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {monicaStats.activeUsersCount} activos
            </span>
          </div>
          <div className="p-4 space-y-3">
            {(() => {
              const maxMessages = Math.max(...activeUsers.map(u => u.total_messages || 1));
              const barColors = [
                { border: 'border-pink-500', bg: 'bg-gradient-to-r from-pink-500/40 via-pink-500/20 to-transparent' },
                { border: 'border-cyan-400', bg: 'bg-gradient-to-r from-cyan-400/30 via-cyan-400/15 to-transparent' },
                { border: 'border-emerald-400', bg: 'bg-gradient-to-r from-emerald-400/30 via-emerald-400/15 to-transparent' },
                { border: 'border-amber-400', bg: 'bg-gradient-to-r from-amber-400/30 via-amber-400/15 to-transparent' },
                { border: 'border-violet-400', bg: 'bg-gradient-to-r from-violet-400/30 via-violet-400/15 to-transparent' },
              ];
              
              return activeUsers.slice(0, 6).map((user, index) => {
                const style = barColors[index % barColors.length];
                const progressWidth = Math.max(((user.total_messages || 0) / maxMessages) * 100, 25);
                const isFirst = index === 0;
                
                return (
                  <div key={user.id} className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isFirst 
                        ? 'bg-gradient-to-br from-pink-500/30 to-violet-500/30 text-pink-300 ring-1 ring-pink-500/30' 
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {(user.display_name || 'U')[0].toUpperCase()}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="flex-1 relative">
                      <div className={`relative h-[40px] rounded-lg border overflow-hidden ${style.border} ${isFirst ? 'border-solid' : 'border-dashed'}`}>
                        {/* Gradient Fill */}
                        <div 
                          className={`absolute inset-0 transition-all duration-500 ${style.bg}`}
                          style={{ width: `${progressWidth}%` }}
                        />
                        
                        {/* Stats Badge */}
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-700/50 rounded-md px-2 py-1 shadow-sm">
                          {isFirst && <Sparkles className="w-3 h-3 text-amber-400" />}
                          <span className={`text-xs font-medium ${isFirst ? 'text-zinc-100' : 'text-zinc-400'}`}>
                            {user.total_messages || 0}
                          </span>
                          <span className="text-[10px] text-zinc-500">msgs</span>
                        </div>
                        
                        {/* Name on right */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 truncate max-w-[100px]">
                          {user.display_name || 'Usuario'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Engagement & Adoption Metrics */}
      <EngagementMetrics />

      {/* System Alerts */}
      {alerts.length > 0 && (
        <div className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="font-medium text-zinc-200">Alertas del Sistema</h3>
          </div>
          <div className="divide-y divide-white/5">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="p-3 hover:bg-white/5 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded ${
                    alert.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
                    alert.severity === 'high' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-zinc-200">{alert.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{alert.message}</div>
                  </div>
                  <span className="text-xs text-zinc-600">
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default ObservabilityDashboard;
