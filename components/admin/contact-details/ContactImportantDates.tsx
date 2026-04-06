import React, { useMemo } from 'react';
import { 
  CalendarDays, 
  RefreshCw, 
  MessageSquare, 
  Calendar, 
  StickyNote,
  Clock
} from 'lucide-react';

interface ContactDate {
  label: string;
  value: string | null;
  icon: React.ElementType;
  color: string;
}

interface ContactImportantDatesProps {
  contact: any;
  appointments?: any[];
  notes?: any[];
}

const formatShortDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;

  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

export const ContactImportantDates: React.FC<ContactImportantDatesProps> = React.memo(({ 
  contact, 
  appointments = [], 
  notes = [] 
}) => {
  const importantDates = useMemo(() => {
    if (!contact) return [];
    
    const dates: ContactDate[] = [];
    const appointmentsWithDate = appointments
      .filter(appointment => appointment?.fecha_hora)
      .sort((a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime());

    const upcomingAppointment = appointments
      .filter(appointment => appointment?.fecha_hora && new Date(appointment.fecha_hora) > new Date())
      .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())[0];

    const latestUpdatedAppointment = [...appointments]
      .filter(appointment => appointment?.updated_at)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

    const latestSyncedAppointment = [...appointments]
      .filter(appointment => appointment?.ultima_sincronizacion)
      .sort((a, b) => new Date(b.ultima_sincronizacion).getTime() - new Date(a.ultima_sincronizacion).getTime())[0];
    
    // Fecha de creación
    dates.push({
      label: 'Creado',
      value: formatShortDate(contact.created_at),
      icon: CalendarDays,
      color: 'text-zinc-400'
    });
    
    // Última actualización
    if (contact.updated_at && contact.updated_at !== contact.created_at) {
      dates.push({
        label: 'Actualizado',
        value: formatShortDate(contact.updated_at),
        icon: RefreshCw,
        color: 'text-blue-400'
      });
    }

    // Fechas operativas de citas
    if (upcomingAppointment?.fecha_hora) {
      dates.push({
        label: 'Próxima cita',
        value: new Date(upcomingAppointment.fecha_hora).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        icon: Calendar,
        color: 'text-primary-400'
      });
    } else if (appointmentsWithDate[0]?.fecha_hora) {
      dates.push({
        label: 'Última cita',
        value: new Date(appointmentsWithDate[0].fecha_hora).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        icon: Calendar,
        color: 'text-primary-400'
      });
    }

    if (latestUpdatedAppointment?.updated_at) {
      dates.push({
        label: 'Cita actualizada',
        value: formatRelativeTime(latestUpdatedAppointment.updated_at) || formatShortDate(latestUpdatedAppointment.updated_at),
        icon: RefreshCw,
        color: 'text-cyan-400'
      });
    }

    if (latestSyncedAppointment?.ultima_sincronizacion) {
      dates.push({
        label: 'Última sincronización',
        value: formatRelativeTime(latestSyncedAppointment.ultima_sincronizacion) || formatShortDate(latestSyncedAppointment.ultima_sincronizacion),
        icon: Clock,
        color: 'text-emerald-400'
      });
    }
    
    // Última interacción
    if (contact.ultima_interaccion) {
      const lastInteraction = new Date(contact.ultima_interaccion);
      dates.push({
        label: 'Última interacción',
        value: formatRelativeTime(contact.ultima_interaccion) || lastInteraction.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        icon: MessageSquare,
        color: 'text-emerald-400'
      });
    }
    
    // Última nota
    const lastNote = notes?.[0];
    if (lastNote?.created_at) {
      const noteDate = new Date(lastNote.created_at);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - noteDate.getTime()) / (1000 * 60 * 60 * 24));
      let relativeTime = '';
      if (diffDays === 0) relativeTime = 'Hoy';
      else if (diffDays === 1) relativeTime = 'Ayer';
      else if (diffDays < 7) relativeTime = `Hace ${diffDays} días`;
      else relativeTime = noteDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      
      dates.push({
        label: 'Última nota',
        value: relativeTime,
        icon: StickyNote,
        color: 'text-amber-400'
      });
    }
    
    return dates;
  }, [contact, appointments, notes]);

  if (importantDates.length === 0) return null;

  return (
    <div className="space-y-2 md:space-y-3">
      <h3 className="text-[10px] md:text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
        <Clock className="w-3 h-3" />
        Fechas Importantes
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
        {importantDates.map((date, i) => {
          const Icon = date.icon;
          return (
            <div key={i} className="flex items-center gap-2 p-2 rounded bg-zinc-900/30 border border-white/5">
              <Icon className={`w-3.5 h-3.5 ${date.color} shrink-0`} />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-zinc-500 block">{date.label}</span>
                <span className={`text-xs font-medium ${date.value ? date.color : 'text-zinc-600'}`}>
                  {date.value || '-'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ContactImportantDates.displayName = 'ContactImportantDates';
