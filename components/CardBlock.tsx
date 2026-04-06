'use client';

import React, { useState } from 'react';
import { BlockActions } from './BlockActions';
import { sanitizeHtml, markdownToSafeHtml } from '../lib/sanitize-html';
import { BlockTheme } from '../types/chat';

// Theme styles for CardBlock
const themeStyles: Record<BlockTheme, { container: string; section: string }> = {
  default: {
    container: 'bg-black/40 border-white/10 hover:border-primary-500/30',
    section: 'border-white/5 bg-zinc-900/40'
  },
  success: {
    container: 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]',
    section: 'border-emerald-500/10 bg-emerald-900/20'
  },
  warning: {
    container: 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.1)]',
    section: 'border-amber-500/10 bg-amber-900/20'
  },
  error: {
    container: 'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.1)]',
    section: 'border-rose-500/10 bg-rose-900/20'
  },
  info: {
    container: 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.1)]',
    section: 'border-blue-500/10 bg-blue-900/20'
  },
  special: {
    container: 'bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40 shadow-[0_0_30px_rgba(139,92,246,0.1)]',
    section: 'border-violet-500/10 bg-violet-900/20'
  },
  neutral: {
    container: 'bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.1)]',
    section: 'border-cyan-500/10 bg-cyan-900/20'
  },
  primary: {
    container: 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.1)]',
    section: 'border-blue-500/10 bg-blue-900/20'
  },
  secondary: {
    container: 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]',
    section: 'border-emerald-500/10 bg-emerald-900/20'
  }
};

// Section type for structured content
interface CardSection {
  type?: string;
  title: string;
  body?: string | string[];
  content?: string | string[];
  fields?: Array<{
    label: string;
    value: string | string[];
  }>;
}

interface CardBlockProps {
  title?: string;
  theme?: BlockTheme;
  data: {
    // New simple format (from AI)
    title?: string;
    subtitle?: string;
    image?: string;
    content?: string | CardSection[];  // Can be string OR array
    footer?: string;
    // Legacy header format
    header?: {
      subtitle?: string;
      image?: string;
    };
    // Legacy sections format
    sections?: CardSection[];
    // Legacy individual fields
    overview?: string;
    productos?: string;
    contacto?: string;
    testimonios?: string;
    // Actions
    actions?: Array<{
      id: string;
      label: string;
      icon?: string;
      variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
      payload?: any;
      [key: string]: any;
    }>;
  };
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

export const CardBlock: React.FC<CardBlockProps> = ({ 
  title, 
  theme = 'default',
  data, 
  onInteract, 
  disabled = false 
}) => {
  const [logoError, setLogoError] = useState(false);
  
  // RESILIENT: Normalize sections - handle string, array, or object mappings
  const getSections = (): CardSection[] => {
    // 1. Try legacy sections format
    if (Array.isArray(data.sections)) {
      return data.sections;
    }
    
    // 2. Try content as array of sections
    if (Array.isArray(data.content)) {
      return data.content as CardSection[];
    }

    // 3. NEW: If data itself contains objects that are not the standard keys, 
    // treat those keys as section titles and their values as fields/content.
    // This handles the "Francisco" format where "Personal Info", "Business Details", etc. are top-level keys in data.
    const standardKeys = ['title', 'subtitle', 'image', 'content', 'footer', 'header', 'sections', 'overview', 'productos', 'contacto', 'testimonios', 'actions'];
    const dynamicSections: CardSection[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (!standardKeys.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        // This looks like a section (e.g., "Personal Info": { ... })
        dynamicSections.push({
          title: key,
          fields: Object.entries(value).map(([fKey, fValue]) => ({
            label: fKey,
            value: String(fValue)
          }))
        });
      }
    });

    if (dynamicSections.length > 0) {
      return dynamicSections;
    }
    
    // Empty array as fallback
    return [];
  };
  
  const sections = getSections();
  
  // RESILIENT: Check if content is a simple string (new AI format)
  const hasSimpleContent = typeof data.content === 'string' && data.content.trim().length > 0;
  
  // RESILIENT: Normalize image - can come from data.image or data.header.image
  const cardImage = data.image || data.header?.image;
  
  // RESILIENT: Normalize subtitle - can come from data.subtitle or data.header.subtitle
  const cardSubtitle = data.subtitle || data.header?.subtitle;
  
  // RESILIENT: Get display title - prefer prop, then data.title, then fallback
  const displayTitle = title || data.title || 'Información';
  
  // Get theme styles
  const themeStyle = themeStyles[theme] || themeStyles.default;

  // Use sanitized HTML conversion
  const toHtml = (input?: string): string => markdownToSafeHtml(input || '');

  const renderFieldValue = (value?: string | string[]) => {
    if (!value) return <span className="text-zinc-500">-</span>;

    // Detect if the value is a stringified JSON array
    let processedValue = value;
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          processedValue = parsed;
        }
      } catch (e) {
        // Fallback to original value if parsing fails
      }
    }

    if (Array.isArray(processedValue)) {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {processedValue.map((item, idx) => (
            <span 
              key={idx} 
              className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-zinc-300 font-medium"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(toHtml(item)) }} 
            />
          ))}
        </div>
      );
    }

    return (
      <div
        className="text-zinc-300 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(toHtml(processedValue as string)) }}
      />
    );
  };
  const handleAction = (actionData: any) => {
    if (onInteract) {
      onInteract({
        type: 'BLOCK_ACTION',
        action: actionData
      });
    }
  };

  return (
    <div className={`border rounded-2xl overflow-hidden backdrop-blur-md transition-all duration-300 ${themeStyle.container}`}>
      <div className="px-5 py-4 border-b border-white/5 bg-zinc-900/20">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-zinc-100 text-base font-bold leading-tight truncate">{displayTitle}</h3>
            {cardSubtitle && (
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate uppercase tracking-wider">{cardSubtitle}</p>
            )}
          </div>
          {cardImage && !logoError && (
            <div className="h-8 w-8 rounded-lg border border-white/5 bg-zinc-900/40 flex items-center justify-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardImage}
                alt={displayTitle}
                className="max-h-full max-w-full object-contain p-1 opacity-80"
                onError={() => setLogoError(true)}
              />
            </div>
          )}
        </div>
      </div>
      <div className="p-5 space-y-5">
        {/* RESILIENT: Render simple string content (new AI format) */}
        {hasSimpleContent && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
            <div 
              className="text-zinc-300 text-sm leading-relaxed space-y-1"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(toHtml(data.content as string)) }}
            />
          </div>
        )}
        
        {/* RESILIENT: Render footer if present */}
        {data.footer && (
          <div className="text-[10px] text-zinc-500 italic px-1">
            {data.footer}
          </div>
        )}
        
        {/* Render sections array format */}
        {sections.length > 0 && sections.map((section, index) => (
            <div key={index} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-white/5"></div>
                <h4 className="text-zinc-500 text-[10px] uppercase tracking-[0.15em] font-bold">{section.title}</h4>
                <div className="h-px w-4 bg-white/5"></div>
              </div>

              {(() => {
                const bodyContent = section.body ?? section.content;
                if (!bodyContent) return null;
                const contentString = Array.isArray(bodyContent) ? bodyContent.join('\n') : bodyContent;
                return (
                  <div 
                    className="text-zinc-300 text-sm leading-relaxed space-y-1 px-1"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(toHtml(contentString)) }}
                  />
                );
              })()}

              {section.fields && section.fields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 px-1">
                  {section.fields.map((field, fieldIdx) => (
                    <div key={fieldIdx} className="flex flex-col gap-0.5">
                      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">{field.label}</div>
                      {renderFieldValue(field.value)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        
        {/* Fallback to old format when no sections and no simple content */}
        {sections.length === 0 && !hasSimpleContent && (
          <>
            {data.overview && (
              <div className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4 md:p-5 space-y-2 shadow-inner">
                <h4 className="text-zinc-100 text-base font-semibold">Resumen</h4>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{data.overview}</p>
              </div>
            )}
            
            {data.productos && (
              <div className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4 md:p-5 space-y-2 shadow-inner">
                <h4 className="text-zinc-100 text-base font-semibold">Productos</h4>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{data.productos}</p>
              </div>
            )}
            
            {data.contacto && (
              <div className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4 md:p-5 space-y-2 shadow-inner">
                <h4 className="text-zinc-100 text-base font-semibold">Contacto</h4>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{data.contacto}</p>
              </div>
            )}
            
            {data.testimonios && (
              <div className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4 md:p-5 space-y-2 shadow-inner">
                <h4 className="text-zinc-100 text-base font-semibold">Testimonios</h4>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{data.testimonios}</p>
              </div>
            )}
          </>
        )}
        
        {data.actions && data.actions.length > 0 && (
          <div className="border-t border-white/5 pt-4">
            <BlockActions 
              actions={data.actions} 
              onInteract={handleAction} 
              disabled={disabled} 
            />
          </div>
        )}
      </div>
    </div>
  );
};
