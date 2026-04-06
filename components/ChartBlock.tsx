'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { sanitizeHtml } from '../lib/sanitize-html';
import { 
  AreaChart, Area, 
  BarChart, Bar, 
  PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, TrendingUp } from 'lucide-react';
import { BlockAction } from '../types/chat';
import { BlockActions } from './BlockActions';

interface ChartBlockProps {
  title: string;
  data: {
    points?: any[];
    segments?: any[];
    data?: any[];
    chartType?: 'area' | 'bar' | 'pie' | 'line';
    orientation?: 'vertical' | 'horizontal';
    colors?: string[];
    series?: string[];  // Explicit series order (e.g., ['contactos', 'citas'])
    actions?: BlockAction[];
    yUnit?: string;
    xKey?: string;
  };
  onInteract?: (data: any) => void;
  disabled?: boolean;
}

// Square UI Inspired Palette (Neon/Pastel)
const DEFAULT_COLORS = ['#ec4899', '#06b6d4', '#f97316', '#22c55e', '#a855f7', '#eab308'];

// Square UI Custom Tooltip - Clean glass morphism style
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl">
        <p className="text-zinc-500 text-[10px] font-medium mb-2 uppercase tracking-wide">{sanitizeHtml(label)}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {payload.map((p: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2">
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: p.stroke || p.fill }} 
              />
              <span className="text-xs font-semibold text-zinc-100">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const ChartBlock: React.FC<ChartBlockProps> = ({ title, data, onInteract, disabled = false }) => {
  const chartType = data.chartType || 'area';
  const chartData = useMemo(() => data.points || data.segments || data.data || [], [data.points, data.segments, data.data]);
  const orientation = data.orientation || 'horizontal';
  const COLORS = data.colors || DEFAULT_COLORS;
  const yUnit = data.yUnit || '';
  const xKey = data.xKey || 'name';
  
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 250);
    return () => clearTimeout(timer);
  }, []);

  // FIXED: Use explicit series order if provided, otherwise infer from data
  const dataKeys = useMemo(() => {
    if (!chartData.length || chartType === 'pie') return ['value'];
    
    // If explicit series order is provided, use it (prevents Object.keys() ordering issues)
    if (data.series && data.series.length > 0) {
      return data.series;
    }
    
    // Fallback: infer from data (can have inconsistent ordering)
    const keys = Object.keys(chartData[0]).filter(k => k !== xKey && k !== 'name');
    return keys.length > 0 ? keys : ['value'];
  }, [chartData, xKey, chartType, data.series]);

  const getIcon = () => {
    switch(chartType) {
      case 'pie': return <PieChartIcon className="w-3.5 h-3.5 text-zinc-400" />;
      case 'bar': return <BarChart3 className="w-3.5 h-3.5 text-zinc-400" />;
      case 'line': return <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />;
      default: return <LineChartIcon className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const renderChart = () => {
    switch(chartType) {
        case 'pie':
            return (
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="80%"
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                    >
                        {chartData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="outline-none hover:opacity-80 transition-opacity" />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                        verticalAlign="middle" 
                        align="right" 
                        layout="vertical" 
                        iconType="circle"
                        iconSize={6}
                        wrapperStyle={{ fontSize: '11px', color: '#a1a1aa', right: 0 }}
                    />
                </PieChart>
            );
        
        case 'bar':
            return (
                <BarChart 
                    data={chartData} 
                    layout={orientation}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                    <defs>
                    {COLORS.map((color, index) => (
                        <linearGradient key={`barGradient-${index}`} id={`barGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={1} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                        </linearGradient>
                    ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.4} vertical={orientation === 'horizontal'} horizontal={orientation === 'vertical'} />
                    {orientation === 'horizontal' ? (
                    <>
                        <XAxis dataKey={xKey} stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                        <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}${yUnit}`} />
                    </>
                    ) : (
                    <>
                        <XAxis type="number" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}${yUnit}`} />
                        <YAxis dataKey={xKey} type="category" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} width={80} />
                    </>
                    )}
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#a1a1aa', paddingTop: '10px' }} />
                    {dataKeys.map((key, index) => (
                        <Bar 
                            key={key}
                            dataKey={key}
                            fill={`url(#barGradient-${index % COLORS.length})`}
                            radius={orientation === 'horizontal' ? [4, 4, 0, 0] : [0, 4, 4, 0]}
                            barSize={orientation === 'horizontal' ? 32 : 20}
                            animationDuration={1000}
                        />
                    ))}
                </BarChart>
            );

        case 'line':
            return (
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#27272a" strokeOpacity={0.3} vertical={false} />
                    <XAxis 
                      dataKey={xKey}
                      stroke="#71717a" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => `${value}${yUnit}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#a1a1aa', paddingTop: '10px' }} />
                    {dataKeys.map((key, index) => (
                        <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: COLORS[index % COLORS.length] }}
                            animationDuration={1500}
                        />
                    ))}
                </LineChart>
            );

        case 'area':
        default:
            return (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                    {COLORS.map((color, index) => (
                        <linearGradient key={`areaGradient-${index}`} id={`areaGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.4}/>
                            <stop offset="100%" stopColor={color} stopOpacity={0}/>
                        </linearGradient>
                    ))}
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="#27272a" 
                      strokeOpacity={0.4} 
                      vertical={false}
                    />
                    <XAxis 
                      dataKey={xKey}
                      stroke="#71717a" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      dy={10}
                      tick={{ fill: '#71717a' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => `${value}${yUnit}`}
                      tick={{ fill: '#71717a' }}
                      width={35}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Legend 
                      iconType="circle" 
                      iconSize={6}
                      wrapperStyle={{ fontSize: '11px', color: '#a1a1aa', paddingTop: '16px' }} 
                    />
                    {dataKeys.map((key, index) => (
                         <Area 
                            key={key}
                            type="monotone"
                            dataKey={key} 
                            stroke={COLORS[index % COLORS.length]} 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill={`url(#areaGradient-${index % COLORS.length})`}
                            animationDuration={1200}
                            dot={false}
                        />
                    ))}
                </AreaChart>
            );
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-all duration-200 w-full group flex flex-col min-h-[300px]">
      {/* Header - Square UI Style */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-white/5">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        <div className="p-1.5 rounded-lg bg-zinc-800/50 text-zinc-500">
          {getIcon()}
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="p-4 w-full flex-1 relative min-h-0 select-none flex flex-col justify-center">
        <div className="w-full h-[220px] relative">
          {isMounted ? (
            <ResponsiveContainer width="100%" height="100%">
               {renderChart()}
            </ResponsiveContainer>
          ) : (
             <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-6 h-6 rounded-full border-2 border-zinc-800 border-t-primary-400 animate-spin"></div>
             </div>
          )}
        </div>
      </div>

      {data.actions && data.actions.length > 0 && (
         <div className="px-4 py-3 border-t border-white/5">
            <BlockActions actions={data.actions} onInteract={onInteract} disabled={disabled} />
         </div>
      )}
    </div>
  );
};
