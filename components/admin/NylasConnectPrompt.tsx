'use client';

import React from 'react';
import { Mail, Calendar, Chrome, Building2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useNylasConnect } from '@/hooks/useNylasConnect';

/**
 * NylasConnectPrompt
 * 
 * Componente que invita al usuario a conectar su cuenta de Google/Microsoft
 * cuando no tiene un grant_id configurado para acceder a calendario y emails.
 */

interface NylasConnectPromptProps {
  teamMemberId: number | string;
  title?: string;
  description?: string;
  showCalendarFeature?: boolean;
  showEmailFeature?: boolean;
  redirectAfter?: string;
  onSuccess?: () => void;
  compact?: boolean;
}

export function NylasConnectPrompt({
  teamMemberId,
  title = 'Conecta tu cuenta',
  description = 'Conecta tu cuenta de correo para sincronizar calendario y emails.',
  showCalendarFeature = true,
  showEmailFeature = true,
  redirectAfter,
  onSuccess,
  compact = false,
}: NylasConnectPromptProps) {
  const {
    isConnecting,
    error,
    success,
    connectedEmail,
    connectGoogle,
    connectMicrosoft,
    clearError,
  } = useNylasConnect({
    teamMemberId,
    redirectAfter: redirectAfter || window.location.pathname,
    onSuccess: () => onSuccess?.(),
  });

  // Estado de éxito
  if (success && connectedEmail) {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} bg-emerald-500/10 border border-emerald-500/20 rounded-xl`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-emerald-300">¡Cuenta conectada!</h3>
            <p className="text-xs text-emerald-400/70">{connectedEmail}</p>
          </div>
        </div>
      </div>
    );
  }

  // Vista compacta
  if (compact) {
    return (
      <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
        {error && (
          <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-300">×</button>
          </div>
        )}
        
        <p className="text-sm text-zinc-400 mb-3">{description}</p>
        
        <div className="flex gap-2">
          <button
            onClick={connectGoogle}
            disabled={isConnecting}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Chrome className="w-4 h-4" />
                Google
              </>
            )}
          </button>
          
          <button
            onClick={connectMicrosoft}
            disabled={isConnecting}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Building2 className="w-4 h-4" />
                Microsoft
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Vista completa
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md">
        {/* Icono principal */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-6 mx-auto">
          <Mail className="w-10 h-10 text-amber-400" />
        </div>

        {/* Título y descripción */}
        <h3 className="text-xl font-semibold text-zinc-200 mb-2">{title}</h3>
        <p className="text-sm text-zinc-400 mb-6">{description}</p>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{error}</span>
            <button onClick={clearError} className="p-1 hover:bg-red-500/20 rounded">×</button>
          </div>
        )}

        {/* Features */}
        <div className="flex justify-center gap-6 mb-8">
          {showCalendarFeature && (
            <div className="flex items-center gap-2 text-zinc-400">
              <Calendar className="w-5 h-5 text-blue-400" />
              <span className="text-sm">Calendario</span>
            </div>
          )}
          {showEmailFeature && (
            <div className="flex items-center gap-2 text-zinc-400">
              <Mail className="w-5 h-5 text-purple-400" />
              <span className="text-sm">Emails</span>
            </div>
          )}
        </div>

        {/* Botones de conexión */}
        <div className="space-y-3">
          <button
            onClick={connectGoogle}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white hover:bg-zinc-100 text-zinc-800 font-medium rounded-xl transition-all disabled:opacity-50 shadow-lg"
          >
            {isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Conectar con Google
              </>
            )}
          </button>

          <button
            onClick={connectMicrosoft}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white font-medium rounded-xl transition-all disabled:opacity-50"
          >
            {isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z"/>
                  <path fill="#81bc06" d="M12 1h10v10H12z"/>
                  <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                  <path fill="#ffba08" d="M12 12h10v10H12z"/>
                </svg>
                Conectar con Microsoft
              </>
            )}
          </button>
        </div>

        {/* Nota de privacidad */}
        <p className="mt-6 text-xs text-zinc-500">
          Solo accederemos a tu calendario y correos para las funciones del CRM.
          <br />
          Puedes revocar el acceso en cualquier momento.
        </p>
      </div>
    </div>
  );
}

export default NylasConnectPrompt;
