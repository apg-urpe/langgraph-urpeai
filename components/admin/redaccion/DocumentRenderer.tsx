'use client';

import React, { useRef, useCallback, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Image from 'next/image';
import { List, Pencil, ChevronRight } from 'lucide-react';
import { RedaccionDetalle } from '@/types/redaccion';

// ============================================================================
// PAGE DIMENSIONS — Letter size (8.5" × 11") at 96dpi
// ============================================================================

const PAGE_W = 816;
const PAGE_H = 1056;
const PAD_X = 64;
const PAD_Y = 48;
const HEADER_H = 52;
const FOOTER_H = 28;
const SECTION_GAP = 32;
const CONTENT_MAX_H = PAGE_H - PAD_Y * 2 - HEADER_H - FOOTER_H;
const CONTENT_W = PAGE_W - PAD_X * 2;

// ============================================================================
// MARKDOWN PROSE CLASSES — Estilo editorial (tema claro)
// ============================================================================

const PROSE_CLASSES = [
  'prose prose-base max-w-none',
  'text-zinc-800 leading-relaxed',
  // Paragraphs
  'prose-p:my-2.5 prose-p:leading-[1.75] prose-p:text-zinc-800',
  // Headings
  'prose-headings:text-zinc-900 prose-headings:font-semibold',
  'prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3 prose-h1:pb-2 prose-h1:border-b prose-h1:border-zinc-200',
  'prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2',
  'prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2',
  'prose-h4:text-sm prose-h4:mt-3 prose-h4:mb-1.5 prose-h4:text-zinc-700',
  // Lists
  'prose-ul:my-2 prose-ol:my-2',
  'prose-li:my-0.5 prose-li:leading-[1.75] prose-li:text-zinc-800',
  'prose-li:marker:text-zinc-500',
  // Strong / Emphasis
  'prose-strong:text-zinc-900 prose-strong:font-bold',
  'prose-em:text-zinc-700 prose-em:italic',
  // Links
  'prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium',
  // Code
  'prose-code:text-rose-600 prose-code:bg-rose-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none',
  // Blockquotes
  'prose-blockquote:border-l-2 prose-blockquote:border-zinc-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-zinc-600 prose-blockquote:bg-zinc-50 prose-blockquote:py-2 prose-blockquote:rounded-r-lg',
  // HR
  'prose-hr:border-zinc-200 prose-hr:my-6',
].join(' ');

// ============================================================================
// CUSTOM MARKDOWN COMPONENTS
// ============================================================================

const markdownComponents = {
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-4 rounded border border-zinc-300">
      <table className="min-w-full border-collapse">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-zinc-50">{children}</thead>
  ),
  th: ({ children }: any) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-700 uppercase tracking-wider border-b border-zinc-300">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-2 text-sm text-zinc-700 border-b border-zinc-200">
      {children}
    </td>
  ),
  tr: ({ children }: any) => (
    <tr className="hover:bg-zinc-50 transition-colors">{children}</tr>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline underline-offset-2 decoration-blue-300 hover:decoration-blue-500 transition-colors">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={`${className} block p-3 rounded-lg bg-zinc-50 border border-zinc-200 overflow-x-auto text-sm leading-relaxed text-zinc-800`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }: any) => (
    <pre className="my-4 rounded-lg bg-zinc-50 border border-zinc-200 overflow-hidden">
      {children}
    </pre>
  ),
  img: ({ src, alt }: any) => (
    <div className="relative w-full h-auto my-3 rounded border border-zinc-200 overflow-hidden">
      <Image
        src={src}
        alt={alt || ''}
        width={800}
        height={600}
        className="w-full h-auto object-contain"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
    </div>
  ),
};

// ============================================================================
// PAGINATION — Distribute sections across pages
// ============================================================================

interface PageData {
  sectionIds: number[];
}

function computePages(
  detalles: RedaccionDetalle[],
  heights: Map<number, number>
): PageData[] {
  const pages: PageData[] = [];
  let ids: number[] = [];
  let usedH = 0;

  for (const d of detalles) {
    const h = heights.get(d.id) || 150;
    const needed = ids.length > 0 ? h + SECTION_GAP : h;

    if (ids.length > 0 && usedH + needed > CONTENT_MAX_H) {
      pages.push({ sectionIds: [...ids] });
      ids = [];
      usedH = 0;
    }

    ids.push(d.id);
    usedH += ids.length === 1 ? h : needed;
  }

  if (ids.length > 0) pages.push({ sectionIds: ids });
  return pages.length > 0 ? pages : [{ sectionIds: detalles.map(d => d.id) }];
}

// ============================================================================
// PAGE HEADER — Logo de empresa (cada página)
// ============================================================================

const PageHeader: React.FC<{ logoUrl?: string | null; empresaNombre?: string | null }> = React.memo(({ logoUrl, empresaNombre }) => (
  <div className="flex items-center border-b border-zinc-200 pb-2 mb-3 shrink-0" style={{ height: HEADER_H }}>
    {logoUrl ? (
      <img src={logoUrl} alt={empresaNombre || 'Logo'} className="h-8 w-auto object-contain" />
    ) : empresaNombre ? (
      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{empresaNombre}</span>
    ) : null}
  </div>
));
PageHeader.displayName = 'PageHeader';

// ============================================================================
// PAGE FOOTER — Número de página
// ============================================================================

const PageFooter: React.FC<{ page: number; total: number }> = React.memo(({ page, total }) => (
  <div className="flex justify-center items-center border-t border-zinc-100 pt-2 mt-auto shrink-0" style={{ height: FOOTER_H }}>
    <span className="text-[10px] text-zinc-400 font-medium">
      Página {page} de {total}
    </span>
  </div>
));
PageFooter.displayName = 'PageFooter';

// ============================================================================
// TOC SIDEBAR
// ============================================================================

interface TOCProps {
  detalles: RedaccionDetalle[];
  activeSection: number | null;
  onNavigate: (id: number) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

const TableOfContents: React.FC<TOCProps> = React.memo(({ detalles, activeSection, onNavigate, isCollapsed, onToggle }) => {
  if (isCollapsed) {
    return (
      <button
        onClick={onToggle}
        className="sticky top-4 w-10 h-10 rounded-xl bg-zinc-900/80 border border-white/5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-primary-500/20 transition-all"
        title="Mostrar índice"
      >
        <List className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="sticky top-4 w-52 shrink-0">
      <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-3 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Índice</span>
          <button onClick={onToggle} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {detalles.map((d) => (
            <button
              key={d.id}
              onClick={() => onNavigate(d.id)}
              className={`
                flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-all text-[11px]
                ${activeSection === d.id
                  ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                }
              `}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0
                ${activeSection === d.id ? 'bg-primary-500/20 text-primary-400' : 'bg-white/[0.03] text-zinc-600'}
              `}>
                {d.orden}
              </span>
              <span className="truncate">{d.titulo}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
});
TableOfContents.displayName = 'TableOfContents';

// ============================================================================
// SECTION DIVIDER
// ============================================================================

interface SectionDividerProps {
  orden: number;
  titulo: string;
  evaluacion: number | null;
  onEdit?: () => void;
}

const SectionDivider: React.FC<SectionDividerProps> = React.memo(({ orden, titulo, evaluacion, onEdit }) => (
  <div className="flex items-center gap-2.5 mb-3 group">
    <div className="w-7 h-7 rounded-md bg-zinc-100 border border-zinc-300 flex items-center justify-center text-[11px] font-bold text-zinc-600 shrink-0">
      {orden}
    </div>
    <div className="flex-1 min-w-0">
      <h2 className="text-base font-semibold text-zinc-900">{titulo}</h2>
    </div>
    {evaluacion !== null && (
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-10 h-1 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(evaluacion / 10) * 100}%`,
              backgroundColor: evaluacion >= 7 ? '#34d399' : evaluacion >= 4 ? '#fbbf24' : '#f87171',
            }}
          />
        </div>
        <span className="text-[9px] text-zinc-500 font-mono">{evaluacion}/10</span>
      </div>
    )}
    {onEdit && (
      <button
        onClick={onEdit}
        className="opacity-40 group-hover:opacity-100 p-1.5 rounded-md border border-zinc-200 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-all"
        title="Editar sección"
      >
        <Pencil className="w-3 h-3" />
      </button>
    )}
  </div>
));
SectionDivider.displayName = 'SectionDivider';

// ============================================================================
// DOCUMENT RENDERER — Paginado tamaño carta
// ============================================================================

interface DocumentRendererProps {
  detalles: RedaccionDetalle[];
  onEditSection?: (detalle: RedaccionDetalle) => void;
  showToc?: boolean;
  logoUrl?: string | null;
  empresaNombre?: string | null;
}

export const DocumentRenderer: React.FC<DocumentRendererProps> = ({
  detalles,
  onEditSection,
  showToc = true,
  logoUrl,
  empresaNombre,
}) => {
  // Measurement refs
  const measureRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Map<number, number>>(new Map());
  const [ready, setReady] = useState(false);

  // Responsive scaling
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [availW, setAvailW] = useState(PAGE_W);

  // Navigation
  const [activeSection, setActiveSection] = useState<number | null>(detalles[0]?.id || null);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset measurement when detalles change
  useEffect(() => {
    setReady(false);
    setHeights(new Map());
  }, [detalles]);

  // Phase 1: Measure section heights in the hidden container
  useLayoutEffect(() => {
    if (ready || !measureRef.current || detalles.length === 0) return;

    const frame = requestAnimationFrame(() => {
      const el = measureRef.current;
      if (!el) return;
      const h = new Map<number, number>();
      el.querySelectorAll<HTMLElement>('[data-mid]').forEach(node => {
        const id = Number(node.dataset.mid);
        if (id) h.set(id, node.offsetHeight);
      });
      if (h.size > 0) {
        setHeights(h);
        setReady(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  // Responsive width observer
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setAvailW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Phase 2: Compute pages
  const pages = useMemo(() => {
    if (!ready) return [];
    return computePages(detalles, heights);
  }, [detalles, heights, ready]);

  const totalPages = pages.length;
  const scale = Math.min(1, (availW - 8) / PAGE_W);

  // Detalle lookup
  const detalleMap = useMemo(() => {
    const m = new Map<number, RedaccionDetalle>();
    detalles.forEach(d => m.set(d.id, d));
    return m;
  }, [detalles]);

  // Section navigation
  const handleNavigate = useCallback((id: number) => {
    const el = sectionRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const registerRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  // Active section tracking
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !ready) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute('data-section-id'));
            if (id) setActiveSection(id);
          }
        }
      },
      { root: container, rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );

    sectionRefs.current.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [ready, pages]);

  // Render section content (shared between measure and display)
  const renderSectionContent = useCallback((detalle: RedaccionDetalle, forMeasure: boolean) => (
    <>
      <SectionDivider
        orden={detalle.orden}
        titulo={detalle.titulo}
        evaluacion={detalle.evaluacion}
        onEdit={!forMeasure && onEditSection ? () => onEditSection(detalle) : undefined}
      />
      {detalle.contenido ? (
        <div
          className={`${PROSE_CLASSES} ${!forMeasure && onEditSection ? 'cursor-pointer rounded-lg transition-all hover:ring-1 hover:ring-blue-200 hover:bg-blue-50/30' : ''}`}
          onClick={!forMeasure && onEditSection ? () => onEditSection(detalle) : undefined}
          title={!forMeasure && onEditSection ? 'Click para editar' : undefined}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
            {detalle.contenido}
          </ReactMarkdown>
        </div>
      ) : !forMeasure ? (
        <div
          className="py-6 px-4 rounded-lg border border-dashed border-zinc-300 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
          onClick={onEditSection ? () => onEditSection(detalle) : undefined}
        >
          <p className="text-sm text-zinc-500 italic">Sección sin contenido</p>
          {onEditSection && (
            <span className="mt-2 text-xs text-blue-500 block">Click para agregar contenido</span>
          )}
        </div>
      ) : null}
    </>
  ), [onEditSection]);

  // Empty state
  if (detalles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-4">
          <List className="w-7 h-7 opacity-40" />
        </div>
        <p className="text-sm">Sin secciones en este documento</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full">
      {/* TOC Sidebar */}
      {showToc && detalles.length > 1 && (
        <TableOfContents
          detalles={detalles}
          activeSection={activeSection}
          onNavigate={handleNavigate}
          isCollapsed={tocCollapsed}
          onToggle={() => setTocCollapsed(!tocCollapsed)}
        />
      )}

      {/* Hidden measurement container — same width as page content area */}
      <div
        ref={measureRef}
        className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none"
        style={{ width: CONTENT_W }}
        aria-hidden="true"
      >
        {detalles.map(d => (
          <div key={d.id} data-mid={d.id} className="pb-4">
            {renderSectionContent(d, true)}
          </div>
        ))}
      </div>

      {/* Pages container */}
      <div ref={wrapperRef} className="flex-1 min-w-0">
        <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide">
          {!ready ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 gap-5">
              {pages.map((page, pi) => (
                <div
                  key={pi}
                  className="bg-white rounded-lg shadow-lg shadow-black/10 border border-zinc-200/50 flex flex-col shrink-0"
                  style={{
                    width: PAGE_W,
                    minHeight: PAGE_H,
                    padding: `${PAD_Y}px ${PAD_X}px`,
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                    transformOrigin: 'top center',
                    marginBottom: scale < 1 ? `${-(PAGE_H * (1 - scale)) + 20}px` : undefined,
                  }}
                >
                  <PageHeader logoUrl={logoUrl} empresaNombre={empresaNombre} />

                  <div className="flex-1">
                    {page.sectionIds.map((sId, si) => {
                      const d = detalleMap.get(sId);
                      if (!d) return null;
                      return (
                        <div
                          key={d.id}
                          ref={el => registerRef(d.id, el)}
                          data-section-id={d.id}
                          className={si > 0 ? 'mt-6' : ''}
                        >
                          {renderSectionContent(d, false)}
                        </div>
                      );
                    })}
                  </div>

                  <PageFooter page={pi + 1} total={totalPages} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentRenderer;
