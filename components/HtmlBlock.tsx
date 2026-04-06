'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Code2, Loader2, PanelRightOpen } from 'lucide-react';
import { sanitizeHtml } from '../lib/sanitize-html';
import { useArtifactStore, selectPanel } from '../store/artifactStore';
import { useChatStore } from '../store/chatStore';
import { detectArtifactType, ARTIFACT_TYPE_LABELS } from '../types/artifact';

interface HtmlBlockProps {
  content: string;
  sessionId?: string;
  messageId?: string;
}

export const HtmlBlock: React.FC<HtmlBlockProps> = ({ content, sessionId, messageId }) => {
  // Artifact store
  const panel = useArtifactStore(selectPanel);
  const openArtifact = useArtifactStore(state => state.openArtifact);
  const updateEditContent = useArtifactStore(state => state.updateEditContent);
  const setStatus = useArtifactStore(state => state.setStatus);
  
  // Chat store for session context
  const activeSessionId = useChatStore(state => state.activeSessionId);
  
  const [isBuilding, setIsBuilding] = useState(true);
  
  // Ref to detect content changes for streaming status
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentLength = useRef(0);
  
  const sanitizedContent = React.useMemo(() => sanitizeHtml(content), [content]);
  const artifactType = detectArtifactType(sanitizedContent);

  // Sync content to store if this is the active artifact
  // AND detect "building" status
  useEffect(() => {
    // Basic heuristics: if content grows, we are building
    const isGrowing = sanitizedContent.length > prevContentLength.current;
    
    if (isGrowing) {
        setIsBuilding(true);
        setStatus('building');
        
        // If the artifact panel is OPEN and showing this content, live update it
        if (panel.isOpen) {
            updateEditContent(sanitizedContent);
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        // Wait 1.5s of silence to declare "Ready"
        timeoutRef.current = setTimeout(() => {
            setIsBuilding(false);
            setStatus('ready');
             // Final update to ensure consistency
             if (panel.isOpen) updateEditContent(sanitizedContent);
        }, 1500);
    } else if (sanitizedContent.length > 0 && isBuilding) {
        // If we mount with existing content, we assume it's stable unless proved otherwise
         setIsBuilding(false);
    }
    
    prevContentLength.current = sanitizedContent.length;
    
    return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [sanitizedContent, panel.isOpen, updateEditContent, setStatus, isBuilding]);

  const handleOpen = () => {
      openArtifact(sanitizedContent, { 
        type: artifactType,
        sessionId: sessionId || activeSessionId,
        messageId 
      });
  };

  return (
    <div className="w-full my-4 flex flex-col items-center">
        
      {/* --- ARTIFACT TRIGGER CARD --- */}
      <div 
        onClick={handleOpen}
        className={`
            relative w-full max-w-2xl rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border group
            bg-black/40 border-white/10 hover:bg-zinc-900/80 hover:border-primary-500/30 hover:shadow-[0_0_20px_rgba(var(--primary-500),0.15)]
        `}
      >
         {/* Progress Bar */}
         {isBuilding && (
            <div className="absolute top-0 left-0 h-[2px] bg-primary-500/50 w-full animate-pulse z-20"></div>
         )}

         <div className="p-4 flex items-center gap-4">
            {/* Icon */}
            <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500 border
                ${isBuilding 
                    ? 'bg-zinc-800 text-zinc-400 border-zinc-700 animate-pulse' 
                    : 'bg-primary-500/10 text-primary-400 border-primary-500/20'
                }
            `}>
                {isBuilding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Code2 className="w-5 h-5" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
                        {isBuilding ? 'Compiling Artifact...' : 'Interactive Canvas'}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    <span className="uppercase tracking-wider">HTML5 / App</span>
                    <span>•</span>
                    <span>{(content.length / 1024).toFixed(1)}KB</span>
                </div>
            </div>

            {/* Action Button */}
            <button className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all
                bg-zinc-800 text-zinc-400 group-hover:bg-primary-500 group-hover:text-zinc-950
            `}>
                <span>Open</span>
                <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
         </div>
      </div>

    </div>
  );
};
