'use client';

/**
 * EmailInboxView v3 - Estructura Unificada
 * 
 * - Input único para preguntas IA (sin buscador tradicional)
 * - Resumen inteligente mejorado inline
 * - Scroll optimizado
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Mail,
  RefreshCw,
  X,
  Inbox,
  Sparkles,
  AlertCircle,
  Loader2,
  MailWarning,
  Send,
  MessageSquare
} from 'lucide-react';
import { useEmailStore, selectEmails, selectIsLoading, selectError, selectLastSummary, selectIsCacheFresh } from '@/store/emailStore';
import { useContactStore, selectUserContext, selectSelectedEnterpriseId } from '@/store/contactStore';
import { useAuthStore } from '@/store/authStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { useAdminStore, DASHBOARD_CONTENT_MIN_WIDTH, DASHBOARD_CONTENT_MAX_WIDTH_NORMAL, DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED } from '@/store/adminStore';
import { EmailCard } from './EmailCard';
import { EmailDetailModal } from './EmailDetailModal';
import { NylasConnectPrompt } from '../NylasConnectPrompt';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * PERFORMANCE: Memoized Email Card to prevent re-renders of the entire list.
 */
const MemoizedEmailCard = React.memo(({ 
  email, 
  onClick 
}: { 
  email: any; 
  onClick: () => void; 
}) => (
  <EmailCard
    email={email}
    onClick={onClick}
  />
));
MemoizedEmailCard.displayName = 'MemoizedEmailCard';

// Sugerencias de preguntas
const QUICK_PROMPTS = [
  '¿Qué facturas llegaron?',
  '¿Correos urgentes?',
  'Resume todo',
];

export const EmailInboxView: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  
  // AI Query state
  const [queryInput, setQueryInput] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  
  // Stores
  const emails = useEmailStore(selectEmails);
  const isLoading = useEmailStore(selectIsLoading);
  const error = useEmailStore(selectError);
  const lastSummary = useEmailStore(selectLastSummary);
  const isCacheFresh = useEmailStore(selectIsCacheFresh);
  const fetchEmails = useEmailStore(state => state.fetchEmails);
  const queryEmails = useEmailStore(state => state.queryEmails);
  const generateSummary = useEmailStore(state => state.generateSummary);
  const clearError = useEmailStore(state => state.clearError);
  const isSummarizing = useEmailStore(state => state.isSummarizing);
  
  // Engagement tracking
  usePageTracking('emails');
  const trackAction = useActionTracking('emails');
  
  const userContext = useContactStore(selectUserContext);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const authUser = useAuthStore(state => state.user);
  const isMaximized = useAdminStore(state => state.isMaximized);
  
  // Get grant_id from user context and userId from auth
  const grantId = userContext?.grantId;
  const userId = authUser?.id;

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initial fetch
  useEffect(() => {
    if (grantId && selectedEnterpriseId && userId && !isCacheFresh) {
      fetchEmails(grantId, selectedEnterpriseId, userId);
    }
  }, [grantId, selectedEnterpriseId, userId, isCacheFresh, fetchEmails]);

  // AI Query handler - Busca directamente en Nylas (no requiere emails en cache)
  const handleAIQuery = useCallback(async (questionText?: string) => {
    const question = questionText || queryInput;
    if (!question.trim() || !grantId) return;
    
    setIsQuerying(true);
    setAiAnswer(null);
    trackAction('emails.ai_query', { query: question });
    
    try {
      const result = await queryEmails(question);
      if (result) {
        setAiAnswer(result);
      }
    } finally {
      setIsQuerying(false);
    }
  }, [queryInput, grantId, queryEmails, trackAction]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    if (!grantId || !selectedEnterpriseId || !userId) return;
    clearError();
    setQueryInput('');
    setAiAnswer(null);
    fetchEmails(grantId, selectedEnterpriseId, userId, { limit: 20 });
  }, [grantId, selectedEnterpriseId, userId, clearError, fetchEmails]);

  // Generate summary handler
  const handleGenerateSummary = useCallback(() => {
    if (emails.length > 0) {
      trackAction('emails.generate_summary', { emailCount: emails.length });
      generateSummary(10);
    }
  }, [emails, generateSummary, trackAction]);

  // Clear AI answer
  const handleClearAnswer = useCallback(() => {
    setAiAnswer(null);
    setQueryInput('');
  }, []);

  // Container width
  const containerMaxWidth = isMobile 
    ? '100%' 
    : isMaximized 
      ? DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED 
      : DASHBOARD_CONTENT_MAX_WIDTH_NORMAL;

  // Check if error is an invalid/expired grant
  const isInvalidGrantError = error?.toLowerCase().includes('grant inválido') || 
                              error?.toLowerCase().includes('invalid grant') ||
                              error?.toLowerCase().includes('expirado');

  // Invalid grant error - show reconnect prompt
  if (isInvalidGrantError && userContext?.id) {
    return (
      <NylasConnectPrompt
        teamMemberId={userContext.id}
        title="Reconecta tu cuenta de correo"
        description="Tu conexión de email ha expirado o es inválida. Por favor, vuelve a conectar tu cuenta para continuar usando Mi Email IA."
        showCalendarFeature={true}
        showEmailFeature={true}
        onSuccess={() => {
          clearError();
          window.location.reload();
        }}
      />
    );
  }

  // No grant configured - show connect prompt
  if (!grantId && userContext?.id) {
    return (
      <NylasConnectPrompt
        teamMemberId={userContext.id}
        title="Conecta tu cuenta de correo"
        description="Para usar Mi Email IA, conecta tu cuenta de Google o Microsoft para sincronizar tus emails."
        showCalendarFeature={true}
        showEmailFeature={true}
        onSuccess={() => {
          // Recargar la página para obtener el nuevo grant_id
          window.location.reload();
        }}
      />
    );
  }
  
  // No user context - show loading or error
  if (!grantId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <MailWarning className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">
          Email no configurado
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Inicia sesión para conectar tu cuenta de correo.
        </p>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col"
      style={{ 
        minWidth: isMobile ? '100%' : DASHBOARD_CONTENT_MIN_WIDTH,
        maxWidth: containerMaxWidth,
        margin: '0 auto'
      }}
    >
      {/* Header Compacto */}
      <header className="shrink-0 px-4 py-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-400" />
            <h1 className="text-base font-semibold text-zinc-200">Mi Email IA</h1>
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/20 text-violet-300 rounded">Lab</span>
            {emails.length > 0 && (
              <span className="text-xs text-zinc-500">{emails.length} correos</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateSummary}
              disabled={isSummarizing || emails.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Resumen</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Input Unificado IA */}
        <div className="relative">
          <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400" />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isQuerying && handleAIQuery()}
            placeholder="Pregunta IA... ej: ¿Qué facturas llegaron en octubre?"
            disabled={isQuerying || !grantId}
            className="w-full pl-10 pr-12 py-2.5 bg-zinc-900 border border-violet-500/30 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={() => handleAIQuery()}
            disabled={!queryInput.trim() || isQuerying || !grantId}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isQuerying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Prompts */}
        {!aiAnswer && !isQuerying && grantId && (
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => { setQueryInput(prompt); handleAIQuery(prompt); }}
                className="px-2.5 py-1 text-xs bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg whitespace-nowrap transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Error Banner */}
      {error && (
        <div className="shrink-0 mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="p-1 hover:bg-red-500/20 rounded"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Answer Display */}
        {(aiAnswer || isQuerying) && (
          <div className="px-4 pt-3">
            <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-300 uppercase tracking-wide">Respuesta IA</span>
                </div>
                {aiAnswer && (
                  <button onClick={handleClearAnswer} className="p-1 text-zinc-500 hover:text-zinc-300 rounded">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isQuerying ? (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                  <div>
                    <span className="text-sm text-zinc-300">Buscando en tu bandeja de correo...</span>
                    <p className="text-xs text-zinc-500 mt-0.5">Consultando servidor y analizando resultados</p>
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none text-zinc-300 
                  [&_p]:mb-3 [&_p]:leading-relaxed
                  [&_ul]:pl-4 [&_ul]:mb-3 [&_ul]:space-y-1
                  [&_ol]:pl-4 [&_ol]:mb-3 [&_ol]:space-y-1
                  [&_li]:mb-1 [&_li]:text-zinc-300
                  [&_strong]:text-zinc-100 [&_strong]:font-semibold
                  [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-zinc-100 [&_h1]:mt-4 [&_h1]:mb-2
                  [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-200 [&_h2]:mt-3 [&_h2]:mb-2
                  [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-violet-300 [&_h3]:mt-2 [&_h3]:mb-1
                  [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_table]:text-sm
                  [&_thead]:bg-zinc-800/50 [&_thead]:text-zinc-300
                  [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:border-b [&_th]:border-zinc-700
                  [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-zinc-800 [&_td]:text-zinc-400
                  [&_tr:hover]:bg-zinc-800/30
                  [&_hr]:my-4 [&_hr]:border-zinc-700
                  [&_blockquote]:border-l-2 [&_blockquote]:border-violet-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-400
                  [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:text-violet-300
                  [&_a]:text-violet-400 [&_a]:underline [&_a]:underline-offset-2
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnswer || ''}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resumen Inteligente Mejorado */}
        {lastSummary && !aiAnswer && !isQuerying && (
          <div className="px-4 pt-3">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-500/20">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-200">Resumen Inteligente</span>
                    <span className="text-xs text-zinc-500 ml-2">
                      {new Date(lastSummary.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                {lastSummary.urgentCount > 0 && (
                  <span className="px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 rounded-lg">
                    {lastSummary.urgentCount} urgentes
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed mb-3">{lastSummary.summary}</p>
              {lastSummary.highlights && lastSummary.highlights.length > 0 && (
                <ul className="space-y-1.5">
                  {lastSummary.highlights.slice(0, 3).map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="w-1 h-1 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-zinc-300 font-medium">{h.subject}</span>
                        <span className="text-zinc-500 ml-1">— {h.razon}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Email List */}
        <div className="p-4 space-y-2">
          {isLoading && emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <span className="text-sm">Cargando correos...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Inbox className="w-12 h-12 mb-3 opacity-50" />
              <span className="text-sm">No hay correos</span>
            </div>
          ) : (
            emails.map((email) => (
              <MemoizedEmailCard
                key={email.id}
                email={email}
                onClick={() => setSelectedEmailId(email.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedEmailId && (
        <EmailDetailModal
          emailId={selectedEmailId}
          onClose={() => setSelectedEmailId(null)}
        />
      )}
    </div>
  );
};

export default EmailInboxView;
