'use client';

import React from 'react';
import { ShieldX, UserX, Building2, Mail, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

// ============================================
// ACCESS DENIED ERROR TYPES
// ============================================
export type AccessDeniedReason = 
  | 'NOT_REGISTERED'     // Usuario no existe en wp_team_humano
  | 'NO_ENTERPRISE'      // Usuario existe pero sin empresa asignada
  | 'ARCHIVED'           // Usuario archivado (is_active=false o deleted!=null)
  | 'CONFIG_ERROR'       // Error de configuración (ej: rol incorrecto)
  | 'GENERIC';           // Error genérico

interface AccessDeniedScreenProps {
  reason: AccessDeniedReason;
  userEmail?: string;
  onRetry?: () => void;
}

// ============================================
// ERROR CONFIGURATIONS
// ============================================
const errorConfig: Record<AccessDeniedReason, {
  icon: React.ReactNode;
  title: string;
  description: string;
  suggestion: string;
  color: string;
}> = {
  NOT_REGISTERED: {
    icon: <UserX className="w-12 h-12" />,
    title: 'Acceso Pendiente de Activación',
    description: 'Tu correo inició sesión correctamente, pero aún no tiene acceso habilitado dentro del sistema.',
    suggestion: 'Pide al administrador de tu empresa que te registre o te vuelva a invitar con este mismo correo para activar tu acceso.',
    color: 'rose'
  },
  NO_ENTERPRISE: {
    icon: <Building2 className="w-12 h-12" />,
    title: 'Sin Empresa Asignada',
    description: 'Tu cuenta existe pero no está asociada a ninguna empresa.',
    suggestion: 'Contacta al administrador para que te asigne a una empresa.',
    color: 'amber'
  },
  ARCHIVED: {
    icon: <UserX className="w-12 h-12" />,
    title: 'Cuenta Desactivada',
    description: 'Tu cuenta ha sido archivada o desactivada por un administrador.',
    suggestion: 'Si crees que esto es un error, contacta al administrador de tu empresa para que reactive tu cuenta.',
    color: 'red'
  },
  CONFIG_ERROR: {
    icon: <ShieldX className="w-12 h-12" />,
    title: 'Error de Configuración',
    description: 'Hay un problema con la configuración de tu cuenta.',
    suggestion: 'Contacta al soporte técnico para resolver este problema.',
    color: 'red'
  },
  GENERIC: {
    icon: <ShieldX className="w-12 h-12" />,
    title: 'Acceso Denegado',
    description: 'No pudimos verificar tu acceso al sistema.',
    suggestion: 'Intenta cerrar sesión y volver a ingresar. Si el problema persiste, contacta al administrador.',
    color: 'zinc'
  }
};

export const AccessDeniedScreen: React.FC<AccessDeniedScreenProps> = ({
  reason,
  userEmail,
  onRetry
}) => {
  const config = errorConfig[reason] || errorConfig.GENERIC;
  const isNotRegistered = reason === 'NOT_REGISTERED';
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth/callback';
  };

  const handleContactAdmin = () => {
    // Open mailto with prefilled subject
    const subject = encodeURIComponent(`[Urpe AI Lab] Solicitud de acceso - ${reason}`);
    const body = encodeURIComponent(
      `Hola,\n\nSolicito acceso al sistema Urpe AI Lab.\n\n` +
      `Email: ${userEmail || 'No disponible'}\n` +
      `Motivo: ${config.title}\n\n` +
      `Gracias.`
    );
    window.open(`mailto:soporte@urpeailab.com?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] min-h-screen w-screen flex items-center justify-center bg-[#0c0c0e] p-4 sm:p-6">
      <div className="max-w-lg w-full">
        {/* Main Card */}
        <div className="bg-[#0a0a0c] border border-white/5 rounded-2xl p-8 sm:p-10 text-center shadow-2xl">
          {/* Icon */}
          <div className={`
            inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6
            bg-${config.color}-500/10 text-${config.color}-400
          `}
          style={{
            backgroundColor: config.color === 'rose' ? 'rgba(244,63,94,0.1)' :
                            config.color === 'amber' ? 'rgba(245,158,11,0.1)' :
                            config.color === 'red' ? 'rgba(239,68,68,0.1)' :
                            'rgba(113,113,122,0.1)',
            color: config.color === 'rose' ? '#fb7185' :
                   config.color === 'amber' ? '#fbbf24' :
                   config.color === 'red' ? '#f87171' :
                   '#a1a1aa'
          }}
          >
            {config.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            {config.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-zinc-400 mb-4">
            {config.description}
          </p>

          {isNotRegistered && (
            <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 mb-4 text-left">
              <p className="text-xs text-primary-200 leading-relaxed">
                Para continuar, un administrador debe crear tu usuario en el equipo usando exactamente este correo.
              </p>
            </div>
          )}

          {/* User Email Badge */}
          {userEmail && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg mb-6">
              <Mail className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-400 font-mono">{userEmail}</span>
            </div>
          )}

          {/* Suggestion */}
          <div className="bg-white/5 border border-white/5 rounded-xl p-4 mb-6">
            <p className="text-xs text-zinc-300 leading-relaxed">
              💡 {config.suggestion}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {/* Contact Admin */}
            <button
              onClick={handleContactAdmin}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-xl text-sm font-medium transition-all"
            >
              <Mail className="w-4 h-4" />
              Contactar Administrador
            </button>

            {/* Retry */}
            {onRetry && (
              <button
                onClick={onRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-sm font-medium transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reintentar
              </button>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 hover:bg-white/5 text-zinc-500 hover:text-zinc-300 rounded-xl text-sm transition-all"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-zinc-600 mt-4">
          Urpe AI Lab • Si crees que esto es un error, contacta al administrador o a soporte.
        </p>
      </div>
    </div>
  );
};

// ============================================
// HELPER: Parse error code from store
// ============================================
export const parseAccessDeniedError = (error: string | null): { 
  isAccessDenied: boolean; 
  reason: AccessDeniedReason 
} => {
  if (!error) return { isAccessDenied: false, reason: 'GENERIC' };
  
  if (error.startsWith('ACCESS_DENIED:')) {
    const reasonCode = error.split(':')[1] as AccessDeniedReason;
    return { 
      isAccessDenied: true, 
      reason: reasonCode || 'GENERIC' 
    };
  }
  
  // Legacy error messages
  if (error.includes('no registrado') || error.includes('not found')) {
    return { isAccessDenied: true, reason: 'NOT_REGISTERED' };
  }
  
  if (error.includes('sin empresa') || error.includes('no enterprise')) {
    return { isAccessDenied: true, reason: 'NO_ENTERPRISE' };
  }
  
  if (error.includes('archivado') || error.includes('archived') || error.includes('desactivada')) {
    return { isAccessDenied: true, reason: 'ARCHIVED' };
  }
  
  if (error.includes('configuración') || error.includes('Dev Team')) {
    return { isAccessDenied: true, reason: 'CONFIG_ERROR' };
  }
  
  return { isAccessDenied: false, reason: 'GENERIC' };
};

export default AccessDeniedScreen;
