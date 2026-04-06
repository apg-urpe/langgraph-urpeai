'use client';

import React from 'react';

/**
 * DashboardSkeleton - Placeholder durante la carga del dashboard
 * 
 * IMPORTANTE: Las dimensiones DEBEN coincidir con el contenido final
 * para evitar CLS (Cumulative Layout Shift).
 * 
 * Layout match:
 * - KPIs: grid 1/2/3 cols → 6 cards
 * - Chart Tendencia: full width, h-[300px]
 * - Charts secundarios: grid 2 cols
 */
export const DashboardSkeleton: React.FC = () => {
  // Heights fijos para evitar CLS
  const KPI_HEIGHT = 'h-[120px]';
  const CHART_HEIGHT = 'h-[300px]';
  const SECONDARY_CHART_HEIGHT = 'h-[220px]';
  
  return (
    <div className="space-y-4 md:space-y-6">
      {/* 1. KPI Cards Row - Match: 1 col mobile, 2 tablet, 3 desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {[...Array(6)].map((_, i) => (
          <div 
            key={i} 
            className={`${KPI_HEIGHT} rounded-xl bg-zinc-900/50 border border-white/5 p-4 flex flex-col justify-between animate-pulse`}
          >
            <div className="flex justify-between items-start">
              <div className="h-4 w-24 bg-zinc-800 rounded"></div>
              <div className="h-5 w-5 bg-zinc-800 rounded"></div>
            </div>
            <div className="h-8 w-16 bg-zinc-800 rounded"></div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-12 bg-zinc-800 rounded"></div>
              <div className="h-3 w-20 bg-zinc-800/50 rounded"></div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Chart Tendencia - Full width */}
      <div className={`${CHART_HEIGHT} rounded-xl bg-zinc-900/50 border border-white/5 p-4 flex flex-col gap-3 animate-pulse`}>
        <div className="h-5 w-48 bg-zinc-800 rounded"></div>
        <div className="flex-1 w-full bg-zinc-800/20 rounded-lg"></div>
      </div>

      {/* 3. Secondary Charts - 2 cols grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i} 
            className={`${SECONDARY_CHART_HEIGHT} rounded-xl bg-zinc-900/50 border border-white/5 p-4 flex flex-col gap-3 animate-pulse`}
          >
            <div className="h-5 w-36 bg-zinc-800 rounded"></div>
            <div className="flex-1 w-full bg-zinc-800/20 rounded-lg"></div>
          </div>
        ))}
      </div>
    </div>
  );
};
