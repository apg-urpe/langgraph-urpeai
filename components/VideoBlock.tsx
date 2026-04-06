'use client';


import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Loader2, Download, Film } from 'lucide-react';
import { BlockAction } from '../types/chat';
import { BlockActions } from './BlockActions';

interface VideoBlockProps {
  url: string;
  title?: string;
  description?: string;
  poster?: string;
  autoPlay?: boolean;
  actions?: BlockAction[];
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

export const VideoBlock: React.FC<VideoBlockProps> = ({ 
  url, 
  title, 
  description, 
  poster,
  autoPlay = false,
  actions, 
  onInteract,
  disabled = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (autoPlay && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay failed (likely due to browser policy), fallback to paused
        setIsPlaying(false);
        setIsMuted(true);
      });
    }
  }, [autoPlay]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = title ? `${title.replace(/\s+/g, '_').toLowerCase()}.mp4` : `video_${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  if (hasError) {
    return (
      <div className="w-full h-64 bg-zinc-900/30 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-3 animate-in fade-in">
         <div className="p-3 bg-zinc-900 rounded-full border border-zinc-800">
            <Film className="w-5 h-5 text-zinc-600" />
         </div>
         <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Video Unavailable</span>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col gap-0 w-full group/container bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:border-zinc-700"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      
      {/* 1. Header (If title exists) */}
      {(title) && (
        <div className="px-4 py-3 bg-zinc-900/50 border-b border-zinc-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                <span className="text-xs font-bold text-zinc-300 tracking-wide truncate">{title}</span>
            </div>
            {description && (
                <span className="text-[10px] text-zinc-500 hidden sm:inline-block truncate max-w-[200px]">{description}</span>
            )}
        </div>
      )}

      {/* 2. Video Player Container */}
      <div 
        className="relative w-full aspect-video bg-black group cursor-pointer"
        onClick={togglePlay}
      >
         {/* Loader */}
         {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-zinc-900/20 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
         )}

         <video 
            ref={videoRef}
            src={url} 
            poster={poster}
            className="w-full h-full object-contain"
            onLoadedData={() => setIsLoading(false)}
            onError={() => { setHasError(true); setIsLoading(false); }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
            loop
         />

         {/* Cinematic Overlay (When paused or hovered) */}
         <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 transition-opacity duration-300 flex flex-col justify-end p-4 ${isPlaying && !isHovered ? 'opacity-0' : 'opacity-100'}`}>
             
             {/* Center Play Button (Only when paused) */}
             {!isPlaying && !isLoading && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                        <Play className="w-6 h-6 text-white ml-1 fill-white" />
                    </div>
                </div>
             )}

             {/* Bottom Controls Bar */}
             <div className="flex items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
                
                <div className="flex items-center gap-2">
                    <button onClick={togglePlay} className="p-2 text-white/80 hover:text-white transition-colors">
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>
                    
                    <button onClick={toggleMute} className="p-2 text-white/80 hover:text-white transition-colors group/vol">
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                </div>

                <div className="flex items-center gap-2">
                     <button onClick={handleDownload} className="p-2 text-white/60 hover:text-white transition-colors" title="Download">
                        <Download className="w-4 h-4" />
                    </button>
                    <button onClick={handleFullscreen} className="p-2 text-white/60 hover:text-white transition-colors" title="Fullscreen">
                        <Maximize2 className="w-4 h-4" />
                    </button>
                </div>

             </div>
         </div>
      </div>

      {/* 3. Footer Actions (If actions exist) */}
      {actions && actions.length > 0 && (
         <div className="px-4 py-3 bg-zinc-900/30 border-t border-zinc-800">
            <BlockActions actions={actions} onInteract={onInteract} disabled={disabled} />
         </div>
      )}
    </div>
  );
};

