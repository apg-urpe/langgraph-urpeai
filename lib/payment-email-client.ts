import { useAuthStore } from '../store/authStore';

export interface PaymentReceiptDraftResponse {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  message?: string;
  draftId?: number | null;
  status?: string;
  action?: 'created' | 'updated';
  advisor?: {
    hasGrant?: boolean;
  };
}

export async function requestPaymentReceiptDraft(paymentId: number, accessToken?: string | null) {
  const resolvedAccessToken = accessToken ?? useAuthStore.getState().session?.access_token ?? null;

  const response = await fetch('/api/nylas/payment-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(resolvedAccessToken ? { 'Authorization': `Bearer ${resolvedAccessToken}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ paymentId }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || 'No se pudo preparar el email de pago');
  }

  return data as PaymentReceiptDraftResponse;
}
