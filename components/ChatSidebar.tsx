'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  History, 
  Trash2, 
  MessageSquare, 
  PenLine, 
  Pencil,
  Check,
  X,
  LogOut,
  User,
  ChevronDown,
  PanelLeftClose,
  Loader2,
  Pin
} from 'lucide-react';
import { ChatSession } from '../types';
import { useChatStore, selectGlobalInstructions } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';
import { SystemInstructionsModal } from './SystemInstructionsModal';

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  isOpen,
  onToggle
}) => {
  const { language } = useLanguageStore();
  const t = translations[language].sidebar;
  const tChat = translations[language].chat;
  
  // Auth
  const { signOut, user } = useAuthStore();
  
  // Global Instructions
  const globalInstructions = useChatStore(selectGlobalInstructions);
  const setGlobalInstructions = useChatStore(state => state.setGlobalInstructions);
  
  // Local State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [userAvatar, setUserAvatar] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  
  const profileRef = useRef<HTMLDivElement>(null);
  
  // Rename session
  const renameSession = useChatStore(state => state.renameSession);
  const toggleSessionPin = useChatStore(state => state.toggleSessionPin);

  // Generate avatar on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const globalAvatar = (window as any).__urpeAvatarUrl;
      if (globalAvatar) {
        setUserAvatar(globalAvatar);
      } else {
        const seed = Math.random().toString(36).substring(2, 10);
        const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=transparent&size=64`;
        setUserAvatar(avatarUrl);
      }
    }
  }, []);


  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (confirm(t.disconnect_confirm)) {
      signOut();
    }
  };


  const handleStartRename = (sessionId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditTitle(currentTitle || '');
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const handleConfirmRename = async () => {
    if (editingSessionId && editTitle.trim()) {
      await renameSession(editingSessionId, editTitle.trim());
    }
    setEditingSessionId(null);
    setEditTitle('');
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditTitle('');
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirm === sessionId) {
      onDeleteSession?.(sessionId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(sessionId);
      // Auto-reset after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  // Format date for session grouping
  const formatSessionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };

  const pinnedSessions = sessions.filter(session => session.isPinned);
  const regularSessions = sessions.filter(session => !session.isPinned);

  const renderSessionItem = (session: ChatSession) => {
    const isThinking = session.isThinking && !session.isStreaming;
    const isStreaming = session.isStreaming;
    const isProcessing = isThinking || isStreaming;
    const isActive = session.id === activeSessionId;
    const isUnread = session.hasUnread && !isActive;
    const isPinned = session.isPinned ?? false;

    return (
      <div
        key={session.id}
        onClick={() => onSelectSession(session.id)}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
          isProcessing
            ? 'bg-amber-500/5 border border-amber-500/20'
            : isActive
              ? 'bg-primary-500/10 border border-primary-500/20 text-zinc-100'
              : isUnread
                ? 'bg-emerald-500/5 border border-emerald-500/20'
                : isPinned
                  ? 'hover:bg-white/5 text-zinc-300 hover:text-zinc-100 border border-amber-500/10'
                  : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-200 border border-transparent'
        }`}
      >
        <div className="relative shrink-0 flex items-center justify-center w-4 h-4">
          {isProcessing ? (
            <Loader2 className={`w-3.5 h-3.5 animate-spin ${isThinking ? 'text-amber-400' : 'text-primary-400'}`} />
          ) : isUnread ? (
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
            </div>
          ) : isPinned ? (
            <Pin className={`w-3.5 h-3.5 ${isActive ? 'text-amber-300 fill-current' : 'text-amber-500'}`} />
          ) : (
            <MessageSquare className={`w-3.5 h-3.5 ${isActive ? 'text-primary-400' : 'text-zinc-500'}`} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {editingSessionId === session.id ? (
            <div className="flex items-center gap-1">
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename();
                  if (e.key === 'Escape') handleCancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 text-xs bg-white/5 border border-primary-500/30 rounded px-1.5 py-0.5 text-zinc-200 outline-none focus:border-primary-500/60"
                maxLength={60}
              />
              <button onClick={(e) => { e.stopPropagation(); handleConfirmRename(); }} className="p-0.5 text-emerald-400 hover:bg-emerald-500/10 rounded">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleCancelRename(); }} className="p-0.5 text-zinc-500 hover:bg-white/5 rounded">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <p className={`text-xs font-medium truncate ${isUnread ? 'text-white font-semibold' : ''}`}>
                  {session.title || 'Nueva conversación'}
                </p>
                {isPinned && (
                  <span className="shrink-0 text-[8px] px-1 py-0.5 rounded font-medium bg-amber-500/15 text-amber-300">
                    PIN
                  </span>
                )}
                {(isProcessing || isUnread) && (
                  <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded font-medium ${
                    isThinking 
                      ? 'bg-amber-500/20 text-amber-400'
                      : isStreaming
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {isThinking ? '💭' : isStreaming ? '✍️' : '●'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-600">{formatSessionDate(session.date)}</p>
            </>
          )}
        </div>

        {editingSessionId !== session.id && !isProcessing && (
          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSessionPin(session.id);
              }}
              className={`p-1 rounded transition-all ${
                isPinned
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                  : 'text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'
              }`}
              title={isPinned ? 'Desanclar' : 'Anclar'}
            >
              <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={(e) => handleStartRename(session.id, session.title, e)}
              className="p-1 rounded text-zinc-500 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
              title="Renombrar"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {onDeleteSession && (
              <button
                onClick={(e) => handleDeleteSession(session.id, e)}
                className={`p-1 rounded transition-all ${
                  deleteConfirm === session.id
                    ? 'bg-rose-500/20 text-rose-400 opacity-100'
                    : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                }`}
                title={deleteConfirm === session.id ? 'Click para confirmar' : 'Eliminar'}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-3 top-3 z-40 p-2 rounded-lg bg-black/40 border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-all backdrop-blur-sm"
        title="Abrir historial"
      >
        <History className="w-4 h-4" />
      </button>
    );
  }

  return (
    <>
      <aside className="h-full w-64 bg-[#050505]/95 backdrop-blur-xl border-r border-white/5 flex flex-col relative z-20 shrink-0 animate-slide-in-right">
        
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-800 to-black border border-white/10 flex items-center justify-center relative overflow-hidden shadow-lg">
              <div className="absolute inset-0 bg-primary-500/20 mix-blend-overlay"></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="https://vecspltvmyopwbjzerow.supabase.co/storage/v1/object/public/chat-uploads/imag_confi/unnamed%20(1).webp" 
                alt="Urpe" 
                className="w-full h-full object-cover opacity-90 scale-110"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="font-bold text-xs tracking-[0.15em] text-zinc-200 font-mono">MONICA</h1>
              <span className="text-[9px] text-zinc-600 font-medium tracking-wider uppercase">Chat History</span>
            </div>
          </div>
          
          <button
            onClick={onToggle}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-all"
            title="Cerrar sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 hover:border-primary-500/30 text-primary-400 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span className="text-xs font-semibold">{t.new_analysis}</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <div className="space-y-1">
            {pinnedSessions.length > 0 && (
              <div className="px-2 pt-2 pb-1">
                <p className="text-[9px] font-semibold tracking-[0.18em] uppercase text-amber-400/80">
                  Anclados
                </p>
              </div>
            )}
            {pinnedSessions.map(renderSessionItem)}
            {pinnedSessions.length > 0 && regularSessions.length > 0 && (
              <div className="px-2 pt-3 pb-1">
                <p className="text-[9px] font-semibold tracking-[0.18em] uppercase text-zinc-500">
                  Recientes
                </p>
              </div>
            )}
            {regularSessions.map(renderSessionItem)}

            {sessions.length === 0 && (
              <div className="text-center py-8 text-zinc-600">
                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">Sin conversaciones</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer - User Profile */}
        <div className="p-3 border-t border-white/5">
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center overflow-hidden border border-white/10">
                {userAvatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-zinc-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-zinc-200 truncate">{user?.email}</p>
                <span className="text-[10px] text-zinc-600">Pro Plan</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile Dropdown - Opens upward */}
            {isProfileOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#0a0a0c] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-pop-in backdrop-blur-2xl z-50">
                <div className="p-2 space-y-1">
                  {/* Instructions */}
                  <button
                    onClick={() => {
                      setIsInstructionsOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                      globalInstructions
                        ? 'text-primary-400 bg-primary-500/10'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                    }`}
                  >
                    <PenLine className="w-4 h-4" />
                    <span className="text-xs font-medium">{tChat.instructions}</span>
                  </button>

                  {/* Logout */}
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-xs font-medium">{t.sign_out}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Modals */}
      <SystemInstructionsModal 
        isOpen={isInstructionsOpen} 
        onClose={() => setIsInstructionsOpen(false)}
        currentInstructions={globalInstructions}
        onSave={(text) => setGlobalInstructions(text)}
      />
    </>
  );
};
