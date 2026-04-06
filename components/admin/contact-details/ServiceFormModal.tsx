import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { 
  X, 
  Package, 
  Loader2,
  Save,
  DollarSign,
  Calendar,
  FileText,
  Link as LinkIcon
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useFinanceStore } from '../../../store/financeStore';
import { useContactStore } from '../../../store/contactStore';
import { 
  Service, 
  ServiceStatus,
  CreateServicePayload,
  SERVICE_STATUS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  CURRENCY_OPTIONS
} from '../../../types/finance';

interface ServiceFormModalProps {
  contactId: number;
  service?: Service | null;
  onClose: () => void;
}

export const ServiceFormModal: React.FC<ServiceFormModalProps> = ({ 
  contactId, 
  service, 
  onClose 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre_servicio: '',
    tipo_servicio: 'general',
    descripcion: '',
    moneda: 'USD',
    valor_total: '',
    cuota_mensual: '',
    estado: 'activo' as ServiceStatus,
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: '',
    dia_compromiso_pago: '',
    contrato_url: ''
  });

  const createService = useFinanceStore(state => state.createService);
  const updateService = useFinanceStore(state => state.updateService);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const userContext = useContactStore(state => state.userContext);

  const isEditing = !!service;
  const monthlyFeeValue = formData.cuota_mensual.trim();
  const parsedMonthlyFee = monthlyFeeValue === '' ? null : Number.parseFloat(monthlyFeeValue);
  const hasMonthlyFee = parsedMonthlyFee !== null;
  const isMonthlyFeeInvalid = hasMonthlyFee
    ? Number.isNaN(parsedMonthlyFee as number) || parsedMonthlyFee < 0
    : false;
  const commitmentDayValue = formData.dia_compromiso_pago.trim();
  const parsedCommitmentDay = commitmentDayValue === '' ? null : Number.parseInt(commitmentDayValue, 10);
  const hasCommitmentDay = parsedCommitmentDay !== null;
  const isCommitmentDayInvalid = hasCommitmentDay
    ? Number.isNaN(parsedCommitmentDay as number) || parsedCommitmentDay < 1 || parsedCommitmentDay > 31
    : false;

  useEffect(() => {
    if (service) {
      setFormData({
        nombre_servicio: service.nombre_servicio || '',
        tipo_servicio: service.tipo_servicio || 'general',
        descripcion: service.descripcion || '',
        moneda: service.moneda || 'USD',
        valor_total: service.valor_total?.toString() || '',
        cuota_mensual: service.cuota_mensual?.toString() || '',
        estado: service.estado || 'activo',
        fecha_inicio: service.fecha_inicio ? service.fecha_inicio.split('T')[0] : '',
        fecha_fin: service.fecha_fin ? service.fecha_fin.split('T')[0] : '',
        dia_compromiso_pago: service.dia_compromiso_pago?.toString() || '',
        contrato_url: service.contrato_url || ''
      });
    }
  }, [service]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nombre_servicio.trim() || !formData.valor_total) {
      return;
    }

    if (isCommitmentDayInvalid) {
      return;
    }

    if (isMonthlyFeeInvalid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && service) {
        await updateService(service.id, {
          nombre_servicio: formData.nombre_servicio.trim(),
          tipo_servicio: formData.tipo_servicio,
          descripcion: formData.descripcion.trim() || undefined,
          moneda: formData.moneda,
          valor_total: parseFloat(formData.valor_total),
          cuota_mensual: parsedMonthlyFee,
          estado: formData.estado,
          fecha_inicio: formData.fecha_inicio || undefined,
          fecha_fin: formData.fecha_fin || undefined,
          dia_compromiso_pago: parsedCommitmentDay,
          contrato_url: formData.contrato_url.trim() || undefined
        });
      } else {
        const payload: CreateServicePayload = {
          empresa_id: selectedEnterpriseId!,
          contacto_id: contactId,
          nombre_servicio: formData.nombre_servicio.trim(),
          tipo_servicio: formData.tipo_servicio,
          descripcion: formData.descripcion.trim() || undefined,
          moneda: formData.moneda,
          valor_total: parseFloat(formData.valor_total),
          cuota_mensual: parsedMonthlyFee,
          estado: formData.estado,
          fecha_inicio: formData.fecha_inicio || undefined,
          fecha_fin: formData.fecha_fin || undefined,
          dia_compromiso_pago: parsedCommitmentDay,
          contrato_url: formData.contrato_url.trim() || undefined,
          created_by: userContext?.id
        };
        await createService(payload);
      }
      onClose();
    } catch (error) {
      logger.error('[ServiceFormModal] Error saving service:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Package className="w-5 h-5 text-primary-400" />
            </div>
            <h2 className="font-semibold text-zinc-100">
              {isEditing ? 'Editar Servicio' : 'Nuevo Servicio'}
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
          {/* Nombre del Servicio */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Nombre del Servicio *
            </label>
            <input
              type="text"
              name="nombre_servicio"
              value={formData.nombre_servicio}
              onChange={handleChange}
              placeholder="Ej: Consultoría SEO Mensual"
              required
              className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                         text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20"
            />
          </div>

          {/* Tipo y Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Tipo de Servicio
              </label>
              <select
                name="tipo_servicio"
                value={formData.tipo_servicio}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 focus:outline-none focus:border-primary-500/50"
              >
                {SERVICE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
                           text-zinc-100 focus:outline-none focus:border-primary-500/50"
              >
                {SERVICE_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Valor y Moneda */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Valor Total *
                </span>
              </label>
              <input
                type="number"
                name="valor_total"
                value={formData.valor_total}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                required
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:border-primary-500/50"
              />
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
                           text-zinc-100 focus:outline-none focus:border-primary-500/50"
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Monto mensual propuesto
              </span>
            </label>
            <input
              type="number"
              name="cuota_mensual"
              value={formData.cuota_mensual}
              onChange={handleChange}
              placeholder="0.00"
              min="0"
              step="0.01"
              className={`w-full px-3 py-2 text-sm bg-zinc-800/50 border rounded-lg
                         text-zinc-100 placeholder-zinc-500
                         focus:outline-none ${isMonthlyFeeInvalid ? 'border-rose-500/40 focus:border-rose-500/50' : 'border-white/10 focus:border-primary-500/50'}`}
            />
            <p className={`mt-1 text-[11px] ${isMonthlyFeeInvalid ? 'text-rose-400' : 'text-zinc-500'}`}>
              {isMonthlyFeeInvalid ? 'Ingresa un monto válido mayor o igual a 0.' : 'Opcional. Sirve como monto mensual sugerido para cobranza y seguimiento.'}
            </p>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Fecha Inicio
                </span>
              </label>
              <input
                type="date"
                name="fecha_inicio"
                value={formData.fecha_inicio}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 focus:outline-none focus:border-primary-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Fecha Fin
                </span>
              </label>
              <input
                type="date"
                name="fecha_fin"
                value={formData.fecha_fin}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 focus:outline-none focus:border-primary-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Día Compromiso de Pago
              </span>
            </label>
            <input
              type="number"
              name="dia_compromiso_pago"
              value={formData.dia_compromiso_pago}
              onChange={handleChange}
              placeholder="Ej: 5"
              min="1"
              max="31"
              className={`w-full px-3 py-2 text-sm bg-zinc-800/50 border rounded-lg
                         text-zinc-100 placeholder-zinc-500
                         focus:outline-none ${isCommitmentDayInvalid ? 'border-rose-500/40 focus:border-rose-500/50' : 'border-white/10 focus:border-primary-500/50'}`}
            />
            <p className={`mt-1 text-[11px] ${isCommitmentDayInvalid ? 'text-rose-400' : 'text-zinc-500'}`}>
              {isCommitmentDayInvalid ? 'Ingresa un día entre 1 y 31.' : 'Opcional. Útil para seguimiento mensual de cartera.'}
            </p>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Descripción
              </span>
            </label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              placeholder="Descripción del servicio..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                         text-zinc-100 placeholder-zinc-500 resize-none
                         focus:outline-none focus:border-primary-500/50"
            />
          </div>

          {/* URL Contrato */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              <span className="flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                URL del Contrato
              </span>
            </label>
            <input
              type="url"
              name="contrato_url"
              value={formData.contrato_url}
              onChange={handleChange}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                         text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:border-primary-500/50"
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
            disabled={isSubmitting || !formData.nombre_servicio.trim() || !formData.valor_total || isCommitmentDayInvalid || isMonthlyFeeInvalid}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                       bg-primary-500 text-white hover:bg-primary-600
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEditing ? 'Guardar Cambios' : 'Crear Servicio'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
