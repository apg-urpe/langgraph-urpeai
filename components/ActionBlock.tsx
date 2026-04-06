'use client';

import React from 'react';
import { BlockAction } from '../types/chat';
import { BlockActions } from './BlockActions';
import { Command, Sparkles } from 'lucide-react';

interface ActionBlockProps {
  actions: BlockAction[];
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

export const ActionBlock: React.FC<ActionBlockProps> = ({ actions, onInteract, disabled = false }) => {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="w-full my-2 animate-fade-in-up">
       <div className="flex items-center gap-2 mb-3 px-1">
          <div className="p-1 rounded bg-gradient-to-br from-primary-500/20 to-secondary-500/20 border border-white/10 shadow-[0_0_10px_rgba(var(--primary-500),0.2)]">
             <Command className="w-3 h-3 text-primary-400" />
          </div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Recommended Actions
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent ml-2"></div>
       </div>

       <div className="p-1">
          <BlockActions 
            actions={actions} 
            onInteract={onInteract} 
            align="left" 
            className="flex-wrap gap-2.5"
            disabled={disabled}
          />
       </div>
    </div>
  );
};
