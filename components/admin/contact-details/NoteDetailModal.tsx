import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Calendar, User, Pencil, Trash2, Clock, Pin, Tag, Paperclip, FileText, Image as ImageIcon, ExternalLink, Bot, EyeOff } from 'lucide-react';
import { NoteContentRenderer } from './NoteContentRenderer';
import { ContactNote } from '../../../types/contact';

interface NoteDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: ContactNote;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  onEdit: (note: ContactNote) => void;
  onDelete: (noteId: number) => void;
}

export const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  isOpen,
  onClose,
  note,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  onEdit,
  onDelete,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasNext, hasPrev, onClose, onNext, onPrev]);

  // Defensive: don't render if not open, no note, or no document (SSR)
  if (!isOpen || !note) return null;
  if (typeof document === 'undefined') return null;

  const formatAuthorName = (noteData: ContactNote) => {
    // Defensive check: author might be an array if FK is not properly configured
    const author = Array.isArray(note.author) ? note.author[0] : note.author;
    
    if (author && typeof author === 'object' && 'nombre' in author) {
      const nombre = author.nombre || '';
      const apellido = author.apellido || '';
      return (
        <span className="flex items-center gap-1.5">
          {nombre} {apellido ? apellido[0] + '.' : ''}
        </span>
      );
    }
    if (note.create_by) return `User #${note.create_by}`;
    if (note.team_humano_id) return `Agente #${note.team_humano_id}`;
    return (
      <span className="flex items-center gap-1.5 text-primary-400">
        <Bot className="w-3.5 h-3.5" />
        Monica
      </span>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 text-zinc-400">
                <span className="text-sm font-medium">Detalle de Nota</span>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onEdit(note);
              }}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Editar"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                onClose();
                onDelete(note.id);
              }}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
           {/* Title & Tags Section */}
           {(note.titulo || (Array.isArray(note.etiquetas) && note.etiquetas.length > 0) || note.es_fijado || note.visible_ia === false) && (
             <div className="mb-6 space-y-3">
               {(note.titulo || note.es_fijado || note.visible_ia === false) && (
                 <div className="flex items-start gap-2">
                   {note.es_fijado && (
                     <div className="mt-1">
                       <Pin className="w-4 h-4 text-primary-400 fill-current" />
                     </div>
                   )}
                   {note.visible_ia === false && (
                     <div className="mt-1 flex items-center gap-1 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400" title="Esta nota no es visible para el agente de IA">
                       <EyeOff className="w-3 h-3" />
                       <span>Solo equipo</span>
                     </div>
                   )}
                   {note.titulo && (
                     <h2 className="text-xl font-semibold text-zinc-100 leading-tight">
                       {note.titulo}
                     </h2>
                   )}
                 </div>
               )}
               
               {Array.isArray(note.etiquetas) && note.etiquetas.length > 0 && (
                 <div className="flex flex-wrap gap-2">
                   {note.etiquetas.map((tag, idx) => (
                     <span 
                       key={idx}
                       className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
                     >
                       <Tag className="w-3 h-3 mr-1.5 opacity-70" />
                       {tag}
                     </span>
                   ))}
                 </div>
               )}
               <div className="h-px bg-white/5 w-full mt-4" />
             </div>
           )}

           <NoteContentRenderer 
             content={note.descripcion || ''} 
             className="leading-relaxed"
           />
           
           {/* Archivos Adjuntos */}
           {note.archivos_urls && note.archivos_urls.length > 0 && (
             <div className="mt-6 pt-4 border-t border-white/5">
               <div className="flex items-center gap-2 mb-3 text-zinc-400">
                 <Paperclip className="w-4 h-4" />
                 <span className="text-sm font-medium">Archivos adjuntos ({note.archivos_urls.length})</span>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 {note.archivos_urls.map((url, idx) => {
                   const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                   const fileName = url.split('/').pop() || `Archivo ${idx + 1}`;
                   
                   return (
                     <a
                       key={idx}
                       href={url}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg hover:bg-zinc-800 hover:border-zinc-600 transition-colors group"
                     >
                       {isImage ? (
                         <div className="w-10 h-10 rounded-md overflow-hidden bg-zinc-700 flex-shrink-0">
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img src={url} alt={fileName} className="w-full h-full object-cover" />
                         </div>
                       ) : (
                         <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                           <FileText className="w-5 h-5 text-amber-400" />
                         </div>
                       )}
                       <div className="flex-1 min-w-0">
                         <p className="text-sm text-zinc-200 truncate">{fileName}</p>
                         <p className="text-xs text-zinc-500">{isImage ? 'Imagen' : 'Documento'}</p>
                       </div>
                       <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
                     </a>
                   );
                 })}
               </div>
             </div>
           )}
        </div>

        {/* Footer / Meta & Navigation */}
        <div className="p-4 border-t border-white/5 bg-zinc-900/50 rounded-b-xl flex items-center justify-between">
          <div className="flex flex-col gap-1 text-xs text-zinc-500">
             <div className="flex items-center gap-2">
               <User className="w-3.5 h-3.5" />
               <span className="font-medium text-zinc-400">{formatAuthorName(note)}</span>
             </div>
             <div className="flex items-center gap-2">
               <Calendar className="w-3.5 h-3.5" />
               <span>
                 {new Date(note.created_at).toLocaleDateString('es-ES', {
                   weekday: 'short',
                   year: 'numeric',
                   month: 'long',
                   day: 'numeric'
                 })}
               </span>
               <Clock className="w-3.5 h-3.5 ml-2" />
               <span>
                 {new Date(note.created_at).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                 })}
               </span>
             </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 text-zinc-300 border border-white/5 hover:border-white/10"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 text-zinc-300 border border-white/5 hover:border-white/10"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
