'use client';


import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, List, LayoutGrid, MapPin, Sparkles } from 'lucide-react';
import { CalendarEvent, BlockAction } from '../types/chat';
import { BlockActions } from './BlockActions';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';

interface CalendarBlockProps {
  title: string;
  initialView?: 'month' | 'week' | 'day';
  initialDate?: string;
  events: CalendarEvent[];
  actions?: BlockAction[];
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

type ViewMode = 'grid' | 'list';

export const CalendarBlock: React.FC<CalendarBlockProps> = ({ 
  title, 
  initialView, 
  initialDate, 
  events = [], 
  actions,
  onInteract,
  disabled = false
}) => {
  const { language } = useLanguageStore();
  const t = translations[language].chat;
  // 1. SMART VIEW LOGIC: Determine best view based on data density
  const defaultMode: ViewMode = useMemo(() => {
    // If backend explicitly asks for week/day, prefer list
    if (initialView === 'week' || initialView === 'day') return 'list';
    if (initialView === 'month') return 'grid';

    // Auto-detection logic
    if (events.length === 0) return 'grid';
    if (events.length < 5) return 'list'; // Few events -> List is cleaner
    
    // Check date spread
    const sorted = [...events].sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const first = new Date(sorted[0].start).getTime();
    const last = new Date(sorted[sorted.length-1].start).getTime();
    const diffDays = (last - first) / (1000 * 3600 * 24);
    
    // If events are compressed in less than 2 weeks, show list. Otherwise grid.
    return diffDays < 14 ? 'list' : 'grid';
  }, [initialView, events]);

  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);
  const [currentDate, setCurrentDate] = useState(initialDate ? new Date(initialDate) : new Date());

  // Helper: Get color styles
  const getCategoryStyles = (category?: string) => {
    switch (category) {
      case 'meeting': return { border: 'border-primary-500', bg: 'bg-primary-500/10', text: 'text-primary-300', dot: 'bg-primary-500' };
      case 'deadline': return { border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-300', dot: 'bg-rose-500' };
      case 'holiday': return { border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-500' };
      case 'reminder': return { border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-300', dot: 'bg-amber-500' };
      default: return { border: 'border-zinc-600', bg: 'bg-zinc-800', text: 'text-zinc-300', dot: 'bg-zinc-500' };
    }
  };

  const navigate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (viewMode === 'grid') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      // In list mode, jump by event groups if possible, or just a week
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(newDate);
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (onInteract) {
      onInteract({
        type: 'BLOCK_ACTION',
        actionId: 'view_event_details',
        label: 'View Event',
        payload: { eventId: event.id, eventTitle: event.title }
      });
    }
  };

  // --- RENDERER: GRID (MONTH) ---
  const renderGridView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];
    // Padding
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<div key={`pad-${i}`} className="min-h-[80px] bg-zinc-950/20 border-r border-b border-zinc-800/30"></div>);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.start.startsWith(dateStr));
      const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();

      days.push(
        <div key={d} className={`min-h-[80px] p-2 border-r border-b border-zinc-800/30 relative group transition-colors ${isToday ? 'bg-primary-500/5' : 'hover:bg-zinc-900/40'}`}>
          <div className="flex justify-between items-start mb-1">
             <span className={`text-xs font-mono font-bold ${isToday ? 'text-primary-400' : 'text-zinc-600'}`}>
              {d}
            </span>
            {dayEvents.length > 0 && (
               <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 md:hidden"></div>
            )}
          </div>
          
          <div className="space-y-1 hidden md:block">
            {dayEvents.slice(0, 3).map((ev) => {
               const styles = getCategoryStyles(ev.category);
               return (
                <button 
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                  className={`w-full text-left truncate px-1.5 py-0.5 rounded text-[9px] font-medium border-l-2 ${styles.border} ${styles.bg} ${styles.text} hover:opacity-80`}
                >
                  {ev.title}
                </button>
               );
            })}
             {dayEvents.length > 3 && (
              <span className="text-[9px] text-zinc-600 pl-1 block">+ {dayEvents.length - 3} more</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="border-t border-l border-zinc-800/30 rounded-tl-lg">
        <div className="grid grid-cols-7 border-b border-zinc-800/30">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2 text-center text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900/30 border-r border-zinc-800/30">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 bg-zinc-950/10">
          {days}
        </div>
      </div>
    );
  };

  // --- RENDERER: LIST (TIMELINE) ---
  const renderListView = () => {
    // 1. Sort all events
    const sortedEvents = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    
    if (sortedEvents.length === 0) {
       return (
         <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
            <CalendarIcon className="w-8 h-8 mb-2 opacity-20" />
            <span className="text-xs">No upcoming events found.</span>
         </div>
       );
    }

    // 2. Group by Date
    const grouped: Record<string, CalendarEvent[]> = {};
    sortedEvents.forEach(ev => {
       const d = new Date(ev.start);
       const key = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
       if (!grouped[key]) grouped[key] = [];
       grouped[key].push(ev);
    });

    return (
      <div className="relative pl-2 py-2 space-y-8">
         {/* Vertical Timeline Line */}
         <div className="absolute top-2 bottom-2 left-[19px] w-px bg-zinc-800/50"></div>

         {Object.entries(grouped).map(([dateLabel, dayEvents], idx) => (
            <div key={idx} className="relative z-10 animate-fade-in-up" style={{ animationDelay: `${idx * 0.1}s` }}>
               {/* Date Header */}
               <div className="flex items-center gap-4 mb-3">
                  <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 z-10 shadow-sm">
                     {dayEvents[0] && new Date(dayEvents[0].start).getDate()}
                  </div>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-950/50 px-2 rounded">{dateLabel}</span>
               </div>

               {/* Events for this day */}
               <div className="pl-[3.25rem] space-y-3">
                  {dayEvents.map(ev => {
                     const styles = getCategoryStyles(ev.category);
                     const startDate = new Date(ev.start);
                     const endDate = ev.end ? new Date(ev.end) : null;
                     
                     return (
                        <div 
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className="group relative bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-3 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all cursor-pointer overflow-hidden"
                        >
                           <div className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bg} group-hover:${styles.dot} transition-colors`}></div>
                           
                           <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                 <h4 className="text-sm font-semibold text-zinc-200 group-hover:text-white truncate">{ev.title}</h4>
                                 <div className="flex items-center gap-3 mt-1.5">
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                                       <Clock className="w-3 h-3" />
                                       <span>
                                          {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          {endDate && ` - ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                                       </span>
                                    </div>
                                    {ev.description && (
                                       <div className="flex items-center gap-1.5 text-xs text-zinc-500 truncate max-w-[150px]">
                                          <MapPin className="w-3 h-3" />
                                          <span className="truncate">{ev.description}</span>
                                       </div>
                                    )}
                                 </div>
                              </div>
                              
                              <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wide border ${styles.border} ${styles.bg} ${styles.text}`}>
                                 {ev.category || 'Event'}
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>
            </div>
         ))}
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-zinc-950/60 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col backdrop-blur-md shadow-sm">
      
      {/* Header */}
      <div className="px-5 py-4 bg-zinc-900/40 border-b border-zinc-800/50 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-primary-500/10 text-primary-400' : 'bg-zinc-800/50 text-zinc-400'}`}>
               <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
               <h3 className="text-sm font-bold text-zinc-200 leading-none">{title}</h3>
               {viewMode === 'grid' && (
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide mt-1 block">
                     {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
               )}
               {viewMode === 'list' && (
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide mt-1 block">
                     {events.length} Upcoming Events
                  </span>
               )}
            </div>
         </div>

         <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
               <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title="Grid View"
               >
                  <LayoutGrid className="w-3.5 h-3.5" />
               </button>
               <button 
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title="Timeline View"
               >
                  <List className="w-3.5 h-3.5" />
               </button>
            </div>
            
            {/* Navigation (Only relevant for Grid mainly) */}
            {viewMode === 'grid' && (
               <div className="flex items-center gap-0.5 ml-2">
                  <button onClick={() => navigate('prev')} className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 rounded transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => navigate('next')} className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 rounded transition-colors"><ChevronRight className="w-4 h-4" /></button>
               </div>
            )}
         </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 p-0 relative min-h-[300px]">
         {viewMode === 'grid' ? renderGridView() : (
            <div className="p-5">
               {renderListView()}
            </div>
         )}
      </div>

      {/* Actions Footer */}
      {actions && actions.length > 0 && (
         <div className="px-5 py-3 bg-zinc-900/30 border-t border-zinc-800/50">
            <BlockActions actions={actions} onInteract={onInteract} disabled={disabled} />
         </div>
      )}
    </div>
  );
};

