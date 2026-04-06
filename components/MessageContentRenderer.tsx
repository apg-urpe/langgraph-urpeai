'use client';

/**
 * MessageContentRenderer v4 - Resilient UI Rendering
 * 
 * Uses the new UI system with:
 * - ContentParser for robust message parsing
 * - BlockValidator for Zod validation with fallbacks
 * - SafeBlockRenderer for error isolation per component
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';
import { SafeBlockRenderer } from './SafeBlockRenderer';
import { VisualRenderer } from './VisualRenderer';
import { UnknownBlockFallback, BlockSkeleton } from './SafeBlockRenderer';
import { HtmlBlock } from './HtmlBlock';
import { parseMessageContent, getBlockGridClass, validateBlock, type ValidatedBlock } from '../lib/ui';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { logger } from '@/lib/logger';
import { useContactStore } from '@/store/contactStore';
import { useAdminStore } from '@/store/adminStore';
import { User, FileText } from 'lucide-react';
import { useWhatsAppTemplatesStore } from '@/store/whatsappTemplatesStore';

const SAFE_URL_PROTOCOLS = new Set(['http', 'https', 'irc', 'ircs', 'mailto', 'xmpp']);

const decodeUrlCandidate = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractContactIdFromHref = (...candidates: unknown[]): number | null => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;

    const decodedValue = decodeUrlCandidate(candidate).trim();
    if (!decodedValue) continue;

    const match = decodedValue.match(/^contact:(?:\/\/\/?)?\s*(\d+)(?:[/?#].*)?$/i);
    if (!match) continue;

    const contactId = Number.parseInt(match[1], 10);
    if (Number.isInteger(contactId) && contactId > 0) {
      return contactId;
    }
  }

  return null;
};

const extractTemplateIdFromHref = (...candidates: unknown[]): number | null => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;

    const decodedValue = decodeUrlCandidate(candidate).trim();
    if (!decodedValue) continue;

    const match = decodedValue.match(/^template:(?:\/\/\/?)?\s*(\d+)(?:[/?#].*)?$/i);
    if (!match) continue;

    const templateId = Number.parseInt(match[1], 10);
    if (Number.isInteger(templateId) && templateId > 0) {
      return templateId;
    }
  }

  return null;
};

const transformMarkdownUrl = (url: string): string => {
  const contactId = extractContactIdFromHref(url);
  if (contactId) {
    return `contact://${contactId}`;
  }

  const templateId = extractTemplateIdFromHref(url);
  if (templateId) {
    return `template://${templateId}`;
  }

  const colon = url.indexOf(':');
  const questionMark = url.indexOf('?');
  const numberSign = url.indexOf('#');
  const slash = url.indexOf('/');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign)
  ) {
    return url;
  }

  const protocol = url.slice(0, colon).toLowerCase();
  return SAFE_URL_PROTOCOLS.has(protocol) ? url : '';
};

/**
 * PERFORMANCE: Specialized memoized component for text parts
 */
const TextPart = React.memo(({ 
  content, 
  isStreaming, 
  isLast 
}: { 
  content: string; 
  isStreaming: boolean; 
  isLast: boolean;
}) => {
  if (isStreaming && isLast) {
    return <StreamingMarkdown content={content} isStreaming={isStreaming} />;
  }
  return <MarkdownContent content={content} />;
});
TextPart.displayName = 'TextPart';

/**
 * PERFORMANCE: Specialized memoized component for UI blocks
 */
const BlockPart = React.memo(({ 
  block, 
  isDashboard, 
  shouldAnimate, 
  animationDelay, 
  onInteract, 
  isDisabled,
  onBlockError 
}: { 
  block: ValidatedBlock; 
  isDashboard: boolean; 
  shouldAnimate: boolean; 
  animationDelay: number;
  onInteract?: (data: any) => void;
  isDisabled: boolean;
  onBlockError: (error: Error, block: ValidatedBlock) => void;
}) => {
  const colSpanClass = getBlockGridClass(block, isDashboard);

  if (block.type === 'unknown' || !block.type) {
    return (
      <div className={`${colSpanClass} flex min-w-0`}>
        <UnknownBlockFallback block={block} onInteract={onInteract} />
      </div>
    );
  }

  return (
    <div 
      className={`${colSpanClass} flex min-w-0 ${shouldAnimate ? 'animate-card-appear' : ''}`}
      style={shouldAnimate ? { 
        animationDelay: `${animationDelay}ms`,
        animationFillMode: 'backwards'
      } : undefined}
    >
      <SafeBlockRenderer 
        block={block} 
        onAction={onInteract} 
        className="w-full h-full min-h-full"
        disabled={isDisabled}
        onError={onBlockError}
      />
    </div>
  );
});
BlockPart.displayName = 'BlockPart';

// Custom Markdown Components for consistent styling
const markdownComponents = {
  // Updated H1 to be large, Cyan (Electric Blue), and premium looking
  h1: ({node, ...props}: any) => (
    <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-200 mt-8 mb-6 tracking-tight w-full block shadow-primary-500/10 drop-shadow-sm" {...props} />
  ),
  // Updated H2 to be distinct and high contrast
  h2: ({node, ...props}: any) => <h2 className="text-xl font-semibold text-zinc-200 mt-6 mb-4 w-full block" {...props} />,
  h3: ({node, ...props}: any) => <h3 className="text-sm font-bold text-primary-400 mt-4 mb-2 uppercase tracking-wider w-full block" {...props} />,
  // Paragraphs with slightly lighter text for contrast against bold headers
  p: ({node, ...props}: any) => <p className="mb-3 leading-relaxed text-zinc-400 max-w-4xl text-sm md:text-base break-words" {...props} />,
  ul: ({node, ...props}: any) => <ul className="list-disc list-outside ml-4 mb-4 space-y-1.5 text-zinc-400" {...props} />,
  ol: ({node, ...props}: any) => <ol className="list-decimal list-outside ml-4 mb-4 space-y-1.5 text-zinc-400" {...props} />,
  li: ({node, ...props}: any) => <li className="pl-1 marker:text-zinc-600 break-words" {...props} />,
  code: ({node, className, children, ...props}: any) => {
     const match = /language-(\w+)/.exec(className || '')
     const isInline = !match && !className?.includes('language-');
     const language = match ? match[1] : '';

     if (!isInline && (language === 'html' || language === 'xml')) {
        return (
           <div className="w-full block clear-both">
              <HtmlBlock content={String(children).replace(/\n$/, '')} />
           </div>
        );
     }

     return isInline 
       ? <code className="bg-zinc-800/50 text-primary-300 px-1.5 py-0.5 rounded font-mono text-xs border border-zinc-700/50" {...props}>{children}</code>
       : <code className="block bg-zinc-950/50 p-3 rounded-lg border border-zinc-800 font-mono text-xs overflow-x-auto my-3 text-zinc-300 shadow-inner" {...props}>{children}</code>
  },
  // Strong text is now white/zinc-100 to pop against the gray paragraph text
  strong: ({node, ...props}: any) => <strong className="font-semibold text-zinc-100" {...props} />,
  a: ({node, href, children, ...props}: any) => {
    const contactId = extractContactIdFromHref(
      href,
      node?.properties?.href,
      node?.href,
      node?.url
    );

    if (contactId) {
      const contactLabel = React.Children.toArray(children)
        .map((child) => typeof child === 'string' ? child : '')
        .join('')
        .trim();

      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const contactStore = useContactStore.getState();
            contactStore.selectContact(null);
            useAdminStore.getState().focusContactNavigation(contactId, contactLabel || null);
            void contactStore.fetchContactDetails(contactId);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
            bg-primary-500/15 text-primary-300 border border-primary-500/30
            hover:bg-primary-500/25 hover:text-primary-200 hover:border-primary-400/50
            transition-all cursor-pointer align-baseline"
          title={`Ver contacto #${contactId}`}
        >
          <User className="w-3 h-3 shrink-0" />
          <span>{children}</span>
        </button>
      );
    }

    // Template tag rendering
    const templateId = extractTemplateIdFromHref(
      href,
      node?.properties?.href,
      node?.href,
      node?.url
    );

    if (templateId) {
      const templateLabel = React.Children.toArray(children)
        .map((child) => typeof child === 'string' ? child : '')
        .join('')
        .trim();

      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            useAdminStore.getState().focusTemplateNavigation(templateId, templateLabel || null);
            const templatesStore = useWhatsAppTemplatesStore.getState();
            const template = templatesStore.templates.find(t => t.id === templateId);
            if (template) {
              templatesStore.setSelectedTemplate(template);
              templatesStore.setShowFormModal(true);
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
            bg-emerald-500/15 text-emerald-300 border border-emerald-500/30
            hover:bg-emerald-500/25 hover:text-emerald-200 hover:border-emerald-400/50
            transition-all cursor-pointer align-baseline"
          title={`Ver plantilla borrador #${templateId}`}
        >
          <FileText className="w-3 h-3 shrink-0" />
          <span>{templateLabel || `Plantilla #${templateId}`}</span>
        </button>
      );
    }

    const rawHref = [href, node?.properties?.href, node?.href, node?.url].find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof rawHref === 'string' && /^contact:/i.test(decodeUrlCandidate(rawHref).trim())) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800/60 text-zinc-300 border border-white/10 align-baseline">{children}</span>;
    }

    if (typeof rawHref === 'string' && /^template:/i.test(decodeUrlCandidate(rawHref).trim())) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800/60 text-zinc-300 border border-white/10 align-baseline"><FileText className="w-3 h-3 shrink-0" />{children}</span>;
    }

    if (!href) {
      return <span className="text-primary-400 break-all">{children}</span>;
    }

    return <a className="text-primary-400 hover:text-primary-300 hover:underline underline-offset-4 transition-colors break-all" href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
  blockquote: ({node, ...props}: any) => <blockquote className="border-l-2 border-primary-500/30 pl-4 italic text-zinc-400 my-3 py-1 bg-zinc-900/20 rounded-r-lg" {...props} />,
  hr: ({node, ...props}: any) => <hr className="border-zinc-800 my-6" {...props} />,
  
  // Table Support for Markdown Tables
  table: ({node, ...props}: any) => (
    <div className="w-full overflow-x-auto my-4 rounded-lg border border-zinc-800/50 bg-zinc-900/20">
      <table className="w-full text-left border-collapse" {...props} />
    </div>
  ),
  thead: ({node, ...props}: any) => <thead className="bg-zinc-900/80 text-zinc-400 text-xs uppercase tracking-wider font-medium" {...props} />,
  tbody: ({node, ...props}: any) => <tbody className="divide-y divide-zinc-800/50" {...props} />,
  tr: ({node, ...props}: any) => <tr className="group hover:bg-zinc-800/30 transition-colors" {...props} />,
  th: ({node, ...props}: any) => <th className="px-4 py-3 font-semibold border-b border-zinc-800" {...props} />,
  td: ({node, ...props}: any) => <td className="px-4 py-3 text-sm text-zinc-300 whitespace-pre-wrap" {...props} />,
  
  // Explicitly style generic HTML elements that rehype-raw might pass through
  div: ({node, ...props}: any) => <div className="" {...props} />,
  span: ({node, ...props}: any) => <span className="" {...props} />,
};

// Streaming Text - Simplified and performant
interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const StreamingMarkdown: React.FC<StreamingMarkdownProps> = React.memo(({ 
  content, 
  isStreaming = false
}) => {
  const [displayedContent, setDisplayedContent] = useState(content);
  const [isTyping, setIsTyping] = useState(false);
  const animationRef = useRef<number>();
  const targetRef = useRef(content);
  const currentLenRef = useRef(content.length);

  useEffect(() => {
    targetRef.current = content;
    
    // Si no está en streaming, mostrar todo inmediatamente
    if (!isStreaming) {
      setDisplayedContent(content);
      setIsTyping(false);
      currentLenRef.current = content.length;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    // Si hay nuevo contenido, animar
    if (content.length > currentLenRef.current) {
      setIsTyping(true);
      
      const animate = () => {
        const target = targetRef.current;
        const remaining = target.length - currentLenRef.current;
        
        if (remaining <= 0) {
          setIsTyping(false);
          setDisplayedContent(target);
          return;
        }
        
        // Velocidad adaptativa muy rápida
        const increment = remaining > 100 ? Math.ceil(remaining * 0.15) :
                         remaining > 50 ? 8 :
                         remaining > 20 ? 4 : 2;
        
        currentLenRef.current = Math.min(currentLenRef.current + increment, target.length);
        setDisplayedContent(target.slice(0, currentLenRef.current));
        
        animationRef.current = requestAnimationFrame(animate);
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [content, isStreaming]);

  if (!displayedContent) return null;

  return (
    <div className="prose prose-invert prose-sm max-w-none w-full relative">
      <Markdown 
        remarkPlugins={[remarkGfm]} 
        rehypePlugins={[rehypeRaw]}
        urlTransform={transformMarkdownUrl}
        components={markdownComponents}
      >
        {displayedContent}
      </Markdown>
      
      {/* Cursor parpadeante durante typing */}
      {isTyping && (
        <span className="inline-block w-0.5 h-4 ml-0.5 bg-primary-400 animate-cursor-blink align-middle shadow-[0_0_8px_rgba(var(--primary-400),0.8)]" />
      )}
    </div>
  );
});
StreamingMarkdown.displayName = 'StreamingMarkdown';

// Markdown Renderer Wrapper - Memoized to prevent heavy re-renders on parent state changes
const MarkdownContent = React.memo(({ content }: { content: string }) => {
  if (!content) return null;
  return (
    <div className="prose prose-invert prose-sm max-w-none w-full">
       <Markdown 
         remarkPlugins={[remarkGfm]} 
         rehypePlugins={[rehypeRaw]}
         urlTransform={transformMarkdownUrl}
         components={markdownComponents}
       >
         {content}
       </Markdown>
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

// Skeleton loader for when UI is being streamed
export const UIBlockSkeleton = () => (
  <div className="w-full h-full animate-pulse min-h-[120px]">
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl overflow-hidden p-4 flex flex-col gap-3 backdrop-blur-sm h-full shadow-sm">
       <div className="flex items-center gap-2 border-b border-zinc-800/30 pb-2">
          <div className="w-3 h-3 bg-zinc-800 rounded-sm"></div>
          <div className="h-2 w-20 bg-zinc-800 rounded-full"></div>
       </div>
       <div className="space-y-2 pt-1 flex-1">
          <div className="h-6 w-1/2 bg-zinc-800 rounded-md"></div>
          <div className="h-3 w-full bg-zinc-800/50 rounded-md"></div>
       </div>
    </div>
  </div>
);

interface MessageContentRendererProps {
  content: string;
  onInteract?: (data: any) => void;
  isDashboard?: boolean;
  isStreaming?: boolean;
  isAnimating?: boolean; // Para efecto de aparición en tarjetas
  isDisabled?: boolean; // Para bloquear acciones durante procesamiento
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = React.memo(({ 
  content, 
  onInteract, 
  isDashboard = false, 
  isStreaming = false, 
  isAnimating = false,
  isDisabled = false
}) => {
  
  // Track render errors for debugging
  const handleBlockError = useCallback((error: Error, block: ValidatedBlock) => {
    logger.error('[MessageContentRenderer] Block render error:', {
      blockType: block.type,
      blockTitle: block.title,
      error: error.message,
      validationType: block._meta?.validationType
    });
  }, []);

  // Use new ContentParser for robust parsing with fallbacks
  const parsedContent = useMemo(() => {
    return parseMessageContent(content, isStreaming);
  }, [content, isStreaming]);

  /**
   * FLUID GRID SYSTEM 4.0 (Unified + Resilient)
   */
  const containerClass = "grid grid-cols-12 gap-4 w-full items-stretch";

  return (
    <div className={containerClass}>
      {parsedContent.parts.map((part, index) => {
        // === TEXT PARTS ===
        if (part.type === 'text') {
          const textContent = part.content;
          if (!textContent || !textContent.trim()) return null;
          
          const isLastTextPart = index === parsedContent.parts.length - 1 || 
            parsedContent.parts.slice(index + 1).every(p => p.type === 'block' || p.type === 'pending');
          
          return (
            <div key={`text-${index}`} className="col-span-12 mb-6 last:mb-0">
              <TextPart 
                content={textContent}
                isStreaming={isStreaming}
                isLast={isLastTextPart}
              />
            </div>
          );
        }

        // === PENDING BLOCKS (Streaming) ===
        if (part.type === 'pending') {
          return (
            <div key={`pending-${index}`} className="col-span-12 sm:col-span-6 md:col-span-4 h-32">
              <BlockSkeleton />
            </div>
          );
        }

        // === UI BLOCKS ===
        if (part.type === 'block') {
          const block = part.block;
          
          // Animation for new cards
          const shouldAnimate = isAnimating || isStreaming;
          const animationDelay = index * 60;

          return (
            <div key={`block-${block.id || index}`} className="col-span-12 mb-8 last:mb-0">
              <BlockPart 
                block={block}
                isDashboard={isDashboard}
                shouldAnimate={shouldAnimate}
                animationDelay={animationDelay}
                onInteract={onInteract}
                isDisabled={isDisabled}
                onBlockError={handleBlockError}
              />
            </div>
          );
        }

        // === ERROR PARTS ===
        if (part.type === 'error') {
          return (
            <div key={`error-${index}`} className="col-span-12">
              <div className="p-3 bg-rose-950/10 border border-rose-900/30 rounded-lg backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Parse Error</span>
                </div>
                <p className="text-xs text-rose-300 font-mono">{part.message}</p>
                {part.rawContent && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-rose-400/60 cursor-pointer hover:text-rose-400">
                      Show raw content
                    </summary>
                    <pre className="mt-1 p-2 bg-black/20 rounded text-[9px] text-rose-300/50 overflow-x-auto">
                      {part.rawContent}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}
      
      {/* Debug indicator for development */}
      {parsedContent.hasErrors && typeof window !== 'undefined' && (window as any).__DEV__ && (
        <div className="col-span-12 text-[10px] text-amber-500/50 font-mono text-right">
          ⚠️ {parsedContent.blockCount} blocks, {parsedContent.parts.filter(p => p.type === 'error').length} errors
        </div>
      )}
    </div>
  );
});
MessageContentRenderer.displayName = 'MessageContentRenderer';

