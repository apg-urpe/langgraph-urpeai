'use client';

import React, { memo } from 'react';
import { Loader2, AlertCircle, Users, PowerOff, Clock } from 'lucide-react';
import { FunnelStage } from '../../../types/contact';
import { formatCurrency } from '../../../types/finance';
import type { PortfolioQueueContactItem, PortfolioQueueSummary } from '../../../hooks/usePortfolioQueue';

interface PortfolioListViewProps {
  isLoading: boolean;
  items: PortfolioQueueContactItem[];
  summary: PortfolioQueueSummary;
  funnelStages: FunnelStage[];
  userRoleId: number | null;
  error: string | null;
  refreshContacts: () => void;
  handleContactClick: (id: number) => void;
  isBasicRole: boolean;
  searchFilter: string;
}

const PORTFOLIO_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  mora_critica: { bg: 'bg-rose-500/18', text: 'text-rose-300', border: 'border-rose-500/30', label: 'Mora crítica' },
  en_mora: { bg: 'bg-rose-500/12', text: 'text-rose-300', border: 'border-rose-500/22', label: 'En mora' },
  factura_vencida: { bg: 'bg-rose-500/10', text: 'text-rose-200', border: 'border-rose-500/20', label: 'Factura vencida' },
  vence_hoy: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Vence hoy' },
  sin_configurar: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20', label: 'Sin compromiso' },
  pendiente_confirmacion: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/20', label: 'Pendiente por confirmar' },
  al_dia: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Al día' },
};

export const PortfolioListView = memo<PortfolioListViewProps>(({
  isLoading,
  items,
  funnelStages,
  userRoleId,
  error,
  refreshContacts,
  handleContactClick,
  isBasicRole,
  searchFilter,
}) => {
  const getStageName = (stageId: number | null): string | null => {
    if (!stageId) return null;
    const stage = funnelStages.find(s => s.id === stageId);
    return stage?.nombre_etapa || null;
  };

  const formatShortDate = (dateStr?: string | null): string => {
    if (!dateStr) return 'Sin registro';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'Sin registro';
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-auto">
      {isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <span className="text-sm">Cargando cartera...</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-48 text-red-400 p-4">
          <AlertCircle className="w-8 h-8 mb-2" />
          <span className="text-sm text-center">{error}</span>
          <button
            onClick={refreshContacts}
            className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-zinc-500 p-4">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          {isBasicRole && !searchFilter ? (
            <>
              <span className="text-sm font-medium text-zinc-400">No tienes cartera asignada</span>
              <span className="text-xs mt-1 text-center max-w-xs">Contacta a tu administrador si esperabas ver casos de cobranza.</span>
            </>
          ) : (
            <>
              <span className="text-sm">No hay cartera activa</span>
              {searchFilter && (
                <span className="text-xs mt-1">Prueba con otros términos o filtros de cobranza</span>
              )}
            </>
          )}
        </div>
      )}

      {(!isLoading || items.length > 0) && !error && items.length > 0 && (
        <div className={`space-y-3 p-3 md:p-4 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0b0d]/70">
            {items.map((item) => {
              const style = PORTFOLIO_STATUS_STYLES[item.topStatus] || PORTFOLIO_STATUS_STYLES.al_dia;
              const stageName = getStageName(item.etapaEmbudoId);
              const hasActivePause = !!item.pausedUntil && new Date(item.pausedUntil).getTime() > Date.now();
              const isPaused = hasActivePause;
              const isDeactivated = item.isActive === false && !hasActivePause;

              return (
                <button
                  key={item.contactId}
                  type="button"
                  onClick={() => handleContactClick(item.contactId)}
                  className="w-full p-3 md:p-4 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-zinc-100 truncate">{item.displayName}</h3>
                        {userRoleId !== 3 && item.assignedAgent && (
                          <span className="text-[10px] text-zinc-500">{item.assignedAgent}</span>
                        )}
                        {item.topServiceName && (
                          <span className="text-[10px] text-zinc-500 truncate">{item.topServiceName}</span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                        {item.estado && (
                          <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-zinc-300">
                            {item.estado}
                          </span>
                        )}
                        {stageName && <span>{stageName}</span>}
                        {item.origen && <span>{item.origen}</span>}
                        {item.lastPaymentDate && <span>Último pago {formatShortDate(item.lastPaymentDate)}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isDeactivated && (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shadow-lg ring-1 ring-black bg-rose-500" title="Desactivado">
                          <PowerOff className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      {isPaused && (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shadow-lg ring-1 ring-black bg-amber-500" title="Pausado temporalmente">
                          <Clock className="w-2.5 h-2.5 text-black" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text} ${style.border}`}>
                      {style.label}
                      {item.daysOverdue > 0 && <span className="font-bold">{item.daysOverdue}d</span>}
                    </span>

                    <span className="text-[10px] font-semibold text-amber-300">
                      Saldo {formatCurrency(item.pendingBalance, item.primaryCurrency)}
                    </span>

                    {item.nextCommitmentDay && (
                      <span className="text-[10px] text-zinc-300">
                        Compromiso día {item.nextCommitmentDay}
                      </span>
                    )}

                    {item.nextDueDate && (
                      <span className="text-[10px] text-zinc-400">
                        Próx. pago {formatShortDate(item.nextDueDate)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

PortfolioListView.displayName = 'PortfolioListView';
