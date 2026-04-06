import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search, Merge, ArrowRight, AlertTriangle, Check, Loader2, MessageSquare, Calendar, StickyNote, Wallet, FileText, Image, ChevronLeft, ArrowLeftRight } from 'lucide-react';
import { useContactStore } from '../../../store/contactStore';
import { Contact } from '../../../types/contact';

interface MergeContactsModalProps {
  contact: Contact;
  onClose: () => void;
  onMergeComplete: () => void;
}

type MergeStep = 'search' | 'compare' | 'confirm';
type NotesStrategy = 'both' | 'primary_only' | 'secondary_only';

const MERGEABLE_FIELDS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'apellido', label: 'Apellido' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'estado', label: 'Estado' },
  { key: 'es_calificado', label: 'Calificación' },
  { key: 'origen', label: 'Origen' },
  { key: 'etapa_emocional', label: 'Etapa emocional' },
  { key: 'timezone', label: 'Zona horaria' },
  { key: 'notas', label: 'Notas' },
] as const;

type FieldKey = typeof MERGEABLE_FIELDS[number]['key'];

const PREVIEW_ICONS: Record<string, React.ElementType> = {
  conversaciones: MessageSquare,
  citas: Calendar,
  notas: StickyNote,
  servicios: Wallet,
  pagos: Wallet,
  facturas: FileText,
  tareas: FileText,
  multimedia: Image,
  emails_enviados: FileText,
  emails_recibidos: FileText,
};

const PREVIEW_LABELS: Record<string, string> = {
  conversaciones: 'Conversaciones',
  citas: 'Citas',
  notas: 'Notas',
  servicios: 'Servicios',
  pagos: 'Pagos',
  facturas: 'Facturas',
  tareas: 'Tareas',
  multimedia: 'Multimedia',
  emails_enviados: 'Emails enviados',
  emails_recibidos: 'Emails recibidos',
  recordatorios: 'Recordatorios',
  proyectos: 'Proyectos',
  archivos_drive: 'Archivos Drive',
  finanzas: 'Finanzas',
};

const NOTES_STRATEGY_OPTIONS: { value: NotesStrategy; label: string; desc: string }[] = [
  { value: 'both', label: 'Conservar ambas', desc: 'Todas las notas de ambos contactos' },
  { value: 'primary_only', label: 'Solo del principal', desc: 'Las notas del secundario se eliminan' },
  { value: 'secondary_only', label: 'Solo del secundario', desc: 'Las notas del principal se eliminan' },
];

export const MergeContactsModal: React.FC<MergeContactsModalProps> = ({
  contact,
  onClose,
  onMergeComplete,
}) => {
  const [step, setStep] = useState<MergeStep>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Swappable: primaryContact and secondaryContact are local state
  const [primaryContact, setPrimaryContact] = useState<any>(contact);
  const [secondaryContact, setSecondaryContact] = useState<any>(null);

  const [fieldChoices, setFieldChoices] = useState<Record<FieldKey, 'primary' | 'secondary'>>({} as any);
  const [notesStrategy, setNotesStrategy] = useState<NotesStrategy>('both');
  const [preview, setPreview] = useState<Record<string, number>>({});
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const contacts = useContactStore(state => state.contacts);
  const previewMerge = useContactStore(state => state.previewMerge);
  const mergeContacts = useContactStore(state => state.mergeContacts);

  // Initialize field choices: default all to 'primary'
  const resetFieldChoices = useCallback(() => {
    const defaults: Record<string, 'primary' | 'secondary'> = {};
    MERGEABLE_FIELDS.forEach(f => { defaults[f.key] = 'primary'; });
    setFieldChoices(defaults as Record<FieldKey, 'primary' | 'secondary'>);
  }, []);

  useEffect(() => { resetFieldChoices(); }, [resetFieldChoices]);

  // Search contacts locally (debounced)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      const q = searchQuery.toLowerCase();
      const results = contacts.filter(c => {
        if (c.id === contact.id) return false;
        if (!c.is_active) return false;
        const name = `${c.nombre || ''} ${c.apellido || ''}`.toLowerCase();
        const phone = (c.telefono || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const id = String(c.id);
        return name.includes(q) || phone.includes(q) || email.includes(q) || id === q;
      }).slice(0, 15);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, contacts, contact.id]);

  // Load preview for secondary contact
  const loadPreview = useCallback(async (primId: number, secId: number) => {
    setIsLoadingPreview(true);
    const result = await previewMerge(primId, secId);
    if (result.success) {
      setPreview(result.preview || {});
    }
    setIsLoadingPreview(false);
  }, [previewMerge]);

  // When user selects a contact from search
  const handleSelectSecondary = useCallback(async (selectedContact: Contact) => {
    // Primary is the contact we opened the modal from, secondary is the one selected
    setPrimaryContact(contact);
    setSecondaryContact(selectedContact);
    resetFieldChoices();
    setNotesStrategy('both');
    setStep('compare');
    await loadPreview(contact.id, selectedContact.id);
  }, [contact, resetFieldChoices, loadPreview]);

  // Swap primary ↔ secondary
  const handleSwap = useCallback(async () => {
    if (!secondaryContact) return;
    const oldPrimary = primaryContact;
    const oldSecondary = secondaryContact;
    setPrimaryContact(oldSecondary);
    setSecondaryContact(oldPrimary);
    resetFieldChoices();
    setNotesStrategy('both');
    await loadPreview(oldSecondary.id, oldPrimary.id);
  }, [primaryContact, secondaryContact, resetFieldChoices, loadPreview]);

  const handleFieldChoice = useCallback((field: FieldKey, choice: 'primary' | 'secondary') => {
    setFieldChoices(prev => ({ ...prev, [field]: choice }));
  }, []);

  const handleMerge = useCallback(async () => {
    if (!secondaryContact || !primaryContact) return;
    setIsMerging(true);
    setMergeError(null);

    const result = await mergeContacts(primaryContact.id, secondaryContact.id, fieldChoices, notesStrategy);

    if (result.success) {
      onMergeComplete();
      onClose();
    } else {
      setMergeError(result.error || 'Error desconocido');
      setIsMerging(false);
    }
  }, [secondaryContact, primaryContact, fieldChoices, notesStrategy, mergeContacts, onMergeComplete, onClose]);

  const totalEntitiesToMove = useMemo(() => {
    return Object.values(preview).reduce((sum, n) => sum + n, 0);
  }, [preview]);

  const getDisplayValue = (obj: any, field: string): string => {
    const val = obj?.[field];
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#0a0a0c] rounded-t-xl">
          <div className="flex items-center gap-2">
            {step !== 'search' && (
              <button
                onClick={() => {
                  if (step === 'confirm') setStep('compare');
                  else { setStep('search'); setSecondaryContact(null); setPrimaryContact(contact); setPreview({}); }
                }}
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors mr-1"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Merge className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Unificar Contacto</h2>
              <p className="text-xs text-zinc-400">
                {step === 'search' && 'Buscar el contacto duplicado para unificar'}
                {step === 'compare' && 'Comparar y elegir qué datos conservar'}
                {step === 'confirm' && 'Confirmar la unificación'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#0b0b0d]">
          {(['search', 'compare', 'confirm'] as MergeStep[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-amber-400' : s === 'search' && step !== 'search' ? 'text-emerald-400' : 'text-zinc-600'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  step === s ? 'border-amber-500/50 bg-amber-500/10' : 
                  (i < ['search', 'compare', 'confirm'].indexOf(step)) ? 'border-emerald-500/50 bg-emerald-500/10' : 
                  'border-white/10 bg-white/5'
                }`}>
                  {(i < ['search', 'compare', 'confirm'].indexOf(step)) ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                {s === 'search' ? 'Buscar' : s === 'compare' ? 'Comparar' : 'Confirmar'}
              </div>
              {i < 2 && <ArrowRight className="w-3 h-3 text-zinc-700" />}
            </React.Fragment>
          ))}
        </div>

        {/* === STEP 1: SEARCH === */}
        {step === 'search' && (
          <>
            {/* Primary contact badge */}
            <div className="px-4 pt-3 pb-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Contacto actual</div>
              <div className="flex items-center gap-2 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                  {contact.nombre?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-emerald-300 truncate">{contact.nombre} {contact.apellido}</div>
                  <div className="text-[10px] text-zinc-500">{contact.telefono || contact.email || `ID: ${contact.id}`}</div>
                </div>
              </div>
            </div>

            {/* Search input */}
            <div className="p-4 border-b border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Buscar contacto duplicado</div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, teléfono, email o ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50 placeholder:text-zinc-600"
                  autoFocus
                />
              </div>
            </div>

            {/* Search results */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {isSearching && (
                <div className="flex items-center justify-center py-8 text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Buscando...</span>
                </div>
              )}

              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="text-center py-8 text-zinc-500 text-sm">No se encontraron contactos</div>
              )}

              {!isSearching && searchResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectSecondary(c)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg transition-all border border-transparent hover:bg-white/5 hover:border-white/10"
                >
                  <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/5 flex items-center justify-center text-zinc-400 text-xs font-bold">
                    {c.nombre?.[0] || '?'}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-300 truncate">
                      {c.nombre} {c.apellido}
                      <span className="ml-2 text-[10px] text-zinc-600 font-mono">#{c.id}</span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {[c.telefono, c.email, c.origen].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600" />
                </button>
              ))}

              {!isSearching && searchQuery.length < 2 && (
                <div className="text-center py-8 text-zinc-600 text-sm">
                  Escribe al menos 2 caracteres para buscar
                </div>
              )}
            </div>
          </>
        )}

        {/* === STEP 2: COMPARE === */}
        {step === 'compare' && secondaryContact && (
          <>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Side by side header with SWAP button */}
              <div className="grid grid-cols-[1fr,auto,1fr] gap-0 px-4 pt-3 pb-2 sticky top-0 bg-[#0c0c0e] z-10 border-b border-white/5">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-500 mb-1">Principal (se conserva)</div>
                  <div className="text-sm font-medium text-emerald-300 truncate">{primaryContact.nombre} {primaryContact.apellido}</div>
                  <div className="text-[10px] text-zinc-600 font-mono">#{primaryContact.id}</div>
                </div>
                <div className="flex flex-col items-center justify-center px-2 gap-1">
                  <button
                    onClick={handleSwap}
                    className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all border border-white/5 hover:border-amber-500/30"
                    title="Intercambiar principal ↔ secundario"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-rose-500 mb-1">Se absorbe</div>
                  <div className="text-sm font-medium text-rose-300 truncate">{secondaryContact.nombre} {secondaryContact.apellido}</div>
                  <div className="text-[10px] text-zinc-600 font-mono">#{secondaryContact.id}</div>
                </div>
              </div>

              {/* Field comparison rows */}
              <div className="px-4 py-2 space-y-1">
                {MERGEABLE_FIELDS.map(({ key, label }) => {
                  const primaryVal = getDisplayValue(primaryContact, key);
                  const secondaryVal = getDisplayValue(secondaryContact, key);
                  const choice = fieldChoices[key] || 'primary';
                  const isDifferent = primaryVal !== secondaryVal;

                  return (
                    <div key={key} className={`grid grid-cols-[1fr,auto,1fr] gap-0 rounded-lg border ${isDifferent ? 'border-amber-500/10 bg-amber-500/[0.02]' : 'border-white/5'}`}>
                      {/* Primary value */}
                      <button
                        onClick={() => handleFieldChoice(key, 'primary')}
                        className={`p-2.5 text-left rounded-l-lg transition-all ${
                          choice === 'primary' ? 'bg-emerald-500/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="text-[10px] text-zinc-600 mb-0.5">{label}</div>
                        <div className={`text-sm truncate ${choice === 'primary' ? 'text-emerald-300 font-medium' : 'text-zinc-400'}`}>
                          {primaryVal}
                        </div>
                      </button>

                      {/* Radio indicator */}
                      <div className="flex items-center px-1">
                        {choice === 'primary' ? (
                          <div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-emerald-500" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border-2 border-rose-500 bg-rose-500" />
                        )}
                      </div>

                      {/* Secondary value */}
                      <button
                        onClick={() => handleFieldChoice(key, 'secondary')}
                        className={`p-2.5 text-left rounded-r-lg transition-all ${
                          choice === 'secondary' ? 'bg-rose-500/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="text-[10px] text-zinc-600 mb-0.5">{label}</div>
                        <div className={`text-sm truncate ${choice === 'secondary' ? 'text-rose-300 font-medium' : 'text-zinc-400'}`}>
                          {secondaryVal}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Notes strategy selector */}
              <div className="px-4 py-3 border-t border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Notas (wp_contactos_nota)</div>
                <div className="flex gap-2">
                  {NOTES_STRATEGY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setNotesStrategy(opt.value)}
                      className={`flex-1 p-2 rounded-lg border text-left transition-all ${
                        notesStrategy === opt.value
                          ? 'border-amber-500/30 bg-amber-500/10'
                          : 'border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <div className={`text-xs font-medium ${notesStrategy === opt.value ? 'text-amber-300' : 'text-zinc-400'}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Entities that will be moved */}
              {isLoadingPreview ? (
                <div className="flex items-center justify-center py-6 text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm">Calculando entidades...</span>
                </div>
              ) : Object.keys(preview).length > 0 && (
                <div className="px-4 py-3 border-t border-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
                    Entidades del secundario que se moverán ({totalEntitiesToMove} total)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(preview).map(([key, count]) => {
                      const Icon = PREVIEW_ICONS[key] || FileText;
                      const label = PREVIEW_LABELS[key] || key;
                      return (
                        <div key={key} className="flex items-center gap-1.5 bg-zinc-900 border border-white/5 rounded-md px-2.5 py-1.5 text-xs">
                          <Icon className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-zinc-400">{label}</span>
                          <span className="text-amber-400 font-bold">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer: go to confirm */}
            <div className="p-4 border-t border-white/5 bg-[#0a0a0c] flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* === STEP 3: CONFIRM === */}
        {step === 'confirm' && secondaryContact && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* Warning */}
              <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200/80 leading-relaxed">
                  <strong className="text-amber-300">Acción importante:</strong> El contacto <strong className="text-rose-300">{secondaryContact.nombre} {secondaryContact.apellido} (#{secondaryContact.id})</strong> será desactivado y sus entidades se moverán a <strong className="text-emerald-300">{primaryContact.nombre} {primaryContact.apellido} (#{primaryContact.id})</strong>.
                </div>
              </div>

              {/* Summary of field choices */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Campos seleccionados del secundario</div>
                {(() => {
                  const secondaryFields = Object.entries(fieldChoices).filter(([, v]) => v === 'secondary');
                  if (secondaryFields.length === 0) {
                    return <div className="text-xs text-zinc-500">Todos los campos se mantienen del contacto principal</div>;
                  }
                  return (
                    <div className="space-y-1">
                      {secondaryFields.map(([key]) => {
                        const field = MERGEABLE_FIELDS.find(f => f.key === key);
                        return (
                          <div key={key} className="text-xs text-rose-300 bg-rose-500/5 border border-rose-500/10 rounded px-2 py-1 inline-block mr-1.5 mb-1">
                            {field?.label}: {getDisplayValue(secondaryContact, key)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Notes strategy summary */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Notas</div>
                <div className="text-xs text-zinc-400">
                  {notesStrategy === 'both' && '✅ Se conservan todas las notas de ambos contactos'}
                  {notesStrategy === 'primary_only' && `📋 Solo se conservan las notas de ${primaryContact.nombre} (principal)`}
                  {notesStrategy === 'secondary_only' && `📋 Solo se conservan las notas de ${secondaryContact.nombre} (secundario)`}
                </div>
              </div>

              {/* Entities count */}
              {totalEntitiesToMove > 0 && (
                <div className="text-sm text-zinc-400">
                  Se moverán <strong className="text-amber-300">{totalEntitiesToMove}</strong> entidades (conversaciones, citas, etc.) al contacto principal.
                </div>
              )}

              {/* Confirmation input */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">
                  Escribe <strong className="text-amber-400 font-mono">UNIFICAR</strong> para confirmar
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50 placeholder:text-zinc-600 font-mono"
                  placeholder="UNIFICAR"
                  autoFocus
                />
              </div>

              {mergeError && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-rose-300">{mergeError}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-[#0a0a0c] flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors" disabled={isMerging}>
                Cancelar
              </button>
              <button
                onClick={handleMerge}
                disabled={confirmText !== 'UNIFICAR' || isMerging}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                  confirmText !== 'UNIFICAR' || isMerging
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                }`}
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Unificando...</span>
                  </>
                ) : (
                  <>
                    <Merge className="w-4 h-4" />
                    <span>Unificar Contactos</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
