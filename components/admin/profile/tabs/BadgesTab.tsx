'use client';

import React from 'react';
import { Award, Sparkles } from 'lucide-react';
import { BADGES_CATALOG, BadgeCategory, getCategoryLabel, getTierColor } from '../../../../types/gamification';

interface BadgesTabProps {
  profile: any;
}

export const BadgesTab: React.FC<BadgesTabProps> = ({ profile }) => {
  const earnedIds = new Set(profile?.earnedBadges?.map((b: any) => b.badgeId) || []);
  const categories: BadgeCategory[] = ['velocidad', 'precision', 'comunicacion', 'consistencia', 'liderazgo', 'especial'];

  return (
    <div className="space-y-6">
      {categories.map(category => {
        const categoryBadges = BADGES_CATALOG.filter(b => b.category === category);
        if (categoryBadges.length === 0) return null;

        return (
          <section key={category}>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">
              {getCategoryLabel(category)}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categoryBadges.map(badge => {
                const isEarned = earnedIds.has(badge.id);
                return (
                  <div 
                    key={badge.id}
                    className={`
                      p-4 rounded-xl border transition-all
                      ${isEarned 
                        ? getTierColor(badge.tier) 
                        : 'bg-zinc-900/30 border-white/5 opacity-50'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isEarned ? '' : 'bg-zinc-800'}`}>
                        <Award className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-zinc-200">{badge.name}</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{badge.description}</p>
                        <p className="text-[10px] text-zinc-600 mt-1">{badge.requirement}</p>
                      </div>
                      {isEarned && (
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
