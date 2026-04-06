'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, X, CheckSquare, Flag, Calendar } from 'lucide-react';
import { CreateTaskPayload, TaskPriority, TASK_PRIORITY_LABELS } from '@/types/contact';
import { useContactStore, selectUserContext } from '@/store/contactStore';
import { cn } from '@/lib/utils';

interface GeneratedTask {
  titulo: string;
  descripcion: string;
  prioridad: 1 | 2 | 3 | 4;
  items: string[];
  fecha_sugerida?: string;
}

interface QuickTaskInputProps {
  onCreateTask: (payload: CreateTaskPayload) => Promise<void>;
  projectId?: number;
  contactId?: number;
  citaId?: number;
  className?: string;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  1: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  2: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  3: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  4: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
};

export const QuickTaskInput: React.FC<QuickTaskInputProps> = ({
  onCreateTask,
  projectId,
  contactId,
  citaId,
  className
}) => {
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTask, setGeneratedTask] = useState<GeneratedTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userContext = useContactStore(selectUserContext);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleGenerate = async () => {
    if (!text.trim() || text.trim().length < 3) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/monica/task-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), userId: userContext?.authUid })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al generar tarea');
      }

      const task: GeneratedTask = await response.json();
      setGeneratedTask(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!generatedTask) return;

    setIsCreating(true);
    try {
      const payload: CreateTaskPayload = {
        titulo: generatedTask.titulo,
        descripcion: generatedTask.descripcion || undefined,
        prioridad: generatedTask.prioridad,
        items: generatedTask.items,
        fecha_vencimiento: generatedTask.fecha_sugerida,
        proyecto_id: projectId,
        contacto_id: contactId,
        cita_id: citaId
      };

      await onCreateTask(payload);

      // Reset state
      setText('');
      setGeneratedTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear tarea');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setGeneratedTask(null);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !generatedTask) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Generated Task Preview */}
      {generatedTask && (
        <div className="mb-3 p-4 bg-zinc-900/50 border border-primary-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-zinc-100 truncate">
                {generatedTask.titulo}
              </h4>
              {generatedTask.descripcion && (
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                  {generatedTask.descripcion}
                </p>
              )}
            </div>
            <button
              onClick={handleCancel}
              className="p-1 hover:bg-white/5 rounded-md transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3">
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border",
              PRIORITY_COLORS[generatedTask.prioridad]
            )}>
              <Flag className="w-3 h-3" />
              {TASK_PRIORITY_LABELS[generatedTask.prioridad]}
            </span>
            {generatedTask.fecha_sugerida && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20">
                <Calendar className="w-3 h-3" />
                {generatedTask.fecha_sugerida}
              </span>
            )}
          </div>

          {/* Checklist preview */}
          {generatedTask.items.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {generatedTask.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                  <CheckSquare className="w-3.5 h-3.5 text-zinc-600 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
            >
              Descartar
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-400 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isCreating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckSquare className="w-3.5 h-3.5" />
              )}
              Crear tarea
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="relative group">
        <div className={cn(
          "relative flex items-end gap-2 p-2 bg-zinc-900/50 border rounded-xl transition-all duration-200",
          error ? "border-rose-500/30" : "border-white/10 focus-within:border-primary-500/30"
        )}>
          <Sparkles className="w-4 h-4 text-primary-400/50 ml-1 mb-2.5 flex-shrink-0" />
          
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe tu tarea... Ej: 'Llamar a Juan mañana para confirmar la reunión del viernes'"
            rows={1}
            disabled={isGenerating || !!generatedTask}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none disabled:opacity-50 py-1.5"
          />

          <button
            onClick={handleGenerate}
            disabled={!text.trim() || text.trim().length < 3 || isGenerating || !!generatedTask}
            className={cn(
              "p-2 rounded-lg transition-all flex-shrink-0",
              text.trim().length >= 3 && !generatedTask
                ? "bg-primary-500/10 text-primary-400 hover:bg-primary-500/20"
                : "text-zinc-600 cursor-not-allowed"
            )}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <p className="absolute -bottom-5 left-0 text-[10px] text-rose-400">
            {error}
          </p>
        )}

        {/* Hint */}
        {!generatedTask && !error && (
          <p className="absolute -bottom-5 left-0 text-[10px] text-zinc-600 opacity-0 group-focus-within:opacity-100 transition-opacity">
            Enter para generar • Shift+Enter nueva línea
          </p>
        )}
      </div>
    </div>
  );
};
