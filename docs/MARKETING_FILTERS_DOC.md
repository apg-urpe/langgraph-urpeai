/**
 * Marketing Audiencias - Schema & Filters
 */

export interface AudienceFilters {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: any;
}

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

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'is_null' | 'is_not_null';
