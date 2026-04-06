'use client';

import React from 'react';
import { BlockActions } from './BlockActions';
import { BlockAction } from '../types/chat';
import { KpiCard } from './KpiCard';
import { CardBlock } from './CardBlock';

interface GridItem {
  type?: string;
  image?: string;
  title?: string;
  content?: string;
  badge?: string;
  footer?: string;
  actions?: BlockAction[];
  // Para soportar bloques UI anidados
  data?: any;
  theme?: string;
}

interface GridBlockProps {
  title?: string;
  data?: {
    columns?: string | number;
    items?: GridItem[];
    actions?: BlockAction[];
  } | GridItem[]; // Soportar data como array directo
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

// Renderizar un item del grid - puede ser un bloque UI o un item simple
const GridItemRenderer: React.FC<{
  item: GridItem;
  index: number;
  onInteract?: (data: any) => void;
  disabled?: boolean;
}> = ({ item, index, onInteract, disabled }) => {
  // Si el item es un bloque UI (kpi_card, card, etc), renderizarlo
  if (item.type === 'kpi_card') {
    return (
      <KpiCard
        title={item.title || item.data?.title || 'Metric'}
        value={item.data?.value}
        trend={item.data?.trend}
        trendDirection={item.data?.trendDirection}
        theme={item.theme as any}
        actions={item.actions || item.data?.actions}
        onInteract={onInteract}
        disabled={disabled}
      />
    );
  }

  if (item.type === 'card') {
    return (
      <CardBlock
        title={item.title || item.data?.title}
        theme={item.theme as any}
        data={item.data}
        onInteract={onInteract}
        disabled={disabled}
      />
    );
  }

  // Square UI Style - Default item renderer
  return (
    <div className="group relative rounded-xl border border-white/5 bg-zinc-900/60 overflow-hidden transition-all duration-200 hover:border-white/10 flex flex-col h-full">
      {item.image && (
        <div className="relative h-24 md:h-32 bg-zinc-800/30 flex items-center justify-center shrink-0 border-b border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image}
            alt={item.title || 'item'}
            className="max-h-full max-w-full object-contain p-2 md:p-4"
          />
        </div>
      )}

      <div className="p-3 md:p-4 flex flex-col flex-1 gap-2">
        {/* Header with badge */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {item.badge && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md truncate">
                {item.badge}
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">#{String(index + 1).padStart(2, '0')}</span>
        </div>

        {/* Inner Container - Square UI Pattern */}
        <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex-1 flex flex-col justify-center">
          <h3 className="text-zinc-100 font-medium text-sm md:text-base leading-snug mb-1">
            {item.title || 'Item'}
          </h3>
          
          {item.content && (
            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
              {item.content}
            </p>
          )}
        </div>

        {/* Footer */}
        {item.footer && (
          <div className="text-[10px] md:text-xs text-zinc-500 flex items-center gap-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-600"></div>
            {item.footer}
          </div>
        )}

        {/* Actions */}
        {item.actions && item.actions.length > 0 && (
          <BlockActions
            actions={item.actions}
            onInteract={onInteract}
            disabled={disabled}
            className="mt-1 shrink-0 pt-2 border-t border-white/5"
          />
        )}
      </div>
    </div>
  );
};

export const GridBlock: React.FC<GridBlockProps> = ({ title, data, onInteract, disabled = false }) => {
  // Soportar data como array directo O como objeto con items
  const items: GridItem[] = Array.isArray(data) 
    ? data 
    : (Array.isArray(data?.items) ? data.items : []);
  
  const blockActions = Array.isArray(data) ? [] : (data?.actions || []);
  
  // Determinar columnas del grid
  const columnsConfig = !Array.isArray(data) && data?.columns;
  const numColumns = typeof columnsConfig === 'number' ? columnsConfig : parseInt(columnsConfig || '2', 10);
  
  // Clases de grid basadas en número de columnas
  const gridColsClass = numColumns >= 3 
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' 
    : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-all duration-200">
      {title && (
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">{items.length} items</span>
          </div>
        </div>
      )}

      {/* Items container - responsive grid */}
      <div className={`p-4 grid ${gridColsClass} gap-3 md:gap-4`}>
        {items.length === 0 && (
          <div className="col-span-full text-center text-zinc-500 text-xs py-8">No hay elementos para mostrar</div>
        )}

        {items.map((item, idx) => (
          <GridItemRenderer
            key={idx}
            item={item}
            index={idx}
            onInteract={onInteract}
            disabled={disabled}
          />
        ))}
      </div>

      {blockActions.length > 0 && (
        <div className="px-4 py-3 border-t border-white/5">
          <BlockActions actions={blockActions} onInteract={onInteract} disabled={disabled} />
        </div>
      )}
    </div>
  );
};

export default GridBlock;
