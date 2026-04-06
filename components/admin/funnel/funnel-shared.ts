import { Phone, Mail, Calendar, Clock, PowerOff } from 'lucide-react';
import React from 'react';
import { FunnelStage } from '../../../types/contact';

// Default stage colors palette (used when stage doesn't have custom color)
const STAGE_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#6366f1', // indigo
];

// Get stage accent color from metadata or fallback to palette
export const getStageColor = (stage: FunnelStage, index: number = 0): string => {
  const metadataColor = stage.descripcion?.color;
  if (metadataColor && typeof metadataColor === 'string') {
    return metadataColor;
  }
  return STAGE_COLORS[index % STAGE_COLORS.length];
};

// Get stage icon from metadata
export const getStageIcon = (stage: FunnelStage): string | null => {
  return stage.descripcion?.icono || null;
};

// Status badge colors
export const getStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'prospecto': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'cliente': return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'calificado': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'no_calificado': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'evaluando': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
};

// Qualification badge colors
export const getQualificationColor = (qualification?: string) => {
  switch (qualification?.toLowerCase()) {
    case 'si': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'no': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'evaluando': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
};

// Helper to get initials
export const getInitials = (name: string) => {
  return name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
