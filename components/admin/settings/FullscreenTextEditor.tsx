'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Maximize2, 
  Minimize2, 
  Eye, 
  Pencil,
  Save,
  FileText,
  History
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { EnterpriseHistoryViewer } from './EnterpriseHistoryViewer';

type EditorMode = 'edit' | 'preview';

interface FullscreenTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSaveToDb?: (newValue: string) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
  placeholder?: string;
  enterpriseId?: number;
  fieldKey?: string;
}

const safeJsonParse = (input: string): { ok: boolean; value: any; error?: string } => {
  try {
    if (!input.trim()) return { ok: true, value: null };
    return { ok: true, value: JSON.parse(input) };
  } catch (e: any) {
    return { ok: false, value: null, error: e?.message || 'JSON inválido' };
  }
};

export const FullscreenTextEditor: React.FC<FullscreenTextEditorProps> = ({
  label,
  value,
  onChange,
  onSaveToDb,
  onClose,
  disabled = false,
  placeholder = 'Escribe aquí...',
  enterpriseId,
  fieldKey
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [mode, setMode] = useState<EditorMode>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Track if there are unsaved changes
  const hasChanges = localValue !== value;
  
  // Preview content detection
  const preview = useMemo(() => {
    const raw = (localValue || '').trim();
    if (!raw) return { type: 'empty' as const };
    const parsed = safeJsonParse(raw);
    if (parsed.ok && parsed.value !== null && parsed.value !== undefined) {
      return { type: 'json' as const, value: parsed.value };
    }
    return { type: 'markdown' as const, value: localValue || '' };
  }, [localValue]);
  
  // Handle save
  const handleSave = async () => {
    onChange(localValue);
    
    // If onSaveToDb is provided, also persist to database
    if (onSaveToDb) {
      setIsSaving(true);
      try {
        await onSaveToDb(localValue);
      } catch (err) {
        console.error('[FullscreenTextEditor] Error saving to DB:', err);
      } finally {
        setIsSaving(false);
      }
    }
    
    onClose();
  };
  
  // Handle close with confirmation
  const handleClose = () => {
    if (hasChanges && !disabled) {
      if (confirm('¿Descartar cambios sin guardar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!disabled && hasChanges && !isSaving) {
          handleSave();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChanges, disabled, isSaving]); // handleClose, handleSave excluded - stable props
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div 
        className={`
          bg-[#0a0a0c] border border-white/5 rounded-2xl shadow-2xl flex flex-col
          ${isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-full max-w-4xl h-[90vh] mx-4'
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0d0d0f]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">{label}</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-tight">
                {preview.type === 'json' ? 'Estructura JSON' : 'Markdown / Texto'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Mode tabs */}
            <div className="flex items-center bg-black/40 rounded-lg p-1 mr-2 border border-white/5">
              <button
                onClick={() => setMode('edit')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                  ${mode === 'edit' 
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' 
                    : 'text-zinc-500 hover:text-zinc-400'
                  }
                `}
              >
                <Pencil className="w-3 h-3" />
                Editar
              </button>
              <button
                onClick={() => setMode('preview')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                  ${mode === 'preview' 
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                    : 'text-zinc-500 hover:text-zinc-400'
                  }
                `}
              >
                <Eye className="w-3 h-3" />
                Vista
              </button>
            </div>
            
            {/* History button - only show if enterpriseId and fieldKey are provided */}
            {enterpriseId && fieldKey && (
              <button
                onClick={() => setShowHistory(true)}
                className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all"
                title="Ver historial de cambios"
              >
                <History className="w-4 h-4" />
              </button>
            )}
            
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            
            {/* Close */}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden p-6 bg-[#0a0a0c]">
          {mode === 'edit' ? (
            <textarea
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              disabled={disabled}
              placeholder={placeholder}
              className="w-full h-full bg-[#0d0d0f] border border-white/5 rounded-xl px-5 py-4 text-sm text-zinc-300 placeholder:text-zinc-700 focus:border-cyan-500/30 outline-none disabled:opacity-60 resize-none font-mono leading-relaxed selection:bg-cyan-500/30"
            />
          ) : (
            <div className="w-full h-full bg-[#0d0d0f] border border-white/5 rounded-xl p-8 overflow-auto selection:bg-emerald-500/20">
              {preview.type === 'empty' ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-700">
                  <FileText className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm tracking-wide">Sin contenido para visualizar</p>
                </div>
              ) : preview.type === 'json' ? (
                <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                  {JSON.stringify(preview.value, null, 2)}
                </pre>
              ) : (
                <div
                  className={
                    "prose prose-invert max-w-none " +
                    "text-zinc-300 leading-relaxed " +
                    "prose-p:my-4 prose-p:leading-7 " +
                    "prose-ul:my-4 prose-ol:my-4 " +
                    "prose-li:my-1.5 prose-li:leading-7 " +
                    "prose-headings:text-zinc-100 prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-3 " +
                    "prose-strong:text-zinc-100 prose-strong:font-bold " +
                    "prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline " +
                    "prose-code:text-emerald-400 prose-code:bg-emerald-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
                  }
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {preview.value}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[#0d0d0f]">
          <div className="text-xs">
            {hasChanges && !disabled ? (
              <span className="flex items-center gap-2 text-amber-500/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Cambios pendientes de guardar
              </span>
            ) : (
              <span className="text-zinc-600">
                Usa <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/5 text-[10px]">Ctrl+S</kbd> para guardar rápidamente
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 text-xs font-medium transition-all"
            >
              {hasChanges && !disabled ? 'Descartar' : 'Cerrar'}
            </button>
            
            {!disabled && (
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={`
                  flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                  ${hasChanges && !isSaving
                    ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 shadow-lg shadow-cyan-500/5'
                    : 'bg-zinc-900/50 border border-white/5 text-zinc-700 cursor-not-allowed'
                  }
                `}
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* History Viewer Modal */}
      {showHistory && enterpriseId && fieldKey && (
        <EnterpriseHistoryViewer
          enterpriseId={enterpriseId}
          fieldKey={fieldKey}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};
