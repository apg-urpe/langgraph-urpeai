import { MarketingAudience, AudienceContact, MarketingCampaignV2 } from '../types/marketing';

export type FilterField = 
  | 'created_at' 
  | 'ultima_interaccion' 
  | 'estado' 
  | 'etapa_embudo' 
  | 'es_calificado' 
  | 'origen' 
  | 'metadata' 
  | 'team_humano_id'
  | 'appointment_status'
  | 'portfolio_status'
  | 'last_payment_date'
  | 'total_paid'
  | 'total_pending'
  | 'service_type';

export type FilterOperator = 
  | 'eq' 
  | 'neq' 
  | 'gt' 
  | 'lt' 
  | 'gte' 
  | 'lte' 
  | 'contains' 
  | 'is_null' 
  | 'is_not_null';

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

export interface AudienceFilters {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface CreateAudiencePayload {
  empresa_id: number;
  nombre: string;
  descripcion?: string;
  tipo: 'estatica' | 'dinamica';
  filtros_json?: AudienceFilters;
  contacto_ids?: number[]; 
}

export interface UpdateAudiencePayload {
  nombre?: string;
  descripcion?: string;
  filtros_json?: AudienceFilters;
}

export interface CreateCampaignPayload {
  empresa_id: number;
  nombre: string;
  descripcion?: string;
  estado?: 'borrador' | 'activa' | 'pausada' | 'archivada';
  audiencia_id?: number;
  cadencia_dias?: number;
  total_toques?: number;
  instrucciones_ai?: string;
}

export interface EmailMarketingState {
  audiences: MarketingAudience[];
  campaigns: MarketingCampaignV2[];
  selectedAudience: MarketingAudience | null;
  audienceContacts: AudienceContact[];
  previewCount: number | null;
  isLoadingPreview: boolean;
  isLoading: boolean;
  isLoadingCampaigns: boolean;
  error: string | null;
  activeTab: 'audiences' | 'campaigns' | 'sends' | 'analytics';
  cachedEnterpriseId: number | null;
  lastFetch: number | null;

  fetchAudiences: (empresaId: number, forceRefresh?: boolean) => Promise<void>;
  fetchAudienceById: (audienceId: number) => Promise<MarketingAudience | null>;
  createAudience: (payload: CreateAudiencePayload) => Promise<MarketingAudience | null>;
  updateAudience: (audienceId: number, payload: UpdateAudiencePayload) => Promise<MarketingAudience | null>;
  deleteAudience: (audienceId: number) => Promise<boolean>;
  addContactsToAudience: (audienceId: number, contactIds: number[]) => Promise<boolean>;
  removeContactFromAudience: (audienceId: number, contactId: number) => Promise<boolean>;
  fetchAudienceContacts: (audienceId: number) => Promise<AudienceContact[]>;
  previewAudienceCount: (empresaId: number, filters: AudienceFilters) => Promise<number>;
  previewAudienceContacts: (empresaId: number, filters: AudienceFilters, limit?: number) => Promise<any[]>;
  fetchCampaigns: (empresaId: number) => Promise<void>;
  createCampaign: (payload: CreateCampaignPayload) => Promise<MarketingCampaignV2 | null>;
  updateCampaign: (campaignId: number, payload: Partial<CreateCampaignPayload>) => Promise<MarketingCampaignV2 | null>;
  deleteCampaign: (campaignId: number) => Promise<boolean>;
  setActiveTab: (tab: 'audiences' | 'campaigns' | 'sends' | 'analytics') => void;
  setSelectedAudience: (audience: MarketingAudience | null) => void;
  clearError: () => void;
  resetStore: () => void;
}
