import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plus,
  Receipt,
  StickyNote,
  Wallet
} from 'lucide-react';
import { useContactStore } from '../../../store/contactStore';
import { useInvoiceStore } from '../../../store/invoiceStore';
import { useTareasStore } from '../../../store/tareasStore';
import {
  ContactFinanceSummary,
  Payment,
  PaymentBehavior,
  Service,
  formatCommitmentDayLabel,
  formatCurrency,
  getLastConfirmedPaymentDate,
  getPortfolioAgingBucket,
  getPortfolioAgingLabel,
  getServiceCommitmentInfo
} from '../../../types/finance';
import { Invoice } from '../../../types/invoice';

interface ContactPortfolioWorkbenchProps {
  contactId: number;
  enterpriseId: number | null;
  services: (Service & { pagos?: Payment[] })[];
  summary: ContactFinanceSummary | null;
  onCreateService: () => void;
  onOpenService: (service: Service & { pagos?: Payment[] }) => void;
  onRegisterPayment: (service: Service & { pagos?: Payment[] }) => void;
  onNavigateTab?: (tab: 'tasks' | 'notes') => void;
}

type QueueSeverity = 'critical' | 'warning' | 'neutral' | 'success';

interface PortfolioQueueItem {
  service: Service & { pagos?: Payment[] };
  title: string;
  severity: QueueSeverity;
  priority: number;
  agingLabel: string;
  amount: number;
  dueDate: Date | null;
  overdueInvoices: number;
  lastPaymentDate: Date | null;
  commitmentInfo: ReturnType<typeof getServiceCommitmentInfo>;
}

const formatShortDate = (date: Date | null): string => {
  if (!date) return 'Sin fecha';
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getTodayReference = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
};

const severityConfig: Record<QueueSeverity, { border: string; badge: string; icon: React.ReactNode }> = {
  critical: {
    border: 'border-rose-500/16 bg-rose-500/[0.035]',
    badge: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    icon: <AlertTriangle className="w-4 h-4 text-rose-400" />
  },
  warning: {
    border: 'border-amber-500/16 bg-amber-500/[0.035]',
    badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    icon: <Clock3 className="w-4 h-4 text-amber-400" />
  },
  neutral: {
    border: 'border-cyan-500/16 bg-cyan-500/[0.03]',
    badge: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    icon: <Wallet className="w-4 h-4 text-cyan-400" />
  },
  success: {
    border: 'border-emerald-500/16 bg-emerald-500/[0.03]',
    badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />
  }
};

const metricCardClasses = 'rounded-3xl border border-white/[0.08] bg-black/20 backdrop-blur-xl px-4 py-3.5 md:px-5 md:py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';

const behaviorConfig: Record<PaymentBehavior, { label: string; color: string }> = {
  activo: { label: 'Activo', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  irregular: { label: 'Irregular', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  inactivo: { label: 'Inactivo', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  sin_pagos: { label: 'Sin pagos', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
};

export const ContactPortfolioWorkbench: React.FC<ContactPortfolioWorkbenchProps> = ({
  contactId,
  enterpriseId,
  services,
  summary,
  onCreateService,
  onOpenService,
  onRegisterPayment,
  onNavigateTab
}) => {
  const fetchInvoicesByContact = useInvoiceStore(state => state.fetchInvoicesByContact);
  const createTask = useTareasStore(state => state.createTask);
  const userContext = useContactStore(state => state.userContext);
  const addContactNote = useContactStore(state => state.addContactNote);

  const [contactInvoices, setContactInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!contactId || !enterpriseId) {
      setContactInvoices([]);
      return;
    }

    let cancelled = false;

    const loadInvoices = async () => {
      setIsLoadingInvoices(true);
      setContactInvoices([]);
      try {
        await fetchInvoicesByContact(contactId, enterpriseId);
        if (!cancelled) {
          setContactInvoices(useInvoiceStore.getState().invoices);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInvoices(false);
        }
      }
    };

    loadInvoices();

    return () => {
      cancelled = true;
    };
  }, [contactId, enterpriseId, fetchInvoicesByContact]);

  const overdueInvoicesByService = useMemo(() => {
    const today = getTodayReference();
    const map = new Map<number, number>();

    contactInvoices.forEach(invoice => {
      if (!invoice.servicio_id || (invoice.saldo_pendiente || 0) <= 0) {
        return;
      }

      const dueDate = invoice.fecha_vencimiento ? new Date(invoice.fecha_vencimiento) : null;
      const isOverdue = invoice.estado === 'vencida'
        || (invoice.estado === 'emitida' && dueDate && dueDate.getTime() < today.getTime());

      if (!isOverdue) {
        return;
      }

      map.set(invoice.servicio_id, (map.get(invoice.servicio_id) || 0) + 1);
    });

    return map;
  }, [contactInvoices]);

  const queueItems = useMemo(() => {
    return services
      .filter(service => service.estado !== 'cancelado' && ((service.saldo_pendiente || 0) > 0 || (overdueInvoicesByService.get(service.id) || 0) > 0))
      .map(service => {
        const commitmentInfo = getServiceCommitmentInfo(service);
        const agingBucket = getPortfolioAgingBucket(commitmentInfo);
        const overdueInvoices = overdueInvoicesByService.get(service.id) || 0;
        const lastPaymentDate = getLastConfirmedPaymentDate(service.pagos);
        const amount = commitmentInfo.currentCommitmentAmount || service.saldo_pendiente || 0;

        let title = 'Próximo seguimiento';
        let severity: QueueSeverity = 'success';
        let priority = 10;

        if (agingBucket === 'mas_de_30') {
          title = 'Mora crítica';
          severity = 'critical';
          priority = 100;
        } else if (agingBucket === 'de_8_a_30') {
          title = 'En mora';
          severity = 'critical';
          priority = 90;
        } else if (agingBucket === 'de_1_a_7') {
          title = 'Cobro atrasado';
          severity = 'warning';
          priority = 80;
        } else if (agingBucket === 'vence_hoy') {
          title = 'Vence hoy';
          severity = 'warning';
          priority = 70;
        } else if (agingBucket === 'sin_configurar') {
          title = 'Configurar compromiso';
          severity = 'neutral';
          priority = 60;
        } else if (overdueInvoices > 0) {
          title = 'Factura vencida';
          severity = 'critical';
          priority = 65;
        } else if (service.estado === 'pendiente_pago') {
          title = 'Pendiente por confirmar';
          severity = 'neutral';
          priority = 40;
        }

        // Modificadores por comportamiento de pago y deuda acumulada
        const behavior = commitmentInfo.paymentBehavior;
        if (behavior === 'sin_pagos') priority += 15;
        else if (behavior === 'inactivo') priority += 10;
        else if (behavior === 'irregular') priority += 5;

        if (commitmentInfo.ciclosImpagos >= 6) priority += 8;
        else if (commitmentInfo.ciclosImpagos >= 3) priority += 4;

        return {
          service,
          title,
          severity,
          priority,
          agingLabel: getPortfolioAgingLabel(agingBucket),
          amount,
          dueDate: commitmentInfo.dueDate,
          overdueInvoices,
          lastPaymentDate,
          commitmentInfo
        } satisfies PortfolioQueueItem;
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (b.overdueInvoices !== a.overdueInvoices) return b.overdueInvoices - a.overdueInvoices;
        if (b.commitmentInfo.daysOverdue !== a.commitmentInfo.daysOverdue) {
          return b.commitmentInfo.daysOverdue - a.commitmentInfo.daysOverdue;
        }
        return (b.service.saldo_pendiente || 0) - (a.service.saldo_pendiente || 0);
      });
  }, [services, overdueInvoicesByService]);

  const agingStats = useMemo(() => {
    return queueItems.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.commitmentInfo.daysOverdue > 0) acc.overdue += 1;
        if (item.overdueInvoices > 0) acc.overdueInvoices += item.overdueInvoices;
        if (item.agingLabel === 'Vence hoy') acc.dueToday += 1;
        if (item.agingLabel === '1-7 días') acc.bucket1to7 += 1;
        if (item.agingLabel === '8-30 días') acc.bucket8to30 += 1;
        if (item.agingLabel === '31+ días') acc.bucket31plus += 1;
        if (item.agingLabel === 'Sin compromiso') acc.unconfigured += 1;
        return acc;
      },
      {
        total: 0,
        overdue: 0,
        overdueInvoices: 0,
        dueToday: 0,
        bucket1to7: 0,
        bucket8to30: 0,
        bucket31plus: 0,
        unconfigured: 0
      }
    );
  }, [queueItems]);

  const totalCommitmentThisCycle = useMemo(() => {
    return queueItems.reduce((sum, item) => sum + (item.commitmentInfo.currentCommitmentAmount || 0), 0);
  }, [queueItems]);

  const totalDueNow = useMemo(() => {
    return queueItems.reduce((sum, item) => {
      if (item.commitmentInfo.daysOverdue > 0 || item.commitmentInfo.status === 'vence_hoy' || item.overdueInvoices > 0) {
        return sum + item.amount;
      }
      return sum;
    }, 0);
  }, [queueItems]);

  const lastPaymentDate = useMemo(() => {
    return queueItems.reduce<Date | null>((latest, item) => {
      if (!item.lastPaymentDate) return latest;
      if (!latest || item.lastPaymentDate.getTime() > latest.getTime()) {
        return item.lastPaymentDate;
      }
      return latest;
    }, null);
  }, [queueItems]);

  const maxCiclosImpagos = useMemo(() => {
    return Math.max(...queueItems.map(item => item.commitmentInfo.ciclosImpagos), 0);
  }, [queueItems]);

  const worstBehavior = useMemo((): PaymentBehavior => {
    const order: Record<PaymentBehavior, number> = { activo: 0, irregular: 1, inactivo: 2, sin_pagos: 3 };
    return queueItems.reduce<PaymentBehavior>((worst, item) => {
      return (order[item.commitmentInfo.paymentBehavior] || 0) > (order[worst] || 0)
        ? item.commitmentInfo.paymentBehavior
        : worst;
    }, 'activo');
  }, [queueItems]);

  const runAsyncAction = async (key: string, action: () => Promise<void>, successMessage: string) => {
    setActionKey(key);
    setActionFeedback(null);

    try {
      await action();
      setActionFeedback({ type: 'success', message: successMessage });
    } catch (error: any) {
      setActionFeedback({ type: 'error', message: error?.message || 'No se pudo completar la acción.' });
    } finally {
      setActionKey(currentKey => (currentKey === key ? null : currentKey));
    }
  };

  const handleCreateFollowUp = async (item: PortfolioQueueItem) => {
    if (!enterpriseId || !userContext?.id) {
      throw new Error('No hay contexto suficiente para crear la tarea de seguimiento.');
    }

    const dueDate = item.dueDate || new Date();
    const priority = item.commitmentInfo.daysOverdue >= 8 || item.overdueInvoices > 0
      ? 4
      : item.commitmentInfo.daysOverdue > 0 || item.commitmentInfo.status === 'vence_hoy'
        ? 3
        : 2;

    const createdTask = await createTask(enterpriseId, userContext.id, {
      titulo: `Seguimiento de cobranza · ${item.service.nombre_servicio}`,
      descripcion: [
        `Saldo pendiente: ${formatCurrency(item.service.saldo_pendiente || 0, item.service.moneda)}`,
        `Prioridad: ${item.title}`,
        `Compromiso: ${formatCommitmentDayLabel(item.service.dia_compromiso_pago)}`,
        `Vencimiento actual: ${formatShortDate(item.dueDate)}`,
        item.overdueInvoices > 0 ? `Facturas vencidas vinculadas: ${item.overdueInvoices}` : null
      ].filter(Boolean).join('\n'),
      prioridad: priority,
      contacto_id: contactId,
      fecha_vencimiento: new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 12, 0, 0, 0).toISOString(),
      items: ['Contactar al cliente', 'Validar promesa de pago', 'Actualizar siguiente paso']
    });

    if (!createdTask) {
      throw new Error(useTareasStore.getState().error || 'No se pudo crear la tarea de seguimiento.');
    }
  };

  const handleCreateCollectionNote = async (item: PortfolioQueueItem) => {
    await addContactNote(
      contactId,
      [
        `Servicio: ${item.service.nombre_servicio}`,
        `Estado operativo: ${item.title}`,
        `Saldo pendiente: ${formatCurrency(item.service.saldo_pendiente || 0, item.service.moneda)}`,
        `Compromiso: ${formatCommitmentDayLabel(item.service.dia_compromiso_pago)}`,
        `Vencimiento actual: ${formatShortDate(item.dueDate)}`,
        `Último pago: ${formatShortDate(item.lastPaymentDate)}`,
        item.overdueInvoices > 0 ? `Facturas vencidas vinculadas: ${item.overdueInvoices}` : null
      ].filter(Boolean).join('\n'),
      {
        titulo: `Cobranza · ${item.service.nombre_servicio}`,
        etiquetas: ['cartera', 'cobranza'],
        visible_ia: true
      }
    );
  };

  const secondaryButtonClasses = 'h-10 px-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.025] text-zinc-300 text-sm hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors inline-flex items-center justify-center gap-2';
  const primaryButtonClasses = 'h-10 px-3.5 rounded-2xl border border-primary-500/20 bg-primary-500/[0.08] text-primary-300 text-sm font-medium hover:bg-primary-500/[0.14] transition-colors inline-flex items-center justify-center gap-2';

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-white/[0.08] bg-[#0b0b0d]/80 backdrop-blur-xl p-4 md:p-6 space-y-5 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-zinc-300">
              <Wallet className="w-3.5 h-3.5 text-primary-300" />
              Cartera
            </div>
            <div>
              <h3 className="text-lg md:text-[22px] font-semibold tracking-tight text-zinc-100">Cobros, pendientes y próximos movimientos</h3>
              <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl leading-6">
                Una vista operativa más limpia para priorizar deuda, registrar seguimiento y abrir cada servicio sin fricción.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('tasks')}
                className={secondaryButtonClasses}
              >
                Ir a tareas
              </button>
            )}
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('notes')}
                className={secondaryButtonClasses}
              >
                Ir a notas
              </button>
            )}
            <button
              onClick={onCreateService}
              className={primaryButtonClasses}
            >
              <Plus className="w-4 h-4" />
              Nuevo servicio
            </button>
          </div>
        </div>

        {actionFeedback && (
          <div className={`rounded-2xl border px-3.5 py-2.5 text-sm ${actionFeedback.type === 'success'
            ? 'border-emerald-500/16 bg-emerald-500/[0.06] text-emerald-300'
            : 'border-rose-500/16 bg-rose-500/[0.06] text-rose-300'}`}>
            {actionFeedback.message}
          </div>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Pendiente total</p>
            <p className="mt-2.5 text-lg font-semibold tracking-tight text-zinc-100">{formatCurrency(summary?.totalPendiente || 0, summary?.moneda || 'USD')}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Exigible ahora</p>
            <p className="mt-2.5 text-lg font-semibold tracking-tight text-amber-300">{formatCurrency(totalDueNow, summary?.moneda || 'USD')}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Compromiso del mes</p>
            <p className="mt-2.5 text-lg font-semibold tracking-tight text-primary-300">{formatCurrency(totalCommitmentThisCycle, summary?.moneda || 'USD')}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Último pago</p>
            <p className="mt-2.5 text-sm md:text-base font-semibold tracking-tight text-zinc-100">{formatShortDate(lastPaymentDate)}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Servicios en mora</p>
            <p className="mt-2.5 text-lg font-semibold tracking-tight text-rose-300">{agingStats.overdue}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Facturas vencidas</p>
            <p className="mt-2.5 text-lg font-semibold tracking-tight text-zinc-100">{isLoadingInvoices ? '...' : agingStats.overdueInvoices}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Ciclos impagos</p>
            <p className={`mt-2.5 text-lg font-semibold tracking-tight ${maxCiclosImpagos > 0 ? 'text-rose-300' : 'text-zinc-100'}`}>{maxCiclosImpagos}</p>
          </div>
          <div className={metricCardClasses}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Comportamiento</p>
            <p className="mt-2.5">
              <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border ${behaviorConfig[worstBehavior].color}`}>
                {behaviorConfig[worstBehavior].label}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] text-[11px] text-zinc-300">Vence hoy: {agingStats.dueToday}</span>
          <span className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] text-[11px] text-zinc-300">1-7 días: {agingStats.bucket1to7}</span>
          <span className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] text-[11px] text-zinc-300">8-30 días: {agingStats.bucket8to30}</span>
          <span className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] text-[11px] text-zinc-300">31+ días: {agingStats.bucket31plus}</span>
          <span className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] text-[11px] text-zinc-300">Sin compromiso: {agingStats.unconfigured}</span>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/[0.08] bg-[#0b0b0d]/72 backdrop-blur-xl p-4 md:p-6 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-base font-semibold tracking-tight text-zinc-100">Bandeja priorizada de cobranza</h4>
            <p className="text-sm text-zinc-500 mt-1">Ordenada por mora, compromiso y riesgo visible del contacto.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-xs text-zinc-500">
            {isLoadingInvoices && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {queueItems.length} item(s) operativos
          </div>
        </div>

        {queueItems.length === 0 ? (
          <div className="rounded-[24px] border border-emerald-500/16 bg-emerald-500/[0.04] p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <p className="text-zinc-100 font-medium">No hay deuda operativa pendiente</p>
            <p className="text-sm text-zinc-500 mt-1">Este contacto no tiene alertas de cobranza activas en este momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queueItems.map(item => {
              const config = severityConfig[item.severity];
              const followUpKey = `task-${item.service.id}`;
              const noteKey = `note-${item.service.id}`;

              return (
                <div
                  key={item.service.id}
                  className={`rounded-[24px] border p-4 md:p-5 transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${config.border}`}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
                          {config.icon}
                          {item.title}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border ${config.badge}`}>
                          {item.agingLabel}
                        </span>
                        {item.overdueInvoices > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300">
                            <Receipt className="w-3 h-3" />
                            {item.overdueInvoices} factura(s) vencida(s)
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="text-base font-semibold tracking-tight text-zinc-100">{item.service.nombre_servicio}</p>
                        <p className="text-sm text-zinc-400 mt-1">
                          Pendiente {formatCurrency(item.service.saldo_pendiente || 0, item.service.moneda)}
                          {item.service.cuota_mensual != null && item.service.cuota_mensual > 0 && (
                            <> · Mensual {formatCurrency(item.service.cuota_mensual, item.service.moneda)}</>
                          )}
                          {' · '}
                          Compromiso {formatCommitmentDayLabel(item.service.dia_compromiso_pago)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 text-xs">
                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 px-3.5 py-3">
                          <p className="text-zinc-500">Monto a mover</p>
                          <p className="text-zinc-200 mt-1">{formatCurrency(item.amount, item.service.moneda)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 px-3.5 py-3">
                          <p className="text-zinc-500">Vencimiento actual</p>
                          <p className="text-zinc-200 mt-1">{formatShortDate(item.dueDate)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 px-3.5 py-3">
                          <p className="text-zinc-500">Mora operativa</p>
                          <p className={`mt-1 ${item.commitmentInfo.daysOverdue > 0 ? 'text-rose-300' : 'text-zinc-200'}`}>
                            {item.commitmentInfo.daysOverdue > 0 ? `${item.commitmentInfo.daysOverdue} día(s)` : 'Sin atraso'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 px-3.5 py-3">
                          <p className="text-zinc-500">Ciclos impagos</p>
                          <p className={`mt-1 ${item.commitmentInfo.ciclosImpagos > 0 ? 'text-amber-300' : 'text-zinc-200'}`}>
                            {item.commitmentInfo.ciclosImpagos > 0 ? `${item.commitmentInfo.ciclosImpagos} ciclo(s)` : 'Al día'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 px-3.5 py-3">
                          <p className="text-zinc-500">Último pago</p>
                          <p className="text-zinc-200 mt-1">{formatShortDate(item.lastPaymentDate)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-black/15 px-3.5 py-3">
                          <p className="text-zinc-500">Comportamiento</p>
                          <p className="mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${behaviorConfig[item.commitmentInfo.paymentBehavior].color}`}>
                              {behaviorConfig[item.commitmentInfo.paymentBehavior].label}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap xl:flex-col gap-2.5 xl:w-48 shrink-0">
                      <button
                        onClick={() => onRegisterPayment(item.service)}
                        className="h-10 px-3.5 rounded-2xl border border-emerald-500/18 bg-emerald-500/[0.08] text-emerald-300 text-sm font-medium hover:bg-emerald-500/[0.14] transition-colors inline-flex items-center justify-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        Registrar pago
                      </button>
                      <button
                        onClick={() => runAsyncAction(followUpKey, () => handleCreateFollowUp(item), 'Seguimiento de cobranza creado.')}
                        className={secondaryButtonClasses}
                      >
                        {actionKey === followUpKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        Crear seguimiento
                      </button>
                      <button
                        onClick={() => runAsyncAction(noteKey, () => handleCreateCollectionNote(item), 'Nota de cobranza agregada al contacto.')}
                        className={secondaryButtonClasses}
                      >
                        {actionKey === noteKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
                        Agregar nota
                      </button>
                      <button
                        onClick={() => onOpenService(item.service)}
                        className="h-10 px-3.5 rounded-2xl border border-cyan-500/18 bg-cyan-500/[0.08] text-cyan-300 text-sm hover:bg-cyan-500/[0.14] transition-colors inline-flex items-center justify-center gap-2"
                      >
                        <Receipt className="w-4 h-4" />
                        Ver servicio
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
