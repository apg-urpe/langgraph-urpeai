'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useArtifactStore, selectPanel, selectActiveArtifact, selectVersions } from '../store/artifactStore';
import { useAuthStore } from '../store/authStore';
import { 
  X, 
  Code2, 
  Eye, 
  Copy, 
  Check, 
  Download, 
  RefreshCw,
  Pencil,
  Save,
  Undo2,
  ExternalLink,
  Smartphone,
  Monitor,
  Tablet,
  History,
  ChevronLeft,
  ChevronRight,
  Star,
  Share2,
  Pin,
  Loader2,
  BookMarked
} from 'lucide-react';
import { ARTIFACT_TYPE_LABELS, ARTIFACT_TYPE_COLORS, formatArtifactSize } from '../types/artifact';
import { parseAndRenderContent } from '../lib/artifact-renderer';

// Helper functions moved outside component to avoid SWC parser issues with HTML in template literals
const getEditableSrcDoc = (content: string): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
body { margin: 0; padding: 16px; background-color: white; font-family: system-ui, sans-serif; min-height: 100vh; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
[contenteditable]:focus { outline: 2px solid #06b6d4; outline-offset: 2px; }
[contenteditable]:hover { outline: 1px dashed #94a3b8; outline-offset: 1px; }
</style>
</head>
<body contenteditable="true">${content}</body>
</html>`;
};

// Smart content renderer now imported from lib/artifact-renderer.ts

const getSrcDoc = (content: string): string => {
  // If content is already a complete HTML document, return it directly
  const trimmed = content.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return content;
  }
  
  // Use the intelligent content parser/renderer
  // This handles: JSON data, research markdown, mixed content
  try {
    return parseAndRenderContent(content);
  } catch (e) {
    // Fallback: wrap as-is with basic styling
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
body { margin: 0; padding: 16px; background: #0c0c0e; color: #e4e4e7; font-family: system-ui, sans-serif; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
</style>
</head>
<body><pre style="white-space: pre-wrap; word-break: break-word;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body>
</html>`;
  }
};

export const ArtifactPanel: React.FC = () => {
  // Store state
  const panel = useArtifactStore(selectPanel);
  const activeArtifact = useArtifactStore(selectActiveArtifact);
  const versions = useArtifactStore(selectVersions);
  const user = useAuthStore(state => state.user);
  
  // Store actions
  const closeArtifact = useArtifactStore(state => state.closeArtifact);
  const setMode = useArtifactStore(state => state.setMode);
  const setPreviewSize = useArtifactStore(state => state.setPreviewSize);
  const updateEditContent = useArtifactStore(state => state.updateEditContent);
  const saveCurrentArtifact = useArtifactStore(state => state.saveCurrentArtifact);
  const setCurrentVersionIndex = useArtifactStore(state => state.setCurrentVersionIndex);
  const restoreVersion = useArtifactStore(state => state.restoreVersion);
  const toggleStar = useArtifactStore(state => state.toggleStar);
  const makePublic = useArtifactStore(state => state.makePublic);
  const updateArtifact = useArtifactStore(state => state.updateArtifact);
  const isSaving = useArtifactStore(state => state.isSaving);
  const starredIds = useArtifactStore(state => state.starredIds);
  
  // Local state
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);
  const [showVersions, setShowVersions] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Derived state
  const { isOpen, mode, previewSize, status, hasUnsavedChanges, editContent, currentVersionIndex } = panel;
  const artifactContent = activeArtifact?.content || '';
  const isStarred = activeArtifact ? starredIds.has(activeArtifact.id) : false;
  const isPersisted = activeArtifact && !activeArtifact.id.startsWith('temp-');

  // Handle Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeArtifact();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeArtifact]);

  // Don't render if closed
  if (!isOpen || !activeArtifact) return null;

  const handleCopy = () => {
    const contentToCopy = mode === 'edit' ? editContent : artifactContent;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  const handleDownload = () => {
    const contentToDownload = mode === 'edit' ? editContent : artifactContent;
    const blob = new Blob([contentToDownload], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urpe_artifact.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenInNewTab = () => {
    const contentToOpen = mode === 'edit' ? editContent : artifactContent;
    const blob = new Blob([getSrcDoc(contentToOpen)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleSaveChanges = async () => {
    if (user) {
      await saveCurrentArtifact(user.id);
      setKey(prev => prev + 1); // Refresh preview
    }
  };

  const handleDiscardChanges = () => {
    updateEditContent(artifactContent);
  };

  const handleEditChange = (value: string) => {
    updateEditContent(value);
  };

  const handleEditMode = () => {
    updateEditContent(artifactContent);
    setMode('edit');
  };

  const handleToggleStar = async () => {
    if (user && activeArtifact && isPersisted) {
      await toggleStar(user.id, activeArtifact.id);
    }
  };

  const handleShare = async () => {
    if (activeArtifact && isPersisted) {
      const slug = await makePublic(activeArtifact.id);
      if (slug) {
        const url = `${window.location.origin}/artifacts/${slug}`;
        navigator.clipboard.writeText(url);
        setShowShareMenu(false);
      }
    }
  };


  // Sync content from editable iframe
  const syncFromIframe = () => {
    if (iframeRef.current?.contentDocument?.body) {
      const newContent = iframeRef.current.contentDocument.body.innerHTML;
      if (newContent !== editContent) {
        updateEditContent(newContent);
      }
    }
  };

  // Get preview size class
  const getPreviewSizeClass = () => {
    switch (previewSize) {
      case 'mobile': return 'max-w-[375px]';
      case 'tablet': return 'max-w-[768px]';
      default: return 'w-full';
    }
  };


  const previewContent = mode === 'edit' ? editContent : artifactContent;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      {/* Backdrop click to close */}
      <div 
        className="absolute inset-0" 
        onClick={closeArtifact}
      />
      
      {/* Modal Container - Full width to support wide content like Kanban */}
      <div className="relative w-full md:w-[95vw] md:max-w-[1800px] h-full md:h-[90vh] flex flex-col overflow-hidden bg-[#0a0a0c] md:rounded-2xl border border-white/10 shadow-2xl animate-slide-in-bottom md:animate-pop-in">
      
        {/* --- CLOSE BUTTON (FLOATING, ALWAYS VISIBLE) --- */}
        <button 
          onClick={closeArtifact}
          className="absolute top-3 right-3 z-50 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 text-zinc-400 hover:text-red-400 transition-all shadow-lg backdrop-blur-sm group"
          title="Cerrar Panel (Esc)"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* --- HEADER TOOLBAR --- */}
      <div className="h-14 shrink-0 border-b border-white/5 bg-[#0f0f11] flex items-center justify-between px-4">
         
         <div className="flex items-center gap-2">
             {/* Mode Switcher */}
             <div className="flex bg-black/60 p-0.5 rounded-lg border border-white/5">
                <button 
                  onClick={() => setMode('preview')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${mode === 'preview' ? 'bg-primary-500/20 text-primary-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Eye className="w-3 h-3" /> Vista
                </button>
                <button 
                  onClick={() => setMode('code')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${mode === 'code' ? 'bg-primary-500/20 text-primary-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Code2 className="w-3 h-3" /> Código
                </button>
                <button 
                  onClick={handleEditMode} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${mode === 'edit' ? 'bg-amber-500/20 text-amber-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
             </div>
         </div>

         <div className="flex items-center gap-1">
             {/* Status Badge */}
             <span className={`text-[10px] font-mono mr-3 px-2 py-0.5 rounded-full border transition-colors ${
               hasUnsavedChanges 
                 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' 
                 : status === 'building' 
                   ? 'text-primary-400 border-primary-500/30 bg-primary-500/10 animate-pulse' 
                   : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
             }`}>
                {isSaving ? 'GUARDANDO...' : hasUnsavedChanges ? 'SIN GUARDAR' : status === 'building' ? 'COMPILANDO...' : 'LISTO'}
             </span>
             
             {/* Save/Discard for Edit Mode */}
             {mode === 'edit' && hasUnsavedChanges && (
               <>
                 <button 
                   onClick={handleDiscardChanges} 
                   className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" 
                   title="Descartar cambios"
                 >
                   <Undo2 className="w-4 h-4" />
                 </button>
                 <button 
                   onClick={handleSaveChanges} 
                   className="p-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" 
                   title="Guardar cambios"
                 >
                   <Save className="w-4 h-4" />
                 </button>
                 <div className="w-px h-4 bg-white/10 mx-1"></div>
               </>
             )}
             
             {mode === 'preview' && (
                <button onClick={handleRefresh} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Recargar vista">
                   <RefreshCw className="w-4 h-4" />
                </button>
             )}
             
             <button onClick={handleCopy} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Copiar código">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
             </button>

             <button onClick={handleDownload} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Descargar HTML">
                <Download className="w-4 h-4" />
             </button>

             <button onClick={handleOpenInNewTab} className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Abrir en pestaña nueva">
                <ExternalLink className="w-4 h-4" />
             </button>
         </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="flex-1 relative bg-[#0a0a0c] overflow-hidden">
         
         {/* PREVIEW MODE */}
         <div className={`absolute inset-0 transition-all duration-300 ${mode === 'preview' ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-95 pointer-events-none'}`}>
             <iframe
                key={key}
                srcDoc={getSrcDoc(previewContent)}
                title="Artifact Preview"
                className="w-full h-full border-none bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms"
             />
         </div>

         {/* CODE MODE (Read Only) */}
         <div className={`absolute inset-0 overflow-auto transition-all duration-300 ${mode === 'code' ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-95 pointer-events-none'}`}>
             <div className="min-h-full">
                <pre className="p-4 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-all">
                  <code>{artifactContent}</code>
                </pre>
             </div>
         </div>

         {/* EDIT MODE - Edición visual amigable */}
         <div className={`absolute inset-0 flex flex-col transition-all duration-300 ${mode === 'edit' ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-95 pointer-events-none'}`}>
             
             {/* Toolbar de edición */}
             <div className="h-10 shrink-0 bg-zinc-900/80 border-b border-white/5 flex items-center justify-between px-3">
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                   <Pencil className="w-3 h-3" />
                   <span className="font-medium">Modo edición visual</span>
                   <span className="text-zinc-600">• Haz clic para editar el contenido directamente</span>
                </div>
                <div className="flex items-center gap-1">
                   <button
                     onClick={() => setPreviewSize('mobile')}
                     className={`p-1.5 rounded transition-colors ${previewSize === 'mobile' ? 'bg-primary-500/20 text-primary-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                     title="Vista móvil"
                   >
                     <Smartphone className="w-3.5 h-3.5" />
                   </button>
                   <button
                     onClick={() => setPreviewSize('tablet')}
                     className={`p-1.5 rounded transition-colors ${previewSize === 'tablet' ? 'bg-primary-500/20 text-primary-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                     title="Vista tablet"
                   >
                     <Tablet className="w-3.5 h-3.5" />
                   </button>
                   <button
                     onClick={() => setPreviewSize('desktop')}
                     className={`p-1.5 rounded transition-colors ${previewSize === 'desktop' ? 'bg-primary-500/20 text-primary-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                     title="Vista desktop"
                   >
                     <Monitor className="w-3.5 h-3.5" />
                   </button>
                </div>
             </div>

             {/* Editor visual - iframe editable */}
             <div className="flex-1 bg-zinc-800 flex items-start justify-center overflow-auto p-4">
                <div className={`${getPreviewSizeClass()} h-full bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300`}>
                   <iframe
                     ref={iframeRef}
                     srcDoc={getEditableSrcDoc(editContent)}
                     title="Visual Editor"
                     className="w-full h-full border-none"
                     sandbox="allow-scripts allow-same-origin"
                     onLoad={() => {
                       // Setup mutation observer para detectar cambios
                       if (iframeRef.current?.contentDocument?.body) {
                         const observer = new MutationObserver(syncFromIframe);
                         observer.observe(iframeRef.current.contentDocument.body, {
                           childList: true,
                           subtree: true,
                           characterData: true,
                           attributes: true
                         });
                         // Also listen for input events
                         iframeRef.current.contentDocument.body.addEventListener('input', syncFromIframe);
                       }
                     }}
                   />
                </div>
             </div>

             {/* Tip bar */}
             <div className="h-8 shrink-0 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-center gap-2 text-[10px] text-amber-400/80">
                <span>💡 Tip: Selecciona texto y edítalo directamente. Los cambios se guardan al presionar &quot;Guardar&quot;.</span>
             </div>
         </div>{/* End Edit Mode */}

      </div>{/* End Content Area */}
      
      </div>{/* End Modal Container */}
    </div>
  );
};
