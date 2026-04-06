'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Undo2, X, User } from 'lucide-react';

export interface StageMoveInfo {
  contactId: number;
  contactName: string;
  fromStageName: string;
  toStageName: string;
  fromStageColor: string;
  toStageColor: string;
  onUndo: () => void;
}

interface StageMoveToastProps {
  moveInfo: StageMoveInfo | null;
  onDismiss: () => void;
  duration?: number;
}

export const StageMoveToast: React.FC<StageMoveToastProps> = ({
  moveInfo,
  onDismiss,
  duration = 5000
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (moveInfo) {
      setIsVisible(true);
      setIsLeaving(false);
      
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveInfo, duration]); // handleDismiss excluded - stable function

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 200);
  };

  const handleUndo = () => {
    moveInfo?.onUndo();
    handleDismiss();
  };

  if (!moveInfo || !isVisible) return null;

  return (
    <div 
      className={`
        fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[200]
        flex items-center gap-3 px-4 py-3
        bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl
        shadow-2xl shadow-black/40
        transition-all duration-200
        ${isLeaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
      `}
    >
      {/* Contact avatar */}
      <div 
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${moveInfo.toStageColor}, ${moveInfo.toStageColor}99)` }}
      >
        {moveInfo.contactName.slice(0, 2).toUpperCase()}
      </div>
      
      {/* Move info */}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-zinc-200 truncate max-w-[150px]">
          {moveInfo.contactName}
        </span>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span 
            className="px-1.5 py-0.5 rounded-md truncate max-w-[80px]"
            style={{ backgroundColor: `${moveInfo.fromStageColor}20`, color: moveInfo.fromStageColor }}
          >
            {moveInfo.fromStageName}
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
          <span 
            className="px-1.5 py-0.5 rounded-md truncate max-w-[80px]"
            style={{ backgroundColor: `${moveInfo.toStageColor}20`, color: moveInfo.toStageColor }}
          >
            {moveInfo.toStageName}
          </span>
        </div>
      </div>

      {/* Undo button */}
      <button
        onClick={handleUndo}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded-lg text-[11px] font-medium transition-colors shrink-0"
      >
        <Undo2 className="w-3 h-3" />
        Deshacer
      </button>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
