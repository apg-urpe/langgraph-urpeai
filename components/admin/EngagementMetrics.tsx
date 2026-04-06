'use client';

/**
 * EngagementMetrics Component
 * 
 * Muestra métricas de adopción y uso de la aplicación.
 * Incluye: DAU/WAU/MAU, uso por módulo, features más usadas, tendencias.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  Zap,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  MousePointerClick,
  Clock,
  Target,
  Sparkles
} from 'lucide-react';
import { useEngagement } from '@/hooks/useEngagement';
import type { RetentionMetrics, ModuleUsageStats, DailyEngagement } from '@/lib/engagement-tracker';
import { logger } from '@/lib/logger';

// Module display names and colors
const MODULE_CONFIG: Record<string, { name: string; color: string; icon: React.ReactNode }> = {
  dashboard: { name: 'Dashboard', color: 'cyan', icon: <BarChart3 className="w-4 h-4" /> },
  contacts: { name: 'Contactos', color: 'emerald', icon: <Users className="w-4 h-4" /> },
  calendar: { name: 'Calendario', color: 'amber', icon: <Calendar className="w-4 h-4" /> },
  chat: { name: 'Chat Monica', color: 'violet', icon: <Sparkles className="w-4 h-4" /> },
  tasks: { name: 'Tareas', color: 'pink', icon: <Target className="w-4 h-4" /> },
  marketing: { name: 'Marketing', color: 'rose', icon: <Zap className="w-4 h-4" /> },
  team: { name: 'Equipo', color: 'blue', icon: <Users className="w-4 h-4" /> },
  funnel: { name: 'Embudo', color: 'orange', icon: <Layers className="w-4 h-4" /> },
  messages: { name: 'Mensajes', color: 'teal', icon: <Activity className="w-4 h-4" /> },
  observability: { name: 'Observabilidad', color: 'zinc', icon: <BarChart3 className="w-4 h-4" /> },
  finance: { name: 'Finanzas', color: 'green', icon: <TrendingUp className="w-4 h-4" /> },
  research: { name: 'Investigación', color: 'indigo', icon: <Sparkles className="w-4 h-4" /> },
};

interface EngagementMetricsProps {
  className?: string;
}

export const EngagementMetrics: React.FC<EngagementMetricsProps> = ({ className }) => {
  const { fetchRetentionMetrics, fetchModuleUsage, fetchDailyEngagement, fetchTopFeatures } = useEngagement();
  
  const [isLoading, setIsLoading] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [retention, setRetention] = useState<RetentionMetrics | null>(null);
  const [moduleUsage, setModuleUsage] = useState<ModuleUsageStats[]>([]);
  const [dailyData, setDailyData] = useState<DailyEngagement[]>([]);
  const [topFeatures, setTopFeatures] = useState<{ feature: string; count: number }[]>([]);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setSchemaError(null);
    try {
      const [retentionData, usageData, dailyEngagement, features] = await Promise.all([
        fetchRetentionMetrics(),
        fetchModuleUsage(timeRange),
        fetchDailyEngagement(timeRange),
        fetchTopFeatures(timeRange, 8)
      ]);
      
      setRetention(retentionData);
      setModuleUsage(usageData);
      setDailyData(dailyEngagement);
      setTopFeatures(features);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      logger.error('[EngagementMetrics] Error fetching data:', err);
      
      // Check if it's a schema/RPC not found error
      if (errorMsg.includes('function') || errorMsg.includes('does not exist') || errorMsg.includes('42883')) {
        setSchemaError('Schema de engagement no instalado. Ejecuta scripts/ENGAGEMENT_TRACKING_SCHEMA.sql en Supabase SQL Editor.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchRetentionMetrics, fetchModuleUsage, fetchDailyEngagement, fetchTopFeatures, timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate max values for progress bars
  const maxModuleUsers = Math.max(...moduleUsage.map(m => m.unique_users), 1);
  const maxFeatureCount = Math.max(...topFeatures.map(f => f.count), 1);

  // Get color classes for modules
  const getModuleColor = (moduleName: string) => {
    const config = MODULE_CONFIG[moduleName];
    if (!config) return { bg: 'bg-zinc-500/20', text: 'text-zinc-400', border: 'border-zinc-500' };
    
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
      cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500' },
      emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500' },
      amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500' },
      violet: { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500' },
      pink: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500' },
      rose: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500' },
      blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500' },
      orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500' },
      teal: { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500' },
      zinc: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', border: 'border-zinc-500' },
      green: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500' },
      indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500' },
    };
    
    return colorMap[config.color] || colorMap.zinc;
  };

  // Format feature name for display
  const formatFeatureName = (feature: string): string => {
    return feature
      .replace(/\./g, ' → ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Show error state if schema is not installed
  if (schemaError) {
    return (
      <div className={`space-y-4 ${className || ''}`}>
        <div className="flex items-center gap-2">
          <MousePointerClick className="w-5 h-5 text-primary-400" />
          <h2 className="text-base font-semibold text-zinc-100">Adopción y Engagement</h2>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
              <Target className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-300 mb-1">Schema de Engagement No Instalado</h3>
              <p className="text-xs text-zinc-400 mb-3">
                Las métricas de engagement requieren tablas y funciones RPC en Supabase.
              </p>
              <div className="bg-zinc-900/50 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-zinc-300 font-medium mb-2">📋 Para activar:</p>
                <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
                  <li>Abre <span className="text-primary-400 font-mono">Supabase → SQL Editor</span></li>
                  <li>Copia el contenido de <span className="text-primary-400 font-mono">scripts/ENGAGEMENT_TRACKING_SCHEMA.sql</span></li>
                  <li>Ejecuta el script</li>
                  <li>Refresca esta página</li>
                </ol>
              </div>
              <button
                onClick={fetchData}
                className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MousePointerClick className="w-5 h-5 text-primary-400" />
          <h2 className="text-base font-semibold text-zinc-100">Adopción y Engagement</h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-0.5">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days as 7 | 14 | 30)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  timeRange === days
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
          
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-1.5 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Retention KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* DAU */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">DAU</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? '...' : retention?.dau || 0}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Usuarios hoy</div>
        </div>

        {/* WAU */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">WAU</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? '...' : retention?.wau || 0}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Esta semana</div>
        </div>

        {/* MAU */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">MAU</span>
            <Users className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? '...' : retention?.mau || 0}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Este mes</div>
        </div>

        {/* Retention Rate */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Retención</span>
            {(retention?.retention_rate || 0) >= 50 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-pink-400" />
            )}
          </div>
          <div className={`text-2xl font-bold ${
            (retention?.retention_rate || 0) >= 50 ? 'text-emerald-400' : 'text-pink-400'
          }`}>
            {isLoading ? '...' : `${retention?.retention_rate || 0}%`}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">vs semana anterior</div>
        </div>

        {/* Avg Sessions */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Sesiones/User</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? '...' : retention?.avg_sessions_per_user?.toFixed(1) || '0'}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Promedio</div>
        </div>

        {/* Avg Modules */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Módulos/User</span>
            <Layers className="w-4 h-4 text-pink-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {isLoading ? '...' : retention?.avg_modules_per_user?.toFixed(1) || '0'}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Promedio</div>
        </div>
      </div>

      {/* Two Column Layout: Module Usage + Top Features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Module Usage */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="font-medium text-sm text-zinc-200">Uso por Módulo</h3>
            </div>
            <span className="text-[10px] text-zinc-500">Últimos {timeRange} días</span>
          </div>
          
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-zinc-500 text-sm">Cargando...</div>
            ) : moduleUsage.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                No hay datos de uso aún
              </div>
            ) : (
              moduleUsage.slice(0, 8).map((mod, index) => {
                const config = MODULE_CONFIG[mod.module] || { name: mod.module, color: 'zinc', icon: <Activity className="w-4 h-4" /> };
                const colors = getModuleColor(mod.module);
                const progressWidth = Math.max((mod.unique_users / maxModuleUsers) * 100, 10);
                const isFirst = index === 0;
                
                return (
                  <div key={mod.module} className="flex items-center gap-3">
                    {/* Module Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
                      {config.icon}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="flex-1 relative">
                      <div className={`relative h-[36px] rounded-lg border overflow-hidden ${colors.border} ${isFirst ? 'border-solid' : 'border-dashed border-opacity-50'}`}>
                        {/* Gradient Fill */}
                        <div 
                          className={`absolute inset-0 transition-all duration-500 ${colors.bg}`}
                          style={{ width: `${progressWidth}%` }}
                        />
                        
                        {/* Stats Badge */}
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-700/50 rounded-md px-2 py-0.5 shadow-sm">
                          <span className={`text-xs font-medium ${colors.text}`}>
                            {mod.unique_users}
                          </span>
                          <span className="text-[10px] text-zinc-500">users</span>
                        </div>
                        
                        {/* Module Name on right */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="text-xs text-zinc-400">{config.name}</span>
                          <span className={`text-[10px] ${colors.text}`}>{mod.usage_percentage}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top Features */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="font-medium text-sm text-zinc-200">Features Más Usadas</h3>
            </div>
            <span className="text-[10px] text-zinc-500">Top 8</span>
          </div>
          
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="text-center py-8 text-zinc-500 text-sm">Cargando...</div>
            ) : topFeatures.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                No hay datos de features aún
              </div>
            ) : (
              topFeatures.map((feature, index) => {
                const progressWidth = Math.max((feature.count / maxFeatureCount) * 100, 10);
                const isTop3 = index < 3;
                
                return (
                  <div key={feature.feature} className="flex items-center gap-3">
                    {/* Rank */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      index === 0 ? 'bg-amber-500/20 text-amber-400' :
                      index === 1 ? 'bg-zinc-500/20 text-zinc-300' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-zinc-800 text-zinc-500'
                    }`}>
                      {index + 1}
                    </div>
                    
                    {/* Feature Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-xs truncate ${isTop3 ? 'text-zinc-200' : 'text-zinc-400'}`}>
                          {formatFeatureName(feature.feature)}
                        </span>
                        <span className={`text-xs font-medium shrink-0 ${isTop3 ? 'text-amber-400' : 'text-zinc-500'}`}>
                          {feature.count}
                        </span>
                      </div>
                      
                      {/* Mini progress bar */}
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${
                            index === 0 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                            index === 1 ? 'bg-gradient-to-r from-zinc-500 to-zinc-400' :
                            index === 2 ? 'bg-gradient-to-r from-orange-500 to-orange-400' :
                            'bg-zinc-600'
                          }`}
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Daily Trend Chart (Simple) */}
      {dailyData.length > 0 && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-medium text-sm text-zinc-200">Tendencia de Uso</h3>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Eventos
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Usuarios
              </span>
            </div>
          </div>
          
          <div className="p-4">
            {/* Simple bar chart visualization */}
            <div className="flex items-end gap-1 h-32">
              {dailyData.map((day, index) => {
                const maxEvents = Math.max(...dailyData.map(d => d.total_events), 1);
                const maxUsers = Math.max(...dailyData.map(d => d.unique_users), 1);
                const eventHeight = Math.max((day.total_events / maxEvents) * 100, 5);
                const userHeight = Math.max((day.unique_users / maxUsers) * 100, 5);
                
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                    {/* Bars */}
                    <div className="flex items-end gap-0.5 h-24 w-full">
                      <div 
                        className="flex-1 bg-cyan-500/30 rounded-t transition-all group-hover:bg-cyan-500/50"
                        style={{ height: `${eventHeight}%` }}
                        title={`${day.total_events} eventos`}
                      />
                      <div 
                        className="flex-1 bg-emerald-500/30 rounded-t transition-all group-hover:bg-emerald-500/50"
                        style={{ height: `${userHeight}%` }}
                        title={`${day.unique_users} usuarios`}
                      />
                    </div>
                    
                    {/* Date label */}
                    <span className="text-[9px] text-zinc-600 truncate w-full text-center">
                      {new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !retention && moduleUsage.length === 0 && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-8 text-center">
          <MousePointerClick className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">Sin datos de engagement aún</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            El tracking de engagement empezará a recopilar datos a medida que los usuarios interactúen con la aplicación.
            Ejecuta el script SQL para crear las tablas necesarias.
          </p>
        </div>
      )}
    </div>
  );
};

export default EngagementMetrics;
