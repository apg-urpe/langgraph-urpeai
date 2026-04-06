'use client';

import React from 'react';
import { useChatStore } from '../store/chatStore';

export const DynamicBackground: React.FC = React.memo(() => {
  // Select only the specific value needed, not the whole store
  const themeIntensity = useChatStore((state) => state.themeIntensity);

  // Multiplier for opacity. 
  // Max intensity (100) -> 1.0 opacity multiplier
  // Min intensity (0) -> 0.1 opacity multiplier
  const opacityMult = Math.max(0.1, themeIntensity / 100); 

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#020204] transition-colors duration-1000 ease-in-out hardware-accelerated">
        
        {/* 1. Deep Void Base */}
        <div 
          className="absolute inset-0 bg-gradient-to-b from-[#050510] via-[#020204] to-[#000000]"
          style={{ opacity: 1 }}
        ></div>

        {/* 2. FLUID ORB SYSTEM (Lava Lamp Effect) */}
        
        {/* Orb 1: Primary - Large wandering shape positioned 3/4 abajo, izquierda */}
        <div 
           className="absolute top-[10%] left-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen blur-[120px] animate-blob-1 will-change-transform"
           style={{ 
             opacity: 0.5 * opacityMult,
             background: 'radial-gradient(circle, rgb(var(--primary-500)) 0%, transparent 70%)',
             transform: 'translateZ(0)' // Force GPU layer
           }}
        ></div>

        {/* Orb 2: Secondary - Large wandering shape positioned 3/4 abajo, derecha */}
        <div 
           className="absolute top-[40%] right-[-10%] w-[80vw] h-[80vw] rounded-full mix-blend-screen blur-[130px] animate-blob-2 will-change-transform"
           style={{ 
             opacity: 0.4 * opacityMult,
             background: 'radial-gradient(circle, rgb(var(--secondary-500)) 0%, transparent 55%)',
             transform: 'translateZ(0)' // Force GPU layer
           }}
        ></div>

        {/* Orb 3: Accent - Central "Breathing" core posicionado 3/4 abajo */}
        <div 
           className="absolute top-[45%] left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] rounded-full mix-blend-screen blur-[100px] animate-blob-3 will-change-transform"
           style={{ 
              opacity: 0.3 * opacityMult,
              background: 'radial-gradient(circle, rgb(var(--primary-400)/0.4) 0%, rgb(var(--secondary-400)/0.2) 40%, transparent 70%)',
              transform: 'translateZ(0)' // Force GPU layer
           }}
        ></div>

        {/* 3. Grid Texture Overlay (Tech feel) */}
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(circle at end, black 50%, transparent 100%)' }}
        ></div>
        
        {/* 4. Vignette for focus depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#020204] via-transparent to-[#020204]/80 pointer-events-none"></div>
    </div>
  );
});

DynamicBackground.displayName = 'DynamicBackground';
