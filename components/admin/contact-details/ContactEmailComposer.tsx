'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Mail,
  Sparkles,
  Send,
  X,
  Loader2,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Check,
  LinkIcon,
  Pencil,
  Clock,
  Target,
  Save,
} from 'lucide-react';
import { useContactStore, selectSelectedEnterpriseId } from '../../../store/contactStore';
import { useEmailMarketingStore, selectCampaigns } from '../../../store/emailMarketingStore';
import { useAuthStore } from '../../../store/authStore';
import { MarketingCampaignV2 } from '../../../types/marketing';

// ============================================================================
// TYPES
// ============================================================================

interface ContactEmailComposerProps {
  contactId: number;
  contactEmail: string;
  contactName: string;
  onClose: () => void;
  onSent?: () => void;
  /** If loading an existing draft from DB */
  initialDraftId?: number;
}

type ComposerState = 'config' | 'generating' | 'draft' | 'saving' | 'sending' | 'sent' | 'saved' | 'error';

// ============================================================================
// COMPONENT
// ============================================================================

export const ContactEmailComposer: React.FC<ContactEmailComposerProps> = ({
  contactId,
  contactEmail,
  contactName,
  onClose,
  onSent,
  initialDraftId,
}) => {
  // State
  const [state, setState] = useState<ComposerState>(initialDraftId ? 'draft' : 'config');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [draftId, setDraftId] = useState<number | null>(initialDraftId || null);
  const [error, setError] = useState<string | null>(null);
  const [advisorInfo, setAdvisorInfo] = useState<{ nombre: string; email: string; hasGrant: boolean } | null>(null);
  const [touchInfo, setTouchInfo] = useState<{ touchNumber: number; totalTouches: number | null } | null>(null);
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
  const [isEditingSubject, setIsEditingSubject] = useState(false);

  // Store
  const userContext = useContactStore(s => s.userContext);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const campaigns = useEmailMarketingStore(selectCampaigns);
  const enterpriseId = selectedEnterpriseId ?? userContext?.empresaId ?? null;

  // Fetch campaigns on mount
  useEffect(() => {
    if (enterpriseId) {
      useEmailMarketingStore.getState().fetchCampaigns(enterpriseId);
    }
  }, [enterpriseId]);

  // Load existing draft from DB if initialDraftId is provided
  useEffect(() => {
    if (!initialDraftId) return;
    const loadDraft = async () => {
      try {
        const { supabase } = await import('../../../lib/supabase-client');
        const { data } = await supabase
          .from('wp_email_envio')
          .select('id, asunto, cuerpo_html, campana_id, secuencia, remitente_team_humano')
          .eq('id', initialDraftId)
          .eq('estado', 'borrador')
          .single();

        if (data) {
          setSubject(data.asunto || '');
          setBodyHtml(data.cuerpo_html || '');
          setDraftId(data.id);
          if (data.campana_id) setSelectedCampaignId(data.campana_id);
          if (data.secuencia) setTouchInfo({ touchNumber: data.secuencia, totalTouches: null });
          setState('draft');
        }
      } catch (err) {
        console.error('[EmailComposer] Failed to load draft:', err);
      }
    };
    loadDraft();
  }, [initialDraftId]);

  // Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Active campaigns for selector
  const activeCampaigns = campaigns.filter(
    (c: MarketingCampaignV2) => c.estado === 'activa' || c.estado === 'borrador'
  );

  const selectedCampaign = activeCampaigns.find((c: MarketingCampaignV2) => c.id === selectedCampaignId) || null;

  // ================================================================
  // GENERATE DRAFT
  // ================================================================
  const handleGenerate = useCallback(async () => {
    setState('generating');
    setError(null);

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      const res = await fetch('/api/nylas/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          contactId,
          campaignId: selectedCampaignId,
          customInstructions: customInstructions.trim() || null,
          mode: 'draft',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al generar el borrador');
        setState('error');
        return;
      }

      setSubject(data.draft.subject);
      setBodyHtml(data.draft.bodyHtml);
      setDraftId(data.draftId || null);
      setAdvisorInfo(data.advisor);
      setTouchInfo({ touchNumber: data.touchNumber, totalTouches: data.totalTouches });
      setIsEditingSubject(false);
      setState('draft');
    } catch (err: any) {
      console.error('[EmailComposer] Generate error:', err);
      setError(err.message || 'Error de conexión');
      setState('error');
    }
  }, [contactId, selectedCampaignId, customInstructions]);

  // ================================================================
  // SAVE DRAFT (persist to DB without sending)
  // ================================================================
  const handleSaveDraft = useCallback(async () => {
    if (!draftId) return;
    setState('saving');
    setError(null);

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      const res = await fetch('/api/nylas/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          contactId,
          mode: 'save-draft',
          draftId,
          editedSubject: subject.trim(),
          editedBodyHtml: bodyHtml,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al guardar borrador');
        setState('draft');
        return;
      }

      setState('saved');
      setTimeout(() => {
        onSent?.(); // Refresh email list to show the draft
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[EmailComposer] Save draft error:', err);
      setError(err.message || 'Error de conexión');
      setState('draft');
    }
  }, [contactId, draftId, subject, bodyHtml, onSent, onClose]);

  // ================================================================
  // SEND EMAIL
  // ================================================================
  const handleSend = useCallback(async () => {
    if (!subject.trim() || !bodyHtml) return;
    setState('sending');
    setError(null);

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      const res = await fetch('/api/nylas/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          contactId,
          campaignId: selectedCampaignId,
          mode: 'send',
          draftId,
          editedSubject: subject.trim(),
          editedBodyHtml: bodyHtml,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al enviar');
        setState('draft');
        return;
      }

      setState('sent');
      setTimeout(() => {
        onSent?.();
      }, 2000);
    } catch (err: any) {
      console.error('[EmailComposer] Send error:', err);
      setError(err.message || 'Error de conexión');
      setState('draft');
    }
  }, [contactId, selectedCampaignId, subject, bodyHtml, draftId, onSent]);

  // ================================================================
  // RENDER
  // ================================================================

  const hasGrant = advisorInfo?.hasGrant ?? !!userContext?.grantId;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── HEADER ─── (hidden in draft state — draft has its own header) */}
        {state !== 'draft' && (
          <header className="shrink-0 px-5 py-4 border-b border-white/5 flex items-center gap-3 bg-gradient-to-b from-white/[0.04] to-transparent">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-zinc-100">Redactar Email con IA</h2>
              <p className="text-[11px] text-zinc-500 truncate">
                Para: <span className="text-zinc-400">{contactName}</span>
                <span className="mx-1.5 text-zinc-700">·</span>
                <span className="text-zinc-500">{contactEmail}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </header>
        )}

        {/* ─── BODY ─── */}
        <div className="flex-1 overflow-y-auto">

          {/* STATE: CONFIG */}
          {state === 'config' && (
            <div className="p-5 space-y-4">
              {/* Campaign Selector */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Campaña (opcional)
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowCampaignDropdown(!showCampaignDropdown)}
                    className="w-full h-11 flex items-center justify-between px-4 bg-zinc-900/50 border border-white/[0.08] rounded-xl text-sm text-zinc-300 hover:border-white/15 transition-colors"
                  >
                    <span className={selectedCampaign ? 'text-zinc-200' : 'text-zinc-600'}>
                      {selectedCampaign ? selectedCampaign.nombre : 'Sin campaña — email libre'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showCampaignDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showCampaignDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-[#0d0d0f] border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <button
                        onClick={() => { setSelectedCampaignId(null); setShowCampaignDropdown(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${!selectedCampaignId ? 'text-violet-400 bg-violet-500/5' : 'text-zinc-400'}`}
                      >
                        Sin campaña — email libre
                      </button>
                      {activeCampaigns.map((c: MarketingCampaignV2) => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCampaignId(c.id); setShowCampaignDropdown(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors border-t border-white/[0.04] ${selectedCampaignId === c.id ? 'text-violet-400 bg-violet-500/5' : 'text-zinc-300'}`}
                        >
                          <span className="font-medium">{c.nombre}</span>
                          {c.descripcion && (
                            <span className="block text-[10px] text-zinc-600 mt-0.5 truncate">{c.descripcion}</span>
                          )}
                        </button>
                      ))}
                      {activeCampaigns.length === 0 && (
                        <div className="px-4 py-3 text-xs text-zinc-600 text-center">
                          No hay campañas activas
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Instrucciones adicionales (opcional)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Ej: Menciona la promoción de este mes. Tono más casual. Incluye link al catálogo..."
                  rows={3}
                  className="w-full bg-zinc-900/50 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
              </div>

              {/* Context info */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
                <p className="text-[11px] text-violet-300/80 leading-relaxed">
                  La IA usará el contexto completo del contacto: conversaciones, citas, notas, cartera y emails previos para redactar un email personalizado.
                </p>
              </div>
            </div>
          )}

          {/* STATE: GENERATING */}
          {state === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl scale-150 animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-black/40 border border-violet-500/20 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-violet-400 animate-pulse" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-200">Generando email...</p>
                <p className="text-[11px] text-zinc-500">Analizando contexto del contacto y redactando borrador</p>
              </div>
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
            </div>
          )}

          {/* STATE: DRAFT — Email viewer style (mirrors ContactMarketing email viewer) */}
          {state === 'draft' && (
            <div className="flex flex-col h-full">
              {/* Email Header — like marketing viewer */}
              <div className="shrink-0 px-5 py-4 border-b border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent relative">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] pr-10">
                  {touchInfo && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/15 text-violet-300">
                      <Target className="w-3 h-3" />
                      Toque #{touchInfo.touchNumber}{touchInfo.totalTouches ? ` de ${touchInfo.totalTouches}` : ''}
                    </span>
                  )}
                  {selectedCampaign && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/50 border border-white/5 text-zinc-400">
                      <Mail className="w-3 h-3 text-violet-400" />
                      {selectedCampaign.nombre}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/15 text-amber-300">
                    <Clock className="w-3 h-3" />
                    Borrador
                  </span>
                </div>

                {/* Subject — inline editable */}
                {isEditingSubject ? (
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onBlur={() => setIsEditingSubject(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingSubject(false); }}
                    autoFocus
                    className="w-full text-lg font-bold text-zinc-100 bg-zinc-900/50 border border-violet-500/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all"
                  />
                ) : (
                  <button
                    onClick={() => setIsEditingSubject(true)}
                    className="group w-full text-left flex items-start gap-2"
                  >
                    <h2 className="text-lg font-bold text-zinc-100 leading-tight group-hover:text-white transition-colors">
                      {subject || '(Sin asunto)'}
                    </h2>
                    <Pencil className="w-3.5 h-3.5 text-zinc-700 group-hover:text-violet-400 transition-colors shrink-0 mt-1.5" />
                  </button>
                )}

                {/* To info */}
                <p className="text-[11px] text-zinc-500 mt-2">
                  Para: <span className="text-zinc-400">{contactName}</span>
                  <span className="mx-1.5 text-zinc-700">·</span>
                  <span className="text-zinc-500">{contactEmail}</span>
                </p>
              </div>

              {/* Email Body — HTML preview via iframe */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  srcDoc={bodyHtml}
                  sandbox="allow-same-origin"
                  title="Vista previa del email"
                  className="w-full h-full border-0"
                  style={{ minHeight: '350px' }}
                />
              </div>

              {/* Warnings section */}
              <div className="shrink-0 px-5 py-3 space-y-2">
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <p className="text-[11px] text-rose-300/80">{error}</p>
                  </div>
                )}
                {!hasGrant && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                    <LinkIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-[11px] text-amber-300/80">
                      No tienes un email conectado. Conecta tu cuenta en <strong>Configuración &gt; Integraciones</strong> para poder enviar.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STATE: SAVING */}
          {state === 'saving' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-sm font-medium text-zinc-200">Guardando borrador...</p>
            </div>
          )}

          {/* STATE: SAVED */}
          {state === 'saved' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Save className="w-8 h-8 text-violet-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-200">Borrador guardado</p>
                <p className="text-[11px] text-zinc-500">
                  Puedes revisarlo y enviarlo después
                </p>
              </div>
            </div>
          )}

          {/* STATE: SENDING */}
          {state === 'sending' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-sm font-medium text-zinc-200">Enviando email...</p>
            </div>
          )}

          {/* STATE: SENT */}
          {state === 'sent' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-200">Email enviado</p>
                <p className="text-[11px] text-zinc-500">
                  Enviado a {contactEmail} con tracking de apertura
                </p>
              </div>
            </div>
          )}

          {/* STATE: ERROR */}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-200">Error al generar</p>
                <p className="text-[11px] text-zinc-500 max-w-xs">{error}</p>
              </div>
              <button
                onClick={() => setState('config')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Intentar de nuevo
              </button>
            </div>
          )}
        </div>

        {/* ─── FOOTER ─── */}
        <footer className="shrink-0 px-5 py-3 border-t border-white/5 bg-zinc-900/30">
          {state === 'config' && (
            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-sm font-medium transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                Generar con IA
              </button>
            </div>
          )}

          {state === 'draft' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerar
                </button>
                <button
                  onClick={() => { setState('config'); setSubject(''); setBodyHtml(''); setDraftId(null); setIsEditingSubject(false); }}
                  className="px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Volver
                </button>
              </div>
              <div className="flex items-center gap-3">
                {advisorInfo && (
                  <span className="text-[10px] text-zinc-600 hidden sm:block">
                    Desde: {advisorInfo.email}
                  </span>
                )}
                {draftId && (
                  <button
                    onClick={handleSaveDraft}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                  >
                    <Save className="w-3 h-3" />
                    Guardar borrador
                  </button>
                )}
                <button
                  onClick={handleSend}
                  disabled={!hasGrant || !subject.trim() || !bodyHtml}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
                >
                  <Send className="w-4 h-4" />
                  Enviar
                </button>
              </div>
            </div>
          )}

          {state === 'sent' && (
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}

          {(state === 'generating' || state === 'sending' || state === 'saving') && (
            <div className="text-center text-[10px] text-zinc-600">
              Procesando...
            </div>
          )}
        </footer>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

export default ContactEmailComposer;
