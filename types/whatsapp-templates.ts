import { ServiceCommitmentInfo, Service } from './finance';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: WhatsAppTemplateComponent[];
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  clasificacion_interna?: string;
}

export interface WhatsAppTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
  };
  buttons?: any[];
}

export interface CarteraRecord {
  id: number;
  empresa_id: number;
  contacto_id: number;
  telefono: string;
  nombre: string;
  cartera: {
    servicio_id: number;
    nombre_servicio: string;
    saldo_pendiente: number;
    dias_mora: number;
    estado_mora: string;
    clasificacion_interna: string;
    vencimiento: string | null;
    cuota_mensual: number;
  };
}

export interface EnvioResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
  contacto_id: number;
  empresa_id: number;
}

export interface WhatsAppConnection {
  phone_number_id: string;
  business_account_id: string;
  display_phone_number?: string | null;
  customer_id?: string | null;
}
