# 📄 Sistema de Facturación Profesional - Plan de Implementación

> **Objetivo**: Generar facturas PDF profesionales directamente desde la zona de Cartera, tomando datos del perfil de empresa, contacto, servicios y pagos.

---

## 🎯 Visión General

### Características Principales
- ✅ **Generación de PDF con Puppeteer** (sin costos adicionales, mayor control)
- ✅ **Template HTML/CSS profesional** inspirado en facturas corporativas
- ✅ **Preview antes de generar** para validación visual
- ✅ **Storage en Supabase** con URLs firmadas
- ✅ **Multi-tenant seguro** con RLS
- ✅ **Numeración automática** por empresa
- ✅ **Estados de factura** (Borrador, Emitida, Pagada, Anulada)
- ✅ **Vinculación bidireccional** Factura ↔ Servicio/Pago

### Flujo de Usuario
```
Usuario en ServiceDetailModal → Botón "Generar Factura" → 
InvoicePreviewModal (preview + edición) → Confirmar → 
API /api/invoices/generate (Puppeteer) → PDF a Storage → 
Actualizar registro en wp_facturas → Mostrar PDF generado
```

---

## 📊 Arquitectura de Datos

### 1. Nueva Tabla: `wp_facturas`

```sql
CREATE TABLE IF NOT EXISTS wp_facturas (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL,
    contacto_id BIGINT NOT NULL,
    servicio_id BIGINT, -- Opcional: factura vinculada a servicio específico
    pago_id BIGINT, -- Opcional: factura vinculada a pago específico
    
    -- Numeración
    numero_factura VARCHAR(50) NOT NULL UNIQUE, -- Ej: INV-001234
    prefijo VARCHAR(10) DEFAULT 'INV', -- Configurable por empresa
    secuencia INTEGER NOT NULL, -- Auto-incrementa por empresa
    
    -- Fechas
    fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_vencimiento TIMESTAMP WITH TIME ZONE,
    
    -- Datos del Cliente (snapshot al momento de facturar)
    cliente_nombre TEXT NOT NULL,
    cliente_email TEXT,
    cliente_telefono TEXT,
    cliente_direccion TEXT,
    cliente_documento TEXT, -- NIT, RUT, DNI, etc.
    cliente_pais VARCHAR(50),
    
    -- Datos de la Empresa (snapshot)
    empresa_nombre TEXT NOT NULL,
    empresa_direccion TEXT,
    empresa_telefono TEXT,
    empresa_email TEXT,
    empresa_sitio_web TEXT,
    empresa_logo_url TEXT,
    empresa_documento TEXT, -- Tax ID
    
    -- Líneas de Factura (items)
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Estructura: [{ descripcion, cantidad, precio_unitario, subtotal }]
    
    -- Totales
    moneda VARCHAR(10) DEFAULT 'USD',
    subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
    impuestos DECIMAL(15, 2) DEFAULT 0,
    descuentos DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- Estado y Pago
    estado VARCHAR(20) DEFAULT 'emitida', -- 'borrador', 'emitida', 'pagada', 'vencida', 'anulada'
    monto_pagado DECIMAL(15, 2) DEFAULT 0,
    saldo_pendiente DECIMAL(15, 2) GENERATED ALWAYS AS (total - monto_pagado) STORED,
    
    -- Documentos
    pdf_url TEXT, -- URL del PDF generado en Storage
    
    -- Notas y Términos
    notas TEXT,
    terminos TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT, -- team_humano_id
    
    -- Constraints
    CONSTRAINT fk_facturas_empresa FOREIGN KEY (empresa_id) REFERENCES wp_empresa_perfil(id),
    CONSTRAINT fk_facturas_contacto FOREIGN KEY (contacto_id) REFERENCES wp_contactos(id) ON DELETE CASCADE,
    CONSTRAINT fk_facturas_servicio FOREIGN KEY (servicio_id) REFERENCES wp_crm_servicios(id) ON DELETE SET NULL,
    CONSTRAINT fk_facturas_pago FOREIGN KEY (pago_id) REFERENCES wp_crm_pagos(id) ON DELETE SET NULL,
    CONSTRAINT unique_numero_factura_empresa UNIQUE (empresa_id, numero_factura)
);

-- Índices
CREATE INDEX idx_facturas_empresa ON wp_facturas(empresa_id);
CREATE INDEX idx_facturas_contacto ON wp_facturas(contacto_id);
CREATE INDEX idx_facturas_servicio ON wp_facturas(servicio_id);
CREATE INDEX idx_facturas_numero ON wp_facturas(numero_factura);
CREATE INDEX idx_facturas_estado ON wp_facturas(estado);
CREATE INDEX idx_facturas_fecha ON wp_facturas(fecha_emision);

-- RLS
ALTER TABLE wp_facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Facturas visibles por empresa" ON wp_facturas
    FOR ALL
    USING (empresa_id = (SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1));
```

### 2. Función para Generar Número de Factura

```sql
CREATE OR REPLACE FUNCTION generate_invoice_number(p_empresa_id BIGINT, p_prefijo VARCHAR DEFAULT 'INV')
RETURNS VARCHAR AS $$
DECLARE
    v_secuencia INTEGER;
    v_numero VARCHAR;
BEGIN
    -- Obtener la siguiente secuencia para esta empresa
    SELECT COALESCE(MAX(secuencia), 0) + 1 INTO v_secuencia
    FROM wp_facturas
    WHERE empresa_id = p_empresa_id AND prefijo = p_prefijo;
    
    -- Formatear número: INV-001234 (6 dígitos)
    v_numero := p_prefijo || '-' || LPAD(v_secuencia::TEXT, 6, '0');
    
    RETURN v_numero;
END;
$$ LANGUAGE plpgsql;
```

### 3. Campos Adicionales en Tablas Existentes

```sql
-- Agregar campo factura_id a wp_crm_pagos (opcional, para tracking)
ALTER TABLE wp_crm_pagos ADD COLUMN IF NOT EXISTS factura_id BIGINT;
ALTER TABLE wp_crm_pagos ADD CONSTRAINT fk_pagos_factura 
    FOREIGN KEY (factura_id) REFERENCES wp_facturas(id) ON DELETE SET NULL;

-- Agregar campo ultima_factura_id a wp_crm_servicios (opcional)
ALTER TABLE wp_crm_servicios ADD COLUMN IF NOT EXISTS ultima_factura_id BIGINT;
```

---

## 🎨 Template HTML/CSS Profesional

### Diseño Inspirado en Urpe Integral Services

**Características del Template**:
- Header con logo de empresa + datos de contacto
- Sección "Billed To" con datos del cliente
- Detalles del documento (Número, Fecha Emisión, Vencimiento)
- Tabla de items con columnas: Descripción, Cantidad, Precio Unit., Subtotal
- Resumen financiero: Subtotal, Impuestos, Descuentos, **Total**
- Estado visual: Badge "PAID" / "PENDING" / "OVERDUE"
- Footer con términos y próximos pagos (si aplica)

**Archivo**: `lib/invoice-template.ts`

```typescript
export interface InvoiceTemplateData {
  // Empresa
  empresa: {
    nombre: string;
    direccion: string;
    telefono: string;
    email: string;
    sitioWeb: string;
    logoUrl?: string;
    documento?: string; // Tax ID
  };
  
  // Cliente
  cliente: {
    nombre: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    documento?: string;
    pais?: string;
  };
  
  // Documento
  numeroFactura: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  
  // Items
  items: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }>;
  
  // Totales
  moneda: string;
  subtotal: number;
  impuestos?: number;
  descuentos?: number;
  total: number;
  
  // Estado
  estado: 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'anulada';
  montoPagado?: number;
  saldoPendiente?: number;
  
  // Adicionales
  notas?: string;
  terminos?: string;
  proximoPago?: string; // Fecha
  totalAbonado?: number; // Para tracking de cartera
}

export function generateInvoiceHTML(data: InvoiceTemplateData): string {
  const currencySymbol = data.moneda === 'USD' ? '$' : data.moneda === 'PEN' ? 'S/' : '€';
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${data.numeroFactura}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1f2937;
      background: #ffffff;
      padding: 40px;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 40px;
      border-bottom: 2px solid #e5e7eb;
    }
    .logo-section {
      flex: 1;
    }
    .logo {
      max-width: 180px;
      height: auto;
      margin-bottom: 16px;
    }
    .company-info {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.6;
    }
    .invoice-details {
      text-align: right;
    }
    .invoice-number {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    .invoice-dates {
      font-size: 12px;
      color: #6b7280;
    }
    .invoice-dates div {
      margin-bottom: 4px;
    }
    .content {
      padding: 40px;
    }
    .billed-to {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #9ca3af;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .client-name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }
    .client-info {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.6;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table thead {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
    }
    .items-table th {
      padding: 12px 16px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.5px;
    }
    .items-table th:last-child,
    .items-table td:last-child {
      text-align: right;
    }
    .items-table tbody tr {
      border-bottom: 1px solid #f3f4f6;
    }
    .items-table td {
      padding: 16px;
      font-size: 14px;
      color: #374151;
    }
    .items-table td:first-child {
      font-weight: 500;
    }
    .summary {
      display: flex;
      justify-content: flex-end;
      margin-top: 32px;
    }
    .summary-box {
      min-width: 300px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .summary-row.total {
      border-top: 2px solid #e5e7eb;
      margin-top: 8px;
      padding-top: 16px;
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 16px;
    }
    .status-paid {
      background: #d1fae5;
      color: #065f46;
    }
    .status-pending {
      background: #fef3c7;
      color: #92400e;
    }
    .status-overdue {
      background: #fee2e2;
      color: #991b1b;
    }
    .footer {
      background: #f9fafb;
      padding: 24px 40px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
    .footer-section {
      margin-bottom: 16px;
    }
    .footer-title {
      font-weight: 600;
      color: #374151;
      margin-bottom: 4px;
    }
    @media print {
      body { padding: 0; }
      .invoice-container { border: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${data.empresa.logoUrl ? `<img src="${data.empresa.logoUrl}" alt="${data.empresa.nombre}" class="logo">` : `<h1 style="font-size: 20px; color: #111827;">${data.empresa.nombre}</h1>`}
        <div class="company-info">
          ${data.empresa.direccion ? `<div>${data.empresa.direccion}</div>` : ''}
          ${data.empresa.telefono ? `<div>Tel: ${data.empresa.telefono}</div>` : ''}
          ${data.empresa.email ? `<div>${data.empresa.email}</div>` : ''}
          ${data.empresa.sitioWeb ? `<div>${data.empresa.sitioWeb}</div>` : ''}
          ${data.empresa.documento ? `<div>Tax ID: ${data.empresa.documento}</div>` : ''}
        </div>
      </div>
      <div class="invoice-details">
        <div class="invoice-number">${data.numeroFactura}</div>
        <div class="invoice-dates">
          <div><strong>Fecha de Emisión:</strong> ${data.fechaEmision}</div>
          ${data.fechaVencimiento ? `<div><strong>Fecha de Vencimiento:</strong> ${data.fechaVencimiento}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <!-- Billed To -->
      <div class="billed-to">
        <div class="section-title">Facturado a</div>
        <div class="client-name">${data.cliente.nombre}</div>
        <div class="client-info">
          ${data.cliente.telefono ? `<div>${data.cliente.telefono}</div>` : ''}
          ${data.cliente.email ? `<div>${data.cliente.email}</div>` : ''}
          ${data.cliente.direccion ? `<div>${data.cliente.direccion}</div>` : ''}
          ${data.cliente.pais ? `<div>${data.cliente.pais}</div>` : ''}
          ${data.cliente.documento ? `<div>Doc: ${data.cliente.documento}</div>` : ''}
        </div>
      </div>

      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th>Descripción</th>
            <th style="width: 80px;">Cantidad</th>
            <th style="width: 120px;">Precio Unit.</th>
            <th style="width: 120px;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.descripcion}</td>
              <td>${item.cantidad}</td>
              <td>${currencySymbol}${item.precioUnitario.toFixed(2)}</td>
              <td>${currencySymbol}${item.subtotal.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Summary -->
      <div class="summary">
        <div class="summary-box">
          <div class="summary-row">
            <span>Subtotal:</span>
            <span>${currencySymbol}${data.subtotal.toFixed(2)}</span>
          </div>
          ${data.impuestos ? `
            <div class="summary-row">
              <span>Impuestos:</span>
              <span>${currencySymbol}${data.impuestos.toFixed(2)}</span>
            </div>
          ` : ''}
          ${data.descuentos ? `
            <div class="summary-row">
              <span>Descuentos:</span>
              <span>-${currencySymbol}${data.descuentos.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="summary-row total">
            <span>Total:</span>
            <span>${currencySymbol}${data.total.toFixed(2)}</span>
          </div>
          ${data.montoPagado !== undefined && data.montoPagado > 0 ? `
            <div class="summary-row" style="color: #059669;">
              <span>Monto Pagado:</span>
              <span>${currencySymbol}${data.montoPagado.toFixed(2)}</span>
            </div>
          ` : ''}
          ${data.saldoPendiente !== undefined && data.saldoPendiente > 0 ? `
            <div class="summary-row" style="color: #dc2626;">
              <span>Saldo Pendiente:</span>
              <span>${currencySymbol}${data.saldoPendiente.toFixed(2)}</span>
            </div>
          ` : ''}
          
          ${data.estado === 'pagada' ? '<div class="status-badge status-paid">PAGADA</div>' : ''}
          ${data.estado === 'emitida' ? '<div class="status-badge status-pending">PENDIENTE</div>' : ''}
          ${data.estado === 'vencida' ? '<div class="status-badge status-overdue">VENCIDA</div>' : ''}
        </div>
      </div>
    </div>

    <!-- Footer -->
    ${data.notas || data.terminos || data.proximoPago ? `
      <div class="footer">
        ${data.terminos ? `
          <div class="footer-section">
            <div class="footer-title">Términos y Condiciones</div>
            <div>${data.terminos}</div>
          </div>
        ` : ''}
        ${data.notas ? `
          <div class="footer-section">
            <div class="footer-title">Notas</div>
            <div>${data.notas}</div>
          </div>
        ` : ''}
        ${data.proximoPago || data.totalAbonado !== undefined ? `
          <div class="footer-section">
            <div class="footer-title">Estado de Cuenta</div>
            ${data.proximoPago ? `<div>Próximo Pago: ${data.proximoPago}</div>` : ''}
            ${data.totalAbonado !== undefined ? `<div>Total Abonado: ${currencySymbol}${data.totalAbonado.toFixed(2)}</div>` : ''}
            ${data.saldoPendiente !== undefined ? `<div>Saldo Pendiente: ${currencySymbol}${data.saldoPendiente.toFixed(2)}</div>` : ''}
          </div>
        ` : ''}
      </div>
    ` : ''}
  </div>
</body>
</html>
  `;
}
```

---

## 🔧 Implementación Backend

### 1. Tipos TypeScript

**Archivo**: `types/invoice.ts`

```typescript
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
  
  // Cliente (snapshot)
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
  
  // Datos del cliente (se pueden pre-llenar desde contacto)
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
  estado?: InvoiceStatus; // Default: 'borrador'
  generarPDF?: boolean; // Si true, genera PDF inmediatamente
  
  created_by?: number;
}

export interface InvoicePreviewData {
  // Todos los datos necesarios para el preview
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
  };
  service?: {
    nombre: string;
    valor_total: number;
    saldo_pagado: number;
    saldo_pendiente: number;
  };
}

// Helpers
export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: 'borrador', label: 'Borrador', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
  { value: 'emitida', label: 'Emitida', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'pagada', label: 'Pagada', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'vencida', label: 'Vencida', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { value: 'anulada', label: 'Anulada', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
];
```

### 2. API Route para Generación

**Archivo**: `app/api/invoices/generate/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { supabase } from '@/lib/supabase-client';
import { generateInvoiceHTML, InvoiceTemplateData } from '@/lib/invoice-template';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 30; // 30 segundos max

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { invoiceId, templateData } = payload as {
      invoiceId: number;
      templateData: InvoiceTemplateData;
    };

    // 1. Generar HTML
    const html = generateInvoiceHTML(templateData);

    // 2. Generar PDF con Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await browser.close();

    // 3. Subir a Supabase Storage
    const fileName = `${templateData.numeroFactura}_${Date.now()}.pdf`;
    const filePath = `facturas/${templateData.empresa.nombre.replace(/\s+/g, '_')}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('facturas')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 4. Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('facturas')
      .getPublicUrl(filePath);

    // 5. Actualizar registro en wp_facturas
    const { error: updateError } = await supabase
      .from('wp_facturas')
      .update({
        pdf_url: publicUrl,
        estado: 'emitida', // Cambiar de borrador a emitida
        updated_at: new Date().toISOString()
      })
      .eq('id', invoiceId);

    if (updateError) throw updateError;

    logger.info(`[Invoice] PDF generado exitosamente: ${templateData.numeroFactura}`);

    return NextResponse.json({
      success: true,
      pdfUrl: publicUrl,
      invoiceId
    });

  } catch (error: any) {
    logger.error('[Invoice] Error generando PDF:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error generando factura' },
      { status: 500 }
    );
  }
}
```

### 3. Store de Facturas

**Archivo**: `store/invoiceStore.ts`

```typescript
import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { Invoice, CreateInvoicePayload, InvoiceStatus } from '../types/invoice';

interface InvoiceState {
  invoices: Invoice[];
  selectedInvoice: Invoice | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  // Actions
  fetchInvoicesByContact: (contactId: number, empresaId: number) => Promise<void>;
  fetchInvoicesByService: (serviceId: number) => Promise<void>;
  createInvoice: (payload: CreateInvoicePayload) => Promise<Invoice | null>;
  generateInvoicePDF: (invoiceId: number) => Promise<string | null>;
  updateInvoiceStatus: (invoiceId: number, status: InvoiceStatus) => Promise<boolean>;
  deleteInvoice: (invoiceId: number) => Promise<boolean>;
  setSelectedInvoice: (invoice: Invoice | null) => void;
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  selectedInvoice: null,
  isLoading: false,
  isGenerating: false,
  error: null,

  fetchInvoicesByContact: async (contactId: number, empresaId: number) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wp_facturas')
        .select('*')
        .eq('contacto_id', contactId)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ invoices: data || [], isLoading: false });
    } catch (err: any) {
      logger.error('[InvoiceStore] Error fetching invoices:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  fetchInvoicesByService: async (serviceId: number) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wp_facturas')
        .select('*')
        .eq('servicio_id', serviceId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ invoices: data || [], isLoading: false });
    } catch (err: any) {
      logger.error('[InvoiceStore] Error fetching invoices:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  createInvoice: async (payload: CreateInvoicePayload) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Generar número de factura
      const { data: numeroData, error: numeroError } = await supabase
        .rpc('generate_invoice_number', {
          p_empresa_id: payload.empresa_id,
          p_prefijo: 'INV'
        });

      if (numeroError) throw numeroError;

      const numeroFactura = numeroData as string;

      // 2. Calcular totales
      const subtotal = payload.items.reduce((sum, item) => sum + item.subtotal, 0);
      const impuestos = payload.impuestos || 0;
      const descuentos = payload.descuentos || 0;
      const total = subtotal + impuestos - descuentos;

      // 3. Obtener datos de empresa para snapshot
      const { data: empresaData } = await supabase
        .from('wp_empresa_perfil')
        .select('nombre, direccion, telefono, email, sitio_web, logo_url')
        .eq('id', payload.empresa_id)
        .single();

      // 4. Crear factura
      const { data, error } = await supabase
        .from('wp_facturas')
        .insert([{
          empresa_id: payload.empresa_id,
          contacto_id: payload.contacto_id,
          servicio_id: payload.servicio_id,
          pago_id: payload.pago_id,
          numero_factura: numeroFactura,
          prefijo: 'INV',
          secuencia: parseInt(numeroFactura.split('-')[1]),
          fecha_emision: new Date().toISOString(),
          fecha_vencimiento: payload.fecha_vencimiento,
          cliente_nombre: payload.cliente_nombre,
          cliente_email: payload.cliente_email,
          cliente_telefono: payload.cliente_telefono,
          cliente_direccion: payload.cliente_direccion,
          cliente_documento: payload.cliente_documento,
          cliente_pais: payload.cliente_pais,
          empresa_nombre: empresaData?.nombre || '',
          empresa_direccion: empresaData?.direccion,
          empresa_telefono: empresaData?.telefono,
          empresa_email: empresaData?.email,
          empresa_sitio_web: empresaData?.sitio_web,
          empresa_logo_url: empresaData?.logo_url,
          items: payload.items,
          moneda: payload.moneda || 'USD',
          subtotal,
          impuestos,
          descuentos,
          total,
          estado: payload.estado || 'borrador',
          monto_pagado: 0,
          notas: payload.notas,
          terminos: payload.terminos,
          created_by: payload.created_by
        }])
        .select()
        .single();

      if (error) throw error;

      const newInvoice = data as Invoice;

      // 5. Si se solicita generar PDF inmediatamente
      if (payload.generarPDF) {
        await get().generateInvoicePDF(newInvoice.id);
      }

      set(state => ({
        invoices: [newInvoice, ...state.invoices],
        isLoading: false
      }));

      return newInvoice;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error creating invoice:', err);
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  generateInvoicePDF: async (invoiceId: number) => {
    set({ isGenerating: true, error: null });
    try {
      // Obtener factura completa
      const { data: invoice, error: fetchError } = await supabase
        .from('wp_facturas')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (fetchError) throw fetchError;

      // Preparar datos para template
      const templateData = {
        empresa: {
          nombre: invoice.empresa_nombre,
          direccion: invoice.empresa_direccion || '',
          telefono: invoice.empresa_telefono || '',
          email: invoice.empresa_email || '',
          sitioWeb: invoice.empresa_sitio_web || '',
          logoUrl: invoice.empresa_logo_url,
          documento: invoice.empresa_documento
        },
        cliente: {
          nombre: invoice.cliente_nombre,
          email: invoice.cliente_email,
          telefono: invoice.cliente_telefono,
          direccion: invoice.cliente_direccion,
          documento: invoice.cliente_documento,
          pais: invoice.cliente_pais
        },
        numeroFactura: invoice.numero_factura,
        fechaEmision: new Date(invoice.fecha_emision).toLocaleDateString('es-ES'),
        fechaVencimiento: invoice.fecha_vencimiento 
          ? new Date(invoice.fecha_vencimiento).toLocaleDateString('es-ES')
          : undefined,
        items: invoice.items,
        moneda: invoice.moneda,
        subtotal: invoice.subtotal,
        impuestos: invoice.impuestos,
        descuentos: invoice.descuentos,
        total: invoice.total,
        estado: invoice.estado,
        montoPagado: invoice.monto_pagado,
        saldoPendiente: invoice.saldo_pendiente,
        notas: invoice.notas,
        terminos: invoice.terminos
      };

      // Llamar a API para generar PDF
      const response = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, templateData })
      });

      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      set({ isGenerating: false });
      return result.pdfUrl;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error generating PDF:', err);
      set({ error: err.message, isGenerating: false });
      return null;
    }
  },

  updateInvoiceStatus: async (invoiceId: number, status: InvoiceStatus) => {
    try {
      const { error } = await supabase
        .from('wp_facturas')
        .update({ estado: status, updated_at: new Date().toISOString() })
        .eq('id', invoiceId);

      if (error) throw error;

      set(state => ({
        invoices: state.invoices.map(inv => 
          inv.id === invoiceId ? { ...inv, estado: status } : inv
        )
      }));

      return true;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error updating status:', err);
      return false;
    }
  },

  deleteInvoice: async (invoiceId: number) => {
    try {
      const { error } = await supabase
        .from('wp_facturas')
        .delete()
        .eq('id', invoiceId);

      if (error) throw error;

      set(state => ({
        invoices: state.invoices.filter(inv => inv.id !== invoiceId)
      }));

      return true;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error deleting invoice:', err);
      return false;
    }
  },

  setSelectedInvoice: (invoice: Invoice | null) => {
    set({ selectedInvoice: invoice });
  }
}));
```

---

## 🎨 Componentes UI

### 1. Modal de Preview

**Archivo**: `components/admin/invoices/InvoicePreviewModal.tsx`

- Preview HTML del template antes de generar
- Edición inline de items, notas, términos
- Botón "Generar PDF" que llama al API
- Loading state durante generación
- Descarga automática al completar

### 2. Botón en ServiceDetailModal

**Modificación**: `components/admin/contact-details/ServiceDetailModal.tsx`

```typescript
// Agregar botón "Generar Factura" en el footer
<button
  onClick={() => setShowInvoicePreview(true)}
  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
             bg-blue-500/10 text-blue-400 border border-blue-500/20
             hover:bg-blue-500/20 transition-colors"
>
  <FileText className="w-4 h-4" />
  Generar Factura
</button>
```

### 3. Lista de Facturas

**Archivo**: `components/admin/invoices/InvoicesList.tsx`

- Vista de todas las facturas del contacto
- Filtros por estado
- Descarga de PDFs
- Cambio de estado rápido

---

## 📦 Dependencias Necesarias

```bash
npm install puppeteer
npm install @types/puppeteer --save-dev
```

---

## 🔐 Configuración de Storage

### Bucket: `facturas`

```sql
-- Crear bucket (ejecutar en Supabase Dashboard)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('facturas', 'facturas', true);

-- Políticas RLS
CREATE POLICY "Usuarios pueden subir sus facturas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'facturas' AND
  (storage.foldername(name))[1] = (
    SELECT nombre FROM wp_empresa_perfil 
    WHERE id = (SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "Usuarios pueden ver sus facturas"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'facturas' AND
  (storage.foldername(name))[1] = (
    SELECT nombre FROM wp_empresa_perfil 
    WHERE id = (SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1)
  )
);
```

---

## 📋 Checklist de Implementación

### Fase 1: Base de Datos (1 día)
- [ ] Ejecutar `INVOICING_SCHEMA.sql` en Supabase
- [ ] Crear función `generate_invoice_number`
- [ ] Configurar bucket `facturas` con RLS
- [ ] Probar inserción manual de factura

### Fase 2: Backend (2 días)
- [ ] Crear `types/invoice.ts`
- [ ] Implementar `lib/invoice-template.ts`
- [ ] Crear API Route `/api/invoices/generate`
- [ ] Implementar `store/invoiceStore.ts`
- [ ] Probar generación de PDF end-to-end

### Fase 3: UI (2 días)
- [ ] Crear `InvoicePreviewModal.tsx`
- [ ] Modificar `ServiceDetailModal.tsx` (botón)
- [ ] Crear `InvoicesList.tsx`
- [ ] Integrar con `ContactServices.tsx`

### Fase 4: Testing y Polish (1 día)
- [ ] Probar con diferentes monedas
- [ ] Validar multi-tenant
- [ ] Optimizar template para impresión
- [ ] Documentar flujo completo

---

## 🎯 Casos de Uso

### 1. Facturar Servicio Completo
Usuario en `ServiceDetailModal` → "Generar Factura" → Preview con datos del servicio → Confirmar → PDF generado

### 2. Facturar Pago Específico
Usuario en historial de pagos → Click en pago → "Generar Recibo" → PDF con detalles del abono

### 3. Factura Personalizada
Usuario crea factura manual con items custom → Preview → Generar → Enviar por email

---

## 📚 Documentación Adicional

- **Puppeteer**: https://pptr.dev/
- **Supabase Storage**: https://supabase.com/docs/guides/storage
- **HTML to PDF Best Practices**: https://www.smashingmagazine.com/2015/01/designing-for-print-with-css/

---

**Última actualización**: Enero 2026
**Versión**: 1.0
**Autor**: Tony - Urpe AI Lab Dev Team
