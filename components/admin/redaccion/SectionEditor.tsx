'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import {
  X,
  Maximize2,
  Minimize2,
  Save,
  Loader2,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Undo,
  Redo,
  Sparkles,
  History,
  RotateCcw,
  Check,
  ChevronRight,
  PenLine,
  Expand,
  Shrink,
  SpellCheck,
  Briefcase,
  MessageCircle,
} from 'lucide-react';
import { RedaccionDetalle } from '@/types/redaccion';
import { useRedaccionStore, DetalleHistorial } from '@/store/redaccionStore';

// ============================================================================
// TYPES
// ============================================================================

interface SectionEditorProps {
  detalle: RedaccionDetalle;
  onSave: (id: number, changes: { titulo?: string; contenido?: string }) => Promise<boolean>;
  onClose: () => void;
  empresaId?: number | null;
}

type SidePanel = 'none' | 'ai' | 'history';

const AI_ACTIONS = [
  { id: 'mejorar', label: 'Mejorar redacción', icon: PenLine, instruction: 'Mejora la redacción: claridad, fluidez y precisión.' },
  { id: 'expandir', label: 'Expandir', icon: Expand, instruction: 'Expande el contenido con más detalles relevantes.' },
  { id: 'resumir', label: 'Resumir', icon: Shrink, instruction: 'Resume el contenido preservando los puntos clave.' },
  { id: 'gramatica', label: 'Corregir gramática', icon: SpellCheck, instruction: 'Corrige errores ortográficos y gramaticales.' },
  { id: 'formal', label: 'Tono formal', icon: Briefcase, instruction: 'Reformula en tono profesional y formal.' },
  { id: 'informal', label: 'Tono informal', icon: MessageCircle, instruction: 'Reformula en tono conversacional y accesible.' },
] as const;

// ============================================================================
// TOOLBAR BUTTON
// ============================================================================

interface ToolbarBtnProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarBtn: React.FC<ToolbarBtnProps> = ({ onClick, isActive, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      p-1.5 rounded-md transition-all
      ${isActive
        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
      }
      ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
    `}
  >
    {children}
  </button>
);

// ============================================================================
// EDITOR TOOLBAR
// ============================================================================

const EditorToolbar: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  if (!editor) return null;

  const iconSize = 'w-3.5 h-3.5';

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/[0.04] bg-[#0d0d0f]/60 flex-wrap">
      {/* Undo / Redo */}
      <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer (Ctrl+Z)">
        <Undo className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer (Ctrl+Y)">
        <Redo className={iconSize} />
      </ToolbarBtn>

      <div className="w-px h-5 bg-white/5 mx-1" />

      {/* Text formatting */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrita (Ctrl+B)">
        <Bold className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Cursiva (Ctrl+I)">
        <Italic className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado">
        <Strikethrough className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Código inline">
        <Code className={iconSize} />
      </ToolbarBtn>

      <div className="w-px h-5 bg-white/5 mx-1" />

      {/* Headings */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Título 1">
        <Heading1 className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Título 2">
        <Heading2 className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Título 3">
        <Heading3 className={iconSize} />
      </ToolbarBtn>

      <div className="w-px h-5 bg-white/5 mx-1" />

      {/* Lists & blocks */}
      <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista">
        <List className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Lista ordenada">
        <ListOrdered className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Cita">
        <Quote className={iconSize} />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Línea horizontal">
        <Minus className={iconSize} />
      </ToolbarBtn>
    </div>
  );
};

// ============================================================================
// AI SIDE PANEL
// ============================================================================

interface AISidePanelProps {
  contenido: string;
  titulo: string;
  empresaId?: number | null;
  aiResult: string;
  aiLoading: boolean;
  aiError: string | null;
  onRun: (instruction: string) => void;
  onAccept: () => void;
  onCancel: () => void;
}

const AISidePanel: React.FC<AISidePanelProps> = ({ aiResult, aiLoading, aiError, onRun, onAccept, onCancel }) => {
  const [customPrompt, setCustomPrompt] = useState('');

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-semibold text-zinc-300">Asistente IA</span>
      </div>

      {/* Quick actions */}
      {!aiResult && !aiLoading && (
        <div className="p-2 space-y-1 border-b border-white/5">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onRun(action.instruction)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-all text-left"
            >
              <action.icon className="w-3.5 h-3.5 text-violet-400/70 shrink-0" />
              {action.label}
              <ChevronRight className="w-3 h-3 ml-auto opacity-30" />
            </button>
          ))}
        </div>
      )}

      {/* Custom prompt */}
      {!aiResult && !aiLoading && (
        <div className="p-2 border-b border-white/5">
          <div className="relative">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Instrucción personalizada..."
              rows={2}
              className="w-full px-2.5 py-2 bg-zinc-900/60 border border-white/5 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30 resize-none"
            />
            {customPrompt.trim() && (
              <button
                onClick={() => { onRun(customPrompt); setCustomPrompt(''); }}
                className="absolute bottom-2 right-2 p-1 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-all"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {aiLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
          <span className="text-xs text-zinc-500">Generando sugerencia...</span>
          <button onClick={onCancel} className="text-[10px] text-zinc-600 hover:text-rose-400 transition-colors">
            Cancelar
          </button>
        </div>
      )}

      {/* Error */}
      {aiError && (
        <div className="p-3 m-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {aiError}
        </div>
      )}

      {/* Result */}
      {aiResult && !aiLoading && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 font-semibold">Sugerencia</div>
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/40 rounded-lg p-3 border border-white/5">
              {aiResult}
            </div>
          </div>
          <div className="p-2 border-t border-white/5 flex items-center gap-2">
            <button
              onClick={onCancel}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 text-xs transition-all"
            >
              Descartar
            </button>
            <button
              onClick={onAccept}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 text-xs font-semibold transition-all"
            >
              <Check className="w-3 h-3" />
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HISTORY SIDE PANEL
// ============================================================================

interface HistorySidePanelProps {
  historial: DetalleHistorial[];
  isLoading: boolean;
  onRestore: (entry: DetalleHistorial) => void;
}

const HistorySidePanel: React.FC<HistorySidePanelProps> = ({ historial, isLoading, onRestore }) => {
  const changeTypeLabel: Record<string, string> = {
    manual: 'Edición manual',
    ai_assist: 'Asistente IA',
    ai_generate: 'Generación IA',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-zinc-300">Historial</span>
        {historial.length > 0 && (
          <span className="text-[10px] text-zinc-600 ml-auto">{historial.length} versiones</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          </div>
        ) : historial.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
            <History className="w-6 h-6 opacity-30 mb-2" />
            <p className="text-xs">Sin historial aún</p>
            <p className="text-[10px] text-zinc-700 mt-1">Se guarda al editar secciones</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {historial.map((entry) => (
              <div
                key={entry.id}
                className="p-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-500">
                    {new Date(entry.created_at).toLocaleString('es-PE', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    entry.change_type === 'ai_assist' ? 'bg-violet-500/10 text-violet-400' :
                    entry.change_type === 'ai_generate' ? 'bg-cyan-500/10 text-cyan-400' :
                    'bg-zinc-800 text-zinc-500'
                  }`}>
                    {changeTypeLabel[entry.change_type] || entry.change_type}
                  </span>
                </div>
                {entry.titulo && (
                  <p className="text-[11px] text-zinc-400 font-medium truncate mb-0.5">{entry.titulo}</p>
                )}
                {entry.contenido && (
                  <p className="text-[10px] text-zinc-600 line-clamp-3 leading-relaxed">
                    {entry.contenido.substring(0, 200)}
                  </p>
                )}
                {entry.change_summary && (
                  <p className="text-[10px] text-zinc-500 italic mt-1">{entry.change_summary}</p>
                )}
                <button
                  onClick={() => onRestore(entry)}
                  className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Restaurar esta versión
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SECTION EDITOR — WYSIWYG con Tiptap
// ============================================================================

export const SectionEditor: React.FC<SectionEditorProps> = ({ detalle, onSave, onClose, empresaId }) => {
  const [titulo, setTitulo] = useState(detalle.titulo);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const initialContentRef = useRef(detalle.contenido || '');

  // Side panel
  const [sidePanel, setSidePanel] = useState<SidePanel>('none');

  // AI assist
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  // History
  const fetchHistorial = useRedaccionStore(state => state.fetchDetalleHistorial);
  const restoreHistorial = useRedaccionStore(state => state.restoreHistorial);
  const historial = useRedaccionStore(state => state.detalleHistorial);
  const isLoadingHistorial = useRedaccionStore(state => state.isLoadingHistorial);

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Escribe el contenido aquí...',
      }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: detalle.contenido || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-base max-w-none focus:outline-none min-h-[300px] px-8 py-6 text-zinc-300 leading-relaxed prose-p:my-3 prose-p:leading-[1.8] prose-headings:text-zinc-100 prose-headings:font-semibold prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-3 prose-h1:pb-2 prose-h1:border-b prose-h1:border-white/5 prose-h2:text-xl prose-h2:mt-5 prose-h2:mb-2 prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-[1.8] prose-strong:text-zinc-100 prose-a:text-cyan-400 prose-code:text-emerald-400 prose-code:bg-emerald-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-blockquote:border-l-2 prose-blockquote:border-primary-500/40 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-zinc-400 prose-hr:border-white/5',
      },
    },
  });

  // Get current markdown from editor
  const getMarkdown = useCallback((): string => {
    if (!editor) return initialContentRef.current;
    return (editor.storage as any).markdown.getMarkdown();
  }, [editor]);

  // Track changes
  const hasChanges = useMemo(() => {
    if (!editor) return false;
    const currentMarkdown = getMarkdown();
    return titulo !== detalle.titulo || currentMarkdown !== (detalle.contenido || '');
  }, [editor, titulo, detalle, getMarkdown]);

  // Stats
  const stats = useMemo(() => {
    if (!editor) return { words: 0, chars: 0 };
    const text = editor.getText();
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { chars, words };
  }, [editor]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!editor || isSaving) return;
    const currentMarkdown = getMarkdown();
    const tituloChanged = titulo !== detalle.titulo;
    const contenidoChanged = currentMarkdown !== (detalle.contenido || '');
    if (!tituloChanged && !contenidoChanged) return;

    setIsSaving(true);
    const changes: { titulo?: string; contenido?: string } = {};
    if (tituloChanged) changes.titulo = titulo;
    if (contenidoChanged) changes.contenido = currentMarkdown;
    await onSave(detalle.id, changes);
    setIsSaving(false);
  }, [editor, isSaving, titulo, detalle, getMarkdown, onSave]);

  // Close with confirmation
  const handleClose = useCallback(() => {
    if (editor) {
      const currentMarkdown = getMarkdown();
      const changed = titulo !== detalle.titulo || currentMarkdown !== (detalle.contenido || '');
      if (changed) {
        if (!confirm('¿Descartar cambios sin guardar?')) return;
      }
    }
    onClose();
  }, [editor, titulo, detalle, getMarkdown, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleSave]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className={`
          bg-[#0a0a0c] border border-white/5 shadow-2xl flex flex-col
          ${isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-5xl h-[92vh] mx-4 rounded-2xl'
          }
        `}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#0d0d0f] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-xs font-bold text-primary-400 shrink-0">
              {detalle.orden}
            </div>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="bg-transparent text-sm font-semibold text-zinc-200 border-none outline-none focus:text-zinc-100 min-w-0 flex-1 placeholder:text-zinc-600"
              placeholder="Título de la sección..."
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                if (sidePanel === 'ai') { setSidePanel('none'); } else { setSidePanel('ai'); setAiResult(''); setAiError(null); }
              }}
              className={`p-2 rounded-lg border transition-all ${
                sidePanel === 'ai'
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
                  : 'border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`}
              title="Asistente IA"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (sidePanel === 'history') { setSidePanel('none'); } else { setSidePanel('history'); fetchHistorial(detalle.id); }
              }}
              className={`p-2 rounded-lg border transition-all ${
                sidePanel === 'history'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`}
              title="Historial de cambios"
            >
              <History className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-white/5 mx-0.5" />

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={handleClose}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <EditorToolbar editor={editor} />

        {/* ── Main area: editor + side panel ── */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Editor Content */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-[#0a0a0c] scrollbar-hide">
            <div className="max-w-4xl mx-auto">
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Side Panel */}
          {sidePanel !== 'none' && (
            <div className="w-80 shrink-0 border-l border-white/5 bg-[#0d0d0f] flex flex-col overflow-hidden">
              {sidePanel === 'ai' && (
                <AISidePanel
                  contenido={getMarkdown()}
                  titulo={titulo}
                  empresaId={empresaId}
                  aiResult={aiResult}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  onRun={async (instruction: string) => {
                    setAiLoading(true);
                    setAiError(null);
                    setAiResult('');
                    aiAbortRef.current = new AbortController();
                    try {
                      const res = await fetch('/api/redaccion/assist', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contenido: getMarkdown(), titulo, instruccion: instruction, empresaId }),
                        signal: aiAbortRef.current.signal,
                      });
                      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error del servidor'); }
                      const reader = res.body?.getReader();
                      if (!reader) throw new Error('No stream');
                      const decoder = new TextDecoder();
                      let full = '';
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        full += decoder.decode(value, { stream: true });
                        setAiResult(full);
                      }
                    } catch (err: any) {
                      if (err.name !== 'AbortError') setAiError(err.message);
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  onAccept={() => {
                    if (aiResult && editor) {
                      editor.commands.setContent(aiResult);
                      setAiResult('');
                      setSidePanel('none');
                    }
                  }}
                  onCancel={() => {
                    aiAbortRef.current?.abort();
                    setAiLoading(false);
                    setAiResult('');
                  }}
                />
              )}
              {sidePanel === 'history' && (
                <HistorySidePanel
                  historial={historial}
                  isLoading={isLoadingHistorial}
                  onRestore={async (entry) => {
                    if (!confirm('¿Restaurar esta versión? El contenido actual será reemplazado.')) return;
                    const ok = await restoreHistorial(entry.id);
                    if (ok && editor) {
                      if (entry.contenido !== null) editor.commands.setContent(entry.contenido);
                      if (entry.titulo !== null) setTitulo(entry.titulo);
                      setSidePanel('none');
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-[#0d0d0f] shrink-0">
          <div className="flex items-center gap-4 text-[10px] text-zinc-600">
            {hasChanges && (
              <span className="flex items-center gap-1.5 text-amber-500/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Cambios pendientes
              </span>
            )}
            <span>{stats.words} palabras</span>
            <span>{stats.chars} caracteres</span>
            <span className="text-zinc-700">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-white/5 text-[9px]">Ctrl+S</kbd> guardar
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 text-xs font-medium transition-all"
            >
              {hasChanges ? 'Descartar' : 'Cerrar'}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                ${hasChanges && !isSaving
                  ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 shadow-lg shadow-cyan-500/5'
                  : 'bg-zinc-900/50 border border-white/5 text-zinc-700 cursor-not-allowed'
                }
              `}
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectionEditor;
