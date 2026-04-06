'use client';

import React from 'react';
import { MessageSquare, CheckSquare, Calendar, Users, TrendingUp, Clock, Target, BarChart3, Flame, Trophy } from 'lucide-react';

interface StatsTabProps {
  profile: any;
}

export const StatsTab: React.FC<StatsTabProps> = ({ profile }) => {
  const stats = profile?.stats || {};

  const statItems = [
    { label: 'Total Mensajes', value: stats.totalMessages || 0, icon: <MessageSquare className="w-4 h-4" /> },
    { label: 'Tareas Completadas', value: stats.totalTasksCompleted || 0, icon: <CheckSquare className="w-4 h-4" /> },
    { label: 'Citas Gestionadas', value: stats.totalAppointments || 0, icon: <Calendar className="w-4 h-4" /> },
    { label: 'Contactos Creados', value: stats.totalContactsCreated || 0, icon: <Users className="w-4 h-4" /> },
    { label: 'Conversiones', value: stats.totalConversions || 0, icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'Tiempo Resp. Promedio', value: `${stats.avgResponseTimeMinutes || 0} min`, icon: <Clock className="w-4 h-4" /> },
    { label: 'Tareas a Tiempo', value: `${stats.tasksOnTimePercent || 0}%`, icon: <Target className="w-4 h-4" /> },
    { label: 'Tasa Conversión', value: `${stats.conversionRate || 0}%`, icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Estadísticas Totales</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statItems.map((stat, idx) => (
            <div 
              key={idx}
              className="p-4 rounded-xl bg-zinc-900/50 border border-white/5"
            >
              <div className="flex items-center gap-2 text-zinc-500 mb-2">
                {stat.icon}
                <span className="text-[10px] font-medium uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-zinc-200">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Streak History */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Historial de Rachas</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-400 mb-2">
              <Flame className="w-4 h-4" />
              <span className="text-xs font-medium">Racha Actual</span>
            </div>
            <p className="text-2xl font-bold text-orange-400">{profile?.streak?.currentStreak || 0} días</p>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <Trophy className="w-4 h-4" />
              <span className="text-xs font-medium">Récord Personal</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{profile?.streak?.longestStreak || 0} días</p>
          </div>
        </div>
      </section>
    </div>
  );
};
