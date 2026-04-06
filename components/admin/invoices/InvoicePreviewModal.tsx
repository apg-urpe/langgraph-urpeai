import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  Download,
  Loader2,
  Eye,
  Calendar,
  DollarSign,
  User,
  Building,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  ExternalLink,
  Save,
  Mail
} from 'lucide-react';
import { useInvoiceStore } from '../../../store/invoiceStore';
import { useContactStore } from '../../../store/contactStore';
import { supabase } from '../../../lib/supabase-client';
import { InvoiceItem, formatInvoiceCurrency } from '../../../types/invoice';
import { InvoiceTemplateData, generateInvoicePreviewHTML } from '../../../lib/invoice-template';
import { ServiceWithPayments } from '../../../types/finance';

interface InvoicePreviewModalProps {
  service: ServiceWithPayments;
  contact: {
    id: number;
    nombre: string;
    apellido?: string;
    email?: string;
    telefono?: string;
  };
  onClose: () => void;
  onSuccess?: (pdfUrl: string) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  service,
  contact,
  onClose,
  onSuccess
}) => {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notas, setNotas] = useState('');
  const [terminos, setTerminos] = useState('Pago a 30 días.');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [impuestos, setImpuestos] = useState(0);
  const [descuentos, setDescuentos] = useState(0);
  const [clienteDocumento, setClienteDocumento] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(null);
  const [savedNumeroFactura, setSavedNumeroFactura] = useState<string | null>(null);
  const [nextNumeroFactura, setNextNumeroFactura] = useState<string>('INV-PREVIEW');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const createInvoice = useInvoiceStore(state => state.createInvoice);
  const updateInvoice = useInvoiceStore(state => state.updateInvoice);
  const enterpriseProfile = useContactStore(state => state.enterpriseProfile);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  // Pre-fetch next invoice number for preview
  useEffect(() => {
    const fetchNextNumber = async () => {
      if (!selectedEnterpriseId) return;
      try {
        const { data, error } = await supabase
          .rpc('generate_invoice_number', {
            p_empresa_id: selectedEnterpriseId,
            p_prefijo: 'INV'
          });
        if (!error && data) {
          setNextNumeroFactura(data as string);
          console.log(`[Invoice] Next number for empresa_id=${selectedEnterpriseId}: ${data}`);
        } else if (error) {
          console.error('[Invoice] Error fetching next number:', error, 'empresa_id:', selectedEnterpriseId);
        }
      } catch (err) {
        console.error('[Invoice] RPC call failed:', err);
      }
    };
    fetchNextNumber();
  }, [selectedEnterpriseId]);

  // Initialize items from service
  useEffect(() => {
    setItems([{
      descripcion: service.nombre_servicio,
      cantidad: 1,
      precioUnitario: service.valor_total,
      subtotal: service.valor_total
    }]);

    // Set default due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    setFechaVencimiento(dueDate.toISOString().split('T')[0]);
  }, [service]);

  // Calculate totals
  const subtotal = useMemo(() => 
    items.reduce((sum, item) => sum + item.subtotal, 0), 
    [items]
  );
  const total = useMemo(() => 
    subtotal + impuestos - descuentos, 
    [subtotal, impuestos, descuentos]
  );

  // Build template data
  const templateData: InvoiceTemplateData = useMemo(() => ({
    empresa: {
      nombre: enterpriseProfile?.nombre || 'Empresa',
      direccion: enterpriseProfile?.direccion || '',
      telefono: enterpriseProfile?.telefono || '',
      email: enterpriseProfile?.email || '',
      sitioWeb: enterpriseProfile?.sitio_web || '',
      logoUrl: enterpriseProfile?.logo_url || '',
      documento: (enterpriseProfile as any)?.documento || ''
    },
    cliente: {
      nombre: `${contact.nombre} ${contact.apellido || ''}`.trim(),
      email: contact.email || '',
      telefono: contact.telefono || '',
      documento: clienteDocumento
    },
    numeroFactura: savedNumeroFactura || nextNumeroFactura,
    fechaEmision: new Date().toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }),
    fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) : undefined,
    items,
    moneda: service.moneda,
    subtotal,
    impuestos: impuestos > 0 ? impuestos : undefined,
    descuentos: descuentos > 0 ? descuentos : undefined,
    total,
    estado: 'emitida',
    montoPagado: service.saldo_pagado,
    saldoPendiente: service.saldo_pendiente,
    notas: notas || undefined,
    terminos: terminos || undefined,
    totalAbonado: service.saldo_pagado > 0 ? service.saldo_pagado : undefined
  }), [
    enterpriseProfile, contact, clienteDocumento, fechaVencimiento,
    items, service, subtotal, impuestos, descuentos, total, notas, terminos, savedNumeroFactura, nextNumeroFactura
  ]);

  // Update preview HTML
  useEffect(() => {
    setPreviewHtml(generateInvoicePreviewHTML(templateData));
  }, [templateData]);

  const handleAddItem = () => {
    setItems([...items, {
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      subtotal: 0
    }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    
    if (field === 'descripcion') {
      item.descripcion = value as string;
    } else {
      const numValue = Number(value) || 0;
      if (field === 'cantidad') {
        item.cantidad = numValue;
        item.subtotal = numValue * item.precioUnitario;
      } else if (field === 'precioUnitario') {
        item.precioUnitario = numValue;
        item.subtotal = item.cantidad * numValue;
      }
    }
    
    newItems[index] = item;
    setItems(newItems);
  };

  // Step 1: Save invoice to database
  const handleSaveInvoice = async () => {
    if (!selectedEnterpriseId) return;
    setIsSaving(true);
    setLocalError(null);

    try {
      const empresaData = {
        nombre: enterpriseProfile?.nombre || 'Empresa',
        direccion: enterpriseProfile?.direccion,
        telefono: enterpriseProfile?.telefono,
        email: enterpriseProfile?.email,
        sitio_web: enterpriseProfile?.sitio_web,
        logo_url: enterpriseProfile?.logo_url,
        documento: (enterpriseProfile as any)?.documento
      };

      const invoice = await createInvoice({
        empresa_id: selectedEnterpriseId,
        contacto_id: contact.id,
        servicio_id: service.id,
        cliente_nombre: `${contact.nombre} ${contact.apellido || ''}`.trim(),
        cliente_email: contact.email,
        cliente_telefono: contact.telefono,
        cliente_documento: clienteDocumento,
        items,
        moneda: service.moneda,
        fecha_vencimiento: fechaVencimiento,
        impuestos,
        descuentos,
        notas,
        terminos,
        estado: 'borrador'
      }, empresaData);

      if (invoice) {
        setSavedInvoiceId(invoice.id);
        setSavedNumeroFactura(invoice.numero_factura);
      } else {
        setLocalError('Error al guardar la factura');
      }
    } catch (err: any) {
      setLocalError(err.message || 'Error inesperado');
    } finally {
      setIsSaving(false);
    }
  };

  // Step 2: Generate PDF client-side with html2pdf.js + upload to Supabase Storage
  const handleGeneratePDF = async () => {
    if (!savedInvoiceId || !selectedEnterpriseId) return;
    setIsGeneratingPDF(true);
    setLocalError(null);

    try {
      const { generateInvoicePDFClient, uploadPDFToStorage } = await import('../../../lib/pdf-generator');

      // Update template with real invoice number
      const finalTemplateData: InvoiceTemplateData = {
        ...templateData,
        numeroFactura: savedNumeroFactura || `INV-${String(savedInvoiceId).padStart(6, '0')}`
      };

      // 1. Generate PDF in browser
      const { blob } = await generateInvoicePDFClient(finalTemplateData);

      // 2. Upload to Supabase Storage
      const sanitizedEmpresa = (enterpriseProfile?.nombre || 'empresa')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
      const fileName = `${finalTemplateData.numeroFactura}_${Date.now()}.pdf`;
      const filePath = `facturas/${sanitizedEmpresa}/${fileName}`;

      const pdfUrl = await uploadPDFToStorage(blob, filePath, supabase);

      if (!pdfUrl) {
        throw new Error('Error subiendo el PDF al storage');
      }

      // 3. Update invoice record with PDF URL
      await updateInvoice(savedInvoiceId, {
        pdf_url: pdfUrl,
        estado: 'emitida'
      });

      setGeneratedPdfUrl(pdfUrl);
      
      // Open PDF in new tab for download
      window.open(pdfUrl, '_blank');
      
      onSuccess?.(pdfUrl);
    } catch (err: any) {
      console.error('[Invoice] PDF generation error:', err);
      setLocalError(err.message || 'Error generando PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Future: Send by email
  const handleSendEmail = async () => {
    // TODO: Implement email sending
    alert('Funcionalidad de envío por correo próximamente');
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" translate="no">
      <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-500/10">
              <FileText className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-100">Generar Factura</h2>
              <p className="text-xs text-zinc-500">{service.nombre_servicio}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Form */}
          <div className="w-1/2 border-r border-white/5 overflow-y-auto p-4 space-y-4">
            {/* Client Info */}
            <div className="bg-zinc-800/50 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
                <User className="w-3.5 h-3.5" />
                <span className="font-medium uppercase">Cliente</span>
              </div>
              <p className="text-zinc-100 font-medium">
                {contact.nombre} {contact.apellido}
              </p>
              <p className="text-xs text-zinc-500">{contact.email}</p>
              <p className="text-xs text-zinc-500">{contact.telefono}</p>
              <div className="mt-2">
                <input
                  type="text"
                  value={clienteDocumento}
                  onChange={(e) => setClienteDocumento(e.target.value)}
                  placeholder="Documento fiscal (NIT, RUT, DNI...)"
                  className="w-full px-3 py-1.5 text-sm bg-zinc-900/50 border border-white/10 
                           rounded-lg text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                />
              </div>
            </div>

            {/* Enterprise Info */}
            <div className="bg-zinc-800/50 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
                <Building className="w-3.5 h-3.5" />
                <span className="font-medium uppercase">Empresa</span>
              </div>
              <p className="text-zinc-100 font-medium">{enterpriseProfile?.nombre}</p>
              <p className="text-xs text-zinc-500">{enterpriseProfile?.email}</p>
              <p className="text-xs text-zinc-500">{enterpriseProfile?.telefono}</p>
            </div>

            {/* Due Date */}
            <div>
              <label className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Fecha de Vencimiento
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 
                         rounded-lg text-zinc-100
                         focus:outline-none focus:ring-1 focus:ring-primary-500/50"
              />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <DollarSign className="w-3.5 h-3.5" />
                  Líneas de Factura
                </label>
                <button
                  onClick={handleAddItem}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-primary-400 
                           hover:bg-primary-500/10 rounded-md transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Agregar
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="bg-zinc-800/50 rounded-lg p-3 border border-white/5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={item.descripcion}
                          onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                          placeholder="Descripción"
                          className="w-full px-2 py-1.5 text-sm bg-zinc-900/50 border border-white/10 
                                   rounded text-zinc-100 placeholder-zinc-500
                                   focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-zinc-500 block mb-0.5">Cant.</label>
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => handleItemChange(index, 'cantidad', e.target.value)}
                              min="1"
                              className="w-full px-2 py-1.5 text-sm bg-zinc-900/50 border border-white/10 
                                       rounded text-zinc-100 text-right
                                       focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 block mb-0.5">P. Unit.</label>
                            <input
                              type="number"
                              value={item.precioUnitario}
                              onChange={(e) => handleItemChange(index, 'precioUnitario', e.target.value)}
                              min="0"
                              step="0.01"
                              className="w-full px-2 py-1.5 text-sm bg-zinc-900/50 border border-white/10 
                                       rounded text-zinc-100 text-right
                                       focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 block mb-0.5">Subtotal</label>
                            <div className="px-2 py-1.5 text-sm bg-zinc-900/30 border border-white/5 
                                          rounded text-zinc-300 text-right">
                              {formatInvoiceCurrency(item.subtotal, service.moneda)}
                            </div>
                          </div>
                        </div>
                      </div>
                      {items.length > 1 && (
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 
                                   rounded-md transition-colors mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Taxes & Discounts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Impuestos</label>
                <input
                  type="number"
                  value={impuestos}
                  onChange={(e) => setImpuestos(Number(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 
                           rounded-lg text-zinc-100 text-right
                           focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Descuentos</label>
                <input
                  type="number"
                  value={descuentos}
                  onChange={(e) => setDescuentos(Number(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 
                           rounded-lg text-zinc-100 text-right
                           focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                />
              </div>
            </div>

            {/* Totals Summary */}
            <div className="bg-zinc-800/50 rounded-lg p-3 border border-white/5 space-y-1">
              <div className="flex justify-between text-sm text-zinc-400">
                <span>Subtotal:</span>
                <span>{formatInvoiceCurrency(subtotal, service.moneda)}</span>
              </div>
              {impuestos > 0 && (
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Impuestos:</span>
                  <span>{formatInvoiceCurrency(impuestos, service.moneda)}</span>
                </div>
              )}
              {descuentos > 0 && (
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Descuentos:</span>
                  <span>-{formatInvoiceCurrency(descuentos, service.moneda)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-zinc-100 pt-2 border-t border-white/10">
                <span>Total:</span>
                <span>{formatInvoiceCurrency(total, service.moneda)}</span>
              </div>
            </div>

            {/* Notes & Terms */}
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Notas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Notas adicionales (opcional)"
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 
                         rounded-lg text-zinc-100 placeholder-zinc-500 resize-none
                         focus:outline-none focus:ring-1 focus:ring-primary-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Términos y Condiciones</label>
              <textarea
                value={terminos}
                onChange={(e) => setTerminos(e.target.value)}
                rows={2}
                placeholder="Términos de pago"
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 
                         rounded-lg text-zinc-100 placeholder-zinc-500 resize-none
                         focus:outline-none focus:ring-1 focus:ring-primary-500/50"
              />
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 bg-zinc-950 flex flex-col">
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <Eye className="w-4 h-4" />
                <span>Vista Previa</span>
              </div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                {showPreview ? 'Ocultar' : 'Mostrar'} Preview
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {showPreview || true ? (
                <div className="bg-white rounded-lg shadow-lg overflow-hidden transform scale-75 origin-top-left" 
                     style={{ width: '133%' }}>
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-[800px] border-0"
                    title="Invoice Preview"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                  <FileText className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">Click &quot;Mostrar Preview&quot; para ver la factura</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 shrink-0 bg-zinc-900/80">
          {localError && (
            <div className="mb-3 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {localError}
            </div>
          )}
          
          {generatedPdfUrl ? (
            // State 3: PDF Generated - Show success + actions
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Factura generada exitosamente</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendEmail}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                           bg-blue-500/10 text-blue-400 border border-blue-500/20
                           hover:bg-blue-500/20 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Enviar por Correo
                </button>
                <a
                  href={generatedPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                           bg-primary-500/10 text-primary-400 border border-primary-500/20
                           hover:bg-primary-500/20 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver PDF
                </a>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-lg
                           bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : savedInvoiceId ? (
            // State 2: Invoice Saved - Show generate PDF button
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Factura guardada (ID: {savedInvoiceId})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-lg
                           text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleGeneratePDF}
                  disabled={isGeneratingPDF}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg
                           bg-primary-500 text-white hover:bg-primary-600
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGeneratingPDF ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Descargar PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // State 1: Initial - Show save button
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg
                         text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveInvoice}
                disabled={isSaving || items.length === 0 || total <= 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg
                         bg-emerald-500 text-white hover:bg-emerald-600
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Factura
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
