'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Globe, 
  Send, 
  Loader2, 
  X, 
  Sparkles,
  Link,
  Plus,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeepResearchStore, selectIsSubmitting, selectError } from '../../../store/deepResearchStore';
import { useAuthStore } from '../../../store/authStore';

type Mode = 'search' | 'research';

interface ResearchSearchCreateProps {
  onSearch: (query: string) => void;
  searchQuery: string;
  className?: string;
  disabled?: boolean;
}

export const ResearchSearchCreate: React.FC<ResearchSearchCreateProps> = ({
  onSearch,
  searchQuery,
  className,
  disabled = false
}) => {
  const user = useAuthStore(state => state.user);
  
  // Store
  const isSubmitting = useDeepResearchStore(selectIsSubmitting);
  const storeError = useDeepResearchStore(selectError);
  const startResearch = useDeepResearchStore(state => state.startResearch);
  const clearError = useDeepResearchStore(state => state.clearError);
  
  // Local state
  const [mode, setMode] = useState<Mode>('research');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urls, setUrls] = useState<string[]>(['']);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync store error
  useEffect(() => {
    if (storeError) {
      setError(storeError);
    }
  }, [storeError]);

  // Auto-resize textarea in research mode
  useEffect(() => {
    if (mode === 'research' && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text, mode]);

  // Focus input when switching modes
  useEffect(() => {
    if (mode === 'search' && inputRef.current) {
      inputRef.current.focus();
    } else if (mode === 'research' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  };

  const handleStartResearch = async () => {
    if (!text.trim() || isSubmitting || !user) return;
    
    setError(null);
    clearError();
    
    // Filter valid URLs
    const validUrls = urls.filter(u => u.trim() && isValidUrl(u.trim()));
    
    const jobId = await startResearch(user.id, {
      prompt: text.trim(),
      urls: validUrls.length > 0 ? validUrls : undefined
    });
    
    if (jobId) {
      // Success - clear form
      setText('');
      setUrls(['']);
      setShowUrlInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'research' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartResearch();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onSearch('');
    }
  };

  const handleModeSwitch = (newMode: Mode) => {
    if (newMode !== mode) {
      // Clear states when switching
      if (mode === 'research') {
        setText('');
        setError(null);
        setShowUrlInput(false);
        setUrls(['']);
        clearError();
      }
      setMode(newMode);
    }
  };

  const handleAddUrl = () => {
    setUrls([...urls, '']);
  };

  const handleRemoveUrl = (index: number) => {
    if (urls.length > 1) {
      setUrls(urls.filter((_, i) => i !== index));
    } else {
      setUrls(['']);
    }
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const displayError = error || storeError;

  return (
    <div className={cn("w-full", className)}>
      {/* URL Input (only in research mode when expanded) */}
      {mode === 'research' && showUrlInput && (
        <div className="mb-3 p-3 bg-zinc-900/50 border border-violet-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1">
              <Link className="w-3 h-3" />
              URLs específicas (opcional)
            </span>
            <button
              onClick={() => setShowUrlInput(false)}
              className="p-1 hover:bg-white/5 rounded-md transition-colors"
            >
              <X className="w-3 h-3 text-zinc-500" />
            </button>
          </div>
          
          <div className="space-y-2">
            {urls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => handleUrlChange(index, e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="flex-1 px-3 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveUrl(index)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={handleAddUrl}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              <Plus className="w-3 h-3" />
              Añadir URL
            </button>
          </div>
        </div>
      )}

      {/* Unified Input Area */}
      <div className="relative group">
        <div className={cn(
          "relative flex items-end gap-2 p-2 bg-zinc-900/50 border rounded-xl transition-all duration-200",
          displayError ? "border-rose-500/30" : "border-white/10 focus-within:border-violet-500/30"
        )}>
          {/* Mode Toggle Switch */}
          <div className="flex items-center gap-0.5 p-0.5 bg-zinc-800/80 rounded-lg flex-shrink-0 mb-1">
            <button
              onClick={() => handleModeSwitch('research')}
              disabled={disabled}
              className={cn(
                "p-1.5 rounded-md transition-all",
                mode === 'research' 
                  ? "bg-violet-500/20 text-violet-400 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-300",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              title="Nueva investigación"
            >
              <Globe className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleModeSwitch('search')}
              className={cn(
                "p-1.5 rounded-md transition-all",
                mode === 'search' 
                  ? "bg-zinc-700 text-zinc-100 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
              title="Buscar investigaciones"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
          
          {/* Input field - changes based on mode */}
          {mode === 'search' ? (
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar investigaciones..."
                className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none py-1.5"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearch('')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 hover:bg-white/5 rounded"
                >
                  <X className="w-3 h-3 text-zinc-500" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col gap-1">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                    clearError();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="¿Qué deseas investigar en la web?"
                  rows={1}
                  disabled={isSubmitting || disabled}
                  className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none disabled:opacity-50 py-1.5"
                />
                
                {/* URL toggle button */}
                {!showUrlInput && (
                  <button
                    onClick={() => setShowUrlInput(true)}
                    className="self-start text-[10px] text-violet-400/60 hover:text-violet-400 flex items-center gap-1 -mt-1"
                  >
                    <Link className="w-2.5 h-2.5" />
                    Añadir URLs
                  </button>
                )}
              </div>

              <button
                onClick={handleStartResearch}
                disabled={!text.trim() || isSubmitting || disabled}
                className={cn(
                  "p-2 rounded-lg transition-all flex-shrink-0",
                  text.trim() && !disabled
                    ? "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                    : "text-zinc-600 cursor-not-allowed"
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Error message */}
        {displayError && (
          <div className="absolute -bottom-6 left-0 flex items-center gap-2">
            <p className="text-[10px] text-rose-400">
              {displayError}
            </p>
            <button 
              onClick={handleStartResearch}
              className="text-[10px] font-medium text-violet-400 hover:text-violet-300 underline underline-offset-2"
            >
              Reintentar
            </button>
          </div>
        )}
        
        {/* Hint for research mode */}
        {mode === 'research' && !displayError && (
          <p className="absolute -bottom-5 left-0 text-[10px] text-zinc-600">
            <Sparkles className="w-2.5 h-2.5 inline mr-1" />
            Powered by Firecrawl Agent
          </p>
        )}
      </div>
    </div>
  );
};

export default ResearchSearchCreate;
