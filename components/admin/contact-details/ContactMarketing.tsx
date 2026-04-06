'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Mail, 
  Send, 
  Clock, 
  XCircle,
  MousePointer,
  Eye,
  Inbox,
  Loader2,
  Target,
  X,
  Sparkles,
  PenLine,
  FileEdit,
  Receipt,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase-client';
import { useEmailMarketingStore, selectCampaigns } from '../../../store/emailMarketingStore';
import { ContactEmailComposer } from './ContactEmailComposer';
import { PaymentReceiptEmailModal } from './PaymentReceiptEmailModal';
import { getContactEmailDisplayKind, getPaymentReceiptSummary, shouldIncludeInContactEmailList } from '../../../lib/email-metadata';

interface EmailSend {
  id: number;
  campana_id: number | null;
  contacto_id: number;
  secuencia: number;
  estado: 'borrador' | 'pendiente' | 'programado' | 'enviado' | 'abierto' | 'clic' | 'fallido' | 'cancelado';
  asunto: string | null;
  cuerpo_html?: string | null;
  enviado_en: string | null;
  abierto_en: string | null;
  created_at: string;
  metadata?: unknown;
  emailType: 'marketing' | 'payment_receipt';
}

interface ContactMarketingProps {
  contactId: number;
  contactEmail?: string | null;
  contactName?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  borrador: { label: 'Borrador', color: 'text-amber-400 bg-amber-500/10', icon: FileEdit },
  pendiente: { label: 'Pendiente', color: 'text-zinc-400 bg-zinc-500/10', icon: Clock },
  programado: { label: 'Programado', color: 'text-amber-400 bg-amber-500/10', icon: Clock },
  enviado: { label: 'Enviado', color: 'text-blue-400 bg-blue-500/10', icon: Send },
  abierto: { label: 'Abierto', color: 'text-cyan-400 bg-cyan-500/10', icon: Mail },
  clic: { label: 'Click', color: 'text-violet-400 bg-violet-500/10', icon: MousePointer },
  fallido: { label: 'Fallido', color: 'text-rose-400 bg-rose-500/10', icon: XCircle },
  cancelado: { label: 'Cancelado', color: 'text-zinc-500 bg-zinc-600/10', icon: XCircle },
};

export const ContactMarketing: React.FC<ContactMarketingProps> = ({ contactId, contactEmail, contactName }) => {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailSend | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [composerDraftId, setComposerDraftId] = useState<number | null>(null);
  const [paymentReceiptEmailId, setPaymentReceiptEmailId] = useState<number | null>(null);
  
  const campaigns = useEmailMarketingStore(selectCampaigns);

  useEffect(() => {
    loadContactEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]); // loadContactEmails excluded - stable reference

  // Manejo de Escape solo para el modal de email
  useEffect(() => {
    if (!selectedEmail) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSelectedEmail(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedEmail]);

  const loadContactEmails = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('wp_email_envio')
        .select('id, campana_id, contacto_id, secuencia, estado, asunto, cuerpo_html, enviado_en, abierto_en, created_at, metadata')
        .eq('contacto_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const nextSends: EmailSend[] = [];

      for (const send of data || []) {
        if (!shouldIncludeInContactEmailList(send.metadata)) {
          continue;
        }

        const emailType = getContactEmailDisplayKind(send.metadata);
        if (!emailType) {
          continue;
        }

        nextSends.push({
          ...(send as Omit<EmailSend, 'emailType'>),
          emailType,
        });
      }

      setSends(nextSends);
    } catch (err) {
      console.error('Error loading contact emails:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCampaignName = (id: number) => {
    return campaigns.find(c => c.id === id)?.nombre || `Campaña #${id}`;
  };

  // Calcular estadísticas
  const stats = useMemo(() => ({
    total: sends.length,
    enviados: sends.filter(s => ['enviado', 'abierto', 'clic'].includes(s.estado)).length,
    abiertos: sends.filter(s => ['abierto', 'clic'].includes(s.estado)).length,
    clicks: sends.filter(s => s.estado === 'clic').length,
  }), [sends]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compose Button */}
      <button
        onClick={() => setShowComposer(true)}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl
                   bg-gradient-to-r from-violet-500/10 to-violet-600/5 border border-violet-500/20
                   text-sm font-medium text-violet-300 hover:text-violet-200
                   hover:border-violet-500/30 hover:from-violet-500/15 hover:to-violet-600/10
                   transition-all duration-300 group"
      >
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
          <PenLine className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <span>Redactar Email con IA</span>
        <Sparkles className="w-3.5 h-3.5 text-violet-500/60 group-hover:text-violet-400 transition-colors" />
      </button>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Send className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-blue-300/70">Correos</span>
          </div>
          <p className="text-lg font-bold text-blue-300">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Inbox className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-300/70">Entregados</span>
          </div>
          <p className="text-lg font-bold text-emerald-300">{stats.enviados}</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Mail className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-cyan-300/70">Abiertos</span>
          </div>
          <p className="text-lg font-bold text-cyan-300">{stats.abiertos}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <MousePointer className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] text-violet-300/70">Clicks</span>
          </div>
          <p className="text-lg font-bold text-violet-300">{stats.clicks}</p>
        </div>
      </div>

      {/* Email List */}
      {sends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-zinc-800/50 rounded-full mb-4">
            <Mail className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-sm font-medium text-zinc-400 mb-1">Sin correos enviados</h3>
          <p className="text-xs text-zinc-500">
            Los correos del contacto aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sends.map(send => {
            const statusConfig = STATUS_CONFIG[send.estado] || STATUS_CONFIG.enviado;
            const StatusIcon = statusConfig.icon;
            const paymentSummary = send.emailType === 'payment_receipt'
              ? getPaymentReceiptSummary(send.metadata)
              : null;

            return (
              <button
                key={send.id}
                onClick={() => {
                  if (send.emailType === 'payment_receipt') {
                    setPaymentReceiptEmailId(send.id);
                  } else if (send.estado === 'borrador' && contactEmail) {
                    setComposerDraftId(send.id);
                    setShowComposer(true);
                  } else {
                    setSelectedEmail(send);
                  }
                }}
                className="w-full text-left group bg-zinc-900/50 border border-white/5 rounded-xl p-3
                           hover:border-violet-500/20 hover:bg-zinc-800/50 
                           transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  {/* Status Icon */}
                  <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center shrink-0
                    ${send.estado === 'clic' ? 'bg-violet-500/20 border border-violet-500/20' :
                      send.estado === 'abierto' ? 'bg-cyan-500/20 border border-cyan-500/20' :
                      send.estado === 'enviado' ? 'bg-emerald-500/20 border border-emerald-500/20' :
                      send.estado === 'borrador' ? 'bg-amber-500/20 border border-amber-500/20' :
                      send.estado === 'programado' ? 'bg-amber-500/20 border border-amber-500/20' :
                      send.estado === 'fallido' ? 'bg-rose-500/20 border border-rose-500/20' :
                      'bg-zinc-500/20 border border-zinc-500/20'
                    }
                  `}>
                    <StatusIcon className={`w-4 h-4 ${statusConfig.color.split(' ')[0]}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                        {send.asunto || '(Sin asunto)'}
                      </p>
                      <span className={`
                        inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded-full shrink-0
                        ${statusConfig.color}
                      `}>
                        {statusConfig.label}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                      {send.emailType === 'payment_receipt' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">
                          <Receipt className="w-3 h-3" />
                          <span>Comprobante</span>
                        </span>
                      ) : send.campana_id ? (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-violet-400" />
                          <span className="text-zinc-400">{getCampaignName(send.campana_id)}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <PenLine className="w-3 h-3 text-zinc-500" />
                          <span className="text-zinc-500">Email libre</span>
                        </span>
                      )}
                      {paymentSummary?.serviceName && (
                        <span className="text-zinc-400 truncate">
                          {paymentSummary.serviceName}
                        </span>
                      )}
                      {send.secuencia > 1 && (
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3 text-cyan-400" />
                          <span className="text-zinc-400">Toque #{send.secuencia}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-zinc-600">
                        <Clock className="w-3 h-3" />
                        {formatDate(send.enviado_en || send.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* View Icon */}
                  <Eye className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Email Detail Modal - Rendered via Portal to escape parent overflow */}
      {selectedEmail && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setSelectedEmail(null)}
        >
          <div 
            className="w-full max-w-2xl max-h-[85vh] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="shrink-0 p-5 border-b border-white/5 flex items-start gap-4 bg-gradient-to-b from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-zinc-100 pr-8 leading-tight">
                  {selectedEmail.asunto || '(Sin asunto)'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                  {selectedEmail.campana_id ? (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800/50 border border-white/5 text-zinc-300">
                      Campaña: {getCampaignName(selectedEmail.campana_id)}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800/50 border border-white/5 text-zinc-400">
                      Email libre
                    </span>
                  )}
                  <span className="text-zinc-500 text-xs">
                    {formatDate(selectedEmail.enviado_en || selectedEmail.created_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-hidden">
              {selectedEmail.cuerpo_html ? (
                <iframe
                  srcDoc={selectedEmail.cuerpo_html}
                  sandbox="allow-same-origin"
                  title="Contenido del email"
                  className="w-full h-full border-0"
                  style={{ minHeight: '300px' }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Mail className="w-12 h-12 text-zinc-700 mb-3" />
                  <p className="text-zinc-500">Contenido del email no disponible</p>
                  <p className="text-zinc-600 text-xs mt-1">El cuerpo del mensaje no fue almacenado</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="shrink-0 p-4 border-t border-white/5 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <span className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                  ${STATUS_CONFIG[selectedEmail.estado]?.color || 'text-zinc-400 bg-zinc-500/10'}
                `}>
                  {STATUS_CONFIG[selectedEmail.estado]?.label || selectedEmail.estado}
                </span>
                {selectedEmail.secuencia > 1 && (
                  <span className="text-xs text-zinc-500">
                    Toque #{selectedEmail.secuencia}
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-600">
                Presiona ESC para cerrar
              </span>
            </footer>
          </div>
        </div>,
        document.body
      )}
      {/* Email Composer Modal */}
      {showComposer && contactEmail && (
        <ContactEmailComposer
          contactId={contactId}
          contactEmail={contactEmail}
          contactName={contactName || 'Contacto'}
          initialDraftId={composerDraftId || undefined}
          onClose={() => { setShowComposer(false); setComposerDraftId(null); }}
          onSent={() => {
            setShowComposer(false);
            setComposerDraftId(null);
            loadContactEmails();
          }}
        />
      )}
      {paymentReceiptEmailId && (
        <PaymentReceiptEmailModal
          emailId={paymentReceiptEmailId}
          contactId={contactId}
          contactEmail={contactEmail}
          contactName={contactName}
          onClose={() => setPaymentReceiptEmailId(null)}
          onSent={() => {
            void loadContactEmails();
          }}
        />
      )}

      {/* Composer fallback: no email */}
      {showComposer && !contactEmail && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setShowComposer(false)}
        >
          <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-8 max-w-sm text-center animate-pop-in" onClick={e => e.stopPropagation()}>
            <Mail className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-zinc-300 mb-1">Sin email registrado</h3>
            <p className="text-xs text-zinc-500 mb-4">Agrega un email al contacto para poder redactar correos.</p>
            <button
              onClick={() => setShowComposer(false)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-white/5 border border-white/10 rounded-lg transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ContactMarketing;
