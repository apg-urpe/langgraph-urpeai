'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';

export type Period = 'hoy' | '7d' | '15d' | '30d' | 'trimestre' | 'año' | 'custom';

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangeFilterProps {
  selectedPeriod: Period;
  dateRange: DateRange;
  onPeriodChange: (period: Period) => void;
  onCustomRangeChange: (range: DateRange) => void;
  disabled?: boolean;
}

const QUICK_PERIODS: { label: string; value: Period; shortLabel?: string }[] = [
  { label: 'Hoy', value: 'hoy' },
  { label: '7 días', value: '7d', shortLabel: '7d' },
  { label: '15 días', value: '15d', shortLabel: '15d' },
  { label: '30 días', value: '30d', shortLabel: '30d' },
  { label: 'Trimestre', value: 'trimestre', shortLabel: '3M' },
  { label: 'Año', value: 'año', shortLabel: '1A' },
];

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  selectedPeriod,
  dateRange,
  onPeriodChange,
  onCustomRangeChange,
  disabled = false
}) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  // Sync temp values when calendar opens
  useEffect(() => {
    if (showCalendar) {
      setTempFrom(dateRange.from ? dateRange.from.split('T')[0] : '');
      setTempTo(dateRange.to ? dateRange.to.split('T')[0] : '');
    }
  }, [showCalendar, dateRange]);

  const handleApplyCustomRange = () => {
    if (tempFrom && tempTo) {
      const fromDate = new Date(tempFrom);
      fromDate.setHours(0, 0, 0, 0);
      
      const toDate = new Date(tempTo);
      toDate.setHours(23, 59, 59, 999);

      onCustomRangeChange({
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      });
      onPeriodChange('custom');
      setShowCalendar(false);
    }
  };

  const formatCustomLabel = () => {
    if (!dateRange.from || !dateRange.to) return 'Personalizado';
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${from.toLocaleDateString('es-ES', opts)} - ${to.toLocaleDateString('es-ES', opts)}`;
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Quick Period Chips */}
      <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg p-0.5 border border-white/5">
        {QUICK_PERIODS.map((period) => (
          <button
            key={period.value}
            onClick={() => onPeriodChange(period.value)}
            disabled={disabled}
            className={`
              px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all
              ${selectedPeriod === period.value
                ? 'bg-primary-500/20 text-primary-400 shadow-sm shadow-primary-500/10'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <span className="hidden sm:inline">{period.label}</span>
            <span className="sm:hidden">{period.shortLabel || period.label}</span>
          </button>
        ))}
      </div>

      {/* Calendar Button for Custom Range */}
      <div className="relative" ref={calendarRef}>
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          disabled={disabled}
          className={`
            flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg border transition-all
            ${selectedPeriod === 'custom'
              ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
              : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title="Rango personalizado"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          {selectedPeriod === 'custom' && (
            <span className="text-[10px] md:text-xs font-medium max-w-[120px] truncate">
              {formatCustomLabel()}
            </span>
          )}
        </button>

        {/* Calendar Popover */}
        {showCalendar && (
          <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 p-4 min-w-[280px] animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-zinc-200">Rango Personalizado</h4>
              <button
                onClick={() => setShowCalendar(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded-md hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
                  Desde
                </label>
                <input
                  type="date"
                  value={tempFrom}
                  onChange={(e) => setTempFrom(e.target.value)}
                  max={tempTo || undefined}
                  className="w-full bg-zinc-800/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
                  Hasta
                </label>
                <input
                  type="date"
                  value={tempTo}
                  onChange={(e) => setTempTo(e.target.value)}
                  min={tempFrom || undefined}
                  className="w-full bg-zinc-800/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
              <button
                onClick={() => setShowCalendar(false)}
                className="flex-1 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyCustomRange}
                disabled={!tempFrom || !tempTo}
                className={`
                  flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all
                  ${tempFrom && tempTo
                    ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm shadow-primary-500/20'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }
                `}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
