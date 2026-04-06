/**
 * Data Access Layer (DAL) Types
 * Tipos compartidos para funciones de acceso a datos
 * Usados tanto por Stores (UI) como por Tool Executor (Agente)
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// CONTEXTO DE EJECUCIÓN
// ============================================

/**
 * Contexto requerido para todas las operaciones DAL
 * - enterpriseId: El ID de la empresa que se está OBSERVANDO (contexto dinámico).
 * - userId: El ID del miembro del equipo (team_humano) que ejecuta la acción.
 */
export interface DALContext {
  enterpriseId: number;
  userId?: number;
}

// ============================================
// RESULTADO GENÉRICO
// ============================================

/**
 * Resultado estándar de todas las funciones DAL
 * @template T - Tipo de datos retornados
 */
export interface DALResult<T> {
  data: T | null;
  error: string | null;
  count?: number;
}

// ============================================
// ARGUMENTOS DE BÚSQUEDA DE CONTACTOS
// ============================================

export interface GetContactsArgs {
  search?: string;
  estado?: string;
  es_calificado?: string;
  is_active?: boolean;
  etapa_embudo_id?: number;
  asesor_id?: number;
  limit?: number;
  offset?: number;
  order_by?: 'ultima_interaccion' | 'created_at' | 'nombre' | 'lead_score';
  order_direction?: 'asc' | 'desc';
}

export interface SearchContactsDeepArgs {
  query: string;
  scope?: 'all' | 'contacts' | 'messages' | 'metadata' | 'notes';
  include_inactive?: boolean;
  limit?: number;
}

// ============================================
// TIPOS DE CONTACTO PARA DAL
// ============================================

export interface DALContact {
  id: number;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  email: string | null;
  estado: string | null;
  es_calificado: string | null;
  etapa_embudo: number | null;
  is_active: boolean;
  paused_until: string | null;
  origen: string | null;
  created_at: string;
  updated_at: string | null;
  ultima_interaccion: string | null;
  team_humano_id: number | null;
  metadata: Record<string, any> | null;
  notas: string | null;
  empresa_id: number;
}

export interface DALContactSearchResult extends DALContact {
  _relevance?: number;
  _matchedIn?: string[];
}

// ============================================
// ARGUMENTOS DE CITAS
// ============================================

export interface GetAppointmentsArgs {
  contact_id?: number;
  asesor_id?: number;
  estado?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  proximas?: boolean;
  limit?: number;
}

// ============================================
// ARGUMENTOS DE CONVERSACIONES
// ============================================

export interface GetConversationsArgs {
  contact_id?: number;
  status?: string;
  limit?: number;
}

export interface SearchMessagesArgs {
  query: string;
  contact_id?: number;
  limit?: number;
}

// ============================================
// ARGUMENTOS DE EQUIPO
// ============================================

export interface GetTeamMembersArgs {
  is_active?: boolean;
  rol?: string;
}

// ============================================
// ARGUMENTOS DE NOTAS
// ============================================

export interface GetContactNotesArgs {
  contact_id: number;
  limit?: number;
}

export interface CreateNoteArgs {
  contact_id: number;
  titulo?: string;
  descripcion: string;
  etiquetas?: string[];
}

// ============================================
// TIPO PARA CLIENTE SUPABASE GENÉRICO
// ============================================

/**
 * Tipo genérico para cliente Supabase
 * Permite usar tanto el cliente del browser como el de service role
 */
export type AnySupabaseClient = SupabaseClient<any, any, any>;
