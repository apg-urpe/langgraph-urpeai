'use client';

import React, { useEffect } from 'react';
import { Flame, Users, Star, Trophy } from 'lucide-react';
import { useGamificationStore } from '../../../../store/gamificationStore';
import { useContactStore, selectUserContext } from '../../../../store/contactStore';

export const LeaderboardTab: React.FC = () => {
  const leaderboard = useGamificationStore(state => state.leaderboard);
  const fetchLeaderboard = useGamificationStore(state => state.fetchLeaderboard);
  const leaderboardScope = useGamificationStore(state => state.leaderboardScope);
  const userContext = useContactStore(selectUserContext);

  useEffect(() => {
    fetchLeaderboard('weekly');
  }, [fetchLeaderboard]);

  const barStyles = [
    { borderColor: "border-pink-500/50", bgGradient: "bg-gradient-to-r from-pink-500/40 via-pink-500/10 to-transparent", text: "text-pink-400", isDashed: false },
    { borderColor: "border-cyan-400/50", bgGradient: "bg-gradient-to-r from-cyan-400/40 via-cyan-400/10 to-transparent", text: "text-cyan-400", isDashed: true },
    { borderColor: "border-emerald-400/50", bgGradient: "bg-gradient-to-r from-emerald-400/40 via-emerald-400/10 to-transparent", text: "text-emerald-400", isDashed: true },
    { borderColor: "border-amber-400/50", bgGradient: "bg-gradient-to-r from-amber-400/40 via-amber-400/10 to-transparent", text: "text-amber-400", isDashed: true },
    { borderColor: "border-violet-400/50", bgGradient: "bg-gradient-to-r from-violet-400/40 via-violet-400/10 to-transparent", text: "text-violet-400", isDashed: true },
    { borderColor: "border-rose-400/50", bgGradient: "bg-gradient-to-r from-rose-400/40 via-rose-400/10 to-transparent", text: "text-rose-400", isDashed: true },
  ];

  return (
    <div className="space-y-6">
      {/* Scope Selector */}
      <div className="flex gap-2">
        {(['weekly', 'monthly', 'alltime'] as const).map(scope => (
          <button
            key={scope}
            onClick={() => fetchLeaderboard(scope)}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
              ${leaderboardScope === scope 
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700 shadow-sm' 
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/50'
              }
            `}
          >
            {scope === 'weekly' && 'Semanal'}
            {scope === 'monthly' && 'Mensual'}
            {scope === 'alltime' && 'Total'}
          </button>
        ))}
      </div>

      {/* Leaderboard List */}
      <div className="space-y-4">
        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No hay datos de ranking disponibles</p>
          </div>
        ) : (
          leaderboard.map((entry, idx) => {
            const isCurrentUser = entry.teamMemberId === userContext?.id;
            const style = barStyles[idx % barStyles.length];
            const displayXP = leaderboardScope === 'weekly' ? entry.weeklyXP 
              : leaderboardScope === 'monthly' ? entry.monthlyXP 
              : entry.totalXP;
            const progressWidth = (displayXP / Math.max(...leaderboard.map(e => 
              leaderboardScope === 'weekly' ? e.weeklyXP : leaderboardScope === 'monthly' ? e.monthlyXP : e.totalXP
            ), 1)) * 100;
            const initials = `${entry.nombre?.charAt(0) || ''}${entry.apellido?.charAt(0) || ''}`.toUpperCase();

            return (
              <div key={entry.teamMemberId} className="flex items-center gap-4 group">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 border border-zinc-700">
                    {initials}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border border-black ${idx < 3 ? 'bg-amber-400 text-black' : 'bg-zinc-700 text-white'}`}>
                    {entry.rank}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className={`text-sm font-medium ${isCurrentUser ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {entry.nombre} {entry.apellido} {isCurrentUser && '(Tú)'}
                    </span>
                    {entry.streak > 0 && (
                      <span className="text-[10px] text-orange-400 flex items-center gap-1 opacity-70">
                        <Flame className="w-3 h-3" /> {entry.streak}d
                      </span>
                    )}
                  </div>

                  <div className="relative h-[42px] w-full">
                    <div className={`relative h-full rounded-lg border overflow-hidden transition-all duration-500 ${style.borderColor} ${style.isDashed ? 'border-dashed' : 'border-solid'} bg-zinc-900/30`}>
                      <div 
                        className={`absolute inset-0 transition-all duration-1000 ease-out ${style.bgGradient}`}
                        style={{ width: `${Math.max(progressWidth, 15)}%` }}
                      />
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-[#0a0a0c]/90 border border-zinc-800 rounded-md px-2 py-1 shadow-sm">
                        {idx === 0 ? (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        ) : (
                          <Trophy className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                        <span className={`text-sm font-bold font-mono ${idx === 0 ? 'text-zinc-100' : 'text-zinc-400'}`}>
                          {displayXP}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
