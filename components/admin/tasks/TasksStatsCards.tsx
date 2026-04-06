'use client';

import React from 'react';
import { 
  FileText, 
  AlertTriangle, 
  Clock, 
  CheckCircle2 
} from 'lucide-react';

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: number;
  change?: string;
  comparison?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  variant?: 'default' | 'sidebar';
}

function StatCard({ icon, title, value, change, comparison, changeType = 'positive', variant = 'default' }: StatCardProps) {
  const changeColors = {
    positive: 'text-emerald-500',
    negative: 'text-rose-500',
    neutral: 'text-zinc-400'
  };

  if (variant === 'sidebar') {
    return (
      <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] text-zinc-500">{title}</span>
        </div>
        <span className="text-sm font-bold text-zinc-100">{value}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-zinc-500">{title}</span>
      </div>
      <p className="text-3xl font-bold text-zinc-100">{value}</p>
      {(change || comparison) && (
        <div className="flex items-center gap-2 text-xs">
          {change && (
            <span className={`font-medium ${changeColors[changeType]}`}>{change}</span>
          )}
          {change && comparison && (
            <span className="w-1 h-1 rounded-full bg-zinc-600" />
          )}
          {comparison && (
            <span className="text-zinc-500">{comparison}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface TasksStatsCardsProps {
  tasksDueToday: number;
  overdueTasks: number;
  inProgress: number;
  completedThisWeek: number;
  // Optional comparison data
  tasksDueTodayChange?: string;
  overdueTasksChange?: string;
  inProgressChange?: string;
  completedChange?: string;
  variant?: 'default' | 'sidebar';
}

export function TasksStatsCards({
  tasksDueToday,
  overdueTasks,
  inProgress,
  completedThisWeek,
  tasksDueTodayChange,
  overdueTasksChange,
  inProgressChange,
  completedChange,
  variant = 'default'
}: TasksStatsCardsProps) {
  if (variant === 'sidebar') {
    return (
      <div className="w-full space-y-2 px-2">
        <StatCard
          icon={<FileText className="w-3.5 h-3.5 text-zinc-500" />}
          title="Vencen Hoy"
          value={tasksDueToday}
          variant="sidebar"
        />
        <StatCard
          icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
          title="Atrasadas"
          value={overdueTasks}
          variant="sidebar"
        />
        <StatCard
          icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}
          title="En Progreso"
          value={inProgress}
          variant="sidebar"
        />
        <StatCard
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          title="Completadas"
          value={completedThisWeek}
          variant="sidebar"
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-xl border border-zinc-800/70 p-4 sm:p-6 bg-zinc-900/50">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={<FileText className="w-[18px] h-[18px] text-zinc-500" />}
            title="Vencen Hoy"
            value={tasksDueToday}
            change={tasksDueTodayChange}
            comparison="vs ayer"
            changeType={tasksDueToday > 0 ? 'neutral' : 'positive'}
          />
          <StatCard
            icon={<AlertTriangle className="w-[18px] h-[18px] text-rose-500" />}
            title="Atrasadas"
            value={overdueTasks}
            change={overdueTasksChange}
            comparison="pendientes"
            changeType={overdueTasks > 0 ? 'negative' : 'positive'}
          />
          <StatCard
            icon={<Clock className="w-[18px] h-[18px] text-blue-500" />}
            title="En Progreso"
            value={inProgress}
            change={inProgressChange}
            comparison="activas"
            changeType="neutral"
          />
          <StatCard
            icon={<CheckCircle2 className="w-[18px] h-[18px] text-emerald-500" />}
            title="Completadas (Semana)"
            value={completedThisWeek}
            change={completedChange}
            comparison="esta semana"
            changeType="positive"
          />
        </div>
      </div>
    </div>
  );
}

export default TasksStatsCards;
