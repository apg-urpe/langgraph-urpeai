import React, { useEffect, useMemo, useState } from 'react';
import { 
  Wallet, 
  Plus, 
  Package, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FileText,
  ExternalLink,
  Loader2,
  TrendingUp,
  TrendingDown,
  Banknote,
  AlertTriangle
} from 'lucide-react';
import { useFinanceStore, selectServices, selectContactSummary, selectIsLoading } from '../../../store/financeStore';
import { useContactStore, selectActiveContactData, selectIsObservationMode } from '../../../store/contactStore';
import { 
  Service, 
  ServiceWithPayments,
  formatCurrency, 
  formatCommitmentDayLabel,
  SERVICE_STATUS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  calculatePaymentPercentage,
  getServiceCommitmentInfo
} from '../../../types/finance';
import { ServiceDetailModal } from './ServiceDetailModal';
import { ServiceFormModal } from './ServiceFormModal';

interface ContactServicesProps {
  contactId: number;
  onNavigateTab?: (tab: 'tasks' | 'notes') => void;
}

export const ContactServices: React.FC<ContactServicesProps> = ({ contactId }) => {
  const [showServiceDetail, setShowServiceDetail] = useState<number | null>(null);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const services = useFinanceStore(selectServices);
  const summary = useFinanceStore(selectContactSummary);
  const isLoading = useFinanceStore(selectIsLoading);
  const fetchServicesByContact = useFinanceStore(state => state.fetchServicesByContact);
  const setSelectedService = useFinanceStore(state => state.setSelectedService);
  
  const activeContactData = useContactStore(selectActiveContactData);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const isObservationMode = useContactStore(selectIsObservationMode);

  const displayedServices = useMemo(() => {
    if (services.length > 0 || activeContactData.services.length === 0) {
      return services;
    }

    return activeContactData.services;
  }, [services, activeContactData.services]);

  const displayedSummary = useMemo(() => {
    if (summary) {
      return summary;
    }

    if (displayedServices.length === 0) {
      return null;
    }

    return {
      totalContratado: displayedServices.reduce((sum, service) => sum + (service.valor_total || 0), 0),
      totalPagado: displayedServices.reduce((sum, service) => sum + (service.saldo_pagado || 0), 0),
      totalPendiente: displayedServices.reduce((sum, service) => sum + (service.saldo_pendiente || 0), 0),
      serviciosActivos: displayedServices.filter(service => service.estado === 'activo' || service.estado === 'pendiente_pago').length,
      serviciosCompletados: displayedServices.filter(service => service.estado === 'finalizado').length,
      moneda: displayedServices[0]?.moneda || 'USD'
    };
  }, [summary, displayedServices]);

  const portfolioSignals = useMemo(() => {
    return displayedServices.reduce((acc, service) => {
      const commitment = getServiceCommitmentInfo(service);

      if (commitment.status === 'en_mora') {
        acc.overdue += 1;
      }

      if (commitment.status === 'sin_configurar' && (service.saldo_pendiente || 0) > 0) {
        acc.unconfigured += 1;
      }

      return acc;
    }, { overdue: 0, unconfigured: 0 });
  }, [displayedServices]);

  useEffect(() => {
    if (contactId && selectedEnterpriseId) {
      fetchServicesByContact(contactId, selectedEnterpriseId);
    }
  }, [contactId, selectedEnterpriseId, fetchServicesByContact]);

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setShowServiceForm(true);
  };

  const handleCloseForm = () => {
    setShowServiceForm(false);
    setEditingService(null);
  };

  const handleOpenServiceDetail = (service: Service & { pagos?: ServiceWithPayments['pagos'] }) => {
    if (service.pagos) {
      setSelectedService({
        ...service,
        pagos: service.pagos,
        porcentajePagado: calculatePaymentPercentage(service)
      });
    }

    setShowServiceDetail(service.id);
  };

  const getStatusConfig = (status: string) => {
    return SERVICE_STATUS_OPTIONS.find(s => s.value === status) || SERVICE_STATUS_OPTIONS[0];
  };

  const getTypeLabel = (type: string) => {
    return SERVICE_TYPE_OPTIONS.find(t => t.value === type)?.label || type;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'activo': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'pendiente_pago': return <AlertCircle className="w-3.5 h-3.5" />;
      case 'finalizado': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'cancelado': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  const formatDueDate = (date: Date | null) => {
    if (!date) return 'Sin fecha';
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short'
    });
  };

  const getCommitmentStatusConfig = (service: Service) => {
    const commitmentInfo = getServiceCommitmentInfo(service);

    switch (commitmentInfo.status) {
      case 'pagado':
        return {
          commitmentInfo,
          label: 'Sin saldo',
          color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
        };
      case 'vence_hoy':
        return {
          commitmentInfo,
          label: 'Vence hoy',
          color: 'text-amber-300 bg-amber-500/10 border-amber-500/20'
        };
      case 'en_mora':
        return {
          commitmentInfo,
          label: `${commitmentInfo.daysOverdue}d en mora`,
          color: 'text-rose-300 bg-rose-500/10 border-rose-500/20'
        };
      case 'al_dia':
        return {
          commitmentInfo,
          label: `Vence ${formatDueDate(commitmentInfo.dueDate)}`,
          color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
        };
      default:
        return {
          commitmentInfo,
          label: 'Sin definir',
          color: 'text-zinc-300 bg-white/5 border-white/10'
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Observation Mode Banner */}
      {isObservationMode && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-cyan-400 font-medium">Empresa Externa</p>
            <p className="text-[10px] text-cyan-400/70">Los servicios se guardarán en esta empresa.</p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {displayedSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Contratado */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Banknote className="w-4 h-4" />
              <span className="text-xs font-medium">Total Contratado</span>
            </div>
            <p className="text-lg font-semibold text-zinc-100">
              {formatCurrency(displayedSummary.totalContratado, displayedSummary.moneda)}
            </p>
          </div>

          {/* Total Pagado */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Pagado</span>
            </div>
            <p className="text-lg font-semibold text-emerald-400">
              {formatCurrency(displayedSummary.totalPagado, displayedSummary.moneda)}
            </p>
          </div>

          {/* Pendiente */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <TrendingDown className="w-4 h-4" />
              <span className="text-xs font-medium">Pendiente</span>
            </div>
            <p className="text-lg font-semibold text-amber-400">
              {formatCurrency(displayedSummary.totalPendiente, displayedSummary.moneda)}
            </p>
          </div>

          {/* Servicios Activos */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-xs font-medium">Servicios</span>
            </div>
            <p className="text-lg font-semibold text-zinc-100">
              {displayedSummary.serviciosActivos} <span className="text-sm text-zinc-500">activos</span>
            </p>
          </div>
        </div>
      )}

      {/* Header with Add Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-zinc-400">
            <Wallet className="w-4 h-4" />
            <span className="text-sm font-medium">Servicios Contratados</span>
            <span className="text-xs text-zinc-500">({displayedServices.length})</span>
          </div>
          {(portfolioSignals.overdue > 0 || portfolioSignals.unconfigured > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {portfolioSignals.overdue > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300">
                  {portfolioSignals.overdue} en mora
                </span>
              )}
              {portfolioSignals.unconfigured > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border border-white/10 bg-white/5 text-zinc-300">
                  {portfolioSignals.unconfigured} sin compromiso
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowServiceForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-primary-500/10 text-primary-400 border border-primary-500/20
                     hover:bg-primary-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo Servicio
        </button>
      </div>

      {/* Services List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {displayedServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Package className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-zinc-400 text-sm">No hay servicios registrados</p>
            <p className="text-zinc-500 text-xs mt-1">
              Agrega un servicio para comenzar el seguimiento de cartera
            </p>
          </div>
        ) : (
          displayedServices.map(service => {
            const statusConfig = getStatusConfig(service.estado);
            const percentage = calculatePaymentPercentage(service);
            const commitmentStatus = getCommitmentStatusConfig(service);
            
            return (
              <div
                key={service.id}
                className="bg-zinc-900/50 border border-white/5 rounded-lg p-4 
                           hover:border-white/10 transition-all cursor-pointer group"
                onClick={() => handleOpenServiceDetail(service)}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-zinc-100 truncate pr-2">
                      {service.nombre_servicio}
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {getTypeLabel(service.tipo_servicio)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${statusConfig.color}`}>
                      {getStatusIcon(service.estado)}
                      {statusConfig.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </div>

                {/* Financial Info */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-zinc-500">Valor Total</p>
                    <p className="text-sm font-medium text-zinc-200">
                      {formatCurrency(service.valor_total, service.moneda)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Pagado</p>
                    <p className="text-sm font-medium text-emerald-400">
                      {formatCurrency(service.saldo_pagado, service.moneda)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Pendiente</p>
                    <p className="text-sm font-medium text-amber-400">
                      {formatCurrency(service.saldo_pendiente, service.moneda)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Progreso de pago</span>
                    <span className="text-zinc-400">{percentage}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        percentage >= 100 ? 'bg-emerald-500' :
                        percentage >= 50 ? 'bg-primary-500' :
                        'bg-amber-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-zinc-500">
                    {service.cuota_mensual != null && service.cuota_mensual > 0 && (
                      <span>
                        Monto mensual propuesto {formatCurrency(service.cuota_mensual, service.moneda)}
                      </span>
                    )}
                    <span>
                      Compromiso {formatCommitmentDayLabel(service.dia_compromiso_pago)}
                    </span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${commitmentStatus.color}`}>
                    {commitmentStatus.label}
                  </span>
                </div>

                {/* Contract Link (if exists) */}
                {service.contrato_url && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <a
                      href={service.contrato_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver Contrato
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Service Detail Modal */}
      {showServiceDetail && (
        <ServiceDetailModal
          serviceId={showServiceDetail}
          onClose={() => setShowServiceDetail(null)}
          onEdit={(service) => {
            setShowServiceDetail(null);
            handleEditService(service);
          }}
        />
      )}

      {/* Service Form Modal */}
      {showServiceForm && (
        <ServiceFormModal
          contactId={contactId}
          service={editingService}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
};
