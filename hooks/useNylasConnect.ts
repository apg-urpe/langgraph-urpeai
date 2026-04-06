import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Hook para manejar la conexión OAuth con Nylas
 * 
 * Permite a los usuarios conectar su cuenta de Google/Microsoft
 * para sincronizar calendario y emails.
 */

export interface NylasConnectState {
  isConnecting: boolean;
  error: string | null;
  success: boolean;
  connectedEmail: string | null;
}

export interface UseNylasConnectOptions {
  teamMemberId: number | string;
  redirectAfter?: string;
  onSuccess?: (email: string) => void;
  onError?: (error: string) => void;
}

export function useNylasConnect(options: UseNylasConnectOptions) {
  const { teamMemberId, redirectAfter = '/admin', onSuccess, onError } = options;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<NylasConnectState>({
    isConnecting: false,
    error: null,
    success: false,
    connectedEmail: null,
  });

  // Verificar parámetros de URL después del callback de OAuth
  useEffect(() => {
    if (!searchParams) return;
    
    const nylasError = searchParams.get('nylas_error');
    const nylasSuccess = searchParams.get('nylas_success');
    const nylasEmail = searchParams.get('nylas_email');

    if (nylasError) {
      setState(prev => ({
        ...prev,
        error: decodeURIComponent(nylasError),
        isConnecting: false,
      }));
      onError?.(decodeURIComponent(nylasError));
      
      // Limpiar URL
      const url = new URL(window.location.href);
      url.searchParams.delete('nylas_error');
      router.replace(url.pathname + url.search);
    }

    if (nylasSuccess === 'true') {
      setState(prev => ({
        ...prev,
        success: true,
        connectedEmail: nylasEmail || null,
        isConnecting: false,
      }));
      onSuccess?.(nylasEmail || '');
      
      // Limpiar URL
      const url = new URL(window.location.href);
      url.searchParams.delete('nylas_success');
      url.searchParams.delete('nylas_email');
      router.replace(url.pathname + url.search);
    }
  }, [searchParams, router, onSuccess, onError]);

  // Iniciar flujo OAuth con Google
  const connectGoogle = useCallback(() => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    
    const authUrl = `/api/nylas/auth?team_member_id=${teamMemberId}&provider=google&redirect_after=${encodeURIComponent(redirectAfter)}`;
    window.location.href = authUrl;
  }, [teamMemberId, redirectAfter]);

  // Iniciar flujo OAuth con Microsoft
  const connectMicrosoft = useCallback(() => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    
    const authUrl = `/api/nylas/auth?team_member_id=${teamMemberId}&provider=microsoft&redirect_after=${encodeURIComponent(redirectAfter)}`;
    window.location.href = authUrl;
  }, [teamMemberId, redirectAfter]);

  // Limpiar error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Limpiar estado de éxito
  const clearSuccess = useCallback(() => {
    setState(prev => ({ ...prev, success: false, connectedEmail: null }));
  }, []);

  return {
    ...state,
    connectGoogle,
    connectMicrosoft,
    clearError,
    clearSuccess,
  };
}

export default useNylasConnect;
