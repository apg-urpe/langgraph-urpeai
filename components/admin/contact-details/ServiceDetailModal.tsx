import React, { useCallback, useEffect, useState } from 'react';
import { 
  X, 
  Package, 
  DollarSign, 
  Calendar, 
  FileText, 
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  CreditCard,
  Receipt,
  User,
  FileDown,
  Mail,
  FileEdit,
  Send
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useFinanceStore, selectSelectedService, selectIsLoadingPayments, selectError } from '../../../store/financeStore';
import { useContactStore } from '../../../store/contactStore';
import { useInvoiceStore } from '../../../store/invoiceStore';
import { supabase } from '../../../lib/supabase-client';
import { getPaymentReceiptSummary, isPaymentReceiptEmailMetadata } from '../../../lib/email-metadata';
import { 
  Service,
  Payment,
  formatCurrency, 
  formatCommitmentDayLabel,
  getServiceCommitmentInfo,
  SERVICE_STATUS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS
} from '../../../types/finance';
import { PaymentFormModal } from './PaymentFormModal';
import { PaymentReceiptEmailModal } from './PaymentReceiptEmailModal';
import { InvoicePreviewModal } from '../invoices/InvoicePreviewModal';
import { InvoicesList } from '../invoices/InvoicesList';
import { MinimalErrorBoundary } from '../../ErrorBoundary';
import { requestPaymentReceiptDraft, type PaymentReceiptDraftResponse } from '../../../lib/payment-email-client';

interface ServiceDetailModalProps {
  serviceId: number;
  onClose: () => void;
  onEdit: (service: Service) => void;
}

interface PaymentReceiptStatusEntry {
  emailId: number;
  state: string;
}

export const ServiceDetailModal: React.FC<ServiceDetailModalProps> = ({ 
  serviceId, 
  onClose,
  onEdit 
}) => {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [paymentReceiptEmailId, setPaymentReceiptEmailId] = useState<number | null>(null);
  const [preparingPaymentEmailId, setPreparingPaymentEmailId] = useState<number | null>(null);
  const [paymentReceiptStatusMap, setPaymentReceiptStatusMap] = useState<Record<number, PaymentReceiptStatusEntry>>({});

  const serviceWithPayments = useFinanceStore(selectSelectedService);
  const isLoading = useFinanceStore(selectIsLoadingPayments);
  const error = useFinanceStore(selectError);
  const fetchServiceWithPayments = useFinanceStore(state => state.fetchServiceWithPayments);
  const deletePayment = useFinanceStore(state => state.deletePayment);
  const deleteService = useFinanceStore(state => state.deleteService);
  const allPaymentMethodOptions = useFinanceStore(state => state.allPaymentMethodOptions);
  const fetchPaymentMethods = useFinanceStore(state => state.fetchPaymentMethods);
  
  // Get contact info for invoice
  const activeContact = useContactStore(state => state.activeContact);
  
  // Invoice store for refreshing list after generation
  const fetchInvoicesByService = useInvoiceStore(state => state.fetchInvoicesByService);

  useEffect(() => {
    if (serviceWithPayments?.id === serviceId && Array.isArray(serviceWithPayments.pagos)) {
      return;
    }

    fetchServiceWithPayments(serviceId);
  }, [serviceId, serviceWithPayments, fetchServiceWithPayments]);

  // Load payment methods to display correct labels
  useEffect(() => {
    if (serviceWithPayments?.empresa_id) {
      fetchPaymentMethods(serviceWithPayments.empresa_id);
    }
  }, [serviceWithPayments?.empresa_id, fetchPaymentMethods]);

  const loadPaymentReceiptStatuses = useCallback(async () => {
    if (!serviceWithPayments?.contacto_id) {
      setPaymentReceiptStatusMap({});
      return;
    }

    const paymentIds = new Set((serviceWithPayments.pagos || []).map(payment => payment.id));
    if (paymentIds.size === 0) {
      setPaymentReceiptStatusMap({});
      return;
    }

    try {
      const { data, error: loadError } = await supabase
        .from('wp_email_envio')
        .select('id, estado, created_at, enviado_en, metadata')
        .eq('contacto_id', serviceWithPayments.contacto_id)
        .order('created_at', { ascending: false });

      if (loadError) {
        throw loadError;
      }

      const nextStatusMap: Record<number, PaymentReceiptStatusEntry> = {};

      for (const row of data || []) {
        if (!isPaymentReceiptEmailMetadata(row.metadata)) {
          continue;
        }

        const summary = getPaymentReceiptSummary(row.metadata);
        const paymentId = summary?.paymentId;

        if (!paymentId || !paymentIds.has(paymentId)) {
          continue;
        }

        const currentEntry = nextStatusMap[paymentId];
        const currentPriority = currentEntry ? (currentEntry.state === 'borrador' ? 0 : 1) : -1;
        const nextPriority = row.estado === 'borrador' ? 0 : 1;

        if (!currentEntry || nextPriority > currentPriority) {
          nextStatusMap[paymentId] = {
            emailId: row.id,
            state: row.estado
          };
        }
      }

      setPaymentReceiptStatusMap(nextStatusMap);
    } catch (loadError) {
      console.error('Error loading payment receipt email statuses:', loadError);
    }
  }, [serviceWithPayments?.contacto_id, serviceWithPayments?.pagos]);

  useEffect(() => {
    void loadPaymentReceiptStatuses();
  }, [loadPaymentReceiptStatuses]);

  const getStatusConfig = (status: string) => {
    return SERVICE_STATUS_OPTIONS.find(s => s.value === status) || SERVICE_STATUS_OPTIONS[0];
  };

  const getPaymentStatusConfig = (status: string) => {
    return PAYMENT_STATUS_OPTIONS.find(s => s.value === status) || PAYMENT_STATUS_OPTIONS[0];
  };

  const getPaymentMethodLabel = (method: string | null | undefined) => {
    if (!method) return '-';
    return allPaymentMethodOptions.find(m => m.value === method)?.label || method;
  };

  const getTypeLabel = (type: string) => {
    return SERVICE_TYPE_OPTIONS.find(t => t.value === type)?.label || type;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDueDate = (date: Date | null) => {
    if (!date) return 'Sin fecha';
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getCommitmentStatusConfig = (service: Service) => {
    const commitmentInfo = getServiceCommitmentInfo(service);

    switch (commitmentInfo.status) {
      case 'pagado':
        return {
          label: 'Sin saldo',
          color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
          commitmentInfo,
        };
      case 'vence_hoy':
        return {
          label: 'Vence hoy',
          color: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
          commitmentInfo,
        };
      case 'en_mora':
        return {
          label: `${commitmentInfo.daysOverdue}d en mora`,
          color: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
          commitmentInfo,
        };
      case 'al_dia':
        return {
          label: `Vence ${formatDueDate(commitmentInfo.dueDate)}`,
          color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
          commitmentInfo,
        };
      default:
        return {
          label: 'Sin definir',
          color: 'text-zinc-300 bg-white/5 border-white/10',
          commitmentInfo,
        };
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    const success = await deletePayment(paymentId);
    if (success) {
      setConfirmDelete(null);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceWithPayments) return;
    const confirm = window.confirm(
      '¿Estás seguro de eliminar este servicio? Se eliminarán también todos los pagos asociados.'
    );
    if (confirm) {
      const success = await deleteService(serviceWithPayments.id);
      if (success) onClose();
    }
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setShowPaymentForm(true);
  };

  const handleClosePaymentForm = () => {
    setShowPaymentForm(false);
    setEditingPayment(null);
  };

  const handlePaymentDraftResult = (paymentId: number, draftResult: PaymentReceiptDraftResponse | null) => {
    if (typeof draftResult?.draftId === 'number') {
      const draftEmailId = draftResult.draftId;
      const draftState = draftResult.status || 'borrador';

      setPaymentReceiptStatusMap(current => ({
        ...current,
        [paymentId]: {
          emailId: draftEmailId,
          state: draftState
        }
      }));
      setPaymentReceiptEmailId(draftEmailId);
      return;
    }

    if (draftResult?.message) {
      window.alert(draftResult.message);
    }
  };

  const handlePaymentSaved = (payment: Payment, draftResult: PaymentReceiptDraftResponse | null) => {
    handlePaymentDraftResult(payment.id, draftResult);
  };

  const handleOpenPaymentReceiptEmail = async (payment: Payment) => {
    if (payment.estado !== 'confirmado') {
      window.alert('Solo los pagos confirmados pueden generar comprobante por email.');
      return;
    }

    const existingReceiptEmail = paymentReceiptStatusMap[payment.id];
    if (existingReceiptEmail?.emailId) {
      setPaymentReceiptEmailId(existingReceiptEmail.emailId);
      return;
    }

    setPreparingPaymentEmailId(payment.id);

    try {
      const draftResult = await requestPaymentReceiptDraft(payment.id);
      handlePaymentDraftResult(payment.id, draftResult);
    } catch (draftError: any) {
      window.alert(draftError?.message || 'No se pudo preparar el email de comprobante.');
    } finally {
      setPreparingPaymentEmailId(null);
    }
  };

  if (isLoading || !serviceWithPayments) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 flex flex-col items-center gap-4">
          {error ? (
            <>
              <AlertCircle className="w-8 h-8 text-rose-400" />
              <div className="text-center">
                <p className="text-zinc-200 font-medium">Error al cargar servicio</p>
                <p className="text-sm text-zinc-400 mt-1">{error}</p>
              </div>
              <button 
                onClick={onClose}
                className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 transition-colors"
              >
                Cerrar
              </button>
            </>
          ) : (
            <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
          )}
        </div>
      </div>,
      document.body
    );
  }

  const statusConfig = getStatusConfig(serviceWithPayments.estado);
  const commitmentStatus = getCommitmentStatusConfig(serviceWithPayments);

  if (!serviceId) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" translate="no">
        <div className="relative w-full max-w-2xl max-h-[90vh] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <Package className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="font-semibold text-zinc-100">
                  {serviceWithPayments.nombre_servicio}
                </h2>
                <p className="text-xs text-zinc-500">
                  {getTypeLabel(serviceWithPayments.tipo_servicio)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              <button
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Valor Total</p>
                <p className="text-lg font-semibold text-zinc-100">
                  {formatCurrency(serviceWithPayments.valor_total, serviceWithPayments.moneda)}
                </p>
              </div>
              <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Pagado</p>
                <p className="text-lg font-semibold text-emerald-400">
                  {formatCurrency(serviceWithPayments.saldo_pagado, serviceWithPayments.moneda)}
                </p>
              </div>
              <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">Pendiente</p>
                <p className="text-lg font-semibold text-amber-400">
                  {formatCurrency(serviceWithPayments.saldo_pendiente, serviceWithPayments.moneda)}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">Progreso de Pago</span>
                <span className="text-zinc-200 font-medium">{serviceWithPayments.porcentajePagado}%</span>
              </div>
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    serviceWithPayments.porcentajePagado >= 100 ? 'bg-emerald-500' :
                    serviceWithPayments.porcentajePagado >= 50 ? 'bg-primary-500' :
                    'bg-amber-500'
                  }`}
                  style={{ width: `${serviceWithPayments.porcentajePagado}%` }}
                />
              </div>
            </div>

            {/* Service Details */}
            <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Detalles del Servicio
              </h3>
              
              {serviceWithPayments.descripcion && (
                <p className="text-sm text-zinc-400">
                  {serviceWithPayments.descripcion}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">
                  Compromiso {formatCommitmentDayLabel(serviceWithPayments.dia_compromiso_pago)}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${commitmentStatus.color}`}>
                  {commitmentStatus.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-zinc-500 text-xs">Fecha Inicio</p>
                  <p className="text-zinc-300">{formatDate(serviceWithPayments.fecha_inicio)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Fecha Fin</p>
                  <p className="text-zinc-300">{formatDate(serviceWithPayments.fecha_fin)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Moneda</p>
                  <p className="text-zinc-300">{serviceWithPayments.moneda}</p>
                </div>
                {serviceWithPayments.cuota_mensual != null && serviceWithPayments.cuota_mensual > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs">Monto mensual propuesto</p>
                    <p className="text-zinc-300">{formatCurrency(serviceWithPayments.cuota_mensual, serviceWithPayments.moneda)}</p>
                  </div>
                )}
                <div>
                  <p className="text-zinc-500 text-xs">Creado</p>
                  <p className="text-zinc-300">{formatDate(serviceWithPayments.created_at)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Compromiso</p>
                  <p className="text-zinc-300">{formatCommitmentDayLabel(serviceWithPayments.dia_compromiso_pago)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Estado de cobranza</p>
                  <p className="text-zinc-300">{commitmentStatus.label}</p>
                </div>
              </div>

              {serviceWithPayments.contrato_url && (
                <a
                  href={serviceWithPayments.contrato_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 mt-2"
                >
                  <FileText className="w-4 h-4" />
                  Ver Contrato
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Payments Section */}
            <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Historial de Pagos
                  <span className="text-xs text-zinc-500">({serviceWithPayments.pagos.length})</span>
                </h3>
                <button
                  onClick={() => setShowPaymentForm(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md
                             bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                             hover:bg-emerald-500/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Registrar Pago
                </button>
              </div>

              {serviceWithPayments.pagos.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-sm">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No hay pagos registrados
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {[...serviceWithPayments.pagos]
                    .sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
                    .map((payment) => {
                    const paymentStatus = getPaymentStatusConfig(payment.estado);
                    const paymentReceiptState = paymentReceiptStatusMap[payment.id]?.state;
                    const hasSentReceiptEmail = !!paymentReceiptState && paymentReceiptState !== 'borrador';
                    const hasDraftReceiptEmail = paymentReceiptState === 'borrador';
                    const PaymentReceiptActionIcon = hasSentReceiptEmail ? Send : hasDraftReceiptEmail ? FileEdit : Mail;
                    const paymentReceiptButtonClass = hasSentReceiptEmail
                      ? 'p-1.5 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10 rounded-md disabled:opacity-50 disabled:cursor-not-allowed'
                      : hasDraftReceiptEmail
                        ? 'p-1.5 text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 rounded-md disabled:opacity-50 disabled:cursor-not-allowed'
                        : 'p-1.5 text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md disabled:opacity-50 disabled:cursor-not-allowed';
                    const paymentReceiptTitle = hasSentReceiptEmail
                      ? 'Ver email enviado'
                      : hasDraftReceiptEmail
                        ? 'Abrir borrador de email'
                        : 'Ver email de comprobante';

                    return (
                      <div 
                        key={payment.id}
                        className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-white/5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-zinc-200">
                              {formatCurrency(payment.monto, payment.moneda)}
                            </p>
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full border ${paymentStatus.color}`}>
                              {paymentStatus.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(payment.fecha_pago)}
                            </span>
                            <span>{getPaymentMethodLabel(payment.metodo_pago)}</span>
                            {payment.registrador && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {payment.registrador.nombre}
                              </span>
                            )}
                          </div>
                          {payment.referencia && (
                            <p className="text-xs text-zinc-500 mt-1">
                              Ref: {payment.referencia}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 ml-2">
                          {payment.estado === 'confirmado' && (
                            <button
                              onClick={() => handleOpenPaymentReceiptEmail(payment)}
                              disabled={preparingPaymentEmailId === payment.id}
                              className={paymentReceiptButtonClass}
                              title={paymentReceiptTitle}
                            >
                              {preparingPaymentEmailId === payment.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <PaymentReceiptActionIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          {payment.comprobante_url && (
                            <a
                              href={payment.comprobante_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-md"
                              title="Ver comprobante"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleEditPayment(payment)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-md"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {confirmDelete === payment.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeletePayment(payment.id)}
                                className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md"
                                title="Confirmar"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-md"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(payment.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Invoices Section */}
            <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
              <MinimalErrorBoundary>
                <InvoicesList 
                  serviceId={serviceWithPayments.id}
                  empresaId={serviceWithPayments.empresa_id}
                />
              </MinimalErrorBoundary>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between p-4 border-t border-white/5 shrink-0 bg-zinc-900/80">
            <button
              onClick={handleDeleteService}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar Servicio
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInvoiceModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                           bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                           hover:bg-emerald-500/20 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Generar Factura
              </button>
              <button
                onClick={() => onEdit(serviceWithPayments)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                           bg-primary-500/10 text-primary-400 border border-primary-500/20
                           hover:bg-primary-500/20 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Editar Servicio
              </button>
            </div>
          </div>
        </div>

      {/* Payment Form Modal */}
      {showPaymentForm && serviceWithPayments && (
        <PaymentFormModal
          serviceId={serviceWithPayments.id}
          contactId={serviceWithPayments.contacto_id}
          empresaId={serviceWithPayments.empresa_id}
          moneda={serviceWithPayments.moneda}
          payment={editingPayment}
          onSaved={handlePaymentSaved}
          onClose={handleClosePaymentForm}
        />
      )}

      {paymentReceiptEmailId && serviceWithPayments && (
        <PaymentReceiptEmailModal
          emailId={paymentReceiptEmailId}
          contactId={serviceWithPayments.contacto_id}
          contactEmail={activeContact?.email}
          contactName={[activeContact?.nombre, activeContact?.apellido].filter(Boolean).join(' ') || activeContact?.email || 'Contacto'}
          onClose={() => setPaymentReceiptEmailId(null)}
          onSent={() => {
            void loadPaymentReceiptStatuses();
          }}
        />
      )}

      {/* Invoice Preview Modal */}
      {showInvoiceModal && serviceWithPayments && activeContact && (
        <MinimalErrorBoundary>
        <InvoicePreviewModal
          service={serviceWithPayments}
          contact={{
            id: activeContact.id,
            nombre: activeContact.nombre || '',
            apellido: activeContact.apellido || undefined,
            email: activeContact.email || undefined,
            telefono: activeContact.telefono || undefined
          }}
          onClose={() => setShowInvoiceModal(false)}
          onSuccess={(pdfUrl) => {
            console.log('Invoice generated:', pdfUrl);
            // Refresh invoices list
            if (serviceWithPayments) {
              fetchInvoicesByService(serviceWithPayments.id);
            }
          }}
        />
        </MinimalErrorBoundary>
      )}
    </div>,
    document.body
  );
};
