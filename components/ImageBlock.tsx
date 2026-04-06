'use client';


import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Download, 
  X, 
  Loader2, 
  Maximize2,
  ZoomIn, 
  ZoomOut, 
  RefreshCcw,
  ExternalLink,
  Move
} from 'lucide-react';
import { BlockAction } from '../types/chat';

interface ImageBlockProps {
  url: string;
  title?: string;
  description?: string;
  actions?: BlockAction[];
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

export const ImageBlock: React.FC<ImageBlockProps> = ({ url, title, description, actions, onInteract, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Lightbox State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset state on open
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setShowControls(true);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Handle Auto-Hide Controls
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Keyboard Navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimeout();
      
      switch (e.key) {
        case 'Escape':
          setIsOpen(false);
          break;
        case '+':
        case '=':
          e.preventDefault();
          setScale(s => Math.min(8, s + 0.5));
          break;
        case '-':
        case '_':
          e.preventDefault();
          setScale(s => {
             const newScale = Math.max(1, s - 0.5);
             if (newScale === 1) setPosition({x:0, y:0});
             return newScale;
          });
          break;
        case 'ArrowLeft':
           if (scale > 1) setPosition(p => ({ ...p, x: p.x + 50 }));
           break;
        case 'ArrowRight':
           if (scale > 1) setPosition(p => ({ ...p, x: p.x - 50 }));
           break;
        case 'ArrowUp':
           if (scale > 1) setPosition(p => ({ ...p, y: p.y + 50 }));
           break;
        case 'ArrowDown':
           if (scale > 1) setPosition(p => ({ ...p, y: p.y - 50 }));
           break;
        case '0':
           setScale(1);
           setPosition({x:0, y:0});
           break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scale, resetControlsTimeout]);

  const handleDownload = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = title ? `${title.replace(/\s+/g, '_').toLowerCase()}.png` : `urpe_asset_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  // --- Zoom Logic ---

  const handleWheel = (e: React.WheelEvent) => {
    // Prevent default scroll behavior
    e.stopPropagation();
    resetControlsTimeout();
    
    // Smooth zoom based on delta
    const delta = e.deltaY * -0.002;
    const newScale = Math.min(Math.max(1, scale + delta), 8); // Max zoom 8x
    
    setScale(newScale);
    
    // Re-center if zoomed out completely
    if (newScale <= 1.05) {
        setPosition({ x: 0, y: 0 });
        setScale(1);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1.5) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(3); // Instant Zoom to 3x
      // Ideally center on click position, keeping simple for now
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    resetControlsTimeout();
    if (isDragging && dragStartRef.current) {
      e.preventDefault();
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  if (hasError) {
    return (
      <div className="w-full h-64 bg-zinc-900/30 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-3 animate-in fade-in">
         <div className="p-3 bg-zinc-900 rounded-full border border-zinc-800">
            <X className="w-5 h-5 text-zinc-600" />
         </div>
         <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Image Error</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full group/container">
      
      {/* 1. Main Image Container (Preview) */}
      <div 
        className="relative w-full rounded-2xl overflow-hidden bg-zinc-900/50 cursor-zoom-in transition-all duration-300 ring-1 ring-white/5 hover:ring-white/10 shadow-lg hover:shadow-2xl"
        onClick={() => setIsOpen(true)}
      >
         {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
              <Loader2 className="w-8 h-8 text-zinc-700 animate-spin" />
            </div>
         )}

         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img 
            src={url} 
            alt={title || "Generated Asset"}
            onError={() => { setHasError(true); setIsLoading(false); }}
            onLoad={() => setIsLoading(false)}
            className={`w-full h-auto object-contain transition-all duration-700 ${
              isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
         />

         <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/container:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
             <div className="bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/20 transform scale-90 group-hover/container:scale-100 transition-transform">
                <Maximize2 className="w-5 h-5 text-white" />
             </div>
         </div>
      </div>

      {/* 2. Footer: Meta & Actions */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 px-1">
         <div className="flex flex-col gap-1 min-w-0 flex-1">
            {title && (
              <h3 className="text-zinc-200 font-bold text-sm tracking-tight leading-snug truncate" title={title}>
                {title}
              </h3>
            )}
            {description && (
              <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2">
                {description}
              </p>
            )}
         </div>

         <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button 
               onClick={handleDownload}
               className="p-2 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors"
               title="Download Original"
            >
               {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>

            {actions && actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { 
                      e.stopPropagation(); 
                      if (disabled) return;
                      if (onInteract) onInteract({ type: 'BLOCK_ACTION', actionId: action.id, label: action.label, payload: action.payload });
                  }}
                  disabled={disabled}
                  className={`px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                    disabled 
                      ? 'opacity-50 cursor-not-allowed grayscale text-zinc-500' 
                      : 'hover:bg-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                >
                  {action.label}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </button>
            ))}
         </div>
      </div>

      {/* 3. Immersive Lightbox - Fixed Portal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/98 backdrop-blur-3xl animate-in fade-in duration-300 flex flex-col items-center justify-center"
          onClick={() => setIsOpen(false)}
          onWheel={handleWheel}
        >
          {/* Subtle Grid Background for Technical Feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50"></div>

          {/* Lightbox Header - Floating Top */}
          <div className={`fixed top-0 inset-x-0 p-6 flex items-center justify-between z-50 pointer-events-none transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
             <div className="pointer-events-auto flex flex-col gap-0.5">
                 {title && <span className="text-sm font-semibold text-white tracking-tight drop-shadow-md">{title}</span>}
                 <span className="text-[10px] text-zinc-400 font-mono uppercase flex items-center gap-2">
                    {scale > 1 ? (
                        <>
                           <Move className="w-3 h-3" /> Drag to Pan
                        </>
                    ) : (
                        <>
                           <Maximize2 className="w-3 h-3" /> Double Click to Zoom
                        </>
                    )}
                 </span>
             </div>
             
             <button 
               onClick={() => setIsOpen(false)}
               className="pointer-events-auto p-2.5 bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 rounded-full text-zinc-400 hover:text-white transition-all backdrop-blur-md group"
             >
               <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
             </button>
          </div>

          {/* Canvas - The critical part for proper zooming */}
          <div 
            className={`w-full h-full flex items-center justify-center overflow-hidden relative ${scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            {/* 
                We use transform directly on the img style. 
                Using w-auto h-auto with max-w/max-h allows it to be responsive initially,
                but transform scale blows it up beyond the container bounds which is what we want.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={url}
              alt={title}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)', // Smooth zoom, instant drag
                maxWidth: '92vw',
                maxHeight: '92vh',
                objectFit: 'contain'
              }}
              className="select-none shadow-2xl origin-center will-change-transform"
            />
          </div>

          {/* Controls - Floating Bottom Bar */}
          <div className={`fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none transition-all duration-500 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
             <div className="pointer-events-auto flex items-center gap-2 p-1.5 bg-zinc-950/90 border border-zinc-800 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                <button 
                   onClick={(e) => { e.stopPropagation(); setScale(Math.max(1, scale - 0.5)); if (scale <= 1.5) setPosition({x:0, y:0}); }} 
                   className="p-3 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                   <ZoomOut className="w-5 h-5" />
                </button>
                
                <span className="text-xs font-mono text-zinc-300 min-w-[3.5rem] text-center select-none font-bold border-x border-white/5 mx-1">
                  {(scale * 100).toFixed(0)}%
                </span>

                <button 
                   onClick={(e) => { e.stopPropagation(); setScale(Math.min(8, scale + 0.5)); }} 
                   className="p-3 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                   <ZoomIn className="w-5 h-5" />
                </button>
                
                <div className="w-px h-5 bg-white/10 mx-1"></div>
                
                <button 
                   onClick={(e) => { e.stopPropagation(); setScale(1); setPosition({x:0,y:0}); }} 
                   className="p-3 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors group" 
                   title="Reset View (0)"
                >
                   <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                </button>
                
                <button 
                   onClick={handleDownload} 
                   className="p-3 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors" 
                   title="Download"
                >
                   <Download className="w-4 h-4" />
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

