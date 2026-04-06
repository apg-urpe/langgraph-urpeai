'use client';

import React, { useCallback, useMemo, lazy, Suspense } from 'react';
import { sanitizeHtml } from '../lib/sanitize-html';
import { UIBlock } from '../types/chat';
import { KpiCard } from './KpiCard';
import { FormBlock } from './FormBlock';
import { ImageBlock } from './ImageBlock';
import { VideoBlock } from './VideoBlock';
import { CalendarBlock } from './CalendarBlock';
import { HtmlBlock } from './HtmlBlock';
import { TextBlock } from './TextBlock';
import { ActionBlock } from './ActionBlock';
import { CardBlock } from './CardBlock';
import { CardsBlock } from './CardsBlock';
import { GridBlock } from './GridBlock';
import { TaskBoard } from './TaskBoard';
import { BlockActions } from './BlockActions';
import { AlertTriangle, Table as TableIcon, AlertOctagon, Terminal, AlertCircle, Loader2 } from 'lucide-react';

// PERFORMANCE: Lazy load ChartBlock (includes Recharts ~500KB)
const ChartBlock = lazy(() => import('./ChartBlock').then(m => ({ default: m.ChartBlock })));
const ChartLoadingFallback = () => (
  <div className="flex items-center justify-center h-48 bg-zinc-900/50 rounded-xl border border-white/5">
    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
  </div>
);

interface WrapperProps {
  children: React.ReactNode;
  className?: string;
}

// PERFORMANCE: Memoized wrapper to prevent re-renders
const Wrapper: React.FC<WrapperProps> = React.memo(({ children, className = '' }) => (
  <div className={`animate-pop-in origin-bottom h-full ${className}`}>
    {children}
  </div>
));
Wrapper.displayName = 'Wrapper';

interface VisualRendererProps {
  block: UIBlock;
  onInteract?: (data: any) => void;
  className?: string;
  disabled?: boolean;
}

// PERFORMANCE: Memoized component with stable callback references
export const VisualRenderer: React.FC<VisualRendererProps> = React.memo(({ block, onInteract, className, disabled = false }) => {

  const wrapperClass = useMemo(() => className || "w-full max-w-xl my-4", [className]);

  const handleInteraction = useCallback((interactionData: any) => {
    if (onInteract) {
      if (interactionData.type === 'BLOCK_ACTION') {
          onInteract({
            ...interactionData,
            blockId: block.id,
            blockType: block.type,
            blockTitle: block.title || block.data?.title,
            blockDescription: block.data?.description,
            blockData: block.data,
            timestamp: new Date().toISOString()
          });
      } else {
          onInteract(interactionData);
      }
    }
  }, [onInteract, block]);

  const actions = block.data?.actions;

  switch (block.type) {
    case 'kpi_card':
      return (
        <Wrapper className={wrapperClass}>
            <KpiCard 
              title={block.title || block.data?.title || 'Metric'} 
              value={block.data?.value} 
              trend={block.data?.trend} 
              trendDirection={block.data?.trendDirection}
              description={block.data?.description}
              theme={block.theme}
              actions={actions}
              onInteract={handleInteraction}
              disabled={disabled}
            />
        </Wrapper>
      );
    case 'chart':
      return (
        <Wrapper className={wrapperClass}>
          <Suspense fallback={<ChartLoadingFallback />}>
            <ChartBlock 
              title={block.title || 'Analytics'} 
              data={block.data || {}}
              onInteract={handleInteraction}
              disabled={disabled}
            />
          </Suspense>
        </Wrapper>
      );
    case 'text_block':
        return (
            <Wrapper className={wrapperClass}>
                <TextBlock 
                    title={block.title || block.data?.title}
                    content={block.data?.content || ''}
                    isMarkdown={block.data?.markdown !== false}
                />
            </Wrapper>
        );
    case 'actions':
        return (
            <Wrapper className={wrapperClass}>
                <ActionBlock 
                    actions={actions || []}
                    onInteract={handleInteraction}
                    disabled={disabled}
                />
            </Wrapper>
        );
    case 'card':
        return (
            <Wrapper className={wrapperClass}>
                <CardBlock 
                    title={block.title || block.data?.title}
                    theme={block.theme}
                    data={block.data as any}
                    onInteract={handleInteraction}
                    disabled={disabled}
                />
            </Wrapper>
        );
    case 'cards':
        return (
            <Wrapper className={wrapperClass}>
                <CardsBlock 
                    title={block.title || block.data?.title}
                    data={block.data as any}
                    onInteract={handleInteraction}
                    disabled={disabled}
                />
            </Wrapper>
        );
    case 'grid':
      return (
        <Wrapper className={wrapperClass}>
          <GridBlock
            title={block.title || block.data?.title}
            data={block.data as any}
            onInteract={handleInteraction}
            disabled={disabled}
          />
        </Wrapper>
      );
    case 'table':
      return (
        <Wrapper className={wrapperClass}>
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors duration-300 w-full h-full flex flex-col shadow-sm">
             <div className="bg-zinc-900/50 border-b border-zinc-800/50 px-4 py-3 flex items-center gap-2 shrink-0 justify-between">
              <div className="flex items-center gap-2.5">
                <TableIcon className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  {block.title || 'Structured Data'}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-xs uppercase font-medium text-zinc-500 sticky top-0">
                  <tr>
                    {block.data?.headers?.map((header: string, i: number) => (
                      <th key={i} className="px-5 py-3 font-semibold tracking-wider border-b border-zinc-800 bg-zinc-900/90 whitespace-nowrap">
                        {sanitizeHtml(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {block.data?.rows?.map((row: string[] | Record<string, any>, i: number) => {
                    // Handle both array and object row formats
                    const cells: string[] = Array.isArray(row) 
                      ? row 
                      : (block.data?.headers || Object.keys(row)).map((h: string) => {
                          const val = (row as Record<string, any>)[h];
                          return val === undefined || val === null ? '' : String(val);
                        });
                    return (
                      <tr key={i} className="group hover:bg-zinc-800/30 transition-colors">
                        {cells.map((cell: string, j: number) => (
                          <td 
                            key={j} 
                            className={`px-5 py-3 text-zinc-300 whitespace-nowrap ${j === 0 ? 'font-mono text-primary-400/80 font-medium' : ''}`}
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(cell) }}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {actions && actions.length > 0 && (
               <div className="p-4 border-t border-zinc-800/50 bg-zinc-900/20">
                  <BlockActions actions={actions} onInteract={handleInteraction} disabled={disabled} />
               </div>
            )}
          </div>
        </Wrapper>
      );
    case 'calendar':
      return (
        <Wrapper className={wrapperClass}>
           <CalendarBlock 
              title={block.title || 'Schedule'}
              initialView={block.data?.view}
              initialDate={block.data?.currentDate}
              events={block.data?.events || []}
              actions={actions}
              onInteract={handleInteraction}
              disabled={disabled}
           />
        </Wrapper>
      );
    case 'form':
      return (
        <Wrapper className={wrapperClass}>
          <FormBlock
            title={block.title || 'Input'}
            fields={block.data?.fields || []}
            submitLabel={block.data?.submitLabel}
            formId={block.id}
            onSubmit={handleInteraction}
            disabled={disabled}
            actions={actions}
          />
        </Wrapper>
      );
    case 'image':
      return (
        <Wrapper className={wrapperClass}>
           <ImageBlock 
              url={block.data?.url}
              title={block.title}
              description={block.data?.description}
              actions={actions}
              onInteract={handleInteraction}
              disabled={disabled}
           />
        </Wrapper>
      );
    case 'video':
      return (
        <Wrapper className={wrapperClass}>
           <VideoBlock 
              url={block.data?.url}
              title={block.title}
              description={block.data?.description}
              poster={block.data?.poster}
              autoPlay={block.data?.autoPlay}
              actions={actions}
              onInteract={handleInteraction}
              disabled={disabled}
           />
        </Wrapper>
      );
    case 'task_board':
      return (
        <Wrapper className={wrapperClass}>
          <TaskBoard
            title={block.title || 'Tareas'}
            tasks={block.data?.tasks || []}
            assignees={block.data?.assignees || []}
            view={block.data?.view}
            actions={actions}
            onInteract={handleInteraction}
            disabled={disabled}
          />
        </Wrapper>
      );
    case 'html':
      return (
        <Wrapper className={wrapperClass}>
          <HtmlBlock 
            content={block.data?.content || ''} 
          />
        </Wrapper>
      );
    case 'error':
      return (
        <Wrapper className={wrapperClass}>
          <div className="relative overflow-hidden rounded-xl border border-rose-500/30 bg-rose-950/10 backdrop-blur-md group h-full">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
            <div className="p-4 pl-6">
              <div className="flex items-center gap-2 mb-2">
                 <div className="p-1 rounded bg-rose-500/10">
                    <AlertOctagon className="w-4 h-4 text-rose-500" />
                 </div>
                 <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest font-mono">System Alert</span>
              </div>
              <p className="text-zinc-200 text-sm font-medium leading-relaxed">
                {sanitizeHtml(block.data?.message || block.data?.error || "An unexpected error occurred processing your request.")}
              </p>
              {(block.data?.code || block.data?.details) && (
                 <div className="mt-3 p-2 bg-rose-950/30 rounded border border-rose-500/10 font-mono text-[10px] text-rose-300/70 overflow-x-auto">
                    <div className="flex items-center gap-2 mb-1 opacity-50">
                       <Terminal className="w-3 h-3" />
                       <span>DIAGNOSTIC_DATA</span>
                    </div>
                    {block.data?.code && <div>CODE: {block.data.code}</div>}
                    {block.data?.details && <div>{typeof block.data.details === 'object' ? JSON.stringify(block.data.details) : block.data.details}</div>}
                 </div>
              )}
            </div>
          </div>
        </Wrapper>
      );
    case 'warning':
    case 'info':
    case 'alert':
      return (
        <Wrapper className={wrapperClass}>
          <div className={`relative overflow-hidden rounded-xl border backdrop-blur-md group h-full ${
            block.type === 'warning' ? 'border-amber-500/30 bg-amber-950/10' : 'border-blue-500/30 bg-blue-950/10'
          }`}>
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              block.type === 'warning' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'
            }`}></div>
            <div className="p-4 pl-6">
              <div className="flex items-center gap-2 mb-2">
                 <div className={`p-1 rounded ${block.type === 'warning' ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                    <AlertCircle className={`w-4 h-4 ${block.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`} />
                 </div>
                 <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${
                   block.type === 'warning' ? 'text-amber-400' : 'text-blue-400'
                 }`}>{block.type === 'warning' ? 'Warning' : 'Information'}</span>
              </div>
              <p className="text-zinc-200 text-sm font-medium leading-relaxed">
                {sanitizeHtml(block.data?.message || block.data?.content || "Information message.")}
              </p>
              {(block.data?.code || block.data?.details) && (
                 <div className={`mt-3 p-2 rounded border font-mono text-[10px] overflow-x-auto ${
                   block.type === 'warning' ? 'bg-amber-950/30 border-amber-500/10 text-amber-300/70' : 'bg-blue-950/30 border-blue-500/10 text-blue-300/70'
                 }`}>
                    {block.data?.code && <div>CODE: {block.data.code}</div>}
                    {block.data?.details && <div>{typeof block.data.details === 'object' ? JSON.stringify(block.data.details) : block.data.details}</div>}
                 </div>
              )}
              {/* Soporte para botones de acción en warnings/info/alerts */}
              {actions && actions.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-800/30">
                  <BlockActions actions={actions} onInteract={handleInteraction} disabled={disabled} />
                </div>
              )}
            </div>
          </div>
        </Wrapper>
      );
    default:
      // Silently ignore unknown block types that are likely metadata or empty
      if (!block.type || block.type === 'undefined' || block.type === 'null') {
        return null;
      }
      return (
        <Wrapper className={wrapperClass}>
           <div className="bg-zinc-900/50 border border-zinc-800 text-zinc-500 p-4 rounded-xl flex items-center justify-center gap-2 text-xs font-mono h-full">
             <AlertTriangle className="w-4 h-4" />
             UNSUPPORTED_BLOCK: {block.type}
           </div>
        </Wrapper>
      );
  }
});
VisualRenderer.displayName = 'VisualRenderer';

