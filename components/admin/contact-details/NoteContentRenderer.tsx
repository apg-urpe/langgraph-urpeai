'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Code2, FileText } from 'lucide-react';
import { PropertyViewer } from './PropertyEditor';

export type NoteContentType = 'markdown' | 'json' | 'text';

interface NoteContentRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

/**
 * Detecta si el contenido es JSON válido
 */
export const detectContentType = (content: unknown): NoteContentType => {
  // Defensive: handle null, undefined, non-string values
  if (content === null || content === undefined) return 'text';
  if (typeof content !== 'string') {
    // If it's already an object/array, treat as JSON
    if (typeof content === 'object') return 'json';
    return 'text';
  }
  
  const trimmed = content.trim();
  
  // Check if it's JSON (starts with { or [)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, continue to markdown check
    }
  }
  
  // Check if it has markdown indicators
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers
    /\*\*[^*]+\*\*/,        // Bold
    /\*[^*]+\*/,            // Italic
    /\[[^\]]+\]\([^)]+\)/,  // Links
    /^[-*+]\s/m,            // Unordered lists
    /^\d+\.\s/m,            // Ordered lists
    /^>\s/m,                // Blockquotes
    /`[^`]+`/,              // Inline code
    /```[\s\S]*```/,        // Code blocks
    /^\|.+\|$/m,            // Tables
  ];
  
  const hasMarkdown = markdownPatterns.some(pattern => pattern.test(trimmed));
  
  return hasMarkdown ? 'markdown' : 'text';
};

/**
 * Intenta parsear JSON de forma segura
 */
export const safeParseJson = (content: unknown): { success: boolean; data: any } => {
  try {
    // If content is already an object, return it directly
    if (content !== null && typeof content === 'object') {
      return { success: true, data: content };
    }
    // If not a string, can't parse
    if (typeof content !== 'string') {
      return { success: false, data: null };
    }
    const data = JSON.parse(content.trim());
    return { success: true, data };
  } catch {
    return { success: false, data: null };
  }
};

/**
 * Componente que renderiza contenido detectando automáticamente el tipo
 */
export const NoteContentRenderer: React.FC<NoteContentRendererProps> = ({
  content,
  className = '',
  compact = false,
}) => {
  const { contentType, parsedData, safeContent } = useMemo(() => {
    // Defensive: ensure we have a safe string to work with
    let safeStr = '';
    if (typeof content === 'string') {
      safeStr = content;
    } else if (content !== null && content !== undefined) {
      // If it's an object, stringify it for display
      try {
        safeStr = JSON.stringify(content, null, 2);
      } catch {
        safeStr = String(content);
      }
    }
    
    const type = detectContentType(content);
    if (type === 'json') {
      const parsed = safeParseJson(content);
      return { contentType: type, parsedData: parsed.success ? parsed.data : null, safeContent: safeStr };
    }
    return { contentType: type, parsedData: null, safeContent: safeStr };
  }, [content]);

  if (!content) {
    return (
      <span className="text-zinc-500 italic text-sm">Sin contenido</span>
    );
  }

  // Render JSON as property viewer
  if (contentType === 'json' && parsedData !== null) {
    return (
      <div className={className}>
        {!compact && (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-2">
            <Code2 className="w-3 h-3" />
            <span>Propiedades</span>
          </div>
        )}
        <PropertyViewer 
          data={parsedData} 
          compact={compact}
        />
      </div>
    );
  }

  // Render Markdown (or plain text with markdown support)
  return (
    <div className={`prose prose-invert prose-sm max-w-none leading-relaxed ${compact ? 'line-clamp-4' : ''} ${className}`}>
      {!compact && contentType === 'markdown' && (
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-2 not-prose">
          <FileText className="w-3 h-3" />
          <span>Markdown</span>
        </div>
      )}
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom link styling
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 underline underline-offset-2"
            >
              {children}
            </a>
          ),
          // Custom code block styling
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-primary-300 text-xs font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className} block p-3 rounded-lg bg-zinc-800/80 border border-zinc-700/50 overflow-x-auto`} {...props}>
                {children}
              </code>
            );
          },
          // Custom table styling
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border-collapse border border-zinc-700/50 rounded-lg overflow-hidden">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-300 bg-zinc-800/50 border-b border-zinc-700/50">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-sm text-zinc-400 border-b border-zinc-700/30">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default NoteContentRenderer;
