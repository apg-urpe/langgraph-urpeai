import React, { useState, useMemo, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { sanitizeHtml } from '../../lib/sanitize-html';
import { supabase } from '../../lib/supabase-client';
import { 
  X, 
  MessageSquare, 
  MessageSquareReply,
  Calendar, 
  Image, 
  StickyNote, 
  Tag,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Info,
  Phone,
  Mail,
  Minimize2,
  FileText,
  CheckSquare,
  Sparkles,
  Send,
  Clock,
  CalendarDays,
  User,
  Users,
  Pencil,
  Check,
  FolderOpen,
  UserCheck,
  Copy,
  Wallet,
  Merge,
  History,
  MoreHorizontal
} from 'lucide-react';
import { useContactStore, selectActiveContactData, selectContacts, selectActiveContact, selectTeamMembers, selectUserContext } from '../../store/contactStore';
import { normalizePhone, formatPhoneDisplay } from '@/lib/ui-helpers';
import { ContactTeamAssignmentsModal } from './contact-details/ContactTeamAssignmentsModal';
import { ConversationHistory } from './contact-details/ConversationHistory';
import { ContactAppointments } from './contact-details/ContactAppointments';
import { ContactMultimedia } from './contact-details/ContactMultimedia';
import { ContactNotes } from './contact-details/ContactNotes';
import { ErrorBoundary, MinimalErrorBoundary } from '../ErrorBoundary';
import { ContactAIChat } from './contact-details/ContactAIChat';
import { FunnelStatusView } from './contact-details/FunnelStatusView';
import { TasksView } from './tasks/TasksView';
import { ContactServices } from './contact-details/ContactServices';
import { ContactPauseButton } from './contact-details/ContactPauseButton';
import { ContactImportantDates } from './contact-details/ContactImportantDates';
import { ContactMetadata } from './contact-details/ContactMetadata';
import { MergeContactsModal } from './contact-details/MergeContactsModal';
import { ContactMarketing } from './contact-details/ContactMarketing';
import { ContactActivityTimeline } from './contact-details/ContactActivityTimeline';
import { ContactQueriesView } from './contact-details/ContactQueriesView';
import { ContactWhatsAppTemplateSends } from './contact-details/ContactWhatsAppTemplateSends';

type TabType = 'info' | 'conversations' | 'appointments' | 'multimedia' | 'notes' | 'monica' | 'tasks' | 'cartera' | 'marketing' | 'consultas' | 'whatsapp_templates' | 'historial';

interface ContactDetailPanelProps {
  contactId: number;
  onClose?: () => void;
  isModal?: boolean;
  initialTab?: TabType;
}

// Opciones para es_calificado dropdown
const CALIFICACION_OPTIONS = [
  { value: 'si', label: 'Calificado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'no', label: 'No calificado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { value: 'pendiente', label: 'Pendiente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
];

// Opciones para estado del contacto
const ESTADO_OPTIONS = [
  { value: 'prospecto', label: 'Prospecto', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'cliente', label: 'Cliente', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'rembolsos solicitado', label: 'Rembolsos Solicitado', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'rembolso realizado', label: 'Rembolso Realizado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { value: 'rechazado', label: 'Rechazado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
];

// Opciones para etapa emocional
const ETAPA_EMOCIONAL_OPTIONS = [
  { value: 'desconocido', label: 'Desconocido', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
  { value: 'curioso', label: 'Curioso', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'interesado', label: 'Interesado', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  { value: 'convencido', label: 'Convencido', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  { value: 'listo', label: 'Listo para comprar', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'dudoso', label: 'Dudoso', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'reacio', label: 'Reacio', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  { value: 'opositor', label: 'Opositor', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
];

export const ContactDetailPanel: React.FC<ContactDetailPanelProps> = ({ contactId, onClose, isModal = false, initialTab }) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'conversations');
  const [requestedConversationId, setRequestedConversationId] = useState<number | null>(null);
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [assignmentsVersion, setAssignmentsVersion] = useState(0);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [assignmentSummary, setAssignmentSummary] = useState<{
    secondaryCount: number;
    collaboratorCount: number;
    observerCount: number;
    previewMembers: Array<{ id: number; initials: string; colorClass: string; label: string }>;
  }>({
    secondaryCount: 0,
    collaboratorCount: 0,
    observerCount: 0,
    previewMembers: []
  });
  const [hasWhatsAppTemplateSends, setHasWhatsAppTemplateSends] = useState<boolean | null>(null);
  
  // Refs y estado para navegación de tabs
  const tabsContainerRef = React.useRef<HTMLDivElement>(null);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // Verificar estado de scroll
  const checkScrollState = React.useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
  }, []);
  
  // Scroll handlers
  const scrollTabs = React.useCallback((direction: 'left' | 'right') => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const scrollAmount = 150;
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }, []);
  
  // Efecto para detectar scroll disponible
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    checkScrollState();
    container.addEventListener('scroll', checkScrollState);
    window.addEventListener('resize', checkScrollState);
    return () => {
      container.removeEventListener('scroll', checkScrollState);
      window.removeEventListener('resize', checkScrollState);
    };
  }, [checkScrollState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      setShowMoreMenu(false);
    }
  }, [initialTab, contactId]);
  
  // Edición inline states
  const [editingField, setEditingField] = useState<'nombre' | 'apellido' | 'email' | 'telefono' | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const activeContactData = useContactStore(selectActiveContactData);
  const activeContact = useContactStore(selectActiveContact);
  const contacts = useContactStore(selectContacts);
  const teamMembers = useContactStore(selectTeamMembers);
  const userContext = useContactStore(selectUserContext);
  const updateContactField = useContactStore(state => state.updateContactField);
  const fetchContactDetails = useContactStore(state => state.fetchContactDetails);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);
  const fetchContactAssignments = useContactStore(state => state.fetchContactAssignments);
  const isLoadingContact = useContactStore(state => state.activeContactData.isLoading);
  const activeContactError = useContactStore(state => state.activeContactData.error);
  
  const contact = activeContact?.id === contactId ? activeContact : contacts.find(c => c.id === contactId);
  
  // Cargar detalles del contacto siempre que cambie contactId o no coincida con el activo
  useEffect(() => {
    if (contactId && activeContact?.id !== contactId) {
      fetchContactDetails(contactId);
    }
    // Siempre cargar miembros del equipo para asegurar que la lista de transferencia esté lista
    fetchTeamMembers(false, contact?.empresa_id ?? null);
  }, [contactId, activeContact?.id, fetchContactDetails, fetchTeamMembers]);
  
  // Obtener nombre del asesor asignado
  const assignedAgent = useMemo(() => {
    if (!contact?.team_humano_id) return null;
    return teamMembers.find(m => m.id === contact.team_humano_id);
  }, [contact?.team_humano_id, teamMembers]);

  // HITL: conteos gestionados por ContactQueriesView via callback + realtime para detectar cambios
  const [hitlCounts, setHitlCounts] = useState<{ total: number; pending: number }>({ total: 0, pending: 0 });
  const [hitlVersion, setHitlVersion] = useState(0);
  const hasHumanInTheLoop = hitlCounts.total > 0;
  const hasPendingHumanInTheLoop = hitlCounts.pending > 0;

  const handleHitlCountsChange = React.useCallback((counts: { total: number; pending: number }) => {
    setHitlCounts(counts);
  }, []);

  // Suscripción realtime única: incrementa version para que ContactQueriesView refetch
  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel(`hitl-contact-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wp_notificaciones_team',
          filter: `contacto_id=eq.${contactId}`,
        },
        () => { setHitlVersion((v) => v + 1); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contactId]);

  useEffect(() => {
    let cancelled = false;

    const checkWhatsAppTemplateSends = async () => {
      if (!contact?.id || !contact.empresa_id) {
        if (!cancelled) {
          setHasWhatsAppTemplateSends(false);
        }
        return;
      }

      if (!cancelled) {
        setHasWhatsAppTemplateSends(null);
      }

      try {
        const { data, error } = await supabase
          .from('wp_whatsapp_template_envios')
          .select('id')
          .eq('empresa_id', contact.empresa_id)
          .eq('contacto_id', contact.id)
          .limit(1);

        if (error) throw error;

        if (!cancelled) {
          setHasWhatsAppTemplateSends((data?.length || 0) > 0);
        }
      } catch (err) {
        logger.error('[ContactDetailPanel] Error checking WhatsApp template sends:', err);
        if (!cancelled) {
          setHasWhatsAppTemplateSends(false);
        }
      }
    };

    checkWhatsAppTemplateSends();

    return () => {
      cancelled = true;
    };
  }, [contact?.empresa_id, contact?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadAssignmentSummary = async () => {
      if (!contact?.id) {
        if (!cancelled) {
          setAssignmentSummary({
            secondaryCount: 0,
            collaboratorCount: 0,
            observerCount: 0,
            previewMembers: []
          });
        }
        return;
      }

      try {
        const assignments = await fetchContactAssignments(contact.id);
        if (cancelled) return;

        const secondaryAssignments = assignments.filter(assignment => !assignment.es_principal);
        const collaboratorAssignments = secondaryAssignments.filter(assignment => assignment.rol_asignacion !== 'observador');
        const observerAssignments = secondaryAssignments.filter(assignment => assignment.rol_asignacion === 'observador');

        setAssignmentSummary({
          secondaryCount: secondaryAssignments.length,
          collaboratorCount: collaboratorAssignments.length,
          observerCount: observerAssignments.length,
          previewMembers: secondaryAssignments.slice(0, 2).map((assignment) => {
            const initials = `${assignment.team_nombre?.[0] || ''}${assignment.team_apellido?.[0] || ''}`.trim() || '?';
            const isObserver = assignment.rol_asignacion === 'observador';

            return {
              id: assignment.id,
              initials,
              colorClass: isObserver
                ? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
              label: isObserver ? 'Observador' : 'Colaborador'
            };
          })
        });
      } catch (err) {
        logger.error('[ContactDetailPanel] Error loading assignment summary:', err);
      }
    };

    loadAssignmentSummary();

    return () => {
      cancelled = true;
    };
  }, [contact?.id, assignmentsVersion, fetchContactAssignments]);

  useEffect(() => {
    if (!hasHumanInTheLoop && activeTab === 'consultas') {
      setActiveTab('conversations');
    }
  }, [activeTab, hasHumanInTheLoop]);

  useEffect(() => {
    if (hasWhatsAppTemplateSends === false && activeTab === 'whatsapp_templates') {
      setActiveTab('conversations');
    }
  }, [activeTab, hasWhatsAppTemplateSends]);
  
  // Handlers para edición inline
  const startEditing = React.useCallback((field: 'nombre' | 'apellido' | 'email' | 'telefono', currentValue: string) => {
    setEditingField(field);
    if (field === 'telefono') {
      setEditValue(normalizePhone(currentValue || ''));
      return;
    }
    setEditValue(currentValue || '');
  }, []);
  
  const saveEdit = React.useCallback(async () => {
    if (!editingField || !contact) return;
    if (editingField === 'telefono') {
      const phoneDigits = editValue.trim() ? normalizePhone(editValue) : '';
      const phoneValue = phoneDigits.length > 0 ? phoneDigits : null;
      await updateContactField(contact.id, 'telefono', phoneValue);
      setEditingField(null);
      setEditValue('');
      return;
    }
    await updateContactField(contact.id, editingField, editValue.trim() || null);
    setEditingField(null);
    setEditValue('');
  }, [editingField, contact, updateContactField, editValue]);
  
  const cancelEdit = React.useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);
  
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  }, [saveEdit, cancelEdit]);
  
  const handleCalificacionChange = React.useCallback(async (value: string) => {
    if (!contact) return;
    await updateContactField(contact.id, 'es_calificado', value);
  }, [contact, updateContactField]);
  
  const handleEstadoChange = React.useCallback(async (value: string) => {
    if (!contact) return;
    await updateContactField(contact.id, 'estado', value);
  }, [contact, updateContactField]);
  
  const handleEtapaEmocionalChange = React.useCallback(async (value: string) => {
    if (!contact) return;
    await updateContactField(contact.id, 'etapa_emocional', value);
  }, [contact, updateContactField]);
  
  const copyToClipboard = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      logger.error('[ContactDetailPanel] Error copying to clipboard:', err);
    }
  }, []);

  const tabs = useMemo(() => {
    const nextTabs = [
      { id: 'info', label: 'Información', shortLabel: 'Info', icon: User },
      { id: 'conversations', label: 'Conversaciones', shortLabel: 'Chats', icon: MessageSquare },
      { id: 'appointments', label: 'Citas', shortLabel: 'Citas', icon: Calendar },
      { id: 'notes', label: 'Notas', shortLabel: 'Notas', icon: StickyNote },
      { id: 'tasks', label: 'Tareas', shortLabel: 'Tareas', icon: CheckSquare },
      ...(hasHumanInTheLoop ? [{ id: 'consultas', label: hitlCounts.pending > 0 ? `Consultas (${hitlCounts.pending})` : 'Consultas', shortLabel: hitlCounts.pending > 0 ? `${hitlCounts.pending}` : 'HITL', icon: MessageSquareReply }] : []),
      ...((hasWhatsAppTemplateSends || activeTab === 'whatsapp_templates') ? [{ id: 'whatsapp_templates', label: 'Plantillas', shortLabel: 'Plantillas', icon: FileText }] : []),
      { id: 'cartera', label: 'Cartera', shortLabel: 'Cartera', icon: Wallet },
      { id: 'marketing', label: 'Marketing', shortLabel: 'Marketing', icon: Mail },
      { id: 'multimedia', label: 'Multimedia', shortLabel: 'Media', icon: Image },
      { id: 'monica', label: 'Monica AI', shortLabel: 'Monica', icon: Sparkles },
    ];

    return nextTabs as Array<{ id: TabType; label: string; shortLabel: string; icon: React.ElementType }>;
  }, [activeTab, hasHumanInTheLoop, hasWhatsAppTemplateSends, hitlCounts.pending]);

  const openHistoryTab = React.useCallback(() => {
    setActiveTab('historial');
    setShowMoreMenu(false);
  }, []);

  const toggleMoreMenu = React.useCallback(() => {
    setShowMoreMenu((value) => !value);
  }, []);

  const handleOpenConversationFromTemplate = React.useCallback((conversationId: number) => {
    if (!conversationId) return;

    setRequestedConversationId(conversationId);
    setActiveTab('conversations');
  }, []);

  const handleRequestedConversationHandled = React.useCallback(() => {
    setRequestedConversationId(null);
  }, []);

  const renderSidebarContent = React.useCallback(() => {
    if (!contact) return null;
    return (
      <div className="space-y-4 md:space-y-5">
        {/* === SECCIÓN 1: INFORMACIÓN DE CONTACTO === */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 md:p-4">
          {/* ID Contacto sutil */}
          <div className="text-[9px] text-zinc-600 font-mono mb-2 text-right">ID: {contact.id}</div>
          
          {/* Avatar y Nombre editable */}
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center text-primary-400 font-bold text-base border border-primary-500/20 shrink-0">
              {contact.nombre?.[0] || contact.apellido?.[0] || '?'}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {/* Nombre editable */}
              {editingField === 'nombre' ? (
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={saveEdit}
                    autoFocus
                    placeholder="Nombre"
                    className="w-full min-w-0 bg-zinc-800 border border-primary-500/30 rounded px-2 py-0.5 text-sm font-semibold text-zinc-200 focus:outline-none focus:border-primary-500"
                  />
                  <button onClick={saveEdit} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded">
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group">
                  <span className="text-sm font-semibold text-zinc-200">{contact.nombre || 'Sin nombre'}</span>
                  <button 
                    onClick={() => startEditing('nombre', contact.nombre || '')}
                    className="p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-primary-400 transition-all"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              {/* Apellido editable */}
              {editingField === 'apellido' ? (
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={saveEdit}
                    autoFocus
                    placeholder="Apellido"
                    className="w-full min-w-0 bg-zinc-800 border border-primary-500/30 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-primary-500"
                  />
                  <button onClick={saveEdit} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded">
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group">
                  <span className="text-xs text-zinc-400">{contact.apellido || 'Sin apellido'}</span>
                  <button 
                    onClick={() => startEditing('apellido', contact.apellido || '')}
                    className="p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-primary-400 transition-all"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Badges: Calificación + Activo/Pausado */}
          <div className="flex items-center gap-2 mb-3">
            <select
              value={contact.es_calificado || 'pendiente'}
              onChange={(e) => handleCalificacionChange(e.target.value)}
              className={`flex-1 text-[10px] px-2 py-1 rounded-md border cursor-pointer focus:outline-none transition-colors ${
                CALIFICACION_OPTIONS.find(o => o.value === contact.es_calificado)?.color || 'text-zinc-400 bg-zinc-800 border-white/10'
              }`}
            >
              {CALIFICACION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                  {opt.label}
                </option>
              ))}
            </select>
            <ContactPauseButton contact={contact} compact />
          </div>

          {/* Info Grid - Sin bordes, más limpio */}
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-zinc-500">Tipo</span>
              <select
                value={contact.estado || 'prospecto'}
                onChange={(e) => handleEstadoChange(e.target.value)}
                className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer focus:outline-none bg-transparent border-0 text-right ${
                  ESTADO_OPTIONS.find(o => o.value === contact.estado)?.color.split(' ')[0] || 'text-zinc-300'
                }`}
              >
                {ESTADO_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-zinc-500">Sentimiento</span>
              <select
                value={contact.etapa_emocional || 'desconocido'}
                onChange={(e) => handleEtapaEmocionalChange(e.target.value)}
                className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer focus:outline-none bg-transparent border-0 text-right ${
                  ETAPA_EMOCIONAL_OPTIONS.find(o => o.value === contact.etapa_emocional)?.color.split(' ')[0] || 'text-zinc-300'
                }`}
              >
                {ETAPA_EMOCIONAL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-zinc-500">Origen</span>
              <span className="text-zinc-300 capitalize">{contact.origen || '-'}</span>
            </div>
          </div>

          <div className="my-3 border-t border-white/5" />
          
          {/* Datos de contacto */}
          <div className="space-y-2">
            {/* Email editable */}
            {editingField === 'email' ? (
              <div className="flex items-center gap-1 min-w-0">
                <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  type="email"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={saveEdit}
                  autoFocus
                  placeholder="email@ejemplo.com"
                  className="w-full min-w-0 bg-zinc-800 border border-primary-500/30 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-primary-500"
                />
                <button onClick={saveEdit} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded">
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="text-xs text-zinc-400 hover:text-primary-400 transition-colors truncate flex-1">
                    {contact.email}
                  </a>
                ) : (
                  <span className="text-xs text-zinc-600 italic flex-1">Sin email</span>
                )}
                <button
                  onClick={() => copyToClipboard(contact.email!)}
                  className="p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-primary-400 transition-all shrink-0"
                  title="Copiar email"
                >
                  <Copy className="w-2.5 h-2.5" />
                </button>
                <button 
                  onClick={() => startEditing('email', contact.email || '')}
                  className="p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-primary-400 transition-all shrink-0"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            
            {/* Teléfono con botón copiar */}
            {editingField === 'telefono' ? (
              <div className="flex items-center gap-1 min-w-0">
                <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  type="tel"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Código país + número"
                  inputMode="numeric"
                  className="w-full min-w-0 bg-zinc-800 border border-primary-500/30 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-primary-500"
                />
                <button onClick={saveEdit} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded">
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                {contact.telefono ? (
                  <a href={`tel:${contact.telefono}`} className="text-xs text-zinc-400 hover:text-primary-400 transition-colors flex-1">
                    {formatPhoneDisplay(contact.telefono)}
                  </a>
                ) : (
                  <span className="text-xs text-zinc-600 italic flex-1">Sin teléfono</span>
                )}
                {contact.telefono && (
                  <button
                    onClick={() => copyToClipboard(contact.telefono!)}
                    className="p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-primary-400 hover:bg-primary-500/10 rounded transition-all"
                    title="Copiar teléfono"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                )}
                <button 
                  onClick={() => startEditing('telefono', contact.telefono || '')}
                  className="p-0.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-primary-400 transition-all shrink-0"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            
            {/* URL Drive */}
            {contact.url_drive && (
              <a 
                href={contact.url_drive} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-primary-400 transition-colors group"
              >
                <FolderOpen className="w-3.5 h-3.5 text-zinc-500 group-hover:text-primary-400" />
                <span>Abrir Drive</span>
              </a>
            )}
          </div>
          
          {/* Asesor asignado */}
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 w-7 h-7 rounded-full border border-primary-500/20 bg-primary-500/10 flex items-center justify-center shrink-0">
                  <UserCheck className="w-3.5 h-3.5 text-primary-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    Responsable principal
                  </div>
                  <div className="mt-1 text-sm text-zinc-200 font-medium leading-tight break-words">
                    {assignedAgent ? `${assignedAgent.nombre} ${assignedAgent.apellido}` : 'Sin asignar'}
                  </div>
                </div>
              </div>

              {(userContext?.roleId === 1 || userContext?.roleId === 2 || userContext?.roleId === 4) && (
                <div className="flex flex-wrap items-center gap-2 pl-9">
                  <button
                    onClick={() => setShowAssignmentsModal(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/15 bg-emerald-500/10 text-[10px] text-emerald-300 hover:bg-emerald-500/15 transition-all"
                    title="Gestionar responsable y colaboradores"
                  >
                    <Users className="w-2.5 h-2.5" />
                    <span>Equipo</span>
                  </button>
                  {userContext?.roleId === 1 && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setShowMergeModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/15 bg-amber-500/10 text-[11px] text-amber-300 hover:bg-amber-500/15 transition-all"
                        title="Unificar con otro contacto"
                      >
                        <Merge className="w-3 h-3" />
                        <span>Unificar</span>
                      </button>
                      <span className="text-[10px] text-zinc-500">
                        Solo visible para rol 1
                      </span>
                    </div>
                  )}
                </div>
              )}

              {assignmentSummary.secondaryCount > 0 ? (
                <div className="pl-9 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-2">
                      {assignmentSummary.previewMembers.map((member) => (
                        <div
                          key={member.id}
                          className={`w-6 h-6 rounded-full border text-[10px] font-semibold flex items-center justify-center ${member.colorClass}`}
                          title={member.label}
                        >
                          {member.initials}
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Equipo adicional
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                    <span className="px-2 py-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 text-emerald-300">
                      {assignmentSummary.collaboratorCount} colaborador{assignmentSummary.collaboratorCount === 1 ? '' : 'es'}
                    </span>
                    {assignmentSummary.observerCount > 0 && (
                      <span className="px-2 py-1 rounded-full border border-zinc-500/15 bg-zinc-500/10 text-zinc-300">
                        {assignmentSummary.observerCount} observador{assignmentSummary.observerCount === 1 ? '' : 'es'}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pl-9 text-[11px] text-zinc-600 leading-relaxed">
                  Sin colaboradores ni observadores adicionales.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* === SECCIÓN 2: FECHAS IMPORTANTES === */}
        <MinimalErrorBoundary componentName="ContactImportantDates">
          <ContactImportantDates 
            contact={contact} 
            appointments={activeContactData.appointments}
            notes={activeContactData.notes}
          />
        </MinimalErrorBoundary>

        {/* === SECCIÓN 3: ESTADO DEL EMBUDO === */}
        <MinimalErrorBoundary componentName="FunnelStatusView">
          <FunnelStatusView status={activeContactData.funnelStatus} contactId={contact.id} />
        </MinimalErrorBoundary>

        {/* === SECCIÓN 4: METADATA / ETIQUETAS === */}
        <MinimalErrorBoundary componentName="ContactMetadata">
          <ContactMetadata metadata={contact.metadata} />
        </MinimalErrorBoundary>
      </div>
    );
  }, [
    contact, 
    editingField, 
    editValue, 
    assignedAgent, 
    assignmentSummary,
    userContext?.roleId, 
    activeContactData.appointments, 
    activeContactData.notes,
    activeContactData.funnelStatus,
    handleKeyDown,
    saveEdit,
    startEditing,
    handleCalificacionChange,
    handleEstadoChange,
    handleEtapaEmocionalChange,
    copyToClipboard
  ]);

  return (
    <div className={`flex flex-col h-full bg-[#0c0c0e] overflow-hidden ${isModal ? 'md:rounded-xl shadow-2xl md:border md:border-white/10' : ''}`}>
      {showAssignmentsModal && contact && (
        <ContactTeamAssignmentsModal
          contact={contact}
          onClose={() => setShowAssignmentsModal(false)}
          onUpdate={() => {
            fetchContactDetails(contact.id);
            setAssignmentsVersion((value) => value + 1);
          }}
        />
      )}
      
      {showMergeModal && contact && (
        <MergeContactsModal
          contact={contact}
          onClose={() => setShowMergeModal(false)}
          onMergeComplete={() => {
            fetchContactDetails(contact.id);
          }}
        />
      )}
        
      {/* Header — Desktop: título simple / Móvil: resumen compacto del contacto */}
      <div className="shrink-0 border-b border-white/5 bg-[#0a0a0c]">
        {/* Desktop header */}
        <div className="hidden md:flex h-12 px-4 items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-300">
            Detalle de Contacto
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0"
              title={isModal ? "Cerrar" : "Cerrar detalle"}
            >
              {isModal ? <X className="w-5 h-5" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
        {/* Mobile header — resumen compacto */}
        <div className="flex md:hidden items-center gap-2.5 px-3 py-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 -ml-1 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {contact ? (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center text-primary-400 font-bold text-sm border border-primary-500/20 shrink-0">
                {contact.nombre?.[0] || contact.apellido?.[0] || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-200 truncate">
                  {[contact.nombre, contact.apellido].filter(Boolean).join(' ') || 'Sin nombre'}
                </p>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {contact.origen && (
                    <span className="text-zinc-500 capitalize">{contact.origen}</span>
                  )}
                  {contact.origen && contact.es_calificado && (
                    <span className="text-zinc-700">·</span>
                  )}
                  {contact.es_calificado && (
                    <span className={
                      CALIFICACION_OPTIONS.find(o => o.value === contact.es_calificado)?.color.split(' ')[0] || 'text-zinc-400'
                    }>
                      {CALIFICACION_OPTIONS.find(o => o.value === contact.es_calificado)?.label || 'Pendiente'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-sm text-zinc-500">Cargando...</span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>


      <div className="flex-1 flex overflow-hidden">
        <div className="hidden md:block w-56 lg:w-64 shrink-0 border-r border-white/5 bg-[#0a0a0c]/50 p-3 lg:p-4 overflow-y-auto custom-scrollbar relative z-20">
          {renderSidebarContent()}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-[#0c0c0e] min-w-0 relative">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none translate-x-1/3 -translate-y-1/3 mix-blend-screen" />
           
          <div className="shrink-0 h-11 md:h-12 border-b border-white/5 flex items-center relative z-30 bg-[#0c0c0e]/80 backdrop-blur-sm">
            {/* Flecha izquierda */}
            <button
              onClick={() => scrollTabs('left')}
              className={`
                shrink-0 w-9 h-full flex items-center justify-center border-r border-white/5
                transition-all duration-200
                ${canScrollLeft
                  ? 'text-zinc-400 hover:text-primary-400 hover:bg-primary-500/10 cursor-pointer'
                  : 'text-zinc-700 cursor-default'}
              `}
              disabled={!canScrollLeft}
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            {/* Contenedor de tabs scrolleable - Solo iconos con tooltip */}
            <div 
              ref={tabsContainerRef}
              className="flex-1 flex items-center justify-center px-1 md:px-2 gap-1 md:gap-2 overflow-x-auto scrollbar-hide"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const isInfoTab = tab.id === 'info';
                const isConsultasTab = tab.id === 'consultas';
                const consultasPending = isConsultasTab && hasPendingHumanInTheLoop;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      if (isActive && el && tabsContainerRef.current) {
                        const container = tabsContainerRef.current;
                        const elLeft = el.offsetLeft;
                        const elWidth = el.offsetWidth;
                        const containerWidth = container.clientWidth;
                        const scrollTarget = elLeft - containerWidth / 2 + elWidth / 2;
                        container.scrollTo({ left: scrollTarget, behavior: 'smooth' });
                      }
                    }}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`
                      group relative h-11 md:h-12 w-11 flex items-center justify-center transition-all duration-200 shrink-0
                      ${isActive
                        ? consultasPending
                          ? 'text-amber-300'
                          : 'text-primary-400'
                        : consultasPending
                          ? 'text-amber-400 hover:text-amber-300'
                          : 'text-zinc-500 hover:text-zinc-300'}
                      ${consultasPending ? 'bg-amber-500/10' : ''}
                      ${isInfoTab ? 'md:hidden' : ''}
                    `}
                    title={consultasPending ? `${tab.label} · pendiente` : tab.label}
                  >
                    <Icon className={`w-[18px] h-[18px] md:w-5 md:h-5 ${isActive ? consultasPending ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.45)]' : 'drop-shadow-[0_0_8px_rgba(var(--primary-400),0.5)]' : ''}`} />
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 border border-white/10 rounded-md text-[11px] text-zinc-200 font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none shadow-lg z-50">
                      {consultasPending ? `${tab.label} · Sin responder` : tab.label}
                      {/* Flecha del tooltip */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
                    </div>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                        <div className={`w-6 h-0.5 animate-zoom-in-x rounded-full ${consultasPending ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]' : 'bg-primary-500 shadow-[0_0_10px_rgba(var(--primary-500),0.5)]'}`} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div ref={moreMenuRef} className="relative shrink-0 h-full z-40">
              <button
                type="button"
                onClick={toggleMoreMenu}
                aria-haspopup="menu"
                aria-expanded={showMoreMenu}
                className={`
                  w-11 h-full flex items-center justify-center border-l border-white/5 transition-all duration-200
                  ${showMoreMenu || activeTab === 'historial'
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}
                `}
                title="Más opciones"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showMoreMenu && (
                <div className="absolute top-full right-0 mt-2 w-52 rounded-xl border border-white/10 bg-[#121216] shadow-2xl shadow-black/40 overflow-hidden z-[70] pointer-events-auto">
                  <button
                    type="button"
                    onClick={openHistoryTab}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      activeTab === 'historial'
                        ? 'bg-primary-500/10 text-primary-300'
                        : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <History className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">Historial</div>
                      <div className="text-[11px] text-zinc-500">Ver historial de cambios del contacto</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => scrollTabs('right')}
              className={`
                shrink-0 w-9 h-full flex items-center justify-center border-l border-white/5
                transition-all duration-200
                ${canScrollRight
                  ? 'text-zinc-400 hover:text-primary-400 hover:bg-primary-500/10 cursor-pointer'
                  : 'text-zinc-700 cursor-default'}
              `}
              disabled={!canScrollRight}
              title="Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 md:p-6 relative z-0 custom-scrollbar">
            {activeContactData.isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0c0c0e]/80 backdrop-blur-sm z-10">
                <div className="flex flex-col items-center gap-3 text-zinc-500">
                  <div className="w-6 h-6 md:w-8 md:h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin shadow-[0_0_15px_rgba(var(--primary-500),0.2)]" />
                  <span className="text-xs md:text-sm animate-pulse">Cargando datos...</span>
                </div>
              </div>
            ) : (activeContactData.error || !contact) ? (
              <div className="flex flex-col items-center justify-center h-full text-red-400 p-6 text-center">
                <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                  <p className="text-sm font-medium mb-2">{activeContactData.error || 'Error al cargar el contacto'}</p>
                  <button 
                    onClick={() => fetchContactDetails(contactId)}
                    className="text-xs bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            ) : (
              <div className="animate-pop-in">
                {activeTab === 'info' && (
                  <div className="max-w-2xl mx-auto h-full overflow-y-auto pb-20 md:pb-0">
                    {renderSidebarContent()}
                  </div>
                )}
                {activeTab === 'conversations' && (
                  <ConversationHistory
                    conversations={activeContactData.conversations}
                    initialConversationId={requestedConversationId}
                    onInitialConversationHandled={handleRequestedConversationHandled}
                  />
                )}
                {activeTab === 'tasks' && contact && (
                  <TasksView contactId={contact.id} embedded />
                )}
                {activeTab === 'appointments' && (
                  <div className="pb-20 md:pb-0">
                    <ContactAppointments appointments={activeContactData.appointments} contact={contact} />
                  </div>
                )}
                {activeTab === 'multimedia' && contact && (
                  <ContactMultimedia 
                    multimedia={activeContactData.multimedia}
                    contactId={contact.id}
                    empresaId={contact.empresa_id ?? undefined}
                  />
                )}
                {activeTab === 'consultas' && contact && (
                  <ContactQueriesView contactId={contact.id} enterpriseId={contact.empresa_id} onCountsChange={handleHitlCountsChange} hitlVersion={hitlVersion} />
                )}
                {activeTab === 'whatsapp_templates' && contact && (
                  <ContactWhatsAppTemplateSends
                    contactId={contact.id}
                    enterpriseId={contact.empresa_id}
                    onOpenConversation={handleOpenConversationFromTemplate}
                  />
                )}
                {activeTab === 'notes' && contact && (
                  <MinimalErrorBoundary componentName="ContactNotes">
                    <ContactNotes 
                      contactId={contact.id} 
                      notes={activeContactData.notes || []}
                      empresaId={contact.empresa_id ?? undefined}
                    />
                  </MinimalErrorBoundary>
                )}
                {activeTab === 'cartera' && contact && (
                  <ContactServices contactId={contact.id} onNavigateTab={(tab) => setActiveTab(tab)} />
                )}
                {activeTab === 'marketing' && contact && (
                  <ContactMarketing 
                    contactId={contact.id}
                    contactEmail={contact.email}
                    contactName={`${contact.nombre || ''} ${contact.apellido || ''}`.trim() || 'Contacto'}
                  />
                )}
                {activeTab === 'historial' && contact && (
                  <ContactActivityTimeline contactId={contact.id} empresaId={contact.empresa_id} />
                )}
                {activeTab === 'monica' && contact && (
                  <div className="h-full max-h-[calc(100vh-280px)]">
                    <ErrorBoundary componentName="ContactAIChat">
                      <ContactAIChat 
                        contact={contact}
                        contactData={{
                          conversations: activeContactData.conversations,
                          appointments: activeContactData.appointments,
                          notes: activeContactData.notes,
                          funnelStatus: activeContactData.funnelStatus,
                          funnelStage: activeContactData.funnelStage,
                          assignedAdvisor: activeContactData.assignedAdvisor,
                          transcripciones: activeContactData.transcripciones,
                          messages: activeContactData.messages,
                          tasks: activeContactData.tasks,
                          services: activeContactData.services,
                        }}
                        onClose={onClose}
                      />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
