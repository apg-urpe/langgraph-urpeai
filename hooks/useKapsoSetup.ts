'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseKapsoSetupOptions {
  empresaId: number | null;
  onSuccess?: (phoneNumber: string | null) => void;
  onError?: (error: string) => void;
}

interface KapsoSetupState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  newPhoneNumber: string | null;
}

export function useKapsoSetup({ empresaId, onSuccess, onError }: UseKapsoSetupOptions) {
  const [state, setState] = useState<KapsoSetupState>({
    isLoading: false,
    error: null,
    success: false,
    newPhoneNumber: null,
  });

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Listen for postMessage from popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'kapso-setup-complete') return;

      // Stop polling
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      if (event.data.status === 'completed') {
        setState({
          isLoading: false,
          error: null,
          success: true,
          newPhoneNumber: event.data.phoneNumber || null,
        });
        onSuccessRef.current?.(event.data.phoneNumber || null);
      } else {
        const errorMsg = event.data.error || 'Error al conectar WhatsApp';
        setState({
          isLoading: false,
          error: errorMsg,
          success: false,
          newPhoneNumber: null,
        });
        onErrorRef.current?.(errorMsg);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startSetup = useCallback(async () => {
    if (!empresaId) return;

    setState({ isLoading: true, error: null, success: false, newPhoneNumber: null });

    try {
      const res = await fetch('/api/whatsapp/setup-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.details
          ? `${data.error}: ${data.details}`
          : data.error || 'Error generando link de setup';
        throw new Error(msg);
      }

      // Open popup
      const width = 600;
      const height = 700;
      const left = Math.round((screen.width - width) / 2);
      const top = Math.round((screen.height - height) / 2);

      const popup = window.open(
        data.url,
        'kapso-whatsapp-setup',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );

      if (!popup) {
        setState({
          isLoading: false,
          error: 'Tu navegador bloqueó la ventana emergente. Permite popups para este sitio e intenta de nuevo.',
          success: false,
          newPhoneNumber: null,
        });
        onErrorRef.current?.('Popup bloqueado');
        return;
      }

      popupRef.current = popup;

      // Poll for popup close (user cancelled)
      pollRef.current = setInterval(() => {
        if (popup.closed) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          // Only set cancelled if we haven't received a success/error message
          setState((prev) => {
            if (prev.isLoading) {
              onErrorRef.current?.('Configuración cancelada');
              return {
                isLoading: false,
                error: 'Configuración cancelada. El popup fue cerrado antes de completar.',
                success: false,
                newPhoneNumber: null,
              };
            }
            return prev;
          });
        }
      }, 1000);
    } catch (err: any) {
      setState({
        isLoading: false,
        error: err.message || 'Error inesperado',
        success: false,
        newPhoneNumber: null,
      });
      onErrorRef.current?.(err.message || 'Error inesperado');
    }
  }, [empresaId]);

  const clearState = useCallback(() => {
    setState({ isLoading: false, error: null, success: false, newPhoneNumber: null });
  }, []);

  return {
    ...state,
    startSetup,
    clearState,
  };
}
