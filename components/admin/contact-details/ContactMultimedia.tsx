import React, { useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Image, 
  FileText, 
  Music, 
  Video, 
  ExternalLink, 
  Download,
  List,
  Grid3X3,
  Filter,
  X,
  Play,
  Eye,
  Upload,
  Trash2,
  Loader2,
  AlertCircle,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { Multimedia, MultimediaTipo, MULTIMEDIA_TIPO_LABELS } from '../../../types/contact';
import { useContactStore, selectIsObservationMode } from '../../../store/contactStore';
import { ALLOWED_MULTIMEDIA_TYPES, MAX_MULTIMEDIA_SIZE, formatFileSize } from '../../../lib/storage';

interface ContactMultimediaProps {
  multimedia: Multimedia[];
  contactId?: number;
  empresaId?: number;
}

type ViewMode = 'list' | 'grid';
type FilterType = 'all' | MultimediaTipo;

export const ContactMultimedia: React.FC<ContactMultimediaProps> = ({ multimedia, contactId, empresaId }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<MultimediaTipo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadContactMultimedia = useContactStore(state => state.uploadContactMultimedia);
  const deleteContactMultimedia = useContactStore(state => state.deleteContactMultimedia);
  const isObservationMode = useContactStore(selectIsObservationMode);

  const canUpload = contactId && empresaId;

  // Filtered multimedia based on selected type
  const filteredMultimedia = useMemo(() => {
    if (filterType === 'all') return multimedia;
    return multimedia.filter(item => item.tipo === filterType);
  }, [multimedia, filterType]);

  // Count by type for filter badges
  const countByType = useMemo(() => {
    const counts: Record<string, number> = { all: multimedia.length };
    multimedia.forEach(item => {
      counts[item.tipo] = (counts[item.tipo] || 0) + 1;
    });
    return counts;
  }, [multimedia]);

  const getIcon = (tipo: MultimediaTipo, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClasses = {
      sm: 'w-3.5 h-3.5',
      md: 'w-4 h-4 md:w-5 md:h-5',
      lg: 'w-6 h-6'
    };
    const className = sizeClasses[size];
    
    switch (tipo) {
      case 'imagen':
        // eslint-disable-next-line jsx-a11y/alt-text
        return <Image className={className} aria-hidden="true" />;
      case 'audio':
        return <Music className={className} />;
      case 'video':
        return <Video className={className} />;
      case 'documento':
      default:
        return <FileText className={className} />;
    }
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  const handlePreview = (item: Multimedia) => {
    if (item.tipo === 'imagen' || item.tipo === 'video') {
      setPreviewUrl(item.archivo_url);
      setPreviewType(item.tipo);
    }
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewType(null);
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !canUpload) return;
    
    setUploadError(null);
    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        // Validate file type
        if (!ALLOWED_MULTIMEDIA_TYPES.includes(file.type)) {
          setUploadError(`Tipo no permitido: ${file.name}`);
          continue;
        }
        // Validate file size
        if (file.size > MAX_MULTIMEDIA_SIZE) {
          setUploadError(`Archivo muy grande: ${file.name} (máx 50MB)`);
          continue;
        }

        const result = await uploadContactMultimedia(contactId!, empresaId!, file);
        if (!result.success) {
          setUploadError(result.error || 'Error al subir archivo');
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, [canUpload, contactId, empresaId, uploadContactMultimedia]);

  // Handle drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (canUpload) setIsDragging(true);
  }, [canUpload]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (canUpload) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [canUpload, handleFileSelect]);

  // Handle delete
  const handleDelete = useCallback(async (item: Multimedia) => {
    if (!canUpload || deletingId) return;
    
    const confirmed = window.confirm(`¿Eliminar "${item.nombre_archivo || 'archivo'}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    try {
      await deleteContactMultimedia(item.id, item.url_carpeta || '');
    } finally {
      setDeletingId(null);
    }
  }, [canUpload, deletingId, deleteContactMultimedia]);

  // Upload zone component
  const UploadZone = () => (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
        ${isDragging 
          ? 'border-primary-500 bg-primary-500/10' 
          : 'border-white/10 hover:border-white/20 hover:bg-white/5'
        }
        ${isUploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_MULTIMEDIA_TYPES.join(',')}
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />
      {isUploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          <span className="text-sm text-zinc-400">Subiendo...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 bg-zinc-800/50 rounded-full">
            <Upload className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <span className="text-sm text-zinc-300">Arrastra archivos aquí</span>
            <span className="text-sm text-zinc-500"> o haz clic para seleccionar</span>
          </div>
          <span className="text-xs text-zinc-600">Imágenes, videos, audio, documentos (máx 50MB)</span>
        </div>
      )}
    </div>
  );

  // Empty state with upload
  if (multimedia.length === 0) {
    return (
      <div className="space-y-4">
        {canUpload && <UploadZone />}
        {uploadError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
          <div className="p-4 bg-zinc-800/30 rounded-full mb-4">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image className="w-8 h-8 md:w-10 md:h-10 opacity-40" aria-hidden="true" />
          </div>
          <span className="text-sm md:text-base font-medium text-zinc-400">No hay archivos multimedia</span>
          <span className="text-xs text-zinc-600 mt-1">
            {canUpload ? 'Sube archivos arrastrándolos o haciendo clic arriba' : 'Los archivos del contacto aparecerán aquí'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Observation Mode Banner */}
      {isObservationMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-cyan-400 font-medium">Empresa Externa</p>
            <p className="text-[10px] text-cyan-400/70">Los archivos se guardarán en esta empresa.</p>
          </div>
        </div>
      )}

      {/* Upload Zone (collapsible when has content) */}
      {canUpload && (
        <div className="mb-3">
          <UploadZone />
        </div>
      )}

      {/* Error Message */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-auto hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header: View Toggle + Filter */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'list' 
                ? 'bg-primary-500/20 text-primary-400' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Vista de lista"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'grid' 
                ? 'bg-primary-500/20 text-primary-400' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Vista de iconos"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <button
            onClick={() => setFilterType('all')}
            className={`px-2 py-1 text-[10px] md:text-xs rounded-md transition-all ${
              filterType === 'all'
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:border-white/10'
            }`}
          >
            Todos ({countByType.all})
          </button>
          {(['imagen', 'video', 'audio', 'documento'] as MultimediaTipo[]).map(tipo => (
            countByType[tipo] > 0 && (
              <button
                key={tipo}
                onClick={() => setFilterType(tipo)}
                className={`px-2 py-1 text-[10px] md:text-xs rounded-md transition-all flex items-center gap-1 ${
                  filterType === tipo
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:border-white/10'
                }`}
              >
                {getIcon(tipo, 'sm')}
                <span className="hidden sm:inline">{MULTIMEDIA_TIPO_LABELS[tipo]}</span>
                <span>({countByType[tipo]})</span>
              </button>
            )
          ))}
        </div>
      </div>

      {/* Content */}
      {filteredMultimedia.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          No hay archivos de tipo &quot;{MULTIMEDIA_TIPO_LABELS[filterType as MultimediaTipo]}&quot;
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="space-y-2">
          {filteredMultimedia.map((item) => (
            <div 
              key={item.id}
              className="group relative bg-zinc-900/50 border border-white/5 rounded-lg p-2.5 md:p-3 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 md:gap-3">
                {/* Thumbnail or Icon */}
                {item.tipo === 'imagen' ? (
                  <div 
                    className="w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary-500/50 transition-all"
                    onClick={() => handlePreview(item)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={item.archivo_url} 
                      alt={item.nombre_archivo || 'Imagen'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : item.tipo === 'video' ? (
                  <div 
                    className="w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary-500/50 transition-all relative flex items-center justify-center"
                    onClick={() => handlePreview(item)}
                  >
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white" />
                    </div>
                    <Video className="w-6 h-6 text-zinc-600" />
                  </div>
                ) : (
                  <div className="p-2.5 md:p-3 bg-zinc-800 rounded-lg text-zinc-400 shrink-0">
                    {getIcon(item.tipo)}
                  </div>
                )}
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs md:text-sm font-medium text-zinc-200 truncate" title={item.nombre_archivo || 'Sin nombre'}>
                    {item.nombre_archivo || 'Archivo sin nombre'}
                  </h4>
                  <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 text-[10px] md:text-xs text-zinc-500">
                    <span className="capitalize">{MULTIMEDIA_TIPO_LABELS[item.tipo]}</span>
                    {item.tamaño && <span>• {formatSize(item.tamaño)}</span>}
                    {item.seccion && <span>• {item.seccion}</span>}
                  </div>
                  <span className="text-[9px] md:text-[10px] text-zinc-600 mt-0.5 block">
                    {new Date(item.created_at).toLocaleDateString('es-ES', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    })}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  {(item.tipo === 'imagen' || item.tipo === 'video') && (
                    <button
                      onClick={() => handlePreview(item)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                      title="Vista previa"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <a 
                    href={item.archivo_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                    title="Abrir en nueva pestaña"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a 
                    href={item.archivo_url} 
                    download={item.nombre_archivo || 'archivo'}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                    title="Descargar"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {canUpload && (
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-colors disabled:opacity-50"
                      title="Eliminar"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
          {filteredMultimedia.map((item) => (
            <div 
              key={item.id}
              className="group relative bg-zinc-900/50 border border-white/5 rounded-lg overflow-hidden hover:border-white/10 transition-all hover:shadow-lg hover:shadow-black/20"
            >
              {/* Thumbnail Area */}
              <div 
                className={`aspect-square relative cursor-pointer ${
                  item.tipo === 'imagen' ? '' : 'flex items-center justify-center bg-zinc-800/50'
                }`}
                onClick={() => handlePreview(item)}
              >
                {item.tipo === 'imagen' ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img 
                    src={item.archivo_url} 
                    alt={item.nombre_archivo || 'Imagen'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : item.tipo === 'video' ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <div className="p-3 bg-white/10 rounded-full">
                      <Play className="w-6 h-6 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-800/30 rounded-full">
                    {getIcon(item.tipo, 'lg')}
                  </div>
                )}

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {(item.tipo === 'imagen' || item.tipo === 'video') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                      className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
                      title="Vista previa"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <a 
                    href={item.archivo_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
                    title="Abrir"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <a 
                    href={item.archivo_url} 
                    download={item.nombre_archivo || 'archivo'}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
                    title="Descargar"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  {canUpload && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                      disabled={deletingId === item.id}
                      className="p-2 bg-red-500/30 hover:bg-red-500/50 text-white rounded-full transition-colors disabled:opacity-50"
                      title="Eliminar"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* Type badge */}
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] text-white/80 flex items-center gap-1">
                  {getIcon(item.tipo, 'sm')}
                </div>
              </div>

              {/* Info footer */}
              <div className="p-2">
                <h4 className="text-[10px] md:text-xs font-medium text-zinc-300 truncate" title={item.nombre_archivo || 'Sin nombre'}>
                  {item.nombre_archivo || 'Sin nombre'}
                </h4>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] text-zinc-500">
                    {formatSize(item.tamaño)}
                  </span>
                  <span className="text-[9px] text-zinc-600">
                    {new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal - Rendered via Portal to escape parent overflow */}
      {previewUrl && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
          onClick={closePreview}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              closePreview();
            }}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50"
          >
            <X className="w-6 h-6" />
          </button>

          <div 
            className="relative max-w-full max-h-full flex items-center justify-center animate-zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            {previewType === 'imagen' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={previewUrl} 
                alt="Vista previa" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <video 
                src={previewUrl} 
                controls 
                autoPlay 
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
