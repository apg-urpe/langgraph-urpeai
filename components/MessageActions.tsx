/**
 * MessageActions - Acciones para mensajes del asistente
 * 
 * Características:
 * - Feedback (like/dislike) con animación
 * - Copiar contenido al portapapeles
 * - Eliminar mensaje con confirmación
 * - Diseño sutil, aparece al hover
 */

import React, { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Copy, Check, Trash2 } from 'lucide-react';
import { MessageFeedback as FeedbackType } from '../types/chat';
import { logger } from '@/lib/logger';

interface MessageActionsProps {
  messageId: string;
  content: string;
  currentFeedback: FeedbackType;
  onFeedback: (messageId: string, feedback: FeedbackType) => void;
  onArchive: (messageId: string) => void;
  disabled?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({ 
  messageId, 
  content,
  currentFeedback, 
  onFeedback,
  onArchive,
  disabled = false 
}) => {
  const [animating, setAnimating] = useState<'like' | 'dislike' | null>(null);
  const [justClicked, setJustClicked] = useState<'like' | 'dislike' | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleFeedbackClick = useCallback((type: 'like' | 'dislike') => {
    if (disabled) return;
    
    setAnimating(type);
    setJustClicked(type);
    
    const newValue = currentFeedback === type ? null : type;
    onFeedback(messageId, newValue);
    
    setTimeout(() => setAnimating(null), 300);
    setTimeout(() => setJustClicked(null), 600);
  }, [messageId, currentFeedback, onFeedback, disabled]);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('[MessageActions] Error copying to clipboard:', err);
    }
  }, [content, disabled]);

  const handleDelete = useCallback(() => {
    if (disabled) return;
    
    if (!confirmDelete) {
      setConfirmDelete(true);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    
    onArchive(messageId);
    setConfirmDelete(false);
  }, [messageId, onArchive, confirmDelete, disabled]);

  // Base button styles
  const baseButtonClass = `
    relative p-1.5 rounded-lg transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-95
  `;

  return (
    <div className="flex items-center gap-0.5 mt-3 pt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
      {/* Like Button */}
      <button
        onClick={() => handleFeedbackClick('like')}
        disabled={disabled}
        className={`
          ${baseButtonClass}
          ${currentFeedback === 'like'
            ? 'text-emerald-400 bg-emerald-500/15 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          }
          ${animating === 'like' ? 'scale-125' : 'scale-100'}
        `}
        title="Me gusta esta respuesta"
        aria-label="Me gusta"
      >
        <ThumbsUp 
          className={`w-3.5 h-3.5 transition-all duration-200 ${
            currentFeedback === 'like' ? 'fill-emerald-400/30' : ''
          }`} 
        />
        {justClicked === 'like' && (
          <span className="absolute inset-0 rounded-lg bg-emerald-400/20 animate-ping" />
        )}
      </button>

      {/* Dislike Button */}
      <button
        onClick={() => handleFeedbackClick('dislike')}
        disabled={disabled}
        className={`
          ${baseButtonClass}
          ${currentFeedback === 'dislike'
            ? 'text-red-400 bg-red-500/15 shadow-[0_0_12px_rgba(248,113,113,0.2)]'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          }
          ${animating === 'dislike' ? 'scale-125' : 'scale-100'}
        `}
        title="No me gusta esta respuesta"
        aria-label="No me gusta"
      >
        <ThumbsDown 
          className={`w-3.5 h-3.5 transition-all duration-200 ${
            currentFeedback === 'dislike' ? 'fill-red-400/30' : ''
          }`} 
        />
        {justClicked === 'dislike' && (
          <span className="absolute inset-0 rounded-lg bg-red-400/20 animate-ping" />
        )}
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-zinc-700/50 mx-1" />

      {/* Copy Button */}
      <button
        onClick={handleCopy}
        disabled={disabled}
        className={`
          ${baseButtonClass}
          ${copied
            ? 'text-emerald-400 bg-emerald-500/15'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          }
        `}
        title={copied ? 'Copiado!' : 'Copiar mensaje'}
        aria-label="Copiar"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Delete Button */}
      <button
        onClick={handleDelete}
        disabled={disabled}
        className={`
          ${baseButtonClass}
          ${confirmDelete
            ? 'text-red-400 bg-red-500/20 animate-pulse'
            : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
          }
        `}
        title={confirmDelete ? 'Clic de nuevo para confirmar' : 'Archivar mensaje'}
        aria-label="Archivar"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default MessageActions;
