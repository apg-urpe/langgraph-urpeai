'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Filter, CheckCheck, CheckCircle2, Loader2, Search, RefreshCw, User, AlertTriangle, Calendar, ChevronDown } from 'lucide-react';
import { useNotificationsStore, selectNotifications, selectIsLoading, selectStats } from '../../store/notificationsStore';
import { NotificationItem } from './NotificationItem';
import { NotificationType } from '../../types/notification';

// Type filter options
const TYPE_FILTER_OPTIONS: { value: NotificationType | 'all'; label: string; icon?: React.ReactNode }[] = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'human_in_the_loop', label: 'HITL', icon: <User className="w-3 h-3 text-amber-400" /> },
  { value: 'mensaje_urgente', label: 'Urgente', icon: <AlertTriangle className="w-3 h-3 text-red-400" /> },
  { value: 'nueva_cita', label: 'Citas', icon: <Calendar className="w-3 h-3 text-blue-400" /> },
  { value: 'tarea_asignada', label: 'Tareas', icon: <CheckCircle2 className="w-3 h-3 text-purple-400" /> },
];

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ 
  isOpen, 
  onClose
}) => {
  const notifications = useNotificationsStore(selectNotifications);
  const isLoading = useNotificationsStore(selectIsLoading);
  const stats = useNotificationsStore(selectStats);
  const fetchNotifications = useNotificationsStore(state => state.fetchNotifications);
  const fetchMore = useNotificationsStore(state => state.fetchMore);
  const hasMore = useNotificationsStore(state => state.hasMore);
  const isLoadingMore = useNotificationsStore(state => state.isLoadingMore);
  const markAllAsRead = useNotificationsStore(state => state.markAllAsRead);
  const setFilters = useNotificationsStore(state => state.setFilters);
  const resetFilters = useNotificationsStore(state => state.resetFilters);

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'requires_response'>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications(true);
      markAllAsRead();
    }
  }, [isOpen, fetchNotifications, markAllAsRead]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add small delay to prevent immediate close on button click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleFilterChange = (filter: typeof activeFilter) => {
    setActiveFilter(filter);
    
    // Build filters object combining status and type
    const newFilters: any = {};
    
    if (filter === 'unread') {
      newFilters.visto = false;
    } else if (filter === 'requires_response') {
      newFilters.requiere_respuesta = true;
      newFilters.visto = false;
    }
    
    // Add type filter if set
    if (typeFilter !== 'all') {
      newFilters.tipo = typeFilter;
    }
    
    if (Object.keys(newFilters).length === 0) {
      resetFilters();
    } else {
      setFilters(newFilters);
    }
  };

  const handleTypeFilterChange = (type: NotificationType | 'all') => {
    setTypeFilter(type);
    setShowTypeDropdown(false);
    
    // Rebuild filters with new type
    const newFilters: any = {};
    
    if (activeFilter === 'unread') {
      newFilters.visto = false;
    } else if (activeFilter === 'requires_response') {
      newFilters.requiere_respuesta = true;
      newFilters.visto = false;
    }
    
    if (type !== 'all') {
      newFilters.tipo = type;
    }
    
    if (Object.keys(newFilters).length === 0) {
      resetFilters();
    } else {
      setFilters(newFilters);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (confirm('¿Marcar todas las notificaciones como leídas?')) {
      await markAllAsRead();
    }
  };

  if (!isOpen) return null;

  // Use Portal to render outside current DOM hierarchy (solves z-index issues)
  const content = (
    <>
      {/* Backdrop - Mobile only */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] md:hidden"
        onClick={onClose}
      />

      {/* Dropdown Panel */}
      <div 
        ref={dropdownRef}
        className={`
        fixed md:absolute z-[100]
        inset-0 md:inset-auto
        md:top-full md:right-0 md:mt-2
        w-full md:w-96
        bg-[#0a0a0c] border border-white/10
        md:rounded-xl md:shadow-[0_20px_60px_rgba(0,0,0,0.45)]
        flex flex-col
        pb-20 md:pb-0
        max-h-screen md:max-h-[600px]
      `}>
        {/* Header */}
        <div className="p-3 border-b border-white/10 shrink-0">
          {/* Top row: Title and close */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-zinc-100">
              Centro de Actividad
            </h3>
            <div className="flex items-center gap-2">
              {stats.unread > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-primary-400 transition-colors"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar notificaciones..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-colors"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Filter tabs + Type selector */}
          <div className="flex gap-2 items-center">
            <button
              onClick={() => handleFilterChange('all')}
              className={`
                px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                ${activeFilter === 'all'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-300 border border-white/10'
                }
              `}
            >
              Todas
            </button>
            <button
              onClick={() => handleFilterChange('unread')}
              className={`
                px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                ${activeFilter === 'unread'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-300 border border-white/10'
                }
              `}
            >
              No leídas ({stats.unread})
            </button>
            <button
              onClick={() => handleFilterChange('requires_response')}
              className={`
                px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                ${activeFilter === 'requires_response'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-300 border border-white/10'
                }
              `}
            >
              Requieren respuesta ({stats.requiresResponse})
            </button>

            {/* Type filter dropdown */}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                className={`
                  flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                  ${typeFilter !== 'all'
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-white/5 text-zinc-400 hover:text-zinc-300 border border-white/10'
                  }
                `}
              >
                <Filter className="w-3 h-3" />
                {TYPE_FILTER_OPTIONS.find(o => o.value === typeFilter)?.label || 'Tipo'}
                <ChevronDown className={`w-3 h-3 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showTypeDropdown && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                  {TYPE_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleTypeFilterChange(option.value)}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors
                        ${typeFilter === option.value
                          ? 'bg-primary-500/20 text-primary-400'
                          : 'text-zinc-300 hover:bg-white/5'
                        }
                      `}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center mb-3">
                <Filter className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-sm font-medium text-zinc-400 mb-1">
                No hay notificaciones
              </p>
              <p className="text-xs text-zinc-500">
                {activeFilter === 'all' 
                  ? 'No tienes notificaciones en este momento'
                  : activeFilter === 'unread'
                  ? 'No tienes notificaciones sin leer'
                  : 'No hay notificaciones que requieran respuesta'
                }
              </p>
            </div>
          ) : (
            <>
              {notifications
                .filter((notification) => {
                  if (!searchQuery.trim()) return true;
                  const query = searchQuery.toLowerCase();
                  const contactName = notification.contact 
                    ? `${notification.contact.nombre || ''} ${notification.contact.apellido || ''}`.toLowerCase()
                    : '';
                  const message = notification.mensaje.toLowerCase();
                  const type = notification.tipo.toLowerCase();
                  return contactName.includes(query) || message.includes(query) || type.includes(query);
                })
                .map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="pt-2 pb-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchMore();
                    }}
                    disabled={isLoadingMore}
                    className="w-full py-2.5 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-all text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Cargando...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Cargar más notificaciones</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return createPortal(content, document.body);
  }

  return content;
};
