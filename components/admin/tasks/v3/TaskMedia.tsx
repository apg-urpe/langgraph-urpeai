'use client';

import React, { useState, useRef } from 'react';
import { 
  Upload, 
  X, 
  File, 
  FileText, 
  Image as ImageIcon, 
  MoreHorizontal,
  Download,
  Trash2,
  Eye,
  Paperclip
} from 'lucide-react';
import { TaskV3, TaskMedia } from '@/types/tasks-v3';
import { useTareasStore } from '@/store/tareasStore';
import { useContactStore, selectUserContext } from '@/store/contactStore';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/types/tasks-v3';

interface TaskMediaProps {
  task: TaskV3;
}

export const TaskMediaGallery: React.FC<TaskMediaProps> = ({ task }) => {
  const { uploadTaskMedia, deleteTaskMedia, setTaskCover } = useTareasStore();
  // PERF: Granular selector
  const userContext = useContactStore(selectUserContext);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    if (!userContext?.id) return;
    
    setIsUploading(true);
    try {
      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadTaskMedia(task.id, file, userContext.id);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Upload Area */}
      <div 
        className={cn(
          "border-2 border-dashed rounded-xl p-8 transition-colors text-center cursor-pointer",
          dragActive 
            ? "border-primary-500 bg-primary-500/5" 
            : "border-white/10 hover:border-white/20 hover:bg-white/5"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleChange}
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            isUploading ? "bg-primary-500/20 text-primary-400" : "bg-zinc-800 text-zinc-400"
          )}>
            {isUploading ? (
              <Upload className="w-6 h-6 animate-bounce" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-200">
              {isUploading ? 'Subiendo archivos...' : 'Arrastra archivos aquí o haz clic para subir'}
            </p>
            <p className="text-xs text-zinc-500">
              Imágenes, documentos, PDF (máx. 10MB)
            </p>
          </div>
        </div>
      </div>

      {/* Media Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
          <Paperclip className="w-4 h-4" />
          Archivos adjuntos ({task.media?.length || 0})
        </h3>

        {(!task.media || task.media.length === 0) ? (
          <p className="text-sm text-zinc-500 italic">No hay archivos adjuntos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {task.media.map((media) => (
              <MediaCard 
                key={media.id} 
                media={media} 
                taskId={task.id}
                onDelete={deleteTaskMedia}
                onSetCover={setTaskCover}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface MediaCardProps {
  media: TaskMedia;
  taskId: number;
  onDelete: (id: number) => Promise<boolean>;
  onSetCover: (taskId: number, mediaId: number) => Promise<boolean>;
}

const MediaCard: React.FC<MediaCardProps> = ({ media, taskId, onDelete, onSetCover }) => {
  const isImage = media.tipo_mime.startsWith('image/');

  const handleDownload = () => {
    if (media.url_publica) {
      window.open(media.url_publica, '_blank');
    }
  };

  return (
    <div className="group relative bg-[#1a1a1c] border border-white/5 rounded-lg overflow-hidden hover:border-white/10 transition-all">
      
      {/* Preview */}
      <div className="aspect-square bg-zinc-900 relative overflow-hidden flex items-center justify-center">
        {isImage && media.url_publica ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
            src={media.url_publica} 
            alt={media.nombre_archivo}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <FileIcon mimeType={media.tipo_mime} className="w-10 h-10 text-zinc-600" />
        )}

        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button 
            onClick={handleDownload}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            title="Ver / Descargar"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(media.id)}
            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs font-medium text-zinc-200 truncate" title={media.nombre_archivo}>
          {media.nombre_archivo}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-zinc-500">
            {formatFileSize(media.tamaño_bytes)}
          </span>
          {isImage && (
            <button
              onClick={() => onSetCover(taskId, media.id)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                media.es_portada 
                  ? "bg-primary-500/20 text-primary-400 cursor-default" 
                  : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
              )}
              disabled={media.es_portada}
            >
              {media.es_portada ? 'Portada' : 'Usar portada'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FileIcon = ({ mimeType, className }: { mimeType: string, className?: string }) => {
  if (mimeType.startsWith('image/')) return <ImageIcon className={className} />;
  if (mimeType.includes('pdf')) return <FileText className={className} />;
  return <File className={className} />;
};
