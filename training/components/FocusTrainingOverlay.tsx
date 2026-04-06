'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Zap } from 'lucide-react';
import { useTrainingStore, selectIsOverlayOpen, selectCurrentSession, selectActiveLesson } from '../store/trainingStore';
import { cn } from '@/lib/utils';

interface FocusTrainingOverlayProps {
  children: React.ReactNode;
}

export const FocusTrainingOverlay: React.FC<FocusTrainingOverlayProps> = ({ children }) => {
  const isOverlayOpen = useTrainingStore(selectIsOverlayOpen);
  const closeOverlay = useTrainingStore(state => state.closeOverlay);
  const currentSession = useTrainingStore(selectCurrentSession);
  const activeLesson = useTrainingStore(selectActiveLesson);
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOverlayOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOverlayOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOverlayOpen) {
        if (confirm('¿Seguro que quieres salir? Tu progreso se guardará localmente.')) {
          closeOverlay();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlayOpen, closeOverlay]);

  if (!mounted || !isOverlayOpen) return null;

  const progressPercent = currentSession && activeLesson?.questions 
    ? (currentSession.currentQuestionIndex / activeLesson.questions.length) * 100
    : 5;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0c] flex flex-col animate-in fade-in duration-300">
      {/* Header Estilo Duolingo */}
      <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center px-6 gap-6 shrink-0">
        {/* Botón Cerrar Grande */}
        <button
          onClick={() => {
            if (confirm('¿Deseas pausar la capacitación? Tu progreso se guardará.')) {
              closeOverlay();
            }
          }}
          className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-all active:scale-95 group"
          title="Cerrar Academia (Esc)"
        >
          <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Barra de Progreso */}
        <div className="flex-1 h-3 bg-zinc-800/50 rounded-full overflow-hidden border border-white/5">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stats: Corazones y XP */}
        <div className="flex items-center gap-4">
          {/* Corazones (Vidas) */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
            <Heart className={cn(
              "w-5 h-5 text-rose-500 fill-rose-500",
              currentSession?.hearts === 0 && "opacity-30 grayscale"
            )} />
            <span className="text-sm font-bold text-rose-400 font-mono">
              {currentSession?.hearts ?? 5}
            </span>
          </div>
          
          {/* XP Acumulado */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span className="text-sm font-bold text-amber-400 font-mono">
              {currentSession?.xpEarned ?? 0}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Zone */}
      <main className="flex-1 overflow-y-auto relative bg-[#0a0a0c]">
        {/* Noise texture sutil */}
        <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none" />
        
        <div className="max-w-3xl mx-auto h-full flex flex-col px-6 py-8 relative z-10">
          {children}
        </div>
      </main>
    </div>,
    document.body
  );
};

export default FocusTrainingOverlay;
