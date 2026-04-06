import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { logActivity } from '../lib/activity-logger';
import {
  Service,
  Payment,
  CreateServicePayload,
  UpdateServicePayload,
  CreatePaymentPayload,
  UpdatePaymentPayload,
  ContactFinanceSummary,
  ServiceWithPayments,
  CustomPaymentMethod,
  CreatePaymentMethodPayload,
  UpdatePaymentMethodPayload,
  PaymentMethodOption,
  PAYMENT_METHOD_OPTIONS
} from '../types/finance';

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================

interface FinanceState {
  // Data
  services: (Service & { pagos?: Payment[] })[];
  payments: Payment[];
  selectedService: ServiceWithPayments | null;
  contactSummary: ContactFinanceSummary | null;
  
  // Custom Payment Methods
  customPaymentMethods: CustomPaymentMethod[];
  allPaymentMethodOptions: PaymentMethodOption[];
  isLoadingPaymentMethods: boolean;
  
  // UI State
  isLoading: boolean;
  isLoadingPayments: boolean;
  error: string | null;
  
  // Cache per contact
  cachedContactId: number | null;
  cachedEnterpriseId: number | null;
  lastFetch: number | null;
  cachedEnterpriseIdForMethods: number | null;

  // Actions - Fetch
  fetchServicesByContact: (contactoId: number, empresaId: number, forceRefresh?: boolean) => Promise<void>;
  fetchServiceWithPayments: (serviceId: number) => Promise<ServiceWithPayments | null>;
  fetchPaymentsByService: (serviceId: number) => Promise<Payment[]>;
  
  // Actions - Services CRUD
  createService: (payload: CreateServicePayload) => Promise<Service | null>;
  updateService: (serviceId: number, payload: UpdateServicePayload) => Promise<Service | null>;
  deleteService: (serviceId: number) => Promise<boolean>;
  
  // Actions - Payments CRUD
  createPayment: (payload: CreatePaymentPayload) => Promise<Payment | null>;
  updatePayment: (paymentId: number, payload: UpdatePaymentPayload) => Promise<Payment | null>;
  deletePayment: (paymentId: number) => Promise<boolean>;
  
  // Actions - Payment Methods
  fetchPaymentMethods: (empresaId: number, forceRefresh?: boolean) => Promise<void>;
  createPaymentMethod: (payload: CreatePaymentMethodPayload) => Promise<CustomPaymentMethod | null>;
  updatePaymentMethod: (methodId: number, payload: UpdatePaymentMethodPayload) => Promise<CustomPaymentMethod | null>;
  deletePaymentMethod: (methodId: number) => Promise<boolean>;
  
  // Actions - UI
  setSelectedService: (service: ServiceWithPayments | null) => void;
  clearError: () => void;
  resetStore: () => void;
}

// Cache duration (5 minutes)
const CACHE_MS = 300000;

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useFinanceStore = create<FinanceState>((set, get) => ({
  // Initial State
  services: [],
  payments: [],
  selectedService: null,
  contactSummary: null,
  customPaymentMethods: [],
  allPaymentMethodOptions: [...PAYMENT_METHOD_OPTIONS],
  isLoadingPaymentMethods: false,
  isLoading: false,
  isLoadingPayments: false,
  error: null,
  cachedContactId: null,
  cachedEnterpriseId: null,
  lastFetch: null,
  cachedEnterpriseIdForMethods: null,

  // ============================================================================
  // FETCH ACTIONS
  // ============================================================================

  fetchServicesByContact: async (contactoId: number, empresaId: number, forceRefresh = false) => {
    const { cachedContactId, cachedEnterpriseId, lastFetch } = get();
    
    // Check cache
    if (!forceRefresh && 
        cachedContactId === contactoId && 
        cachedEnterpriseId === empresaId && 
        lastFetch && 
        Date.now() - lastFetch < CACHE_MS) {
      logger.debug('[FinanceStore] Using cached services for contact', contactoId);
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Only filter by contacto_id - RLS policies handle empresa_id security
      // This allows role_id 1 (Dev Team) to view services from other enterprises
      const { data, error } = await supabase
        .from('wp_crm_servicios')
        .select(`
          *,
          pagos:wp_crm_pagos(*)
        `)
        .eq('contacto_id', contactoId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const services = (data || []) as (Service & { pagos?: Payment[] })[];
      
      // Calculate summary
      const summary: ContactFinanceSummary = {
        totalContratado: services.reduce((sum, s) => sum + (s.valor_total || 0), 0),
        totalPagado: services.reduce((sum, s) => sum + (s.saldo_pagado || 0), 0),
        totalPendiente: services.reduce((sum, s) => sum + (s.saldo_pendiente || 0), 0),
        serviciosActivos: services.filter(s => s.estado === 'activo' || s.estado === 'pendiente_pago').length,
        serviciosCompletados: services.filter(s => s.estado === 'finalizado').length,
        moneda: services[0]?.moneda || 'USD'
      };

      set({
        services,
        contactSummary: summary,
        cachedContactId: contactoId,
        cachedEnterpriseId: empresaId,
        lastFetch: Date.now(),
        isLoading: false
      });

    } catch (err: any) {
      logger.error('[FinanceStore] Error fetching services:', err);
      set({ 
        error: err.message || 'Error al cargar servicios',
        isLoading: false 
      });
    }
  },

  fetchServiceWithPayments: async (serviceId: number) => {
    set({ isLoadingPayments: true, error: null });

    try {
      // Fetch service
      const { data: serviceData, error: serviceError } = await supabase
        .from('wp_crm_servicios')
        .select('*')
        .eq('id', serviceId)
        .single();

      if (serviceError) throw serviceError;

      // Fetch payments for this service
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('wp_crm_pagos')
        .select('*')
        .eq('servicio_id', serviceId)
        .order('fecha_pago', { ascending: false });

      if (paymentsError) throw paymentsError;

      const service = serviceData as Service;
      const pagos = (paymentsData || []) as Payment[];
      
      const serviceWithPayments: ServiceWithPayments = {
        ...service,
        pagos,
        porcentajePagado: service.valor_total > 0 
          ? Math.min(100, Math.round((service.saldo_pagado / service.valor_total) * 100))
          : 0
      };

      set({ 
        selectedService: serviceWithPayments,
        payments: pagos,
        isLoadingPayments: false 
      });

      return serviceWithPayments;

    } catch (err: any) {
      logger.error('[FinanceStore] Error fetching service with payments:', err);
      set({ 
        error: err.message || 'Error al cargar detalle del servicio',
        isLoadingPayments: false 
      });
      return null;
    }
  },

  fetchPaymentsByService: async (serviceId: number) => {
    try {
      const { data, error } = await supabase
        .from('wp_crm_pagos')
        .select('*')
        .eq('servicio_id', serviceId)
        .order('fecha_pago', { ascending: false });

      if (error) throw error;

      const payments = (data || []) as Payment[];
      set({ payments });
      return payments;

    } catch (err: any) {
      logger.error('[FinanceStore] Error fetching payments:', err);
      return [];
    }
  },

  // ============================================================================
  // SERVICES CRUD
  // ============================================================================

  createService: async (payload: CreateServicePayload) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_crm_servicios')
        .insert([{
          ...payload,
          saldo_pagado: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      const newService = data as Service;

      // Update local state
      set(state => ({
        services: [newService, ...state.services],
        isLoading: false,
        // Recalculate summary
        contactSummary: state.contactSummary ? {
          ...state.contactSummary,
          totalContratado: state.contactSummary.totalContratado + newService.valor_total,
          totalPendiente: state.contactSummary.totalPendiente + newService.valor_total,
          serviciosActivos: state.contactSummary.serviciosActivos + ((newService.estado === 'activo' || newService.estado === 'pendiente_pago') ? 1 : 0),
          serviciosCompletados: state.contactSummary.serviciosCompletados + (newService.estado === 'finalizado' ? 1 : 0)
        } : null
      }));

      void logActivity({
        tipo: 'contacto', accion: 'crear',
        descripcion: `Servicio creado: ${payload.nombre_servicio || 'Sin nombre'}`,
        contactoId: payload.contacto_id,
        empresaId: payload.empresa_id,
        entidadTipo: 'servicio',
        entidadId: String(newService.id),
        datosDespues: { nombre_servicio: payload.nombre_servicio, valor_total: payload.valor_total, estado: payload.estado }
      });

      return newService;

    } catch (err: any) {
      logger.error('[FinanceStore] Error creating service:', err);
      set({ 
        error: err.message || 'Error al crear servicio',
        isLoading: false 
      });
      return null;
    }
  },

  updateService: async (serviceId: number, payload: UpdateServicePayload) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_crm_servicios')
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', serviceId)
        .select()
        .single();

      if (error) throw error;

      const updatedService = data as Service;
      
      // Update local state
      set(state => ({
        services: state.services.map(s => s.id === serviceId ? { ...s, ...updatedService } : s),
        selectedService: state.selectedService?.id === serviceId 
          ? { ...state.selectedService, ...updatedService }
          : state.selectedService,
        isLoading: false
      }));

      // Refresh main services list to update summary
      get().fetchServicesByContact(updatedService.contacto_id, updatedService.empresa_id, true);

      void logActivity({
        tipo: 'contacto', accion: 'actualizar',
        descripcion: `Servicio actualizado: ${updatedService.nombre_servicio || serviceId}`,
        contactoId: updatedService.contacto_id,
        empresaId: updatedService.empresa_id,
        entidadTipo: 'servicio',
        entidadId: String(serviceId),
        datosDespues: payload as Record<string, unknown>
      });

      return updatedService;

    } catch (err: any) {
      logger.error('[FinanceStore] Error updating service:', err);
      set({ 
        error: err.message || 'Error al actualizar servicio',
        isLoading: false 
      });
      return null;
    }
  },

  deleteService: async (serviceId: number) => {
    // Get service details before deletion to refresh list later
    const service = get().services.find(s => s.id === serviceId);
    
    set({ isLoading: true, error: null });

    try {
      const { error } = await supabase
        .from('wp_crm_servicios')
        .delete()
        .eq('id', serviceId);

      if (error) throw error;

      // Update local state
      set(state => ({
        services: state.services.filter(s => s.id !== serviceId),
        selectedService: state.selectedService?.id === serviceId ? null : state.selectedService,
        isLoading: false,
        lastFetch: null // Invalidate cache
      }));

      // Refresh main services list to update summary
      if (service) {
        get().fetchServicesByContact(service.contacto_id, service.empresa_id, true);

        void logActivity({
          tipo: 'contacto', accion: 'eliminar',
          descripcion: `Servicio eliminado: ${service.nombre_servicio || serviceId}`,
          contactoId: service.contacto_id,
          empresaId: service.empresa_id,
          entidadTipo: 'servicio',
          entidadId: String(serviceId),
          datosAntes: { nombre_servicio: service.nombre_servicio, valor_total: service.valor_total, estado: service.estado }
        });
      }

      return true;

    } catch (err: any) {
      logger.error('[FinanceStore] Error deleting service:', err);
      set({ 
        error: err.message || 'Error al eliminar servicio',
        isLoading: false 
      });
      return false;
    }
  },

  // ============================================================================
  // PAYMENTS CRUD
  // ============================================================================

  createPayment: async (payload: CreatePaymentPayload) => {
    set({ isLoadingPayments: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_crm_pagos')
        .insert([{
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('*')
        .single();

      if (error) throw error;

      const newPayment = data as Payment;
      
      // Update local state
      set(state => ({
        payments: [newPayment, ...state.payments],
        isLoadingPayments: false
      }));

      // Refresh service to get updated saldo (trigger should have updated it)
      const { selectedService } = get();
      if (selectedService && selectedService.id === payload.servicio_id) {
        get().fetchServiceWithPayments(payload.servicio_id);
      }

      // Refresh main services list to update summary and service balances
      get().fetchServicesByContact(payload.contacto_id, payload.empresa_id, true);

      void logActivity({
        tipo: 'contacto', accion: 'crear',
        descripcion: `Pago registrado: ${payload.monto}`,
        contactoId: payload.contacto_id,
        empresaId: payload.empresa_id,
        entidadTipo: 'pago',
        entidadId: String(newPayment.id),
        datosDespues: { monto: payload.monto, metodo_pago: payload.metodo_pago, estado: payload.estado }
      });

      // Award XP for conversion
      try {
        const { useGamificationStore } = await import('./gamificationStore');
        useGamificationStore.getState().awardXP(
          'conversion_achieved',
          'Pago registrado (Conversión)',
          newPayment.id,
          'payment'
        );
      } catch (gamiErr) {
        console.warn('[FinanceStore] Non-critical error awarding XP:', gamiErr);
      }

      return newPayment;

    } catch (err: any) {
      logger.error('[FinanceStore] Error creating payment:', err);
      set({ 
        error: err.message || 'Error al registrar pago',
        isLoadingPayments: false 
      });
      return null;
    }
  },

  updatePayment: async (paymentId: number, payload: UpdatePaymentPayload) => {
    set({ isLoadingPayments: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_crm_pagos')
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId)
        .select('*')
        .single();

      if (error) throw error;

      const updatedPayment = data as Payment;
      
      // Update local state
      set(state => ({
        payments: state.payments.map(p => p.id === paymentId ? updatedPayment : p),
        isLoadingPayments: false
      }));

      // Refresh service to get updated saldo
      const { selectedService } = get();
      if (selectedService) {
        get().fetchServiceWithPayments(selectedService.id);
      }

      // Refresh main services list to update summary
      get().fetchServicesByContact(updatedPayment.contacto_id, updatedPayment.empresa_id, true);

      void logActivity({
        tipo: 'contacto', accion: 'actualizar',
        descripcion: `Pago actualizado: ${updatedPayment.monto}`,
        contactoId: updatedPayment.contacto_id,
        empresaId: updatedPayment.empresa_id,
        entidadTipo: 'pago',
        entidadId: String(paymentId),
        datosDespues: payload as Record<string, unknown>
      });

      return updatedPayment;

    } catch (err: any) {
      logger.error('[FinanceStore] Error updating payment:', err);
      set({ 
        error: err.message || 'Error al actualizar pago',
        isLoadingPayments: false 
      });
      return null;
    }
  },

  deletePayment: async (paymentId: number) => {
    const payment = get().payments.find(p => p.id === paymentId);
    
    set({ isLoadingPayments: true, error: null });

    try {
      const { error } = await supabase
        .from('wp_crm_pagos')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;

      // Update local state
      set(state => ({
        payments: state.payments.filter(p => p.id !== paymentId),
        isLoadingPayments: false
      }));

      // Refresh service to get updated saldo
      if (payment) {
        get().fetchServiceWithPayments(payment.servicio_id);
        // Refresh main services list to update summary
        get().fetchServicesByContact(payment.contacto_id, payment.empresa_id, true);
      }

      return true;

    } catch (err: any) {
      logger.error('[FinanceStore] Error deleting payment:', err);
      set({ 
        error: err.message || 'Error al eliminar pago',
        isLoadingPayments: false 
      });
      return false;
    }
  },

  // ============================================================================
  // PAYMENT METHODS CRUD
  // ============================================================================

  fetchPaymentMethods: async (empresaId: number, forceRefresh = false) => {
    const { cachedEnterpriseIdForMethods } = get();
    
    // Check cache
    if (!forceRefresh && cachedEnterpriseIdForMethods === empresaId) {
      logger.debug('[FinanceStore] Using cached payment methods for enterprise', empresaId);
      return;
    }

    set({ isLoadingPaymentMethods: true });

    try {
      const { data, error } = await supabase
        .from('wp_metodos_pago')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('is_active', true)
        .order('orden', { ascending: true });

      if (error) throw error;

      const customMethods = (data || []) as CustomPaymentMethod[];
      
      // Combine base options with custom methods
      // Custom methods with same code override base ones
      const customCodes = new Set(customMethods.map(m => m.codigo));
      const baseOptions: PaymentMethodOption[] = PAYMENT_METHOD_OPTIONS
        .filter(opt => !customCodes.has(opt.value))
        .map(opt => ({ ...opt, isCustom: false }));
      
      const customOptions: PaymentMethodOption[] = customMethods.map(m => ({
        value: m.codigo,
        label: m.nombre,
        isCustom: true,
        icono: m.icono || undefined
      }));
      
      // Combine: custom first (by orden), then base
      const allOptions = [...customOptions, ...baseOptions];

      set({
        customPaymentMethods: customMethods,
        allPaymentMethodOptions: allOptions,
        cachedEnterpriseIdForMethods: empresaId,
        isLoadingPaymentMethods: false
      });

    } catch (err: any) {
      logger.error('[FinanceStore] Error fetching payment methods:', err);
      // On error, fall back to base options only
      set({
        customPaymentMethods: [],
        allPaymentMethodOptions: [...PAYMENT_METHOD_OPTIONS],
        isLoadingPaymentMethods: false
      });
    }
  },

  createPaymentMethod: async (payload: CreatePaymentMethodPayload) => {
    set({ isLoadingPaymentMethods: true, error: null });

    try {
      // Normalize codigo to lowercase without spaces
      const normalizedCodigo = payload.codigo.toLowerCase().replace(/\s+/g, '_');
      
      const { data, error } = await supabase
        .from('wp_metodos_pago')
        .insert([{
          ...payload,
          codigo: normalizedCodigo,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('*')
        .single();

      if (error) throw error;

      const newMethod = data as CustomPaymentMethod;
      
      // Refresh payment methods to update combined list
      await get().fetchPaymentMethods(payload.empresa_id, true);

      set({ isLoadingPaymentMethods: false });
      return newMethod;

    } catch (err: any) {
      logger.error('[FinanceStore] Error creating payment method:', err);
      set({ 
        error: err.message || 'Error al crear método de pago',
        isLoadingPaymentMethods: false 
      });
      return null;
    }
  },

  updatePaymentMethod: async (methodId: number, payload: UpdatePaymentMethodPayload) => {
    set({ isLoadingPaymentMethods: true, error: null });

    try {
      const { data, error } = await supabase
        .from('wp_metodos_pago')
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq('id', methodId)
        .select('*')
        .single();

      if (error) throw error;

      const updatedMethod = data as CustomPaymentMethod;
      
      // Refresh to update combined list
      await get().fetchPaymentMethods(updatedMethod.empresa_id, true);

      set({ isLoadingPaymentMethods: false });
      return updatedMethod;

    } catch (err: any) {
      logger.error('[FinanceStore] Error updating payment method:', err);
      set({ 
        error: err.message || 'Error al actualizar método de pago',
        isLoadingPaymentMethods: false 
      });
      return null;
    }
  },

  deletePaymentMethod: async (methodId: number) => {
    const method = get().customPaymentMethods.find(m => m.id === methodId);
    
    set({ isLoadingPaymentMethods: true, error: null });

    try {
      const { error } = await supabase
        .from('wp_metodos_pago')
        .delete()
        .eq('id', methodId);

      if (error) throw error;

      // Refresh to update combined list
      if (method) {
        await get().fetchPaymentMethods(method.empresa_id, true);
      }

      set({ isLoadingPaymentMethods: false });
      return true;

    } catch (err: any) {
      logger.error('[FinanceStore] Error deleting payment method:', err);
      set({ 
        error: err.message || 'Error al eliminar método de pago',
        isLoadingPaymentMethods: false 
      });
      return false;
    }
  },

  // ============================================================================
  // UI ACTIONS
  // ============================================================================

  setSelectedService: (service: ServiceWithPayments | null) => {
    set({ selectedService: service });
  },

  clearError: () => {
    set({ error: null });
  },

  resetStore: () => {
    set({
      services: [],
      payments: [],
      selectedService: null,
      contactSummary: null,
      customPaymentMethods: [],
      allPaymentMethodOptions: [...PAYMENT_METHOD_OPTIONS],
      isLoadingPaymentMethods: false,
      isLoading: false,
      isLoadingPayments: false,
      error: null,
      cachedContactId: null,
      cachedEnterpriseId: null,
      lastFetch: null,
      cachedEnterpriseIdForMethods: null
    });
  }
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectServices = (state: FinanceState) => state.services;
export const selectSelectedService = (state: FinanceState) => state.selectedService;
export const selectPayments = (state: FinanceState) => state.payments;
export const selectContactSummary = (state: FinanceState) => state.contactSummary;
export const selectIsLoading = (state: FinanceState) => state.isLoading;
export const selectIsLoadingPayments = (state: FinanceState) => state.isLoadingPayments;
export const selectError = (state: FinanceState) => state.error;
export const selectCustomPaymentMethods = (state: FinanceState) => state.customPaymentMethods;
export const selectAllPaymentMethodOptions = (state: FinanceState) => state.allPaymentMethodOptions;
export const selectIsLoadingPaymentMethods = (state: FinanceState) => state.isLoadingPaymentMethods;
