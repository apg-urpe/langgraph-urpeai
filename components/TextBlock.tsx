'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AlignLeft, Info, Quote } from 'lucide-react';

interface TextBlockProps {
  title?: string;
  content: string;
  isMarkdown?: boolean;
}

export const TextBlock: React.FC<TextBlockProps> = ({ title, content, isMarkdown = true }) => {
  return (
    <div className="relative group w-full h-full flex flex-col">
      {/* Glow effect behind */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500/20 to-secondary-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-700"></div>
      
      <div className="relative flex flex-col h-full bg-zinc-950/80 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg transition-all duration-300 group-hover:border-white/20">
        
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

        {title && (
          <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-100 tracking-wide uppercase flex items-center gap-2">
               <div className="p-1 rounded bg-primary-500/10">
                 <AlignLeft className="w-3.5 h-3.5 text-primary-400" />
               </div>
               {title}
            </span>
          </div>
        )}
        
        <div className="p-6 relative flex-1">
           {!title && (
              <Quote className="absolute top-4 right-6 w-8 h-8 text-white/5 rotate-180" />
           )}
           
           <div className={`text-zinc-300 text-sm leading-7 ${!title ? 'pt-1' : ''}`}>
            {isMarkdown ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:text-zinc-300 prose-headings:text-zinc-100 prose-strong:text-white prose-a:text-primary-400 prose-ul:text-zinc-400 prose-blockquote:border-l-primary-500 prose-blockquote:bg-zinc-900/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
            ) : (
                <p className="whitespace-pre-wrap font-light">{content}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
