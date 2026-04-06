'use client';

import React from 'react';
import Image from 'next/image';
import { sanitizeHtml, sanitizeCardContent } from '../lib/sanitize-html';
import { BlockActions } from './BlockActions';
import { cardPalette } from '../lib/ui/CardPalette';
import type { BlockAction, BlockTheme } from '../types/chat';

interface CardItemAction {
  id?: string;
  action?: string;
  label: string;
  payload?: any;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

interface CardItem {
  title: string;
  subtitle?: string;
  description?: string;
  content?: string;
  image?: string;
  theme?: BlockTheme;
  actions?: CardItemAction[];
}

interface CardsBlockProps {
  title?: string;
  data: {
    cards?: CardItem[];
  };
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

const themeToStyles: Record<BlockTheme, { border: string; glow: string }> = {
  default: { border: 'border-white/10', glow: '' },
  success: { border: cardPalette.border.success, glow: cardPalette.shadow.glowSuccess },
  warning: { border: cardPalette.border.warning, glow: cardPalette.shadow.glowWarning },
  error: { border: cardPalette.border.error, glow: cardPalette.shadow.glowError },
  info: { border: cardPalette.border.info, glow: cardPalette.shadow.glowInfo },
  special: { border: 'border-violet-500/30', glow: 'shadow-[0_0_20px_rgb(139,92,246)/0.3]' },
  neutral: { border: 'border-cyan-500/30', glow: 'shadow-[0_0_20px_rgb(6,182,212)/0.3]' },
  primary: { border: 'border-blue-500/30', glow: 'shadow-[0_0_20px_rgb(59,130,246)/0.3]' },
  secondary: { border: 'border-emerald-500/30', glow: 'shadow-[0_0_20px_rgb(16,185,129)/0.3]' },
};

export const CardsBlock: React.FC<CardsBlockProps> = ({ 
  title, 
  data,
  onInteract,
  disabled = false
}) => {
  const handleAction = (action: BlockAction) => {
    if (onInteract) {
      onInteract({ action: action.id, payload: action.payload });
    }
  };
  
  const normalizeActions = (actions: CardItemAction[]): BlockAction[] => {
    return actions.map((a, idx) => ({
      id: a.id || a.action || `action-${idx}`,
      label: a.label,
      payload: a.payload,
      variant: a.variant
    }));
  };

  return (
    <div className="bg-black/40 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
      <div className="px-6 md:px-7 py-5 border-b border-white/10 bg-gradient-to-br from-zinc-900/70 via-zinc-900/40 to-black/60">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-primary-400/80">Bloques</p>
            <h3 className="text-zinc-50 text-xl font-bold leading-tight">{title || 'Información'}</h3>
          </div>
          <div className="h-8 w-8 rounded-xl border border-white/10 bg-zinc-900/70 flex items-center justify-center text-primary-300 text-xs">
            🗂️
          </div>
        </div>
      </div>
      <div className="p-6 md:p-7 space-y-4">
        {data.cards && data.cards.length > 0 ? (
          data.cards.map((card, index) => {
            const styles = card.theme ? themeToStyles[card.theme] : themeToStyles.default;
            const cardContent = card.description || card.content || '';
            
            return (
              <div 
                key={index}
                className={`rounded-2xl border bg-zinc-900/40 p-4 md:p-5 shadow-inner transition-all duration-200 hover:bg-zinc-900/60 ${styles.border}`}
                style={styles.glow ? { boxShadow: styles.glow } : undefined}
              >
                <div className="flex gap-4">
                  {card.image && (
                    <div className="shrink-0 relative w-12 h-12">
                      <Image 
                        src={card.image} 
                        alt={card.title}
                        fill
                        className="rounded-xl object-cover border border-white/10"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-zinc-100 text-base font-semibold">
                      {card.title}
                    </h4>
                    {card.subtitle && (
                      <p className="text-zinc-400 text-sm mt-0.5">
                        {card.subtitle}
                      </p>
                    )}
                    {cardContent && (
                      <div 
                        className="text-zinc-300 text-sm leading-relaxed mt-2"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(sanitizeCardContent(cardContent)) }}
                      />
                    )}
                    {card.actions && card.actions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <BlockActions 
                          actions={normalizeActions(card.actions)} 
                          onInteract={handleAction}
                          disabled={disabled}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-zinc-500 text-sm text-center py-8">
            No hay tarjetas disponibles
          </div>
        )}
      </div>
    </div>
  );
};
