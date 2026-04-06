'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Smile, 
  AtSign, 
  MoreHorizontal, 
  Edit2, 
  Trash2,
  Reply
} from 'lucide-react';
import { TaskV3, TaskComment, ReactionEmoji } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { useContactStore, selectUserContext } from '@/store/contactStore';
import { cn } from '@/lib/utils';

interface TaskCommentsProps {
  task: TaskV3;
}

export const TaskComments: React.FC<TaskCommentsProps> = ({ task }) => {
  const { addComment, deleteComment, toggleReaction } = useTareasStore();
  // PERF: Granular selector
  const userContext = useContactStore(selectUserContext);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Mock current user for UI (in real app, use userContext)
  const currentUserId = userContext?.id || 999; 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !userContext?.id) return;

    setIsSubmitting(true);
    try {
      await addComment(task.id, newComment.trim(), userContext.id);
      setNewComment('');
      // Scroll to bottom
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReaction = async (commentId: number, emoji: ReactionEmoji) => {
    if (!userContext?.id) return;
    await toggleReaction(commentId, userContext.id, emoji);
  };

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      
      {/* Comments List */}
      <div className="flex-1 space-y-6 pb-4">
        {(!task.comentarios || task.comentarios.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-12">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
              <span className="text-xl">💬</span>
            </div>
            <p className="text-sm">No hay comentarios aún</p>
            <p className="text-xs opacity-60">Sé el primero en comentar</p>
          </div>
        ) : (
          task.comentarios.map((comment) => (
            <CommentItem 
              key={comment.id} 
              comment={comment} 
              currentUserId={currentUserId}
              onReaction={handleReaction}
              onDelete={deleteComment}
              task={task}
            />
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-auto pt-4 border-t border-white/5">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escribe un comentario... (@ para mencionar)"
            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl p-4 pr-12 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors resize-none min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button 
              type="button"
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
            >
              <Smile className="w-4 h-4" />
            </button>
            <button 
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
        <div className="mt-2 text-[10px] text-zinc-500 px-1">
          Presiona Enter para enviar, Shift + Enter para nueva línea
        </div>
      </div>
    </div>
  );
};

interface CommentItemProps {
  comment: TaskComment;
  currentUserId: number;
  onReaction: (id: number, emoji: ReactionEmoji) => void;
  onDelete: (id: number) => void;
  task: TaskV3;
}

const CommentItem: React.FC<CommentItemProps> = ({ 
  comment, 
  currentUserId, 
  onReaction, 
  onDelete,
  task 
}) => {
  const isOwn = comment.autor_id === currentUserId;
  
  // Get reactions for this comment from task computed field
  // In a real app we might normalize this better
  const reactions = task._reacciones_por_comentario?.[comment.id] || [];

  return (
    <div className={cn("flex gap-3 group", isOwn ? "flex-row-reverse" : "")}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-300 border border-white/5">
          {comment.autor?.nombre?.[0] || '?'}
        </div>
      </div>

      {/* Content */}
      <div className={cn("flex flex-col max-w-[80%]", isOwn ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2 mb-1 px-1">
          <span className="text-xs font-medium text-zinc-300">
            {comment.autor?.nombre} {comment.autor?.apellido}
          </span>
          <span className="text-[10px] text-zinc-500">
            {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className={cn(
          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed relative group-hover:shadow-lg transition-shadow",
          isOwn 
            ? "bg-primary-500/10 text-primary-100 rounded-tr-sm border border-primary-500/20" 
            : "bg-zinc-800/50 text-zinc-200 rounded-tl-sm border border-white/5"
        )}>
          {comment.contenido}
          
          {/* Actions (Hover) */}
          <div className={cn(
            "absolute top-0 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 p-1 rounded-lg bg-[#0c0c0e] border border-white/10 shadow-lg transition-opacity duration-200",
            isOwn ? "right-full mr-2" : "left-full ml-2"
          )}>
            <button 
              onClick={() => onReaction(comment.id, '👍')}
              className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors">
              <Reply className="w-3.5 h-3.5" />
            </button>
            {isOwn && (
              <button 
                onClick={() => onDelete(comment.id)}
                className="p-1.5 hover:bg-red-500/10 rounded-md text-zinc-400 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Reactions Display */}
        {reactions.length > 0 && (
          <div className={cn("flex items-center gap-1 mt-1.5", isOwn ? "justify-end" : "justify-start")}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReaction(comment.id, r.emoji)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors",
                  r.reacted_by_me 
                    ? "bg-primary-500/20 border-primary-500/30 text-primary-300" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                )}
              >
                <span>{r.emoji}</span>
                <span className="font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
