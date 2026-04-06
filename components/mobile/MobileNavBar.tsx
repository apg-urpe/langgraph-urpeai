'use client';

import React from 'react';
import {
  Users,
  MessageSquareText,
  CheckSquare,
  LayoutDashboard,
  MoreHorizontal
} from 'lucide-react';
import { useAdminStore, AdminView, selectActiveView, selectIsAdminPanelOpen, selectIsMobileMenuOpen } from '../../store/adminStore';
import { useContactStore, selectUserContext } from '../../store/contactStore';

interface NavItem {
  id: AdminView;
  icon: React.ElementType;
  label: string;
  hideForRole3?: boolean;
}

// 4 secciones principales + botón "Más"
const navItems: NavItem[] = [
  { id: 'chat-inbox', icon: MessageSquareText, label: 'Inbox' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Métricas', hideForRole3: true },
  { id: 'contacts', icon: Users, label: 'Contactos' },
  { id: 'tasks', icon: CheckSquare, label: 'Tareas' },
];

export const MobileNavBar: React.FC = () => {
  const activeView = useAdminStore(selectActiveView);
  const isAdminPanelOpen = useAdminStore(selectIsAdminPanelOpen);
  const setActiveView = useAdminStore(state => state.setActiveView);
  const openMobileMenu = useAdminStore(state => state.openMobileMenu);
  const isMobileMenuOpen = useAdminStore(selectIsMobileMenuOpen);
  const selectContact = useContactStore(state => state.selectContact);
  const userContext = useContactStore(selectUserContext);
  
  const isBasicRole = userContext?.roleId === 3;

  const handleNavClick = (id: AdminView) => {
    selectContact(null);
    setActiveView(id);
  };

  const getIsActive = (id: AdminView) => {
    return activeView === id && isAdminPanelOpen;
  };
  
  // Filtrar items según el rol
  const visibleItems = navItems.filter(item => !(item.hideForRole3 && isBasicRole));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Gradient fade above - más suave */}
      <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/60 to-transparent pointer-events-none" />
      
      {/* Glass effect bar */}
      <div className="bg-[#0c0c0e]/95 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-4px_30px_rgba(0,0,0,0.3)]">
        <div 
          className="flex items-center justify-around h-14 px-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = getIsActive(item.id);

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`
                  relative flex items-center justify-center p-2 rounded-full
                  transition-all duration-300 active:scale-75
                  ${isActive
                    ? 'text-primary-400'
                    : 'text-zinc-600 hover:text-zinc-500'
                  }
                `}
              >
                <Icon
                  className={`w-6 h-6 transition-all duration-300 ${isActive ? 'scale-110' : 'scale-100'}`}
                  strokeWidth={isActive ? 2 : 1.5}
                />
              </button>
            );
          })}
          {/* Botón "Más" - abre MobileMoreMenu */}
          <button
            onClick={openMobileMenu}
            className={`
              relative flex items-center justify-center p-2 rounded-full
              transition-all duration-300 active:scale-75
              ${isMobileMenuOpen
                ? 'text-primary-400'
                : 'text-zinc-600 hover:text-zinc-500'
              }
            `}
          >
            <MoreHorizontal
              className={`w-6 h-6 transition-all duration-300 ${isMobileMenuOpen ? 'scale-110' : 'scale-100'}`}
              strokeWidth={isMobileMenuOpen ? 2 : 1.5}
            />
          </button>
        </div>
      </div>
    </nav>
  );
};
