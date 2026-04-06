'use client';

import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Users,
  Calendar,
  MessageSquare,
  Target,
  Zap,
  Mail,
  ArrowDownRight,
  ArrowUpRight
} from 'lucide-react';
import { BlockAction, BlockTheme } from '../types/chat';
import { BlockActions } from './BlockActions';

interface KpiCardProps {
  title: string;
  value: string;
  trend: string;
  trendDirection: 'up' | 'down' | 'neutral';
  description?: string;
  theme?: BlockTheme;
  actions?: BlockAction[];
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

// Icon mapping based on title keywords
const getIconForTitle = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes('contacto') || t.includes('client') || t.includes('lead')) return Users;
  if (t.includes('cita') || t.includes('calendar') || t.includes('appointment')) return Calendar;
  if (t.includes('mensaje') || t.includes('message') || t.includes('chat')) return MessageSquare;
  if (t.includes('conversión') || t.includes('conversion') || t.includes('efectividad')) return Target;
  if (t.includes('email') || t.includes('correo') || t.includes('marketing')) return Mail;
  if (t.includes('rebote') || t.includes('bounce')) return ArrowDownRight;
  return Zap;
};

// Square UI Style: Theme configuration with accent colors
const themeConfig: Record<BlockTheme, { 
  accent: string; 
  accentBg: string;
  iconBg: string;
}> = {
  default: { accent: 'text-zinc-400', accentBg: 'bg-zinc-500/10', iconBg: 'bg-zinc-800/80' },
  success: { accent: 'text-emerald-400', accentBg: 'bg-emerald-500/10', iconBg: 'bg-emerald-500/20' },
  warning: { accent: 'text-amber-400', accentBg: 'bg-amber-500/10', iconBg: 'bg-amber-500/20' },
  error: { accent: 'text-rose-400', accentBg: 'bg-rose-500/10', iconBg: 'bg-rose-500/20' },
  info: { accent: 'text-blue-400', accentBg: 'bg-blue-500/10', iconBg: 'bg-blue-500/20' },
  special: { accent: 'text-violet-400', accentBg: 'bg-violet-500/10', iconBg: 'bg-violet-500/20' },
  neutral: { accent: 'text-cyan-400', accentBg: 'bg-cyan-500/10', iconBg: 'bg-cyan-500/20' },
  primary: { accent: 'text-blue-400', accentBg: 'bg-blue-500/10', iconBg: 'bg-blue-500/20' },
  secondary: { accent: 'text-emerald-400', accentBg: 'bg-emerald-500/10', iconBg: 'bg-emerald-500/20' }
};

// Auto-infer theme from trend if not provided
const inferTheme = (trendDirection: 'up' | 'down' | 'neutral', explicitTheme?: BlockTheme): BlockTheme => {
  if (explicitTheme) return explicitTheme;
  switch (trendDirection) {
    case 'up': return 'success';
    case 'down': return 'error';
    default: return 'default';
  }
};

// Trend styling with neon glow effects (Square UI pattern)
const getTrendStyle = (direction: 'up' | 'down' | 'neutral') => {
  switch (direction) {
    case 'up':
      return {
        color: 'text-green-400',
        shadow: '0 1px 6px rgba(68, 255, 118, 0.25)',
        Icon: ArrowUpRight
      };
    case 'down':
      return {
        color: 'text-pink-400',
        shadow: '0 1px 6px rgba(255, 68, 193, 0.25)',
        Icon: ArrowDownRight
      };
    default:
      return {
        color: 'text-zinc-500',
        shadow: 'none',
        Icon: Minus
      };
  }
};

export const KpiCard: React.FC<KpiCardProps> = ({ 
  title, 
  value, 
  trend, 
  trendDirection, 
  description,
  theme, 
  actions, 
  onInteract, 
  disabled = false 
}) => {
  const effectiveTheme = inferTheme(trendDirection, theme);
  const config = themeConfig[effectiveTheme] || themeConfig.default;
  const trendStyle = getTrendStyle(trendDirection);
  const TitleIcon = getIconForTitle(title);

  // Parse description from data if available
  const displayDescription = description || '';
  const hasTrend = trend && trend !== '' && trendDirection !== 'neutral';

  return (
    <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all duration-200 group flex flex-col h-full min-h-[120px]">
      
      {/* Header: Title + Icon */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <span className="text-xs font-medium text-zinc-400 line-clamp-2" title={title}>
          {title}
        </span>
        <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${config.iconBg} ${config.accent}`}>
          <TitleIcon className="w-4 h-4" />
        </div>
      </div>

      {/* Value Box - Square UI Inner Container Pattern */}
      <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Main Value */}
          <span 
            className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-100 min-w-0 truncate"
            title={String(value)}
          >
            {value}
          </span>

          {/* Trend Indicator with Neon Glow */}
          {hasTrend && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-6 w-px bg-zinc-700" />
              <div
                className={`flex items-center gap-1 ${trendStyle.color}`}
                style={{ textShadow: trendStyle.shadow }}
              >
                <trendStyle.Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{trend}</span>
              </div>
            </div>
          )}

          {/* Neutral state indicator */}
          {!hasTrend && trend && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-6 w-px bg-zinc-700" />
              <span className="text-xs text-zinc-500">{trend}</span>
            </div>
          )}
        </div>
      </div>

      {/* Description / Subtitle */}
      {displayDescription && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500 overflow-hidden">
          <span className="truncate" title={displayDescription}>{displayDescription}</span>
        </div>
      )}

      {/* Actions (if any) */}
      {actions && actions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <BlockActions 
            actions={actions} 
            onInteract={onInteract} 
            align="right" 
            className="justify-end scale-90 origin-bottom-right" 
            disabled={disabled} 
          />
        </div>
      )}
    </div>
  );
};

