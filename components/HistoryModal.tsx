'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Trash2, Loader2, Search, Pin } from 'lucide-react';
import { ChatSession } from '../types';
import { useLanguageStore } from '../store/languageStore';
import { useChatStore } from '../store/chatStore';
import { translations } from '../lib/i18n';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onDeleteSession?: (id: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession
}) => {
  const { language } = useLanguageStore();
  const t = translations[language].sidebar;
  const toggleSessionPin = useChatStore(state => state.toggleSessionPin);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  const handleSelect = (id: string) => {
    onSelectSession(id);
    handleClose();
  };

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const pinnedSessions = filteredSessions.filter(session => session.isPinned);
  const regularSessions = filteredSessions.filter(session => !session.isPinned);

  const renderSessionItem = (session: ChatSession) => {
    const isThinking = session.isThinking && !session.isStreaming;
    const isStreaming = session.isStreaming;
    const isProcessing = isThinking || isStreaming;
    const isActive = session.id === activeSessionId;
    const isUnread = session.hasUnread && !isActive;
    const isPinned = session.isPinned ?? false;

    const statusText = isThinking 
      ? (language === 'es' ? 'Pensando...' : 'Thinking...') 
      : isStreaming 
        ? (language === 'es' ? 'Escribiendo...' : 'Writing...')
        : isUnread 
          ? (language === 'es' ? 'Nueva respuesta' : 'New response')
          : null;

    return (
      <div 
        key={session.id}
        className="relative group"
      >
        <button
          onClick={() => handleSelect(session.id)}
          className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${
            isProcessing 
              ? 'bg-amber-500/5 border border-amber-500/20'
              : isActive
                ? 'bg-primary-500/10 text-zinc-100 border border-primary-500/20' 
                : isUnread
                  ? 'bg-emerald-500/5 border border-emerald-500/20'
                  : isPinned
                    ? 'text-zinc-300 hover:bg-white/5 hover:text-zinc-100 border border-amber-500/10'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
          }`}
        >
          <div className="relative shrink-0 flex items-center justify-center w-5 h-5">
            {isProcessing ? (
              <div className="relative">
                <Loader2 className={`w-4 h-4 animate-spin ${isThinking ? 'text-amber-400' : 'text-primary-400'}`} />
                <div className={`absolute inset-0 rounded-full ${isThinking ? 'bg-amber-400/20' : 'bg-primary-400/20'} animate-ping`} />
              </div>
            ) : isUnread ? (
              <div className="relative">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
              </div>
            ) : isPinned ? (
              <Pin className={`w-4 h-4 ${isActive ? 'text-amber-300 fill-current' : 'text-amber-500'}`} />
            ) : (
              <div className={`w-2 h-2 rounded-full ${
                isActive ? 'bg-primary-500' : 'bg-zinc-600'
              }`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`block truncate text-sm ${isActive ? 'font-semibold' : 'font-normal'} ${isUnread ? 'font-bold text-white' : ''}`}>
                {session.title}
              </span>
              {isPinned && (
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-300">
                  PIN
                </span>
              )}
              {statusText && (
                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  isProcessing 
                    ? 'bg-amber-500/20 text-amber-400' 
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {statusText}
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">
              {new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>

          {!isProcessing && (
            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSessionPin(session.id);
                }}
                className={`p-2 rounded-lg transition-all ${
                  isPinned
                    ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                    : 'text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10'
                }`}
                title={isPinned ? 'Desanclar' : 'Anclar'}
              >
                <Pin className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
              </div>
              {onDeleteSession && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  title={t.delete_session}
                >
                  <Trash2 className="w-4 h-4" />
                </div>
              )}
            </div>
          )}
        </button>
      </div>
    );
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className={`
        relative w-full max-w-lg max-h-[80vh] bg-[#0a0a0c] border border-white/10 rounded-2xl 
        shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] overflow-hidden
        transition-all duration-300 ${isAnimating ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center">
              <History className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">{t.active_sessions}</h2>
              <p className="text-[10px] text-zinc-500">{sessions.length} {language === 'es' ? 'conversaciones' : 'conversations'}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'es' ? 'Buscar conversación...' : 'Search conversation...'}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-white/5 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/30 focus:ring-1 focus:ring-primary-500/20 transition-all"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-3 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {language === 'es' ? 'No se encontraron conversaciones' : 'No conversations found'}
            </div>
          ) : (
            <>
              {pinnedSessions.length > 0 && (
                <div className="px-1 pt-1 pb-2">
                  <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-amber-400/80">
                    Anclados
                  </p>
                </div>
              )}
              {pinnedSessions.map(renderSessionItem)}
              {pinnedSessions.length > 0 && regularSessions.length > 0 && (
                <div className="px-1 pt-3 pb-2">
                  <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-zinc-500">
                    Recientes
                  </p>
                </div>
              )}
              {regularSessions.map(renderSessionItem)}
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Use Portal to render outside current DOM hierarchy (solves z-index issues)
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
