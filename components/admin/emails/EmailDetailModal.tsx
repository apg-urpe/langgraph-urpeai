'use client';

/**
 * EmailDetailModal - Vista Minimalista de Correo
 * 
 * Al abrir un correo:
 * 1. Se marca como leído automáticamente (Nylas API)
 * 2. Se genera el análisis IA con Gemini
 * 3. Se muestra SOLO el resumen en Markdown (sin correo original)
 * 
 * Diseño: Minimalista, solo contenido relevante
 */

import React, { useEffect, useRef } from 'react';
import {
  X,
  Mail,
  User,
  Clock,
  Paperclip,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronRight,
  Tag
} from 'lucide-react';
import { useEmailStore } from '@/store/emailStore';

interface EmailDetailModalProps {
  emailId: string;
  onClose: () => void;
}

// Category styling
const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  ventas: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  soporte: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  interno: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' },
  personal: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  marketing: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  facturacion: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  legal: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  spam: { bg: 'bg-zinc-800/50', text: 'text-zinc-500', border: 'border-zinc-700/50' },
  otro: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' },
};

const priorityColors: Record<string, { text: string; icon: string }> = {
  alta: { text: 'text-red-400', icon: '🔴' },
  media: { text: 'text-yellow-400', icon: '🟡' },
  baja: { text: 'text-zinc-400', icon: '⚪' },
};

const sentimentIcons: Record<string, string> = {
  positivo: '😊',
  neutral: '😐',
  negativo: '😟',
};

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ emailId, onClose }) => {
  const hasInitialized = useRef(false);
  
  const emails = useEmailStore(state => state.emails);
  const analyses = useEmailStore(state => state.analyses);
  const isAnalyzing = useEmailStore(state => state.isAnalyzing);
  const analyzeEmail = useEmailStore(state => state.analyzeEmail);
  const markAsRead = useEmailStore(state => state.markAsRead);
  const fetchEmailBody = useEmailStore(state => state.fetchEmailBody);
  
  const email = emails.find(e => e.id === emailId);
  const analysis = analyses[emailId];

  // Auto-mark as read + Auto-analyze on mount
  useEffect(() => {
    if (!email || hasInitialized.current) return;
    hasInitialized.current = true;

    // 1. Marcar como leído si está sin leer
    if (email.unread) {
      markAsRead(emailId);
    }

    // 2. Fetch body si no existe
    if (!email.body) {
      fetchEmailBody(emailId);
    }

    // 3. Auto-analizar si no hay análisis
    if (!analyses[emailId]) {
      analyzeEmail(emailId);
    }
  }, [email, emailId, analyses, markAsRead, fetchEmailBody, analyzeEmail]);

  if (!email) {
    return null;
  }

  // Format date compacto
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const catStyle = categoryColors[analysis?.categoria || 'otro'];
  const prioStyle = priorityColors[analysis?.prioridad || 'media'];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl max-h-[85vh] bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <header className="shrink-0 p-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-violet-400" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-zinc-100 truncate">
              {email.subject || '(Sin asunto)'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {email.from[0]?.name || email.from[0]?.email?.split('@')[0]}
              </span>
              <ChevronRight className="w-3 h-3" />
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(email.date)}
              </span>
              {email.hasAttachments && (
                <span className="flex items-center gap-1 text-violet-400">
                  <Paperclip className="w-3 h-3" />
                  {email.attachments?.length || 1}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content - Solo Resumen IA */}
        <div className="flex-1 overflow-y-auto p-5">
          {isAnalyzing ? (
            // Loading State
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <div className="relative">
                <Loader2 className="w-10 h-10 animate-spin text-violet-400" />
                <Sparkles className="w-4 h-4 text-violet-300 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="mt-4 text-sm font-medium">Analizando correo con IA...</p>
              <p className="text-xs text-zinc-600 mt-1">Extrayendo información relevante</p>
            </div>
          ) : analysis ? (
            // Analysis Content - Markdown Style
            <div className="space-y-4">
              {/* Quick Info Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-md border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                  {analysis.categoria}
                </span>
                <span className={`text-xs ${prioStyle.text}`}>
                  {prioStyle.icon} Prioridad {analysis.prioridad}
                </span>
                <span className="text-xs text-zinc-500">
                  {sentimentIcons[analysis.sentimiento]} {analysis.sentimiento}
                </span>
              </div>

              {/* Resumen Principal */}
              <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {analysis.resumen}
                </p>
              </div>

              {/* Alerta de Respuesta */}
              {analysis.requiereRespuesta && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Este correo requiere respuesta</span>
                </div>
              )}

              {/* Tareas/Acciones */}
              {analysis.tareas.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-violet-400" />
                    Acciones Identificadas
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.tareas.map((task, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Keywords */}
              {analysis.palabrasClave.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-white/5">
                  <Tag className="w-3.5 h-3.5 text-zinc-600" />
                  {analysis.palabrasClave.map((kw, i) => (
                    <span 
                      key={i}
                      className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] font-medium rounded uppercase"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              {/* Entidades Extraídas */}
              {((analysis.entidades?.montos?.length ?? 0) > 0 || (analysis.entidades?.fechas?.length ?? 0) > 0) && (
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                  {(analysis.entidades?.montos?.length ?? 0) > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-zinc-500 uppercase">Montos</span>
                      <p className="text-sm text-emerald-400 font-medium">
                        {analysis.entidades?.montos?.join(', ')}
                      </p>
                    </div>
                  )}
                  {(analysis.entidades?.fechas?.length ?? 0) > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-zinc-500 uppercase">Fechas</span>
                      <p className="text-sm text-zinc-300">
                        {analysis.entidades?.fechas?.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Error/Fallback
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Mail className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">No se pudo analizar el correo</p>
              <button
                onClick={() => analyzeEmail(emailId)}
                className="mt-3 px-4 py-2 text-xs font-medium bg-violet-500/10 text-violet-300 rounded-lg hover:bg-violet-500/20 transition-colors"
              >
                Reintentar análisis
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
