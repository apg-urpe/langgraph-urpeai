'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  position?: 'left' | 'right';
  minWidth?: number;
  maxWidth?: number;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ 
  onResize, 
  onResizeEnd,
  position = 'right'
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const delta = position === 'right' 
      ? e.clientX - startX 
      : startX - e.clientX;
    
    onResize(delta);
    setStartX(e.clientX);
  }, [isDragging, startX, onResize, position]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onResizeEnd?.();
    }
  }, [isDragging, onResizeEnd]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        absolute top-0 bottom-0 w-1 z-40 cursor-col-resize group
        ${position === 'right' ? 'right-0' : 'left-0'}
        hover:bg-primary-500/30 transition-colors
        ${isDragging ? 'bg-primary-500/50' : ''}
      `}
    >
      {/* Visual indicator */}
      <div className={`
        absolute top-1/2 -translate-y-1/2 
        ${position === 'right' ? '-right-1' : '-left-1'}
        w-3 h-12 rounded-full bg-zinc-800/80 border border-white/10
        flex items-center justify-center
        opacity-0 group-hover:opacity-100 transition-opacity
        ${isDragging ? 'opacity-100 bg-primary-500/30 border-primary-500/50' : ''}
      `}>
        <GripVertical className="w-3 h-3 text-zinc-400" />
      </div>
      
      {/* Wider hit area */}
      <div className={`
        absolute top-0 bottom-0 w-4
        ${position === 'right' ? '-right-1.5' : '-left-1.5'}
      `} />
    </div>
  );
};
