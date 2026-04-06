'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Pencil, Save, X, RotateCcw } from 'lucide-react';
import { TaskV3 } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { cn } from '@/lib/utils';

interface TaskDescriptionProps {
  task: TaskV3;
}

export const TaskDescription: React.FC<TaskDescriptionProps> = ({ task }) => {
  const { updateTask } = useTareasStore();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(task.descripcion_md || task.descripcion || '');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync with task updates
  useEffect(() => {
    setContent(task.descripcion_md || task.descripcion || '');
  }, [task.descripcion_md, task.descripcion]);

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content, isEditing]);

  const handleSave = async () => {
    if (content.trim() === (task.descripcion_md || task.descripcion || '')) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateTask(task.id, {
        descripcion: content, // Legacy support
        descripcion_md: content // V3 support
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving description:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setContent(task.descripcion_md || task.descripcion || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="bg-[#0a0a0c] border border-white/10 rounded-xl overflow-hidden animate-in fade-in duration-200">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/5">
          <span className="text-xs font-medium text-zinc-400">Edición Markdown</span>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleCancel}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
              title="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="p-1.5 text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded-lg transition-colors disabled:opacity-50"
              title="Guardar"
            >
              {isSaving ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[150px] p-4 bg-transparent text-sm text-zinc-200 resize-none focus:outline-none font-mono"
          placeholder="Añade una descripción más detallada..."
        />
        <div className="px-4 py-2 bg-white/5 border-t border-white/5 text-[10px] text-zinc-500 flex justify-between">
          <span>Soporta Markdown básico</span>
          <span>{content.length} caracteres</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-400">Descripción</h3>
        <button 
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-all"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
      
      <div 
        onClick={() => !content && setIsEditing(true)}
        className={cn(
          "prose prose-invert prose-sm max-w-none text-zinc-300",
          "prose-headings:text-zinc-200 prose-headings:font-medium",
          "prose-p:leading-relaxed prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline",
          "prose-pre:bg-[#0a0a0c] prose-pre:border prose-pre:border-white/10",
          !content && "text-zinc-500 italic cursor-pointer hover:text-zinc-400 py-4 border border-dashed border-white/10 rounded-lg text-center"
        )}
      >
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        ) : (
          "Haz clic para añadir una descripción..."
        )}
      </div>
    </div>
  );
};
