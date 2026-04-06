'use client';

import React from 'react';
import { Target, MessageSquare, CheckSquare, Calendar, Clock, Flame, Trophy, Award, Sparkles, Users, BarChart3 } from 'lucide-react';
import { getBadgeById, getTierColor } from '../../../../types/gamification';

interface OverviewTabProps {
  profile: any;
  dailyMissions: any[];
  levelInfo: any;
}

const MissionCard: React.FC<{ mission: any }> = ({ mission }) => {
  const progress = Math.round((mission.current / mission.target) * 100);
  const isCompleted = mission.isCompleted;

  const missionIcons: Record<string, React.ReactNode> = {
    messages: <MessageSquare className="w-4 h-4" />,
    tasks: <CheckSquare className="w-4 h-4" />,
    appointments: <Calendar className="w-4 h-4" />,
    contacts: <Users className="w-4 h-4" />,
    response_time: <Clock className="w-4 h-4" />
  };

  return (
    <div className={`
      p-4 rounded-xl border transition-all
      ${isCompleted 
        ? 'bg-emerald-500/5 border-emerald-500/20' 
        : 'bg-zinc-900/50 border-white/5 hover:border-white/10'
      }
    `}>
      <div className="flex items-start gap-3">
        <div className={`
          p-2 rounded-lg
          ${isCompleted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-primary-500/10 text-primary-400'}
        `}>
          {missionIcons[mission.type] || <Target className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-medium text-zinc-200">{mission.title}</h3>
            <span className="text-xs text-primary-400 font-medium">+{mission.xpReward} XP</span>
          </div>
          <p className="text-xs text-zinc-500 mb-2">{mission.description}</p>
          
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-primary-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-zinc-400 tabular-nums">
              {mission.current}/{mission.target}
            </span>
          </div>
        </div>

        {isCompleted && (
          <div className="shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </div>
        )}
      </div>
    </div>
  );
};

const QuickStatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
  };

  return (
    <div className={`p-3 rounded-xl border ${colorClasses[color] || colorClasses.cyan}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ profile, dailyMissions }) => {
  return (
    <div className="space-y-6">
      {/* Daily Missions */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary-400" />
          Misiones Diarias
        </h2>
        <div className="grid gap-3">
          {dailyMissions.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm">
              No hay misiones disponibles
            </div>
          ) : (
            dailyMissions.map(mission => (
              <MissionCard key={mission.id} mission={mission} />
            ))
          )}
        </div>
      </section>

      {/* Quick Stats */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary-400" />
          Resumen Rápido
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickStatCard 
            icon={<Flame className="w-4 h-4" />}
            label="Racha Actual"
            value={`${profile?.streak?.currentStreak || 0} días`}
            color="orange"
          />
          <QuickStatCard 
            icon={<Trophy className="w-4 h-4" />}
            label="Medallas"
            value={profile?.earnedBadges?.length || 0}
            color="amber"
          />
          <QuickStatCard 
            icon={<CheckSquare className="w-4 h-4" />}
            label="Tareas"
            value={profile?.stats?.totalTasksCompleted || 0}
            color="emerald"
          />
          <QuickStatCard 
            icon={<MessageSquare className="w-4 h-4" />}
            label="Mensajes"
            value={profile?.stats?.totalMessages || 0}
            color="cyan"
          />
        </div>
      </section>

      {/* Recent Badges */}
      {profile?.earnedBadges?.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-primary-400" />
            Últimas Medallas
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {profile.earnedBadges.slice(-5).reverse().map((earned: any) => {
              const badge = getBadgeById(earned.badgeId);
              if (!badge) return null;
              return (
                <div 
                  key={earned.badgeId}
                  className={`shrink-0 p-3 rounded-xl border ${getTierColor(badge.tier)} flex flex-col items-center gap-2 min-w-[100px]`}
                >
                  <Award className="w-6 h-6" />
                  <span className="text-xs font-medium text-center">{badge.name}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
