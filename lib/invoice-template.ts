// Invoice HTML template generator for PDF generation

export interface InvoiceTemplateData {
  // Empresa
  empresa: {
    nombre: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    sitioWeb?: string;
    logoUrl?: string;
    documento?: string;
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
  proximoPago?: string;
  totalAbonado?: number;

  // Logo as base64 data URL (set by pdf-generator before rendering)
  _logoBase64?: string;
}

export function getCurrencySymbol(currency: string): string {
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
  return symbols[currency] || currency + ' ';
}

function getStatusStyle(estado: string): { bg: string; color: string; label: string } {
  switch (estado) {
    case 'pagada':   return { bg: '#d1fae5', color: '#065f46', label: 'PAGADA' };
    case 'emitida':  return { bg: '#dbeafe', color: '#1e40af', label: 'PENDIENTE' };
    case 'vencida':  return { bg: '#fee2e2', color: '#991b1b', label: 'VENCIDA' };
    case 'borrador': return { bg: '#f3f4f6', color: '#4b5563', label: 'BORRADOR' };
    case 'anulada':  return { bg: '#fef3c7', color: '#92400e', label: 'ANULADA' };
    default:         return { bg: '#f3f4f6', color: '#4b5563', label: estado.toUpperCase() };
  }
}

export function generateInvoiceHTML(data: InvoiceTemplateData): string {
  const cs = getCurrencySymbol(data.moneda);
  const fmt = (n: number) => n.toFixed(2);
  const status = getStatusStyle(data.estado);
  const logoSrc = data._logoBase64 || data.empresa.logoUrl || '';
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${data.numeroFactura}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1a1a2e;
      background: #fff;
      font-size: 13px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      max-width: 794px;
      margin: 0 auto;
      background: #fff;
    }

    /* ── Accent bar ── */
    .accent-bar {
      height: 4px;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 36px 40px 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      width: 52px;
      height: 52px;
      border-radius: 10px;
      object-fit: contain;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .brand-fallback {
      width: 52px;
      height: 52px;
      border-radius: 10px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 20px;
    }
    .brand-text h1 {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }
    .brand-text p {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #94a3b8;
    }
    .invoice-num {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin: 2px 0 10px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: auto auto;
      gap: 3px 16px;
      font-size: 11.5px;
    }
    .meta-label { color: #94a3b8; text-align: right; }
    .meta-value { color: #334155; font-weight: 500; text-align: right; }
    .status-pill {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 8px;
      background: ${status.bg};
      color: ${status.color};
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 0 40px;
    }

    /* ── Parties row ── */
    .parties {
      display: flex;
      gap: 40px;
      padding: 24px 40px;
    }
    .party { flex: 1; }
    .party-label {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .party-detail {
      font-size: 12px;
      color: #64748b;
      line-height: 1.7;
    }

    /* ── Table ── */
    .table-wrap { padding: 0 40px 8px; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead tr {
      background: #f8fafc;
    }
    th {
      padding: 10px 14px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
    }
    th.r, td.r { text-align: right; }
    td {
      padding: 14px;
      font-size: 13px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }
    td:first-child { font-weight: 500; color: #0f172a; }
    tbody tr:last-child td { border-bottom: none; }

    /* ── Totals ── */
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      padding: 16px 40px 28px;
    }
    .totals {
      min-width: 280px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 18px;
      font-size: 12.5px;
      color: #64748b;
    }
    .total-row span:last-child {
      font-weight: 600;
      color: #334155;
    }
    .total-row.grand {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #fff;
      padding: 14px 18px;
      font-size: 16px;
      font-weight: 700;
    }
    .total-row.grand span:last-child { color: #fff; }
    .total-row.paid span:last-child { color: #059669; font-weight: 700; }
    .total-row.due span:last-child { color: #dc2626; font-weight: 700; }
    .total-row + .total-row { border-top: 1px solid #f1f5f9; }
    .total-row.grand + .total-row { border-top: none; }

    /* ── Footer ── */
    .footer {
      background: #f8fafc;
      padding: 20px 40px;
      border-top: 1px solid #e2e8f0;
    }
    .footer-grid {
      display: flex;
      gap: 32px;
    }
    .footer-col { flex: 1; }
    .footer-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      margin-bottom: 6px;
    }
    .footer-text {
      font-size: 11.5px;
      color: #475569;
      line-height: 1.6;
    }

    /* ── Bottom accent ── */
    .bottom-bar {
      height: 3px;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
    }

    @media print {
      body { background: #fff; }
      .page { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="accent-bar"></div>

    <!-- Header -->
    <div class="header">
      <div class="brand">
        ${logoSrc
          ? `<img src="${logoSrc}" alt="${data.empresa.nombre}" class="brand-logo" crossorigin="anonymous">`
          : `<div class="brand-fallback">${data.empresa.nombre.charAt(0).toUpperCase()}</div>`
        }
        <div class="brand-text">
          <h1>${data.empresa.nombre}</h1>
          ${data.empresa.documento ? `<p>${data.empresa.documento}</p>` : ''}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-label">Factura</div>
        <div class="invoice-num">${data.numeroFactura}</div>
        <div class="meta-grid">
          <span class="meta-label">Emitida</span>
          <span class="meta-value">${data.fechaEmision}</span>
          ${data.fechaVencimiento ? `
            <span class="meta-label">Vence</span>
            <span class="meta-value">${data.fechaVencimiento}</span>
          ` : ''}
        </div>
        <div class="status-pill">${status.label}</div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Parties -->
    <div class="parties">
      <div class="party">
        <div class="party-label">De</div>
        <div class="party-name">${data.empresa.nombre}</div>
        <div class="party-detail">
          ${data.empresa.direccion ? `${data.empresa.direccion}<br>` : ''}
          ${data.empresa.telefono ? `${data.empresa.telefono}<br>` : ''}
          ${data.empresa.email ? `${data.empresa.email}<br>` : ''}
          ${data.empresa.sitioWeb ? `${data.empresa.sitioWeb}` : ''}
        </div>
      </div>
      <div class="party">
        <div class="party-label">Facturado a</div>
        <div class="party-name">${data.cliente.nombre}</div>
        <div class="party-detail">
          ${data.cliente.documento ? `${data.cliente.documento}<br>` : ''}
          ${data.cliente.telefono ? `${data.cliente.telefono}<br>` : ''}
          ${data.cliente.email ? `${data.cliente.email}<br>` : ''}
          ${data.cliente.direccion ? `${data.cliente.direccion}<br>` : ''}
          ${data.cliente.pais ? `${data.cliente.pais}` : ''}
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Items -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="r" style="width:70px;">Cant.</th>
            <th class="r" style="width:110px;">P. Unit.</th>
            <th class="r" style="width:110px;">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.descripcion}</td>
              <td class="r">${item.cantidad}</td>
              <td class="r">${cs}${fmt(item.precioUnitario)}</td>
              <td class="r">${cs}${fmt(item.subtotal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-wrap">
      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${cs}${fmt(data.subtotal)}</span>
        </div>
        ${data.impuestos ? `
          <div class="total-row">
            <span>Impuestos</span>
            <span>${cs}${fmt(data.impuestos)}</span>
          </div>
        ` : ''}
        ${data.descuentos ? `
          <div class="total-row">
            <span>Descuentos</span>
            <span>-${cs}${fmt(data.descuentos)}</span>
          </div>
        ` : ''}
        <div class="total-row grand">
          <span>Total</span>
          <span>${cs}${fmt(data.total)}</span>
        </div>
        ${data.montoPagado !== undefined && data.montoPagado > 0 ? `
          <div class="total-row paid">
            <span>Pagado</span>
            <span>${cs}${fmt(data.montoPagado)}</span>
          </div>
        ` : ''}
        ${data.saldoPendiente !== undefined && data.saldoPendiente > 0 ? `
          <div class="total-row due">
            <span>Saldo Pendiente</span>
            <span>${cs}${fmt(data.saldoPendiente)}</span>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Footer -->
    ${(data.notas || data.terminos || data.proximoPago || data.totalAbonado !== undefined) ? `
      <div class="footer">
        <div class="footer-grid">
          ${data.terminos ? `
            <div class="footer-col">
              <div class="footer-title">Términos y Condiciones</div>
              <div class="footer-text">${data.terminos}</div>
            </div>
          ` : ''}
          ${data.notas ? `
            <div class="footer-col">
              <div class="footer-title">Notas</div>
              <div class="footer-text">${data.notas}</div>
            </div>
          ` : ''}
          ${(data.proximoPago || data.totalAbonado !== undefined) ? `
            <div class="footer-col">
              <div class="footer-title">Estado de Cuenta</div>
              <div class="footer-text">
                ${data.proximoPago ? `Próximo Pago: ${data.proximoPago}<br>` : ''}
                ${data.totalAbonado !== undefined ? `Total Abonado: ${cs}${fmt(data.totalAbonado)}<br>` : ''}
                ${data.saldoPendiente !== undefined ? `Saldo: ${cs}${fmt(data.saldoPendiente)}` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <div class="bottom-bar"></div>
  </div>
</body>
</html>`;
}

// Generate preview-friendly HTML (for iframe display)
export function generateInvoicePreviewHTML(data: InvoiceTemplateData): string {
  return generateInvoiceHTML(data);
}
