import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, X, Calendar as CalendarIcon, Check, RotateCcw } from 'lucide-react';
import { ContactFilters, TeamMember, FunnelStage } from '../../../types/contact';

// ═══ Filter Option Constants ═══

const ESTADO_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: 'prospecto', label: 'Prospecto', dot: 'bg-blue-400' },
  { value: 'cliente', label: 'Cliente', dot: 'bg-emerald-400' },
  { value: 'rembolsos solicitado', label: 'Rembolso Solicitado', dot: 'bg-orange-400' },
  { value: 'rembolso realizado', label: 'Rembolso Realizado', dot: 'bg-orange-300' },
  { value: 'calificado', label: 'Calificado', dot: 'bg-purple-400' },
  { value: 'no_calificado', label: 'No Calificado', dot: 'bg-rose-400' },
  { value: 'evaluando', label: 'Evaluando', dot: 'bg-amber-400' },
];

const CALIFICACION_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: 'si', label: 'Sí', dot: 'bg-emerald-400' },
  { value: 'no', label: 'No', dot: 'bg-rose-400' },
  { value: 'evaluando', label: 'Evaluando', dot: 'bg-amber-400' },
];

// ═══ Exported Helpers ═══

export const countActiveFilters = (filters: ContactFilters): number => {
  let count = 0;
  if (filters.estado) count++;
  if (filters.calificacion) count++;
  if (filters.origen) count++;
  if (filters.etapaEmbudoId) count++;
  if (filters.dateRange?.from || filters.dateRange?.to) count++;
  if (filters.estadoCobranza) count++;
  return count;
};

const formatDateShort = (dateStr: string): string => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  } catch { return dateStr; }
};

// ═══ Types ═══

type OpenDropdown = 'etapa' | 'estado' | 'calificacion' | 'origen' | 'fecha' | 'estadoCobranza' | null;

// Collection status filter options for portfolio mode
const ESTADO_COBRANZA_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: 'en_mora', label: 'En mora', dot: 'bg-rose-400' },
  { value: 'vence_hoy', label: 'Vence hoy', dot: 'bg-amber-400' },
  { value: 'sin_configurar', label: 'Sin compromiso', dot: 'bg-zinc-400' },
  { value: 'al_dia', label: 'Al día', dot: 'bg-emerald-400' },
];

interface ActiveChip {
  key: string;
  label: string;
  dot: string;
  onRemove: () => void;
}

type ViewMode = 'table' | 'kanban' | 'activity' | 'portfolio';

interface ContactsFilterProps {
  show: boolean;
  filters: ContactFilters;
  setFilters: (filters: Partial<ContactFilters>) => void;
  resetFilters: () => void;
  teamMembers: TeamMember[];
  funnelStages: FunnelStage[];
  origenOptions?: string[];
  viewMode?: ViewMode;
}

// ═══ Style Constants ═══

const chipBase = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 whitespace-nowrap';
const chipOff = 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:bg-zinc-800 hover:border-white/10';
const chipOn = 'bg-primary-500/10 border-primary-500/30 text-primary-300 shadow-[0_0_8px_rgba(var(--primary-500),0.06)]';
const panelClass = 'absolute top-full left-0 mt-1.5 min-w-[200px] max-h-[280px] overflow-y-auto bg-[#131316] border border-white/10 rounded-xl shadow-2xl z-50 py-1 custom-scrollbar';

// ═══ Sub-components ═══

const DropdownOption: React.FC<{
  isActive: boolean;
  label: string;
  dot?: string;
  onClick: () => void;
}> = ({ isActive, label, dot, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
      isActive ? 'bg-primary-500/10 text-primary-400' : 'text-zinc-300 hover:bg-white/5'
    }`}
  >
    {isActive ? (
      <Check className="w-3.5 h-3.5 shrink-0" />
    ) : dot ? (
      <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
    ) : (
      <div className="w-3.5 shrink-0" />
    )}
    <span className="truncate">{label}</span>
  </button>
);

const ActiveChipsRow: React.FC<{ chips: ActiveChip[]; onReset: () => void }> = ({ chips, onReset }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {chips.map(chip => (
      <span
        key={chip.key}
        className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-lg bg-primary-500/10 border border-primary-500/15 text-[11px] text-primary-300"
      >
        <div className={`w-1.5 h-1.5 rounded-full ${chip.dot} shrink-0`} />
        <span className="truncate max-w-[140px]">{chip.label}</span>
        <button
          onClick={chip.onRemove}
          className="p-0.5 rounded hover:bg-white/10 text-primary-400/60 hover:text-primary-300 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    ))}
    {chips.length > 1 && (
      <button
        onClick={onReset}
        className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 rounded transition-colors hover:bg-white/5"
      >
        <RotateCcw className="w-2.5 h-2.5" />
        Limpiar
      </button>
    )}
  </div>
);

// ═══ Main Component ═══

export const ContactsFilter: React.FC<ContactsFilterProps> = ({
  show,
  filters,
  setFilters,
  resetFilters,
  teamMembers,
  funnelStages,
  origenOptions = [],
  viewMode = 'table'
}) => {
  const isPortfolio = viewMode === 'portfolio';
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  useEffect(() => {
    if (!show) setOpenDropdown(null);
  }, [show]);

  const toggle = useCallback((key: OpenDropdown) => {
    setOpenDropdown(prev => prev === key ? null : key);
  }, []);

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];

    if (filters.etapaEmbudoId) {
      const stage = funnelStages.find(s => s.id === filters.etapaEmbudoId);
      chips.push({
        key: 'etapa',
        label: stage?.nombre_etapa || `Etapa #${filters.etapaEmbudoId}`,
        dot: 'bg-blue-400',
        onRemove: () => setFilters({ etapaEmbudoId: null })
      });
    }

    if (filters.estado) {
      const opt = ESTADO_OPTIONS.find(o => o.value === filters.estado);
      chips.push({
        key: 'estado',
        label: opt?.label || filters.estado,
        dot: opt?.dot || 'bg-zinc-400',
        onRemove: () => setFilters({ estado: null })
      });
    }

    if (filters.calificacion) {
      const opt = CALIFICACION_OPTIONS.find(o => o.value === filters.calificacion);
      chips.push({
        key: 'calificacion',
        label: `Calif: ${opt?.label || filters.calificacion}`,
        dot: opt?.dot || 'bg-zinc-400',
        onRemove: () => setFilters({ calificacion: null })
      });
    }

    if (filters.origen) {
      chips.push({
        key: 'origen',
        label: `Origen: ${filters.origen}`,
        dot: 'bg-cyan-400',
        onRemove: () => setFilters({ origen: null })
      });
    }

    if (filters.dateRange?.from || filters.dateRange?.to) {
      let label = '';
      if (filters.dateRange.from && filters.dateRange.to) {
        label = `${formatDateShort(filters.dateRange.from)} → ${formatDateShort(filters.dateRange.to)}`;
      } else if (filters.dateRange.from) {
        label = `Desde ${formatDateShort(filters.dateRange.from)}`;
      } else {
        label = `Hasta ${formatDateShort(filters.dateRange.to!)}`;
      }
      chips.push({
        key: 'fecha',
        label,
        dot: 'bg-violet-400',
        onRemove: () => setFilters({ dateRange: { from: null, to: null } })
      });
    }

    if (filters.estadoCobranza) {
      const opt = ESTADO_COBRANZA_OPTIONS.find(o => o.value === filters.estadoCobranza);
      chips.push({
        key: 'estadoCobranza',
        label: `Cobranza: ${opt?.label || filters.estadoCobranza}`,
        dot: opt?.dot || 'bg-zinc-400',
        onRemove: () => setFilters({ estadoCobranza: null })
      });
    }

    return chips;
  }, [filters, funnelStages, setFilters]);

  const activeCount = activeChips.length;

  if (!show && activeCount === 0) return null;

  if (!show) {
    return <ActiveChipsRow chips={activeChips} onReset={resetFilters} />;
  }

  return (
    <div ref={containerRef} className="space-y-2 animate-slide-in-top">
      {/* Chip-dropdown bar */}
      <div className="flex flex-wrap items-center gap-1.5">

        {/* ── Estado Cobranza (portfolio mode only) ── */}
        {isPortfolio && (
          <div className="relative">
            <button
              onClick={() => toggle('estadoCobranza')}
              className={`${chipBase} ${filters.estadoCobranza ? chipOn : chipOff}`}
            >
              Cobranza
              {filters.estadoCobranza && (
                <>
                  <span className="text-primary-500/40">·</span>
                  <span className="text-primary-200 truncate max-w-[80px]">
                    {ESTADO_COBRANZA_OPTIONS.find(o => o.value === filters.estadoCobranza)?.label || filters.estadoCobranza}
                  </span>
                </>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'estadoCobranza' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'estadoCobranza' && (
              <div className={panelClass}>
                <DropdownOption
                  isActive={!filters.estadoCobranza}
                  label="Todos"
                  onClick={() => { setFilters({ estadoCobranza: null }); setOpenDropdown(null); }}
                />
                <div className="h-px bg-white/5 my-1" />
                {ESTADO_COBRANZA_OPTIONS.map(opt => (
                  <DropdownOption
                    key={opt.value}
                    isActive={filters.estadoCobranza === opt.value}
                    label={opt.label}
                    dot={opt.dot}
                    onClick={() => { setFilters({ estadoCobranza: opt.value }); setOpenDropdown(null); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Etapa Embudo (hidden in portfolio) ── */}
        {!isPortfolio && (
        <div className="relative">
          <button
            onClick={() => toggle('etapa')}
            className={`${chipBase} ${filters.etapaEmbudoId ? chipOn : chipOff}`}
          >
            Etapa
            {filters.etapaEmbudoId && (
              <>
                <span className="text-primary-500/40">·</span>
                <span className="text-primary-200 truncate max-w-[80px]">
                  {funnelStages.find(s => s.id === filters.etapaEmbudoId)?.nombre_etapa}
                </span>
              </>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'etapa' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'etapa' && (
            <div className={panelClass}>
              <DropdownOption
                isActive={!filters.etapaEmbudoId}
                label="Todas las etapas"
                onClick={() => { setFilters({ etapaEmbudoId: null }); setOpenDropdown(null); }}
              />
              <div className="h-px bg-white/5 my-1" />
              {funnelStages.map(stage => (
                <DropdownOption
                  key={stage.id}
                  isActive={filters.etapaEmbudoId === stage.id}
                  label={stage.nombre_etapa}
                  dot="bg-blue-400"
                  onClick={() => { setFilters({ etapaEmbudoId: stage.id }); setOpenDropdown(null); }}
                />
              ))}
            </div>
          )}
        </div>
        )}

        {/* ── Estado ── */}
        <div className="relative">
          <button
            onClick={() => toggle('estado')}
            className={`${chipBase} ${filters.estado ? chipOn : chipOff}`}
          >
            Estado
            {filters.estado && (
              <>
                <span className="text-primary-500/40">·</span>
                <span className="text-primary-200 truncate max-w-[80px]">
                  {ESTADO_OPTIONS.find(o => o.value === filters.estado)?.label || filters.estado}
                </span>
              </>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'estado' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'estado' && (
            <div className={panelClass}>
              <DropdownOption
                isActive={!filters.estado}
                label="Todos"
                onClick={() => { setFilters({ estado: null }); setOpenDropdown(null); }}
              />
              <div className="h-px bg-white/5 my-1" />
              {ESTADO_OPTIONS.map(opt => (
                <DropdownOption
                  key={opt.value}
                  isActive={filters.estado === opt.value}
                  label={opt.label}
                  dot={opt.dot}
                  onClick={() => { setFilters({ estado: opt.value }); setOpenDropdown(null); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Calificación (hidden in portfolio) ── */}
        {!isPortfolio && (
        <div className="relative">
          <button
            onClick={() => toggle('calificacion')}
            className={`${chipBase} ${filters.calificacion ? chipOn : chipOff}`}
          >
            Calificación
            {filters.calificacion && (
              <>
                <span className="text-primary-500/40">·</span>
                <span className="text-primary-200">
                  {CALIFICACION_OPTIONS.find(o => o.value === filters.calificacion)?.label || filters.calificacion}
                </span>
              </>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'calificacion' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'calificacion' && (
            <div className={panelClass}>
              <DropdownOption
                isActive={!filters.calificacion}
                label="Todas"
                onClick={() => { setFilters({ calificacion: null }); setOpenDropdown(null); }}
              />
              <div className="h-px bg-white/5 my-1" />
              {CALIFICACION_OPTIONS.map(opt => (
                <DropdownOption
                  key={opt.value}
                  isActive={filters.calificacion === opt.value}
                  label={opt.label}
                  dot={opt.dot}
                  onClick={() => { setFilters({ calificacion: opt.value }); setOpenDropdown(null); }}
                />
              ))}
            </div>
          )}
        </div>
        )}

        {/* ── Origen ── */}
        {origenOptions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => toggle('origen')}
              className={`${chipBase} ${filters.origen ? chipOn : chipOff}`}
            >
              Origen
              {filters.origen && (
                <>
                  <span className="text-primary-500/40">·</span>
                  <span className="text-primary-200 truncate max-w-[80px]">
                    {filters.origen}
                  </span>
                </>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'origen' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'origen' && (
              <div className={panelClass}>
                <DropdownOption
                  isActive={!filters.origen}
                  label="Todos los orígenes"
                  onClick={() => { setFilters({ origen: null }); setOpenDropdown(null); }}
                />
                <div className="h-px bg-white/5 my-1" />
                {origenOptions.map(opt => (
                  <DropdownOption
                    key={opt}
                    isActive={filters.origen === opt}
                    label={opt}
                    dot="bg-cyan-400"
                    onClick={() => { setFilters({ origen: opt }); setOpenDropdown(null); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Fecha ── */}
        <div className="relative">
          <button
            onClick={() => toggle('fecha')}
            className={`${chipBase} ${(filters.dateRange?.from || filters.dateRange?.to) ? chipOn : chipOff}`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Fecha
            {(filters.dateRange?.from || filters.dateRange?.to) && (
              <>
                <span className="text-primary-500/40">·</span>
                <span className="text-primary-200 truncate max-w-[100px]">
                  {filters.dateRange.from && filters.dateRange.to
                    ? `${formatDateShort(filters.dateRange.from)} → ${formatDateShort(filters.dateRange.to)}`
                    : filters.dateRange.from
                      ? `Desde ${formatDateShort(filters.dateRange.from)}`
                      : `Hasta ${formatDateShort(filters.dateRange.to!)}`
                  }
                </span>
              </>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${openDropdown === 'fecha' ? 'rotate-180' : ''}`} />
          </button>
          {openDropdown === 'fecha' && (
            <div className="absolute top-full left-0 mt-1.5 w-[260px] p-3 bg-[#131316] border border-white/10 rounded-xl shadow-2xl z-50 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block font-medium">Desde</label>
                  <input
                    type="date"
                    value={filters.dateRange?.from || ''}
                    onChange={(e) => setFilters({
                      dateRange: { ...filters.dateRange, from: e.target.value || null }
                    })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:border-primary-500/50 outline-none"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block font-medium">Hasta</label>
                  <input
                    type="date"
                    value={filters.dateRange?.to || ''}
                    onChange={(e) => setFilters({
                      dateRange: { ...filters.dateRange, to: e.target.value || null }
                    })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:border-primary-500/50 outline-none"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <button
                  onClick={() => { setFilters({ dateRange: { from: null, to: null } }); setOpenDropdown(null); }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Limpiar
                </button>
                <button
                  onClick={() => setOpenDropdown(null)}
                  className="text-[10px] text-primary-400 hover:text-primary-300 transition-colors font-medium px-2 py-1 rounded hover:bg-primary-500/10"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Reset All ── */}
        {activeCount > 0 && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors hover:bg-white/5"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Limpiar ({activeCount})</span>
          </button>
        )}
      </div>

      {/* Active filter chips (visible when filters are set) */}
      {activeCount > 0 && <ActiveChipsRow chips={activeChips} onReset={resetFilters} />}
    </div>
  );
};
