'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Loader2, Mail, MailWarning, RefreshCw, X } from 'lucide-react';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '../../store/contactStore';
import { useNylasConnect } from '../../hooks/useNylasConnect';
import { useTeamStore } from '../../store/teamStore';

interface EmailConnectionButtonProps {
  className?: string;
}

export const EmailConnectionButton: React.FC<EmailConnectionButtonProps> = ({ className = '' }) => {
  const userContext = useContactStore(selectUserContext);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const fetchNylasGrantsStatus = useTeamStore(state => state.fetchNylasGrantsStatus);
  const isLoadingNylasStatus = useTeamStore(state => state.isLoadingNylasStatus);
  const nylasStatus = useTeamStore(state => {
    if (!userContext?.id) return null;
    return state.nylasGrants.find(grant => grant.memberId === userContext.id) || null;
  });
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const teamMemberId = userContext?.id;
  const hasGrant = !!userContext?.grantId;
  const hasInvalidGrant = hasGrant && !!nylasStatus && nylasStatus.status !== 'valid';
  const isConnected = hasGrant && !hasInvalidGrant;

  const { connectGoogle, connectMicrosoft, isConnecting } = useNylasConnect({
    teamMemberId: teamMemberId || 0,
    redirectAfter: '/',
  });

  useEffect(() => {
    if (!isOpen || !selectedEnterpriseId || !teamMemberId) return;
    void fetchNylasGrantsStatus(selectedEnterpriseId);
  }, [isOpen, selectedEnterpriseId, teamMemberId, fetchNylasGrantsStatus]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  if (!userContext) return null;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center
          transition-all duration-200 group active:scale-95
          ${isOpen
            ? 'bg-primary-500/20 text-primary-400 shadow-lg shadow-primary-500/10'
            : hasInvalidGrant
              ? 'text-amber-500 hover:text-amber-400 hover:bg-white/5'
              : isConnected
                ? 'text-emerald-500 hover:text-emerald-400 hover:bg-white/5'
                : 'text-amber-500 hover:text-amber-400 hover:bg-white/5'
          }
          ${className}
        `}
        title={hasInvalidGrant ? 'Email requiere reconexión' : isConnected ? 'Email conectado' : 'Email no conectado'}
      >
        {hasInvalidGrant ? (
          <AlertTriangle className={`w-4 h-4 ${!isOpen ? 'animate-pulse' : ''}`} />
        ) : isConnected ? (
          <Mail className="w-4 h-4" />
        ) : (
          <MailWarning className={`w-4 h-4 ${!isOpen ? 'animate-pulse' : ''}`} />
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-[#0d0d0f]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-200">Integración Email</h3>
              <div className="flex items-center gap-1">
                {selectedEnterpriseId && (
                  <button
                    onClick={() => void fetchNylasGrantsStatus(selectedEnterpriseId)}
                    disabled={isLoadingNylasStatus}
                    className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                    title="Actualizar estado de integración"
                  >
                    {isLoadingNylasStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {hasInvalidGrant ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-400">Conexión inválida</p>
                    <p className="text-xs text-zinc-400 truncate">{nylasStatus?.email || userContext.email}</p>
                  </div>
                </div>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  Necesita reconexión para restaurar acceso a calendario y email.
                </p>

                <div className="space-y-2">
                  <button
                    onClick={() => { connectGoogle(); setIsOpen(false); }}
                    disabled={isConnecting || !teamMemberId}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-amber-500/20 hover:border-amber-500/30 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">Reconectar Google</p>
                      <p className="text-[10px] text-zinc-500">Restaurar Gmail + Calendar</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { connectMicrosoft(); setIsOpen(false); }}
                    disabled={isConnecting || !teamMemberId}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-amber-500/20 hover:border-amber-500/30 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 23 23" className="w-4 h-4" fill="none">
                        <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                        <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
                        <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
                        <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">Reconectar Microsoft</p>
                      <p className="text-[10px] text-zinc-500">Restaurar Outlook + Calendar</p>
                    </div>
                  </button>
                </div>
              </div>
            ) : isConnected ? (
              /* ── Connected State ── */
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-400">Conectado</p>
                    <p className="text-xs text-zinc-400 truncate">{userContext.email}</p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Tu email está sincronizado. Puedes enviar emails con IA y sincronizar calendario.
                </p>
              </div>
            ) : (
              /* ── Disconnected State ── */
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <MailWarning className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-400">No conectado</p>
                    <p className="text-xs text-zinc-400">Conecta tu email para enviar con IA</p>
                  </div>
                </div>

                {/* Connect buttons */}
                <div className="space-y-2">
                  <button
                    onClick={() => { connectGoogle(); setIsOpen(false); }}
                    disabled={isConnecting || !teamMemberId}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">Conectar Google</p>
                      <p className="text-[10px] text-zinc-500">Gmail + Calendar</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { connectMicrosoft(); setIsOpen(false); }}
                    disabled={isConnecting || !teamMemberId}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 23 23" className="w-4 h-4" fill="none">
                        <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                        <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
                        <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
                        <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">Conectar Microsoft</p>
                      <p className="text-[10px] text-zinc-500">Outlook + Calendar</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
