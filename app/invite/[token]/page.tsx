'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  User, 
  Mail, 
  Phone, 
  Building2, 
  Shield, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { getInvitationByToken, acceptInvitation } from '../../../store/teamStore';
import { TeamInvitation, isInvitationExpired, getInvitationTimeRemaining, isValidInvitationToken } from '../../../types/team';
import { supabase } from '../../../lib/supabase-client';

type PageState = 'loading' | 'authenticating' | 'valid' | 'expired' | 'used' | 'not_found' | 'cancelled' | 'success' | 'error';

const PHONE_COUNTRIES = [
  { label: 'PE +51', code: '51' },
  { label: 'CO +57', code: '57' },
  { label: 'MX +52', code: '52' },
  { label: 'CL +56', code: '56' },
  { label: 'AR +54', code: '54' },
  { label: 'EC +593', code: '593' },
  { label: 'US +1', code: '1' },
];

const sanitizePhoneDigits = (value: string): string => value.replace(/\D/g, '');

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isOnline, setIsOnline] = useState(true);
  
  // Auth state - CRÍTICO para vincular auth_uid
  const [authUser, setAuthUser] = useState<{ id: string; email: string } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const authProcessedRef = useRef(false);
  const existingAccessCheckRef = useRef<string | null>(null);
  const [isCheckingExistingAccess, setIsCheckingExistingAccess] = useState(false);
  const [isRedirectingToApp, setIsRedirectingToApp] = useState(false);

  // Form state
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [countryCode, setCountryCode] = useState('51');
  
  // Form validation state
  const [touched, setTouched] = useState({ nombre: false, apellido: false });
  const nombreError = touched.nombre && !nombre.trim() ? 'El nombre es requerido' : '';
  const apellidoError = touched.apellido && !apellido.trim() ? 'El apellido es requerido' : '';

  // Validar formato del token antes de hacer la petición
  const isTokenFormatValid = token ? isValidInvitationToken(token) : false;
  const normalizedAuthEmail = authUser?.email?.toLowerCase().trim() || '';
  const normalizedInvitationEmail = invitation?.email?.toLowerCase().trim() || '';
  const hasMatchingAuthenticatedInvite = !!normalizedAuthEmail && !!normalizedInvitationEmail && normalizedAuthEmail === normalizedInvitationEmail;

  // ============================================
  // PASO 1: Procesar tokens del hash fragment (Magic Link)
  // El callback de auth pasa tokens via URL fragment
  // ============================================
  useEffect(() => {
    if (authProcessedRef.current) return;
    
    const processAuthFromHash = async () => {
      // Verificar si hay tokens en el hash fragment
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
          console.log('[InvitePage] 🔑 Detectados tokens en hash fragment, estableciendo sesión...');
          setPageState('authenticating');
          
          try {
            // Establecer la sesión con los tokens del Magic Link
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            
            if (error) {
              console.error('[InvitePage] Error estableciendo sesión:', error);
            } else if (data.user) {
              console.log('[InvitePage] ✅ Sesión establecida para:', data.user.email);
              setAuthUser({ id: data.user.id, email: data.user.email || '' });
              
              // Limpiar el hash del URL para seguridad
              window.history.replaceState(null, '', window.location.pathname);
            }
          } catch (err) {
            console.error('[InvitePage] Excepción procesando tokens:', err);
          }
        }
      }
      
      // Verificar sesión existente
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('[InvitePage] 👤 Usuario autenticado encontrado:', user.email);
          setAuthUser({ id: user.id, email: user.email || '' });
        } else {
          console.log('[InvitePage] ⚠️ Sin usuario autenticado - invitación procederá sin auth_uid');
        }
      } catch (err) {
        console.error('[InvitePage] Error verificando usuario:', err);
      }
      
      authProcessedRef.current = true;
      setIsAuthReady(true);
    };
    
    processAuthFromHash();
  }, []);

  // Detectar estado de conexión
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ============================================
  // PASO 2: Cargar invitación (esperar auth primero)
  // ============================================
  const loadInvitation = useCallback(async () => {
    if (!token) {
      setPageState('not_found');
      return;
    }

    // Validar formato del token antes de consultar DB
    if (!isTokenFormatValid) {
      setPageState('not_found');
      return;
    }

    // Mantener estado de autenticación visual mientras procesa Magic Link
    setPageState((prev) => (prev === 'authenticating' ? prev : 'loading'));
    
    try {
      const inv = await getInvitationByToken(token);

      if (!inv) {
        setPageState('not_found');
        return;
      }

      setInvitation(inv);
      setTimeRemaining(getInvitationTimeRemaining(inv.expires_at));

      if (inv.status === 'accepted') {
        setPageState('used');
      } else if (inv.status === 'cancelled') {
        setPageState('cancelled');
      } else if (inv.status === 'expired' || isInvitationExpired(inv.expires_at)) {
        setPageState('expired');
      } else {
        setPageState('valid');
      }
    } catch (err) {
      console.error('[InvitePage] Error loading invitation:', err);
      if (!navigator.onLine) {
        setError('Sin conexión a internet. Verifica tu conexión.');
      }
      setPageState('error');
    }
  }, [token, isTokenFormatValid]);

  // Cargar invitación DESPUÉS de que auth esté listo
  useEffect(() => {
    if (isAuthReady) {
      loadInvitation();
    }
  }, [isAuthReady, loadInvitation]);

  useEffect(() => {
    if (!isAuthReady || !authUser || !hasMatchingAuthenticatedInvite || pageState !== 'used') {
      return;
    }

    setIsRedirectingToApp(true);
    const timeoutId = window.setTimeout(() => {
      window.location.replace('/');
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthReady, authUser, hasMatchingAuthenticatedInvite, pageState]);

  useEffect(() => {
    if (!isAuthReady || !authUser || !hasMatchingAuthenticatedInvite || pageState !== 'valid') {
      return;
    }

    const checkKey = `${invitation?.id ?? 'no-invite'}:${authUser.id}`;
    if (existingAccessCheckRef.current === checkKey) {
      return;
    }

    existingAccessCheckRef.current = checkKey;
    let cancelled = false;

    const checkExistingAccess = async () => {
      setIsCheckingExistingAccess(true);

      try {
        const response = await fetch('/api/invite/link-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authUser.email,
            auth_uid: authUser.id
          })
        });

        const data = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.ok) {
          setIsRedirectingToApp(true);
          window.location.replace('/');
          return;
        }

        if (data?.code === 'MEMBER_NOT_FOUND' || data?.code === 'MEMBER_INACTIVE') {
          return;
        }

        if (data?.code === 'ALREADY_LINKED_DIFFERENT') {
          setError('Este correo ya está vinculado a otra cuenta. Cierra sesión y entra con el correo correcto de la invitación.');
        }
      } catch (err) {
        console.error('[InvitePage] Error verificando acceso existente:', err);
      } finally {
        if (!cancelled) {
          setIsCheckingExistingAccess(false);
        }
      }
    };

    checkExistingAccess();

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, authUser, hasMatchingAuthenticatedInvite, pageState, invitation?.id]);

  // Actualizar countdown cada minuto
  useEffect(() => {
    if (!invitation || pageState !== 'valid') return;
    
    const interval = setInterval(() => {
      const remaining = getInvitationTimeRemaining(invitation.expires_at);
      setTimeRemaining(remaining);
      
      // Verificar si expiró mientras el usuario estaba en la página
      if (isInvitationExpired(invitation.expires_at)) {
        setPageState('expired');
      }
    }, 60000); // Cada minuto
    
    return () => clearInterval(interval);
  }, [invitation, pageState]);

  // ============================================
  // PASO 3: Aceptar invitación con auth_uid vinculado
  // ============================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched({ nombre: true, apellido: true });

    // Validación del formulario
    if (!nombre.trim() || !apellido.trim()) {
      setError('Por favor completa todos los campos requeridos');
      return;
    }

    // Verificar conexión
    if (!navigator.onLine) {
      setError('Sin conexión a internet. Por favor verifica tu conexión e intenta de nuevo.');
      return;
    }

    // Verificar que la invitación no haya expirado mientras llenaba el formulario
    if (invitation && isInvitationExpired(invitation.expires_at)) {
      setPageState('expired');
      return;
    }

    setIsSubmitting(true);

    try {
      const telefonoLocal = sanitizePhoneDigits(telefono);
      const telefonoCompleto = telefonoLocal ? `${countryCode}${telefonoLocal}` : undefined;

      // Usar el authUser que ya procesamos (puede ser null si no vino del Magic Link)
      const authUid = authUser?.id || null;
      
      console.log('[InvitePage] 📝 Aceptando invitación:', {
        token: token.substring(0, 8) + '...',
        nombre: nombre.trim(),
        hasAuthUid: !!authUid,
        authEmail: authUser?.email
      });

      const result = await acceptInvitation({
        token,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefonoCompleto,
        auth_uid: authUid || undefined
      });

      if (result.success) {
        console.log('[InvitePage] ✅ Invitación aceptada exitosamente:', {
          member_id: result.member_id,
          empresa_id: result.empresa_id,
          authUidVinculado: !!authUid
        });
        
        setPageState('success');
        
        // Forzar navegación completa para refrescar contexto/auth en toda la app
        window.setTimeout(() => {
          window.location.replace('/');
        }, authUid ? 1200 : 1800);
      } else {
        console.warn('[InvitePage] ❌ Error aceptando invitación:', result.message);
        setError(result.message);
        setRetryCount(prev => prev + 1);
      }
    } catch (err: any) {
      console.error('[InvitePage] Excepción en handleSubmit:', err);
      const errorMessage = !navigator.onLine 
        ? 'Error de conexión. Verifica tu internet e intenta de nuevo.'
        : err.message || 'Error al procesar la invitación';
      setError(errorMessage);
      setRetryCount(prev => prev + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retry handler
  const handleRetry = () => {
    setError(null);
    loadInvitation();
  };

  const getRolLabel = (rol: string) => {
    const labels: Record<string, string> = {
      asesor: 'Asesor',
      marketing: 'Marketing',
      supervisor: 'Supervisor',
      rrhh: 'RRHH',
      administrativo: 'Administrativo',
      operaciones: 'Operaciones',
    };
    return labels[rol] || rol;
  };

  if (isRedirectingToApp || isCheckingExistingAccess) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto" />
          <p className="mt-4 text-zinc-300">
            {isRedirectingToApp ? 'Redirigiendo a tu cuenta...' : 'Verificando tu acceso...'}
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Esto tomará solo un momento
          </p>
        </div>
      </div>
    );
  }

  // Authenticating state (procesando Magic Link)
  if (pageState === 'authenticating') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto" />
          <p className="mt-4 text-zinc-400">Estableciendo sesión...</p>
          <p className="mt-2 text-xs text-zinc-600">Procesando tu acceso seguro</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto" />
          <p className="mt-4 text-zinc-400">Verificando invitación...</p>
          <p className="mt-2 text-xs text-zinc-600">Esto solo tomará un momento</p>
        </div>
      </div>
    );
  }

  // Error state (network or unknown errors)
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            {isOnline ? <AlertCircle className="w-8 h-8 text-amber-400" /> : <WifiOff className="w-8 h-8 text-amber-400" />}
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">
            {isOnline ? 'Error al cargar' : 'Sin conexión'}
          </h1>
          <p className="text-zinc-400 mb-6">
            {isOnline 
              ? 'No pudimos verificar la invitación. Por favor intenta de nuevo.'
              : 'Verifica tu conexión a internet e intenta de nuevo.'
            }
          </p>
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Not found state
  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Invitación no encontrada</h1>
          <p className="text-zinc-400 mb-6">
            El enlace de invitación es inválido o nunca existió. Por favor verifica el link o solicita uno nuevo.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  // Cancelled state
  if (pageState === 'cancelled') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Invitación revocada</h1>
          <p className="text-zinc-400 mb-6">
            Esta invitación ha sido cancelada por el administrador. Por favor contacta a quien te invitó para solicitar una nueva.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  // Expired state
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Invitación expirada</h1>
          <p className="text-zinc-400 mb-6">
            Esta invitación ha expirado. Por favor solicita una nueva invitación a tu líder de equipo.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  // Already used state
  if (pageState === 'used') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Invitación ya utilizada</h1>
          <p className="text-zinc-400 mb-6">
            Esta invitación ya fue aceptada. Si ya tienes cuenta, inicia sesión para acceder.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">¡Bienvenido al equipo!</h1>
          <p className="text-zinc-400 mb-2">
            Tu cuenta ha sido activada exitosamente.
          </p>
          {authUser ? (
            <p className="text-sm text-emerald-400/80 mb-6">
              ✓ Sesión vinculada correctamente a {authUser.email}
            </p>
          ) : (
            <p className="text-sm text-zinc-500 mb-6">
              Usa el enlace de acceso que recibiste por email para iniciar sesión.
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-primary-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Redirigiendo...</span>
          </div>
        </div>
      </div>
    );
  }

  // Valid invitation - show form
  return (
    <div className="fixed inset-0 bg-[#0a0a0c] overflow-y-auto overscroll-y-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="min-h-full w-full">
      <div className="max-w-lg w-full mx-auto px-4 py-6 pb-10 sm:py-10 sm:pb-14 md:py-14 md:pb-16">
        {/* Header */}
        <div className="text-center mb-5 sm:mb-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <User className="w-6 h-6 sm:w-8 sm:h-8 text-primary-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 mb-1.5 sm:mb-2">Completa tu registro</h1>
          <p className="text-sm sm:text-base text-zinc-400">
            Has sido invitado a unirte al equipo. Sigue los pasos para completar tu ingreso.
          </p>
        </div>

        {/* Invitation Info Card */}
        {invitation && (
          <div className="bg-[#131316] border border-white/10 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-zinc-500">Empresa</p>
                  <p className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
                    {(invitation.empresa as any)?.nombre || 'Empresa'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-zinc-500">Tu rol</p>
                  <p className="text-xs sm:text-sm font-medium text-zinc-200 truncate">{getRolLabel(invitation.rol)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-zinc-500/10 border border-zinc-500/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-zinc-500">Email</p>
                  <p className="text-xs sm:text-sm font-medium text-zinc-200 truncate">{invitation.email}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 mt-2 sm:mt-3 border-t border-white/5 flex items-center justify-between text-[10px] sm:text-xs">
              <span className="text-zinc-500">
                Invitado por: {(invitation.inviter as any)?.nombre} {(invitation.inviter as any)?.apellido?.charAt(0)}.
              </span>
              <span className={`${timeRemaining === 'Expirada' ? 'text-red-400' : 'text-amber-400'}`}>
                {timeRemaining === 'Expirada' ? '⚠️ Expirada' : `Expira en ${timeRemaining}`}
              </span>
            </div>
          </div>
        )}

        {/* Steps / Instructions */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5 px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary-500 text-black text-[10px] sm:text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-[10px] sm:text-xs text-zinc-300 font-medium">Completa tus datos</span>
          </div>
          <div className="h-px flex-1 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-700 text-zinc-400 text-[10px] sm:text-xs font-bold flex items-center justify-center">2</span>
            <span className="text-[10px] sm:text-xs text-zinc-500">Confirma</span>
          </div>
          <div className="h-px flex-1 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-700 text-zinc-400 text-[10px] sm:text-xs font-bold flex items-center justify-center">3</span>
            <span className="text-[10px] sm:text-xs text-zinc-500">Listo</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#131316] border border-white/10 rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4">
          {/* Auth status indicator */}
          {authUser ? (
            <div className="p-2.5 sm:p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 sm:gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-emerald-400">Sesión verificada</p>
                <p className="text-[10px] sm:text-xs text-emerald-400/70 truncate">Conectado como {authUser.email}</p>
              </div>
            </div>
          ) : (
            <div className="p-2.5 sm:p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2.5 sm:gap-3">
              <Mail className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-blue-400">Acceso sin sesión</p>
                <p className="text-[10px] sm:text-xs text-blue-400/70">Usa el Magic Link del email para acceso directo</p>
              </div>
            </div>
          )}

          {/* Connection status warning */}
          {!isOnline && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 sm:gap-3">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs sm:text-sm text-amber-400">Sin conexión a internet</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 sm:gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs sm:text-sm text-red-400">{error}</p>
                {retryCount >= 2 && (
                  <p className="text-[10px] sm:text-xs text-red-400/70 mt-1">
                    Si el problema persiste, contacta a quien te invitó.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <label className="text-[11px] sm:text-xs font-medium text-zinc-400">Nombre <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, nombre: true }))}
                className={`w-full bg-[#0c0c0e] border rounded-lg px-3 py-2 sm:py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors ${
                  nombreError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-primary-500/50'
                }`}
                placeholder="Tu nombre"
                autoFocus
                disabled={isSubmitting}
              />
              {nombreError && <p className="text-[10px] sm:text-xs text-red-400">{nombreError}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] sm:text-xs font-medium text-zinc-400">Apellido <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, apellido: true }))}
                className={`w-full bg-[#0c0c0e] border rounded-lg px-3 py-2 sm:py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors ${
                  apellidoError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-primary-500/50'
                }`}
                placeholder="Tu apellido"
                disabled={isSubmitting}
              />
              {apellidoError && <p className="text-[10px] sm:text-xs text-red-400">{apellidoError}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] sm:text-xs font-medium text-zinc-400">Teléfono <span className="text-zinc-600">(opcional)</span></label>
            <div className="grid grid-cols-[100px_1fr] sm:grid-cols-[116px_1fr] gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(sanitizePhoneDigits(e.target.value))}
                className="w-full bg-[#0c0c0e] border border-white/10 rounded-lg px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm text-zinc-200 focus:border-primary-500/50 outline-none"
                disabled={isSubmitting}
              >
                {PHONE_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={telefono}
                  onChange={(e) => setTelefono(sanitizePhoneDigits(e.target.value))}
                  className="w-full bg-[#0c0c0e] border border-white/10 rounded-lg pl-10 pr-3 py-2 sm:py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none transition-colors"
                  placeholder="999999999"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !nombre.trim() || !apellido.trim() || !isOnline}
            className="w-full px-4 py-2.5 sm:py-3 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : (
              <>
                Unirme al equipo
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[10px] sm:text-xs text-zinc-600 pt-1">
            Al hacer clic en &quot;Unirme al equipo&quot; serás redirigido automáticamente a la plataforma.
          </p>
        </form>

        {/* Footer help */}
        <p className="text-center text-[10px] sm:text-xs text-zinc-600 mt-4 sm:mt-6">
          ¿Tienes problemas? Contacta a quien te envió la invitación.
        </p>
      </div>
      </div>
    </div>
  );
}
