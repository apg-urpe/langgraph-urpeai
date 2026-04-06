import { Payment, PaymentBehavior, Service, getLastConfirmedPaymentDate, getPortfolioAgingBucket, getPortfolioAgingLabel, getServiceCommitmentInfo } from '../types/finance';

export type PortfolioQueueSeverity = 'critical' | 'warning' | 'neutral' | 'success';
export type PortfolioQueueStatus = 'mora_critica' | 'en_mora' | 'factura_vencida' | 'vence_hoy' | 'sin_configurar' | 'pendiente_confirmacion' | 'al_dia';
export type PortfolioQueueSort = 'portfolioPriority' | 'createdNewest' | 'createdOldest';

export interface PortfolioQueueContactItem {
  contactId: number;
  displayName: string;
  estado: string | null;
  calificacion: string | null;
  origen: string | null;
  etapaEmbudoId: number | null;
  createdAt: string | null;
  lastInteraction: string | null;
  isActive: boolean | null;
  pausedUntil: string | null;
  assignedAgent: string | null;
  topServiceId: number | null;
  topServiceName: string | null;
  topSeverity: PortfolioQueueSeverity;
  topStatus: PortfolioQueueStatus;
  topTitle: string;
  agingLabel: string;
  priorityScore: number;
  pendingBalance: number;
  dueNowAmount: number;
  overdueInvoices: number;
  servicesWithDebt: number;
  servicesCount: number;
  daysOverdue: number;
  nextCommitmentDay: number | null;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  recommendedAction: 'registrar_pago' | 'abrir_cartera' | 'crear_seguimiento';
  primaryCurrency: string;
  hasPendingConfirmation: boolean;
  ciclosImpagos: number;
  deudaAcumulada: number;
  paymentBehavior: PaymentBehavior;
}

export interface PortfolioQueuePagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PortfolioQueueSummary {
  totalPendingBalance: number;
  dueNowAmount: number;
  criticalCount: number;
}

export interface PortfolioInvoiceLike {
  servicio_id?: number | null;
  saldo_pendiente?: number | null;
  estado?: string | null;
  fecha_vencimiento?: string | null;
}

export interface PortfolioQueueServiceItem {
  service: Service & { pagos?: Payment[] };
  title: string;
  severity: PortfolioQueueSeverity;
  priority: number;
  status: PortfolioQueueStatus;
  agingLabel: string;
  amount: number;
  dueDate: Date | null;
  overdueInvoices: number;
  lastPaymentDate: Date | null;
  commitmentInfo: ReturnType<typeof getServiceCommitmentInfo>;
  ciclosImpagos: number;
  deudaAcumulada: number;
  paymentBehavior: PaymentBehavior;
  diasSinPago: number;
}

export const getPortfolioReferenceDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
};

export function buildOverdueInvoicesByService(invoices: PortfolioInvoiceLike[], referenceDate = getPortfolioReferenceDate()) {
  const map = new Map<number, number>();

  invoices.forEach((invoice) => {
    if (!invoice.servicio_id || (invoice.saldo_pendiente || 0) <= 0) {
      return;
    }

    const dueDate = invoice.fecha_vencimiento ? new Date(invoice.fecha_vencimiento) : null;
    const isOverdue = invoice.estado === 'vencida'
      || (invoice.estado === 'emitida' && dueDate && dueDate.getTime() < referenceDate.getTime());

    if (!isOverdue) {
      return;
    }

    map.set(invoice.servicio_id, (map.get(invoice.servicio_id) || 0) + 1);
  });

  return map;
}

export function buildPortfolioQueueItems(
  services: (Service & { pagos?: Payment[] })[],
  overdueInvoicesByService: Map<number, number>
): PortfolioQueueServiceItem[] {
  return services
    .filter(service => service.estado !== 'cancelado' && ((service.saldo_pendiente || 0) > 0 || (overdueInvoicesByService.get(service.id) || 0) > 0))
    .map((service) => {
      const commitmentInfo = getServiceCommitmentInfo(service);
      const agingBucket = getPortfolioAgingBucket(commitmentInfo);
      const overdueInvoices = overdueInvoicesByService.get(service.id) || 0;
      const lastPaymentDate = getLastConfirmedPaymentDate(service.pagos);
      const amount = commitmentInfo.currentCommitmentAmount || service.saldo_pendiente || 0;

      let title = 'Próximo seguimiento';
      let severity: PortfolioQueueSeverity = 'success';
      let priority = 10;
      let status: PortfolioQueueStatus = 'al_dia';

      if (agingBucket === 'mas_de_30') {
        title = 'Mora crítica';
        severity = 'critical';
        priority = 100;
        status = 'mora_critica';
      } else if (agingBucket === 'de_8_a_30') {
        title = 'En mora';
        severity = 'critical';
        priority = 90;
        status = 'en_mora';
      } else if (agingBucket === 'de_1_a_7') {
        title = 'Cobro atrasado';
        severity = 'warning';
        priority = 80;
        status = 'en_mora';
      } else if (overdueInvoices > 0) {
        title = 'Factura vencida';
        severity = 'critical';
        priority = 75;
        status = 'factura_vencida';
      } else if (agingBucket === 'vence_hoy') {
        title = 'Vence hoy';
        severity = 'warning';
        priority = 70;
        status = 'vence_hoy';
      } else if (agingBucket === 'sin_configurar') {
        title = 'Configurar compromiso';
        severity = 'neutral';
        priority = 60;
        status = 'sin_configurar';
      } else if (service.estado === 'pendiente_pago') {
        title = 'Pendiente por confirmar';
        severity = 'neutral';
        priority = 40;
        status = 'pendiente_confirmacion';
      }

      // Modificadores de prioridad por comportamiento de pago y deuda acumulada
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
        status,
        agingLabel: getPortfolioAgingLabel(agingBucket),
        amount,
        dueDate: commitmentInfo.dueDate,
        overdueInvoices,
        lastPaymentDate,
        commitmentInfo,
        ciclosImpagos: commitmentInfo.ciclosImpagos,
        deudaAcumulada: commitmentInfo.deudaAcumulada,
        paymentBehavior: commitmentInfo.paymentBehavior,
        diasSinPago: commitmentInfo.diasSinPago,
      } satisfies PortfolioQueueServiceItem;
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.overdueInvoices !== a.overdueInvoices) return b.overdueInvoices - a.overdueInvoices;
      if (b.commitmentInfo.daysOverdue !== a.commitmentInfo.daysOverdue) {
        return b.commitmentInfo.daysOverdue - a.commitmentInfo.daysOverdue;
      }
      const amountDiff = (b.amount || 0) - (a.amount || 0);
      if (amountDiff !== 0) return amountDiff;
      return (b.service.saldo_pendiente || 0) - (a.service.saldo_pendiente || 0);
    });
}
