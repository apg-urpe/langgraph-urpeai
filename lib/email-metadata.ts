export type EmailKind = 'marketing' | 'transactional';
export type ContactEmailDisplayKind = 'marketing' | 'payment_receipt';

type UnknownRecord = Record<string, unknown>;

export const MARKETING_EMAIL_OR_FILTER = 'metadata->>email_kind.is.null,metadata->>email_kind.eq.marketing';
export const TRANSACTIONAL_EMAIL_KIND_FIELD = 'metadata->>email_kind';
export const PAYMENT_RECEIPT_TYPE_FIELD = 'metadata->>transaction_type';
export const PAYMENT_RECEIPT_ID_FIELD = 'metadata->>payment_id';

export interface PaymentReceiptSnapshot {
  monto?: number | null;
  moneda?: string | null;
  fecha_pago?: string | null;
  metodo_pago?: string | null;
  referencia?: string | null;
  estado?: string | null;
  nota?: string | null;
}

export interface PaymentServiceSnapshot {
  nombre_servicio?: string | null;
  estado?: string | null;
  valor_total?: number | null;
  saldo_pagado?: number | null;
  saldo_pendiente?: number | null;
}

export interface PaymentReceiptEmailMetadata extends UnknownRecord {
  email_kind: 'transactional';
  transaction_type: 'payment_receipt';
  source_module?: string;
  payment_id: number;
  service_id?: number;
  comprobante_url?: string | null;
  template_version?: string;
  payment?: PaymentReceiptSnapshot;
  service?: PaymentServiceSnapshot;
}

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export function getEmailKind(metadata: unknown): EmailKind | 'legacy' {
  if (!isRecord(metadata)) {
    return 'legacy';
  }

  const kind = metadata.email_kind;
  if (kind === 'marketing' || kind === 'transactional') {
    return kind;
  }

  return 'legacy';
}

export function isTransactionalEmailMetadata(metadata: unknown): boolean {
  return getEmailKind(metadata) === 'transactional';
}

export function isMarketingEmailMetadata(metadata: unknown): boolean {
  return getEmailKind(metadata) !== 'transactional';
}

export function getContactEmailDisplayKind(metadata: unknown): ContactEmailDisplayKind | null {
  if (isPaymentReceiptEmailMetadata(metadata)) {
    return 'payment_receipt';
  }

  return isMarketingEmailMetadata(metadata) ? 'marketing' : null;
}

export function shouldIncludeInContactEmailList(metadata: unknown): boolean {
  return getContactEmailDisplayKind(metadata) !== null;
}

export function isPaymentReceiptEmailMetadata(metadata: unknown): metadata is PaymentReceiptEmailMetadata {
  if (!isRecord(metadata)) {
    return false;
  }

  return metadata.email_kind === 'transactional'
    && metadata.transaction_type === 'payment_receipt'
    && toNumber(metadata.payment_id) !== null;
}

export function matchesPaymentReceiptDraft(metadata: unknown, paymentId: number): boolean {
  if (!isPaymentReceiptEmailMetadata(metadata)) {
    return false;
  }

  return toNumber(metadata.payment_id) === paymentId;
}

export function getPaymentReceiptSummary(metadata: unknown) {
  if (!isPaymentReceiptEmailMetadata(metadata)) {
    return null;
  }

  const payment = isRecord(metadata.payment) ? metadata.payment : null;
  const service = isRecord(metadata.service) ? metadata.service : null;

  return {
    paymentId: toNumber(metadata.payment_id),
    serviceId: toNumber(metadata.service_id),
    comprobanteUrl: typeof metadata.comprobante_url === 'string' ? metadata.comprobante_url : null,
    monto: payment ? toNumber(payment.monto) : null,
    moneda: payment && typeof payment.moneda === 'string' ? payment.moneda : null,
    fechaPago: payment && typeof payment.fecha_pago === 'string' ? payment.fecha_pago : null,
    metodoPago: payment && typeof payment.metodo_pago === 'string' ? payment.metodo_pago : null,
    referencia: payment && typeof payment.referencia === 'string' ? payment.referencia : null,
    estado: payment && typeof payment.estado === 'string' ? payment.estado : null,
    serviceName: service && typeof service.nombre_servicio === 'string' ? service.nombre_servicio : null,
    serviceStatus: service && typeof service.estado === 'string' ? service.estado : null,
    saldoPendiente: service ? toNumber(service.saldo_pendiente) : null,
    saldoPagado: service ? toNumber(service.saldo_pagado) : null,
    valorTotal: service ? toNumber(service.valor_total) : null
  };
}
