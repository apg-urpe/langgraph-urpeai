// Invoice types for the billing system

export type InvoiceStatus = 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'anulada';

export interface InvoiceItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Invoice {
  id: number;
  empresa_id: number;
  contacto_id: number;
  servicio_id?: number | null;
  pago_id?: number | null;
  
  // Numeración
  numero_factura: string;
  prefijo: string;
  secuencia: number;
  
  // Fechas
  fecha_emision: string;
  fecha_vencimiento?: string | null;
  
  // Cliente (snapshot al momento de facturar)
  cliente_nombre: string;
  cliente_email?: string | null;
  cliente_telefono?: string | null;
  cliente_direccion?: string | null;
  cliente_documento?: string | null;
  cliente_pais?: string | null;
  
  // Empresa (snapshot)
  empresa_nombre: string;
  empresa_direccion?: string | null;
  empresa_telefono?: string | null;
  empresa_email?: string | null;
  empresa_sitio_web?: string | null;
  empresa_logo_url?: string | null;
  empresa_documento?: string | null;
  
  // Items
  items: InvoiceItem[];
  
  // Totales
  moneda: string;
  subtotal: number;
  impuestos: number;
  descuentos: number;
  total: number;
  
  // Estado
  estado: InvoiceStatus;
  monto_pagado: number;
  saldo_pendiente: number;
  
  // Documentos
  pdf_url?: string | null;
  
  // Notas
  notas?: string | null;
  terminos?: string | null;
  metadata?: Record<string, unknown> | null;
  
  // Auditoría
  created_at: string;
  updated_at: string;
  created_by?: number | null;
}

export interface CreateInvoicePayload {
  empresa_id: number;
  contacto_id: number;
  servicio_id?: number;
  pago_id?: number;
  
  // Datos del cliente
  cliente_nombre: string;
  cliente_email?: string;
  cliente_telefono?: string;
  cliente_direccion?: string;
  cliente_documento?: string;
  cliente_pais?: string;
  
  // Items
  items: InvoiceItem[];
  
  // Configuración
  moneda?: string;
  fecha_vencimiento?: string;
  impuestos?: number;
  descuentos?: number;
  notas?: string;
  terminos?: string;
  
  // Opciones
  estado?: InvoiceStatus;
  generarPDF?: boolean;
  
  created_by?: number;
}

export interface UpdateInvoicePayload {
  estado?: InvoiceStatus;
  monto_pagado?: number;
  notas?: string;
  terminos?: string;
  fecha_vencimiento?: string;
  pdf_url?: string;
}

export interface InvoicePreviewData {
  invoice: Partial<Invoice>;
  contact: {
    nombre: string;
    apellido?: string;
    email?: string;
    telefono?: string;
  };
  enterprise: {
    nombre: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    sitioWeb?: string;
    logoUrl?: string;
    documento?: string;
  };
  service?: {
    nombre: string;
    valor_total: number;
    saldo_pagado: number;
    saldo_pendiente: number;
    moneda: string;
  };
}

// Status options with colors for UI
export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: 'borrador', label: 'Borrador', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
  { value: 'emitida', label: 'Emitida', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'pagada', label: 'Pagada', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'vencida', label: 'Vencida', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { value: 'anulada', label: 'Anulada', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
];

// Helper to get status config
export function getInvoiceStatusConfig(status: InvoiceStatus) {
  return INVOICE_STATUS_OPTIONS.find(s => s.value === status) || INVOICE_STATUS_OPTIONS[0];
}

// Helper to format currency
export function formatInvoiceCurrency(amount: number, currency: string = 'USD'): string {
  const symbols: Record<string, string> = {
    'USD': '$',
    'PEN': 'S/',
    'EUR': '€',
    'MXN': '$',
    'COP': '$',
    'ARS': '$',
    'CLP': '$',
    'BRL': 'R$',
  };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

// Helper to format date for display
export function formatInvoiceDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}
