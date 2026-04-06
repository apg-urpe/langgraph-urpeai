'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Sun, Languages, Link2, CheckCircle2, AlertTriangle,
  CalendarOff, Chrome, Building2, RefreshCw, Unlink, Loader2,
  Calendar, Mail, AlertCircle
} from 'lucide-react';
import { useChatStore, selectCurrentTheme, selectThemeIntensity, AppTheme } from '../../../../store/chatStore';
import { useLanguageStore } from '../../../../store/languageStore';
import { useContactStore, selectUserContext } from '../../../../store/contactStore';
import { useTeamStore } from '../../../../store/teamStore';

// ============================================================================
// NYLAS CONNECTION SECTION — Personal integration management
// ============================================================================

interface GrantInfo {
  status: 'valid' | 'invalid' | 'expired' | 'not_connected' | 'error' | 'loading';
  email?: string;
  provider?: string;
  scopes?: string[];
  errorMessage?: string;
}

const NylasIntegrationSection: React.FC = () => {
  const userContext = useContactStore(selectUserContext);
  const disconnectGrant = useTeamStore(state => state.disconnectGrant);

  const [grantInfo, setGrantInfo] = useState<GrantInfo>({ status: 'loading' });
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const memberId = userContext?.id;
  const grantId = userContext?.grantId;

  // Check grant status on mount and when grantId changes
  const checkStatus = useCallback(async () => {
    if (!memberId) return;

    if (!grantId || grantId === 'Solicitud enviada') {
      setGrantInfo({ status: 'not_connected' });
      return;
    }

    setGrantInfo(prev => ({ ...prev, status: 'loading' }));

    try {
      const empresaId = userContext?.empresaId;
      if (!empresaId) { setGrantInfo({ status: 'not_connected' }); return; }

      const res = await fetch(`/api/nylas/grants-status?empresa_id=${empresaId}`, { credentials: 'include' });
      if (!res.ok) { setGrantInfo({ status: 'error', errorMessage: 'No se pudo verificar' }); return; }

      const data = await res.json();
      const mine = data.grants?.find((g: any) => g.memberId === memberId);

      if (mine) {
        setGrantInfo({
          status: mine.status,
          email: mine.email,
          provider: mine.provider,
          scopes: mine.scopes,
          errorMessage: mine.errorMessage,
        });
      } else {
        setGrantInfo({ status: 'not_connected' });
      }
    } catch {
      setGrantInfo({ status: 'error', errorMessage: 'Error de conexión' });
    }
  }, [memberId, grantId, userContext?.empresaId]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleDisconnect = async () => {
    if (!memberId) return;
    setIsDisconnecting(true);
    setActionError(null);
    const ok = await disconnectGrant(memberId);
    if (!ok) {
      setActionError(useTeamStore.getState().error || 'Error al desconectar');
    } else {
      setGrantInfo({ status: 'not_connected' });
      // Update userContext grantId locally
      useContactStore.setState(state => ({
        userContext: state.userContext ? { ...state.userContext, grantId: null } : null
      }));
    }
    setIsDisconnecting(false);
    setShowConfirm(false);
  };

  const redirectToAuth = (provider: 'google' | 'microsoft') => {
    if (!memberId) return;
    window.location.href = `/api/nylas/auth?team_member_id=${memberId}&provider=${provider}&redirect_after=${encodeURIComponent(window.location.pathname)}`;
  };

  const isConnected = grantInfo.status === 'valid';
  const hasIssue = grantInfo.status === 'invalid' || grantInfo.status === 'expired' || grantInfo.status === 'error';
  const isLoading = grantInfo.status === 'loading';
  const notConnected = grantInfo.status === 'not_connected';

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-primary-400" />
        Integraciones
      </h2>

      <div className="bg-zinc-900/50 rounded-xl border border-white/5 p-4 space-y-4">
        <label className="text-xs font-medium text-zinc-500 mb-1 block uppercase tracking-wider">
          Calendario y Email
        </label>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-3 py-3">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            <span className="text-sm text-zinc-500">Verificando conexión...</span>
          </div>
        )}

        {/* Connected */}
        {isConnected && (
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-emerald-300">Conectado</span>
                  {grantInfo.provider && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">{grantInfo.provider}</span>
                  )}
                </div>
                {grantInfo.email && (
                  <p className="text-xs text-zinc-400 truncate">{grantInfo.email}</p>
                )}
                {grantInfo.scopes && grantInfo.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {grantInfo.scopes.some(s => s.includes('calendar')) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <Calendar className="w-2.5 h-2.5 inline mr-0.5" />Calendario
                      </span>
                    )}
                    {grantInfo.scopes.some(s => s.includes('gmail') || s.includes('mail') || s.includes('Mail')) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        <Mail className="w-2.5 h-2.5 inline mr-0.5" />Email
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => redirectToAuth((grantInfo.provider as 'google' | 'microsoft') || 'google')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reconectar
              </button>
              {!showConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                >
                  <Unlink className="w-3 h-3" />
                  Desconectar
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isDisconnecting}
                    onClick={handleDisconnect}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                  >
                    {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="px-2.5 py-1.5 text-xs rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Issue */}
        {hasIssue && (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-amber-300">Conexión inválida</span>
                {grantInfo.email && (
                  <p className="text-xs text-zinc-400 truncate">{grantInfo.email} ({grantInfo.provider || 'desconocido'})</p>
                )}
                <p className="text-xs text-amber-400/70 mt-0.5">Tu conexión necesita renovarse. Reconecta para restaurar calendario y email.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => redirectToAuth((grantInfo.provider as 'google' | 'microsoft') || 'google')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reconectar
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                Desconectar
              </button>
            </div>
          </div>
        )}

        {/* Not connected */}
        {notConnected && (
          <div className="p-4 rounded-xl border border-zinc-700/50 bg-zinc-800/30 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-700/30 flex items-center justify-center shrink-0">
                <CalendarOff className="w-5 h-5 text-zinc-500" />
              </div>
              <div>
                <span className="text-sm font-medium text-zinc-300">Sin cuenta conectada</span>
                <p className="text-xs text-zinc-500">Conecta tu cuenta de Google o Microsoft para sincronizar tu calendario y emails con el CRM.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => redirectToAuth('google')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-white hover:bg-zinc-100 text-zinc-800 transition-colors shadow-sm"
              >
                <Chrome className="w-3.5 h-3.5" />
                Conectar Google
              </button>
              <button
                type="button"
                onClick={() => redirectToAuth('microsoft')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white transition-colors"
              >
                <Building2 className="w-3.5 h-3.5" />
                Conectar Microsoft
              </button>
            </div>
            <p className="text-[10px] text-zinc-600">Solo accederemos a tu calendario y correos para funciones del CRM. Puedes revocar el acceso en cualquier momento.</p>
          </div>
        )}

        {actionError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{actionError}</p>
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// SETTINGS TAB
// ============================================================================

export const SettingsTab: React.FC = () => {
  const currentTheme = useChatStore(selectCurrentTheme);
  const themeIntensity = useChatStore(selectThemeIntensity);
  const setTheme = useChatStore(state => state.setTheme);
  const setThemeIntensity = useChatStore(state => state.setThemeIntensity);
  const { language, setLanguage } = useLanguageStore();

  const themes: { id: AppTheme; color: string; label: string }[] = [
    { id: 'glacier', color: 'bg-[#00FFFF]', label: 'Glacier' },
    { id: 'nebula', color: 'bg-[#9333ea]', label: 'Nebula' },
    { id: 'matrix', color: 'bg-[#4ade80]', label: 'Matrix' },
    { id: 'ember', color: 'bg-[#f97316]', label: 'Ember' },
    { id: 'midnight', color: 'bg-[#ffffff]', label: 'Midnight' },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Theme Settings */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary-400" />
          Apariencia
        </h2>
        
        <div className="bg-zinc-900/50 rounded-xl border border-white/5 p-4 space-y-6">
          {/* Theme Selector */}
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-3 block uppercase tracking-wider">
              Tema de Interfaz
            </label>
            <div className="flex flex-wrap gap-3">
              {themes.map(theme => (
                <button 
                  key={theme.id}
                  onClick={() => setTheme(theme.id)}
                  className={`
                    group relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
                    ${currentTheme === theme.id 
                      ? 'bg-white/5 border-primary-500/50' 
                      : 'border-white/5 hover:border-white/10 hover:bg-white/5'
                    }
                  `}
                >
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center transition-all
                    ${currentTheme === theme.id ? 'scale-110' : 'group-hover:scale-105'}
                  `}>
                    <div className={`w-4 h-4 rounded-full ${theme.color} shadow-[0_0_12px_currentColor]`} />
                  </div>
                  <span className={`text-xs font-medium ${currentTheme === theme.id ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    {theme.label}
                  </span>
                  {currentTheme === theme.id && (
                    <div className="absolute inset-0 border-2 border-primary-500/20 rounded-xl" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Intensity Slider */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Sun className="w-3 h-3" />
                Intensidad del Ambiente
              </label>
              <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                {themeIntensity}%
              </span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={themeIntensity} 
              onChange={(e) => setThemeIntensity(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>
        </div>
      </section>

      {/* Language Settings */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Languages className="w-4 h-4 text-primary-400" />
          Idioma y Región
        </h2>
        
        <div className="bg-zinc-900/50 rounded-xl border border-white/5 p-4">
          <label className="text-xs font-medium text-zinc-500 mb-3 block uppercase tracking-wider">
            Idioma del Sistema
          </label>
          <div className="flex gap-3">
            <button 
              onClick={() => setLanguage('en')} 
              className={`
                flex-1 p-3 rounded-xl border text-left transition-all
                ${language === 'en' 
                  ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' 
                  : 'bg-zinc-900 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-400'
                }
              `}
            >
              <div className="text-sm font-bold mb-0.5">English</div>
              <div className="text-[10px] opacity-70">United States</div>
            </button>
            <button 
              onClick={() => setLanguage('es')} 
              className={`
                flex-1 p-3 rounded-xl border text-left transition-all
                ${language === 'es' 
                  ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' 
                  : 'bg-zinc-900 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-400'
                }
              `}
            >
              <div className="text-sm font-bold mb-0.5">Español</div>
              <div className="text-[10px] opacity-70">España / Latinoamérica</div>
            </button>
          </div>
        </div>
      </section>
      {/* Integrations */}
      <NylasIntegrationSection />
    </div>
  );
};
