'use client';

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Plus, GripHorizontal, ChevronsLeft, ChevronsRight, Download, Loader2 } from 'lucide-react';
import { FunnelStage, Contact } from '../../../types/contact';
import { getStageColor, getStageIcon } from './funnel-shared';
import { FunnelContactCard } from './FunnelContactCard';

const BATCH_SIZE = 8;
const COLLAPSED_STAGES_KEY = 'urpe_kanban_collapsed_stages';

// Scrollable card list with infinite scroll + click to load
interface ScrollableCardListProps {
  stageId: number;
  contacts: Contact[];
  visibleCount: number;
  totalInDb: number; // Total contacts in DB for this stage (from stageCounts)
  stageColor: string;
  draggedContactId: number | null;
  onLoadMore: (stageId: number) => void;
  onLoadFromDb?: (stageId: number) => void; // Load contacts from DB when stage is empty
  onDragStart: (e: React.DragEvent, contactId: number) => void;
  onClick: (contactId: number) => void;
}

const ScrollableCardList: React.FC<ScrollableCardListProps> = ({
  stageId,
  contacts,
  visibleCount,
  totalInDb,
  stageColor,
  draggedContactId,
  onLoadMore,
  onLoadFromDb,
  onDragStart,
  onClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const totalCount = contacts.length;
  const visibleContacts = contacts.slice(0, visibleCount);
  const hasMore = visibleCount < totalCount;
  const remainingCount = totalCount - visibleCount;
  
  // Debounce ref to prevent multiple rapid loads
  const isLoadingRef = useRef(false);

  // Handle scroll to load more (with debounce)
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !hasMore || isLoadingRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when scrolled to 90% of the container
    if (scrollTop + clientHeight >= scrollHeight - 30) {
      isLoadingRef.current = true;
      onLoadMore(stageId);
      // Reset after a short delay
      setTimeout(() => { isLoadingRef.current = false; }, 200);
    }
  }, [stageId, hasMore, onLoadMore]);
  
  // Click handler for load more button (pagination within loaded contacts)
  const handleLoadMoreClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoadingRef.current) {
      isLoadingRef.current = true;
      setIsLocalLoading(true);
      try {
        await onLoadMore(stageId);
      } finally {
        setTimeout(() => {
          isLoadingRef.current = false;
          setIsLocalLoading(false);
        }, 300);
      }
    }
  }, [stageId, onLoadMore]);
  
  // Click handler for loading contacts from DB when stage is empty
  const handleLoadFromDbClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoadingRef.current && onLoadFromDb) {
      isLoadingRef.current = true;
      setIsLocalLoading(true);
      try {
        await onLoadFromDb(stageId);
      } finally {
        setTimeout(() => {
          isLoadingRef.current = false;
          setIsLocalLoading(false);
        }, 500);
      }
    }
  }, [stageId, onLoadFromDb]);

  // No contacts loaded locally
  if (totalCount === 0) {
    // But there ARE contacts in DB - show load button
    if (totalInDb > 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-6">
          <button
            onClick={handleLoadFromDbClick}
            className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl 
                       bg-zinc-800/50 hover:bg-zinc-700/50 border border-white/5 hover:border-white/10
                       text-zinc-400 hover:text-zinc-300 transition-all duration-150 group"
          >
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center border-2 border-dashed group-hover:border-solid transition-all"
              style={{ borderColor: `${stageColor}50` }}
            >
              {isLocalLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: stageColor }} />
              ) : (
                <Download className="w-5 h-5 group-hover:scale-110 transition-transform" style={{ color: stageColor }} />
              )}
            </div>
            <span className="text-[10px] font-medium">
              {isLocalLoading ? 'Cargando...' : `Cargar ${totalInDb} contacto${totalInDb > 1 ? 's' : ''}`}
            </span>
          </button>
        </div>
      );
    }
    
    // No contacts at all - empty state
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-6 text-zinc-600">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5 border-2 border-dashed"
          style={{ borderColor: `${stageColor}30` }}
        >
          <Plus className="w-4 h-4" style={{ color: `${stageColor}50` }} />
        </div>
        <span className="text-[10px]">Sin contactos</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 custom-scrollbar"
      onScroll={handleScroll}
    >
      {visibleContacts.map(contact => (
        <FunnelContactCard
          key={contact.id}
          contact={contact}
          isDragging={draggedContactId === contact.id}
          stageColor={stageColor}
          onDragStart={onDragStart}
          onClick={onClick}
        />
      ))}
      {/* Load more button - local pagination (show more already-loaded contacts) */}
      {hasMore && (
        <button
          onClick={handleLoadMoreClick}
          disabled={isLocalLoading}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg 
                     bg-zinc-800/50 hover:bg-zinc-700/50 border border-white/5 hover:border-white/10
                     text-zinc-400 hover:text-zinc-300 transition-all duration-150 group disabled:opacity-50"
        >
          {isLocalLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          )}
          <span className="text-[10px] font-medium">
            {isLocalLoading ? 'Cargando...' : `Cargar ${Math.min(remainingCount, BATCH_SIZE)} más`}
          </span>
          {!isLocalLoading && <span className="text-[9px] text-zinc-500">({visibleCount}/{totalCount})</span>}
        </button>
      )}
      {/* Load more from DB - when all local contacts are shown but DB has more */}
      {!hasMore && totalCount > 0 && totalCount < totalInDb && onLoadFromDb && (
        <button
          onClick={handleLoadFromDbClick}
          disabled={isLocalLoading}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg 
                     bg-zinc-800/50 hover:bg-zinc-700/50 border border-dashed border-white/10 hover:border-white/20
                     text-zinc-400 hover:text-zinc-300 transition-all duration-150 group disabled:opacity-50"
        >
          {isLocalLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: stageColor }} />
          ) : (
            <Download className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" style={{ color: stageColor }} />
          )}
          <span className="text-[10px] font-medium">
            {isLocalLoading ? 'Cargando...' : `Cargar ${totalInDb - totalCount} más del servidor`}
          </span>
          {!isLocalLoading && <span className="text-[9px] text-zinc-500">({totalCount}/{totalInDb})</span>}
        </button>
      )}
    </div>
  );
};

interface FunnelKanbanViewProps {
  funnelStages: FunnelStage[];
  stageCounts: Record<number, number>; // Total contacts per stage from DB
  columns: {
    stagesMap: Record<number, { stage: FunnelStage; contacts: Contact[] }>;
    unassigned: Contact[];
  };
  draggedContactId: number | null;
  handleDragStart: (e: React.DragEvent, contactId: number) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetStageId: number) => void;
  handleContactClick: (contactId: number) => void;
  onLoadStageContacts?: (stageId: number, limit?: number) => Promise<void>; // Load contacts for a specific stage
}

export const FunnelKanbanView = memo<FunnelKanbanViewProps>(({
  funnelStages,
  stageCounts,
  columns,
  draggedContactId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleContactClick,
  onLoadStageContacts
}) => {
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  
  // Collapsed stages state (persisted in localStorage)
  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(COLLAPSED_STAGES_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Toggle collapse state for a stage
  const toggleCollapse = useCallback((stageId: number) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      // Persist to localStorage
      try {
        localStorage.setItem(COLLAPSED_STAGES_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);
  
  // Pagination state per column (stageId -> visible count)
  const [visibleCounts, setVisibleCounts] = useState<Record<number, number>>({});
  
  // Initialize visible counts for new stages
  useEffect(() => {
    const newCounts: Record<number, number> = {};
    funnelStages.forEach(stage => {
      if (visibleCounts[stage.id] === undefined) {
        newCounts[stage.id] = BATCH_SIZE;
      }
    });
    // Also for unassigned (-1)
    if (visibleCounts[-1] === undefined) {
      newCounts[-1] = BATCH_SIZE;
    }
    if (Object.keys(newCounts).length > 0) {
      setVisibleCounts(prev => ({ ...prev, ...newCounts }));
    }
  }, [funnelStages, visibleCounts]);
  
  // Load more contacts for a specific stage
  const loadMore = useCallback((stageId: number) => {
    setVisibleCounts(prev => ({
      ...prev,
      [stageId]: (prev[stageId] || BATCH_SIZE) + BATCH_SIZE
    }));
  }, []);
  
  // Drag-to-scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrollDragging, setIsScrollDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleColumnDragOver = (e: React.DragEvent, stageId: number) => {
    e.preventDefault();
    handleDragOver(e);
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleColumnDragLeave = () => {
    setDragOverStageId(null);
  };

  const handleColumnDrop = (e: React.DragEvent, stageId: number) => {
    handleDrop(e, stageId);
    setDragOverStageId(null);
  };

  // Drag-to-scroll handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Only start drag if clicking on the container background, not on cards
    if ((e.target as HTMLElement).closest('[draggable="true"]')) return;
    
    setIsScrollDragging(true);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeft(container.scrollLeft);
    container.style.cursor = 'grabbing';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isScrollDragging) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5; // Scroll speed multiplier
    container.scrollLeft = scrollLeft - walk;
  }, [isScrollDragging, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    setIsScrollDragging(false);
    const container = scrollContainerRef.current;
    if (container) {
      container.style.cursor = 'grab';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isScrollDragging) {
      setIsScrollDragging(false);
      const container = scrollContainerRef.current;
      if (container) {
        container.style.cursor = 'grab';
      }
    }
  }, [isScrollDragging]);

  return (
    <div className="flex-1 min-h-0 h-full overflow-hidden relative">
      {/* Drag hint indicator - shows when not dragging */}
      {!isScrollDragging && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/80 backdrop-blur-sm border border-white/10 rounded-full text-[10px] text-zinc-500 pointer-events-none opacity-60">
          <GripHorizontal className="w-3 h-3" />
          <span>Arrastra para desplazar</span>
        </div>
      )}
      
      <div 
        ref={scrollContainerRef}
        className={`
          h-full w-full overflow-x-auto overflow-y-hidden custom-scrollbar select-none
          transition-all duration-150
          ${isScrollDragging 
            ? 'cursor-grabbing bg-white/[0.01] ring-1 ring-inset ring-primary-500/20' 
            : 'cursor-grab hover:bg-white/[0.005]'
          }
        `}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="h-full p-3 flex gap-3" style={{ minWidth: 'max-content' }}>
        
        {/* Render Columns */}
        {funnelStages.map((stage, stageIndex) => {
          const columnData = columns.stagesMap[stage.id];
          const stageContacts = columnData?.contacts || [];
          const stageColor = getStageColor(stage, stageIndex);
          const stageIcon = getStageIcon(stage);
          const isDropTarget = dragOverStageId === stage.id;
          const isCollapsed = collapsedStages.has(stage.id);
          
          // Collapsed column: narrow, vertical name
          if (isCollapsed) {
            return (
              <div 
                key={stage.id}
                className={`
                  shrink-0 w-12 flex flex-col h-full items-center
                  rounded-xl border backdrop-blur-sm cursor-pointer
                  transition-all duration-200 ease-out group
                  ${isDropTarget 
                    ? 'border-white/20 bg-white/[0.04] shadow-lg shadow-black/20' 
                    : 'border-white/[0.06] bg-[#111113]/80 hover:border-white/10 hover:bg-[#111113]'
                  }
                `}
                onClick={() => toggleCollapse(stage.id)}
                onDragOver={(e) => handleColumnDragOver(e, stage.id)}
                onDragLeave={handleColumnDragLeave}
                onDrop={(e) => handleColumnDrop(e, stage.id)}
                title={`${stage.nombre_etapa} (${stageContacts.length}) - Click para expandir`}
              >
                {/* Color bar at top */}
                <div 
                  className="w-full h-1.5 rounded-t-xl shrink-0"
                  style={{ backgroundColor: stageColor }}
                />
                
                {/* Count badge - shows total from DB */}
                <div 
                  className="mt-3 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: `${stageColor}20`, color: stageColor }}
                >
                  {stageCounts[stage.id] ?? stageContacts.length}
                </div>
                
                {/* Vertical stage name */}
                <div className="flex-1 flex items-center justify-center py-3 min-h-0">
                  <span 
                    className="font-medium text-[10px] tracking-wider whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity"
                    style={{ 
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      transform: 'rotate(180deg)',
                      color: stageColor,
                      maxHeight: '150px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {stage.nombre_etapa}
                  </span>
                </div>
                
                {/* Expand icon */}
                <div className="pb-3 text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  <ChevronsRight className="w-4 h-4" />
                </div>
              </div>
            );
          }
          
          // Expanded column: normal view
          return (
            <div 
              key={stage.id}
              className={`
                shrink-0 w-[260px] lg:w-[280px] flex flex-col h-full
                rounded-xl border backdrop-blur-sm
                transition-all duration-200 ease-out
                ${isDropTarget 
                  ? 'border-white/20 bg-white/[0.04] shadow-lg shadow-black/20' 
                  : 'border-white/[0.06] bg-[#111113]/80'
                }
              `}
              onDragOver={(e) => handleColumnDragOver(e, stage.id)}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => handleColumnDrop(e, stage.id)}
            >
              {/* Column Header - Square UI Style */}
              <div className="px-2.5 py-2 flex items-center justify-between shrink-0">
                <div 
                  className="flex items-center gap-2 rounded-full px-2.5 py-1"
                  style={{ backgroundColor: `${stageColor}15` }}
                >
                  {stageIcon ? (
                    <span className="text-xs">{stageIcon}</span>
                  ) : (
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: stageColor }}
                    />
                  )}
                  <h3 
                    className="font-medium text-[11px] tracking-wide truncate max-w-[120px]"
                    style={{ color: stageColor }}
                  >
                    {stage.nombre_etapa}
                  </h3>
                </div>
                
                <div className="flex items-center gap-1.5">
                  {/* Collapse button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(stage.id);
                    }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all"
                    title="Colapsar etapa"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  
                  {/* Count badge - shows total from DB */}
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium bg-[#1a1a1d] border border-white/[0.06] text-zinc-400"
                  >
                    {stageCounts[stage.id] ?? stageContacts.length}
                  </div>
                </div>
              </div>

              {/* Cards Container with scroll-to-load */}
              <ScrollableCardList
                stageId={stage.id}
                contacts={stageContacts}
                visibleCount={visibleCounts[stage.id] || BATCH_SIZE}
                totalInDb={stageCounts[stage.id] ?? stageContacts.length}
                stageColor={stageColor}
                draggedContactId={draggedContactId}
                onLoadMore={loadMore}
                onLoadFromDb={onLoadStageContacts ? (stageId) => onLoadStageContacts(stageId) : undefined}
                onDragStart={handleDragStart}
                onClick={handleContactClick}
              />
            </div>
          );
        })}

        {/* Unassigned Column */}
        {columns.unassigned.length > 0 && (
          <div 
            className="shrink-0 w-[260px] lg:w-[280px] flex flex-col h-full rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-900/20"
            onDragOver={(e) => handleColumnDragOver(e, -1)}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, -1)}
          >
            <div className="px-2.5 py-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 rounded-full px-2.5 py-1 bg-zinc-800/50">
                <div className="w-2 h-2 rounded-full bg-zinc-500/50" />
                <h3 className="font-medium text-[11px] tracking-wide text-zinc-500 italic">Sin etapa</h3>
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium bg-zinc-800/80 border border-zinc-700/50 text-zinc-500">
                {stageCounts[-1] ?? columns.unassigned.length}
              </div>
            </div>

            <ScrollableCardList
              stageId={-1}
              contacts={columns.unassigned}
              visibleCount={visibleCounts[-1] || BATCH_SIZE}
              totalInDb={stageCounts[-1] ?? columns.unassigned.length}
              stageColor="#71717a"
              draggedContactId={draggedContactId}
              onLoadMore={loadMore}
              onLoadFromDb={onLoadStageContacts ? (stageId) => onLoadStageContacts(stageId) : undefined}
              onDragStart={handleDragStart}
              onClick={handleContactClick}
            />
          </div>
        )}

        </div>
      </div>
    </div>
  );
});

FunnelKanbanView.displayName = 'FunnelKanbanView';
