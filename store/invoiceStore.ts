import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { Invoice, CreateInvoicePayload, UpdateInvoicePayload, InvoiceStatus, InvoiceItem } from '../types/invoice';
import { InvoiceTemplateData } from '../lib/invoice-template';

interface InvoiceState {
  invoices: Invoice[];
  selectedInvoice: Invoice | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  
  // Cache
  cachedContactId: number | null;
  cachedServiceId: number | null;

  // Actions - Fetch
  fetchInvoicesByContact: (contactId: number, empresaId: number) => Promise<void>;
  fetchInvoicesByService: (serviceId: number) => Promise<Invoice[]>;
  fetchInvoiceById: (invoiceId: number) => Promise<Invoice | null>;
  
  // Actions - CRUD
  createInvoice: (payload: CreateInvoicePayload, empresaData: any) => Promise<Invoice | null>;
  updateInvoice: (invoiceId: number, payload: UpdateInvoicePayload) => Promise<Invoice | null>;
  deleteInvoice: (invoiceId: number) => Promise<boolean>;
  archiveInvoice: (invoiceId: number) => Promise<boolean>;
  
  // Actions - PDF Generation
  generateInvoicePDF: (templateData: InvoiceTemplateData, options?: {
    invoiceId?: number;
    saveToDatabase?: boolean;
    empresaId?: number;
    contactoId?: number;
    servicioId?: number;
  }) => Promise<{ pdfUrl: string; invoiceId?: number } | null>;
  
  // Actions - UI
  setSelectedInvoice: (invoice: Invoice | null) => void;
  clearError: () => void;
  resetStore: () => void;
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  selectedInvoice: null,
  isLoading: false,
  isGenerating: false,
  error: null,
  cachedContactId: null,
  cachedServiceId: null,

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

      set({ 
        invoices: data || [], 
        cachedContactId: contactId,
        isLoading: false 
      });
    } catch (err: any) {
      logger.error('[InvoiceStore] Error fetching invoices by contact:', err);
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

      const invoices = data || [];
      set({ 
        invoices,
        cachedServiceId: serviceId,
        isLoading: false 
      });
      return invoices;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error fetching invoices by service:', err);
      set({ error: err.message, isLoading: false });
      return [];
    }
  },

  fetchInvoiceById: async (invoiceId: number) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wp_facturas')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error) throw error;

      set({ selectedInvoice: data, isLoading: false });
      return data;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error fetching invoice:', err);
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  createInvoice: async (payload: CreateInvoicePayload, empresaData: any) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Generate invoice number
      const { data: numeroData, error: numeroError } = await supabase
        .rpc('generate_invoice_number', {
          p_empresa_id: payload.empresa_id,
          p_prefijo: 'INV'
        });

      if (numeroError) throw numeroError;

      const numeroFactura = numeroData as string;
      const secuencia = parseInt(numeroFactura.split('-')[1]) || 1;

      // 2. Calculate totals
      const subtotal = payload.items.reduce((sum: number, item: InvoiceItem) => sum + item.subtotal, 0);
      const impuestos = payload.impuestos || 0;
      const descuentos = payload.descuentos || 0;
      const total = subtotal + impuestos - descuentos;

      // 3. Create invoice record
      const { data, error } = await supabase
        .from('wp_facturas')
        .insert([{
          empresa_id: payload.empresa_id,
          contacto_id: payload.contacto_id,
          servicio_id: payload.servicio_id,
          pago_id: payload.pago_id,
          numero_factura: numeroFactura,
          prefijo: 'INV',
          secuencia: secuencia,
          fecha_emision: new Date().toISOString(),
          fecha_vencimiento: payload.fecha_vencimiento,
          cliente_nombre: payload.cliente_nombre,
          cliente_email: payload.cliente_email,
          cliente_telefono: payload.cliente_telefono,
          cliente_direccion: payload.cliente_direccion,
          cliente_documento: payload.cliente_documento,
          cliente_pais: payload.cliente_pais,
          empresa_nombre: empresaData.nombre || 'Empresa',
          empresa_direccion: empresaData.direccion,
          empresa_telefono: empresaData.telefono,
          empresa_email: empresaData.email,
          empresa_sitio_web: empresaData.sitio_web,
          empresa_logo_url: empresaData.logo_url,
          empresa_documento: empresaData.documento,
          items: payload.items,
          moneda: payload.moneda || 'USD',
          subtotal: subtotal,
          impuestos: impuestos,
          descuentos: descuentos,
          total: total,
          estado: payload.estado || 'borrador',
          monto_pagado: 0,
          notas: payload.notas,
          terminos: payload.terminos,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: payload.created_by
        }])
        .select()
        .single();

      if (error) throw error;

      const newInvoice = data as Invoice;

      set(state => ({
        invoices: [newInvoice, ...state.invoices],
        isLoading: false
      }));

      logger.info(`[InvoiceStore] Created invoice: ${numeroFactura}`);
      return newInvoice;

    } catch (err: any) {
      logger.error('[InvoiceStore] Error creating invoice:', err);
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  updateInvoice: async (invoiceId: number, payload: UpdateInvoicePayload) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wp_facturas')
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId)
        .select()
        .single();

      if (error) throw error;

      const updatedInvoice = data as Invoice;

      set(state => ({
        invoices: state.invoices.map(inv => 
          inv.id === invoiceId ? updatedInvoice : inv
        ),
        selectedInvoice: state.selectedInvoice?.id === invoiceId 
          ? updatedInvoice 
          : state.selectedInvoice,
        isLoading: false
      }));

      return updatedInvoice;

    } catch (err: any) {
      logger.error('[InvoiceStore] Error updating invoice:', err);
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  deleteInvoice: async (invoiceId: number) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase
        .from('wp_facturas')
        .delete()
        .eq('id', invoiceId);

      if (error) throw error;

      set(state => ({
        invoices: state.invoices.filter(inv => inv.id !== invoiceId),
        selectedInvoice: state.selectedInvoice?.id === invoiceId 
          ? null 
          : state.selectedInvoice,
        isLoading: false
      }));

      return true;

    } catch (err: any) {
      logger.error('[InvoiceStore] Error deleting invoice:', err);
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  archiveInvoice: async (invoiceId: number) => {
    set({ error: null });
    try {
      const { data, error } = await supabase
        .from('wp_facturas')
        .update({ estado: 'anulada', updated_at: new Date().toISOString() })
        .eq('id', invoiceId)
        .select()
        .single();

      if (error) throw error;

      const archived = data as Invoice;
      set(state => ({
        invoices: state.invoices.filter(inv => inv.id !== invoiceId),
        selectedInvoice: state.selectedInvoice?.id === invoiceId
          ? null
          : state.selectedInvoice,
      }));

      logger.info(`[InvoiceStore] Archived invoice ${invoiceId}`);
      return true;
    } catch (err: any) {
      logger.error('[InvoiceStore] Error archiving invoice:', err);
      set({ error: err.message });
      return false;
    }
  },

  generateInvoicePDF: async (templateData: InvoiceTemplateData, options = {}) => {
    set({ isGenerating: true, error: null });
    try {
      // Client-side PDF generation (avoids Puppeteer/Chromium issues in serverless)
      const { generateInvoicePDFClient, uploadPDFToStorage } = await import('../lib/pdf-generator');

      // 1. Generate PDF in browser
      const { blob } = await generateInvoicePDFClient(templateData);

      // 2. Upload to Supabase Storage
      const sanitizedName = templateData.empresa.nombre
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
      const fileName = `${templateData.numeroFactura}_${Date.now()}.pdf`;
      const filePath = `facturas/${sanitizedName}/${fileName}`;

      const pdfUrl = await uploadPDFToStorage(blob, filePath, supabase);

      if (!pdfUrl) {
        throw new Error('Error subiendo el PDF al storage');
      }

      // 3. Update invoice record if invoiceId provided
      if (options.invoiceId) {
        await get().updateInvoice(options.invoiceId, {
          pdf_url: pdfUrl,
          estado: 'emitida'
        });
      }

      set({ isGenerating: false });
      
      // Refresh invoices list if we have cached data
      if (options.contactoId && options.empresaId) {
        get().fetchInvoicesByContact(options.contactoId, options.empresaId);
      } else if (options.servicioId) {
        get().fetchInvoicesByService(options.servicioId);
      }

      logger.info(`[InvoiceStore] PDF generated: ${pdfUrl}`);
      
      return {
        pdfUrl,
        invoiceId: options.invoiceId
      };

    } catch (err: any) {
      logger.error('[InvoiceStore] Error generating PDF:', err);
      set({ error: err.message, isGenerating: false });
      return null;
    }
  },

  setSelectedInvoice: (invoice: Invoice | null) => {
    set({ selectedInvoice: invoice });
  },

  clearError: () => {
    set({ error: null });
  },

  resetStore: () => {
    set({
      invoices: [],
      selectedInvoice: null,
      isLoading: false,
      isGenerating: false,
      error: null,
      cachedContactId: null,
      cachedServiceId: null
    });
  }
}));

// Selectors
export const selectInvoices = (state: InvoiceState) => state.invoices;
export const selectSelectedInvoice = (state: InvoiceState) => state.selectedInvoice;
export const selectIsLoading = (state: InvoiceState) => state.isLoading;
export const selectIsGenerating = (state: InvoiceState) => state.isGenerating;
export const selectError = (state: InvoiceState) => state.error;
