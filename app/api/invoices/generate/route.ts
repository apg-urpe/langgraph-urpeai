import { NextRequest, NextResponse } from 'next/server';
import { generateInvoiceHTML, InvoiceTemplateData } from '@/lib/invoice-template';
export const runtime = 'nodejs';

// POST: Legacy endpoint - PDF generation now happens client-side via html2pdf.js
// This route is kept only for HTML preview generation
export async function POST(req: NextRequest) {
  return NextResponse.json(
    { 
      success: false, 
      error: 'PDF generation has been migrated to client-side. Use the InvoicePreviewModal component directly.' 
    },
    { status: 410 }
  );
}

// GET: Preview invoice HTML without generating PDF
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const preview = searchParams.get('preview');
  
  if (preview === 'template') {
    // Return sample template for testing
    const sampleData: InvoiceTemplateData = {
      empresa: {
        nombre: 'Mi Empresa',
        direccion: 'Calle Principal 123',
        telefono: '+51 999 999 999',
        email: 'info@miempresa.com',
        sitioWeb: 'www.miempresa.com'
      },
      cliente: {
        nombre: 'Cliente de Prueba',
        email: 'cliente@example.com',
        telefono: '+51 888 888 888'
      },
      numeroFactura: 'INV-000001',
      fechaEmision: new Date().toLocaleDateString('es-PE'),
      fechaVencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-PE'),
      items: [
        { descripcion: 'Servicio de Consultoría', cantidad: 1, precioUnitario: 1000, subtotal: 1000 },
        { descripcion: 'Desarrollo Web', cantidad: 2, precioUnitario: 500, subtotal: 1000 }
      ],
      moneda: 'USD',
      subtotal: 2000,
      impuestos: 360,
      total: 2360,
      estado: 'emitida',
      notas: 'Gracias por su preferencia.',
      terminos: 'Pago a 30 días.'
    };

    const html = generateInvoiceHTML(sampleData);
    
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  return NextResponse.json({ 
    message: 'Invoice API. Use POST to generate PDF or GET?preview=template for sample.' 
  });
}
