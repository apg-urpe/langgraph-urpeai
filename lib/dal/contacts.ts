/**
 * Data Access Layer - Contacts
 * Funciones compartidas para acceso a datos de contactos
 * Usadas por: contactStore.ts (UI) y tool-executor.ts (Agente)
 */

import { logger } from '@/lib/logger';
import {
  AnySupabaseClient,
  DALContext,
  DALResult,
  DALContact,
  DALContactSearchResult,
  GetContactsArgs,
  SearchContactsDeepArgs
} from '@/types/dal';

// ============================================
// CONSTANTES
// ============================================

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SEARCH_QUERY_LIMIT = 150;

// ============================================
// HELPERS
// ============================================

/**
 * Normaliza números de teléfono removiendo caracteres especiales
 */
function normalizePhone(phone: string): string {
  return (phone || '').replace(/[\s\-\(\)\+\.]/g, '');
}

/**
 * Detecta si un término parece ser un número de teléfono
 */
function looksLikePhone(term: string): boolean {
  const digits = term.replace(/\D/g, '');
  return digits.length >= 6;
}

// ============================================
// CAMPOS SELECT ESTÁNDAR
// ============================================

const CONTACT_SELECT_FIELDS = `
  id,
  nombre,
  apellido,
  telefono,
  email,
  created_at,
  updated_at,
  estado,
  es_calificado,
  notas,
  empresa_id,
  team_humano_id,
  metadata,
  origen,
  ultima_interaccion,
  is_active,
  paused_until,
  etapa_embudo
`;

// ============================================
// getContacts - Obtener contactos con filtros
// ============================================

/**
 * Obtiene contactos filtrados por empresa y criterios opcionales
 * Soporta búsqueda case-insensitive con ilike
 */
export async function getContacts(
  client: AnySupabaseClient,
  ctx: DALContext,
  args: GetContactsArgs = {}
): Promise<DALResult<DALContact[]>> {
  try {
    const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = args.offset || 0;

    let query = client
      .from('wp_contactos')
      .select(CONTACT_SELECT_FIELDS, { count: 'exact' })
      .eq('empresa_id', ctx.enterpriseId);

    // Búsqueda por texto (case-insensitive)
    if (args.search && args.search.trim().length >= 2) {
      const searchTerm = args.search.trim().replace(/[,()]/g, ' ').trim();
      const term = `%${searchTerm}%`;
      query = query.or(
        `nombre.ilike.${term},` +
        `apellido.ilike.${term},` +
        `telefono.ilike.${term},` +
        `email.ilike.${term}`
      );
    }

    // Filtros (normalizar estado a lowercase para case-insensitive)
    if (args.estado) query = query.eq('estado', args.estado.toLowerCase());
    if (args.es_calificado) query = query.eq('es_calificado', args.es_calificado);
    if (args.is_active !== undefined) query = query.eq('is_active', args.is_active);
    if (args.etapa_embudo_id) query = query.eq('etapa_embudo', args.etapa_embudo_id);
    if (args.asesor_id) query = query.eq('team_humano_id', args.asesor_id);

    // Ordenamiento
    const orderField = args.order_by || 'ultima_interaccion';
    const ascending = args.order_direction === 'asc';
    query = query.order(orderField, { ascending, nullsFirst: false });

    // Paginación
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[DAL.getContacts] Error:', error);
      return { data: null, error: error.message };
    }

    return {
      data: data || [],
      error: null,
      count: count || data?.length || 0
    };
  } catch (err: any) {
    logger.error('[DAL.getContacts] Exception:', err);
    return { data: null, error: err.message };
  }
}

// ============================================
// searchContactsDeep - Búsqueda profunda multi-fuente
// ============================================

/**
 * Búsqueda profunda de contactos en múltiples fuentes
 * Incluye: contactos, mensajes, metadata, conversaciones, notas
 * Retorna resultados con scoring de relevancia
 */
export async function searchContactsDeep(
  client: AnySupabaseClient,
  ctx: DALContext,
  args: SearchContactsDeepArgs
): Promise<DALResult<DALContactSearchResult[]>> {
  try {
    const searchTerm = args.query.trim();
    if (searchTerm.length < 2) {
      return { data: null, error: 'El término de búsqueda debe tener al menos 2 caracteres' };
    }

    const scope = args.scope || 'all';
    const maxResults = Math.min(args.limit || 30, MAX_LIMIT);
    const searchTermLower = searchTerm.toLowerCase();
    const escapedTerm = searchTerm.replace(/[,()]/g, ' ').trim();

    // Score tracking per contact
    const contactScores = new Map<number, { score: number; sources: string[] }>();

    const addScore = (contactId: number, points: number, source: string) => {
      const existing = contactScores.get(contactId);
      if (existing) {
        existing.score += points;
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      } else {
        contactScores.set(contactId, { score: points, sources: [source] });
      }
    };

    const searchPromises: Promise<void>[] = [];

    // 1. CONTACT DATA SEARCH (nombre, apellido)
    if (scope === 'contacts' || scope === 'all') {
      searchPromises.push((async () => {
        const { data } = await client
          .from('wp_contactos')
          .select('id, nombre, apellido')
          .eq('empresa_id', ctx.enterpriseId)
          .or(`nombre.ilike.%${escapedTerm}%,apellido.ilike.%${escapedTerm}%`)
          .limit(SEARCH_QUERY_LIMIT);

        if (data) {
          data.forEach((c: any) => {
            let points = 100;
            const nombre = (c.nombre || '').toLowerCase();
            const apellido = (c.apellido || '').toLowerCase();

            if (nombre.startsWith(searchTermLower) || apellido.startsWith(searchTermLower)) {
              points += 50;
            }
            if (nombre === searchTermLower || apellido === searchTermLower) {
              points += 50;
            }
            addScore(c.id, points, 'nombre');
          });
        }
      })());

      // Secondary fields: telefono, email, notas, origen
      searchPromises.push((async () => {
        const { data } = await client
          .from('wp_contactos')
          .select('id')
          .eq('empresa_id', ctx.enterpriseId)
          .or(`telefono.ilike.%${escapedTerm}%,email.ilike.%${escapedTerm}%,notas.ilike.%${escapedTerm}%,origen.ilike.%${escapedTerm}%`)
          .limit(SEARCH_QUERY_LIMIT);

        if (data) {
          data.forEach((c: any) => addScore(c.id, 50, 'contacto'));
        }
      })());

      // Phone normalization search
      if (looksLikePhone(searchTerm)) {
        const normalizedTerm = normalizePhone(searchTerm);
        if (normalizedTerm.length >= 6) {
          searchPromises.push((async () => {
            const { data } = await client
              .from('wp_contactos')
              .select('id, telefono')
              .eq('empresa_id', ctx.enterpriseId)
              .limit(SEARCH_QUERY_LIMIT * 2);

            if (data) {
              data.forEach((c: any) => {
                const normalizedPhone = normalizePhone(c.telefono || '');
                if (normalizedPhone.includes(normalizedTerm)) {
                  addScore(c.id, 80, 'teléfono');
                }
              });
            }
          })());
        }
      }
    }

    // 2. MESSAGE SEARCH
    if (scope === 'messages' || scope === 'all') {
      searchPromises.push((async () => {
        const { data: messageResults } = await client
          .from('wp_mensajes')
          .select('conversacion_id, wp_conversaciones!inner(contacto_id)')
          .eq('empresa_id', ctx.enterpriseId)
          .ilike('contenido', `%${escapedTerm}%`)
          .limit(SEARCH_QUERY_LIMIT);

        if (messageResults) {
          const seen = new Set<number>();
          messageResults.forEach((m: any) => {
            const contactoId = m.wp_conversaciones?.contacto_id;
            if (contactoId && !seen.has(contactoId)) {
              seen.add(contactoId);
              addScore(contactoId, 15, 'mensajes');
            }
          });
        }
      })());
    }

    // 3. METADATA SEARCH
    if (scope === 'metadata' || scope === 'all') {
      searchPromises.push((async () => {
        const { data } = await client
          .from('wp_contactos')
          .select('id')
          .eq('empresa_id', ctx.enterpriseId)
          .ilike('metadata::text', `%${escapedTerm}%`)
          .limit(SEARCH_QUERY_LIMIT);

        if (data) {
          data.forEach((c: any) => addScore(c.id, 30, 'metadata'));
        }
      })());
    }

    // 4. CONVERSATION SUMMARY SEARCH
    if (scope === 'all') {
      searchPromises.push((async () => {
        const { data } = await client
          .from('wp_conversaciones')
          .select('contacto_id')
          .eq('empresa_id', ctx.enterpriseId)
          .or(`resumen.ilike.%${escapedTerm}%,inteligencia_conversacional.ilike.%${escapedTerm}%`)
          .limit(SEARCH_QUERY_LIMIT);

        if (data) {
          const seen = new Set<number>();
          data.forEach((c: any) => {
            if (c.contacto_id && !seen.has(c.contacto_id)) {
              seen.add(c.contacto_id);
              addScore(c.contacto_id, 20, 'resumen_conversación');
            }
          });
        }
      })());
    }

    // 5. NOTES SEARCH
    if (scope === 'notes' || scope === 'all') {
      searchPromises.push((async () => {
        const { data } = await client
          .from('wp_contactos_nota')
          .select('contacto_id, contacto:wp_contactos!inner(empresa_id)')
          .eq('contacto.empresa_id', ctx.enterpriseId)
          .or(`descripcion.ilike.%${escapedTerm}%,titulo.ilike.%${escapedTerm}%`)
          .limit(SEARCH_QUERY_LIMIT);

        if (data) {
          const seen = new Set<number>();
          data.forEach((n: any) => {
            if (n.contacto_id && !seen.has(n.contacto_id)) {
              seen.add(n.contacto_id);
              addScore(n.contacto_id, 40, 'notas');
            }
          });
        }
      })());
    }

    // Execute all searches in parallel
    await Promise.all(searchPromises);

    if (contactScores.size === 0) {
      return {
        data: [],
        error: null,
        count: 0
      };
    }

    // Sort by score and get top IDs
    const sortedEntries = Array.from(contactScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, maxResults);

    const topIds = sortedEntries.map(([id]) => id);

    // Fetch full contact data for top results
    // IMPORTANTE: También filtrar por empresa para seguridad
    let query = client
      .from('wp_contactos')
      .select(CONTACT_SELECT_FIELDS)
      .eq('empresa_id', ctx.enterpriseId)
      .in('id', topIds);

    if (!args.include_inactive) {
      query = query.eq('is_active', true);
    }

    const { data: contacts, error } = await query;
    if (error) {
      logger.error('[DAL.searchContactsDeep] Error fetching contacts:', error);
      return { data: null, error: error.message };
    }

    // Merge contacts with scores and sort
    const resultsWithScores: DALContactSearchResult[] = (contacts || []).map(contact => {
      const scoreData = contactScores.get(contact.id);
      return {
        ...contact,
        _relevance: scoreData?.score || 0,
        _matchedIn: scoreData?.sources || []
      };
    }).sort((a, b) => (b._relevance || 0) - (a._relevance || 0));

    logger.debug('[DAL.searchContactsDeep] Found:', resultsWithScores.length, 'contacts for:', searchTerm);

    return {
      data: resultsWithScores,
      error: null,
      count: resultsWithScores.length
    };
  } catch (err: any) {
    logger.error('[DAL.searchContactsDeep] Exception:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Búsqueda optimizada usando la función RPC search_contacts_optimized
 */
export async function searchContactsOptimized(
  client: AnySupabaseClient,
  ctx: DALContext,
  args: { query: string; limit?: number }
): Promise<DALResult<DALContactSearchResult[]>> {
  try {
    const { data, error } = await client.rpc('search_contacts_optimized', {
      p_enterprise_id: ctx.enterpriseId,
      p_search_query: args.query,
      p_limit: args.limit || 30
    });

    if (error) {
      logger.error('[DAL.searchContactsOptimized] Error:', error);
      return { data: null, error: error.message };
    }

    // Adaptar nombres de campos del RPC al formato del frontend
    const mappedData = (data || []).map((c: any) => ({
      ...c,
      _relevance: c.relevance_score,
      _matchedIn: c.matched_sources
    }));

    return { data: mappedData, error: null, count: mappedData.length };
  } catch (err: any) {
    logger.error('[DAL.searchContactsOptimized] Exception:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Obtiene un contacto específico por ID
 * Verifica que pertenezca a la empresa del contexto
 */
export async function getContactById(
  client: AnySupabaseClient,
  ctx: DALContext,
  contactId: number
): Promise<DALResult<DALContact>> {
  try {
    const { data, error } = await client
      .from('wp_contactos')
      .select(CONTACT_SELECT_FIELDS)
      .eq('id', contactId)
      .eq('empresa_id', ctx.enterpriseId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null, error: 'Contacto no encontrado o sin acceso' };
      }
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err: any) {
    logger.error('[DAL.getContactById] Exception:', err);
    return { data: null, error: err.message };
  }
}
