'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type CallbackStatus = 'loading' | 'success' | 'error';

function SetupStatusView({ status, message }: { status: CallbackStatus; message: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#131316] border border-white/5 rounded-2xl p-8 text-center space-y-4">
        {/* Icon */}
        <div className="flex justify-center">
          {status === 'loading' && (
            <div className="w-16 h-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          )}
          {status === 'success' && (
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {status === 'error' && (
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className={`text-lg font-semibold ${
          status === 'success' ? 'text-emerald-300' :
          status === 'error' ? 'text-red-300' :
          'text-zinc-300'
        }`}>
          {status === 'success' && 'WhatsApp conectado'}
          {status === 'error' && 'Error de conexión'}
          {status === 'loading' && 'Conectando...'}
        </h1>

        {/* Message */}
        <p className="text-sm text-zinc-400">{message}</p>

        {/* Close hint */}
        {status !== 'loading' && (
          <p className="text-xs text-zinc-600">
            Esta ventana se cerrará automáticamente...
          </p>
        )}
      </div>
    </div>
  );
}

function KapsoSetupCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Procesando...');
  const processed = useRef(false);

  const savePhoneNumber = useCallback(async (
    empresaId: number,
    phoneNumberId: string,
    businessAccountId: string | null,
    displayPhoneNumber: string | null
  ) => {
    try {
      const res = await fetch('/api/whatsapp/setup-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaId,
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId || null,
          display_phone_number: displayPhoneNumber || phoneNumberId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error guardando número');
      }

      setStatus('success');
      setMessage(
        data.duplicate
          ? 'Este número ya estaba registrado'
          : `WhatsApp ${displayPhoneNumber ? decodeURIComponent(displayPhoneNumber) : ''} conectado`
      );

      notifyParent({
        type: 'kapso-setup-complete',
        status: 'completed',
        phoneNumber: displayPhoneNumber ? decodeURIComponent(displayPhoneNumber) : null,
        phoneNumberId,
      });
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Error guardando el número');
      notifyParent({ type: 'kapso-setup-complete', status: 'failed', error: err.message });
    }

    autoClose();
  }, []);

  useEffect(() => {
    if (processed.current || !searchParams) return;
    processed.current = true;

    const empresaId = searchParams.get('empresa_id');
    const failed = searchParams.get('failed');
    const errorCode = searchParams.get('error_code');

    // Failure redirect from Kapso
    if (failed || errorCode) {
      const errorMessages: Record<string, string> = {
        facebook_auth_failed: 'Se canceló el login con Facebook',
        phone_verification_failed: 'Falló la verificación del teléfono',
        waba_limit_reached: 'Se alcanzó el límite de cuentas WhatsApp',
        link_expired: 'El link expiró (válido 30 días)',
      };
      const msg = errorMessages[errorCode || ''] || 'Error al conectar WhatsApp';
      setStatus('error');
      setMessage(msg);
      notifyParent({ type: 'kapso-setup-complete', status: 'failed', error: msg });
      autoClose();
      return;
    }

    // Success redirect from Kapso
    const phoneNumberId = searchParams.get('phone_number_id');
    const businessAccountId = searchParams.get('business_account_id');
    const displayPhoneNumber = searchParams.get('display_phone_number');
    const completedStatus = searchParams.get('status');

    if (completedStatus === 'completed' && phoneNumberId && empresaId) {
      savePhoneNumber(
        Number(empresaId),
        phoneNumberId,
        businessAccountId,
        displayPhoneNumber
      );
    } else {
      setStatus('error');
      setMessage('Parámetros de respuesta incompletos');
      notifyParent({ type: 'kapso-setup-complete', status: 'failed', error: 'Parámetros incompletos' });
      autoClose();
    }
  }, [savePhoneNumber, searchParams]);

  function notifyParent(data: Record<string, unknown>) {
    try {
      if (window.opener) {
        window.opener.postMessage(data, window.location.origin);
      }
    } catch {
      // opener may be null if popup was opened cross-origin
    }
  }

  function autoClose() {
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // some browsers block window.close
      }
    }, 3000);
  }

  return <SetupStatusView status={status} message={message} />;
}

function KapsoSetupCallbackFallback() {
  return <SetupStatusView status="loading" message="Procesando..." />;
}

export default function KapsoSetupCallbackPage() {
  return (
    <Suspense fallback={<KapsoSetupCallbackFallback />}>
      <KapsoSetupCallbackContent />
    </Suspense>
  );
}

