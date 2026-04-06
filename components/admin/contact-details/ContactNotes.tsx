import React, { useState, useRef, useCallback } from 'react';
import { StickyNote, User, Clock, Plus, Send, Loader2, Pencil, Trash2, X, Check, Maximize2, Pin, Tag, Paperclip, FileText, Image as ImageIcon, CheckCircle2, Bot, EyeOff, FileJson, Type, Code2, AlertTriangle } from 'lucide-react';
import { NoteContentRenderer, detectContentType, safeParseJson } from './NoteContentRenderer';
import { PropertyEditor } from './PropertyEditor';
import { ContactNote } from '../../../types/contact';
import { useContactStore, selectIsObservationMode } from '../../../store/contactStore';
import { logger } from '@/lib/logger';
import { NoteDetailModal } from './NoteDetailModal';
import { uploadNotaArchivo, validateFile, formatFileSize, ALLOWED_RECEIPT_TYPES, MAX_FILE_SIZE } from '../../../lib/storage';
import { useDraftStorage } from '../../../hooks/useDraftStorage';

interface ContactNotesProps {
  contactId: number;
  notes: ContactNote[];
  empresaId?: number;
}

export const ContactNotes: React.FC<ContactNotesProps> = ({ contactId, notes: rawNotes, empresaId }) => {
  // Defensive: ensure notes is always an array
  const notes = Array.isArray(rawNotes) ? rawNotes : [];
  // Create State - with draft persistence
  const [newNote, setNewNote, clearNoteDraft, hasNoteDraft] = useDraftStorage(
    'contact_note',
    `note_content_${contactId}`,
    ''
  );
  const [newTitle, setNewTitle, clearTitleDraft] = useDraftStorage(
    'contact_note',
    `note_title_${contactId}`,
    ''
  );
  const [newTags, setNewTags, clearTagsDraft] = useDraftStorage(
    'contact_note',
    `note_tags_${contactId}`,
    ''
  );
  const [isNewPinned, setIsNewPinned] = useState(false);
  const [isVisibleIA, setIsVisibleIA] = useState(true); // Default: visible para IA
  
  // Content mode: 'markdown' for text/markdown, 'properties' for JSON key-value
  const [contentMode, setContentMode] = useState<'markdown' | 'properties'>('markdown');
  const [propertyData, setPropertyData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Detail Modal state
  const [selectedNote, setSelectedNote] = useState<ContactNote | null>(null);

  // Edit state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isEditPinned, setIsEditPinned] = useState(false);
  const [isEditVisibleIA, setIsEditVisibleIA] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Edit mode for JSON
  const [editContentMode, setEditContentMode] = useState<'markdown' | 'properties'>('markdown');
  const [editPropertyData, setEditPropertyData] = useState<Record<string, any>>({});
  
  // Delete state
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  const addContactNote = useContactStore(state => state.addContactNote);
  const updateContactNote = useContactStore(state => state.updateContactNote);
  const deleteContactNote = useContactStore(state => state.deleteContactNote);
  const isObservationMode = useContactStore(selectIsObservationMode);

  const formatAuthorName = (note: ContactNote) => {
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
        <Bot className="w-3 h-3" />
        Monica
      </span>
    );
  };

  // File handling functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadError(null);
    
    // Validate each file
    const validFiles: File[] = [];
    for (const file of files) {
      const validation = validateFile(file, ALLOWED_RECEIPT_TYPES, MAX_FILE_SIZE);
      if (!validation.valid) {
        setUploadError(validation.error || 'Archivo no válido');
        return;
      }
      validFiles.push(file);
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (selectedFiles.length === 0 || !empresaId) return [];

    setIsUploading(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of selectedFiles) {
        const result = await uploadNotaArchivo(file, empresaId, contactId);
        if (result.success && result.url) {
          uploadedUrls.push(result.url);
        } else {
          throw new Error(result.error || 'Error al subir archivo');
        }
      }
      return uploadedUrls;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    
    try {
      // Upload files first if any
      let archivosUrls: string[] = [];
      if (selectedFiles.length > 0) {
        if (!empresaId) {
          throw new Error('No se puede subir archivos sin empresa_id');
        }
        archivosUrls = await uploadFiles();
      }

      const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);
      logger.debug('[ContactNotes] Submitting note:', { contactId, noteLength: newNote.length, filesCount: archivosUrls.length });
      
      // Determine final content based on mode
      const finalContent = contentMode === 'properties' 
        ? JSON.stringify(propertyData, null, 2)
        : newNote;
      
      await addContactNote(contactId, finalContent, {
        titulo: newTitle.trim() || undefined,
        etiquetas: tagsArray.length > 0 ? tagsArray : undefined,
        es_fijado: isNewPinned,
        archivos_urls: archivosUrls.length > 0 ? archivosUrls : undefined,
        visible_ia: isVisibleIA
      });
      
      logger.info('[ContactNotes] ✅ Note submitted successfully');
      
      // Show success feedback
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      
      // Reset form and clear drafts
      clearNoteDraft();
      clearTitleDraft();
      clearTagsDraft();
      setIsNewPinned(false);
      setIsVisibleIA(true);
      setSelectedFiles([]);
      setContentMode('markdown');
      setPropertyData({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Error desconocido al guardar la nota';
      logger.error('[ContactNotes] Failed to add note:', error);
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (note: ContactNote) => {
    setEditingNoteId(note.id);
    setEditContent(note.descripcion || '');
    setEditTitle(note.titulo || '');
    setEditTags(note.etiquetas?.join(', ') || '');
    setIsEditPinned(note.es_fijado || false);
    setIsEditVisibleIA(note.visible_ia !== false); // Default true si es undefined/null
    
    // Detect if content is JSON and set edit mode accordingly
    const contentType = detectContentType(note.descripcion || '');
    if (contentType === 'json') {
      const parsed = safeParseJson(note.descripcion || '');
      if (parsed.success) {
        setEditContentMode('properties');
        setEditPropertyData(parsed.data);
      } else {
        setEditContentMode('markdown');
        setEditPropertyData({});
      }
    } else {
      setEditContentMode('markdown');
      setEditPropertyData({});
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent('');
    setEditTitle('');
    setEditTags('');
    setIsEditPinned(false);
    setIsEditVisibleIA(true);
    setEditContentMode('markdown');
    setEditPropertyData({});
  };

  const handleSaveEdit = async (noteId: number) => {
    // Validate content based on mode
    const finalEditContent = editContentMode === 'properties'
      ? JSON.stringify(editPropertyData, null, 2)
      : editContent;
    
    if (!finalEditContent.trim()) return;
    
    setIsUpdating(true);
    try {
      const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
      await updateContactNote(noteId, finalEditContent, {
        titulo: editTitle.trim() || undefined,
        etiquetas: tagsArray, // Pass empty array if needed to clear
        es_fijado: isEditPinned,
        visible_ia: isEditVisibleIA
      });
      setEditingNoteId(null);
    } catch (error) {
      logger.error('[ContactNotes] Failed to update note:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta nota?')) return;

    setDeletingNoteId(noteId);
    try {
      await deleteContactNote(noteId);
    } catch (error) {
      logger.error('[ContactNotes] Failed to delete note:', error);
      setDeletingNoteId(null);
    }
  };

  // Navigation Logic
  const getCurrentIndex = () => selectedNote ? notes.findIndex(n => n.id === selectedNote.id) : -1;
  const hasNext = selectedNote ? getCurrentIndex() < notes.length - 1 : false;
  const hasPrev = selectedNote ? getCurrentIndex() > 0 : false;

  const handleNext = () => {
    const idx = getCurrentIndex();
    if (idx !== -1 && idx < notes.length - 1) {
      setSelectedNote(notes[idx + 1]);
    }
  };

  const handlePrev = () => {
    const idx = getCurrentIndex();
    if (idx > 0) {
      setSelectedNote(notes[idx - 1]);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Observation Mode Banner */}
      {isObservationMode && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-cyan-400 font-medium">Empresa Externa</p>
            <p className="text-[10px] text-cyan-400/70">Las notas se guardarán en esta empresa.</p>
          </div>
        </div>
      )}
      {/* Add Note Form */}
      <div className="shrink-0 bg-zinc-900/50 border border-white/5 rounded-lg p-3 md:p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Nueva Nota</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              {/* Content Mode Toggle - Now in header */}
              <div className="flex items-center gap-0.5 p-0.5 bg-zinc-800/50 rounded-lg border border-zinc-700/50 mr-1">
                <button
                  type="button"
                  onClick={() => setContentMode('markdown')}
                  className={`
                    p-1 rounded-md transition-all
                    ${contentMode === 'markdown'
                      ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'}
                  `}
                  title="Modo Texto (Markdown)"
                >
                  <Type className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setContentMode('properties')}
                  className={`
                    p-1 rounded-md transition-all
                    ${contentMode === 'properties'
                      ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'}
                  `}
                  title="Modo Propiedades (JSON)"
                >
                  <Code2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsVisibleIA(!isVisibleIA)}
                className={`
                  inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors
                  ${isVisibleIA
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15'
                    : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800'}
                `}
                title={isVisibleIA ? 'Monica (WhatsApp) puede usar esta nota como contexto' : 'Nota privada: Monica (WhatsApp) NO verá esta nota'}
              >
                {isVisibleIA ? <Bot className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isVisibleIA ? 'IA: Visible' : 'IA: Privada'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNewPinned(!isNewPinned)}
                className={`p-1 rounded transition-colors ${isNewPinned ? 'text-primary-400 bg-primary-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={isNewPinned ? "Desanclar nota" : "Fijar nota al principio"}
              >
                <Pin className={`w-3.5 h-3.5 ${isNewPinned ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
          
          {/* Content Mode Toggle removed from here */}
          
          {/* Optional Title */}
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full bg-black/20 border border-white/5 rounded-md px-3 py-2 text-xs md:text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 transition-all"
            disabled={isSubmitting}
          />

          {/* Content Input - Markdown or Properties */}
          {contentMode === 'markdown' ? (
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Escribe una nota sobre este contacto... (soporta Markdown)"
              className="w-full bg-black/20 border border-white/5 rounded-md p-3 text-xs md:text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 transition-all resize-none h-20 md:h-24"
              disabled={isSubmitting}
            />
          ) : (
            <PropertyEditor
              initialData={propertyData}
              onChange={(data) => {
                setPropertyData(data);
                setNewNote(JSON.stringify(data, null, 2));
              }}
            />
          )}
          
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Etiquetas (separadas por coma)"
                className="w-full bg-black/20 border border-white/5 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 transition-all"
                disabled={isSubmitting}
              />
            </div>
            
            {/* File Upload Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf"
              className="hidden"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded transition-colors border border-white/5"
              title="Adjuntar archivos"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            
            <button
              type="submit"
              disabled={(contentMode === 'markdown' ? !newNote.trim() : Object.keys(propertyData).length === 0) || isSubmitting}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs font-medium transition-colors border border-primary-500/20 shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isUploading ? 'Subiendo...' : 'Guardando...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Guardar</span>
                </>
              )}
            </button>
          </div>
          
          {/* Selected Files Preview */}
          {selectedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedFiles.map((file, idx) => (
                <div 
                  key={idx}
                  className="flex items-center gap-2 px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-md text-xs"
                >
                  {file.type.startsWith('image/') ? (
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span className="text-zinc-300 max-w-[120px] truncate">{file.name}</span>
                  <span className="text-zinc-500">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Upload Error */}
          {uploadError && (
            <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <p className="text-xs text-amber-400">{uploadError}</p>
            </div>
          )}
          
          {/* Success Message */}
          {submitSuccess && (
            <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-emerald-400">Nota guardada correctamente</p>
            </div>
          )}
          
          {/* Error Message */}
          {submitError && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md">
              <p className="text-xs text-red-400">{submitError}</p>
            </div>
          )}
        </form>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto space-y-2 md:space-y-3 min-h-0">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 md:py-12 text-zinc-500">
            <StickyNote className="w-10 h-10 md:w-12 md:h-12 mb-2 md:mb-3 opacity-20" />
            <span className="text-xs md:text-sm">No hay notas registradas</span>
          </div>
        ) : (
          notes.map((note) => (
            <div 
              key={note.id}
              className={`
                perf-note-card
                bg-zinc-900/50 border rounded-lg p-3 md:p-4 transition-all group
                ${note.es_fijado ? 'border-primary-500/20 bg-primary-500/5' : 'border-white/5 hover:border-white/10'}
                ${deletingNoteId === note.id ? 'opacity-50 pointer-events-none' : ''}
              `}
            >
              {editingNoteId === note.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Título"
                      className="flex-1 bg-black/20 border border-white/10 rounded-md px-2 py-1.5 text-xs md:text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50"
                      autoFocus
                    />
                    
                    {/* Edit Content Mode Toggle - Now in header */}
                    <div className="flex items-center gap-0.5 p-0.5 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                      <button
                        type="button"
                        onClick={() => setEditContentMode('markdown')}
                        className={`
                          p-1 rounded-md transition-all
                          ${editContentMode === 'markdown'
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-300'}
                        `}
                        title="Texto"
                      >
                        <Type className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = safeParseJson(editContent);
                          if (parsed.success) {
                            setEditPropertyData(parsed.data);
                          }
                          setEditContentMode('properties');
                        }}
                        className={`
                          p-1 rounded-md transition-all
                          ${editContentMode === 'properties'
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-300'}
                        `}
                        title="Props"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsEditVisibleIA(!isEditVisibleIA)}
                      className={`p-1.5 rounded transition-colors ${isEditVisibleIA ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300 bg-white/5'}`}
                      title={isEditVisibleIA ? "Visible para IA" : "Oculto para IA"}
                    >
                      {isEditVisibleIA ? <Bot className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditPinned(!isEditPinned)}
                      className={`p-1.5 rounded transition-colors ${isEditPinned ? 'text-primary-400 bg-primary-500/10' : 'text-zinc-500 hover:text-zinc-300 bg-white/5'}`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${isEditPinned ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  
                  {/* Edit Content Mode Toggle removed from here */}
                  
                  {/* Edit Content - Markdown or Properties */}
                  {editContentMode === 'markdown' ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-md p-2 text-xs md:text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 resize-none h-24"
                    />
                  ) : (
                    <PropertyEditor
                      initialData={editPropertyData}
                      onChange={(data) => {
                        setEditPropertyData(data);
                        setEditContent(JSON.stringify(data, null, 2));
                      }}
                    />
                  )}
                  
                  <div className="relative">
                    <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="Etiquetas (separadas por coma)"
                      className="w-full bg-black/20 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-primary-500/50"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded transition-colors"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSaveEdit(note.id)}
                      disabled={(editContentMode === 'markdown' ? !editContent.trim() : Object.keys(editPropertyData).length === 0) || isUpdating}
                      className="p-1.5 text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded transition-colors"
                      title="Guardar cambios"
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div 
                    className="flex justify-between items-start gap-2 cursor-pointer"
                    onClick={() => setSelectedNote(note)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {note.es_fijado && (
                          <Pin className="w-3.5 h-3.5 text-primary-400 fill-current shrink-0" />
                        )}
                        {note.visible_ia === false && (
                          <span title="Oculto para IA">
                            <EyeOff className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          </span>
                        )}
                        {note.titulo && (
                          <h4 className="text-sm font-medium text-zinc-100 truncate pr-2">
                            {note.titulo}
                          </h4>
                        )}
                      </div>
                      
                      <NoteContentRenderer 
                        content={note.descripcion || ''} 
                        compact={true}
                        className="text-xs md:text-sm text-zinc-300"
                      />

                      {/* Tags Display */}
                      {Array.isArray(note.etiquetas) && note.etiquetas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {note.etiquetas.map((tag, idx) => (
                            <span 
                              key={idx}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div 
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                      onClick={(e) => e.stopPropagation()} 
                    >
                       <button
                        onClick={() => setSelectedNote(note)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded transition-colors"
                        title="Ver detalle"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(note)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded transition-colors"
                        title="Editar nota"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Eliminar nota"
                      >
                        {deletingNoteId === note.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-3 pt-2 md:pt-3 border-t border-white/5 gap-2">
                    <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs text-zinc-500">
                      <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
                      <span>
                        {new Date(note.created_at).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs text-zinc-500" title="Creado por">
                      <User className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
                      <span className="truncate font-medium">
                        {formatAuthorName(note)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Note Detail Modal */}
      {selectedNote && (
        <NoteDetailModal
          isOpen={true}
          onClose={() => setSelectedNote(null)}
          note={selectedNote}
          onNext={handleNext}
          onPrev={handlePrev}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onEdit={handleStartEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};
