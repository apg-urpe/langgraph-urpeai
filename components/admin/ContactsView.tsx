'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useDraftStorage } from '../../hooks/useDraftStorage';
import { logger } from '@/lib/logger';
import { 
  Search, 
  RefreshCw, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  X,
  Loader2,
  Users,
  AlertCircle,
  MessageSquare,
  Database,
  Sparkles,
  ArrowUpDown,
  Plus
} from 'lucide-react';
import { 
  useContactStore,
  selectContacts,
  selectIsLoading,
  selectError,
  selectFilters,
  selectPagination,
  selectSelectedEnterpriseId,
  selectSelectedContactId,
  selectFunnelStages,
  selectTeamMembers,
  selectUserContext,
  selectEnterpriseAppointments,
  selectOrigenOptions
} from '../../store/contactStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { ContactDisplayData, toDisplayData, SearchScope, ContactContext, generateContactContext, SORT_OPTIONS, ContactSortOption, precomputeContactContexts, sortContactsWithContext, ContactWithContext } from '../../types/contact';
import { ContactDetailModal } from './ContactDetailModal';
import { ContactDetailPanel } from './ContactDetailPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { ContactCard } from './contacts/ContactCard';
import { ContactsFilter, countActiveFilters } from './contacts/ContactsFilter';
import { VirtualizedContactList } from './VirtualizedContactList';
import { CreateContactModal } from './contact-details/CreateContactModal';
import { 
  useAdminStore, 
  selectGlobalTeamMemberIds 
} from '../../store/adminStore';
import { normalizePhone, looksLikePhone } from '../../lib/ui-helpers';

export const ContactsView: React.FC = () => {
  const contacts = useContactStore(selectContacts);
  const isLoading = useContactStore(selectIsLoading);
  const error = useContactStore(selectError);
  const filters = useContactStore(selectFilters);
  const pagination = useContactStore(selectPagination);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const selectedContactId = useContactStore(selectSelectedContactId);
  const funnelStages = useContactStore(selectFunnelStages);
  const teamMembers = useContactStore(selectTeamMembers);
  const userContext = useContactStore(selectUserContext);
  const enterpriseAppointments = useContactStore(selectEnterpriseAppointments);
  const origenOptions = useContactStore(selectOrigenOptions);
  
  // Global team filter from adminStore (array of selected IDs)
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  
  const fetchContacts = useContactStore(state => state.fetchContacts);
  const setFilters = useContactStore(state => state.setFilters);
  const resetFilters = useContactStore(state => state.resetFilters);
  const setPage = useContactStore(state => state.setPage);
  const refreshContacts = useContactStore(state => state.refreshContacts);
  const selectContact = useContactStore(state => state.selectContact);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);
  const fetchFunnelStages = useContactStore(state => state.fetchFunnelStages);
  const fetchEnterpriseAppointments = useContactStore(state => state.fetchEnterpriseAppointments);

  const [searchInput, setSearchInput] = useDraftStorage(
    'search_query',
    'contacts_search',
    ''
  );

  // Sync LOCAL draft with STORE filter on mount
  useEffect(() => {
    if (searchInput) {
      logger.debug('[ContactsView] Syncing local search draft to store:', searchInput);
      useContactStore.getState().setFilters({ search: searchInput });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount - searchInput intentionally excluded
  const [showFilters, setShowFilters] = useState(false);
  const [showSearchScope, setShowSearchScope] = useState(false);
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [now, setNow] = useState(Date.now()); // Force refresh for timers
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Engagement tracking
  usePageTracking('contacts');
  const trackAction = useActionTracking('contacts');
  
  // Update 'now' every 30 seconds to refresh pause status UI
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Refs for progressive search timers
  const basicSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const deepSearchTimer = useRef<NodeJS.Timeout | null>(null);

  const searchScopeOptions: { value: SearchScope; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'all', label: 'Super Búsqueda', icon: <Sparkles className="w-3.5 h-3.5" />, desc: 'Contactos, mensajes, metadata' },
    { value: 'basic', label: 'Básica', icon: <Users className="w-3.5 h-3.5" />, desc: 'Nombre, teléfono, email' },
    { value: 'messages', label: 'Mensajes', icon: <MessageSquare className="w-3.5 h-3.5" />, desc: 'Contenido de conversaciones' },
    { value: 'metadata', label: 'Metadata', icon: <Database className="w-3.5 h-3.5" />, desc: 'Datos personalizados' },
  ];

  // DEFAULT: 'basic' for faster search (user can switch to 'all' for deep search)
  const currentScope = searchScopeOptions.find(s => s.value === (filters.searchScope || 'basic')) || searchScopeOptions[1];

  // ========== LEVEL 1: INSTANT LOCAL FILTER (0ms) ==========
  const localFilteredContacts = useMemo(() => {
    if (!searchInput || searchInput.length < 2) {
      return contacts;
    }
    
    // Normalize: lowercase, trim, and collapse multiple spaces to single space
    const term = searchInput.toLowerCase().trim().replace(/\s+/g, ' ');
    const serverSearchActive = filters.search && filters.search.length >= 2;
    // Compare with same normalization (collapse spaces)
    const normalizedServerSearch = (filters.search || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const inputMatchesServer = serverSearchActive && term === normalizedServerSearch;
    
    // Split into words for multi-word search (e.g. "Juan Manuel" -> ["juan", "manuel"])
    const searchWords = term.split(' ').filter(w => w.length >= 2);
    const isMultiWordSearch = searchWords.length > 1;
    
    // 1. Filter candidates
    const candidates = contacts.filter(contact => {
      // If we have a finalized server search that matches our input, trust the server's list.
      // This allows showing contacts that matched by Message or Metadata (which we can't check locally)
      // We check !isLoading to avoid showing the PREVIOUS full list while the new search is loading.
      if (inputMatchesServer && !isLoading) {
        return true; 
      }

      // Otherwise (loading or local-only refinement), apply strict local filter
      const nombre = (contact.nombre || '').toLowerCase();
      const apellido = (contact.apellido || '').toLowerCase();
      const telefono = (contact.telefono || '').toLowerCase();
      const email = (contact.email || '').toLowerCase();
      const notas = (contact.notas || '').toLowerCase();
      const fullName = `${nombre} ${apellido}`;
      
      // Check for phone number match with normalization
      const isPhoneSearch = looksLikePhone(term);
      const normalizedTerm = isPhoneSearch ? normalizePhone(term) : '';
      const normalizedTelefono = isPhoneSearch ? normalizePhone(telefono) : '';
      const phoneMatch = isPhoneSearch && normalizedTelefono.includes(normalizedTerm);
      
      // For multi-word search, check if ANY word matches (server already filtered)
      if (isMultiWordSearch) {
        const matchesAnyWord = searchWords.some(word => 
          nombre.includes(word) || apellido.includes(word) || fullName.includes(word)
        );
        if (matchesAnyWord) return true;
      }
      
      return nombre.includes(term) ||
             apellido.includes(term) ||
             telefono.includes(term) ||
             phoneMatch ||
             email.includes(term) ||
             notas.includes(term) ||
             fullName.includes(term);
    });

    // 2. Sort by relevance - CRITICAL: Multi-word matches get HUGE bonus
    return candidates.sort((a, b) => {
      const getScore = (c: typeof a) => {
        let score = 0;
        const nombre = (c.nombre || '').toLowerCase();
        const apellido = (c.apellido || '').toLowerCase();
        const telefono = (c.telefono || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const notas = (c.notas || '').toLowerCase();
        const fullName = `${nombre} ${apellido}`;

        // ============ MULTI-WORD SEARCH SCORING ============
        // For searches like "Juan Manuel", prioritize contacts matching ALL words
        if (isMultiWordSearch) {
          // Count how many search words match in the name
          const matchedWords = searchWords.filter(word => 
            nombre.includes(word) || apellido.includes(word)
          );
          const matchRatio = matchedWords.length / searchWords.length;
          
          // HUGE BONUS for matching ALL words (e.g. "Juan Manuel Castro" for "Juan Manuel")
          if (matchRatio === 1) {
            score += 500; // Matches ALL search words
            
            // Extra bonus if fullName contains the exact search phrase
            if (fullName.includes(term)) {
              score += 200; // "juan manuel castro" contains "juan manuel"
            }
            
            // Bonus for exact name match with search words
            if (searchWords.every(w => nombre.includes(w))) {
              score += 100; // All words in first name (e.g. nombre="Juan Manuel")
            }
          } else if (matchRatio >= 0.5) {
            // Partial match - at least half the words
            score += 100 * matchedWords.length;
          } else {
            // Only one word matches - low priority
            score += 30 * matchedWords.length;
          }
          
          // Bonus for word order matching the search order
          const nameWords = fullName.split(' ');
          let orderBonus = 0;
          let lastIndex = -1;
          for (const searchWord of searchWords) {
            const idx = nameWords.findIndex((nw, i) => i > lastIndex && nw.includes(searchWord));
            if (idx > lastIndex) {
              orderBonus += 20;
              lastIndex = idx;
            }
          }
          score += orderBonus;
        } else {
          // ============ SINGLE WORD SEARCH SCORING ============
          // High priority: Name match
          if (nombre.includes(term) || apellido.includes(term) || fullName.includes(term)) {
            score += 100;
            // Bonus for starting with term
            if (nombre.startsWith(term) || apellido.startsWith(term)) score += 50;
            // Bonus for exact match
            if (nombre === term || apellido === term) score += 50;
          }
        }
        
        // Medium priority: Phone/Email (with normalization support)
        if (telefono.includes(term) || email.includes(term)) {
          score += 50;
        }
        // Phone normalization match
        if (looksLikePhone(term)) {
          const normalizedTerm = normalizePhone(term);
          const normalizedTelefono = normalizePhone(telefono);
          if (normalizedTelefono.includes(normalizedTerm)) {
            score += 60; // Higher than regular phone match
          }
        }

        // Low priority: Notes
        if (notas.includes(term)) {
          score += 10;
        }
        
        return score;
      };

      const scoreA = getScore(a);
      const scoreB = getScore(b);

      // Tie-breaker: alphabetical by name
      if (scoreA === scoreB) {
        const nameA = `${a.nombre || ''} ${a.apellido || ''}`.toLowerCase();
        const nameB = `${b.nombre || ''} ${b.apellido || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      }

      return scoreB - scoreA;
    });
  }, [contacts, searchInput, filters.search, isLoading]);

  useEffect(() => {
    if (selectedEnterpriseId) {
      // Load team members, funnel stages, and appointments for context
      fetchTeamMembers();
      fetchFunnelStages();
      fetchEnterpriseAppointments();
    }
  }, [selectedEnterpriseId, fetchTeamMembers, fetchFunnelStages, fetchEnterpriseAppointments]);

  // Note: asesorIds filter is now synced with globalTeamFilter from header
  // Sync local asesorIds filter with global team filter
  const prevGlobalTeamMemberIdsRef = useRef<number[]>(globalTeamMemberIds);
  useEffect(() => {
    const currentKey = globalTeamMemberIds.join(',');
    const prevKey = prevGlobalTeamMemberIdsRef.current.join(',');
    if (prevKey !== currentKey) {
      prevGlobalTeamMemberIdsRef.current = globalTeamMemberIds;
      setFilters({ asesorIds: globalTeamMemberIds });
    }
  }, [globalTeamMemberIds, setFilters]);

  // Store the user's selected scope (don't modify it during search)
  const userSelectedScope = useRef<SearchScope>(filters.searchScope || 'all');
  
  // Track last server search to prevent redundant calls
  const lastServerSearchRef = useRef<string>('');
  
  // Update ref when user explicitly changes scope
  useEffect(() => {
    userSelectedScope.current = filters.searchScope || 'all';
  }, [filters.searchScope]);

  // ========== LEVEL 2 & 3: PROGRESSIVE REMOTE SEARCH ==========
  useEffect(() => {
    // Clear existing timers
    if (basicSearchTimer.current) clearTimeout(basicSearchTimer.current);
    if (deepSearchTimer.current) clearTimeout(deepSearchTimer.current);
    
    // If search is empty or too short, reset server search to show all contacts
    if (!searchInput || searchInput.length < 2) {
      setIsSearching(false);
      
      // Only clear if we previously had an active search
      if (lastServerSearchRef.current) {
        lastServerSearchRef.current = '';
        setFilters({ search: '' });
      }
      return;
    }
    
    // Track search action
    trackAction('contacts.search', { query: searchInput, scope: userSelectedScope.current });
    
    // Skip if we already sent this exact search to server
    if (searchInput === lastServerSearchRef.current) {
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    const scope = userSelectedScope.current;
    
    // LEVEL 2: Fast basic search (100ms debounce)
    basicSearchTimer.current = setTimeout(() => {
      // Guard against redundant calls
      if (searchInput !== lastServerSearchRef.current) {
        lastServerSearchRef.current = searchInput;
        // For 'basic' scope, this is the only search
        if (scope === 'basic') {
          setFilters({ search: searchInput, searchScope: 'basic' });
          setIsSearching(false);
        } else {
          // For other scopes, do basic first for quick results
          setFilters({ search: searchInput, searchScope: 'basic' });
        }
      }
    }, 100);
    
    // LEVEL 3: Deep search (800ms) - Only for 'all', 'messages', 'metadata' scopes
    if (scope !== 'basic') {
      deepSearchTimer.current = setTimeout(() => {
        if (searchInput === lastServerSearchRef.current) {
          setFilters({ search: searchInput, searchScope: scope });
        }
        setIsSearching(false);
      }, 800); // Increased from 500ms to reduce server load
    }
    
    return () => {
      if (basicSearchTimer.current) clearTimeout(basicSearchTimer.current);
      if (deepSearchTimer.current) clearTimeout(deepSearchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Build appointments map by contact ID for context generation
  const appointmentsByContactId = useMemo(() => {
    const map = new Map<number, typeof enterpriseAppointments>();
    enterpriseAppointments.forEach(apt => {
      const rawContactId = apt.contacto_id;
      const contactId = typeof rawContactId === 'string' ? parseInt(rawContactId, 10) : rawContactId;
      if (typeof contactId === 'number' && !Number.isNaN(contactId) && contactId > 0) {
        const existing = map.get(contactId) || [];
        existing.push(apt);
        map.set(contactId, existing);
      }
    });
    return map;
  }, [enterpriseAppointments]);

  // Convert to display format - use locally filtered contacts for instant feedback
  // ========== OPTIMIZED SORTING - Pre-compute context once (O(n log n)) ==========
  const sortedContactsWithContext = useMemo(() => {
    // Pre-compute context for all contacts (O(n))
    const contactsWithContext = precomputeContactContexts(localFilteredContacts, teamMembers, appointmentsByContactId);
    
    // Sort using pre-computed context (O(n log n))
    const sortBy = filters.sortBy || 'leadScore';
    return sortContactsWithContext(contactsWithContext, sortBy);
  }, [localFilteredContacts, filters.sortBy, teamMembers, appointmentsByContactId]);

  // Convert to display format
  const displayContacts: ContactDisplayData[] = useMemo(() => {
    return sortedContactsWithContext.map(({ contact }) => toDisplayData(contact));
  }, [sortedContactsWithContext]);
  
  // Create a map for quick context lookup by contact ID
  const contextMap = useMemo(() => {
    const map = new Map<number, ContactContext>();
    sortedContactsWithContext.forEach(({ contact, context }) => {
      map.set(contact.id, context);
    });
    return map;
  }, [sortedContactsWithContext]);

  return (
    <div className="flex h-full bg-[#0c0c0e] relative overflow-hidden">
      {/* Modal de Crear Contacto */}
      {showCreateModal && (
        <CreateContactModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(contactId) => {
            setShowCreateModal(false);
            selectContact(contactId);
            trackAction('contacts.created', { contactId });
          }}
        />
      )}
      
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse-slow" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse-slow" />

      <div className={`
        flex flex-col h-full border-r border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl z-20 transition-all duration-300
        w-full
      `}>
        
        <div className="shrink-0 p-3 md:p-4 space-y-3 bg-gradient-to-b from-[#0a0a0c] to-transparent relative">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-400" />
              CONTACTOS
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-zinc-500 font-mono">
                {pagination.totalCount}
              </span>
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newState = !showSortOptions;
                  setShowSortOptions(newState);
                  if (newState) trackAction('contacts.sort_menu_open');
                }}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200 ${
                  showSortOptions 
                    ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
                title="Ordenar contactos"
              >
                <ArrowUpDown className="w-4 h-4" />
                <span className="text-[10px] font-medium hidden sm:inline">
                  {SORT_OPTIONS.find(o => o.option === (filters.sortBy || 'leadScore'))?.label || 'Ordenar'}
                </span>
              </button>
              <button
                onClick={() => {
                  const newState = !showFilters;
                  setShowFilters(newState);
                  if (newState) trackAction('contacts.filter_menu_open');
                }}
                className={`relative p-2 rounded-lg transition-all duration-200 ${
                  showFilters 
                    ? 'bg-primary-500/20 text-primary-400 shadow-[0_0_10px_rgba(var(--primary-500),0.1)]' 
                    : countActiveFilters(filters) > 0
                      ? 'text-primary-400 bg-primary-500/10'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <Filter className="w-4 h-4" />
                {countActiveFilters(filters) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-primary-500 text-[9px] font-bold text-black">
                    {countActiveFilters(filters)}
                  </span>
                )}
              </button>
              <button
                onClick={refreshContacts}
                disabled={isLoading}
                className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              {/* Botón + Nuevo Contacto - Último */}
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  trackAction('contacts.create_modal_open');
                }}
                className="p-2 text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded-lg transition-all duration-200 border border-primary-500/20 hover:border-primary-500/40"
                title="Nuevo contacto"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-primary-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center bg-[#131316] border border-white/10 rounded-xl overflow-hidden focus-within:border-primary-500/50 transition-colors shadow-lg">
              <button
                onClick={() => setShowSearchScope(!showSearchScope)}
                className={`flex items-center gap-1.5 px-2.5 py-2 border-r border-white/10 hover:bg-white/5 transition-colors shrink-0 ${
                  filters.searchScope === 'all' ? 'text-primary-400' : 'text-zinc-400'
                }`}
                title={currentScope.desc}
              >
                {currentScope.icon}
                <span className="text-[10px] font-medium hidden sm:inline">{currentScope.label}</span>
              </button>
              <Search className="w-4 h-4 text-zinc-500 ml-2 shrink-0" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={filters.searchScope === 'all' 
                  ? "Super búsqueda: nombre, mensajes, metadata..." 
                  : filters.searchScope === 'messages'
                  ? "Buscar en mensajes de conversación..."
                  : filters.searchScope === 'metadata'
                  ? "Buscar en metadata del contacto..."
                  : "Buscar por nombre, teléfono, email..."
                }
                className="w-full bg-transparent border-none text-xs md:text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-0 py-2.5 px-2"
              />
              {(isSearching || isLoading) && searchInput.length >= 2 && (
                <Loader2 className="w-4 h-4 text-primary-400 animate-spin mr-2" />
              )}
              {searchInput && !isSearching && !isLoading && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setFilters({ search: '' });
                  }}
                  className="p-2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            {showSearchScope && (
              <div className="absolute top-full left-0 mt-1 w-full bg-[#131316] border border-white/10 rounded-xl shadow-xl z-30 overflow-hidden animate-slide-in-top">
                {searchScopeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setFilters({ searchScope: option.value });
                      setShowSearchScope(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors ${
                      filters.searchScope === option.value ? 'bg-primary-500/10 text-primary-400' : 'text-zinc-300'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${filters.searchScope === option.value ? 'bg-primary-500/20' : 'bg-white/5'}`}>
                      {option.icon}
                    </div>
                    <div>
                      <div className="text-xs font-medium">{option.label}</div>
                      <div className="text-[10px] text-zinc-500">{option.desc}</div>
                    </div>
                    {option.value === 'all' && (
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400 font-bold">SUPER</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {searchInput.length >= 2 && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              {isSearching ? (
                <>
                  <Loader2 className="w-3 h-3 text-primary-400 animate-spin" />
                  <span className="text-zinc-400">Buscando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-primary-400" />
                  <span>
                    <span className="text-zinc-300 font-medium">{displayContacts.length}</span> resultados
                    {displayContacts.length !== pagination.totalCount && pagination.totalCount > 0 && (
                      <span className="text-zinc-600"> (de {pagination.totalCount} en servidor)</span>
                    )}
                  </span>
                </>
              )}
            </div>
          )}

          {showSortOptions && (
              <div className="absolute top-20 right-2 left-2 md:left-auto md:right-4 md:w-72 bg-[#131316] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-in-top">
                <div className="p-3 border-b border-white/5 flex items-center justify-between">
                  <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Ordenar por</div>
                  <button 
                    onClick={() => setShowSortOptions(false)}
                    className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  {SORT_OPTIONS.map((option) => {
                    const isActive = (filters.sortBy || 'leadScore') === option.option;
                    return (
                      <button
                        key={option.option}
                        onClick={() => {
                          setFilters({ sortBy: option.option });
                          setShowSortOptions(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors ${
                          isActive ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-300'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${isActive ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                          <span className="text-sm">{option.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium">{option.label}</div>
                          <div className="text-[10px] text-zinc-500 truncate">{option.description}</div>
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          <ContactsFilter
            show={showFilters}
            filters={filters}
            setFilters={setFilters}
            resetFilters={resetFilters}
            teamMembers={teamMembers}
            funnelStages={funnelStages}
            origenOptions={origenOptions}
          />
        </div>

        <div className="flex-1 overflow-hidden px-2">
          {isLoading && contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary-500/50" />
              <span className="text-xs tracking-wider opacity-70">SINCRONIZANDO DATOS...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 text-red-400 p-4 text-center">
              <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-xs">{error}</span>
              <button onClick={refreshContacts} className="mt-3 text-xs underline opacity-70 hover:opacity-100">Reintentar</button>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-600 p-4 text-center">
              <Users className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-xs">No se encontraron contactos</span>
            </div>
          ) : (
            <VirtualizedContactList
              contacts={displayContacts}
              contextMap={contextMap}
              selectedContactId={selectedContactId}
              onSelectContact={(id) => selectContact(id)}
            />
          )}
        </div>

        <div className="shrink-0 p-3 border-t border-white/5 bg-[#0a0a0c]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-mono">
              PAGINA {pagination.page} / {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setPage(pagination.page - 1);
                  trackAction('contacts.page_change', { page: pagination.page - 1 });
                }}
                disabled={pagination.page <= 1 || isLoading}
                className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30 disabled:hover:bg-transparent text-zinc-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setPage(pagination.page + 1);
                  trackAction('contacts.page_change', { page: pagination.page + 1 });
                }}
                disabled={pagination.page >= pagination.totalPages || isLoading}
                className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30 disabled:hover:bg-transparent text-zinc-400 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:flex flex-1 relative bg-[#0c0c0e]">
        {selectedContactId ? (
          <div className="w-full animate-slide-in-right">
            <ErrorBoundary componentName="ContactDetailPanel">
              <ContactDetailPanel 
                contactId={selectedContactId} 
                onClose={() => selectContact(null)} 
              />
            </ErrorBoundary>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 opacity-50 select-none pointer-events-none">
             <div className="relative">
               <div className="absolute inset-0 bg-primary-500/20 blur-[50px] rounded-full" />
               <Users className="w-24 h-24 text-zinc-800 relative z-10" />
               <div className="absolute top-0 left-0 w-full h-1 bg-primary-500/30 shadow-[0_0_15px_rgba(var(--primary-500),0.5)] animate-scan" />
             </div>
             <h3 className="mt-8 text-xl font-bold tracking-[0.2em] text-zinc-800 animate-pulse">SYSTEM READY</h3>
             <p className="text-xs font-mono mt-2 text-zinc-700">SELECT A TARGET TO INITIALIZE</p>
          </div>
        )}
      </div>

      <div className="md:hidden">
        {selectedContactId && (
          <ContactDetailModal 
            contactId={selectedContactId} 
            onClose={() => selectContact(null)} 
          />
        )}
      </div>
    </div>
  );
};
