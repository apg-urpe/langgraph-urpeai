'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Send,
  Mail,
  TrendingUp,
  Target,
  Loader2,
  Zap,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useEmailMarketingStore, selectCampaigns, selectAudiences } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { supabase } from '../../../lib/supabase-client';

interface CampaignStats {
  campana_id: number;
  nombre: string;
  total_enviados: number;
  total_entregados: number;
  total_abiertos: number;
  tasa_apertura: number;
}

interface OverallStats {
  total_enviados: number;
  total_entregados: number;
  total_abiertos: number;
  tasa_apertura: number;
  tasa_entrega: number;
}

export const AnalyticsTab: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [campaignStats, setCampaignStats] = useState<CampaignStats[]>([]);

  const campaigns = useEmailMarketingStore(selectCampaigns);
  const audiences = useEmailMarketingStore(selectAudiences);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  useEffect(() => {
    if (selectedEnterpriseId) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnterpriseId]); // loadStats excluded - defined below

  const loadStats = async () => {
    if (!selectedEnterpriseId) return;
    setIsLoading(true);

    try {
      // Single RPC call - transactional emails are excluded server-side
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_email_marketing_stats', {
        p_empresa_id: selectedEnterpriseId
      });

      if (rpcError || !rpcData?.overall) {
        console.error('[AnalyticsTab] RPC error:', rpcError?.message);
        setOverallStats({ total_enviados: 0, total_entregados: 0, total_abiertos: 0, tasa_apertura: 0, tasa_entrega: 0 });
        setCampaignStats([]);
        return;
      }

      setOverallStats(rpcData.overall);

      const enrichedCampaigns = (rpcData.campaigns || []).map((stats: any) => {
        if (stats.campana_id === null || stats.campana_id === -1) {
          return { ...stats, nombre: 'Envíos directos / Sin campaña' };
        }
        const campaign = campaigns.find(c => c.id === stats.campana_id);
        return { ...stats, nombre: campaign?.nombre || `Campaña #${stats.campana_id}` };
      }).filter((stats: any) => stats.total_enviados > 0);

      setCampaignStats(enrichedCampaigns.sort((a: any, b: any) => b.total_enviados - a.total_enviados));
    } catch (err) {
      console.error('[AnalyticsTab] Fatal error loading analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!overallStats || overallStats.total_enviados === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="p-4 bg-zinc-800/50 rounded-full mb-4">
          <BarChart3 className="w-10 h-10 text-zinc-600" />
        </div>
        <h3 className="text-lg font-medium text-zinc-400 mb-2">
          Sin datos de analíticas
        </h3>
        <p className="text-zinc-500 text-sm max-w-sm">
          Las estadísticas aparecerán aquí cuando envíes campañas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with title */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20 rounded-xl">
          <BarChart3 className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Analíticas</h2>
          <p className="text-xs text-zinc-500">Rendimiento de tus campañas</p>
        </div>
      </div>

      {/* Overall Stats */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Resumen General
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            icon={Send}
            label="Enviados"
            value={overallStats.total_enviados}
            color="violet"
          />
          <StatCard
            icon={Zap}
            label="Entregados"
            value={overallStats.total_entregados}
            subValue={`${overallStats.tasa_entrega.toFixed(1)}%`}
            color="emerald"
            trend={overallStats.tasa_entrega > 90 ? 'up' : 'down'}
          />
          <StatCard
            icon={Mail}
            label="Abiertos"
            value={overallStats.total_abiertos}
            subValue={`${overallStats.tasa_apertura.toFixed(1)}%`}
            color="cyan"
            trend={overallStats.tasa_apertura > 20 ? 'up' : 'down'}
          />
        </div>
      </div>

      {/* Rate Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Delivery Rate */}
        <div className="p-4 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 border border-emerald-500/10 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Tasa de Entrega
            </span>
            <span className="text-lg font-bold text-emerald-400">
              {overallStats.tasa_entrega.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 bg-zinc-800/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${overallStats.tasa_entrega}%` }}
            />
          </div>
        </div>

        {/* Open Rate */}
        <div className="p-4 bg-gradient-to-br from-cyan-500/5 to-cyan-600/5 border border-cyan-500/10 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-400 flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              Tasa de Apertura
            </span>
            <span className="text-lg font-bold text-cyan-400">
              {overallStats.tasa_apertura.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 bg-zinc-800/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(overallStats.tasa_apertura, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Per Campaign Stats */}
      {campaignStats.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Rendimiento por Campaña
          </h3>
          <div className="space-y-3">
            {campaignStats.map((stats, index) => (
              <div
                key={stats.campana_id}
                className="group p-4 bg-zinc-900/50 border border-white/5 rounded-xl
                           hover:border-violet-500/20 hover:bg-zinc-800/50 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 
                                    border border-violet-500/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-violet-400">#{index + 1}</span>
                    </div>
                    <h4 className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                      {stats.nombre}
                    </h4>
                  </div>
                  <span className="px-2 py-1 text-xs text-zinc-400 bg-white/5 rounded-lg">
                    {stats.total_enviados} envíos
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-center">
                    <p className="text-xl font-bold text-emerald-400">
                      {stats.total_entregados}
                    </p>
                    <p className="text-[10px] text-emerald-300/60 uppercase tracking-wider mt-1">
                      Entregados
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-500/5 border border-cyan-500/10 rounded-lg text-center">
                    <p className="text-xl font-bold text-cyan-400">
                      {stats.tasa_apertura.toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-cyan-300/60 uppercase tracking-wider mt-1">
                      Apertura
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-xl
                        hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-violet-400" />
            <span className="text-xs text-violet-300/70">Audiencias Activas</span>
          </div>
          <p className="text-3xl font-bold text-violet-300">{audiences.length}</p>
        </div>
        <div className="p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-xl
                        hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-5 h-5 text-cyan-400" />
            <span className="text-xs text-cyan-300/70">Campañas Totales</span>
          </div>
          <p className="text-3xl font-bold text-cyan-300">{campaigns.length}</p>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  subValue?: string;
  color: 'violet' | 'cyan' | 'emerald' | 'rose' | 'amber';
  trend?: 'up' | 'down';
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subValue, color, trend }) => {
  const colorClasses = {
    violet: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', gradient: 'from-violet-500/10 to-violet-600/5' },
    cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', gradient: 'from-cyan-500/10 to-cyan-600/5' },
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', gradient: 'from-emerald-500/10 to-emerald-600/5' },
    rose: { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', gradient: 'from-rose-500/10 to-rose-600/5' },
    amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', gradient: 'from-amber-500/10 to-amber-600/5' },
  };

  const colors = colorClasses[color];

  return (
    <div className={`p-4 bg-gradient-to-br ${colors.gradient} border ${colors.border} rounded-xl
                     hover:shadow-lg transition-all duration-300 group`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center
                        group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium
            ${trend === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold ${colors.text}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-xs text-zinc-500">{label}</p>
        {subValue && (
          <span className={`text-xs font-medium ${colors.text}`}>
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
