'use client';

import React from 'react';
import {
  UsersRound,
  Settings,
  User,
  LogOut,
  Mail,
  Sparkles,
  BookMarked,
  Activity,
  Flame,
  ChevronRight,
  FlaskConical,
  Bell,
  Calendar
} from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useAdminStore, AdminView, selectActiveView, selectIsMobileMenuOpen } from '../../store/adminStore';
import { useContactStore, selectUserContext } from '../../store/contactStore';
import { useGamificationStore, selectGamificationProfile } from '../../store/gamificationStore';
import { useAuthStore } from '../../store/authStore';

interface MenuItem {
  id: AdminView | 'logout';
  icon: React.ElementType;
  label: string;
  description?: string;
  roles?: number[];
  variant?: 'default' | 'danger';
  badge?: React.ReactNode;
}

interface MenuSection {
  id: string;
  title?: string;
  items: MenuItem[];
  layout: 'list' | 'grid';
}

export const MobileMoreMenu: React.FC = () => {
  const isOpen = useAdminStore(selectIsMobileMenuOpen);
  const activeView = useAdminStore(selectActiveView);
  const setActiveView = useAdminStore(state => state.setActiveView);
  const closeMobileMenu = useAdminStore(state => state.closeMobileMenu);
  const selectContact = useContactStore(state => state.selectContact);
  
  const userContext = useContactStore(selectUserContext);
  const profile = useGamificationStore(selectGamificationProfile);
  const signOut = useAuthStore(state => state.signOut);

  const handleNavigation = (id: AdminView | 'logout') => {
    if (id === 'logout') {
      if (confirm('¿Cerrar sesión?')) {
        signOut();
      }
      return;
    }
    
    selectContact(null);
    setActiveView(id);
    closeMobileMenu();
  };

  const hasLabAccess = userContext?.roleId === 1 || userContext?.roleId === 2;
  const isAdmin = userContext?.roleId === 1;

  // Menu sections configuration
  const menuSections: MenuSection[] = [
    {
      id: 'core',
      items: [
        { id: 'calendar', icon: Calendar, label: 'Citas', description: 'Agenda y citas programadas' },
        { id: 'activity', icon: Bell, label: 'Actividad', description: 'HITL y notificaciones del equipo' },
        { id: 'team', icon: UsersRound, label: 'Equipo', description: 'Miembros del equipo' },
        { id: 'settings', icon: Settings, label: 'Configuración', description: 'Ajustes de la app' },
      ],
      layout: 'list'
    },
    ...(hasLabAccess ? [{
      id: 'lab',
      title: 'Laboratorio',
      items: [
        { id: 'email-marketing' as AdminView, icon: Mail, label: 'Marketing', roles: [1, 2] },
        { id: 'emails' as AdminView, icon: Mail, label: 'Mi Email IA', roles: [1, 2] },
        { id: 'research' as AdminView, icon: Sparkles, label: 'Research', roles: [1, 2] },
        { id: 'artifacts' as AdminView, icon: BookMarked, label: 'Artefactos', roles: [1, 2] },
        ...(isAdmin ? [{ id: 'observability' as AdminView, icon: Activity, label: 'Observ.', roles: [1] }] : []),
      ],
      layout: 'grid' as const
    }] : []),
    {
      id: 'profile',
      items: [
        { 
          id: 'profile' as AdminView, 
          icon: User, 
          label: userContext?.nombre ? `${userContext.nombre} ${userContext.apellido?.charAt(0) || ''}.` : 'Mi Perfil',
          badge: profile?.streak?.isActive ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400">
              <Flame className="w-3 h-3" />
              <span className="text-[10px] font-medium">{profile.streak.currentStreak}</span>
            </div>
          ) : null
        },
        { id: 'logout', icon: LogOut, label: 'Cerrar Sesión', variant: 'danger' },
      ],
      layout: 'list'
    }
  ];

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={closeMobileMenu}
      showHandle={true}
      showCloseButton={false}
    >
      <div className="px-4 py-2 space-y-4 pb-6">
        {menuSections.map((section) => (
          <div key={section.id}>
            {/* Section Header */}
            {section.title && (
              <div className="flex items-center gap-2 px-1 py-2 mb-2">
                <FlaskConical className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">
                  {section.title}
                </span>
                <div className="flex-1 h-px bg-violet-500/20" />
              </div>
            )}
            
            {/* Section Items */}
            {section.layout === 'list' ? (
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id !== 'logout' && activeView === item.id;
                  const isDanger = item.variant === 'danger';
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigation(item.id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-3 rounded-xl
                        transition-all duration-200 active:scale-[0.98]
                        ${isActive 
                          ? 'bg-primary-500/15 text-primary-400' 
                          : isDanger
                            ? 'text-rose-400 hover:bg-rose-500/10'
                            : 'text-zinc-300 hover:bg-white/5'
                        }
                      `}
                    >
                      <div className={`
                        p-2 rounded-lg
                        ${isActive 
                          ? 'bg-primary-500/20' 
                          : isDanger
                            ? 'bg-rose-500/10'
                            : 'bg-white/5'
                        }
                      `}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.description && (
                          <div className="text-[10px] text-zinc-500">{item.description}</div>
                        )}
                      </div>
                      {item.badge}
                      {!isDanger && !item.badge && (
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigation(item.id as AdminView)}
                      className={`
                        flex flex-col items-center gap-2 p-3 rounded-xl
                        transition-all duration-200 active:scale-[0.98]
                        ${isActive 
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' 
                          : 'bg-white/5 text-zinc-400 hover:bg-violet-500/10 hover:text-violet-300 border border-transparent'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </MobileBottomSheet>
  );
};
