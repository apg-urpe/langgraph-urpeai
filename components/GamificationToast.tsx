'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, Flame, Trophy, Sparkles } from 'lucide-react';
import { useGamificationStore } from '../store/gamificationStore';
import { LEVELS } from '../types/gamification';

export const GamificationToast: React.FC = () => {
  const pendingRewards = useGamificationStore(state => state.pendingRewards);
  const dismissReward = useGamificationStore(state => state.dismissReward);
  const [currentReward, setCurrentReward] = useState<typeof pendingRewards[0] | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (pendingRewards.length > 0 && !currentReward) {
      setCurrentReward(pendingRewards[0]);
      setIsVisible(true);
      
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          dismissReward(0);
          setCurrentReward(null);
        }, 300);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [pendingRewards, currentReward, dismissReward]);

  if (!currentReward || !isVisible || typeof document === 'undefined') return null;

  const getRewardContent = () => {
    switch (currentReward.type) {
      case 'level':
        const levelData = currentReward.data;
        return {
          icon: <Star className="w-6 h-6 text-amber-400" />,
          title: '¡Subiste de Nivel!',
          subtitle: `Ahora eres ${levelData?.name || 'Nivel ' + levelData?.level}`,
          gradient: 'from-amber-500/20 to-yellow-500/20',
          border: 'border-amber-500/30'
        };
      case 'streak':
        return {
          icon: <Flame className="w-6 h-6 text-orange-400" />,
          title: '¡Racha Alcanzada!',
          subtitle: `${currentReward.data} días consecutivos`,
          gradient: 'from-orange-500/20 to-red-500/20',
          border: 'border-orange-500/30'
        };
      case 'badge':
        return {
          icon: <Trophy className="w-6 h-6 text-emerald-400" />,
          title: '¡Nueva Medalla!',
          subtitle: currentReward.data?.name || 'Logro desbloqueado',
          gradient: 'from-emerald-500/20 to-teal-500/20',
          border: 'border-emerald-500/30'
        };
      default:
        return {
          icon: <Sparkles className="w-6 h-6 text-primary-400" />,
          title: '¡Recompensa!',
          subtitle: 'Has ganado una recompensa',
          gradient: 'from-primary-500/20 to-cyan-500/20',
          border: 'border-primary-500/30'
        };
    }
  };

  const content = getRewardContent();

  return createPortal(
    <div className={`
      fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] 
      animate-in fade-in slide-in-from-bottom-5 duration-300
      ${!isVisible ? 'animate-out fade-out slide-out-to-bottom-5' : ''}
    `}>
      <div className={`
        relative flex items-center gap-3 px-4 py-3
        bg-gradient-to-r ${content.gradient}
        backdrop-blur-xl border ${content.border}
        rounded-2xl shadow-2xl shadow-black/50
      `}>
        {/* Icon */}
        <div className="p-2 bg-white/5 rounded-xl">
          {content.icon}
        </div>
        
        {/* Text */}
        <div>
          <p className="text-sm font-semibold text-white">{content.title}</p>
          <p className="text-xs text-zinc-400">{content.subtitle}</p>
        </div>

        {/* Close */}
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => {
              dismissReward(0);
              setCurrentReward(null);
            }, 300);
          }}
          className="ml-2 p-1 text-zinc-500 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  );
};
