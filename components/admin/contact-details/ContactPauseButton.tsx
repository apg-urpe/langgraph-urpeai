'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Power, 
  PowerOff, 
  Clock, 
  AlertTriangle, 
  ChevronDown,
  Play,
  Loader2,
  X
} from 'lucide-react';
import { Contact } from '../../../types/contact';
import { useContactStore } from '../../../store/contactStore';

interface ContactPauseButtonProps {
  contact: Contact;
  compact?: boolean;
}

interface PauseOption {
  id: string;
  label: string;
  duration: number | null;
  warning?: boolean;
}

const PAUSE_OPTIONS: PauseOption[] = [
  { id: '5min', label: '5 min', duration: 5 },
  { id: '15min', label: '15 min', duration: 15 },
  { id: '30min', label: '30 min', duration: 30 },
  { id: '1hr', label: '1 hora', duration: 60 },
  { id: 'permanent', label: 'Desactivar', duration: null, warning: true },
];

const isPausedTemporarily = (contact: Contact): boolean => {
  if (contact.is_active !== false) return false;
  if (!contact.paused_until) return false;
  return new Date(contact.paused_until) > new Date();
};

const isPermanentlyDeactivated = (contact: Contact): boolean => {
  return contact.is_active === false && !contact.paused_until;
};

const getRemainingTime = (pausedUntil: string): string => {
  const end = new Date(pausedUntil);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Exp';
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

export const ContactPauseButton: React.FC<ContactPauseButtonProps> = ({ contact, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const pauseContact = useContactStore(state => state.pauseContact);
  const reactivateContact = useContactStore(state => state.reactivateContact);

  const isPaused = isPausedTemporarily(contact);
  const isDeactivated = isPermanentlyDeactivated(contact);
  const isActive = contact.is_active !== false;

  // Calculate popover position
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 200;
    const popoverHeight = 280;
    
    // Try to position to the right of the button
    let left = rect.right + 8;
    let top = rect.top;
    
    // If it would overflow right, position to the left
    if (left + popoverWidth > window.innerWidth - 16) {
      left = rect.left - popoverWidth - 8;
    }
    
    // If it would overflow bottom, adjust top
    if (top + popoverHeight > window.innerHeight - 16) {
      top = window.innerHeight - popoverHeight - 16;
    }
    
    // Ensure minimum top
    if (top < 16) top = 16;
    
    setPopoverPosition({ top, left });
  }, []);

  // Update remaining time
  useEffect(() => {
    if (!isPaused || !contact.paused_until) return;
    
    const updateTime = () => {
      const remaining = getRemainingTime(contact.paused_until!);
      setRemainingTime(remaining);
      if (remaining === 'Exp') {
        reactivateContact(contact.id);
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isPaused, contact.paused_until, contact.id, reactivateContact]);

  // Handle open/close and position
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
        setShowConfirm(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowConfirm(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handlePause = async (option: PauseOption) => {
    if (option.warning && showConfirm !== option.id) {
      setShowConfirm(option.id);
      return;
    }
    
    setIsLoading(true);
    try {
      const success = await pauseContact(contact.id, option.duration);
      if (success) {
        setIsOpen(false);
        setShowConfirm(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReactivate = async () => {
    setIsLoading(true);
    try {
      await reactivateContact(contact.id);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const buttonStyles = useMemo(() => {
    if (isDeactivated) {
      return {
        bg: 'bg-rose-500/10 hover:bg-rose-500/20',
        border: 'border-rose-500/30',
        text: 'text-rose-400',
        icon: PowerOff,
        label: 'Off'
      };
    }
    if (isPaused) {
      return {
        bg: 'bg-amber-500/10 hover:bg-amber-500/20',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        icon: Clock,
        label: remainingTime
      };
    }
    return {
      bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      icon: Power,
      label: 'Activo'
    };
  }, [isDeactivated, isPaused, remainingTime]);

  const ButtonIcon = buttonStyles.icon;

  // Popover content
  const popoverContent = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popoverRef}
      style={{ top: popoverPosition.top, left: popoverPosition.left }}
      className="fixed z-[200] w-[200px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400' : isPaused ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`} />
          <span className="text-[11px] font-medium text-zinc-300">
            {isActive ? 'Activo' : isPaused ? remainingTime : 'Desactivado'}
          </span>
        </div>
        <button 
          onClick={() => { setIsOpen(false); setShowConfirm(null); }}
          className="p-0.5 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Reactivate (if not active) */}
      {!isActive && (
        <button
          onClick={handleReactivate}
          disabled={isLoading}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-500/10 transition-colors border-b border-white/5"
        >
          <Play className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">Reactivar ahora</span>
        </button>
      )}

      {/* Pause Options - Compact Grid */}
      <div className="p-2">
        <span className="text-[9px] text-zinc-600 uppercase tracking-wider px-1 mb-1 block">
          Pausar
        </span>
        <div className="grid grid-cols-2 gap-1">
          {PAUSE_OPTIONS.filter(o => !o.warning).map((option) => (
            <button
              key={option.id}
              onClick={() => handlePause(option)}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors text-xs text-zinc-300"
            >
              <Clock className="w-3 h-3 text-zinc-500" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deactivate - Separate danger zone */}
      <div className="px-2 pb-2">
        {PAUSE_OPTIONS.filter(o => o.warning).map((option) => {
          const isConfirming = showConfirm === option.id;
          return (
            <button
              key={option.id}
              onClick={() => handlePause(option)}
              disabled={isLoading}
              className={`
                w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-xs
                ${isConfirming 
                  ? 'bg-rose-500/30 text-rose-300 ring-1 ring-rose-500/50' 
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                }
              `}
            >
              {isConfirming ? (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  ¿Confirmar?
                </>
              ) : (
                <>
                  <PowerOff className="w-3 h-3" />
                  {option.label}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer warning */}
      <div className="px-2 py-1.5 bg-zinc-950/50 border-t border-white/5">
        <p className="text-[9px] text-zinc-600 text-center">
          Detiene automatizaciones
        </p>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* Main Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-200
          ${buttonStyles.bg} ${buttonStyles.border} ${buttonStyles.text}
          ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          text-[11px]
        `}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <ButtonIcon className="w-3 h-3" />
        )}
        <span className="font-medium">{buttonStyles.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover (Portal) */}
      {popoverContent}
    </>
  );
};
