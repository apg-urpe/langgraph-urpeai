'use client';


import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  History,
  X,
  LogOut,
  PanelLeftClose,
  Zap,
  Sun,
  Loader2,
  LayoutDashboard,
  BookMarked
} from 'lucide-react';
import { ChatSession } from '../types';
import { 
  useChatStore, 
  AppTheme,
  selectCurrentTheme,
  selectThemeIntensity,
  selectIsSidebarCollapsed
} from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  isOpen: boolean; // Mobile toggle
  onClose: () => void;
  onOpenArtifactSidebar?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({ 
  sessions, 
  activeSessionId, 
  onNewChat, 
  onSelectSession,
  onArchiveSession,
  isOpen,
  onClose,
  onOpenArtifactSidebar
}) => {
  // PERFORMANCE: Use atomic selectors to prevent re-renders
  const currentTheme = useChatStore(selectCurrentTheme);
  const themeIntensity = useChatStore(selectThemeIntensity);
  const isSidebarCollapsed = useChatStore(selectIsSidebarCollapsed);
  
  // Actions (stable references)
  const toggleSidebar = useChatStore(state => state.toggleSidebar);
  const setTheme = useChatStore(state => state.setTheme);
  const setThemeIntensity = useChatStore(state => state.setThemeIntensity);
  const { signOut, user } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const t = translations[language].sidebar;
  
  // Ambiance Menu State
  const [isAmbianceOpen, setIsAmbianceOpen] = useState(false);
  const ambianceRef = useRef<HTMLDivElement>(null);
  
  // Dynamic Avatar - generates a new minimalist avatar each session
  const [userAvatar, setUserAvatar] = useState('');

  useEffect(() => {
    // Generate new avatar on every page load/refresh
    const seed = Math.random().toString(36).substring(2, 10);
    const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=transparent&size=64`;
    setUserAvatar(avatarUrl);
    
    // Store in a global variable so ChatArea can access the same avatar during this session
    if (typeof window !== 'undefined') {
      (window as any).__urpeAvatarUrl = avatarUrl;
    }
  }, []);

  // Close Ambiance menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ambianceRef.current && !ambianceRef.current.contains(event.target as Node)) {
        setIsAmbianceOpen(false);
      }
    };
    if (isAmbianceOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAmbianceOpen]);

  const handleLogout = () => {
    if (confirm(t.disconnect_confirm)) {
      signOut();
    }
  };

  // Updated colors to match NEW ThemeManager hex codes visually
  const themes: { id: AppTheme; color: string; label: string }[] = [
    { id: 'glacier', color: 'bg-[#00FFFF]', label: 'Glacier' },   // Cyan
    { id: 'nebula', color: 'bg-[#9333ea]', label: 'Nebula' },    // Purple
    { id: 'matrix', color: 'bg-[#4ade80]', label: 'Matrix' },    // Green
    { id: 'ember', color: 'bg-[#f97316]', label: 'Ember' },      // Orange
    { id: 'midnight', color: 'bg-[#ffffff]', label: 'Midnight' }, // White
  ];

  const sidebarInner = (
    <div className="flex flex-col h-full bg-[#050505]/90 backdrop-blur-2xl border-r border-white/5 relative z-20 transition-all duration-500">
      
      {/* 1. Header Area - Minimalist */}
      <div className="p-5 pt-6 flex items-center justify-between group/header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-800 to-black border border-white/10 flex items-center justify-center relative overflow-hidden shadow-lg">
             <div className="absolute inset-0 bg-primary-500/20 mix-blend-overlay"></div>
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img 
              src="https://vecspltvmyopwbjzerow.supabase.co/storage/v1/object/public/chat-uploads/imag_confi/unnamed%20(1).webp" 
              alt="Urpe" 
              className="w-full h-full object-cover opacity-90 scale-110"
            />
          </div>
          
          <div className="flex flex-col">
            <h1 className="font-bold text-sm tracking-[0.2em] text-zinc-200 font-mono">
              URPE AI
            </h1>
            <span className="text-[9px] text-zinc-600 font-medium tracking-widest uppercase">Lab Interface</span>
          </div>
        </div>
        
        {/* Collapse / Close */}
        <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
            <button
               onClick={toggleSidebar}
               className="hidden md:flex p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-all"
               title="Collapse"
            >
               <PanelLeftClose className="w-4 h-4" />
            </button>
        </div>
         <button 
            onClick={onClose}
            className="md:hidden p-2 text-zinc-500 hover:text-zinc-200"
        >
            <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Primary Actions */}
      <div className="px-4 pb-2 space-y-2">
         {/* New Chat - Hero Button */}
         <button 
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-white/5 hover:border-white/10 shadow-sm transition-all duration-300 group active:scale-[0.98]"
        >
          <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center text-primary-400 group-hover:scale-110 transition-transform">
             <Plus className="w-4 h-4" />
          </div>
          <div className="flex flex-col items-start text-left">
             <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{t.new_analysis}</span>
             <span className="text-[10px] text-zinc-500">Start fresh session</span>
          </div>
        </button>

         {/* Dashboard Button */}
         <a 
          href="https://panel.urpeailab.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-white/5 hover:border-white/10 shadow-sm transition-all duration-300 group active:scale-[0.98]"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
             <LayoutDashboard className="w-4 h-4" />
          </div>
          <div className="flex flex-col items-start text-left">
             <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Dashboard</span>
             <span className="text-[10px] text-zinc-500">Panel de Control</span>
          </div>
        </a>

        {/* My Artifacts Button */}
        {onOpenArtifactSidebar && (
          <button 
            onClick={onOpenArtifactSidebar}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-white/5 hover:border-white/10 shadow-sm transition-all duration-300 group active:scale-[0.98]"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <BookMarked className="w-4 h-4" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Mis Artefactos</span>
              <span className="text-[10px] text-zinc-500">Documentos guardados</span>
            </div>
          </button>
        )}
        
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent mx-6 my-3"></div>

      {/* 3. Session List - Minimalist */}
      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        <div className="px-3 mb-2 flex items-center justify-between">
           <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{t.active_sessions}</span>
           <History className="w-3 h-3 text-zinc-700" />
        </div>
        
        <div className="space-y-0.5">
          {sessions.map((session) => {
            const isProcessing = session.isThinking || session.isStreaming;
            const isUnread = session.hasUnread && session.id !== activeSessionId;
            const isActive = session.id === activeSessionId;

            return (
              <div 
                key={session.id}
                className="relative group"
              >
                <button
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200 group/btn ${
                    isActive
                      ? 'bg-white/5 text-zinc-100 shadow-sm border border-white/5' 
                      : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  {/* Status / Loader Icon */}
                  <div className="relative shrink-0 flex items-center justify-center w-3.5 h-3.5">
                     {isProcessing ? (
                        <Loader2 className="w-3 h-3 text-primary-500 animate-spin" />
                     ) : (
                        <div className="relative w-2 h-2 rounded-full overflow-hidden flex items-center justify-center">
                            {isUnread ? (
                                <div className="absolute inset-0 bg-emerald-500"></div>
                             ) : isActive ? (
                                <div className="absolute inset-0 bg-primary-500"></div>
                             ) : (
                                <div className="absolute inset-0 bg-zinc-700 group-hover/btn:bg-zinc-500 transition-colors"></div>
                             )}
                        </div>
                     )}
                  </div>

                  <span className={`truncate text-xs flex-1 ${isActive ? 'font-medium' : 'font-normal'} ${isUnread ? 'font-bold text-white' : ''}`}>
                    {session.title}
                  </span>
                  
                  {/* Delete Action (Hover Only) - Archives internally */}
                  {onArchiveSession && !isProcessing && (
                     <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveSession(session.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                        title="Archivar sesión"
                     >
                        <Trash2 className="w-3.5 h-3.5" />
                     </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Footer - Cleaned up */}
      <div className="p-4 bg-black/20 backdrop-blur-md border-t border-white/5 flex flex-col gap-3 pb-safe-bottom">
         {/* User Profile Row */}
         <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
                 <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center overflow-hidden border border-white/10 shadow-lg ring-1 ring-white/5">
                   {userAvatar ? (
                     /* eslint-disable-next-line @next/next/no-img-element */
                     <img 
                       src={userAvatar} 
                       alt="Avatar" 
                       className="w-full h-full object-cover"
                     />
                   ) : (
                     <span className="text-xs font-bold text-zinc-400">
                       {user?.email ? user.email.substring(0, 2).toUpperCase() : 'AI'}
                     </span>
                   )}
                </div>
                 <div className="flex flex-col">
                    <span className="text-xs font-medium text-zinc-300 truncate max-w-[120px]">{user?.email?.split('@')[0]}</span>
                    <span className="text-[10px] text-zinc-600">Pro Plan</span>
                 </div>
             </div>
             
             {/* Log Out */}
             <button 
                onClick={handleLogout}
                className="p-2 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                title={t.sign_out}
             >
                <LogOut className="w-4 h-4" />
             </button>
         </div>
         
         {/* Tools Row: Lang & Theme */}
         <div className="flex items-center gap-2">
            {/* Language Switch */}
            <div className="flex-1 bg-zinc-900/50 rounded-lg p-1 flex items-center justify-between border border-white/5">
                <button 
                  onClick={() => setLanguage('en')} 
                  className={`flex-1 text-[10px] font-bold py-1 rounded transition-colors ${language === 'en' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  EN
                </button>
                <div className="w-px h-3 bg-zinc-800"></div>
                <button 
                  onClick={() => setLanguage('es')} 
                  className={`flex-1 text-[10px] font-bold py-1 rounded transition-colors ${language === 'es' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  ES
                </button>
            </div>

            {/* Ambiance Toggle */}
            <div className="relative" ref={ambianceRef}>
               <button 
                 onClick={() => setIsAmbianceOpen(!isAmbianceOpen)}
                 className={`p-1.5 rounded-lg border transition-all ${
                    isAmbianceOpen 
                    ? 'bg-primary-500/20 text-primary-400 border-primary-500/30' 
                    : 'bg-zinc-900/50 text-zinc-500 border-white/5 hover:text-zinc-300'
                 }`}
               >
                  <Zap className="w-4 h-4 fill-current" />
               </button>

               {/* Popup */}
               {isAmbianceOpen && (
                <div className="absolute bottom-full left-0 mb-3 w-56 bg-[#0a0a0c] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-4 animate-pop-in backdrop-blur-2xl ring-1 ring-white/5 z-50 origin-bottom-left">
                   <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-1">Ambiance</span>
                   </div>
                   <div className="grid grid-cols-5 gap-2 mb-4">
                     {themes.map(t => (
                        <button 
                          key={t.id}
                          onClick={() => setTheme(t.id)}
                          className={`w-full aspect-square rounded-full flex items-center justify-center transition-all ${
                            currentTheme === t.id 
                              ? `bg-white/10 ring-1 ring-white/50 scale-110` 
                              : 'hover:bg-white/5 hover:scale-105'
                          }`}
                        >
                           <div className={`w-3 h-3 rounded-full ${t.color} ${currentTheme === t.id ? 'shadow-[0_0_8px_currentColor]' : ''}`}></div>
                        </button>
                     ))}
                   </div>
                   <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                         <div className="flex items-center gap-1.5">
                            <Sun className="w-3 h-3" /> Intensity
                         </div>
                         <span>{themeIntensity}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={themeIntensity} 
                        onChange={(e) => setThemeIntensity(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:accent-primary-400"
                      />
                   </div>
                </div>
              )}
            </div>
         </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Sidebar Panel */}
      <aside 
        className={`
          fixed md:relative inset-y-0 left-0 z-50 h-full w-72 md:w-72 flex-shrink-0
          transition-transform duration-300 ease-in-out md:transform-none md:transition-none md:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {sidebarInner}
      </aside>
    </>
  );
});
Sidebar.displayName = 'Sidebar';

