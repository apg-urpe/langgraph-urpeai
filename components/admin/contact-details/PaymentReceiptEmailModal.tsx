'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Mail, Receipt, Save, Send, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase-client';
import { useAuthStore } from '../../../store/authStore';
import { useContactStore } from '../../../store/contactStore';
import { useTeamStore } from '../../../store/teamStore';
import { formatCurrency } from '../../../types/finance';
import { getPaymentReceiptSummary } from '../../../lib/email-metadata';

interface PaymentReceiptEmailModalProps {
  emailId: number;
  contactId: number;
  contactEmail?: string | null;
  contactName?: string;
  onClose: () => void;
  onSent?: () => void;
}

interface EmailRecord {
  id: number;
  asunto: string | null;
  cuerpo_html: string | null;
  estado: string;
  enviado_en: string | null;
  created_at: string;
  metadata?: unknown;
}

export const PaymentReceiptEmailModal: React.FC<PaymentReceiptEmailModalProps> = ({
  emailId,
  contactId,
  contactEmail,
  contactName,
  onClose,
  onSent,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<EmailRecord | null>(null);
  const [subject, setSubject] = useState('');

  const accessToken = useAuthStore(state => state.session?.access_token);
  const userContext = useContactStore(state => state.userContext);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const fetchNylasGrantsStatus = useTeamStore(state => state.fetchNylasGrantsStatus);
  const nylasStatus = useTeamStore(state => {
    if (!userContext?.id) return null;
    return state.nylasGrants.find(grant => grant.memberId === userContext.id) || null;
  });
  const hasGrant = !!userContext?.grantId;
  const hasInvalidGrant = hasGrant && !!nylasStatus && nylasStatus.status !== 'valid';
  const canSendEmail = hasGrant && !hasInvalidGrant;

  useEffect(() => {
    if (!selectedEnterpriseId || !userContext?.id) return;
    void fetchNylasGrantsStatus(selectedEnterpriseId);
  }, [selectedEnterpriseId, userContext?.id, fetchNylasGrantsStatus]);

  useEffect(() => {
    let cancelled = false;

    const loadEmail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from('wp_email_envio')
          .select('id, asunto, cuerpo_html, estado, enviado_en, created_at, metadata')
          .eq('id', emailId)
          .eq('contacto_id', contactId)
          .single();

        if (loadError) {
          throw loadError;
        }

        if (!cancelled) {
          setRecord(data as EmailRecord);
          setSubject(data?.asunto || '');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'No se pudo cargar el email');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadEmail();

    return () => {
      cancelled = true;
    };
  }, [emailId, contactId]);

  const summary = useMemo(() => getPaymentReceiptSummary(record?.metadata), [record?.metadata]);
  const isDraft = record?.estado === 'borrador';
  const hasSubjectChanges = subject.trim() !== (record?.asunto || '').trim();

  const formattedTimestamp = useMemo(() => {
    const value = record?.enviado_en || record?.created_at;
    if (!value) return null;

    return new Date(value).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [record?.created_at, record?.enviado_en]);

  const handleSave = async () => {
    if (!record || !isDraft || !hasSubjectChanges) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/nylas/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          contactId,
          mode: 'save-draft',
          draftId: record.id,
          editedSubject: subject.trim() || '(Sin asunto)'
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudo guardar el borrador');
      }

      setRecord(current => current ? { ...current, asunto: subject.trim() || '(Sin asunto)' } : current);
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el borrador');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!record || !isDraft || !canSendEmail) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/nylas/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          contactId,
          mode: 'send',
          draftId: record.id,
          editedSubject: subject.trim() || '(Sin asunto)'
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudo enviar el email');
      }

      const sentAt = new Date().toISOString();
      setRecord(current => current ? { ...current, asunto: subject.trim() || '(Sin asunto)', estado: 'enviado', enviado_en: sentAt } : current);
      onSent?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el email');
    } finally {
      setIsSending(false);
    }
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[92vh] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <header className="shrink-0 p-4 sm:p-5 border-b border-white/5 flex items-start gap-4 bg-gradient-to-b from-white/5 to-transparent">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
                Pago registrado
              </span>
              <span className={`px-2 py-0.5 rounded-md border text-xs ${isDraft ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'}`}>
                {isDraft ? 'Borrador' : record?.estado || 'Email'}
              </span>
              {formattedTimestamp && (
                <span className="text-xs text-zinc-500">{formattedTimestamp}</span>
              )}
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!isDraft || isSaving || isSending || isLoading}
              className="w-full bg-transparent text-lg font-bold text-zinc-100 leading-tight focus:outline-none disabled:opacity-100"
            />
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
              <span className="px-2 py-0.5 rounded-md bg-zinc-800/50 border border-white/5 text-zinc-300">
                Para: {contactName || 'Contacto'}{contactEmail ? ` (${contactEmail})` : ''}
              </span>
              {summary?.serviceName && (
                <span className="px-2 py-0.5 rounded-md bg-zinc-800/50 border border-white/5 text-zinc-400">
                  {summary.serviceName}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </header>

        <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-white/5 bg-zinc-950/40">
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 text-xs">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <p className="text-zinc-500">Monto</p>
              <p className="text-zinc-200 mt-1">{summary?.monto != null ? formatCurrency(summary.monto, summary.moneda || 'USD') : '-'}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <p className="text-zinc-500">Fecha</p>
              <p className="text-zinc-200 mt-1">{summary?.fechaPago ? new Date(summary.fechaPago).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <p className="text-zinc-500">Método</p>
              <p className="text-zinc-200 mt-1 truncate">{summary?.metodoPago || '-'}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <p className="text-zinc-500">Referencia</p>
              <p className="text-zinc-200 mt-1 truncate">{summary?.referencia || '-'}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 col-span-2 xl:col-span-1">
              <p className="text-zinc-500">Estado email</p>
              <p className={`mt-1 font-medium ${isDraft ? 'text-amber-300' : 'text-emerald-300'}`}>
                {isDraft ? 'Borrador listo para envío' : 'Enviado'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-[#eef2f7]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full bg-[#0c0c0e]">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          ) : record?.cuerpo_html ? (
            <div className="h-full p-3 sm:p-4">
              <iframe
                srcDoc={record.cuerpo_html}
                sandbox="allow-same-origin"
                title="Preview email pago"
                className="w-full h-full border-0 bg-white rounded-2xl shadow-sm"
                style={{ minHeight: '520px' }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-[#0c0c0e] text-center px-6">
              <Mail className="w-12 h-12 text-zinc-700 mb-3" />
              <p className="text-zinc-500">Contenido del email no disponible</p>
            </div>
          )}
        </div>

        <footer className="shrink-0 p-4 border-t border-white/5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-zinc-900/50">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {summary?.saldoPendiente != null && (
              <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5">
                Saldo pendiente: {formatCurrency(summary.saldoPendiente, summary.moneda || 'USD')}
              </span>
            )}
            {summary?.comprobanteUrl && (
              <a
                href={summary.comprobanteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-cyan-300 hover:text-cyan-200 transition-colors"
              >
                Ver comprobante
              </a>
            )}
            {!canSendEmail && isDraft && (
              <span className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300">
                {hasInvalidGrant ? 'Reconecta tu email para enviar' : 'Conecta tu email para enviar'}
              </span>
            )}
            {error && (
              <span className="px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300">
                {error}
              </span>
            )}
            {!error && !isDraft && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Email enviado
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              Cerrar
            </button>
            {isDraft && (
              <button
                onClick={handleSave}
                disabled={isSaving || isSending || !hasSubjectChanges}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white/5 text-zinc-200 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar borrador
              </button>
            )}
            {isDraft && (
              <button
                onClick={handleSend}
                disabled={isSending || isSaving || !canSendEmail}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar email
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default PaymentReceiptEmailModal;
