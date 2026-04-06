'use client';

import React from 'react';
import { BlockAction } from '../types/chat';
import * as Icons from 'lucide-react';
import { logger } from '@/lib/logger';

interface BlockActionsProps {
  actions?: BlockAction[];
  onInteract?: (data: any) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
  disabled?: boolean;
}

export const BlockActions: React.FC<BlockActionsProps> = ({ 
  actions, 
  onInteract, 
  className = '',
  align = 'left',
  disabled = false
}) => {
  // Check validity of actions prop to prevent crashes
  if (!actions || !Array.isArray(actions) || actions.length === 0) return null;

  const handleAction = (e: React.MouseEvent, action: BlockAction) => {
    e.stopPropagation(); // Prevent bubbling if inside a clickable card
    if (disabled) return; // Block actions while processing
    if (onInteract) {
      onInteract({
        type: 'BLOCK_ACTION',
        actionId: action.id,
        label: action.label,
        payload: action.payload || { id: action.id }
      });
    }
  };

  const alignmentClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end'
  }[align];

  return (
    <div className={`flex flex-wrap gap-2 mt-3 ${alignmentClass} ${className}`}>
      {actions.map((action, idx) => {
        // Safer Dynamic Icon Loading
        const iconName = action.icon;
        
        let IconComponent = null;
        try {
           // Ensure Icons object exists and has the property before accessing
           if (iconName && Icons && (Icons as any)[iconName]) {
              IconComponent = (Icons as any)[iconName];
           }
        } catch (e) {
           logger.warn(`[BlockActions] Icon ${iconName} not found in lucide-react`);
        }

        // Variant Styles with improved Texture (Inset Shadows)
        let variantClass = "";
        switch (action.variant) {
            case 'primary':
                variantClass = "bg-gradient-to-b from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 text-zinc-950 border border-primary-400/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_rgba(6,182,212,0.3)]";
                break;
            case 'danger':
                variantClass = "bg-rose-950/50 hover:bg-rose-900 text-rose-400 border border-rose-500/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
                break;
            case 'ghost':
                variantClass = "bg-transparent hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-zinc-700";
                break;
            case 'secondary':
            default:
                variantClass = "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
                break;
        }

        return (
          <button
            key={idx}
            onClick={(e) => handleAction(e, action)}
            disabled={disabled}
            className={`
              group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200
              ${disabled 
                ? 'opacity-50 cursor-not-allowed grayscale' 
                : 'active:scale-95'
              }
              ${variantClass}
            `}
          >
            {IconComponent && <IconComponent className="w-3.5 h-3.5" />}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};
