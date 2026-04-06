'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Clock
} from 'lucide-react';
import { EmailSummary } from '@/types/email';

interface EmailSummaryCardProps {
  summary: EmailSummary;
}

// Category colors
const categoryColors: Record<string, string> = {
  ventas: 'text-green-400',
  soporte: 'text-blue-400',
  interno: 'text-zinc-400',
  personal: 'text-purple-400',
  marketing: 'text-orange-400',
  facturacion: 'text-yellow-400',
  legal: 'text-red-400',
  spam: 'text-zinc-600',
  otro: 'text-zinc-400',
};

export const EmailSummaryCard: React.FC<EmailSummaryCardProps> = ({ summary }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Format generation time
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-violet-300">Resumen Inteligente</h3>
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Generado a las {formatTime(summary.generatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Urgent count badge */}
          {summary.urgentCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {summary.urgentCount} urgente{summary.urgentCount > 1 ? 's' : ''}
            </span>
          )}
          
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-zinc-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Summary Text */}
          <p className="text-sm text-zinc-300 leading-relaxed">
            {summary.summary}
          </p>

          {/* Highlights */}
          {summary.highlights.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Correos destacados
              </h4>
              <div className="space-y-2">
                {summary.highlights.map((highlight, i) => (
                  <div 
                    key={i}
                    className="p-2 bg-zinc-900/50 rounded-lg border-l-2 border-violet-500/50"
                  >
                    <p className="text-sm font-medium text-zinc-300 truncate">
                      {highlight.subject}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {highlight.razon}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Actions */}
          {summary.pendingActions.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Acciones pendientes
              </h4>
              <ul className="space-y-1">
                {summary.pendingActions.map((action, i) => (
                  <li 
                    key={i}
                    className="flex items-start gap-2 text-sm text-zinc-400"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-2 shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top Categories */}
          {summary.topCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
              {summary.topCategories.map((cat, i) => (
                <span 
                  key={i}
                  className={`text-xs ${categoryColors[cat.categoria] || 'text-zinc-400'}`}
                >
                  {cat.categoria}: {cat.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
