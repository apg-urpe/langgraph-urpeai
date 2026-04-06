// Finance types based on wp_crm_servicios and wp_crm_pagos schema

// ============================================================================
// TIPOS DE SERVICIO
// ============================================================================

export type ServiceStatus = 'activo' | 'finalizado' | 'cancelado' | 'pendiente_pago';
export type ServiceType = 'consultoria' | 'suscripcion' | 'implementacion' | 'desarrollo' | 'soporte' | 'general';

export interface Service {
  id: number;
  empresa_id: number;
  contacto_id: number;
  
  // Detalles del servicio
  nombre_servicio: string;
  tipo_servicio: ServiceType | string;
  descripcion?: string | null;
  
  // Valores financieros
  moneda: string;
  valor_total: number;
  saldo_pagado: number;
  saldo_pendiente: number; // Campo calculado (valor_total - saldo_pagado)
  cuota_mensual?: number | null;
  dia_compromiso_pago?: number | null;
  
  // Estado y fechas
  estado: ServiceStatus;
  fecha_inicio: string;
  fecha_fin?: string | null;
  
  // Documentación
  contrato_url?: string | null;
  metadata?: Record<string, unknown> | null;
  
  // Auditoría
  created_at: string;
  updated_at: string;
  created_by?: number | null;
}

export interface CreateServicePayload {
  empresa_id: number;
  contacto_id: number;
  nombre_servicio: string;
  tipo_servicio?: string;
  descripcion?: string;
  moneda?: string;
  valor_total: number;
  cuota_mensual?: number | null;
  estado?: ServiceStatus;
  fecha_inicio?: string;
  fecha_fin?: string;
  dia_compromiso_pago?: number | null;
  contrato_url?: string;
  metadata?: Record<string, unknown>;
  created_by?: number;
}

export interface UpdateServicePayload {
  nombre_servicio?: string;
  tipo_servicio?: string;
  descripcion?: string;
  moneda?: string;
  valor_total?: number;
  cuota_mensual?: number | null;
  estado?: ServiceStatus;
  fecha_inicio?: string;
  fecha_fin?: string;
  dia_compromiso_pago?: number | null;
  contrato_url?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TIPOS DE PAGO
// ============================================================================

export type PaymentStatus = 'confirmado' | 'pendiente' | 'rechazado' | 'anulado';
export type PaymentMethod = 'transferencia' | 'tarjeta' | 'efectivo' | 'yape' | 'plin' | 'paypal' | 'fanbasis' | 'payoneer' | 'otro';

export interface Payment {
  id: number;
  empresa_id: number;
  servicio_id: number;
  contacto_id: number;
  
  // Detalles del pago
  monto: number;
  moneda: string;
  fecha_pago: string;
  metodo_pago?: PaymentMethod | string | null;
  referencia?: string | null;
  
  // Estado
  estado: PaymentStatus;
  nota?: string | null;
  
  // Comprobante
  comprobante_url?: string | null;
  metadata?: Record<string, unknown> | null;
  
  // Auditoría
  created_at: string;
  updated_at: string;
  registrado_por?: number | null;
  
  // Relación expandida (opcional, para joins)
  registrador?: {
    id: number;
    nombre: string;
    apellido?: string;
  } | null;
}

export interface CreatePaymentPayload {
  empresa_id: number;
  servicio_id: number;
  contacto_id: number;
  monto: number;
  moneda?: string;
  fecha_pago?: string;
  metodo_pago?: string;
  referencia?: string;
  estado?: PaymentStatus;
  nota?: string;
  comprobante_url?: string;
  metadata?: Record<string, unknown>;
  registrado_por?: number;
}

export interface UpdatePaymentPayload {
  monto?: number;
  fecha_pago?: string;
  metodo_pago?: string;
  referencia?: string;
  estado?: PaymentStatus;
  nota?: string;
  comprobante_url?: string | null;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// MÉTODOS DE PAGO PERSONALIZADOS
// ============================================================================

export interface CustomPaymentMethod {
  id: number;
  empresa_id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  icono?: string | null;
  is_active: boolean;
  orden: number;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  created_by?: number | null;
}

export interface CreatePaymentMethodPayload {
  empresa_id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  icono?: string;
  orden?: number;
  created_by?: number;
}

export interface UpdatePaymentMethodPayload {
  nombre?: string;
  descripcion?: string;
  icono?: string;
  is_active?: boolean;
  orden?: number;
}

export interface PaymentMethodOption {
  value: string;
  label: string;
  isCustom?: boolean;
  icono?: string;
}

// ============================================================================
// TIPOS DE RESUMEN / MÉTRICAS
// ============================================================================

export interface ContactFinanceSummary {
  totalContratado: number;
  totalPagado: number;
  totalPendiente: number;
  serviciosActivos: number;
  serviciosCompletados: number;
  moneda: string; // Moneda predominante
}

export interface ServiceWithPayments extends Service {
  pagos: Payment[];
  porcentajePagado: number; // 0-100
}

export type ServiceCommitmentStatus = 'sin_configurar' | 'pagado' | 'al_dia' | 'vence_hoy' | 'en_mora';
export type PortfolioAgingBucket = 'sin_configurar' | 'al_dia' | 'vence_hoy' | 'de_1_a_7' | 'de_8_a_30' | 'mas_de_30';
export type PaymentBehavior = 'activo' | 'irregular' | 'inactivo' | 'sin_pagos';

export interface ServiceCommitmentInfo {
  // Campos existentes (backward compatible)
  configuredDay: number | null;
  dueDate: Date | null;              // Próximo vencimiento operativo (basado en último pago)
  currentCommitmentAmount: number;
  daysOverdue: number;               // Mora operativa (basada en recencia de pago)
  status: ServiceCommitmentStatus;

  // Deuda acumulada
  ciclosImpagos: number;             // Ciclos mensuales no cubiertos
  deudaAcumulada: number;            // ciclosImpagos * cuota_mensual

  // Comportamiento de pago
  lastPaymentDate: Date | null;      // Fecha del último pago confirmado
  diasSinPago: number;               // Días desde último pago confirmado
  paymentBehavior: PaymentBehavior;  // Clasificación: activo | irregular | inactivo | sin_pagos

  // Auditoría (cálculo estructural anterior)
  fechaVencimientoEstructural: Date | null;
  moraEstructural: number;           // Días mora por cálculo acumulado histórico
}

// ============================================================================
// CONSTANTES Y HELPERS
// ============================================================================

export const SERVICE_STATUS_OPTIONS: { value: ServiceStatus; label: string; color: string }[] = [
  { value: 'activo', label: 'Activo', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'pendiente_pago', label: 'Pendiente de Pago', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'finalizado', label: 'Finalizado', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'cancelado', label: 'Cancelado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
];

export const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: 'consultoria', label: 'Consultoría' },
  { value: 'suscripcion', label: 'Suscripción' },
  { value: 'implementacion', label: 'Implementación' },
  { value: 'desarrollo', label: 'Desarrollo' },
  { value: 'soporte', label: 'Soporte' },
  { value: 'general', label: 'General' },
];

export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string; color: string }[] = [
  { value: 'confirmado', label: 'Confirmado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'pendiente', label: 'Pendiente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'rechazado', label: 'Rechazado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { value: 'anulado', label: 'Anulado', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
];

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia Bancaria' },
  { value: 'tarjeta', label: 'Tarjeta de Crédito/Débito' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'fanbasis', label: 'Fanbasis' },
  { value: 'payoneer', label: 'Payoneer' },
  { value: 'otro', label: 'Otro' },
];

export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD ($)', symbol: '$' },
  { value: 'PEN', label: 'PEN (S/)', symbol: 'S/' },
  { value: 'EUR', label: 'EUR (€)', symbol: '€' },
  { value: 'MXN', label: 'MXN ($)', symbol: '$' },
  { value: 'COP', label: 'COP ($)', symbol: '$' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeReferenceDate = (input: Date): Date => {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 12, 0, 0, 0);
};

const getMonthCommitmentDate = (year: number, monthIndex: number, commitmentDay: number): Date => {
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(Math.max(commitmentDay, 1), maxDay);
  return new Date(year, monthIndex, safeDay, 12, 0, 0, 0);
};

const parseServiceDate = (input?: string | null): Date | null => {
  if (!input) return null;

  const isoDateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const monthIndex = Number(isoDateMatch[2]) - 1;
    const day = Number(isoDateMatch[3]);
    return new Date(year, monthIndex, day, 12, 0, 0, 0);
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return normalizeReferenceDate(parsed);
};

const getFirstCommitmentDate = (startDate: Date, commitmentDay: number): Date => {
  const monthOffset = startDate.getDate() < commitmentDay ? 0 : 1;
  return getMonthCommitmentDate(startDate.getFullYear(), startDate.getMonth() + monthOffset, commitmentDay);
};

const countConfirmedPayments = (payments?: Pick<Payment, 'estado'>[] | null): number => {
  return (payments || []).filter(payment => payment.estado === 'confirmado').length;
};

const findLastConfirmedPaymentDate = (payments?: Pick<Payment, 'estado' | 'fecha_pago'>[] | null): Date | null => {
  return (payments || [])
    .filter(p => p.estado === 'confirmado' && Boolean(p.fecha_pago))
    .map(p => {
      const d = parseServiceDate(p.fecha_pago);
      return d && !Number.isNaN(d.getTime()) ? d : null;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
};

const monthDiff = (from: Date, to: Date): number => {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
};

const classifyPaymentBehavior = (diasSinPago: number, hasPayments: boolean): PaymentBehavior => {
  if (!hasPayments) return 'sin_pagos';
  if (diasSinPago <= 45) return 'activo';
  if (diasSinPago <= 90) return 'irregular';
  return 'inactivo';
};

export function formatCommitmentDayLabel(day?: number | null): string {
  if (!day) return 'Sin definir';
  return `Día ${Math.min(Math.max(day, 1), 31)}`;
}

export function getLastConfirmedPaymentDate(payments?: Payment[] | null): Date | null {
  return (payments || [])
    .filter(payment => payment.estado === 'confirmado' && Boolean(payment.fecha_pago))
    .map(payment => new Date(payment.fecha_pago))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

export function getServiceCommitmentInfo(
  service: Pick<Service, 'dia_compromiso_pago' | 'cuota_mensual' | 'saldo_pendiente' | 'saldo_pagado' | 'fecha_inicio'> & { pagos?: Pick<Payment, 'estado' | 'fecha_pago'>[] | null },
  referenceDate = new Date()
): ServiceCommitmentInfo {
  const configuredDay = service.dia_compromiso_pago ?? null;
  const pendingBalance = Math.max(0, Number(service.saldo_pendiente || 0));
  const paidBalance = Math.max(0, Number(service.saldo_pagado || 0));
  const monthlyInstallment = service.cuota_mensual && service.cuota_mensual > 0
    ? Number(service.cuota_mensual)
    : null;
  const baseCommitmentAmount = monthlyInstallment ?? pendingBalance;
  const currentCommitmentAmount = Math.max(
    0,
    Math.min(baseCommitmentAmount || 0, pendingBalance || baseCommitmentAmount || 0)
  );

  const today = normalizeReferenceDate(referenceDate);
  const startDate = parseServiceDate(service.fecha_inicio);
  const lastPaymentDate = findLastConfirmedPaymentDate(service.pagos);
  const hasPayments = lastPaymentDate !== null;

  // Campos por defecto para nuevas métricas
  const defaultNewFields = {
    ciclosImpagos: 0,
    deudaAcumulada: 0,
    lastPaymentDate: lastPaymentDate,
    diasSinPago: lastPaymentDate ? Math.max(0, Math.floor((today.getTime() - lastPaymentDate.getTime()) / DAY_MS)) : 0,
    paymentBehavior: classifyPaymentBehavior(
      lastPaymentDate ? Math.max(0, Math.floor((today.getTime() - lastPaymentDate.getTime()) / DAY_MS)) : 0,
      hasPayments
    ),
    fechaVencimientoEstructural: null as Date | null,
    moraEstructural: 0,
  };

  // Early exit: servicio pagado
  if (pendingBalance <= 0) {
    return {
      configuredDay,
      dueDate: configuredDay
        ? getMonthCommitmentDate(today.getFullYear(), today.getMonth(), configuredDay)
        : null,
      currentCommitmentAmount: 0,
      daysOverdue: 0,
      status: 'pagado',
      ...defaultNewFields,
      paymentBehavior: hasPayments ? 'activo' : 'sin_pagos',
    };
  }

  // Early exit: sin compromiso configurado
  if (!configuredDay) {
    return {
      configuredDay: null,
      dueDate: null,
      currentCommitmentAmount,
      daysOverdue: 0,
      status: 'sin_configurar',
      ...defaultNewFields,
    };
  }

  // --- Cálculo estructural (preservar lógica anterior para auditoría) ---
  const firstDueDate = startDate
    ? getFirstCommitmentDate(startDate, configuredDay)
    : getMonthCommitmentDate(today.getFullYear(), today.getMonth(), configuredDay);
  const coveredCycles = monthlyInstallment
    ? Math.max(0, Math.floor(paidBalance / monthlyInstallment))
    : countConfirmedPayments(service.pagos);
  const fechaVencimientoEstructural = getMonthCommitmentDate(
    firstDueDate.getFullYear(),
    firstDueDate.getMonth() + coveredCycles,
    configuredDay
  );
  const moraEstructuralMs = today.getTime() - fechaVencimientoEstructural.getTime();
  const moraEstructural = moraEstructuralMs > 0 ? Math.floor(moraEstructuralMs / DAY_MS) : 0;

  // --- Ciclos impagos (deuda acumulada) ---
  const elapsedMonths = today.getTime() >= firstDueDate.getTime()
    ? Math.max(0, monthDiff(firstDueDate, today) + (today.getDate() >= configuredDay ? 1 : 0))
    : 0;
  const ciclosImpagos = Math.max(0, elapsedMonths - coveredCycles);
  const deudaAcumulada = monthlyInstallment
    ? ciclosImpagos * monthlyInstallment
    : pendingBalance;

  // --- Mora operativa (basada en último pago) ---
  let operationalDueDate: Date;
  const effectiveStart = startDate ?? firstDueDate;
  if (lastPaymentDate && lastPaymentDate.getTime() >= effectiveStart.getTime()) {
    // Un pago siempre cubre el ciclo del mes en que se hizo.
    // Próximo vencimiento = día de compromiso del mes siguiente al pago.
    operationalDueDate = getMonthCommitmentDate(
      lastPaymentDate.getFullYear(),
      lastPaymentDate.getMonth() + 1,
      configuredDay
    );
  } else {
    // Sin pagos o pago anterior al inicio: usar primera fecha de vencimiento
    operationalDueDate = firstDueDate;
  }

  const operationalDiffMs = today.getTime() - operationalDueDate.getTime();
  const daysOverdue = operationalDiffMs > 0 ? Math.floor(operationalDiffMs / DAY_MS) : 0;

  // --- Días sin pago ---
  const diasSinPago = lastPaymentDate
    ? Math.max(0, Math.floor((today.getTime() - lastPaymentDate.getTime()) / DAY_MS))
    : (today.getTime() >= firstDueDate.getTime()
      ? Math.floor((today.getTime() - firstDueDate.getTime()) / DAY_MS)
      : 0);
  const paymentBehavior = classifyPaymentBehavior(diasSinPago, hasPayments);

  // --- Determinar status ---
  let status: ServiceCommitmentStatus;
  if (operationalDiffMs === 0) {
    status = 'vence_hoy';
  } else if (operationalDiffMs > 0) {
    status = 'en_mora';
  } else {
    status = 'al_dia';
  }

  return {
    configuredDay,
    dueDate: operationalDueDate,
    currentCommitmentAmount,
    daysOverdue,
    status,
    ciclosImpagos,
    deudaAcumulada,
    lastPaymentDate,
    diasSinPago,
    paymentBehavior,
    fechaVencimientoEstructural,
    moraEstructural,
  };
}

export function getPortfolioAgingBucket(commitmentInfo: ServiceCommitmentInfo): PortfolioAgingBucket {
  if (commitmentInfo.status === 'sin_configurar') return 'sin_configurar';
  if (commitmentInfo.status === 'pagado' || commitmentInfo.status === 'al_dia') return 'al_dia';
  if (commitmentInfo.status === 'vence_hoy') return 'vence_hoy';
  if (commitmentInfo.daysOverdue <= 7) return 'de_1_a_7';
  if (commitmentInfo.daysOverdue <= 30) return 'de_8_a_30';
  return 'mas_de_30';
}

export function getPortfolioAgingLabel(bucket: PortfolioAgingBucket): string {
  switch (bucket) {
    case 'sin_configurar':
      return 'Sin compromiso';
    case 'al_dia':
      return 'Al día';
    case 'vence_hoy':
      return 'Vence hoy';
    case 'de_1_a_7':
      return '1-7 días';
    case 'de_8_a_30':
      return '8-30 días';
    case 'mas_de_30':
      return '31+ días';
    default:
      return 'Al día';
  }
}

// Helper para formatear moneda
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const currencyInfo = CURRENCY_OPTIONS.find(c => c.value === currency);
  const symbol = currencyInfo?.symbol || '$';
  return `${symbol}${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Helper para obtener color de estado de servicio
export function getServiceStatusColor(status: ServiceStatus): string {
  return SERVICE_STATUS_OPTIONS.find(s => s.value === status)?.color || 'text-zinc-400';
}

// Helper para obtener color de estado de pago
export function getPaymentStatusColor(status: PaymentStatus): string {
  return PAYMENT_STATUS_OPTIONS.find(s => s.value === status)?.color || 'text-zinc-400';
}

// Helper para calcular porcentaje pagado
export function calculatePaymentPercentage(service: Service): number {
  if (service.valor_total <= 0) return 0;
  return Math.min(100, Math.round((service.saldo_pagado / service.valor_total) * 100));
}
