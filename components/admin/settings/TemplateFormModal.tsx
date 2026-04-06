'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, Plus, Trash2, Eye, Save, Send, AlertTriangle,
  Type, Image, Video, FileText
} from 'lucide-react';
import { usePhoneNumbersStore, selectPhoneNumbers, selectPhoneNumbersLoading } from '../../../store/phoneNumbersStore';
import {
  useWhatsAppTemplatesStore,
  selectWhatsAppIsSubmitting,
  selectWhatsAppSelectedTemplate,
  selectWhatsAppTemplatesError
} from '../../../store/whatsappTemplatesStore';
import {
  TemplateComponent,
  TemplateButton,
  TemplateHeaderFormat,
  CreateTemplatePayload
} from '../../../types/whatsapp-template';

interface TemplateFormModalProps {
  enterpriseId: number;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt_BR', label: 'Português' },
  { code: 'es_AR', label: 'Español (AR)' },
  { code: 'es_MX', label: 'Español (MX)' }
];

const CATEGORIES: { value: 'marketing' | 'utility' | 'authentication'; label: string }[] = [
  { value: 'utility', label: 'Utilidad' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'authentication', label: 'Autenticación' }
];

const HEADER_FORMATS: { value: TemplateHeaderFormat; label: string; icon: React.ReactNode }[] = [
  { value: 'TEXT', label: 'Texto', icon: <Type className="w-3.5 h-3.5" /> },
  { value: 'IMAGE', label: 'Imagen', icon: <Image className="w-3.5 h-3.5" /> },
  { value: 'VIDEO', label: 'Video', icon: <Video className="w-3.5 h-3.5" /> },
  { value: 'DOCUMENT', label: 'Documento', icon: <FileText className="w-3.5 h-3.5" /> }
];

const emptyButton = (): TemplateButton => ({ type: 'QUICK_REPLY', text: '' });

const detectVariables = (text: string): string[] => {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  return matches ? [...new Set(matches)] : [];
};

interface TemplateFormCache {
  numeroId: number;
  templateName: string;
  languageCode: string;
  metaCategory: 'marketing' | 'utility' | 'authentication';
  clasificacionInterna: string;
  useHeader: boolean;
  headerFormat: TemplateHeaderFormat;
  headerText: string;
  bodyText: string;
  useFooter: boolean;
  footerText: string;
  buttons: TemplateButton[];
  showPreview: boolean;
}

const buildTemplateFormCacheKey = (enterpriseId: number, templateId: number | null) =>
  `whatsapp-template-form:${enterpriseId}:${templateId ?? 'new'}`;

const readTemplateFormCache = (storageKey: string): TemplateFormCache | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as TemplateFormCache;
  } catch {
    return null;
  }
};

const writeTemplateFormCache = (storageKey: string, value: TemplateFormCache) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {}
};

const clearTemplateFormCache = (storageKey: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
};

export const TemplateFormModal: React.FC<TemplateFormModalProps> = ({ enterpriseId, onClose }) => {
  const phoneNumbers = usePhoneNumbersStore(selectPhoneNumbers);
  const isLoadingNumbers = usePhoneNumbersStore(selectPhoneNumbersLoading);
  const fetchPhoneNumbers = usePhoneNumbersStore((s) => s.fetchPhoneNumbers);
  const isSubmitting = useWhatsAppTemplatesStore(selectWhatsAppIsSubmitting);
  const selectedTemplate = useWhatsAppTemplatesStore(selectWhatsAppSelectedTemplate);
  const templatesError = useWhatsAppTemplatesStore(selectWhatsAppTemplatesError);
  const createTemplate = useWhatsAppTemplatesStore((s) => s.createTemplate);
  const updateTemplate = useWhatsAppTemplatesStore((s) => s.updateTemplate);
  const clearTemplatesError = useWhatsAppTemplatesStore((s) => s.clearTemplatesError);

  const isEditing = !!selectedTemplate;

  // Form state
  const [numeroId, setNumeroId] = useState<number>(selectedTemplate?.numero_id || 0);
  const [templateName, setTemplateName] = useState(selectedTemplate?.template_name || '');
  const [languageCode, setLanguageCode] = useState(selectedTemplate?.language_code || 'es');
  const [metaCategory, setMetaCategory] = useState<'marketing' | 'utility' | 'authentication'>(
    selectedTemplate?.meta_category || 'utility'
  );
  const [clasificacionInterna, setClasificacionInterna] = useState(selectedTemplate?.clasificacion_interna || '');

  // Components state
  const [useHeader, setUseHeader] = useState(false);
  const [headerFormat, setHeaderFormat] = useState<TemplateHeaderFormat>('TEXT');
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [useFooter, setUseFooter] = useState(false);
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  // Preview mode
  const [showPreview, setShowPreview] = useState(false);
  const selectedTemplateId = selectedTemplate?.id ?? null;
  const storageKey = useMemo(
    () => buildTemplateFormCacheKey(enterpriseId, selectedTemplateId),
    [enterpriseId, selectedTemplateId]
  );
  const hasHydratedCacheRef = useRef(false);

  // Fetch phone numbers on mount if not already loaded
  useEffect(() => {
    fetchPhoneNumbers(enterpriseId);
  }, [enterpriseId, fetchPhoneNumbers]);

  // Active numbers for the enterprise
  const activeNumbers = useMemo(
    () => phoneNumbers.filter((n) => n.activo && n.id_kapso),
    [phoneNumbers]
  );

  useEffect(() => {
    hasHydratedCacheRef.current = false;

    const cached = readTemplateFormCache(storageKey);
    const comps = (selectedTemplate as any)?.components as TemplateComponent[] | undefined;
    const header = comps?.find((c) => c.type === 'HEADER');
    const body = comps?.find((c) => c.type === 'BODY');
    const footer = comps?.find((c) => c.type === 'FOOTER');
    const btns = comps?.find((c) => c.type === 'BUTTONS');

    setNumeroId(cached?.numeroId ?? selectedTemplate?.numero_id ?? 0);
    setTemplateName(cached?.templateName ?? selectedTemplate?.template_name ?? '');
    setLanguageCode(cached?.languageCode ?? selectedTemplate?.language_code ?? 'es');
    setMetaCategory(cached?.metaCategory ?? selectedTemplate?.meta_category ?? 'utility');
    setClasificacionInterna(cached?.clasificacionInterna ?? selectedTemplate?.clasificacion_interna ?? '');
    setUseHeader(cached?.useHeader ?? !!header);
    setHeaderFormat(cached?.headerFormat ?? header?.format ?? 'TEXT');
    setHeaderText(cached?.headerText ?? header?.text ?? '');
    setBodyText(cached?.bodyText ?? body?.text ?? '');
    setUseFooter(cached?.useFooter ?? !!footer);
    setFooterText(cached?.footerText ?? footer?.text ?? '');
    setButtons(cached?.buttons ?? btns?.buttons ?? []);
    setShowPreview(cached?.showPreview ?? false);

    hasHydratedCacheRef.current = true;
  }, [selectedTemplate, storageKey]);

  useEffect(() => {
    if (!hasHydratedCacheRef.current) return;

    writeTemplateFormCache(storageKey, {
      numeroId,
      templateName,
      languageCode,
      metaCategory,
      clasificacionInterna,
      useHeader,
      headerFormat,
      headerText,
      bodyText,
      useFooter,
      footerText,
      buttons,
      showPreview
    });
  }, [
    numeroId,
    templateName,
    languageCode,
    metaCategory,
    clasificacionInterna,
    useHeader,
    headerFormat,
    headerText,
    bodyText,
    useFooter,
    footerText,
    buttons,
    showPreview,
    storageKey
  ]);

  const bodyVariables = useMemo(() => detectVariables(bodyText), [bodyText]);

  const buildComponents = (): TemplateComponent[] => {
    const components: TemplateComponent[] = [];

    if (useHeader) {
      components.push({
        type: 'HEADER',
        format: headerFormat,
        ...(headerFormat === 'TEXT' ? { text: headerText } : {})
      });
    }

    components.push({ type: 'BODY', text: bodyText });

    if (useFooter && footerText.trim()) {
      components.push({ type: 'FOOTER', text: footerText });
    }

    if (buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons });
    }

    return components;
  };

  const handleSubmit = async (submitToMeta: boolean) => {
    clearTemplatesError();

    if (!numeroId) return;
    if (!templateName.trim()) return;
    if (!bodyText.trim()) return;

    const components = buildComponents();
    let wasSaved = false;

    if (isEditing && selectedTemplate) {
      wasSaved = await updateTemplate(selectedTemplate.id, {
        template_name: templateName,
        language_code: languageCode,
        meta_category: metaCategory,
        clasificacion_interna: clasificacionInterna || undefined,
        components,
        submit_to_meta: submitToMeta
      });
    } else {
      const payload: CreateTemplatePayload = {
        numero_id: numeroId,
        empresa_id: enterpriseId,
        template_name: templateName,
        language_code: languageCode,
        meta_category: metaCategory,
        clasificacion_interna: clasificacionInterna || undefined,
        components,
        submit_to_meta: submitToMeta
      };
      wasSaved = await createTemplate(payload);
    }

    if (wasSaved) {
      clearTemplateFormCache(storageKey);
    }
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, emptyButton()]);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, field: keyof TemplateButton, value: string) => {
    const updated = [...buttons];
    updated[index] = { ...updated[index], [field]: value };
    setButtons(updated);
  };

  const isValid = numeroId > 0 && templateName.trim() && /^[a-z][a-z0-9_]*$/.test(templateName) && bodyText.trim();

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0e0e11] border border-white/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0e0e11]/95 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-zinc-200">
            {isEditing ? 'Editar Plantilla' : 'Nueva Plantilla WhatsApp'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Error */}
          {templatesError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{templatesError}</p>
              <button onClick={clearTemplatesError} className="ml-auto text-red-400 hover:text-red-300">×</button>
            </div>
          )}

          {/* Number selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Número de WhatsApp *</label>
            <select
              value={numeroId}
              onChange={(e) => setNumeroId(Number(e.target.value))}
              disabled={isEditing || isLoadingNumbers}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
            >
              <option value={0}>
                {isLoadingNumbers ? 'Cargando números...' : 'Seleccionar número...'}
              </option>
              {activeNumbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.telefono} — {n.nombre || 'Sin nombre'}
                </option>
              ))}
            </select>
          </div>

          {/* Template name + language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Nombre de plantilla *</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                placeholder="mi_plantilla"
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
              <p className="mt-1 text-[10px] text-zinc-500">Minúsculas, guiones bajos, sin espacios</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Idioma *</label>
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Category + Classification */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Categoría Meta *</label>
              <select
                value={metaCategory}
                onChange={(e) => setMetaCategory(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Clasificación interna</label>
              <input
                type="text"
                value={clasificacionInterna}
                onChange={(e) => setClasificacionInterna(e.target.value)}
                placeholder="Ej: cobranza, bienvenida..."
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* ── Components ── */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Componentes de la plantilla</h3>

            {/* Header toggle */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useHeader}
                  onChange={(e) => setUseHeader(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span className="text-xs font-medium text-zinc-300">Header</span>
              </label>

              {useHeader && (
                <div className="pl-6 space-y-2">
                  <div className="flex gap-2">
                    {HEADER_FORMATS.map((hf) => (
                      <button
                        key={hf.value}
                        type="button"
                        onClick={() => setHeaderFormat(hf.value)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                          headerFormat === hf.value
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        {hf.icon}
                        {hf.label}
                      </button>
                    ))}
                  </div>
                  {headerFormat === 'TEXT' && (
                    <input
                      type="text"
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                      placeholder="Texto del header (max 60 chars)"
                      maxLength={60}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                    />
                  )}
                  {headerFormat !== 'TEXT' && (
                    <p className="text-[11px] text-zinc-500">
                      El archivo de {headerFormat.toLowerCase()} se configurará al momento del envío.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">
                Body * <span className="text-zinc-600 font-normal">({bodyText.length}/1024)</span>
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Hola {{1}}, tu cita es el {{2}} a las {{3}}."
                maxLength={1024}
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
              />
              {bodyVariables.length > 0 && (
                <p className="mt-1 text-[10px] text-emerald-400/70">
                  Variables detectadas: {bodyVariables.join(', ')}
                </p>
              )}
            </div>

            {/* Footer toggle */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useFooter}
                  onChange={(e) => setUseFooter(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span className="text-xs font-medium text-zinc-300">Footer</span>
              </label>

              {useFooter && (
                <div className="pl-6">
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Texto del footer (max 60 chars)"
                    maxLength={60}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">Botones ({buttons.length}/3)</span>
                {buttons.length < 3 && (
                  <button
                    type="button"
                    onClick={addButton}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900/50 border border-white/5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    Agregar
                  </button>
                )}
              </div>

              {buttons.map((btn, idx) => (
                <div key={idx} className="flex items-start gap-2 p-3 rounded-xl bg-zinc-900/30 border border-white/5">
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={btn.type}
                        onChange={(e) => updateButton(idx, 'type', e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-zinc-900/50 border border-white/10 text-xs text-zinc-200 focus:outline-none"
                      >
                        <option value="QUICK_REPLY">Respuesta rápida</option>
                        <option value="URL">URL</option>
                        <option value="PHONE_NUMBER">Teléfono</option>
                      </select>
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => updateButton(idx, 'text', e.target.value)}
                        placeholder="Texto del botón"
                        maxLength={25}
                        className="px-2 py-1.5 rounded-lg bg-zinc-900/50 border border-white/10 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                      />
                    </div>
                    {btn.type === 'URL' && (
                      <input
                        type="text"
                        value={btn.url || ''}
                        onChange={(e) => updateButton(idx, 'url', e.target.value)}
                        placeholder="https://ejemplo.com/{{1}}"
                        className="w-full px-2 py-1.5 rounded-lg bg-zinc-900/50 border border-white/10 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                      />
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                      <input
                        type="text"
                        value={btn.phone_number || ''}
                        onChange={(e) => updateButton(idx, 'phone_number', e.target.value)}
                        placeholder="+51999999999"
                        className="w-full px-2 py-1.5 rounded-lg bg-zinc-900/50 border border-white/10 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeButton(idx)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="p-4 rounded-xl bg-[#0b3d2e]/30 border border-emerald-500/20">
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500/60 mb-3">Vista previa</p>
              <div className="space-y-2 text-sm">
                {useHeader && headerFormat === 'TEXT' && headerText && (
                  <p className="font-bold text-zinc-200">{headerText}</p>
                )}
                {useHeader && headerFormat !== 'TEXT' && (
                  <div className="w-full h-24 rounded-lg bg-zinc-800/50 border border-white/5 flex items-center justify-center text-zinc-500 text-xs">
                    [{headerFormat}]
                  </div>
                )}
                <p className="text-zinc-300 whitespace-pre-wrap">{bodyText || 'Texto del mensaje...'}</p>
                {useFooter && footerText && (
                  <p className="text-xs text-zinc-500">{footerText}</p>
                )}
                {buttons.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    {buttons.map((btn, idx) => (
                      <span key={idx} className="px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/10 text-xs text-zinc-300">
                        {btn.text || `Botón ${idx + 1}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[#0e0e11]/95 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/50 border border-white/5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
          >
            <Eye className="w-4 h-4" />
            {showPreview ? 'Ocultar' : 'Vista previa'}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={!isValid || isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar borrador
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={!isValid || isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 border border-emerald-500/30 text-xs font-medium text-white hover:bg-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar a aprobación
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
