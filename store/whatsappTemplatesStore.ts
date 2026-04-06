import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import { WhatsAppTemplateRecord, WhatsAppTemplateSendRecord, CreateTemplatePayload, UpdateTemplatePayload } from '../types/whatsapp-template';

const ALLOWED_VIEW_ROLES = [1, 2];
const CACHE_DURATION_MS = 5 * 60 * 1000;

const summarizeResponseBody = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 180);

const parseApiResponse = async <T>(res: Response, actionLabel: string): Promise<T> => {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawBody = await res.text();
  const snippet = summarizeResponseBody(rawBody);

  if (contentType.includes('application/json')) {
    let data: any = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      throw new Error(
        `No se pudo ${actionLabel} porque el servidor respondió JSON inválido.\n\nDebug: ${res.status} ${contentType || 'content-type desconocido'}${snippet ? ` | body: ${snippet}` : ''}`
      );
    }

    if (!res.ok) {
      const apiMessage = typeof data?.error === 'string' && data.error.trim()
        ? data.error.trim()
        : `No se pudo ${actionLabel}.`;

      throw new Error(
        `${apiMessage}\n\nDebug: ${res.status} ${contentType || 'application/json'}`
      );
    }

    return data as T;
  }

  const normalizedBody = rawBody.trimStart().toLowerCase();
  const looksLikeHtml = normalizedBody.startsWith('<!doctype') || normalizedBody.startsWith('<html');
  const message = looksLikeHtml
    ? `No se pudo ${actionLabel} porque el servidor devolvió HTML en vez de JSON. Esto suele indicar una ruta inválida, un redirect de autenticación o un error interno del servidor.`
    : `No se pudo ${actionLabel} porque el servidor devolvió un formato inesperado en vez de JSON.`;

  throw new Error(
    `${message}\n\nDebug: ${res.status} ${contentType || 'content-type desconocido'}${snippet ? ` | body: ${snippet}` : ''}`
  );
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const { useAuthStore } = await import('./authStore');
  const accessToken = useAuthStore.getState().session?.access_token;

  return accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
};

type OptionalWhatsAppColumn = 'meta_category' | 'clasificacion_interna';

interface OptionalWhatsAppColumnsConfig {
  meta_category: boolean;
  clasificacion_interna: boolean;
}

const DEFAULT_OPTIONAL_COLUMNS: OptionalWhatsAppColumnsConfig = {
  meta_category: true,
  clasificacion_interna: true
};

const buildTemplatesSelect = (columns: OptionalWhatsAppColumnsConfig) => `
  id,
  empresa_id,
  numero_id,
  provider,
  provider_phone_id,
  provider_template_id,
  business_account_id,
  template_name,
  language_code,
  ${columns.meta_category ? 'meta_category,' : ''}
  ${columns.clasificacion_interna ? 'clasificacion_interna,' : ''}
  status,
  is_active,
  header_type,
  rejection_reason,
  quality_rating,
  last_synced_at,
  external_created_at,
  external_updated_at,
  created_at,
  updated_at,
  number:wp_numeros!wp_whatsapp_templates_numero_id_fkey(id, telefono, nombre)
`;

const buildSendsSelect = (columns: OptionalWhatsAppColumnsConfig) => `
  id,
  empresa_id,
  numero_id,
  template_id,
  conversacion_id,
  mensaje_id,
  contacto_id,
  enviado_por,
  provider,
  provider_message_id,
  provider_template_id,
  template_name,
  language_code,
  ${columns.meta_category ? 'meta_category,' : ''}
  ${columns.clasificacion_interna ? 'clasificacion_interna,' : ''}
  telefono_destino,
  estado,
  error_code,
  error_message,
  sent_at,
  delivered_at,
  read_at,
  failed_at,
  created_at,
  updated_at,
  number:wp_numeros!wp_whatsapp_template_envios_numero_id_fkey(id, telefono, nombre)
`;

const getMissingOptionalColumn = (error: any): OptionalWhatsAppColumn | null => {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (error?.code !== '42703') return null;
  if (message.includes('meta_category')) return 'meta_category';
  if (message.includes('clasificacion_interna')) return 'clasificacion_interna';
  return null;
};

const executeWithOptionalColumns = async <T>(
  runQuery: (columns: OptionalWhatsAppColumnsConfig) => Promise<{ data: T[] | null; error: any }>
) => {
  let columns = { ...DEFAULT_OPTIONAL_COLUMNS };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await runQuery(columns);
    const missingColumn = getMissingOptionalColumn(result.error);

    if (!result.error || !missingColumn || !columns[missingColumn]) {
      return result;
    }

    logger.warn(`[WhatsAppTemplatesStore] Optional column not available, retrying without ${missingColumn}`);
    columns = {
      ...columns,
      [missingColumn]: false
    };
  }

  return runQuery({
    meta_category: false,
    clasificacion_interna: false
  });
};

interface WhatsAppTemplatesState {
  templates: WhatsAppTemplateRecord[];
  sends: WhatsAppTemplateSendRecord[];
  isLoadingTemplates: boolean;
  isLoadingSends: boolean;
  isSubmitting: boolean;
  templatesError: string | null;
  sendsError: string | null;
  lastTemplatesFetch: number | null;
  lastSendsFetch: number | null;
  lastEnterpriseId: number | null;
  selectedTemplate: WhatsAppTemplateRecord | null;
  showFormModal: boolean;
  fetchTemplates: (enterpriseId: number, forceRefresh?: boolean) => Promise<void>;
  fetchSends: (enterpriseId: number, forceRefresh?: boolean) => Promise<void>;
  fetchAllWhatsAppData: (enterpriseId: number, forceRefresh?: boolean) => Promise<void>;
  createTemplate: (payload: CreateTemplatePayload) => Promise<boolean>;
  updateTemplate: (templateId: number, payload: UpdateTemplatePayload) => Promise<boolean>;
  deleteTemplate: (templateId: number) => Promise<boolean>;
  canViewWhatsAppTemplates: (userRoleId: number | null | undefined) => boolean;
  setSelectedTemplate: (template: WhatsAppTemplateRecord | null) => void;
  setShowFormModal: (show: boolean) => void;
  clearTemplatesError: () => void;
  clearSendsError: () => void;
  resetStore: () => void;
}

const initialState = {
  templates: [],
  sends: [],
  isLoadingTemplates: false,
  isLoadingSends: false,
  isSubmitting: false,
  templatesError: null,
  sendsError: null,
  lastTemplatesFetch: null,
  lastSendsFetch: null,
  lastEnterpriseId: null,
  selectedTemplate: null,
  showFormModal: false
};

export const useWhatsAppTemplatesStore = create<WhatsAppTemplatesState>((set, get) => ({
  ...initialState,

  fetchTemplates: async (enterpriseId, forceRefresh = false) => {
    const { isLoadingTemplates, lastTemplatesFetch, lastEnterpriseId } = get();

    if (lastEnterpriseId !== enterpriseId) {
      set({ templates: [] });
    }

    if (
      !forceRefresh &&
      lastTemplatesFetch &&
      lastEnterpriseId === enterpriseId &&
      Date.now() - lastTemplatesFetch < CACHE_DURATION_MS
    ) {
      logger.debug('[WhatsAppTemplatesStore] Using cached templates');
      return;
    }

    if (isLoadingTemplates) return;

    set({
      isLoadingTemplates: true,
      templatesError: null,
      templates: lastEnterpriseId !== enterpriseId ? [] : get().templates
    });

    try {
      const runTemplatesQuery = async (columns: OptionalWhatsAppColumnsConfig) =>
        await supabase
          .from('wp_whatsapp_templates')
          .select(buildTemplatesSelect(columns))
          .eq('empresa_id', enterpriseId)
          .order('is_active', { ascending: false })
          .order('updated_at', { ascending: false });

      const { data, error } = await executeWithOptionalColumns(runTemplatesQuery);

      if (error) throw error;

      const templates = (data || []).map((item: any) => ({
        ...item,
        meta_category: item.meta_category ?? null,
        clasificacion_interna: item.clasificacion_interna ?? null,
        number: Array.isArray(item.number) ? item.number[0] ?? null : item.number ?? null
      })) as WhatsAppTemplateRecord[];

      set({
        templates,
        isLoadingTemplates: false,
        templatesError: null,
        lastTemplatesFetch: Date.now(),
        lastEnterpriseId: enterpriseId
      });

      logger.debug('[WhatsAppTemplatesStore] Fetched templates:', templates.length);
    } catch (err: any) {
      logger.error('[WhatsAppTemplatesStore] Error fetching templates:', err);
      set({
        isLoadingTemplates: false,
        templatesError: err?.message || 'Error al cargar plantillas de WhatsApp'
      });
    }
  },

  fetchSends: async (enterpriseId, forceRefresh = false) => {
    const { isLoadingSends, lastSendsFetch, lastEnterpriseId } = get();

    if (lastEnterpriseId !== enterpriseId) {
      set({ sends: [] });
    }

    if (
      !forceRefresh &&
      lastSendsFetch &&
      lastEnterpriseId === enterpriseId &&
      Date.now() - lastSendsFetch < CACHE_DURATION_MS
    ) {
      logger.debug('[WhatsAppTemplatesStore] Using cached sends');
      return;
    }

    if (isLoadingSends) return;

    set({
      isLoadingSends: true,
      sendsError: null,
      sends: lastEnterpriseId !== enterpriseId ? [] : get().sends
    });

    try {
      const runSendsQuery = async (columns: OptionalWhatsAppColumnsConfig) =>
        await supabase
          .from('wp_whatsapp_template_envios')
          .select(buildSendsSelect(columns))
          .eq('empresa_id', enterpriseId)
          .order('created_at', { ascending: false });

      const { data, error } = await executeWithOptionalColumns(runSendsQuery);

      if (error) throw error;

      const sends = (data || []).map((item: any) => ({
        ...item,
        meta_category: item.meta_category ?? null,
        clasificacion_interna: item.clasificacion_interna ?? null,
        number: Array.isArray(item.number) ? item.number[0] ?? null : item.number ?? null
      })) as WhatsAppTemplateSendRecord[];

      set({
        sends,
        isLoadingSends: false,
        sendsError: null,
        lastSendsFetch: Date.now(),
        lastEnterpriseId: enterpriseId
      });

      logger.debug('[WhatsAppTemplatesStore] Fetched sends:', sends.length);
    } catch (err: any) {
      logger.error('[WhatsAppTemplatesStore] Error fetching sends:', err);
      set({
        isLoadingSends: false,
        sendsError: err?.message || 'Error al cargar envíos de plantillas'
      });
    }
  },

  fetchAllWhatsAppData: async (enterpriseId, forceRefresh = false) => {
    await Promise.all([
      get().fetchTemplates(enterpriseId, forceRefresh),
      get().fetchSends(enterpriseId, forceRefresh)
    ]);
  },

  createTemplate: async (payload) => {
    set({ isSubmitting: true, templatesError: null });
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(payload)
      });
      await parseApiResponse(res, 'crear la plantilla');
      set({ isSubmitting: false, showFormModal: false, selectedTemplate: null });
      // Refresh templates list
      if (payload.empresa_id) {
        await get().fetchTemplates(payload.empresa_id, true);
      }
      return true;
    } catch (err: any) {
      logger.error('[WhatsAppTemplatesStore] Error creating template:', err);
      set({ isSubmitting: false, templatesError: err?.message || 'Error al crear plantilla' });
      return false;
    }
  },

  updateTemplate: async (templateId, payload) => {
    set({ isSubmitting: true, templatesError: null });
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/templates', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ template_id: templateId, ...payload })
      });
      await parseApiResponse(res, 'actualizar la plantilla');
      set({ isSubmitting: false, showFormModal: false, selectedTemplate: null });
      const enterpriseId = get().lastEnterpriseId;
      if (enterpriseId) {
        await get().fetchTemplates(enterpriseId, true);
      }
      return true;
    } catch (err: any) {
      logger.error('[WhatsAppTemplatesStore] Error updating template:', err);
      set({ isSubmitting: false, templatesError: err?.message || 'Error al actualizar plantilla' });
      return false;
    }
  },

  deleteTemplate: async (templateId) => {
    set({ isSubmitting: true, templatesError: null });
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/templates?template_id=${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders
      });
      await parseApiResponse(res, 'eliminar la plantilla');
      set({ isSubmitting: false });
      const enterpriseId = get().lastEnterpriseId;
      if (enterpriseId) {
        await get().fetchTemplates(enterpriseId, true);
      }
      return true;
    } catch (err: any) {
      logger.error('[WhatsAppTemplatesStore] Error deleting template:', err);
      set({ isSubmitting: false, templatesError: err?.message || 'Error al eliminar plantilla' });
      return false;
    }
  },

  canViewWhatsAppTemplates: (userRoleId) => {
    if (userRoleId === null || userRoleId === undefined) return false;
    return ALLOWED_VIEW_ROLES.includes(userRoleId);
  },

  setSelectedTemplate: (template) => set({ selectedTemplate: template }),
  setShowFormModal: (show) => set({ showFormModal: show, selectedTemplate: show ? get().selectedTemplate : null }),
  clearTemplatesError: () => set({ templatesError: null }),
  clearSendsError: () => set({ sendsError: null }),
  resetStore: () => set(initialState)
}));

export const selectWhatsAppTemplates = (state: WhatsAppTemplatesState) => state.templates;
export const selectWhatsAppTemplateSends = (state: WhatsAppTemplatesState) => state.sends;
export const selectWhatsAppTemplatesLoading = (state: WhatsAppTemplatesState) => state.isLoadingTemplates;
export const selectWhatsAppSendsLoading = (state: WhatsAppTemplatesState) => state.isLoadingSends;
export const selectWhatsAppTemplatesError = (state: WhatsAppTemplatesState) => state.templatesError;
export const selectWhatsAppSendsError = (state: WhatsAppTemplatesState) => state.sendsError;
export const selectWhatsAppIsSubmitting = (state: WhatsAppTemplatesState) => state.isSubmitting;
export const selectWhatsAppSelectedTemplate = (state: WhatsAppTemplatesState) => state.selectedTemplate;
export const selectWhatsAppShowFormModal = (state: WhatsAppTemplatesState) => state.showFormModal;
