'use client';

import React, { useState, useEffect, startTransition } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Mail,
  CheckSquare,
  Settings,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  UsersRound,
  UserCircle,
  Flame,
  Activity,
  Sparkles,
  FlaskConical,
  Zap,
  Bot,
  Wand2,
  BookMarked,
  GraduationCap,
  Megaphone,
  MessageSquareText,
  PenTool
} from 'lucide-react';
import { useGamificationStore, selectGamificationProfile, selectViewingMemberId } from '../../store/gamificationStore';
import { useContactStore, selectUserContext } from '../../store/contactStore';
import { getLevelFromXP } from '../../types/gamification';
import { useAdminStore, AdminView, selectActiveView, selectIsAdminPanelOpen, selectIsMaximized } from '../../store/adminStore';

interface NavItem {
  id: AdminView;
  icon: React.ElementType;
  label: string;
  badge?: number;
  isLab?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION ITEMS - Fácil de mover items entre arrays
// ═══════════════════════════════════════════════════════════════════

// Items principales de navegación
const navItems: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'contacts', icon: Users, label: 'Contactos' },
  { id: 'chat-inbox', icon: MessageSquareText, label: 'Conversaciones' },
  { id: 'calendar', icon: Calendar, label: 'Calendario' },
  { id: 'tasks', icon: CheckSquare, label: 'Tareas' },
  { id: 'marketing', icon: Megaphone, label: 'Marketing' },
];

// Items experimentales del Lab - Mover aquí para probar features
const labItems: NavItem[] = [
  { id: 'academy', icon: GraduationCap, label: 'Academia', isLab: true },
  { id: 'emails', icon: Mail, label: 'Mi Email IA', isLab: true },
  { id: 'research', icon: Sparkles, label: 'Deep Research', isLab: true },
  { id: 'artifacts', icon: BookMarked, label: 'Artefactos', isLab: true },
  { id: 'redaccion', icon: PenTool, label: 'Redacción', isLab: true },
  { id: 'observability', icon: Activity, label: 'Observabilidad', isLab: true },
];

export const AdminNavBar: React.FC = () => {
  const activeView = useAdminStore(selectActiveView);
  const isAdminPanelOpen = useAdminStore(selectIsAdminPanelOpen);
  const isMaximized = useAdminStore(selectIsMaximized);
  const setActiveView = useAdminStore(state => state.setActiveView);
  const toggleAdminPanel = useAdminStore(state => state.toggleAdminPanel);
  const toggleMaximized = useAdminStore(state => state.toggleMaximized);
  const closeAdminPanel = useAdminStore(state => state.closeAdminPanel);
  const setMaximized = useAdminStore(state => state.setMaximized);
  
  // Gamification state
  const profile = useGamificationStore(selectGamificationProfile);
  const userContext = useContactStore(selectUserContext);
  const fetchUserContext = useContactStore(state => state.fetchUserContext);
  const fetchProfile = useGamificationStore(state => state.fetchProfile);
  const viewingMemberId = useGamificationStore(selectViewingMemberId);
  
  // Fetch user context on mount - Protected against race conditions in contactStore
  // Multiple components can safely call this - only the first call will execute
  React.useEffect(() => {
    if (!userContext) {
      fetchUserContext();
    }
  }, [userContext, fetchUserContext]);
  
  // Fetch gamification profile on mount - siempre fetch fresco cuando userContext cambie
  // No depender de profile porque podría ser null o datos viejos
  React.useEffect(() => {
    if (userContext?.id && userContext.id !== viewingMemberId) {
      fetchProfile(userContext.id);
    }
  }, [userContext?.id, viewingMemberId, fetchProfile]);
  
  const levelInfo = profile ? getLevelFromXP(profile.totalXP) : null;
  
  // Lab submenu state
  const [isLabOpen, setIsLabOpen] = useState(false);
  
  // Check if user has access to Lab (Admins/Leaders)
  const hasLabAccess = userContext?.roleId === 1 || userContext?.roleId === 2;
  const isLoadingContext = !userContext;
  
  // Check if user is basic role (rol 3) - restricted access
  const isBasicRole = userContext?.roleId === 3;

  // Close lab menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setIsLabOpen(false);
    if (isLabOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isLabOpen]);
  
  // Check if any lab item is active
  const isLabItemActive = labItems.some(item => item.id === activeView && isAdminPanelOpen);
  
  const normalizedActiveView: AdminView = activeView === 'transcripciones'
    ? 'calendar'
    : activeView === 'funnel' || activeView === 'activity' || activeView === 'portfolio'
      ? 'contacts'
      : activeView;

  // Handler for navigation items (3-state toggle)
  // PERFORMANCE: Wrapped in startTransition to prevent blocking main thread (INP fix)
  const handleNavClick = (viewId: AdminView) => {
    if (normalizedActiveView === viewId && isAdminPanelOpen) {
      // If clicking current section while open: Split -> Full -> Close
      if (!isMaximized) {
        startTransition(() => setMaximized(true));
      } else {
        startTransition(() => closeAdminPanel());
      }
    } else if (!isAdminPanelOpen) {
      // If panel is closed: Always open with the selected view
      startTransition(() => setActiveView(viewId));
    } else {
      // If clicking different section while panel is open: Just navigate
      startTransition(() => setActiveView(viewId));
    }
  };

  // Toggle maximize state (for the dedicated button)
  const handleToggleMaximize = () => {
    startTransition(() => toggleMaximized());
  };

  return (
    <div className="h-full w-14 md:w-12 bg-[#0a0a0c] border-r border-white/5 flex flex-col items-center py-3 md:py-4 shrink-0">
      
      {/* Logo */}
      <div className="w-9 h-9 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-600/10 border border-primary-500/20 flex items-center justify-center mb-4 md:mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src="https://vecspltvmyopwbjzerow.supabase.co/storage/v1/object/public/chat-uploads/imag_confi/unnamed%20(1).webp" 
          alt="Urpe" 
          className="w-5 h-5 object-contain opacity-80"
        />
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col items-center gap-0.5 md:gap-1 w-full px-1.5">
        
        {navItems
          .filter(item => {
            // Hide Dashboard for role 3
            if (item.id === 'dashboard' && isBasicRole) return false;
            // Marketing only visible for roles 1 and 2
            if (item.id === 'marketing' && userContext?.roleId !== 1 && userContext?.roleId !== 2) return false;
            return true;
          })
          .map((item) => {
          const Icon = item.icon;
          const isActive = normalizedActiveView === item.id && isAdminPanelOpen;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`
                relative w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center
                transition-all duration-200 group active:scale-95
                ${isActive 
                  ? 'bg-primary-500/20 text-primary-400 shadow-lg shadow-primary-500/10' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }
              `}
              title={item.label}
            >
              <Icon className="w-4.5 h-4.5 md:w-4 md:h-4" />
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary-400 rounded-r-full" />
              )}
              
              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 border border-white/10 rounded-md text-xs text-zinc-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                {item.label}
              </div>
              
              {/* Badge */}
              {item.badge && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        
        {/* Spacer to push Lab to bottom */}
        <div className="flex-1" />
        
        {/* Separator before Lab */}
        <div className="w-6 h-px bg-white/5 my-1" />
        
        {/* Lab Button with Submenu - Al final del nav */}
        {isLoadingContext ? (
          <div className="w-10 h-10 md:w-9 md:h-9 rounded-lg bg-white/5 animate-pulse mb-1" />
        ) : hasLabAccess && (
          <div className="relative w-full flex justify-center mb-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLabOpen(!isLabOpen);
              }}
              className={`
                relative w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center
                transition-all duration-200 group active:scale-95
                ${isLabOpen || isLabItemActive
                  ? 'bg-violet-500/20 text-violet-400 shadow-lg shadow-violet-500/10' 
                  : 'text-zinc-500 hover:text-violet-300 hover:bg-violet-500/10'
                }
              `}
              title="Lab"
            >
              <FlaskConical className="w-4.5 h-4.5 md:w-4 md:h-4" />
              
              {/* Lab indicator dot */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-violet-500 rounded-full border border-[#0a0a0c]" />
              
              {/* Active indicator */}
              {isLabItemActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-violet-400 rounded-r-full" />
              )}
              
              {/* Tooltip (only when submenu closed) */}
              {!isLabOpen && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 border border-violet-500/20 rounded-md text-xs text-violet-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  Lab
                </div>
              )}
            </button>
            
            {/* Lab Submenu */}
            {isLabOpen && (
              <div 
                className="absolute left-full ml-2 top-0 bg-zinc-900/95 backdrop-blur-sm border border-violet-500/20 rounded-lg p-1.5 z-50 min-w-[140px] shadow-xl shadow-violet-500/5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5 px-2 py-1 mb-1 border-b border-violet-500/10">
                  <FlaskConical className="w-3 h-3 text-violet-400" />
                  <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">Lab</span>
                </div>
                {labItems.filter(item => {
                  if (item.id === 'observability') return userContext?.roleId === 1;
                  return true;
                }).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id && isAdminPanelOpen;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleNavClick(item.id);
                        setIsLabOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs
                        transition-all duration-150
                        ${isActive 
                          ? 'bg-violet-500/20 text-violet-300' 
                          : 'text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10'
                        }
                      `}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-1 md:gap-2 pt-3 md:pt-4 border-t border-white/5 w-full px-1.5">
        {/* Team - Hidden for role 3 */}
        {!isBasicRole && (
          <button
            onClick={() => handleNavClick('team')}
            className={`
              w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95
              ${normalizedActiveView === 'team' && isAdminPanelOpen
                ? 'bg-primary-500/20 text-primary-400' 
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
              }
            `}
            title="Equipo"
          >
            <UsersRound className="w-4 h-4" />
          </button>
        )}
        
        {/* Settings */}
        <button
          onClick={() => startTransition(() => setActiveView('settings'))}
          className={`
            w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95
            ${normalizedActiveView === 'settings' && isAdminPanelOpen
              ? 'bg-primary-500/20 text-primary-400' 
              : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
            }
          `}
          title="Configuración"
        >
          <Settings className="w-4 h-4" />
        </button>
        
        {/* Maximize/Minimize Panel - Desktop only */}
        <button
          onClick={handleToggleMaximize}
          className={`
            w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95
            ${isMaximized 
              ? 'bg-primary-500/20 text-primary-400' 
              : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
            }
          `}
          title={isMaximized ? 'Cerrar panel completo' : 'Expandir panel completo'}
        >
          {isMaximized ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
        
        {/* Toggle Panel (only when not maximized) */}
        {!isMaximized && (
          <button
            onClick={() => startTransition(() => toggleAdminPanel())}
            className={`
              w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95
              ${isAdminPanelOpen 
                ? 'bg-zinc-800 text-zinc-300' 
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
              }
            `}
            title={isAdminPanelOpen ? 'Cerrar Panel' : 'Abrir Panel'}
          >
            {isAdminPanelOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      
    </div>
  );
};
