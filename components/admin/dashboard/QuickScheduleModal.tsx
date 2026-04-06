'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Users,
  Video, 
  MapPin, 
  AlignLeft,
  Loader2,
  CalendarCheck,
  AlertCircle,
  WifiOff,
  Lock,
  CreditCard,
  Settings
} from 'lucide-react';
import { useContactStore } from '@/store/contactStore';
import { Contact } from '@/types/contact';
import { logger } from '@/lib/logger';
import { ContactSearchInput } from '../contacts/ContactSearchInput';

const ERROR_CONFIGS: Record<string, { icon: React.ReactNode; title: string; hint: string; color: string }> = {
  NO_CALENDAR_CONNECTED: {
    icon: <CalendarIcon className="w-4 h-4 shrink-0" />,
    title: 'Calendario no conectado',
    hint: 'Ve a Configuración → Integraciones y conecta tu cuenta de Google o Microsoft.',
    color: 'amber',
  },
  CROSS_ENTERPRISE: {
    icon: <Lock className="w-4 h-4 shrink-0" />,
    title: 'Sin permiso para esta empresa',
    hint: 'Solo puedes crear citas para miembros de tu propia empresa.',
    color: 'red',
  },
  CREDITS_EXHAUSTED: {
    icon: <CreditCard className="w-4 h-4 shrink-0" />,
    title: 'Créditos de Nylas agotados',
    hint: 'Contacta al administrador para recargar los créditos de Nylas.',
    color: 'orange',
  },
  NYLAS_CREATE_FAILED: {
    icon: <AlertCircle className="w-4 h-4 shrink-0" />,
    title: 'Error al crear en el calendario',
    hint: 'Nylas rechazó la solicitud. Verifica que el calendario esté activo y vuelve a intentarlo.',
    color: 'red',
  },
  INVALID_GRANT: {
    icon: <Settings className="w-4 h-4 shrink-0" />,
    title: 'Conexión de calendario expirada',
    hint: 'El acceso al calendario expiró. Reconecta tu cuenta en Configuración → Integraciones.',
    color: 'amber',
  },
  NETWORK_ERROR: {
    icon: <WifiOff className="w-4 h-4 shrink-0" />,
    title: 'Error de conexión',
    hint: 'Verifica tu conexión a internet y vuelve a intentarlo.',
    color: 'red',
  },
};

const COLOR_CLASSES: Record<string, string> = {
  red:    'bg-red-500/10 border-red-500/20 text-red-400',
  amber:  'bg-amber-500/10 border-amber-500/20 text-amber-400',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
};

function AppointmentErrorBanner({ error }: { error: { message: string; code?: string } }) {
  const cfg = error.code ? ERROR_CONFIGS[error.code] : null;
  const colorKey = cfg?.color ?? 'red';
  const colorClass = COLOR_CLASSES[colorKey] ?? COLOR_CLASSES.red;

  if (cfg) {
    return (
      <div className={`p-3 rounded-lg border ${colorClass} text-sm space-y-1`}>
        <div className="flex items-center gap-2 font-semibold">
          {cfg.icon}
          {cfg.title}
        </div>
        <p className="text-xs opacity-80 pl-6">{cfg.hint}</p>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{error.message}</span>
    </div>
  );
}

interface QuickScheduleModalProps {
  onClose: () => void;
  initialDate?: string; // YYYY-MM-DD format
  initialStartTime?: string; // HH:MM format
  initialEndTime?: string; // HH:MM format
  initialTeamMemberId?: number;
  initialContact?: Contact | null; // Pre-selected contact (from contact detail)
  onSuccess?: () => void; // Callback after successful creation
}

export const QuickScheduleModal: React.FC<QuickScheduleModalProps> = ({ 
  onClose,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialTeamMemberId,
  initialContact,
  onSuccess
}) => {
  const formId = 'quick-schedule-form';
  const userContext = useContactStore(s => s.userContext);
  const teamMembers = useContactStore(s => s.teamMembers);
  const selectedEnterpriseId = useContactStore(s => s.selectedEnterpriseId);
  const fetchTeamMembers = useContactStore(s => s.fetchTeamMembers);
  const createAppointment = useContactStore(s => s.createAppointment);

  const [isLoading, setIsLoading] = useState(false);
  
  // Form state - use initial values from props if provided (from calendar click)
  const [formData, setFormData] = useState({
    titulo: initialContact ? `Cita con ${initialContact.nombre || ''} ${initialContact.apellido || ''}`.trim() : '',
    descripcion: '',
    fecha: initialDate || new Date().toISOString().split('T')[0],
    hora_inicio: initialStartTime || '09:00',
    hora_fin: initialEndTime || '09:30',
    contacto_id: initialContact?.id as number | undefined,
    selectedContact: initialContact || null as Contact | null,
    team_humano_id: initialTeamMemberId || userContext?.id || 0,
    tipo: 'videollamada' as 'llamada' | 'videollamada' | 'presencial',
    location: '',
    invitados_ids: [] as number[]
  });

  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (selectedEnterpriseId && teamMembers.length === 0) {
      fetchTeamMembers(false, selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, teamMembers.length, fetchTeamMembers]);

  useEffect(() => {
    if (teamMembers.length === 0) return;

    const availableIds = new Set(teamMembers.map(member => member.id));
    setFormData(prev => {
      if (prev.team_humano_id && availableIds.has(prev.team_humano_id)) {
        return prev;
      }

      const preferredId =
        (initialTeamMemberId && availableIds.has(initialTeamMemberId) && initialTeamMemberId) ||
        (userContext?.id && availableIds.has(userContext.id) && userContext.id) ||
        teamMembers[0].id;

      if (prev.team_humano_id === preferredId) return prev;
      return { ...prev, team_humano_id: preferredId };
    });
  }, [teamMembers, initialTeamMemberId, userContext?.id]);

  const handleSelectContact = (contact: Contact | null) => {
    if (contact) {
      setFormData(prev => ({
        ...prev,
        contacto_id: contact.id,
        selectedContact: contact,
        titulo: prev.titulo || `Cita con ${contact.nombre} ${contact.apellido}`
      }));
      setError(null);
    } else {
      setFormData(prev => ({
        ...prev,
        contacto_id: undefined,
        selectedContact: null
      }));
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const titulo = formData.titulo.trim();

    if (!selectedEnterpriseId) {
      setError({ message: 'No hay empresa seleccionada. Selecciona una empresa antes de agendar.' });
      return;
    }

    if (teamMembers.length === 0) {
      setError({ message: 'No hay asesores disponibles. Recarga la página o revisa la empresa seleccionada.' });
      return;
    }

    if (!titulo || !formData.fecha || !formData.hora_inicio || !formData.hora_fin || !formData.team_humano_id) {
      setError({ message: 'Por favor completa los campos obligatorios' });
      return;
    }

    if (!teamMembers.some(member => member.id === Number(formData.team_humano_id))) {
      setError({ message: 'Selecciona un asesor válido para agendar la cita.' });
      return;
    }

    const startDate = new Date(`${formData.fecha}T${formData.hora_inicio}:00`);
    const endDate = new Date(`${formData.fecha}T${formData.hora_fin}:00`);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError({ message: 'Fecha u hora inválida. Verifica los datos e intenta de nuevo.' });
      return;
    }

    if (endDate <= startDate) {
      setError({ message: 'La hora de fin debe ser mayor que la hora de inicio.' });
      return;
    }

    setIsLoading(true);
    setError(null);

    const fecha_inicio = startDate.toISOString();
    const fecha_fin = endDate.toISOString();

    try {
      const result = await createAppointment({
        titulo,
        descripcion: formData.descripcion,
        fecha_inicio,
        fecha_fin,
        contacto_id: formData.contacto_id,
        team_humano_id: Number(formData.team_humano_id),
        tipo: formData.tipo,
        location: formData.location,
        invitados_ids: formData.invitados_ids.length > 0 ? formData.invitados_ids : undefined
      });

      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError({ message: result.error || 'Error al crear la cita', code: result.code });
      }
    } catch (err: any) {
      setError({ message: err.message || 'Error inesperado', code: 'NETWORK_ERROR' });
    } finally {
      setIsLoading(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative bg-[#0c0c0e] border border-white/10 rounded-2xl w-full max-w-lg max-h-[92vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Agendar Cita</h2>
              <p className="text-xs text-zinc-500">Crea un evento en Nylas y CRM</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label="Cerrar modal de agendado"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id={formId} onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="p-4 sm:p-6 space-y-5">
            {error && <AppointmentErrorBanner error={error} />}

            {/* Contact Selector - Advanced Search */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Contacto (Opcional)</label>
              <ContactSearchInput
                selectedContact={formData.selectedContact}
                onSelectContact={handleSelectContact}
                placeholder="Buscar contacto por nombre, teléfono, email..."
                maxResults={6}
              />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Título de la Cita *</label>
              <input 
                required
                type="text"
                placeholder="Ej: Reunión de seguimiento"
                className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
                value={formData.titulo}
                onChange={(e) => {
                  setError(null);
                  setFormData(prev => ({ ...prev, titulo: e.target.value }));
                }}
              />
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Fecha *</label>
                <input 
                  required
                  type="date"
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  value={formData.fecha}
                  onChange={(e) => {
                    setError(null);
                    setFormData(prev => ({ ...prev, fecha: e.target.value }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Inicio *</label>
                <input 
                  required
                  type="time"
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  value={formData.hora_inicio}
                  onChange={(e) => {
                    setError(null);
                    setFormData(prev => ({ ...prev, hora_inicio: e.target.value }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Fin *</label>
                <input 
                  required
                  type="time"
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  value={formData.hora_fin}
                  onChange={(e) => {
                    setError(null);
                    setFormData(prev => ({ ...prev, hora_fin: e.target.value }));
                  }}
                />
              </div>
            </div>

            {/* Type and Team Member */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tipo</label>
                <select 
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  value={formData.tipo}
                  onChange={(e) => {
                    setError(null);
                    setFormData(prev => ({ ...prev, tipo: e.target.value as any }));
                  }}
                >
                  <option value="videollamada">📹 Videollamada</option>
                  <option value="llamada">📞 Llamada</option>
                  <option value="presencial">🤝 Presencial</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Asignado a *</label>
                <select 
                  required
                  disabled={teamMembers.length === 0}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  value={formData.team_humano_id}
                  onChange={(e) => {
                    setError(null);
                    const newOwnerId = Number(e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      team_humano_id: newOwnerId,
                      invitados_ids: prev.invitados_ids.filter(id => id !== newOwnerId)
                    }));
                  }}
                >
                  {teamMembers.length === 0 ? (
                    <option value={0}>Cargando asesores...</option>
                  ) : (
                    teamMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.nombre} {member.apellido}
                      </option>
                    ))
                  )}
                </select>
                {teamMembers.length === 0 && (
                  <p className="text-[11px] text-amber-400">
                    No hay asesores disponibles para asignar en este momento.
                  </p>
                )}
              </div>
            </div>

            {/* Invited Team Members */}
            {teamMembers.filter(m => m.is_active && m.id !== Number(formData.team_humano_id)).length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Equipo asistente (Opcional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {teamMembers
                    .filter(m => m.is_active && m.id !== Number(formData.team_humano_id))
                    .map(member => {
                      const isSelected = formData.invitados_ids.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              invitados_ids: isSelected
                                ? prev.invitados_ids.filter(id => id !== member.id)
                                : [...prev.invitados_ids, member.id]
                            }));
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                              : 'bg-zinc-900 border-white/5 text-zinc-400 hover:border-white/10 hover:text-zinc-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            isSelected ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-800 text-zinc-500'
                          }`}>
                            {member.nombre?.charAt(0)}{member.apellido?.charAt(0)}
                          </div>
                          {member.nombre} {member.apellido}
                        </button>
                      );
                    })}
                </div>
                {formData.invitados_ids.length > 0 && (
                  <p className="text-[11px] text-sky-400/70">
                    {formData.invitados_ids.length} integrante{formData.invitados_ids.length > 1 ? 's' : ''} del equipo — verán esta cita en su calendario
                  </p>
                )}
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Descripción (Opcional)</label>
              <textarea 
                rows={3}
                placeholder="Detalles adicionales sobre la cita..."
                className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none"
                value={formData.descripcion}
                onChange={(e) => {
                  setError(null);
                  setFormData(prev => ({ ...prev, descripcion: e.target.value }));
                }}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-white/5 bg-zinc-900/30 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={isLoading || teamMembers.length === 0 || !selectedEnterpriseId}
            className="px-6 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-primary-500/20 flex items-center gap-2 transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Agendando...
              </>
            ) : (
              <>
                <CalendarCheck className="w-4 h-4" />
                Agendar Cita
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
};
