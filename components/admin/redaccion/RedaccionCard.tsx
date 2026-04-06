'use client';

import React from 'react';
import { Clock, Layers, BookOpen, ExternalLink, User } from 'lucide-react';
import { Redaccion, ESTADO_CONFIG } from '@/types/redaccion';
import { TiposBadge } from './TiposBadge';

interface RedaccionCardProps {
  redaccion: Redaccion;
  onSelect: (redaccion: Redaccion) => void;
}

export const RedaccionCard: React.FC<RedaccionCardProps> = React.memo(({ redaccion, onSelect }) => {
  const estadoConfig = ESTADO_CONFIG[redaccion.estado] || ESTADO_CONFIG.borrador;

  return (
    <button
      onClick={() => onSelect(redaccion)}
      className="group w-full bg-zinc-900/30 border border-white/[0.04] rounded-2xl text-left hover:border-white/[0.08] hover:bg-zinc-900/50 transition-all duration-300 h-full flex flex-col overflow-hidden active:scale-[0.98] hover:shadow-lg hover:shadow-primary-500/[0.03]"
    >
      {/* Top accent line */}
      <div className={`h-0.5 w-full ${
        redaccion.estado === 'publicado' ? 'bg-gradient-to-r from-emerald-500/40 to-emerald-500/0' :
        redaccion.estado === 'en_revision' ? 'bg-gradient-to-r from-cyan-500/40 to-cyan-500/0' :
        redaccion.estado === 'preparando' ? 'bg-gradient-to-r from-amber-500/40 to-amber-500/0' :
        'bg-gradient-to-r from-zinc-700/40 to-zinc-700/0'
      }`} />

      <div className="p-4 flex flex-col flex-1">
        {/* Header: Nombre + Estado */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 group-hover:border-primary-500/20 group-hover:bg-primary-500/5 transition-all">
              <BookOpen className="w-3.5 h-3.5 text-zinc-600 group-hover:text-primary-400 transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-zinc-200 truncate group-hover:text-zinc-100 transition-colors text-sm leading-tight">
                {redaccion.nombre}
              </h3>
              {/* Tipo badge inline */}
              {redaccion.tipo && (
                <div className="mt-1">
                  <TiposBadge tipo={redaccion.tipo} compact />
                </div>
              )}
            </div>
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${estadoConfig.color} ${estadoConfig.bg}`}>
            {estadoConfig.label}
          </span>
        </div>

        {/* Descripción */}
        {redaccion.descripcion && (
          <p className="text-xs text-zinc-500 line-clamp-2 mb-3 flex-1 leading-relaxed">
            {redaccion.descripcion}
          </p>
        )}

        {/* Spacer if no description */}
        {!redaccion.descripcion && <div className="flex-1" />}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.03]">
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(redaccion.updated_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
            </span>
            {redaccion.tipo && (
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {redaccion.tipo.partes} {redaccion.tipo.partes === 1 ? 'parte' : 'partes'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {redaccion.contacto && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-500/60" title={[redaccion.contacto.nombre, redaccion.contacto.apellido].filter(Boolean).join(' ') || redaccion.contacto.telefono || ''}>
                <User className="w-3 h-3" />
              </span>
            )}
            {redaccion.url_doc && (
              <span className="flex items-center gap-1 text-[10px] text-primary-500/60">
                <ExternalLink className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
});

RedaccionCard.displayName = 'RedaccionCard';
