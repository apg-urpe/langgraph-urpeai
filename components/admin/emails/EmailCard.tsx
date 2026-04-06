'use client';

import React from 'react';
import {
  Mail,
  MailOpen,
  Star,
  Paperclip,
  Clock,
  ChevronRight,
  AlertTriangle,
  Tag
} from 'lucide-react';
import { LocalEmail, EmailAnalysis } from '@/types/email';
import { useEmailStore } from '@/store/emailStore';

interface EmailCardProps {
  email: LocalEmail;
  onClick: () => void;
}

// Category colors
const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  ventas: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  soporte: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  interno: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
  personal: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  marketing: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  facturacion: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  legal: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  spam: { bg: 'bg-zinc-800', text: 'text-zinc-600', border: 'border-zinc-700' },
  otro: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
};

// Priority indicators
const priorityConfig = {
  alta: { color: 'text-red-400', bg: 'bg-red-500' },
  media: { color: 'text-yellow-400', bg: 'bg-yellow-500' },
  baja: { color: 'text-zinc-500', bg: 'bg-zinc-600' },
};

export const EmailCard: React.FC<EmailCardProps> = ({ email, onClick }) => {
  const analyses = useEmailStore(state => state.analyses);
  const analysis = analyses[email.id];

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 1) {
      const mins = Math.floor(diffMs / (1000 * 60));
      return `${mins}m`;
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h`;
    } else if (diffHours < 48) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    }
  };

  // Get sender display name
  const senderName = email.from[0]?.name || email.from[0]?.email?.split('@')[0] || 'Unknown';
  const senderInitial = senderName.charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border transition-all duration-200
        hover:bg-white/5 active:scale-[0.99]
        ${email.unread 
          ? 'bg-zinc-900/80 border-white/10' 
          : 'bg-zinc-900/40 border-white/5'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="shrink-0 relative">
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
            ${email.unread 
              ? 'bg-violet-500/20 text-violet-300' 
              : 'bg-zinc-800 text-zinc-400'
            }
          `}>
            {senderInitial}
          </div>
          
          {/* Priority dot */}
          {analysis && (
            <div 
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0c0c0e] ${priorityConfig[analysis.prioridad].bg}`}
              title={`Prioridad ${analysis.prioridad}`}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Sender + Date */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`text-sm truncate ${email.unread ? 'font-semibold text-zinc-200' : 'text-zinc-400'}`}>
              {senderName}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {email.starred && (
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              )}
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(email.date)}
              </span>
            </div>
          </div>

          {/* Subject */}
          <h3 className={`text-sm truncate mb-1 ${email.unread ? 'font-medium text-zinc-200' : 'text-zinc-400'}`}>
            {email.subject || '(Sin asunto)'}
          </h3>

          {/* Snippet */}
          <p className="text-xs text-zinc-500 line-clamp-2 mb-2">
            {email.snippet}
          </p>

          {/* Footer: Tags + Indicators */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Unread indicator */}
            {email.unread && (
              <span className="w-2 h-2 rounded-full bg-violet-500" />
            )}

            {/* Category badge (if analyzed) */}
            {analysis && (
              <span className={`
                px-1.5 py-0.5 text-[10px] font-medium rounded
                ${categoryColors[analysis.categoria]?.bg || categoryColors.otro.bg}
                ${categoryColors[analysis.categoria]?.text || categoryColors.otro.text}
                ${categoryColors[analysis.categoria]?.border || categoryColors.otro.border}
                border
              `}>
                {analysis.categoria}
              </span>
            )}

            {/* Requires response */}
            {analysis?.requiereRespuesta && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                Responder
              </span>
            )}

            {/* Attachments */}
            {email.hasAttachments && (
              <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                <Paperclip className="w-3 h-3" />
                Adjuntos
              </span>
            )}

            {/* Spacer + Arrow */}
            <div className="flex-1" />
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </div>
        </div>
      </div>
    </button>
  );
};
