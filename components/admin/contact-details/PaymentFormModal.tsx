import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { logger } from '@/lib/logger';
import { requestPaymentReceiptDraft, type PaymentReceiptDraftResponse } from '@/lib/payment-email-client';
import { 
  X, 
  CreditCard, 
  Loader2,
  Save,
  DollarSign,
  Calendar,
  FileText,
  Link as LinkIcon,
  Hash,
  Upload,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Plus,
  Check
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useFinanceStore } from '../../../store/financeStore';
import { useContactStore } from '../../../store/contactStore';
import { 
  Payment,
  PaymentStatus,
  CreatePaymentPayload,
  PAYMENT_STATUS_OPTIONS,
  CURRENCY_OPTIONS
} from '../../../types/finance';
import { 
  uploadComprobante, 
  validateFile, 
  formatFileSize,
  ALLOWED_RECEIPT_TYPES,
  MAX_FILE_SIZE 
} from '../../../lib/storage';

interface PaymentFormModalProps {
  serviceId: number;
  contactId: number;
  empresaId: number;
  moneda: string;
  payment?: Payment | null;
  onClose: () => void;
  onSaved?: (payment: Payment, draftResult: PaymentReceiptDraftResponse | null) => void;
}

export const PaymentFormModal: React.FC<PaymentFormModalProps> = ({ 
  serviceId,
  contactId,
  empresaId,
  moneda,
  payment, 
  onClose,
  onSaved
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New payment method state
  const [showNewMethodForm, setShowNewMethodForm] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');
  const [isCreatingMethod, setIsCreatingMethod] = useState(false);
  
  const [formData, setFormData] = useState({
    monto: '',
    moneda: moneda || 'USD',
    fecha_pago: new Date().toISOString().split('T')[0],
    metodo_pago: 'transferencia',
    referencia: '',
    estado: 'confirmado' as PaymentStatus,
    nota: '',
    comprobante_url: ''
  });

  const createPayment = useFinanceStore(state => state.createPayment);
  const updatePayment = useFinanceStore(state => state.updatePayment);
  const fetchPaymentMethods = useFinanceStore(state => state.fetchPaymentMethods);
  const createPaymentMethod = useFinanceStore(state => state.createPaymentMethod);
  const allPaymentMethodOptions = useFinanceStore(state => state.allPaymentMethodOptions);
  const isLoadingPaymentMethods = useFinanceStore(state => state.isLoadingPaymentMethods);
  const userContext = useContactStore(state => state.userContext);

  // Load payment methods on mount
  useEffect(() => {
    fetchPaymentMethods(empresaId);
  }, [empresaId, fetchPaymentMethods]);

  const isEditing = !!payment;

  useEffect(() => {
    if (payment) {
      setFormData({
        monto: payment.monto?.toString() || '',
        moneda: payment.moneda || moneda || 'USD',
        fecha_pago: payment.fecha_pago ? payment.fecha_pago.split('T')[0] : '',
        metodo_pago: payment.metodo_pago || 'transferencia',
        referencia: payment.referencia || '',
        estado: payment.estado || 'confirmado',
        nota: payment.nota || '',
        comprobante_url: payment.comprobante_url || ''
      });
      // Set preview for existing receipt
      if (payment.comprobante_url) {
        setPreviewUrl(payment.comprobante_url);
      }
      setRemoveExistingReceipt(false);
    }
  }, [payment, moneda]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    
    const validation = validateFile(file, ALLOWED_RECEIPT_TYPES, MAX_FILE_SIZE);
    if (!validation.valid) {
      setUploadError(validation.error || 'Archivo no válido');
      return;
    }

    setSelectedFile(file);
    setRemoveExistingReceipt(false);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleRemoveFile = () => {
    const hadSelectedFile = Boolean(selectedFile);
    setSelectedFile(null);
    if (hadSelectedFile) {
      setPreviewUrl(formData.comprobante_url || null);
    } else {
      setPreviewUrl(null);
      setFormData(prev => ({ ...prev, comprobante_url: '' }));
      setRemoveExistingReceipt(true);
    }
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile) return formData.comprobante_url || null;

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await uploadComprobante(
        selectedFile,
        empresaId,
        contactId,
        payment?.id
      );

      if (!result.success) {
        setUploadError(result.error || 'Error al subir archivo');
        return null;
      }

      return result.url || null;
    } catch (err: any) {
      setUploadError(err.message || 'Error inesperado');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    
    if (!formData.monto || parseFloat(formData.monto) <= 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload file first if selected
      let comprobanteUrl: string | null | undefined = removeExistingReceipt
        ? null
        : (formData.comprobante_url.trim() || undefined);
      if (selectedFile) {
        const uploadedUrl = await uploadFile();
        if (!uploadedUrl) {
          setIsSubmitting(false);
          return;
        }
        comprobanteUrl = uploadedUrl;
      }

      let savedPayment: Payment | null = null;

      if (isEditing && payment) {
        savedPayment = await updatePayment(payment.id, {
          monto: parseFloat(formData.monto),
          fecha_pago: formData.fecha_pago || undefined,
          metodo_pago: formData.metodo_pago || undefined,
          referencia: formData.referencia.trim() || undefined,
          estado: formData.estado,
          nota: formData.nota.trim() || undefined,
          comprobante_url: comprobanteUrl
        });
      } else {
        const payload: CreatePaymentPayload = {
          empresa_id: empresaId,
          servicio_id: serviceId,
          contacto_id: contactId,
          monto: parseFloat(formData.monto),
          moneda: formData.moneda,
          fecha_pago: formData.fecha_pago || undefined,
          metodo_pago: formData.metodo_pago || undefined,
          referencia: formData.referencia.trim() || undefined,
          estado: formData.estado,
          nota: formData.nota.trim() || undefined,
          comprobante_url: comprobanteUrl || undefined,
          registrado_por: userContext?.id
        };
        savedPayment = await createPayment(payload);
      }

      let draftResult: PaymentReceiptDraftResponse | null = null;

      if (savedPayment?.estado === 'confirmado') {
        try {
          draftResult = await requestPaymentReceiptDraft(savedPayment.id);
        } catch (draftError) {
          logger.error('[PaymentFormModal] Error preparing payment receipt draft:', draftError);
        }
      }

      if (savedPayment) {
        onSaved?.(savedPayment, draftResult);
      }

      onClose();
    } catch (error) {
      logger.error('[PaymentFormModal] Error saving payment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currencySymbol = CURRENCY_OPTIONS.find(c => c.value === formData.moneda)?.symbol || '$';

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CreditCard className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="font-semibold text-zinc-100">
              {isEditing ? 'Editar Pago' : 'Registrar Pago'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Monto y Moneda */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Monto *
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  name="monto"
                  value={formData.monto}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full pl-8 pr-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                             text-zinc-100 placeholder-zinc-500
                             focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Moneda
              </label>
              <select
                name="moneda"
                value={formData.moneda}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 focus:outline-none focus:border-emerald-500/50"
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.value}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fecha de Pago */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Fecha de Pago
              </span>
            </label>
            <input
              type="date"
              name="fecha_pago"
              value={formData.fecha_pago}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                         text-zinc-100 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Método de Pago - Fila completa para mostrar botón + */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Método de Pago
            </label>
            {!showNewMethodForm ? (
              <div className="flex gap-2">
                <select
                  name="metodo_pago"
                  value={formData.metodo_pago}
                  onChange={handleChange}
                  disabled={isLoadingPaymentMethods}
                  className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                             text-zinc-100 focus:outline-none focus:border-emerald-500/50
                             disabled:opacity-50"
                >
                  {allPaymentMethodOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}{opt.isCustom ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewMethodForm(true)}
                  className="px-3 py-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 
                             border border-white/10 rounded-lg transition-colors flex items-center gap-1.5"
                  title="Agregar nuevo método"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs">Nuevo</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMethodName}
                    onChange={(e) => setNewMethodName(e.target.value)}
                    placeholder="Ej: Criptomonedas, Nequi..."
                    autoFocus
                    className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                               text-zinc-100 placeholder-zinc-500
                               focus:outline-none focus:border-emerald-500/50"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newMethodName.trim()) return;
                      setIsCreatingMethod(true);
                      const result = await createPaymentMethod({
                        empresa_id: empresaId,
                        codigo: newMethodName.trim(),
                        nombre: newMethodName.trim(),
                        created_by: userContext?.id
                      });
                      setIsCreatingMethod(false);
                      if (result) {
                        setFormData(prev => ({ ...prev, metodo_pago: result.codigo }));
                        setNewMethodName('');
                        setShowNewMethodForm(false);
                      }
                    }}
                    disabled={!newMethodName.trim() || isCreatingMethod}
                    className="p-2 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 
                               rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isCreatingMethod ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewMethodForm(false);
                      setNewMethodName('');
                    }}
                    className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 
                               border border-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  El nuevo método se guardará para toda tu empresa
                </p>
              </div>
            )}
          </div>

          {/* Referencia y Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Referencia / Nro. Operación
                </span>
              </label>
              <input
                type="text"
                name="referencia"
                value={formData.referencia}
                onChange={handleChange}
                placeholder="Ej: OP-123456"
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Estado
              </label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 focus:outline-none focus:border-emerald-500/50"
              >
                {PAYMENT_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Comprobante Upload */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                Comprobante de Pago
              </span>
            </label>
            
            {/* File Input Area */}
            <div className="space-y-2">
              {/* Upload Zone */}
              {!selectedFile && !previewUrl && (
                <label
                  className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed 
                             border-white/10 rounded-lg cursor-pointer hover:border-emerald-500/30 
                             hover:bg-emerald-500/5 transition-colors"
                >
                  <Upload className="w-6 h-6 text-zinc-500 mb-1" />
                  <span className="text-xs text-zinc-500">Arrastra o haz clic para subir</span>
                  <span className="text-[10px] text-zinc-600 mt-0.5">JPG, PNG, PDF (máx. 5MB)</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}

              {/* Preview */}
              {(selectedFile || previewUrl) && (
                <div className="relative bg-zinc-800/50 border border-white/10 rounded-lg p-2">
                  <div className="flex items-center gap-3">
                    {previewUrl && previewUrl.startsWith('data:image') ? (
                      <Image 
                        src={previewUrl} 
                        alt="Preview" 
                        width={64}
                        height={64}
                        className="w-16 h-16 object-cover rounded-md"
                        unoptimized
                      />
                    ) : previewUrl ? (
                      <div className="w-16 h-16 bg-zinc-700 rounded-md flex items-center justify-center">
                        <FileText className="w-6 h-6 text-zinc-400" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 bg-zinc-700 rounded-md flex items-center justify-center">
                        <FileText className="w-6 h-6 text-zinc-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {selectedFile ? (
                        <>
                          <p className="text-sm text-zinc-200 truncate">{selectedFile.name}</p>
                          <p className="text-xs text-zinc-500">{formatFileSize(selectedFile.size)}</p>
                          <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Listo para subir
                          </p>
                        </>
                      ) : previewUrl ? (
                        <>
                          <p className="text-sm text-zinc-200 truncate">Comprobante existente</p>
                          <a 
                            href={previewUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                          >
                            Ver archivo <ExternalLink className="w-3 h-3" />
                          </a>
                          {removeExistingReceipt && (
                            <p className="text-[10px] text-amber-400 mt-1">Se eliminará al guardar.</p>
                          )}
                        </>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Change file button */}
                  <label className="mt-2 block">
                    <span className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer">
                      Cambiar archivo
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Upload Error */}
              {uploadError && (
                <p className="text-xs text-rose-400 mt-1">{uploadError}</p>
              )}

              {removeExistingReceipt && !selectedFile && !previewUrl && (
                <p className="text-xs text-amber-400 mt-1">El comprobante actual se eliminará al guardar.</p>
              )}

              {/* Manual URL Option */}
              {!selectedFile && (
                <div className="pt-2 border-t border-white/5">
                  <label className="block text-[10px] text-zinc-500 mb-1">
                    O ingresa una URL manualmente:
                  </label>
                  <input
                    type="url"
                    name="comprobante_url"
                    value={formData.comprobante_url}
                    onChange={handleChange}
                    placeholder="https://..."
                    className="w-full px-3 py-1.5 text-xs bg-zinc-800/30 border border-white/5 rounded-md
                               text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Nota */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Nota (opcional)
              </span>
            </label>
            <textarea
              name="nota"
              value={formData.nota}
              onChange={handleChange}
              placeholder="Observaciones sobre este pago..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                         text-zinc-100 placeholder-zinc-500 resize-none
                         focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isUploading || !formData.monto || parseFloat(formData.monto) <= 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                       bg-emerald-500 text-white hover:bg-emerald-600
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEditing ? 'Guardar Cambios' : 'Registrar Pago'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
