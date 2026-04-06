/**
 * Data Access Layer (DAL)
 * Capa de acceso a datos compartida entre UI (Stores) y Agente (Tools)
 * 
 * Uso:
 * - Stores (Browser): import { getContacts } from '@/lib/dal'; con supabase client del browser
 * - Tools (Server): import { getContacts } from '@/lib/dal'; con supabase client de service role
 */

// Contacts
export {
  getContacts,
  searchContactsDeep,
  getContactById
} from './contacts';

// Re-export types for convenience
export type {
  DALContext,
  DALResult,
  DALContact,
  DALContactSearchResult,
  GetContactsArgs,
  SearchContactsDeepArgs,
  AnySupabaseClient
} from '@/types/dal';
