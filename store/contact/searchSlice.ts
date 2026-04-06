/**
 * Contact Store — Search Slice
 * fetchContacts (Super Search), setFilters, resetFilters, setPage, refreshContacts
 * @module store/contact/searchSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import { logError } from '../../lib/error-logger';
import { logActivity } from '../../lib/activity-logger';
import { trackMetric } from '../../lib/performance-monitor';
import type { ContactState, ContactSet, ContactGet, ContactSearchResult } from './types';
import { initialFilters, initialPagination } from './types';
import {
  SEARCH_RESULT_LIMIT,
  SEARCH_QUERY_LIMIT,
  MAX_CONTACTS_IN_MEMORY,
  normalizePhone,
  looksLikePhone,
  removeAccents,
  contactsFetchInFlight,
  setContactsFetchInFlight
} from './constants';

export const createSearchSlice = (set: ContactSet, get: ContactGet) => ({

  // Fetch contacts for current enterprise - SUPER SEARCH
  // pageSizeOverride: Optional override for pagination size (e.g., PIPELINE_PAGE_SIZE for Kanban view)
  fetchContacts: async (forceRefresh = false, pageSizeOverride?: number) => {
    const { selectedEnterpriseId, filters, pagination, isCacheValid, contacts, userContext } = get();
    
    // Use override if provided, otherwise use pagination state
    const effectivePageSize = pageSizeOverride || pagination.pageSize;
    
    if (!selectedEnterpriseId) {
      logger.debug('[ContactStore] No enterprise selected');
      set({ isLoading: false }); // Ensure we don't get stuck in loading state
      return;
    }

    // Skip cache if there's an active search (super search needs fresh data)
    const hasActiveSearch = filters.search && filters.search.length >= 2;
    
    // Skip if cache is valid and not forcing refresh (and we have data) and no active search
    if (!forceRefresh && !hasActiveSearch && isCacheValid('contacts') && contacts.length > 0) {
      logger.debug('[ContactStore] Using cached contacts');
      return;
    }

    // PERFORMANCE: Deduplication lock — if a fetch is already in-flight, wait for it
    const shouldUseInFlightLock = !forceRefresh && !hasActiveSearch;
    if (shouldUseInFlightLock && contactsFetchInFlight) {
      logger.debug('[ContactStore] ⏩ Contacts fetch already in-flight, waiting...');
      return contactsFetchInFlight;
    }

    const runFetch = async () => {
      // Non-blocking activity log: avoid adding latency before the real fetch
      void logActivity({
        tipo: 'contacto',
        accion: 'ver',
        descripcion: hasActiveSearch ? `Búsqueda de contactos: ${filters.search}` : 'Listar contactos',
        empresaId: selectedEnterpriseId,
        usuarioId: userContext?.authUid
        // NOTA: agenteId referencia wp_agentes (bots), no wp_team_humano (usuarios)
      }).catch((err) => {
        logger.warn('[ContactStore] Activity log failed (non-blocking):', err);
      });

      set({ isLoading: true, error: null });
      
      // Performance tracking
      const queryStartTime = performance.now();
      
      const searchScope = filters.searchScope || 'basic';

      logger.debug('[ContactStore] Super Search iniciado:', { 
        empresa_id: selectedEnterpriseId, 
        search: filters.search,
        scope: searchScope 
      });

      try {
      // Escape special characters for Supabase .or() queries (commas break the parser)
      // Also normalize multiple spaces to single space
      const rawSearchTerm = filters.search?.trim() || '';
      const searchTerm = rawSearchTerm.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
      
      let contactScores = new Map<number, number>(); // ID -> Score
      let contactMatches = new Map<number, { source: string; preview: string }>(); // ID -> Match Details
      let hasSearchResults = false;

      // Helper to center preview around match
      const getCenteredPreview = (text: string, term: string, length = 100) => {
        if (!text || !term) return text || '';
        const index = text.toLowerCase().indexOf(term.toLowerCase());
        if (index === -1) return text.substring(0, length);
        
        const start = Math.max(0, index - length / 2);
        const end = Math.min(text.length, start + length);
        let preview = text.substring(start, end);
        if (start > 0) preview = '...' + preview;
        if (end < text.length) preview = preview + '...';
        return preview;
      };

      // Helper to add score and match details
      const addScore = (id: number, points: number, source?: string, rawPreview?: string) => {
        const current = contactScores.get(id) || 0;
        contactScores.set(id, current + points);
        
        // Only set match if not already set or if it's a higher priority source
        // Priority: basic > messages > notes > metadata > conversation
        if (source && rawPreview) {
          const preview = source === 'basic' ? rawPreview : getCenteredPreview(rawPreview, searchTerm);
          const existing = contactMatches.get(id);
          if (!existing || source === 'basic') {
            contactMatches.set(id, { source, preview });
          }
        }
      };

      // ============ SUPER SEARCH: Search across multiple sources ============
      // PERFORMANCE: Optimized with stricter limits and early termination
      if (searchTerm.length >= 2) {
        const searchPromises: Promise<void>[] = [];
        const searchTermLower = searchTerm.toLowerCase();

        // 1. BASIC SEARCH: Search in wp_contactos fields (OPTIMIZED)
        if (searchScope === 'basic' || searchScope === 'all') {
          // PERFORMANCE: Prioritize name fields first, then others
          const priorityFields = ['nombre', 'apellido'];
          const secondaryFields = ['telefono', 'email', 'notas', 'origen'];
          
          // Split search term into words for multi-word search (e.g. "José Murillo Cardenas")
          const searchWords = searchTerm.split(/\s+/).filter(w => w.length >= 2);
          
          // Generate unique word variants (with and without accents)
          // e.g. ["José", "Murillo"] -> ["José", "Jose", "Murillo"] (unique)
          const getWordVariants = (words: string[]): string[] => {
            const variants = new Set<string>();
            words.forEach(word => {
              variants.add(word);
              const noAccent = removeAccents(word);
              if (noAccent.toLowerCase() !== word.toLowerCase()) {
                variants.add(noAccent);
              }
            });
            return Array.from(variants);
          };
          
          // High priority: Name fields with starts-with optimization
          // SCORING HELPER: shared between AND and OR results
          const scoreNameResult = (c: any) => {
            let points = 0;
            const nombre = (c.nombre || '').toLowerCase();
            const apellido = (c.apellido || '').toLowerCase();
            const fullName = `${nombre} ${apellido}`;
            
            if (searchWords.length > 1) {
              const matchedWords = searchWords.filter(w => 
                nombre.includes(w.toLowerCase()) || apellido.includes(w.toLowerCase())
              );
              const matchRatio = matchedWords.length / searchWords.length;
              
              if (matchRatio === 1) {
                points += 500;
                if (fullName.includes(searchTermLower)) points += 200;
                if (searchWords.every(w => nombre.includes(w.toLowerCase()))) points += 100;
              } else if (matchRatio >= 0.5) {
                points += 100 * matchedWords.length;
              } else {
                points += 30 * matchedWords.length;
              }
              
              const nameWords = fullName.split(' ');
              let lastIndex = -1;
              for (const searchWord of searchWords) {
                const idx = nameWords.findIndex((nw, i) => i > lastIndex && nw.includes(searchWord.toLowerCase()));
                if (idx > lastIndex) { points += 20; lastIndex = idx; }
              }
            } else {
              points = 100;
              if (fullName.includes(searchTermLower)) points += 100;
              if (nombre.startsWith(searchTermLower) || apellido.startsWith(searchTermLower)) points += 50;
              if (nombre === searchTermLower || apellido === searchTermLower) points += 50;
            }
            
            addScore(c.id, points, 'basic', `${c.nombre} ${c.apellido}`);
          };

          if (searchWords.length > 1) {
            // ============ TWO-PHASE MULTI-WORD SEARCH ============
            // Phase 1 (AND): Chained .or() = contacts matching ALL words (high precision)
            // Phase 2 (OR):  Single .or() = contacts matching ANY word (broad coverage)
            // This guarantees the best match is always found even if there are 100+ partial matches.
            
            // PHASE 1: AND query — each .or() chain acts as AND between word groups
            searchPromises.push((async () => {
              let andQuery = supabase
                .from('wp_contactos')
                .select('id, nombre, apellido')
                .eq('empresa_id', selectedEnterpriseId);

              for (const word of searchWords) {
                const variants = [word];
                const noAccent = removeAccents(word);
                if (noAccent.toLowerCase() !== word.toLowerCase()) variants.push(noAccent);
                const wordOr = variants.flatMap(v => [
                  `nombre.ilike.%${v}%`,
                  `apellido.ilike.%${v}%`
                ]).join(',');
                andQuery = andQuery.or(wordOr);
              }

              const { data } = await andQuery.limit(SEARCH_QUERY_LIMIT);
              if (data) {
                data.forEach(scoreNameResult);
                logger.debug('[SuperSearch] Phase 1 (AND):', data.length, 'contacts matching ALL words');
              }
            })());
            
            // PHASE 2: OR query — broad coverage (existing behavior)
            searchPromises.push((async () => {
              const wordVariants = getWordVariants(searchWords);
              const orConditions = wordVariants.flatMap(word => [
                `nombre.ilike.%${word}%`,
                `apellido.ilike.%${word}%`
              ]).join(',');
              
              const { data } = await supabase
                .from('wp_contactos')
                .select('id, nombre, apellido')
                .eq('empresa_id', selectedEnterpriseId)
                .or(orConditions)
                .limit(SEARCH_QUERY_LIMIT);
              
              if (data) {
                data.forEach(scoreNameResult);
                logger.debug('[SuperSearch] Phase 2 (OR):', data.length, 'contacts matching ANY word');
              }
            })());
          } else {
            // ============ SINGLE WORD SEARCH (unchanged) ============
            searchPromises.push((async () => {
              const termNoAccent = removeAccents(searchTerm);
              const variants = termNoAccent.toLowerCase() !== searchTerm.toLowerCase()
                ? [searchTerm, termNoAccent]
                : [searchTerm];
              const orConditions = variants.flatMap(v => [
                `nombre.ilike.%${v}%`,
                `apellido.ilike.%${v}%`
              ]).join(',');
              
              const { data } = await supabase
                .from('wp_contactos')
                .select('id, nombre, apellido')
                .eq('empresa_id', selectedEnterpriseId)
                .or(orConditions)
                .limit(SEARCH_QUERY_LIMIT);
              
              if (data) {
                data.forEach(scoreNameResult);
              }
            })());
          }
          
          // Secondary fields: Single combined query
          searchPromises.push((async () => {
            const { data } = await supabase
              .from('wp_contactos')
              .select('id, telefono, email, notas, origen')
              .eq('empresa_id', selectedEnterpriseId)
              .or(`telefono.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,notas.ilike.%${searchTerm}%,origen.ilike.%${searchTerm}%`)
              .limit(SEARCH_QUERY_LIMIT);
            
            if (data) {
              data.forEach((c: any) => {
                let preview = '';
                if (c.telefono?.includes(searchTerm)) preview = c.telefono;
                else if (c.email?.includes(searchTerm)) preview = c.email;
                else if (c.notas?.includes(searchTerm)) preview = c.notas;
                else if (c.origen?.includes(searchTerm)) preview = c.origen;
                
                addScore(c.id, 50, 'basic', preview);
              });
            }
          })());
          
          // Phone number normalization search: If term looks like a phone, search with normalized version
          // Uses PostgreSQL regexp_replace to normalize phone in DB (remove spaces, +, -, etc.)
          if (looksLikePhone(searchTerm)) {
            const normalizedTerm = normalizePhone(searchTerm);
            if (normalizedTerm.length >= 3) {
              searchPromises.push((async () => {
                // Use RPC or raw filter with regexp_replace for better performance
                // This normalizes the phone in the DB before comparison
                const { data } = await supabase
                  .from('wp_contactos')
                  .select('id')
                  .eq('empresa_id', selectedEnterpriseId)
                  .filter('telefono', 'not.is', null)
                  .or(`telefono.ilike.%${normalizedTerm}%,telefono.ilike.%${searchTerm}%`)
                  .limit(SEARCH_QUERY_LIMIT);
                
                if (data) {
                  data.forEach((c: any) => addScore(c.id, 80));
                }
                
                // NOTE: Removed fallback local search for performance
                // The ilike query above handles most cases
                logger.debug('[SuperSearch] Phone normalization search:', normalizedTerm);
              })());
            }
          }
          
          logger.debug('[SuperSearch] Basic search optimized (2 queries instead of 6)');
        }

        // 2. MESSAGE SEARCH: Search in wp_mensajes.contenido (OPTIMIZED)
        // PERFORMANCE: Reduced limit and only fetch when explicitly searching messages
        if (searchScope === 'messages' || searchScope === 'all') {
          searchPromises.push((async () => {
            const { data: messageResults } = await supabase
              .from('wp_mensajes')
              .select('conversacion_id, contenido, wp_conversaciones!inner(contacto_id)')
              .eq('empresa_id', selectedEnterpriseId)
              .ilike('contenido', `%${searchTerm}%`)
              .limit(SEARCH_QUERY_LIMIT); // PERFORMANCE: Reduced from 500
            
            if (messageResults) {
              // PERFORMANCE: Use Set to avoid duplicate scoring
              const seenContacts = new Set<number>();
              messageResults.forEach((m: any) => {
                const contactoId = m.wp_conversaciones?.contacto_id;
                if (contactoId && !seenContacts.has(contactoId)) {
                  seenContacts.add(contactoId);
                  addScore(contactoId, 10, 'messages', m.contenido);
                }
              });
              logger.debug('[SuperSearch] Messages:', seenContacts.size, 'unique contacts');
            }
          })());
        }

        // 3. METADATA SEARCH: Search in wp_contactos.metadata JSONB (OPTIMIZED)
        if (searchScope === 'metadata' || searchScope === 'all') {
          searchPromises.push((async () => {
            const { data: metadataResults } = await supabase
              .from('wp_contactos')
              .select('id, metadata')
              .eq('empresa_id', selectedEnterpriseId)
              .ilike('metadata::text', `%${searchTerm}%`)
              .limit(SEARCH_QUERY_LIMIT); // PERFORMANCE: Consistent limit
            
            if (metadataResults) {
              metadataResults.forEach((c: any) => {
                addScore(c.id, 30, 'metadata', JSON.stringify(c.metadata));
              });
              logger.debug('[SuperSearch] Metadata:', metadataResults.length, 'matches');
            }
          })());
        }

        // 4. CONVERSATION SUMMARY SEARCH (OPTIMIZED: Combined into single query)
        if (searchScope === 'all') {
          searchPromises.push((async () => {
            const { data: convResults } = await supabase
              .from('wp_conversaciones')
              .select('contacto_id, resumen, inteligencia_conversacional')
              .eq('empresa_id', selectedEnterpriseId)
              .or(`resumen.ilike.%${searchTerm}%,inteligencia_conversacional.ilike.%${searchTerm}%`)
              .limit(SEARCH_QUERY_LIMIT);
            
            if (convResults) {
              // PERFORMANCE: Deduplicate contacts
              const seenContacts = new Set<number>();
              convResults.forEach((c: any) => {
                if (c.contacto_id && !seenContacts.has(c.contacto_id)) {
                  seenContacts.add(c.contacto_id);
                  const preview = c.resumen || c.inteligencia_conversacional || '';
                  addScore(c.contacto_id, 20, 'conversation', preview);
                }
              });
              logger.debug('[SuperSearch] Conversations:', seenContacts.size, 'unique contacts');
            }
          })());
        }

        // 5. NOTES SEARCH: Search in wp_contactos_nota.descripcion (OPTIMIZED)
        // SECURITY: Filter by contact's empresa_id to ensure multi-tenant isolation
        if (searchScope === 'all') {
          searchPromises.push((async () => {
            const { data: notesResults } = await supabase
              .from('wp_contactos_nota')
              .select('contacto_id, descripcion, contacto:wp_contactos!inner(empresa_id)')
              .eq('contacto.empresa_id', selectedEnterpriseId)
              .ilike('descripcion', `%${searchTerm}%`)
              .limit(SEARCH_QUERY_LIMIT); // PERFORMANCE: Consistent limit
            
            if (notesResults) {
              // PERFORMANCE: Deduplicate contacts
              const seenContacts = new Set<number>();
              notesResults.forEach((n: any) => {
                if (n.contacto_id && !seenContacts.has(n.contacto_id)) {
                  seenContacts.add(n.contacto_id);
                  addScore(n.contacto_id, 40, 'notes', n.descripcion);
                }
              });
              logger.debug('[SuperSearch] Notes:', seenContacts.size, 'unique contacts');
            }
          })());
        }

        // Execute all search queries in parallel
        await Promise.all(searchPromises);
        hasSearchResults = contactScores.size > 0;
        logger.debug('[SuperSearch] Total unique contacts found:', contactScores.size);

        // ============ PRE-FILTER BY VISIBILITY (roles 2-3 fix) ============
        // CRITICAL: Filter scored contacts by team_humano_id BEFORE the top-N cutoff.
        // Without this, role 3 users (or role 2 with team filter) may get 0 results
        // because their contacts are ranked out by the global top-40 selection.
        const isBasicRolePrefilter = userContext?.roleId === 3;
        const hasTeamFilter = filters.asesorIds && filters.asesorIds.length > 0;
        
        if (hasSearchResults && (isBasicRolePrefilter || hasTeamFilter)) {
          const effectiveIds = isBasicRolePrefilter
            ? (filters.asesorIds?.length > 0 ? filters.asesorIds : [userContext!.id])
            : filters.asesorIds!;
          
          const scoredIds = Array.from(contactScores.keys());
          if (scoredIds.length > 0) {
            const [assignmentsRes, legacyRes] = await Promise.all([
              supabase
                .from('wp_contacto_team_asignaciones')
                .select('contacto_id')
                .eq('empresa_id', selectedEnterpriseId)
                .in('contacto_id', scoredIds)
                .in('team_humano_id', effectiveIds),
              supabase
                .from('wp_contactos')
                .select('id')
                .eq('empresa_id', selectedEnterpriseId)
                .in('id', scoredIds)
                .in('team_humano_id', effectiveIds)
            ]);

            const visibleSet = new Set<number>([
              ...(assignmentsRes.data || []).map((a: any) => a.contacto_id),
              ...(legacyRes.data || []).map((c: any) => c.id)
            ]);

            if (assignmentsRes.error && legacyRes.error) {
              logger.warn('[SuperSearch] Visibility pre-filter failed in both assignment and legacy paths', {
                assignmentsError: assignmentsRes.error,
                legacyError: legacyRes.error,
              });
            }

            let removed = 0;
            for (const id of scoredIds) {
              if (!visibleSet.has(id)) {
                contactScores.delete(id);
                contactMatches.delete(id);
                removed++;
              }
            }
            hasSearchResults = contactScores.size > 0;
            logger.debug('[SuperSearch] 🔒 Visibility pre-filter:', { 
              before: scoredIds.length, 
              removed, 
              after: contactScores.size,
              asesorIds: effectiveIds 
            });
          }
        }
      }

      // ============ BUILD FINAL QUERY ============
      let query = supabase
        .from('wp_contactos')
        .select(`
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
          etapa_embudo,
          etapa_emocional
        `, { count: 'exact' })
        .eq('empresa_id', selectedEnterpriseId);

      // If we have search results, filter by those IDs
      const isSearchActive = searchTerm.length >= 2;
      
      if (isSearchActive && hasSearchResults) {
        // PERFORMANCE: Limit IDs to top scored contacts to avoid massive IN clauses
        const sortedIds = Array.from(contactScores.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by score DESC
          .slice(0, SEARCH_RESULT_LIMIT) // Take top N
          .map(([id]) => id);
        
        query = query.in('id', sortedIds);
        logger.debug('[SuperSearch] Filtered to top', sortedIds.length, 'contacts by score');
      } else if (isSearchActive && !hasSearchResults) {
        // Search was performed but no results found
        set({
          contacts: [],
          pagination: { ...pagination, totalCount: 0, totalPages: 0 },
          isLoading: false,
          error: null,
          contactsLastFetch: Date.now()
        });
        logger.debug('[ContactStore] No results found for search');
        return;
      }

      // Apply additional filters
      if (filters.estado) {
        query = query.eq('estado', filters.estado);
      }

      if (filters.calificacion) {
        query = query.eq('es_calificado', filters.calificacion);
      }

      // SECURITY: Role 3 users MUST always filter by their own team_humano_id
      // This is a fail-safe in case globalTeamFilter wasn't properly initialized
      const isBasicRole = userContext?.roleId === 3;
      if (isBasicRole && userContext?.id) {
        // Force filter by user's own ID, even if asesorIds is not set
        const effectiveAsesorIds = filters.asesorIds?.length > 0 
          ? filters.asesorIds 
          : [userContext.id];

        const [assignmentsRes, legacyRes] = await Promise.all([
          supabase
            .from('wp_contacto_team_asignaciones')
            .select('contacto_id')
            .eq('empresa_id', selectedEnterpriseId)
            .in('team_humano_id', effectiveAsesorIds),
          supabase
            .from('wp_contactos')
            .select('id')
            .eq('empresa_id', selectedEnterpriseId)
            .in('team_humano_id', effectiveAsesorIds)
        ]);

        const visibleContactIds = Array.from(new Set<number>([
          ...(assignmentsRes.data || []).map((a: any) => a.contacto_id),
          ...(legacyRes.data || []).map((c: any) => c.id)
        ]));

        if (visibleContactIds.length === 0) {
          set({
            contacts: [],
            pagination: { ...pagination, totalCount: 0, totalPages: 0 },
            isLoading: false,
            error: null,
            contactsLastFetch: Date.now()
          });
          logger.debug('[ContactStore] 🔒 Role 3 filter produced 0 visible contacts');
          return;
        }

        query = query.in('id', visibleContactIds);
        logger.debug('[ContactStore] 🔒 Role 3 assignment-aware filter applied:', {
          teamIds: effectiveAsesorIds,
          contacts: visibleContactIds.length,
        });
      } else if (filters.asesorIds && filters.asesorIds.length > 0) {
        const [assignmentsRes, legacyRes] = await Promise.all([
          supabase
            .from('wp_contacto_team_asignaciones')
            .select('contacto_id')
            .eq('empresa_id', selectedEnterpriseId)
            .in('team_humano_id', filters.asesorIds),
          supabase
            .from('wp_contactos')
            .select('id')
            .eq('empresa_id', selectedEnterpriseId)
            .in('team_humano_id', filters.asesorIds)
        ]);

        const visibleContactIds = Array.from(new Set<number>([
          ...(assignmentsRes.data || []).map((a: any) => a.contacto_id),
          ...(legacyRes.data || []).map((c: any) => c.id)
        ]));

        if (visibleContactIds.length === 0) {
          set({
            contacts: [],
            pagination: { ...pagination, totalCount: 0, totalPages: 0 },
            isLoading: false,
            error: null,
            contactsLastFetch: Date.now()
          });
          logger.debug('[ContactStore] Team filter produced 0 visible contacts');
          return;
        }

        query = query.in('id', visibleContactIds);
      }

      if (filters.origen) {
        query = query.eq('origen', filters.origen);
      }

      if (filters.etapaEmbudoId) {
        query = query.eq('etapa_embudo', filters.etapaEmbudoId);
      }

      if (filters.dateRange.from) {
        query = query.gte('created_at', filters.dateRange.from);
      }

      if (filters.dateRange.to) {
        query = query.lte('created_at', filters.dateRange.to);
      }

      // Pagination & Ordering
      // Strategy: 
      // - If Searching: Fetch ALL matching rows (filtered by DB), then sort & paginate in Memory to respect relevance score
      // - Otherwise: Always fetch a larger pool (MAX_CONTACTS_IN_MEMORY) and sort/paginate client-side
      //   This ensures the local instant search always has enough contacts in memory.
      //   Previously, 'createdNewest'/'createdOldest' used DB pagination (25 contacts),
      //   which made local search nearly useless for those sort modes.
      
      if (isSearchActive) {
         // SEARCH MODE: No DB pagination/ordering, just fetch filtered pool
      } else {
         // ALL SORT MODES: Fetch larger pool for accurate client-side sorting AND local search
         // Limit to MAX_CONTACTS_IN_MEMORY to avoid memory issues
         const dbOrderColumn = filters.sortBy === 'createdOldest' || filters.sortBy === 'createdNewest' 
           ? 'created_at' 
           : 'ultima_interaccion';
         const dbOrderAsc = filters.sortBy === 'createdOldest';
         
         query = query
            .order(dbOrderColumn, { ascending: dbOrderAsc, nullsFirst: false })
            .limit(MAX_CONTACTS_IN_MEMORY);
      }

      // No persistimos 'search' en el store para que el buscador local (useDraftStorage)
      // tenga el control total del input y no haya conflictos de sincronización.
      // Si hay un draft en localStorage, ContactsView lo cargará al montar.
      
      const { data, error: fetchError, count } = await query;

      if (fetchError) {
        logger.error('[ContactStore] Query error:', {
          hint: fetchError.hint
        });
        set({ error: `Error al cargar contactos: ${fetchError.message}`, isLoading: false });
        return;
      }
      
      let finalContacts = (data || []).map(contact => {
        const matchDetails = contactMatches.get(contact.id);
        if (matchDetails) {
          return {
            ...contact,
            matchSource: matchDetails.source,
            matchPreview: matchDetails.preview
          } as ContactSearchResult;
        }
        return contact;
      });
      let finalTotalCount = count || 0;

      // Post-process for Search Mode: Sort and Paginate in Memory
      // PERFORMANCE: Already limited by SEARCH_RESULT_LIMIT, just sort and paginate
      if (isSearchActive) {
          // 1. Sort by Relevance Score (already limited to top N)
          finalContacts.sort((a, b) => {
              const scoreA = contactScores.get(a.id) || 0;
              const scoreB = contactScores.get(b.id) || 0;
              
              if (scoreA !== scoreB) return scoreB - scoreA;
              
              // Tie-breaker: Last Interaction DESC
              const timeA = new Date(a.ultima_interaccion || 0).getTime();
              const timeB = new Date(b.ultima_interaccion || 0).getTime();
              return timeB - timeA;
          });
          
          // 2. Update Total Count (capped at SEARCH_RESULT_LIMIT)
          finalTotalCount = Math.min(finalContacts.length, SEARCH_RESULT_LIMIT);
          
          // 3. Paginate in Memory
          const startIndex = (pagination.page - 1) * pagination.pageSize;
          const endIndex = startIndex + pagination.pageSize;
          finalContacts = finalContacts.slice(startIndex, endIndex);
          
          logger.debug('[SuperSearch] Final:', finalContacts.length, 'contacts on page', pagination.page);
      } else {
          // CLIENT SORT MODE (all non-search): Update total count to reflect actual contacts fetched
          // The component will handle final sorting by the selected sortBy option
          finalTotalCount = finalContacts.length;
          logger.debug('[ContactStore] Client sort mode:', finalContacts.length, 'contacts for', filters.sortBy, 'sorting');
      }

      logger.debug('[ContactStore] Resultado:', {
        totalFound: finalTotalCount,
        pageLength: finalContacts.length
      });

      const totalPages = Math.ceil(finalTotalCount / pagination.pageSize);

      set({
        contacts: finalContacts,
        pagination: { ...pagination, totalCount: finalTotalCount, totalPages },
        isLoading: false,
        error: null,
        contactsLastFetch: Date.now()
      });

      // Track performance
      const queryDuration = performance.now() - queryStartTime;
      trackMetric('contacts_fetch_time', queryDuration, 'ms', {
        mode: isSearchActive ? 'search' : 'normal',
        resultCount: finalContacts.length,
        totalCount: finalTotalCount
      });
      
      console.log(`[ContactStore] ✅ Loaded ${data?.length || 0} contacts in ${queryDuration.toFixed(0)}ms`);

      } catch (err) {
        console.error('[ContactStore] Fetch error:', err);
        
        // Log error to system
        await logError('fetchContacts', err, {
          userId: userContext?.id?.toString(),
          empresaId: selectedEnterpriseId,
          additionalData: {
            filters,
            forceRefresh,
            hasActiveSearch
          }
        });
        
        set({ error: 'Error de conexión', isLoading: false });
      }
    };

    if (shouldUseInFlightLock) {
      const promise = (async () => {
        try {
          await runFetch();
        } finally {
          setContactsFetchInFlight(null);
        }
      })();
      setContactsFetchInFlight(promise);
      return promise;
    }

    return runFetch();
  },

  setFilters: (newFilters: Partial<ContactState['filters']>) => {
    const state = get();
    const currentFilters = state.filters;
    let hasChanges = false;

    // Check if any filter actually changed
    for (const key in newFilters) {
      const k = key as keyof ContactState['filters'];
      // Handle dateRange object comparison specifically
      if (k === 'dateRange') {
        const newRange = (newFilters as any)[k];
        const currRange = currentFilters[k];
        if (newRange?.from !== currRange?.from || newRange?.to !== currRange?.to) {
          hasChanges = true;
          break;
        }
      } else if ((newFilters as any)[k] !== currentFilters[k]) {
        hasChanges = true;
        break;
      }
    }

    if (!hasChanges) {
      console.log('[ContactStore] 🛑 Filters unchanged, skipping update');
      return;
    }

    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      contactsLastFetch: null, // Invalidate cache immediately as data no longer matches filters
      pagination: { ...state.pagination, page: 1 } // Reset to page 1 on filter change
    }));
    // Auto-fetch after filter change
    get().fetchContacts();
  },

  resetFilters: () => {
    set({ 
      filters: initialFilters, 
      contactsLastFetch: null, // Invalidate cache
      pagination: { ...initialPagination } 
    });
    get().fetchContacts();
  },

  setPage: (page: number) => {
    set((state) => ({
      pagination: { ...state.pagination, page }
    }));
    // Force refresh to bypass cache check, otherwise it thinks we have valid data (from prev page)
    get().fetchContacts(true);
  },

  refreshContacts: async () => {
    // PERF: Parallelized - both fetches are independent
    await Promise.all([
      get().fetchContacts(true),
      get().fetchFunnelStages(true)
    ]);
  },
});
