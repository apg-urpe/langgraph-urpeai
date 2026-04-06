'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Video,
  User,
  Search,
  Phone,
  Mail,
  Check,
  Loader2,
  UserPlus,
  Users,
  AlertCircle,
  Globe,
  Info,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { Appointment, Contact } from '@/types/contact';
import { normalizePhone } from '@/lib/ui-helpers';
import { useContactStore, selectContacts, selectSelectedEnterpriseId } from '@/store/contactStore';

interface AssignContactToAppointmentModalProps {
  appointment: Appointment;
  onClose: () => void;
  onAssigned?: () => void;
  initialInvitedIds?: number[];
}

const APPOINTMENT_STATUS_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'realizada', label: 'Realizada' },
  { value: 'reagendada', label: 'Reagendada' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'no_asistio', label: 'No asistió' }
] as const;

export const AssignContactToAppointmentModal: React.FC<AssignContactToAppointmentModalProps> = ({
  appointment,
  onClose,
  onAssigned,
  initialInvitedIds = []
}) => {
  const initialIsInternal = appointment.metadata?.is_internal === true || appointment.metadata?.meeting_kind === 'internal';
  const initialMeetingType = (appointment.metadata?.tipo as 'llamada' | 'videollamada' | 'presencial' | undefined) || 'videollamada';
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(appointment.contacto_id || null);
  const [error, setError] = useState<string | null>(null);
  const [displayedContacts, setDisplayedContacts] = useState<Contact[]>([]);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(appointment.estado || 'pendiente');
  const [meetingType, setMeetingType] = useState<'llamada' | 'videollamada' | 'presencial'>(initialMeetingType);
  const [isInternalMeeting, setIsInternalMeeting] = useState(initialIsInternal);
  const [assistantIds, setAssistantIds] = useState<number[]>(initialInvitedIds);
  const [newContact, setNewContact] = useState({ nombre: '', apellido: '', telefonoPais: '+51', telefono: '', email: '' });
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const contacts = useContactStore(selectContacts);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const teamMembers = useContactStore(state => state.teamMembers);
  const fetchContacts = useContactStore(state => state.fetchContacts);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);
  const setFilters = useContactStore(state => state.setFilters);
  const updateAppointment = useContactStore(state => state.updateAppointment);
  const createContact = useContactStore(state => state.createContact);
  const isLoadingContacts = useContactStore(state => state.isLoading);
  const currentFilters = useContactStore(state => state.filters);

  // Store original filters to restore on close
  const originalFiltersRef = useRef(currentFilters);

  // Fetch initial contacts on mount
  useEffect(() => {
    originalFiltersRef.current = { ...currentFilters };
    if (contacts.length === 0 && selectedEnterpriseId) {
      fetchContacts();
    } else {
      setDisplayedContacts(contacts.slice(0, 30));
    }
    
    // Cleanup: clear debounce on unmount
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initial setup only - dependencies intentionally excluded

  useEffect(() => {
    if (selectedEnterpriseId && teamMembers.length === 0) {
      fetchTeamMembers(false, selectedEnterpriseId);
    }
  }, [fetchTeamMembers, selectedEnterpriseId, teamMembers.length]);

  useEffect(() => {
    setAssistantIds(initialInvitedIds);
  }, [initialInvitedIds]);

  // Update displayed contacts when store contacts change
  useEffect(() => {
    setDisplayedContacts(contacts.slice(0, 30));
  }, [contacts]);

  // Debounced search using store's SuperSearch
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // Use the store's search system (SuperSearch)
      setFilters({ search: value.trim() });
      fetchContacts(true);
    }, 300);
  }, [setFilters, fetchContacts]);

  // Format appointment date/time
  const appointmentDate = appointment.fecha_hora 
    ? new Date(appointment.fecha_hora) 
    : null;
  
  const formattedDate = appointmentDate 
    ? appointmentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Sin fecha';
  
  const formattedTime = appointmentDate
    ? appointmentDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const handleSaveAppointment = async (contactIdOverride?: number | null) => {
    const nextContactId = isInternalMeeting ? null : (contactIdOverride ?? selectedContactId);

    if (!nextContactId && !isInternalMeeting) {
      setError('Selecciona un contacto o marca la cita como reunión interna.');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await updateAppointment(appointment.id, {
        contacto_id: nextContactId,
        estado: selectedStatus,
        tipo: meetingType,
        is_internal: isInternalMeeting,
        invitados_ids: assistantIds
      });

      if (result.success) {
        setFilters({ search: '' });
        setTimeout(() => {
          onAssigned?.();
          onClose();
        }, 100);
        return true;
      } else {
        setError(result.error || 'No se pudo actualizar la cita. Intenta de nuevo.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al actualizar la cita.');
    } finally {
      setIsSaving(false);
    }

    return false;
  };

  const getStatusColor = (estado?: string | null) => {
    const s = estado?.toLowerCase() || '';
    if (s === 'pendiente') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (s === 'confirmada') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (s === 'realizada') return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    if (s === 'cancelada') return 'text-red-400 bg-red-500/10 border-red-500/20';
    return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  };

  const handleCreateContact = async () => {
    if (!newContact.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    const phoneDigits = normalizePhone(newContact.telefono);
    const countryDigits = normalizePhone(newContact.telefonoPais);
    const phoneValue = phoneDigits.length > 0 ? `${countryDigits}${phoneDigits}` : null;

    if (!selectedEnterpriseId) {
      setError('No hay empresa seleccionada');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await createContact({
        nombre: newContact.nombre.trim(),
        apellido: newContact.apellido.trim() || null,
        telefono: phoneValue,
        email: newContact.email.trim() || null,
        estado: 'nuevo',
        origen: 'cita_manual',
        empresa_id: selectedEnterpriseId
      });

      if (result.success && result.contact?.id) {
        const assignSuccess = await handleSaveAppointment(result.contact.id);
        if (assignSuccess) {
          return;
        } else {
          setError(`Contacto creado (ID: ${result.contact.id}), pero no se pudo guardar la cita actualizada.`);
          console.error('[AssignContactToAppointmentModal] Error en updateAppointmentContact para:', {
            appointmentId: appointment.id,
            contactId: result.contact.id
          });
        }
      } else {
        setError(result.error || 'No se pudo crear el contacto. Intenta de nuevo.');
      }
    } catch (err) {
      setError('Error al crear el contacto.');
    } finally {
      setIsCreating(false);
    }
  };

  const activeAssistantOptions = teamMembers.filter(member => member.is_active && member.id !== appointment.team_humano_id);
  const selectedAssistantCount = assistantIds.length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal - Fixed max height with internal scroll */}
      <div className="relative w-full max-w-lg max-h-[85vh] bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-200">Gestionar Cita</h2>
              <p className="text-xs text-zinc-500">Actualizar estado, tipo, equipo asistente y contacto</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Appointment Info Card */}
          <div className="p-4 border-b border-white/5">
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-zinc-200 truncate">
                  {appointment.titulo || 'Cita sin título'}
                </h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border mt-1 ${getStatusColor(appointment.estado)}`}>
                  {appointment.estado || 'Sin estado'}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-zinc-500 font-mono">ID: {appointment.id}</div>
              </div>
            </div>
            
            <div className="space-y-2">
              {/* Date */}
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                <span className="text-zinc-400 capitalize">{formattedDate}</span>
              </div>
              
              {/* Time */}
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400">{formattedTime}</span>
                {appointment.duracion && (
                  <span className="text-zinc-600">({appointment.duracion} min)</span>
                )}
              </div>
              
              {/* Location */}
              {appointment.ubicacion && (
                <div className="flex items-center gap-2 text-xs">
                  {appointment.ubicacion.includes('meet') || appointment.ubicacion.includes('zoom') ? (
                    <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  )}
                  <a 
                    href={appointment.ubicacion} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-zinc-400 hover:text-primary-400 truncate transition-colors"
                  >
                    {appointment.ubicacion}
                  </a>
                </div>
              )}

              {/* Timezone Cliente */}
              {appointment.timezone_cliente && (
                <div className="flex items-center gap-2 text-xs">
                  <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-zinc-400">
                    Zona horaria: <span className="text-zinc-300">{appointment.timezone_cliente}</span>
                  </span>
                </div>
              )}

              {/* Metadata - Expandible */}
              {appointment.metadata && Object.keys(appointment.metadata).length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => setShowMetadata(!showMetadata)}
                    className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full"
                  >
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Información adicional ({Object.keys(appointment.metadata).filter(k => !['nylas_event_id', 'conferencing'].includes(k)).length})</span>
                    {showMetadata ? (
                      <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                    )}
                  </button>
                  
                  {showMetadata && (
                    <div className="mt-2 max-h-[150px] overflow-y-auto space-y-2 pl-1 pr-1 scrollbar-thin">
                      {Object.entries(appointment.metadata)
                        .filter(([key]) => !['nylas_event_id', 'conferencing'].includes(key))
                        .map(([key, value]) => {
                          const isObject = typeof value === 'object' && value !== null;
                          const displayKey = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                          
                          return (
                            <div key={key} className="bg-zinc-800/30 rounded-md p-2 border border-white/5">
                              <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                                {displayKey}
                              </div>
                              {isObject ? (
                                <div className="text-xs text-zinc-300 space-y-1">
                                  {Object.entries(value as Record<string, unknown>).slice(0, 6).map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2">
                                      <span className="text-zinc-500 min-w-[60px] truncate">{k}:</span>
                                      <span className="text-zinc-300 truncate flex-1">
                                        {typeof v === 'object' ? '[objeto]' : String(v).slice(0, 50)}
                                      </span>
                                    </div>
                                  ))}
                                  {Object.keys(value as object).length > 6 && (
                                    <div className="text-[10px] text-zinc-600">+{Object.keys(value as object).length - 6} más...</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-300 break-words">
                                  {String(value)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* Alert contextual */}
              {isInternalMeeting ? (
                <div className="flex items-center gap-2 mt-3 p-2 bg-sky-500/5 border border-sky-500/10 rounded-lg">
                  <Users className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-xs text-sky-300/90">
                    Esta cita está marcada como reunión interna. No requiere contacto asignado.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-3 p-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-400/80">
                    Esta cita no tiene un contacto asignado
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Contact Search or Create Form */}
          <div className="p-4">
            <div className="space-y-4 mb-4 pb-4 border-b border-white/5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-zinc-500">Estado</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
                  >
                    {APPOINTMENT_STATUS_OPTIONS.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-zinc-500">Tipo</label>
                  <select
                    value={meetingType}
                    onChange={(e) => setMeetingType(e.target.value as 'llamada' | 'videollamada' | 'presencial')}
                    className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
                  >
                    <option value="videollamada">Videollamada</option>
                    <option value="llamada">Llamada</option>
                    <option value="presencial">Presencial</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsInternalMeeting(prev => {
                    const nextValue = !prev;
                    if (nextValue) {
                      setSelectedContactId(null);
                      setShowCreateForm(false);
                    }
                    return nextValue;
                  });
                }}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  isInternalMeeting
                    ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    : 'border-white/10 bg-zinc-900/40 text-zinc-400 hover:border-white/15 hover:text-zinc-300'
                }`}
              >
                <div className="text-left">
                  <div className="text-sm font-medium">Reunión interna</div>
                  <div className="text-[11px] opacity-80">Desactiva la exigencia de vincular un contacto a la cita.</div>
                </div>
                <div className={`w-11 h-6 rounded-full p-1 transition-colors ${isInternalMeeting ? 'bg-sky-500/40' : 'bg-zinc-700/60'}`}>
                  <div className={`h-4 w-4 rounded-full bg-white transition-transform ${isInternalMeeting ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>

              {activeAssistantOptions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs text-zinc-500">Equipo asistente</label>
                    {selectedAssistantCount > 0 && (
                      <span className="text-[10px] text-sky-400/80">{selectedAssistantCount} integrante{selectedAssistantCount > 1 ? 's' : ''} verán esta cita</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeAssistantOptions.map(member => {
                      const isSelected = assistantIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            setAssistantIds(prev => isSelected ? prev.filter(id => id !== member.id) : [...prev, member.id]);
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
                </div>
              )}
            </div>

            {showCreateForm ? (
              /* Create Contact Form */
              <div className="space-y-3">
                <button
                  onClick={() => { setShowCreateForm(false); setError(null); }}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors mb-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Volver a buscar
                </button>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={newContact.nombre}
                      onChange={(e) => setNewContact(prev => ({ ...prev, nombre: e.target.value }))}
                      placeholder="Nombre"
                      className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Apellido</label>
                    <input
                      type="text"
                      value={newContact.apellido}
                      onChange={(e) => setNewContact(prev => ({ ...prev, apellido: e.target.value }))}
                      placeholder="Apellido"
                      className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                </div>
                
                <div>
                  <div className="grid grid-cols-[90px_1fr] gap-2">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">País</label>
                      <input
                        type="text"
                        value={newContact.telefonoPais}
                        onChange={(e) => setNewContact(prev => ({ ...prev, telefonoPais: e.target.value }))}
                        placeholder="+51"
                        inputMode="numeric"
                        className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={newContact.telefono}
                        onChange={(e) => setNewContact(prev => ({ ...prev, telefono: e.target.value }))}
                        placeholder="999 999 999"
                        inputMode="numeric"
                        className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">Se guarda solo con dígitos.</p>
                </div>
                
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                    className="w-full px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>
            ) : (
              /* Search Mode */
              !isInternalMeeting ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Buscar contacto..."
                      className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50 transition-colors"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors text-sm whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Crear
                  </button>
                </div>

                {/* Contact List */}
                <div className="max-h-[200px] overflow-y-auto space-y-1 scrollbar-thin">
                  {isLoadingContacts ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                    </div>
                  ) : displayedContacts.length === 0 ? (
                    <div className="text-center py-8">
                      <User className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
                      <p className="text-sm text-zinc-500">
                        {searchQuery ? 'No se encontraron contactos' : 'No hay contactos disponibles'}
                      </p>
                      <button
                        onClick={() => setShowCreateForm(true)}
                        className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                      >
                        Crear nuevo contacto
                      </button>
                    </div>
                  ) : (
                    displayedContacts.map(contact => (
                      <ContactListItem
                        key={contact.id}
                        contact={contact}
                        isSelected={selectedContactId === contact.id}
                        onSelect={() => setSelectedContactId(contact.id)}
                      />
                    ))
                  )}
                </div>
              </>
              ) : (
                <div className="rounded-lg border border-sky-500/10 bg-sky-500/5 px-3 py-3 text-xs text-sky-300/90">
                  Esta cita ya puede guardarse sin contacto porque está marcada como reunión interna.
                </div>
              )
            )}

            {/* Error Message */}
            {error && (
              <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-400">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5 bg-zinc-900/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          
          {showCreateForm ? (
            <button
              onClick={handleCreateContact}
              disabled={!newContact.nombre.trim() || isCreating}
              className="px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Crear y Asignar
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => {
                void handleSaveAppointment();
              }}
              disabled={(!selectedContactId && !isInternalMeeting) || isSaving}
              className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Guardar cambios
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-component for contact list item
interface ContactListItemProps {
  contact: Contact;
  isSelected: boolean;
  onSelect: () => void;
}

const ContactListItem: React.FC<ContactListItemProps> = ({ contact, isSelected, onSelect }) => {
  const displayName = [contact.nombre, contact.apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const initial = displayName.charAt(0).toUpperCase();
  
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
        isSelected 
          ? 'bg-primary-500/10 border-primary-500/30' 
          : 'bg-zinc-900/30 border-transparent hover:bg-zinc-800/50 hover:border-white/5'
      }`}
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
        isSelected 
          ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' 
          : 'bg-zinc-800 text-zinc-400 border border-white/5'
      }`}>
        {initial}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate ${isSelected ? 'text-primary-300' : 'text-zinc-200'}`}>
          {displayName}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {contact.telefono && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Phone className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{contact.telefono}</span>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Mail className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{contact.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Check indicator */}
      {isSelected && (
        <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shrink-0">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  );
};

export default AssignContactToAppointmentModal;
