'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  History, 
  LayoutDashboard, 
  LogOut,
  User,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Flame,
  BookMarked,
  UsersRound,
  FlaskConical,
  Settings,
  Activity,
  Mail
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAdminStore, selectIsAdminPanelOpen, AdminView } from '../store/adminStore';
import { useContactStore, selectUserContext } from '../store/contactStore';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { useMonicaRolesStore, useActiveMonicaRole } from '../store/monicaRolesStore';
import { useGamificationStore, selectGamificationProfile } from '../store/gamificationStore';
import { translations } from '../lib/i18n';
import { RoleSelector, RoleEditorModal } from './chat';

interface ChatHeaderProps {
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenArtifactLibrary?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onNewChat, onOpenHistory, onOpenArtifactLibrary }) => {
  const { language, setLanguage } = useLanguageStore();
  const t = translations[language].chat;
  const tSidebar = translations[language].sidebar;
  
  // Auth
  const { signOut, user } = useAuthStore();
  
  // Admin Panel state - to hide history button when chat sidebar is visible
  const isAdminPanelOpen = useAdminStore(selectIsAdminPanelOpen);
  
  // Admin actions from store
  const setActiveViewAdmin = useAdminStore(state => state.setActiveView);
  const openAdminPanel = useAdminStore(state => state.openAdminPanel);
  
  // Monica Roles
  const activeRole = useActiveMonicaRole();
  
  // Gamification
  const profile = useGamificationStore(selectGamificationProfile);
  
  // User Context for role-based access
  const userContext = useContactStore(selectUserContext);
  const hasLabAccess = userContext?.roleId === 1 || userContext?.roleId === 2;
  const isAdmin = userContext?.roleId === 1;
  const isBasicRole = userContext?.roleId === 3;
  
  // Local State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRoleEditorOpen, setIsRoleEditorOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userAvatar, setUserAvatar] = useState('');
  
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Generate avatar on mount
  useEffect(() => {
    const seed = Math.random().toString(36).substring(2, 10);
    const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=transparent&size=64`;
    setUserAvatar(avatarUrl);
    if (typeof window !== 'undefined') {
      (window as any).__urpeAvatarUrl = avatarUrl;
    }
  }, []);


  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    if (confirm(tSidebar.disconnect_confirm)) {
      signOut();
    }
  };

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-30 h-10 flex-shrink-0 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-sm flex items-center justify-between px-4 safe-top transition-all duration-300">
        
        {/* LEFT: New Chat */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* New Chat Button */}
          <button 
            onClick={onNewChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 hover:border-primary-500/30 text-primary-400 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline text-xs font-semibold">{tSidebar.new_analysis}</span>
          </button>
        </div>

        {/* RIGHT: Actions - Desktop (Large Screens) */}
        <div className="hidden lg:flex items-center gap-1 md:gap-2">
          
          {/* Streak Indicator - Gamification */}
          {profile?.streak?.isActive ? (
            <button 
              onClick={() => {
                setActiveViewAdmin('profile');
                openAdminPanel();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30 transition-all active:scale-95 group"
              title="Mi Racha - Ver Perfil"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-orange-300">{profile.streak.currentStreak}</span>
            </button>
          ) : null}
          
          {/* Artifacts Library Button - Solo icono */}
          {onOpenArtifactLibrary ? null : null}
          
          {/* History Button - Only show when admin panel is open (sidebar hidden) */}
          {isAdminPanelOpen ? (
            <button 
              onClick={onOpenHistory}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all active:scale-95"
              title={tSidebar.active_sessions}
            >
              <History className="w-4 h-4" />
              <span className="text-xs font-medium">{tSidebar.active_sessions}</span>
            </button>
          ) : null}

          {/* User Profile */}
          <div className="relative" ref={profileRef}>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-all"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center overflow-hidden border border-white/10 shadow-lg">
                {userAvatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                )}
              </div>
              <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile Popup */}
            {isProfileOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-[#0a0a0c] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-pop-in backdrop-blur-2xl z-50">
                {/* User Info */}
                <div className="p-3 border-b border-white/5">
                  <p className="text-xs font-medium text-zinc-200 truncate">{user?.email}</p>
                  <span className="text-[10px] text-zinc-600">Pro Plan</span>
                </div>

                {/* Role Selector oculto por ahora */}

                {/* Menu */}
                <div className="p-2 space-y-1 border-b border-white/5">
                  {/* Mis Artefactos */}
                  <button
                    onClick={() => {
                      onOpenArtifactLibrary?.();
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <BookMarked className="w-4 h-4" />
                    <span className="text-xs font-medium">Mis Artefactos</span>
                  </button>

                  {/* Mi Perfil */}
                  <button
                    onClick={() => {
                      setActiveViewAdmin('profile');
                      openAdminPanel();
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="text-xs font-medium">Mi Perfil</span>
                  </button>
                  
                  {/* Gestionar Agentes oculto */}
                </div>

                {/* Logout */}
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-medium">{tSidebar.sign_out}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Actions - Mobile/Tablet (Hamburger Menu) */}
        <div className="flex lg:hidden items-center gap-1" ref={mobileMenuRef}>
          {/* Streak Indicator - Gamification */}
          {profile?.streak?.isActive && (
            <div className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/20">
              <Flame className="w-3 h-3 text-orange-400" />
              <span className="text-[10px] font-medium text-orange-300">{profile.streak.currentStreak}</span>
            </div>
          )}
          
          {/* History - always visible on mobile (sidebar only shows on desktop) */}
          <button 
            onClick={onOpenHistory}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all active:scale-95"
            title={tSidebar.active_sessions}
          >
            <History className="w-4 h-4" />
          </button>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`p-2 rounded-lg transition-all ${
              isMobileMenuOpen 
                ? 'bg-white/10 text-zinc-200' 
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div className="absolute top-full right-3 mt-2 w-56 bg-[#0a0a0c] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-pop-in backdrop-blur-2xl z-50">
              {/* User Info */}
              <div className="p-3 border-b border-white/5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center overflow-hidden border border-white/10">
                  {userAvatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-zinc-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{user?.email}</p>
                  <span className="text-[10px] text-zinc-600">Pro Plan</span>
                </div>
              </div>

              {/* Role Selector mobile oculto por ahora */}

              {/* Navegación Principal */}
              <div className="p-2 space-y-1 border-b border-white/5">
                {/* Dashboard - Hidden for role 3 */}
                {!isBasicRole && (
                  <button 
                    onClick={() => {
                      setActiveViewAdmin('dashboard');
                      openAdminPanel();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="text-xs font-medium">Dashboard</span>
                  </button>
                )}
                
                {/* Equipo - Hidden for role 3 */}
                {!isBasicRole && (
                  <button 
                    onClick={() => {
                      setActiveViewAdmin('team');
                      openAdminPanel();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                  >
                    <UsersRound className="w-4 h-4" />
                    <span className="text-xs font-medium">Equipo</span>
                  </button>
                )}
                
                {/* Configuración */}
                <button 
                  onClick={() => {
                    setActiveViewAdmin('settings');
                    openAdminPanel();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-xs font-medium">Configuración</span>
                </button>
              </div>
              
              {/* Lab Section - Solo para roles 1 y 2 */}
              {hasLabAccess && (
                <div className="p-2 space-y-1 border-b border-white/5">
                  <div className="flex items-center gap-2 px-3 py-1">
                    <FlaskConical className="w-3 h-3 text-violet-400" />
                    <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Lab</span>
                  </div>
                  
                  {/* Email Marketing */}
                  <button 
                    onClick={() => {
                      setActiveViewAdmin('email-marketing');
                      openAdminPanel();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10"
                  >
                    <Mail className="w-4 h-4" />
                    <span className="text-xs font-medium">Email Marketing</span>
                  </button>
                  
                  {/* Deep Research */}
                  <button 
                    onClick={() => {
                      setActiveViewAdmin('research');
                      openAdminPanel();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs font-medium">Deep Research</span>
                  </button>
                  
                  {/* Artefactos */}
                  <button 
                    onClick={() => {
                      setActiveViewAdmin('artifacts');
                      openAdminPanel();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10"
                  >
                    <BookMarked className="w-4 h-4" />
                    <span className="text-xs font-medium">Artefactos</span>
                  </button>
                  
                  {/* Observabilidad - Solo Admin */}
                  {isAdmin && (
                    <button 
                      onClick={() => {
                        setActiveViewAdmin('observability');
                        openAdminPanel();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10"
                    >
                      <Activity className="w-4 h-4" />
                      <span className="text-xs font-medium">Observabilidad</span>
                    </button>
                  )}
                </div>
              )}

              {/* Menu Items - Usuario */}
              <div className="p-2 space-y-1">
                {/* Mi Perfil */}
                <button 
                  onClick={() => {
                    setActiveViewAdmin('profile');
                    openAdminPanel();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                >
                  <User className="w-4 h-4" />
                  <span className="text-xs font-medium">Mi Perfil</span>
                </button>
                
                {/* Gestionar Agentes oculto */}
              </div>

              {/* Logout */}
              <div className="p-2 border-t border-white/5">
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-medium">{tSidebar.sign_out}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Role Editor Modal */}
      <RoleEditorModal 
        isOpen={isRoleEditorOpen} 
        onClose={() => setIsRoleEditorOpen(false)}
        editingRole={activeRole}
      />
      
    </>
  );
};
