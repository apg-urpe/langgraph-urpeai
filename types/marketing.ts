/**
 * Marketing Audiences - Type Definitions
 */

export type AudienceType = 'estatica' | 'dinamica';

export interface MarketingAudience {
  id: number;
  empresa_id: number;
  nombre: string;
  descripcion: string | null;
  tipo: AudienceType;
  filtros_json: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Computed or joined fields
  contact_count?: number;
}

export interface AudienceContact {
  id: number;
  audiencia_id: number;
  contacto_id: number;
  created_at: string;
}

export interface MarketingCampaignV2 {
  id: number;
  empresa_id: number | null;
  nombre: string;
  descripcion: string | null;
  estado: 'borrador' | 'activa' | 'pausada' | 'archivada';
  es_default_post_conversacion: boolean;
  cadencia_dias: number;
  total_toques: number | null;
  instrucciones_ai: string | null;
  audiencia_id: number | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CampaignEnrollment {
  id: number;
  empresa_id: number;
  campana_id: number;
  contacto_id: number;
  estado: 'activo' | 'completado' | 'cancelado' | 'pausado';
  fecha_inscripcion: string;
  fecha_salida: string | null;
  motivo_salida: string | null;
  ultimo_toque: number;
  proximo_envio_en: string | null;
  condiciones_entrada_capturadas: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}
