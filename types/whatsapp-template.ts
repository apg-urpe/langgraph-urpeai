export interface WhatsAppNumberRef {
  id: number;
  telefono: string | null;
  nombre: string | null;
}

export interface WhatsAppTemplateRecord {
  id: number;
  empresa_id: number;
  numero_id: number;
  provider: string;
  provider_phone_id: string | null;
  provider_template_id: string | null;
  business_account_id: string | null;
  template_name: string;
  language_code: string;
  meta_category?: 'marketing' | 'utility' | 'authentication' | null;
  clasificacion_interna: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'disabled' | 'paused' | 'archived' | 'deleted';
  is_active: boolean;
  header_type: string | null;
  rejection_reason: string | null;
  quality_rating: string | null;
  last_synced_at: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  created_at: string;
  updated_at: string;
  number?: WhatsAppNumberRef | null;
}

// ── Template Component Types (Meta WhatsApp format) ──

export type TemplateComponentType = 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
export type TemplateHeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type TemplateButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface TemplateComponent {
  type: TemplateComponentType;
  format?: TemplateHeaderFormat;
  text?: string;
  buttons?: TemplateButton[];
}

export interface CreateTemplatePayload {
  numero_id: number;
  empresa_id: number;
  template_name: string;
  language_code: string;
  meta_category: 'marketing' | 'utility' | 'authentication';
  clasificacion_interna?: string;
  components: TemplateComponent[];
  submit_to_meta?: boolean;
}

export interface UpdateTemplatePayload {
  template_name?: string;
  language_code?: string;
  meta_category?: 'marketing' | 'utility' | 'authentication';
  clasificacion_interna?: string;
  components?: TemplateComponent[];
  is_active?: boolean;
  submit_to_meta?: boolean;
}

export interface WhatsAppTemplateSendRecord {
  id: number;
  empresa_id: number;
  numero_id: number;
  template_id: number | null;
  conversacion_id: number | null;
  mensaje_id: number | null;
  contacto_id: number | null;
  enviado_por: number | null;
  provider: string;
  provider_message_id: string | null;
  provider_template_id: string | null;
  template_name: string;
  language_code: string;
  meta_category?: 'marketing' | 'utility' | 'authentication' | null;
  clasificacion_interna: string | null;
  telefono_destino: string;
  estado: 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'rejected' | 'cancelled';
  error_code: string | null;
  error_message: string | null;
  rendered_body?: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  number?: WhatsAppNumberRef | null;
}
