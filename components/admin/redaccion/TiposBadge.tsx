'use client';

import React from 'react';
import { RedaccionTipo } from '@/types/redaccion';

// Colores semánticos rotativos por tipo
const TIPO_COLORS = [
  { text: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/20' },
  { text: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/20' },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/20' },
  { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/20' },
  { text: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/20' },
  { text: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/20' },
  { text: 'text-lime-400', bg: 'bg-lime-500/15', border: 'border-lime-500/20' },
  { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/20' },
];

function getColorForTipo(tipoId: number) {
  return TIPO_COLORS[tipoId % TIPO_COLORS.length];
}

interface TiposBadgeProps {
  tipo: RedaccionTipo;
  compact?: boolean;
}

export const TiposBadge: React.FC<TiposBadgeProps> = React.memo(({ tipo, compact = false }) => {
  const color = getColorForTipo(tipo.id);

  if (compact) {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${color.text} ${color.bg}`}>
        {tipo.nombre}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${color.text} ${color.bg} ${color.border}`}>
      {tipo.nombre}
      {tipo.partes > 1 && (
        <span className="opacity-60">({tipo.partes} partes)</span>
      )}
    </span>
  );
});

TiposBadge.displayName = 'TiposBadge';
