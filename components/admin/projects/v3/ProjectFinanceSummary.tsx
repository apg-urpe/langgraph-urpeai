'use client';

import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PieChart,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';
import { ProjectV3, CostCategory, COST_CATEGORY_COLORS, COST_CATEGORY_LABELS, calculateBudgetPercentage, getBudgetStatusColor } from '@/types/tasks-v3';
import { cn } from '@/lib/utils';

interface ProjectFinanceSummaryProps {
  project: ProjectV3;
}

export const ProjectFinanceSummary: React.FC<ProjectFinanceSummaryProps> = ({ project }) => {
  const costs = project.costos || [];
  const totalCost = costs.reduce((sum, c) => sum + c.monto, 0);
  const budget = project.presupuesto || 0;
  const remaining = Math.max(0, budget - totalCost);
  const percentage = calculateBudgetPercentage(project);
  const isOverBudget = totalCost > budget;

  // Prepare data for charts
  const costsByCategory = costs.reduce((acc, cost) => {
    acc[cost.categoria] = (acc[cost.categoria] || 0) + cost.monto;
    return acc;
  }, {} as Record<CostCategory, number>);

  const categoryData = Object.entries(costsByCategory).map(([key, value]) => ({
    name: COST_CATEGORY_LABELS[key as CostCategory],
    value,
    color: getCategoryColorHex(key as CostCategory)
  }));

  // Sort by value desc
  categoryData.sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-8">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Budget */}
        <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <CreditCard className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Presupuesto</span>
          </div>
          <div className="text-2xl font-bold text-zinc-200 font-mono">
            {project.moneda} {budget.toLocaleString()}
          </div>
        </div>

        {/* Spent */}
        <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Gastado</span>
          </div>
          <div className={cn("text-2xl font-bold font-mono", isOverBudget ? "text-rose-400" : "text-zinc-200")}>
            {project.moneda} {totalCost.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {percentage}% del total
          </div>
        </div>

        {/* Remaining */}
        <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Restante</span>
          </div>
          <div className={cn("text-2xl font-bold font-mono", remaining === 0 ? "text-rose-400" : "text-emerald-400")}>
            {project.moneda} {remaining.toLocaleString()}
          </div>
          {isOverBudget && (
            <div className="mt-1 text-xs text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Excedido por {(totalCost - budget).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Progreso del Presupuesto</span>
          <span className={cn("font-medium", getBudgetStatusColor(percentage))}>
            {percentage}%
          </span>
        </div>
        <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500", getProgressBarColor(percentage))}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      </div>

      {/* Charts Section */}
      {costs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Distribution Pie Chart */}
          <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-6">
            <h4 className="text-sm font-medium text-zinc-300 mb-6 flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Distribución por Categoría
            </h4>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0c0c0e', borderColor: '#27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(value: number) => [`${project.moneda} ${value.toLocaleString()}`, '']}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {categoryData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs text-zinc-400">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span>{entry.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar Chart (Top Expenses) */}
          <div className="bg-[#1a1a1c] border border-white/5 rounded-xl p-6">
            <h4 className="text-sm font-medium text-zinc-300 mb-6 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Top Gastos
            </h4>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip 
                    cursor={{ fill: '#27272a', opacity: 0.4 }}
                    contentStyle={{ backgroundColor: '#0c0c0e', borderColor: '#27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    formatter={(value: number) => [`${project.moneda} ${value.toLocaleString()}`, '']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// Helpers for colors
function getProgressBarColor(percentage: number): string {
  if (percentage >= 100) return 'bg-rose-500';
  if (percentage >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getCategoryColorHex(category: CostCategory): string {
  switch (category) {
    case 'personal': return '#60a5fa'; // blue-400
    case 'licencias': return '#c084fc'; // purple-400
    case 'infraestructura': return '#fbbf24'; // amber-400
    case 'servicios': return '#34d399'; // emerald-400
    case 'general': return '#a1a1aa'; // zinc-400
    default: return '#71717a';
  }
}
