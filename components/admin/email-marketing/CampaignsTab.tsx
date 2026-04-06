'use client';

import React, { useState } from 'react';
import { 
  Mail, 
  Target, 
  Plus,
  Loader2,
  Clock,
  Trash2,
  Edit2,
  Play,
  Pause,
  Users,
  Calendar,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Zap,
  TrendingUp
} from 'lucide-react';
import { useEmailMarketingStore, selectCampaigns, selectIsLoadingCampaigns, selectAudiences } from '../../../store/emailMarketingStore';
import { MarketingCampaignV2 } from '../../../types/marketing';
import { CreateCampaignModal } from './CreateCampaignModal';
import { EditCampaignModal } from './EditCampaignModal';

interface CampaignsTabProps {
  onCreateNew?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  borrador: { label: 'Borrador', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20', icon: Edit2 },
  activa: { label: 'Activa', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Play },
  pausada: { label: 'Pausada', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Pause },
  completada: { label: 'Completada', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Clock },
};

export const CampaignsTab: React.FC<CampaignsTabProps> = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaignV2 | null>(null);
  
  const campaigns = useEmailMarketingStore(selectCampaigns);
  const audiences = useEmailMarketingStore(selectAudiences);
  const isLoading = useEmailMarketingStore(selectIsLoadingCampaigns);
  const deleteCampaign = useEmailMarketingStore(state => state.deleteCampaign);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const getAudienceName = (audienceId: number | null) => {
    if (!audienceId) return 'Sin audiencia';
    const audience = audiences.find(a => a.id === audienceId);
    return audience?.nombre || 'Audiencia eliminada';
  };

  const handleDelete = async (e: React.MouseEvent, campaign: MarketingCampaignV2) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar la campaña "${campaign.nombre}"?`)) {
      await deleteCampaign(campaign.id);
    }
  };

  if (isLoading && campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] md:h-64 text-center px-4">
        <div className="p-4 bg-violet-500/10 rounded-full mb-4">
          <Mail className="w-10 h-10 text-violet-400" />
        </div>
        <h3 className="text-lg font-medium text-zinc-200 mb-2">
          No hay campañas
        </h3>
        <p className="text-zinc-500 text-sm mb-6 max-w-[280px] md:max-w-sm mx-auto">
          Crea tu primera campaña de email para comenzar a enviar comunicaciones a tus audiencias
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-6 py-3 md:px-4 md:py-2 text-sm font-medium rounded-lg
                     bg-violet-500 text-white hover:bg-violet-600 transition-colors shadow-lg shadow-violet-500/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Crear Campaña
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        <div className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-xl p-2.5 md:p-3">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-3.5 h-3.5 md:w-4 md:h-4 text-violet-400" />
            <span className="text-[10px] md:text-xs text-violet-300/70">Total</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-violet-300 leading-none">{campaigns.length}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-2.5 md:p-3">
          <div className="flex items-center gap-2 mb-1">
            <Play className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
            <span className="text-[10px] md:text-xs text-emerald-300/70">Activas</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-emerald-300 leading-none">{campaigns.filter(c => c.estado === 'activa').length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-xl p-2.5 md:p-3">
          <div className="flex items-center gap-2 mb-1">
            <Pause className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-400" />
            <span className="text-[10px] md:text-xs text-amber-300/70">Pausadas</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-amber-300 leading-none">{campaigns.filter(c => c.estado === 'pausada').length}</p>
        </div>
        <div className="bg-gradient-to-br from-zinc-500/10 to-zinc-600/5 border border-zinc-500/20 rounded-xl p-2.5 md:p-3">
          <div className="flex items-center gap-2 mb-1">
            <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400" />
            <span className="text-[10px] md:text-xs text-zinc-300/70">Borradores</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-zinc-300 leading-none">{campaigns.filter(c => c.estado === 'borrador').length}</p>
        </div>
      </div>

      {/* Header with Create Button */}
      <div className="flex items-center justify-between mb-4 px-1">
        <p className="text-xs md:text-sm text-zinc-500">
          {campaigns.length} campaña{campaigns.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-medium rounded-lg
                     bg-gradient-to-r from-violet-500 to-violet-600 text-white 
                     hover:from-violet-600 hover:to-violet-700 transition-all
                     shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30
                     hover:scale-105 active:scale-100"
        >
          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Nueva Campaña
        </button>
      </div>

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.map((campaign) => {
          const statusConfig = STATUS_CONFIG[campaign.estado] || STATUS_CONFIG.borrador;
          const StatusIcon = statusConfig.icon;
          
          return (
            <div
              key={campaign.id}
              onClick={() => setEditingCampaign(campaign)}
              className="group bg-zinc-900/50 border border-white/5 rounded-xl p-3 md:p-4
                         hover:border-violet-500/30 hover:bg-zinc-800/50 
                         transition-all duration-300 cursor-pointer
                         hover:shadow-lg hover:shadow-violet-500/5 active:scale-[0.98] md:active:scale-100"
            >
              <div className="flex items-start justify-between gap-3 md:gap-4">
                {/* Left: Status Icon */}
                <div className={`
                  w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0
                  ${campaign.estado === 'activa' 
                    ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20' 
                    : campaign.estado === 'pausada'
                    ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20'
                    : 'bg-gradient-to-br from-zinc-500/20 to-zinc-600/10 border border-zinc-500/20'
                  }
                `}>
                  <StatusIcon className={`w-4 h-4 md:w-5 md:h-5 ${
                    campaign.estado === 'activa' ? 'text-emerald-400' :
                    campaign.estado === 'pausada' ? 'text-amber-400' : 'text-zinc-400'
                  }`} />
                </div>

                {/* Middle: Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <h3 className="font-medium text-[13px] md:text-base text-zinc-100 truncate group-hover:text-white transition-colors">
                      {campaign.nombre}
                    </h3>
                    <span className={`
                      inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-medium rounded-full border
                      transition-all duration-300 group-hover:scale-105
                      ${statusConfig.color}
                    `}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {statusConfig.label}
                    </span>
                  </div>
                  
                  {campaign.descripcion && (
                    <p className="text-[11px] md:text-sm text-zinc-500 truncate mb-2">
                      {campaign.descripcion}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs text-zinc-500">
                    {/* Audience */}
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-lg border border-white/[0.03]">
                      <Target className="w-3 h-3 md:w-3.5 md:h-3.5 text-violet-400" />
                      <span className="font-medium text-zinc-300 truncate max-w-[80px] md:max-w-none">{getAudienceName(campaign.audiencia_id)}</span>
                    </span>
                    
                    {/* Cadence */}
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-lg border border-white/[0.03]">
                      <Zap className="w-3 h-3 md:w-3.5 md:h-3.5 text-cyan-400" />
                      <span className="text-zinc-300 truncate">Cada {campaign.cadencia_dias}d</span>
                    </span>
                    
                    {/* Created */}
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      {formatDate(campaign.created_at)}
                    </span>
                  </div>

                  {/* Warning if no audience */}
                  {!campaign.audiencia_id && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
                      <AlertCircle className="w-3 h-3" />
                      <span>Sin audiencia asignada</span>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCampaign(campaign);
                    }}
                    className="p-2 text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all duration-200 hover:scale-110"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, campaign)}
                    className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all duration-200 hover:scale-110"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all duration-300" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateCampaignModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* Edit Modal */}
      {editingCampaign && (
        <EditCampaignModal
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
        />
      )}
    </>
  );
};

export default CampaignsTab;
