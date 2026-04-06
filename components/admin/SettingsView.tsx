'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Building2,
  Save,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Shield,
  GitBranch,
  History,
  Globe,
  Maximize2,
  MessageSquareText,
  Phone,
  Mail,
  MapPin,
  Palette,
  Database,
  Settings2,
  Eye,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Bot,
  Upload,
  Image as ImageIcon,
  X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import {
  useContactStore,
  selectSelectedEnterpriseId,
  selectEnterpriseProfile,
  selectEnterpriseProfileLoading,
  selectEnterpriseProfileError,
  selectUserContext
} from '../../store/contactStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { EnterpriseProfile } from '../../types/contact';
import { AgentsSection } from './agents';
import { FunnelConfigSection } from './funnel/FunnelConfigSection';
import { FullscreenTextEditor } from './settings/FullscreenTextEditor';
import { EnterpriseHistoryViewer } from './settings/EnterpriseHistoryViewer';
import { PhoneNumbersSection } from './settings/PhoneNumbersSection';
import { WhatsAppTemplatesSection } from './settings/WhatsAppTemplatesSection';
import { useAdminStore, selectFocusedTemplateId } from '../../store/adminStore';

type SectionId = 'perfil' | 'contenido' | 'embudo' | 'flags' | 'agentes' | 'numeros' | 'whatsapp';

const SECTION_META: Array<{ id: SectionId; label: string; icon: React.ElementType; color?: string }> = [
  { id: 'perfil', label: 'Perfil Empresa', icon: Building2 },
  { id: 'contenido', label: 'Contenido', icon: Globe },
  { id: 'embudo', label: 'Embudo', icon: GitBranch, color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' },
  { id: 'agentes', label: 'Agentes IA', icon: Bot, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  { id: 'numeros', label: 'Números', icon: Phone, color: 'bg-sky-500/10 border-sky-500/20 text-sky-400' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquareText, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' }
];

const safeJsonParse = (input: string): { ok: boolean; value: any; error?: string } => {
  try {
    if (!input.trim()) return { ok: true, value: null };
    return { ok: true, value: JSON.parse(input) };
  } catch (e: any) {
    return { ok: false, value: null, error: e?.message || 'JSON inválido' };
  }
};

const toJsonString = (value: any) => {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

export const SettingsView: React.FC = () => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const enterpriseProfile = useContactStore(selectEnterpriseProfile);
  const enterpriseProfileLoading = useContactStore(selectEnterpriseProfileLoading);
  const enterpriseProfileError = useContactStore(selectEnterpriseProfileError);
  const userContext = useContactStore(selectUserContext);

  const fetchEnterpriseProfile = useContactStore((s) => s.fetchEnterpriseProfile);
  const updateEnterpriseProfile = useContactStore((s) => s.updateEnterpriseProfile);

  // Engagement tracking
  usePageTracking('settings');
  const trackAction = useActionTracking('settings');

  const focusedTemplateId = useAdminStore(selectFocusedTemplateId);
  const clearFocusedTemplate = useAdminStore((s) => s.clearFocusedTemplateNavigation);

  const [activeSection, setActiveSection] = useState<SectionId>('perfil');
  const [draft, setDraft] = useState<EnterpriseProfile | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [metadataText, setMetadataText] = useState<string>('');
  const [brandingText, setBrandingText] = useState<string>('');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Roles 1 (Dev/Admin) and 2 (Team Lead) can edit enterprise settings
  const canEdit = [1, 2].includes(userContext?.roleId ?? 999);
  const restrictedReadOnlySections: SectionId[] = ['numeros', 'whatsapp'];
  const availableSections = useMemo(
    () => SECTION_META.filter((section) => !restrictedReadOnlySections.includes(section.id) || [1, 2].includes(userContext?.roleId ?? 999)),
    [userContext?.roleId]
  );

  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchEnterpriseProfile(selectedEnterpriseId, true);
    }
  }, [selectedEnterpriseId, fetchEnterpriseProfile]);

  useEffect(() => {
    if (!availableSections.some((section) => section.id === activeSection)) {
      setActiveSection(availableSections[0]?.id ?? 'perfil');
    }
  }, [activeSection, availableSections]);

  // Auto-navigate to WhatsApp tab when a template is focused from chat
  useEffect(() => {
    if (focusedTemplateId && availableSections.some(s => s.id === 'whatsapp')) {
      setActiveSection('whatsapp');
    }
  }, [focusedTemplateId, availableSections]);

  useEffect(() => {
    if (enterpriseProfile) {
      setDraft(enterpriseProfile);
      setMetadataText(toJsonString(enterpriseProfile.metadata));
      setBrandingText(toJsonString(enterpriseProfile.branding));
      setMetadataError(null);
      setBrandingError(null);
      setSaveError(null);
      setSaveSuccess(null);
    } else {
      setDraft(null);
      setMetadataText('');
      setBrandingText('');
      setMetadataError(null);
      setBrandingError(null);
      setSaveError(null);
      setSaveSuccess(null);
    }
  }, [enterpriseProfile]);

  const isDirty = useMemo(() => {
    if (!draft || !enterpriseProfile) return false;

    const normalize = (p: EnterpriseProfile) => {
      const copy: any = { ...p };
      delete copy.fecha_creacion;
      delete copy.fecha_actualizacion;
      return copy;
    };

    const a = normalize(draft);
    const b = normalize(enterpriseProfile);

    return JSON.stringify(a) !== JSON.stringify(b);
  }, [draft, enterpriseProfile]);

  const isSaving = enterpriseProfileLoading;

  const handleField = <K extends keyof EnterpriseProfile>(key: K, value: EnterpriseProfile[K]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  };

  const handleToggle = (key: keyof EnterpriseProfile) => {
    if (!draft) return;
    const current = (draft as any)[key];
    handleField(key as any, (!current) as any);
  };

  const validateJsonFields = (): boolean => {
    setMetadataError(null);
    setBrandingError(null);

    const meta = safeJsonParse(metadataText);
    if (!meta.ok) {
      setMetadataError(meta.error || 'JSON inválido');
      return false;
    }

    const brand = safeJsonParse(brandingText);
    if (!brand.ok) {
      setBrandingError(brand.error || 'JSON inválido');
      return false;
    }

    // Apply to draft
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        metadata: meta.value,
        branding: brand.value
      };
    });

    return true;
  };

  const onSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);
    trackAction('settings.save_attempt', { section: activeSection });

    if (!selectedEnterpriseId) {
      setSaveError('No hay empresa seleccionada');
      return;
    }

    if (!draft) {
      setSaveError('No hay datos para guardar');
      return;
    }

    if (!canEdit) {
      setSaveError('No tienes permisos para editar esta configuración');
      return;
    }

    if (!draft.nombre || !draft.nombre.trim()) {
      setSaveError('El nombre de la empresa es obligatorio');
      return;
    }

    if (!validateJsonFields()) {
      setSaveError('Revisa los campos JSON (metadata/branding)');
      return;
    }

    const patch: Partial<EnterpriseProfile> = {
      nombre: draft.nombre,
      ciudad: draft.ciudad ?? null,
      pais: draft.pais ?? null,
      rubro: draft.rubro ?? null,
      informacion_empresarial: draft.informacion_empresarial ?? null,
      preguntas_frecuentes: draft.preguntas_frecuentes ?? null,
      servicios_generales: draft.servicios_generales ?? null,
      embudo_ventas: draft.embudo_ventas ?? null,
      logo_url: draft.logo_url ?? null,
      sitio_web: draft.sitio_web ?? null,
      telefono: draft.telefono ?? null,
      email: draft.email ?? null,
      direccion: draft.direccion ?? null,
      team_slack: draft.team_slack ?? null,
      reglas_negocio: draft.reglas_negocio ?? null,
      canal_comunicacion: draft.canal_comunicacion ?? null,
      metricas_activa: draft.metricas_activa ?? null,
      timezone: draft.timezone ?? null,
      branding: draft.branding ?? null,
      metadata: draft.metadata ?? null,
      activo: draft.activo ?? null,
      email_marketing: draft.email_marketing ?? null
    };

    const updated = await updateEnterpriseProfile(selectedEnterpriseId, patch);
    if (!updated) {
      setSaveError('No se pudo guardar. Intenta nuevamente.');
      trackAction('settings.save_error', { section: activeSection });
      return;
    }

    setSaveSuccess('Cambios guardados');
    trackAction('settings.save_success', { section: activeSection });
    setTimeout(() => setSaveSuccess(null), 2500);
  };

  const onRefresh = async () => {
    if (!selectedEnterpriseId) return;
    setSaveError(null);
    setSaveSuccess(null);
    await fetchEnterpriseProfile(selectedEnterpriseId, true);
  };

  // Helper to save a single field directly to DB (used by fullscreen editor)
  const saveFieldToDb = async (fieldKey: keyof EnterpriseProfile, value: string) => {
    if (!selectedEnterpriseId || !canEdit) return;
    
    const patch: Partial<EnterpriseProfile> = { [fieldKey]: value || null };
    const updated = await updateEnterpriseProfile(selectedEnterpriseId, patch);
    
    if (updated) {
      setSaveSuccess('Campo guardado');
      trackAction('settings.field_saved', { field: fieldKey });
      setTimeout(() => setSaveSuccess(null), 2000);
    } else {
      setSaveError('Error al guardar el campo');
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  if (!selectedEnterpriseId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
          <Building2 className="w-7 h-7 text-zinc-500" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Configuración</h3>
        <p className="text-sm text-zinc-500 max-w-xs">Selecciona una empresa para configurar su perfil.</p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 h-full overflow-y-auto bg-[#0a0a0c]">
      <div className="flex flex-col gap-3 md:gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-base md:text-xl font-bold text-zinc-200 mb-0.5 md:mb-1">
              Configuración de Empresa
            </h1>
            <p className="text-xs md:text-sm text-zinc-400">
              Perfil y parámetros operativos
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowHistory(true)}
              className="p-1.5 md:p-2 rounded-lg border bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
              title="Ver historial de cambios"
            >
              <History className="w-4 h-4" />
            </button>
            
            <button
              onClick={onRefresh}
              disabled={enterpriseProfileLoading}
              className={`
                p-1.5 md:p-2 rounded-lg border transition-all
                ${enterpriseProfileLoading
                  ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600 cursor-not-allowed'
                  : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                }
              `}
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${enterpriseProfileLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onSave}
              disabled={!canEdit || !isDirty || isSaving}
              className={`
                inline-flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg border transition-all text-xs md:text-sm
                ${(!canEdit || !isDirty || isSaving)
                  ? 'bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed'
                  : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                }
              `}
              title={!canEdit ? 'Solo admin puede editar' : !isDirty ? 'Sin cambios' : 'Guardar cambios'}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </div>

        {/* Permission banner */}
        {!canEdit && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Modo solo lectura</p>
              <p className="text-xs text-amber-300/70 mt-0.5">Solo administradores pueden editar el perfil de empresa.</p>
            </div>
          </div>
        )}

        {/* Error banners */}
        {(enterpriseProfileError || saveError) && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-xs text-red-400/70 mt-1">{saveError || enterpriseProfileError}</p>
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
            {saveSuccess}
          </div>
        )}

        {/* Section tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {availableSections.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`
                  inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs
                  ${isActive
                    ? (s.color || 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400')
                    : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading */}
      {enterpriseProfileLoading && !draft && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
            <Building2 className="w-5 h-5 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-400">Cargando perfil...</p>
            <p className="text-xs text-zinc-500 mt-1">Consultando configuración de empresa</p>
          </div>
        </div>
      )}

      {/* Main form */}
      {draft && (
        <div className="grid grid-cols-1 gap-3 md:gap-4">
          {activeSection === 'perfil' && (
            <div className="space-y-4">
              {/* Identidad */}
              <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">Identidad</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    label="Nombre"
                    required
                    value={draft.nombre || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('nombre', v)}
                  />
                  <Field
                    label="Rubro"
                    value={draft.rubro || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('rubro', v)}
                  />
                  <Field
                    label="Ciudad"
                    value={draft.ciudad || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('ciudad', v)}
                  />
                  <Field
                    label="País"
                    value={draft.pais || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('pais', v)}
                  />
                  <LogoUploadField
                    value={draft.logo_url || ''}
                    disabled={!canEdit}
                    enterpriseId={selectedEnterpriseId}
                    onChange={(v) => handleField('logo_url', v)}
                    onPersist={(v) => saveFieldToDb('logo_url', v)}
                  />
                  <Field
                    label="Sitio Web"
                    value={draft.sitio_web || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('sitio_web', v)}
                  />
                </div>
              </div>

              {/* Contacto */}
              <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">Contacto</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    label="Teléfono"
                    icon={Phone}
                    value={draft.telefono || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('telefono', v)}
                  />
                  <Field
                    label="Email"
                    icon={Mail}
                    value={draft.email || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('email', v)}
                  />
                  <Field
                    label="Dirección"
                    icon={MapPin}
                    value={draft.direccion || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('direccion', v)}
                  />
                  <Field
                    label="Timezone"
                    value={draft.timezone || ''}
                    disabled={!canEdit}
                    onChange={(v) => handleField('timezone', v)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'contenido' && (
            <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Contenido empresarial</h2>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <RichTextAreaField
                  label="Información empresarial"
                  value={draft.informacion_empresarial || ''}
                  disabled={!canEdit}
                  onChange={(v) => handleField('informacion_empresarial', v)}
                  onSaveToDb={(v) => saveFieldToDb('informacion_empresarial', v)}
                  enterpriseId={selectedEnterpriseId || undefined}
                  fieldKey="informacion_empresarial"
                />
                <RichTextAreaField
                  label="Servicios generales"
                  value={draft.servicios_generales || ''}
                  disabled={!canEdit}
                  onChange={(v) => handleField('servicios_generales', v)}
                  onSaveToDb={(v) => saveFieldToDb('servicios_generales', v)}
                  enterpriseId={selectedEnterpriseId || undefined}
                  fieldKey="servicios_generales"
                />
                <RichTextAreaField
                  label="Preguntas frecuentes"
                  value={draft.preguntas_frecuentes || ''}
                  disabled={!canEdit}
                  onChange={(v) => handleField('preguntas_frecuentes', v)}
                  onSaveToDb={(v) => saveFieldToDb('preguntas_frecuentes', v)}
                  enterpriseId={selectedEnterpriseId || undefined}
                  fieldKey="preguntas_frecuentes"
                />
              </div>
            </div>
          )}

          {activeSection === 'flags' && (
            <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Flags</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Toggle
                  label="Empresa activa"
                  description="Controla la visibilidad/uso en el sistema"
                  value={!!draft.activo}
                  disabled={!canEdit}
                  onChange={() => handleToggle('activo')}
                />
                <Toggle
                  label="Métricas activas"
                  description="Habilita el dashboard de observabilidad"
                  value={!!draft.metricas_activa}
                  disabled={!canEdit}
                  onChange={() => handleToggle('metricas_activa')}
                />
                <Toggle
                  label="Email marketing"
                  description="Habilita campañas por email"
                  value={!!draft.email_marketing}
                  disabled={!canEdit}
                  onChange={() => handleToggle('email_marketing')}
                />
              </div>
            </div>
          )}

          {activeSection === 'embudo' && (
            <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4">
              <FunnelConfigSection />
            </div>
          )}

          {activeSection === 'agentes' && (
            <AgentsSection />
          )}

          {activeSection === 'numeros' && (
            <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4">
              <PhoneNumbersSection />
            </div>
          )}

          {activeSection === 'whatsapp' && (
            <div className="bg-[#0d0d0f] border border-white/5 rounded-xl p-4">
              <WhatsAppTemplatesSection />
            </div>
          )}
        </div>
      )}
      
      {/* Enterprise History Modal */}
      {showHistory && selectedEnterpriseId && (
        <EnterpriseHistoryViewer
          enterpriseId={selectedEnterpriseId}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

const RichTextAreaField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSaveToDb?: (newValue: string) => Promise<void>;
  disabled?: boolean;
  enterpriseId?: number;
  fieldKey?: string;
}> = ({ label, value, onChange, onSaveToDb, disabled = false, enterpriseId, fieldKey }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const preview = useMemo(() => {
    const raw = (value || '').trim();
    if (!raw) return { type: 'empty' as const };
    const parsed = safeJsonParse(raw);
    if (parsed.ok && parsed.value !== null && parsed.value !== undefined) {
      return { type: 'json' as const, value: parsed.value };
    }
    return { type: 'markdown' as const, value: value || '' };
  }, [value]);

  return (
    <>
      <div className="space-y-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
          {label}
        </div>

        <div 
          className="w-full bg-black/30 border border-white/10 rounded-lg p-4 cursor-pointer hover:border-primary-500/30 transition-colors min-h-[80px]"
          onClick={() => setIsFullscreen(true)}
        >
          {preview.type === 'empty' ? (
            <div className="text-xs text-zinc-600">Click para editar...</div>
          ) : preview.type === 'json' ? (
            <pre className="text-[12px] md:text-xs text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[100px] pr-2">
              {JSON.stringify(preview.value, null, 2)}
            </pre>
          ) : (
            <div
              className={
                "prose prose-invert max-w-none max-h-[100px] overflow-hidden " +
                "text-[13px] md:text-sm leading-relaxed " +
                "prose-p:my-2 prose-p:leading-6 " +
                "prose-ul:my-2 prose-ol:my-2 " +
                "prose-li:my-0.5 prose-li:leading-6 " +
                "prose-headings:mt-3 prose-headings:mb-1 " +
                "prose-strong:text-zinc-100 prose-a:text-primary-400"
              }
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {preview.value}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Editor Modal */}
      {isFullscreen && (
        <FullscreenTextEditor
          label={label}
          value={value}
          onChange={onChange}
          onSaveToDb={onSaveToDb}
          onClose={() => setIsFullscreen(false)}
          disabled={disabled}
          enterpriseId={enterpriseId}
          fieldKey={fieldKey}
        />
      )}
    </>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  icon?: React.ElementType;
}> = ({ label, value, onChange, disabled = false, required = false, icon: Icon }) => {
  return (
    <label className="block">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-bold flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-600" />}
        <span>
          {label}
          {required && <span className="text-red-400"> *</span>}
        </span>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none disabled:opacity-60"
      />
    </label>
  );
};

const Toggle: React.FC<{
  label: string;
  description: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}> = ({ label, description, value, onChange, disabled = false }) => {
  const Icon = value ? ToggleRight : ToggleLeft;
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`
        text-left p-3 rounded-xl border transition-all
        ${disabled ? 'bg-zinc-900/40 border-white/5 opacity-60 cursor-not-allowed' : 'bg-zinc-900/50 border-white/5 hover:border-white/10 hover:bg-zinc-800/40'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${value ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-zinc-400'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200">{label}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{description}</div>
        </div>
      </div>
    </button>
  );
};

const JsonField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  onValidate: () => void;
  disabled?: boolean;
  error?: string | null;
}> = ({ label, value, onChange, onValidate, disabled = false, error }) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-zinc-600" />
          <span>{label}</span>
        </div>
        <button
          type="button"
          onClick={onValidate}
          disabled={disabled}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            disabled
              ? 'bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed'
              : 'bg-zinc-900/50 border-white/10 text-zinc-300 hover:bg-white/5'
          }`}
        >
          Validar
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={10}
        spellCheck={false}
        className={`w-full font-mono bg-black/40 border rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none resize-y disabled:opacity-60 ${
          error ? 'border-red-500/40 focus:border-red-500/60' : 'border-white/10 focus:border-primary-500/50'
        }`}
      />
      {error && <div className="text-[11px] text-red-400">{error}</div>}
    </div>
  );
};

const LogoUploadField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onPersist?: (v: string) => Promise<void> | void;
  disabled?: boolean;
  enterpriseId: number | null;
}> = ({ value, onChange, onPersist, disabled = false, enterpriseId }) => {
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !enterpriseId) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const { uploadEmpresaLogo } = await import('../../lib/storage');
      const result = await uploadEmpresaLogo(file, enterpriseId);

      if (result.success && result.url) {
        onChange(result.url);
        if (onPersist) {
          await onPersist(result.url);
        }
      } else {
        setUploadError(result.error || 'Error al subir imagen');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Error inesperado');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-2">
        <ImageIcon className="w-3.5 h-3.5 text-zinc-600" />
        <span>Logo de Empresa</span>
      </div>

      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="w-20 h-20 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            <Image
              src={value}
              alt="Logo"
              width={80}
              height={80}
              className="w-full h-full object-contain"
              unoptimized
            />
          ) : (
            <ImageIcon className="w-8 h-8 text-zinc-600" />
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            disabled={disabled || isUploading}
            className="hidden"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all
                ${disabled || isUploading
                  ? 'bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed'
                  : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                }
              `}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Subir imagen
                </>
              )}
            </button>

            {value && !disabled && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-xs hover:bg-red-500/10 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                Quitar
              </button>
            )}
          </div>

          <p className="text-[10px] text-zinc-500">
            Formatos: JPG, PNG, WebP, GIF. Máx 5MB
          </p>

          {uploadError && (
            <p className="text-[11px] text-red-400">{uploadError}</p>
          )}
        </div>
      </div>
    </div>
  );
};
