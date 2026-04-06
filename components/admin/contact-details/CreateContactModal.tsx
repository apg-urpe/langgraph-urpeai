'use client';

import React, { useState, useCallback } from 'react';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Building2,
  AlertTriangle
} from 'lucide-react';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext, selectIsObservationMode } from '../../../store/contactStore';
import { normalizePhone } from '@/lib/ui-helpers';

interface CreateContactModalProps {
  onClose: () => void;
  onSuccess?: (contactId: number) => void;
}

// Opciones para es_calificado dropdown (constraint BD: 'si', 'no', 'evaluando')
const CALIFICACION_OPTIONS = [
  { value: 'evaluando', label: 'Evaluando', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'si', label: 'Calificado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'no', label: 'No calificado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
];

// Opciones para estado del contacto
const ESTADO_OPTIONS = [
  { value: 'prospecto', label: 'Prospecto', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'cliente', label: 'Cliente', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'rembolsos solicitado', label: 'Rembolsos Solicitado', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'rembolso realizado', label: 'Rembolso Realizado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { value: 'rechazado', label: 'Rechazado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
];

// Opciones de origen
const ORIGEN_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web', label: 'Sitio Web' },
  { value: 'referido', label: 'Referido' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'manual', label: 'Manual' },
  { value: 'otro', label: 'Otro' },
];

export const CreateContactModal: React.FC<CreateContactModalProps> = ({ onClose, onSuccess }) => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const isObservationMode = useContactStore(selectIsObservationMode);
  const createContact = useContactStore(state => state.createContact);
  
  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    email: '',
    estado: 'prospecto',
    es_calificado: 'evaluando',
    origen: 'manual',
    notas: '',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const handleChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const phoneDigits = normalizePhone(formData.telefono);
    const phoneValue = phoneDigits.length > 0 ? phoneDigits : null;
    
    // Validation
    if (!formData.nombre.trim() && phoneDigits.length === 0) {
      setError('Se requiere al menos nombre o teléfono');
      return;
    }
    
    if (!selectedEnterpriseId) {
      setError('No hay empresa seleccionada');
      return;
    }
    
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const result = await createContact({
        nombre: formData.nombre.trim() || null,
        apellido: formData.apellido.trim() || null,
        telefono: phoneValue,
        email: formData.email.trim() || null,
        estado: formData.estado,
        es_calificado: formData.es_calificado,
        origen: formData.origen,
        notas: formData.notas.trim() || null,
        empresa_id: selectedEnterpriseId,
        team_humano_id: userContext?.id || null,
      });
      
      if (result.success && result.contact) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.(result.contact!.id);
          onClose();
        }, 800);
      } else {
        setError(result.error || 'Error al crear el contacto');
      }
    } catch (err) {
      console.error('[CreateContactModal] Exception:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error de conexión con el servidor';
      setError(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-lg bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 px-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0c]">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary-400" />
            </div>
            Nuevo Contacto
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Observation Mode Banner */}
          {isObservationMode && (
            <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-cyan-400 font-medium">Empresa Externa</p>
                <p className="text-[10px] text-cyan-400/70">El contacto se creará en esta empresa.</p>
              </div>
            </div>
          )}

          {/* Información Personal */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 space-y-3">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3 h-3" />
              Información Personal
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Nombre */}
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Nombre</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => handleChange('nombre', e.target.value)}
                  placeholder="Juan"
                  className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                  autoFocus
                />
              </div>
              
              {/* Apellido */}
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Apellido</label>
                <input
                  type="text"
                  value={formData.apellido}
                  onChange={(e) => handleChange('apellido', e.target.value)}
                  placeholder="Pérez"
                  className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                />
              </div>
            </div>
            
            {/* Teléfono */}
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                Teléfono
              </label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => handleChange('telefono', e.target.value)}
                placeholder="+51 999 999 999"
                inputMode="numeric"
                className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors"
              />
              <p className="mt-1 text-[10px] text-zinc-500">Incluye el código de país. Se guarda solo con dígitos.</p>
            </div>
            
            {/* Email */}
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="juan@ejemplo.com"
                className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors"
              />
            </div>
          </div>
          
          {/* Estado y Clasificación */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 space-y-3">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3 h-3" />
              Clasificación
            </h3>
            
            <div className="grid grid-cols-3 gap-3">
              {/* Estado */}
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Estado</label>
                <select
                  value={formData.estado}
                  onChange={(e) => handleChange('estado', e.target.value)}
                  className={`w-full text-xs px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none transition-colors bg-zinc-800/50 ${
                    ESTADO_OPTIONS.find(o => o.value === formData.estado)?.color || 'text-zinc-400 border-white/10'
                  }`}
                >
                  {ESTADO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Calificación */}
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Calificación</label>
                <select
                  value={formData.es_calificado}
                  onChange={(e) => handleChange('es_calificado', e.target.value)}
                  className={`w-full text-xs px-2 py-1.5 rounded-lg border cursor-pointer focus:outline-none transition-colors bg-zinc-800/50 ${
                    CALIFICACION_OPTIONS.find(o => o.value === formData.es_calificado)?.color || 'text-zinc-400 border-white/10'
                  }`}
                >
                  {CALIFICACION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Origen */}
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Origen</label>
                <select
                  value={formData.origen}
                  onChange={(e) => handleChange('origen', e.target.value)}
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-white/10 cursor-pointer focus:outline-none transition-colors bg-zinc-800/50 text-zinc-300"
                >
                  {ORIGEN_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Notas */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 space-y-2">
            <label className="block text-[10px] text-zinc-500">Notas (opcional)</label>
            <textarea
              value={formData.notas}
              onChange={(e) => handleChange('notas', e.target.value)}
              placeholder="Información adicional sobre el contacto..."
              rows={2}
              className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors resize-none"
            />
          </div>
          
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          
          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              ¡Contacto creado exitosamente!
            </div>
          )}
        </form>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/5 bg-[#0a0a0c] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || success}
            className="px-4 py-2 text-xs font-medium bg-primary-500/20 text-primary-400 border border-primary-500/30 rounded-lg hover:bg-primary-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Creando...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Creado
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Crear Contacto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
