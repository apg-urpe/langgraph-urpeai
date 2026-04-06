'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback, Suspense } from 'react';
import { useDraftStorage } from '../../hooks/useDraftStorage';
import { logger } from '@/lib/logger';
import { 
  Search, 
  RefreshCw, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  Users,
  LayoutGrid,
  List,
  MessageSquareReply,
  ArrowUpDown,
  Plus,
  Wallet
} from 'lucide-react';
import { 
  useContactStore,
  selectContacts,
  selectFunnelStages,
  selectStageCounts,
  selectTeamMembers,
  selectIsLoading,
  selectError,
  selectFilters,
  selectPagination,
  selectSelectedEnterpriseId,
  selectSelectedContactId,
  selectActiveContact,
  selectActiveContactData,
  selectUserContext,
  selectEnterpriseAppointments,
  selectOrigenOptions,
  PIPELINE_PAGE_SIZE
} from '../../store/contactStore';
import { initialFilters, initialPagination } from '../../store/contact/types';
import { useAdminStore, selectGlobalTeamMemberIds, selectFocusedContactId, selectFocusedContactLabel } from '../../store/adminStore';
import { useShallow } from 'zustand/react/shallow';
import { Contact, ContactContext, ContactDisplayData, ContactFilters, toDisplayData, FunnelStage, SORT_OPTIONS, PORTFOLIO_SORT_OPTIONS, precomputeContactContexts, sortContactsWithContext } from '../../types/contact';
import { usePortfolioQueue } from '../../hooks/usePortfolioQueue';
import { trackRender } from '../../lib/performance-monitor';
import { ContactDetailModal } from './ContactDetailModal';
import { CreateContactModal } from './contact-details/CreateContactModal';
import { ErrorBoundary } from '../ErrorBoundary';
import { ContactsFilter, countActiveFilters } from './contacts/ContactsFilter';
import { ActivityView } from './activity/ActivityView';

// PERFORMANCE: Lazy load view components to split the bundle
const FunnelTableView = React.lazy(() => import('./funnel/FunnelTableView').then(m => ({ default: m.FunnelTableView })));
const FunnelKanbanView = React.lazy(() => import('./funnel/FunnelKanbanView').then(m => ({ default: m.FunnelKanbanView })));
const PortfolioListView = React.lazy(() => import('./funnel/PortfolioListView').then(m => ({ default: m.PortfolioListView })));
import { StageMoveToast, StageMoveInfo } from './funnel/StageMoveToast';
import { getStageColor } from './funnel/funnel-shared';

type ViewMode = 'table' | 'kanban' | 'activity' | 'portfolio';

const getViewModeFromAdminView = (view: 'contacts' | 'funnel' | 'activity' | string): ViewMode => {
  if (view === 'funnel') return 'kanban';
  if (view === 'portfolio') return 'portfolio';
  if (view === 'activity') return 'activity';
  return 'table';
};

const ViewLoading = () => (
  <div className="flex-1 flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
  </div>
);

// PERFORMANCE: Stable selector for actions to prevent re-renders
const selectActions = (state: ReturnType<typeof useContactStore.getState>) => ({
  fetchContacts: state.fetchContacts,
  fetchFunnelStages: state.fetchFunnelStages,
  fetchStageCounts: state.fetchStageCounts,
  fetchContactsByStage: state.fetchContactsByStage,
  fetchTeamMembers: state.fetchTeamMembers,
  fetchEnterpriseAppointments: state.fetchEnterpriseAppointments,
  updateContactStage: state.updateContactStage,
  setFilters: state.setFilters,
  resetFilters: state.resetFilters,
  setPage: state.setPage,
  refreshContacts: state.refreshContacts,
  selectContact: state.selectContact,
});

export const ContactsFunnelView: React.FC = () => {
  // PERFORMANCE: Use individual selectors for data (these are already memoized)
  const contacts = useContactStore(selectContacts);
  const funnelStages = useContactStore(selectFunnelStages);
  const stageCounts = useContactStore(selectStageCounts);
  const teamMembers = useContactStore(selectTeamMembers);
  const isLoading = useContactStore(selectIsLoading);
  const error = useContactStore(selectError);
  const filters = useContactStore(selectFilters);
  const pagination = useContactStore(selectPagination);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const selectedContactId = useContactStore(selectSelectedContactId);
  const activeContact = useContactStore(selectActiveContact);
  const activeContactData = useContactStore(selectActiveContactData);
  const userContext = useContactStore(selectUserContext);
  const enterpriseAppointments = useContactStore(selectEnterpriseAppointments);
  const origenOptions = useContactStore(selectOrigenOptions);
  
  // Global team filter from adminStore (array of selected IDs)
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const activeView = useAdminStore(state => state.activeView);
  const focusedContactId = useAdminStore(selectFocusedContactId);
  const focusedContactLabel = useAdminStore(selectFocusedContactLabel);
  const clearFocusedContactNavigation = useAdminStore(state => state.clearFocusedContactNavigation);
  const setActiveView = useAdminStore(state => state.setActiveView);
  
  // Check if user is basic role (rol 3) - for special empty state message
  const isBasicRole = userContext?.roleId === 3;
  
  // PERFORMANCE: Use shallow comparison for actions object to prevent re-renders
  const {
    fetchContacts,
    fetchFunnelStages,
    fetchStageCounts,
    fetchContactsByStage,
    fetchTeamMembers,
    fetchEnterpriseAppointments,
    updateContactStage,
    setFilters,
    resetFilters,
    setPage,
    refreshContacts,
    selectContact,
  } = useContactStore(useShallow(selectActions));

  const [viewMode, setViewMode] = useState<ViewMode>(() => getViewModeFromAdminView(activeView));
  const isFocusedNavigationActive = focusedContactId !== null;
  const setInteractiveFilters = useCallback((newFilters: Partial<ContactFilters>) => {
    if (viewMode !== 'portfolio') {
      setFilters(newFilters);
      return;
    }

    useContactStore.setState((state) => {
      let hasChanges = false;

      for (const key in newFilters) {
        const filterKey = key as keyof ContactFilters;
        if (filterKey === 'dateRange') {
          const nextRange = newFilters.dateRange;
          const currentRange = state.filters.dateRange;
          if (nextRange?.from !== currentRange?.from || nextRange?.to !== currentRange?.to) {
            hasChanges = true;
            break;
          }
        } else if (state.filters[filterKey] !== newFilters[filterKey]) {
          hasChanges = true;
          break;
        }
      }

      if (!hasChanges) {
        return state;
      }

      return {
        filters: { ...state.filters, ...newFilters },
        contactsLastFetch: null,
        pagination: { ...state.pagination, page: 1 },
      };
    });
  }, [setFilters, viewMode]);

  const resetInteractiveFilters = useCallback(() => {
    if (viewMode !== 'portfolio') {
      resetFilters();
      return;
    }

    const state = useContactStore.getState();
    useContactStore.setState({
      filters: {
        ...initialFilters,
        search: state.filters.search,
        searchScope: state.filters.searchScope,
        asesorIds: state.filters.asesorIds,
        sortBy: 'portfolioPriority',
      },
      contactsLastFetch: null,
      pagination: { ...initialPagination },
    });
  }, [resetFilters, viewMode]);

  const setInteractivePage = useCallback((page: number) => {
    if (viewMode !== 'portfolio') {
      setPage(page);
      return;
    }

    useContactStore.setState((state) => ({
      pagination: { ...state.pagination, page },
    }));
  }, [setPage, viewMode]);

  // Persist search input locally in Funnel View too
  const [searchInput, setSearchInput] = useDraftStorage(
    'search_query',
    'contacts_funnel_search',
    ''
  );

  // Sync LOCAL draft with STORE filter on mount
  useEffect(() => {
    if (searchInput) {
      logger.debug('[ContactsFunnelView] Syncing local search draft to store:', searchInput);
      useContactStore.setState((state) => ({
        filters: { ...state.filters, search: searchInput },
        contactsLastFetch: null,
        pagination: { ...state.pagination, page: 1 },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount - searchInput intentionally excluded
  const [showFilters, setShowFilters] = useState(false);
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const [draggedContactId, setDraggedContactId] = useState<number | null>(null);
  
  // Stage move toast state
  const [stageMoveInfo, setStageMoveInfo] = useState<StageMoveInfo | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // PERFORMANCE: Use ref for periodic updates instead of state to avoid re-renders
  // Only update 'now' when contacts array changes (pause status recalculation)
  const nowRef = useRef(Date.now());
  const [, forceUpdatePauseStatus] = useState(0);
  const sectionMenuRef = useRef<HTMLDivElement>(null);
  
  // Update pause status every 60 seconds, but only if there are paused contacts
  useEffect(() => {
    const hasPausedContacts = contacts.some(c => c.paused_until);
    if (!hasPausedContacts) return;
    
    const interval = setInterval(() => {
      nowRef.current = Date.now();
      forceUpdatePauseStatus(n => n + 1);
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length]); // Only re-setup when contact count changes - contacts intentionally excluded
  
  // Track last server search to prevent redundant calls
  const lastServerSearchRef = useRef<string>('');
  
  // PERFORMANCE: Throttled render tracking to reduce noise
  const renderCountRef = useRef(0);
  const lastTrackRef = useRef(0);
  
  if (process.env.NODE_ENV === 'development') {
    renderCountRef.current++;
    // Throttle tracking to every 20 renders (was 10) to reduce performance overhead of logging
    if (renderCountRef.current - lastTrackRef.current >= 20) {
      lastTrackRef.current = renderCountRef.current;
      trackRender('ContactsFunnelView', 0); // Render time tracking is handled by trackRender internal logic if needed
    }
  }

  const timezone = userContext?.timezone || 'America/Lima';

  // Fetch contacts when enterprise is selected
  // PERFORMANCE: Use ref to track if initial fetch was done
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (selectedEnterpriseId && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchContacts();
      fetchFunnelStages();
      fetchStageCounts(); // Fetch total counts per stage from DB
      fetchTeamMembers();
      fetchEnterpriseAppointments();
    }
  }, [selectedEnterpriseId, fetchContacts, fetchFunnelStages, fetchStageCounts, fetchTeamMembers, fetchEnterpriseAppointments]);
  
  // Reset initial fetch flag when enterprise changes
  useEffect(() => {
    initialFetchDoneRef.current = false;
  }, [selectedEnterpriseId]);

  // PIPELINE MODE: Fetch more contacts for Kanban view
  // This ensures the full pipeline is visible, not just paginated 25
  const pipelineFetchDoneRef = useRef(false);
  useEffect(() => {
    // Fetch with PIPELINE_PAGE_SIZE when in kanban mode
    if (viewMode === 'kanban' && selectedEnterpriseId && !pipelineFetchDoneRef.current) {
      pipelineFetchDoneRef.current = true;
      fetchContacts(true, PIPELINE_PAGE_SIZE);
    }
    // Reset flag when switching back to table
    if (viewMode === 'table') {
      pipelineFetchDoneRef.current = false;
    }
  }, [viewMode, selectedEnterpriseId, fetchContacts]);

  useEffect(() => {
    if (isFocusedNavigationActive && viewMode !== 'table' && viewMode !== 'portfolio') {
      setViewMode('table');
    }
  }, [isFocusedNavigationActive, viewMode]);

  useEffect(() => {
    const nextMode = getViewModeFromAdminView(activeView);
    if (isFocusedNavigationActive && nextMode !== 'table') {
      return;
    }
    setViewMode(prev => {
      if (prev === 'portfolio' && activeView === 'contacts') {
        return prev;
      }

      return prev === nextMode ? prev : nextMode;
    });
  }, [activeView, isFocusedNavigationActive]);

  useEffect(() => {
    if (!showSectionMenu) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(event.target as Node)) {
        setShowSectionMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showSectionMenu]);

  const handleSectionViewChange = useCallback((nextMode: ViewMode) => {
    setViewMode(nextMode);
    const nextAdminView = nextMode === 'kanban'
      ? 'funnel'
      : nextMode === 'activity'
        ? 'activity'
        : nextMode === 'portfolio'
          ? 'portfolio'
          : 'contacts';
    if (activeView !== nextAdminView) {
      setActiveView(nextAdminView);
    }
  }, [activeView, setActiveView]);

  // Sync local asesorIds filter with global team filter
  // FIXED: Use ref to track previous value and avoid dependency loop
  const prevGlobalTeamMemberIdsRef = useRef<number[]>(globalTeamMemberIds);
  useEffect(() => {
    // Only sync when globalTeamMemberIds actually changes (not on every render)
    const currentKey = globalTeamMemberIds.join(',');
    const prevKey = prevGlobalTeamMemberIdsRef.current.join(',');
    if (prevKey !== currentKey) {
      prevGlobalTeamMemberIdsRef.current = globalTeamMemberIds;
      // Pass the entire array for multi-member filtering
      setInteractiveFilters({ asesorIds: globalTeamMemberIds });
    }
  }, [globalTeamMemberIds, setInteractiveFilters]);

  // Debounced search
  useEffect(() => {
    // If search is cleared, update immediately
    if (!searchInput) {
      if (lastServerSearchRef.current !== '') {
        lastServerSearchRef.current = '';
        setInteractiveFilters({ search: '' });
      }
      return;
    }

    // Skip if unchanged
    if (searchInput === lastServerSearchRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      // Guard against race conditions
      if (searchInput !== lastServerSearchRef.current) {
        lastServerSearchRef.current = searchInput;
        setInteractiveFilters({ search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setInteractiveFilters]); // FIXED: Removed filters.search from dependencies

  // PERFORMANCE: Transform contacts for display with optimized sorting
  // Memoized to prevent recalculation on every render
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

  const contactsForView = useMemo(() => {
    if (!isFocusedNavigationActive || focusedContactId === null) {
      return contacts;
    }

    const contactInList = contacts.find(contact => contact.id === focusedContactId);
    if (contactInList) {
      return [contactInList];
    }

    if (activeContact?.id === focusedContactId) {
      return [activeContact];
    }

    return [] as Contact[];
  }, [activeContact, contacts, focusedContactId, isFocusedNavigationActive]);

  const focusedContactDisplayLabel = useMemo(() => {
    if (!isFocusedNavigationActive) return null;
    if (focusedContactLabel) return focusedContactLabel;

    const focusedContact = contactsForView[0];
    if (!focusedContact) {
      return focusedContactId ? `Contacto #${focusedContactId}` : 'Contacto seleccionado';
    }

    return [focusedContact.nombre, focusedContact.apellido].filter(Boolean).join(' ') || `Contacto #${focusedContact.id}`;
  }, [contactsForView, focusedContactId, focusedContactLabel, isFocusedNavigationActive]);

  const isFocusedContactLoading = isFocusedNavigationActive
    && contactsForView.length === 0
    && activeContactData.isLoading;

  // Active sort options depend on view mode
  const activeSortOptions = useMemo(
    () => viewMode === 'portfolio' ? PORTFOLIO_SORT_OPTIONS : SORT_OPTIONS,
    [viewMode]
  );

  const defaultSort = viewMode === 'portfolio' ? 'portfolioPriority' : 'leadScore';
  const previousViewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    const previousMode = previousViewModeRef.current;

    if (previousMode !== 'portfolio' && viewMode === 'portfolio' && filters.sortBy !== 'portfolioPriority') {
      setInteractiveFilters({ sortBy: 'portfolioPriority' });
    }

    if (previousMode === 'portfolio' && viewMode !== 'portfolio' && filters.sortBy === 'portfolioPriority') {
      setInteractiveFilters({ sortBy: 'leadScore' });
    }

    previousViewModeRef.current = viewMode;
  }, [filters.sortBy, setInteractiveFilters, viewMode]);

  const portfolioSortBy = useMemo(
    () => filters.sortBy === 'createdNewest' || filters.sortBy === 'createdOldest'
      ? filters.sortBy
      : 'portfolioPriority',
    [filters.sortBy]
  );

  const {
    items: portfolioItems,
    pagination: portfolioPagination,
    summary: portfolioSummary,
    isLoading: isLoadingPortfolio,
    error: portfolioError,
    refresh: refreshPortfolio,
  } = usePortfolioQueue(
    {
      enterpriseId: selectedEnterpriseId,
      contactId: isFocusedNavigationActive ? focusedContactId : null,
      search: filters.search || '',
      asesorIds: filters.asesorIds,
      estado: filters.estado,
      origen: filters.origen,
      estadoCobranza: filters.estadoCobranza || null,
      page: pagination.page,
      pageSize: pagination.pageSize,
      sortBy: portfolioSortBy,
    },
    viewMode === 'portfolio'
  );

  const sortedContacts = useMemo(() => {
    if (viewMode === 'portfolio') return [];
    if (contactsForView.length === 0) return [];

    const contactsWithContext = precomputeContactContexts(contactsForView, teamMembers, appointmentsByContactId);
    const sortBy = filters.sortBy || defaultSort;
    return sortContactsWithContext(contactsWithContext, sortBy);
  }, [appointmentsByContactId, contactsForView, defaultSort, filters.sortBy, teamMembers, viewMode]);

  // PERFORMANCE: Memoize display data transformation
  const displayContacts = useMemo<ContactDisplayData[]>(() => 
    sortedContacts.map(({ contact }) => toDisplayData(contact)),
    [sortedContacts]
  );

  const contextMap = useMemo(() => {
    const map = new Map<number, ContactContext>();
    sortedContacts.forEach(({ contact, context }) => {
      map.set(contact.id, context);
    });
    return map;
  }, [sortedContacts]);

  const handleRefreshCurrentView = useCallback(async () => {
    if (viewMode === 'portfolio') {
      await refreshPortfolio();
      return;
    }

    await refreshContacts();
  }, [refreshContacts, refreshPortfolio, viewMode]);

  const activePagination = viewMode === 'portfolio' ? portfolioPagination : pagination;
  const activePaginationLoading = viewMode === 'portfolio' ? isLoadingPortfolio : isLoading;
  const activePaginationLabel = viewMode === 'portfolio' ? 'caso' : 'contacto';

  // Group contacts by stage for Kanban
  const columns = useMemo(() => {
    const stagesMap = funnelStages.reduce((acc, stage) => {
      acc[stage.id] = { stage, contacts: [] };
      return acc;
    }, {} as Record<number, { stage: FunnelStage; contacts: Contact[] }>);

    const unassigned: Contact[] = [];

    contacts.forEach(contact => {
      if (contact.etapa_embudo && stagesMap[contact.etapa_embudo]) {
        stagesMap[contact.etapa_embudo].contacts.push(contact);
      } else {
        unassigned.push(contact);
      }
    });

    return { stagesMap, unassigned };
  }, [contacts, funnelStages]);

  // PERFORMANCE: Memoized Drag and Drop Handlers
  const handleDragStart = useCallback((e: React.DragEvent, contactId: number) => {
    setDraggedContactId(contactId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStageId: number) => {
    e.preventDefault();
    if (!draggedContactId) return;

    const contact = contacts.find(c => c.id === draggedContactId);
    if (contact && contact.etapa_embudo !== targetStageId) {
      const oldStageId = contact.etapa_embudo;
      
      // Get stage names and colors for toast
      const fromStage = funnelStages.find(s => s.id === oldStageId);
      const toStage = funnelStages.find(s => s.id === targetStageId);
      const fromStageIndex = funnelStages.findIndex(s => s.id === oldStageId);
      const toStageIndex = funnelStages.findIndex(s => s.id === targetStageId);
      
      const contactName = [contact.nombre, contact.apellido].filter(Boolean).join(' ') || 'Sin nombre';
      const fromStageName = fromStage?.nombre_etapa || 'Sin etapa';
      const toStageName = toStage?.nombre_etapa || 'Sin etapa';
      const fromStageColor = fromStage ? getStageColor(fromStage, fromStageIndex) : '#71717a';
      const toStageColor = toStage ? getStageColor(toStage, toStageIndex) : '#71717a';
      
      // Perform the move
      await updateContactStage(draggedContactId, targetStageId);
      
      // Show toast with undo option
      setStageMoveInfo({
        contactId: draggedContactId,
        contactName,
        fromStageName,
        toStageName,
        fromStageColor,
        toStageColor,
        onUndo: async () => {
          // Revert to original stage
          if (oldStageId !== null && oldStageId !== undefined) {
            await updateContactStage(contact.id, oldStageId);
          }
        }
      });
    }
    
    setDraggedContactId(null);
  }, [draggedContactId, contacts, funnelStages, updateContactStage]);
  
  // PERFORMANCE: Memoized contact click handler
  const handleContactClick = useCallback((contactId: number) => {
    selectContact(contactId);
  }, [selectContact]);

  const sectionTabs: { id: ViewMode; label: string; icon: React.ElementType; disabled?: boolean }[] = [
    { id: 'table', label: 'Lista', icon: List },
    { id: 'kanban', label: 'Funnel', icon: LayoutGrid, disabled: isFocusedNavigationActive },
    { id: 'portfolio', label: 'Cartera', icon: Wallet },
    { id: 'activity', label: 'Consultas', icon: MessageSquareReply, disabled: isFocusedNavigationActive },
  ];
  const activeSectionTab = sectionTabs.find((tab) => tab.id === viewMode) ?? sectionTabs[0];
  const ActiveSectionIcon = activeSectionTab.icon;

  const detailInitialTab = viewMode === 'portfolio' ? 'cartera' : undefined;

  return (
    <div className="h-full w-full flex flex-col bg-[#0c0c0e] pb-20 md:pb-0 overflow-hidden">
      <div className="shrink-0 border-b border-white/5">
        <div className="px-3 md:px-4 pt-3 md:pt-4 pb-3 overflow-visible">
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
            {viewMode !== 'activity' && (
              <div className="relative w-full min-w-0 sm:w-[240px] md:w-[300px] lg:w-[360px] xl:w-[420px] shrink-0">
                <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar contactos..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-8 md:pl-10 pr-8 md:pr-4 py-1.5 md:py-2 text-xs md:text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/50"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </button>
                )}
              </div>
            )}

            <div ref={sectionMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowSectionMenu((prev) => !prev)}
                className="inline-flex min-w-[148px] items-center justify-between gap-2 rounded-xl border border-primary-500/20 bg-zinc-950/80 px-3 py-2 text-xs font-medium text-primary-300 transition-colors hover:border-primary-500/30 hover:bg-white/[0.03]"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <ActiveSectionIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{activeSectionTab.label}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${showSectionMenu ? 'rotate-180' : ''}`} />
              </button>

              {showSectionMenu && (
                <div className="absolute left-0 top-full z-50 mt-2 w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#131316] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                  <div className="p-1">
                    {sectionTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = viewMode === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          disabled={tab.disabled}
                          onClick={() => {
                            if (tab.disabled) return;
                            handleSectionViewChange(tab.id);
                            setShowSectionMenu(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                            isActive
                              ? 'bg-primary-500/10 text-primary-300'
                              : 'text-zinc-200 hover:bg-white/[0.04]'
                          } ${tab.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          title={tab.disabled ? 'Disponible al salir del modo foco' : tab.label}
                        >
                          <div className={`rounded-lg p-1.5 ${isActive ? 'bg-primary-500/15 text-primary-300' : 'bg-black/20 text-zinc-500'}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{tab.label}</div>
                            <div className={`mt-0.5 text-[11px] ${isActive ? 'text-primary-300/70' : 'text-zinc-500'}`}>
                              {tab.disabled ? 'Disponible al salir del modo foco' : isActive ? 'Vista activa' : 'Cambiar a esta vista'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {viewMode !== 'activity' && (
              <>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`relative shrink-0 p-1.5 md:p-2 rounded-lg border transition-colors ${
                    showFilters 
                      ? 'bg-primary-500/20 border-primary-500/30 text-primary-400' 
                      : countActiveFilters(filters) > 0
                        ? 'bg-primary-500/10 border-primary-500/20 text-primary-400'
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Filtrar contactos"
                >
                  <Filter className="w-4 h-4" />
                  {countActiveFilters(filters) > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-primary-500 text-[9px] font-bold text-black">
                      {countActiveFilters(filters)}
                    </span>
                  )}
                </button>

                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowSortOptions(!showSortOptions)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 md:py-2 rounded-lg border transition-all ${
                      showSortOptions 
                        ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' 
                        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Ordenar contactos"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    <span className="text-[10px] md:text-xs font-medium hidden sm:inline">
                      {activeSortOptions.find(o => o.option === (filters.sortBy || defaultSort))?.label || 'Ordenar'}
                    </span>
                  </button>

                  {showSortOptions && (
                    <div className="absolute top-full right-0 mt-1 w-64 md:w-72 bg-[#131316] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-in-top">
                      <div className="p-2.5 md:p-3 border-b border-white/5 flex items-center justify-between">
                        <div className="text-[10px] md:text-xs font-medium text-zinc-400 uppercase tracking-wider">Ordenar por</div>
                        <button 
                          onClick={() => setShowSortOptions(false)}
                          className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-72 md:max-h-80 overflow-y-auto custom-scrollbar">
                        {activeSortOptions.map((option) => {
                          const isActive = (filters.sortBy || defaultSort) === option.option;
                          return (
                            <button
                              key={option.option}
                              onClick={() => {
                                setInteractiveFilters({ sortBy: option.option });
                                setShowSortOptions(false);
                              }}
                              className={`w-full flex items-center gap-2.5 md:gap-3 px-2.5 md:px-3 py-2 md:py-2.5 text-left hover:bg-white/5 transition-colors ${
                                isActive ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-300'
                              }`}
                            >
                              <div className={`p-1 md:p-1.5 rounded-lg ${isActive ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                                <span className="text-xs md:text-sm">{option.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] md:text-xs font-medium">{option.label}</div>
                                <div className="text-[9px] md:text-[10px] text-zinc-500 truncate">{option.description}</div>
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
                </div>

                <button
                  onClick={handleRefreshCurrentView}
                  disabled={activePaginationLoading}
                  className="shrink-0 p-1.5 md:p-2 bg-zinc-900 border border-white/10 rounded-lg text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
                  title="Actualizar contactos"
                >
                  <RefreshCw className={`w-4 h-4 ${activePaginationLoading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={() => {
                    setShowCreateModal(true);
                  }}
                  className="shrink-0 p-1.5 md:p-2 bg-primary-500/10 border border-primary-500/20 rounded-lg text-primary-400 hover:text-primary-300 hover:bg-primary-500/20 transition-all active:scale-95 shadow-[0_0_15px_rgba(var(--primary-500),0.1)]"
                  title="Nuevo contacto"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {viewMode !== 'activity' && (showFilters || countActiveFilters(filters) > 0 || isFocusedNavigationActive) && (
          <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-3">
            <ContactsFilter
              show={showFilters}
              filters={filters}
              setFilters={setInteractiveFilters}
              resetFilters={resetInteractiveFilters}
              teamMembers={teamMembers}
              funnelStages={funnelStages}
              origenOptions={origenOptions}
              viewMode={viewMode}
            />

            {isFocusedNavigationActive && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-500/20 bg-primary-500/8 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-primary-400/80">Modo foco</div>
                  <div className="truncate text-xs md:text-sm text-zinc-200">
                    Mostrando solo a <span className="text-primary-300 font-medium">{focusedContactDisplayLabel}</span>
                  </div>
                </div>
                <button
                  onClick={clearFocusedContactNavigation}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] md:text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                  Salir foco
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content Area */}
      <Suspense fallback={<ViewLoading />}>
        {viewMode === 'table' ? (
          <FunnelTableView 
            isLoading={isLoading || isFocusedContactLoading}
            contacts={contactsForView}
            displayContacts={displayContacts}
            contextMap={contextMap}
            funnelStages={funnelStages}
            userRoleId={userContext?.roleId || null}
            error={error}
            refreshContacts={refreshContacts}
            handleContactClick={handleContactClick}
            isBasicRole={isBasicRole}
            searchFilter={filters.search || ''}
          />
        ) : viewMode === 'portfolio' ? (
          <PortfolioListView
            isLoading={isFocusedContactLoading || isLoadingPortfolio}
            items={portfolioItems}
            summary={portfolioSummary}
            funnelStages={funnelStages}
            userRoleId={userContext?.roleId || null}
            error={portfolioError}
            refreshContacts={handleRefreshCurrentView}
            handleContactClick={handleContactClick}
            isBasicRole={isBasicRole}
            searchFilter={filters.search || ''}
          />
        ) : viewMode === 'activity' ? (
          <ActivityView embedded />
        ) : (
          <FunnelKanbanView 
            funnelStages={funnelStages}
            stageCounts={stageCounts}
            columns={columns}
            draggedContactId={draggedContactId}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            handleContactClick={handleContactClick}
            onLoadStageContacts={fetchContactsByStage}
          />
        )}
      </Suspense>

      {/* Kanban Stats Footer */}
      {viewMode === 'kanban' && !isFocusedNavigationActive && (
        <div className="shrink-0 px-4 py-2 border-t border-white/5 flex items-center justify-between bg-zinc-900/30">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] md:text-xs text-zinc-400">
              Mostrando <span className="text-zinc-200 font-medium">{contacts.length}</span>
              {pagination.totalCount > contacts.length && (
                <> de <span className="text-zinc-200 font-medium">{pagination.totalCount}</span></>
              )} contactos en {funnelStages.length} etapas
            </span>
          </div>
          {pagination.totalCount > contacts.length && (
            <button
              onClick={() => fetchContacts(true, PIPELINE_PAGE_SIZE)}
              className="text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
            >
              Cargar más
            </button>
          )}
        </div>
      )}

      {/* Pagination Footer (Table View Only) */}
      {(viewMode === 'table' || viewMode === 'portfolio') && !isFocusedNavigationActive && activePagination.totalPages > 1 && (
        <div className="shrink-0 p-2.5 md:p-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] md:text-xs text-zinc-500">
            {activePagination.totalCount} {activePaginationLabel}{activePagination.totalCount !== 1 ? 's' : ''}
          </span>
          
          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              onClick={() => setInteractivePage(activePagination.page - 1)}
              disabled={activePagination.page <= 1 || activePaginationLoading}
              className="p-1 md:p-1.5 bg-zinc-900 border border-white/10 rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="text-[10px] md:text-xs text-zinc-400 min-w-[50px] md:min-w-[60px] text-center">
              {activePagination.page} / {activePagination.totalPages}
            </span>
            
            <button
              onClick={() => setInteractivePage(activePagination.page + 1)}
              disabled={activePagination.page >= activePagination.totalPages || activePaginationLoading}
              className="p-1 md:p-1.5 bg-zinc-900 border border-white/10 rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Contact Detail Modal */}
      {selectedContactId && (
        <ErrorBoundary componentName="ContactDetailModal">
          <ContactDetailModal 
            contactId={selectedContactId} 
            onClose={() => selectContact(null)} 
            initialTab={detailInitialTab}
          />
        </ErrorBoundary>
      )}

      {/* Modal de Crear Contacto */}
      {showCreateModal && (
        <CreateContactModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(contactId) => {
            selectContact(contactId);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Stage Move Toast */}
      <StageMoveToast
        moveInfo={stageMoveInfo}
        onDismiss={() => setStageMoveInfo(null)}
        duration={5000}
      />
    </div>
  );
};
