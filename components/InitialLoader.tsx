import React from 'react';

export const InitialLoader = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020204] overflow-hidden">
      {/* Ambient Glow - Deep Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[150px] animate-pulse-slow" />
      </div>

      {/* Abstract Core Loader */}
      <div className="relative flex items-center justify-center">
        
        {/* Layer 1: Outer faint orbit - Slow Rotation */}
        <div className="absolute w-24 h-24 rounded-full border border-white/[0.03] animate-[spin_12s_linear_infinite]" />
        
        {/* Layer 2: Mid orbit - Counter Rotation */}
        <div className="absolute w-16 h-16 rounded-full border-t border-primary-500/20 animate-[spin_4s_linear_infinite_reverse]" />
        
        {/* Layer 3: Inner orbit - Fast Rotation */}
        <div className="absolute w-10 h-10 rounded-full border-l border-primary-400/40 animate-[spin_2s_linear_infinite]" />
        
        {/* Layer 4: The Core - Pulsing Light */}
        <div className="relative w-2.5 h-2.5 bg-primary-400 rounded-full shadow-[0_0_20px_rgba(var(--primary-400),0.8),0_0_40px_rgba(var(--primary-500),0.4)]">
          <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-30" />
        </div>

      </div>
    </div>
  );
};
