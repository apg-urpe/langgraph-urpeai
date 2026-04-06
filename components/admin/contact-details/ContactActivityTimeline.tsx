'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  History, 
  User, 
  Calendar, 
  StickyNote, 
  CheckSquare, 
  Mail, 
  Megaphone, 
  Settings, 
  MessageSquare,
  ChevronDown,
  ArrowRight,
  Loader2,
  UserPlus,
  UserMinus,
  Pause,
  Play,
  Edit3,
  Trash2
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { logger } from '@/lib/logger';

interface ContactActivityTimelineProps {
  contactId: number;
  empresaId?: number | null;
}

interface ActivityEntry {
  id: number;
  tipo: string;
  accion: string;
  descripcion?: string | null;
  agente_id?: number | null;
  empresa_id?: number | null;
  contacto_id?: number | null;
  entidad_tipo?: string | null;
  entidad_id?: string | null;
  datos_antes?: Record<string, unknown> | null;
  datos_despues?: Record<string, unknown> | null;
  usuario_id?: string | null;
  fecha_creacion: string;
  // Enriched
  _actorName?: string;
  _actorInitials?: string;
}

// ── Color & icon mapping by tipo ──
const TIPO_CONFIG: Record<string, { color: string; dotColor: string; icon: React.ElementType }> = {
  contacto:     { color: 'text-blue-400',    dotColor: 'bg-blue-500',    icon: User },
  cita:         { color: 'text-emerald-400', dotColor: 'bg-emerald-500', icon: Calendar },
  tarea:        { color: 'text-amber-400',   dotColor: 'bg-amber-500',   icon: CheckSquare },
  nota:         { color: 'text-indigo-400',  dotColor: 'bg-indigo-500',  icon: StickyNote },
  email:        { color: 'text-violet-400',  dotColor: 'bg-violet-500',  icon: Mail },
  campana:      { color: 'text-pink-400',    dotColor: 'bg-pink-500',    icon: Megaphone },
  conversacion: { color: 'text-cyan-400',    dotColor: 'bg-cyan-500',    icon: MessageSquare },
  admin:        { color: 'text-orange-400',  dotColor: 'bg-orange-500',  icon: Settings },
  sistema:      { color: 'text-zinc-400',    dotColor: 'bg-zinc-500',    icon: Settings },
  auth:         { color: 'text-zinc-400',    dotColor: 'bg-zinc-500',    icon: User },
};

const ACCION_ICONS: Record<string, React.ElementType> = {
  crear: UserPlus,
  eliminar: Trash2,
  actualizar: Edit3,
};

const PAGE_SIZE = 50;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin}m`;
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ── Human-readable field labels ──
const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  email: 'Email',
  telefono: 'Teléfono',
  estado: 'Estado',
  es_calificado: 'Calificación',
  etapa_emocional: 'Sentimiento',
  etapa_embudo: 'Etapa de embudo',
  team_humano_id: 'Responsable',
  is_active: 'Activo',
  paused_until: 'Pausado hasta',
  origen: 'Origen',
};

function renderDiff(antes: Record<string, unknown> | null | undefined, despues: Record<string, unknown> | null | undefined): React.ReactNode {
  if (!antes && !despues) return null;

  const allKeys = new Set([
    ...Object.keys(antes || {}),
    ...Object.keys(despues || {})
  ]);

  const diffs: React.ReactNode[] = [];

  allKeys.forEach(key => {
    const oldVal = antes?.[key];
    const newVal = despues?.[key];

    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return;

    const label = FIELD_LABELS[key] || key;
    const formatVal = (v: unknown) => {
      if (v === null || v === undefined) return '—';
      if (typeof v === 'boolean') return v ? 'Sí' : 'No';
      return String(v);
    };

    diffs.push(
      <div key={key} className="flex items-center gap-1.5 text-[11px] flex-wrap">
        <span className="text-zinc-500 font-medium">{label}:</span>
        {oldVal !== undefined && (
          <span className="text-zinc-500 line-through">{formatVal(oldVal)}</span>
        )}
        {oldVal !== undefined && newVal !== undefined && (
          <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
        )}
        {newVal !== undefined && (
          <span className="text-zinc-300">{formatVal(newVal)}</span>
        )}
      </div>
    );
  });

  if (diffs.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-0.5 pl-1 border-l-2 border-white/5 ml-0.5">
      {diffs}
    </div>
  );
}

function getActionIcon(accion: string): React.ElementType | null {
  if (accion.includes('pausa') || accion.includes('desactiv')) return Pause;
  if (accion.includes('reactiv')) return Play;
  return ACCION_ICONS[accion] || null;
}

export const ContactActivityTimeline: React.FC<ContactActivityTimelineProps> = ({ contactId, empresaId }) => {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async (offset = 0, append = false) => {
    if (!empresaId) {
      setIsLoading(false);
      return;
    }

    try {
      if (offset === 0) setIsLoading(true);
      else setIsLoadingMore(true);

      // 1. Fetch activities
      const { data: rawActivities, error: fetchError } = await supabase
        .from('wp_actividades_log')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('contacto_id', contactId)
        .order('fecha_creacion', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (fetchError) {
        logger.error('[ContactActivityTimeline] Error fetching activities:', fetchError);
        setError('Error al cargar el historial');
        return;
      }

      const entries = (rawActivities || []) as ActivityEntry[];
      setHasMore(entries.length === PAGE_SIZE);

      // 2. Resolve actor names — collect unique usuario_ids
      const uniqueUserIds = [...new Set(
        entries.map(e => e.usuario_id).filter(Boolean) as string[]
      )];

      let actorMap = new Map<string, { nombre: string; apellido: string }>();

      if (uniqueUserIds.length > 0) {
        const { data: teamData, error: teamError } = await supabase
          .from('wp_team_humano')
          .select('auth_uid, nombre, apellido')
          .in('auth_uid', uniqueUserIds);

        if (!teamError && teamData) {
          teamData.forEach((m: any) => {
            if (m.auth_uid) {
              actorMap.set(m.auth_uid, { nombre: m.nombre || '', apellido: m.apellido || '' });
            }
          });
        }
      }

      // 3. Enrich entries
      const enriched = entries.map(entry => {
        const actor = entry.usuario_id ? actorMap.get(entry.usuario_id) : null;
        const fullName = actor ? `${actor.nombre} ${actor.apellido}`.trim() : null;
        return {
          ...entry,
          _actorName: fullName || 'Sistema',
          _actorInitials: fullName ? getInitials(fullName) : 'S',
        };
      });

      if (append) {
        setActivities(prev => [...prev, ...enriched]);
      } else {
        setActivities(enriched);
      }

      setError(null);
    } catch (err) {
      logger.error('[ContactActivityTimeline] Exception:', err);
      setError('Error inesperado al cargar historial');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [contactId, empresaId]);

  useEffect(() => {
    fetchActivities(0, false);
  }, [fetchActivities]);

  const handleLoadMore = () => {
    fetchActivities(activities.length, true);
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin mb-3 text-primary-400/50" />
        <span className="text-sm animate-pulse">Cargando historial...</span>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <History className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => fetchActivities(0, false)}
          className="mt-3 text-xs text-primary-400 hover:text-primary-300 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Empty state ──
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <History className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">No hay actividad registrada para este contacto</p>
        <p className="text-xs text-zinc-600 mt-1">Las acciones futuras aparecerán aquí</p>
      </div>
    );
  }

  // ── Timeline ──
  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-medium text-zinc-400">
          Historial de actividad
        </h3>
        <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded-full">
          {activities.length}{hasMore ? '+' : ''} eventos
        </span>
      </div>

      {/* Timeline */}
      <div className="relative border-l border-white/10 ml-3 space-y-5">
        {activities.map((entry) => (
          <TimelineItem key={entry.id} entry={entry} />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 hover:bg-zinc-800/50 border border-white/5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            Cargar más
          </button>
        </div>
      )}
    </div>
  );
};

// ── Individual timeline item ──
const TimelineItem: React.FC<{ entry: ActivityEntry }> = ({ entry }) => {
  const config = TIPO_CONFIG[entry.tipo] || TIPO_CONFIG.sistema;
  const Icon = config.icon;
  const ActionIcon = getActionIcon(entry.accion);

  return (
    <div className="relative pl-6">
      {/* Dot */}
      <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0c0e] ${config.dotColor}`} />

      <div className="flex flex-col gap-0.5">
        {/* Actor + timestamp */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mini avatar */}
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
            entry._actorName === 'Sistema' 
              ? 'bg-zinc-800 border-zinc-700 text-zinc-400' 
              : 'bg-primary-500/10 border-primary-500/20 text-primary-400'
          }`}>
            {entry._actorInitials}
          </div>
          <span className="text-sm text-zinc-200 font-medium">
            {entry._actorName}
          </span>
          <span className="text-[11px] text-zinc-600" title={formatFullDate(entry.fecha_creacion)}>
            {formatRelativeDate(entry.fecha_creacion)}
          </span>
        </div>

        {/* Description */}
        <div className="flex items-start gap-1.5 mt-0.5">
          <div className={`mt-0.5 shrink-0 ${config.color}`}>
            {ActionIcon ? <ActionIcon className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
          </div>
          <p className="text-sm text-zinc-400">
            {entry.descripcion || `${entry.tipo}.${entry.accion}`}
          </p>
        </div>

        {/* Diff */}
        {renderDiff(entry.datos_antes, entry.datos_despues)}
      </div>
    </div>
  );
};
