# 📅 Módulo: Calendario

> Gestión de citas y eventos del equipo

---

## 🎯 Propósito

El módulo de Calendario proporciona:
- **Vista de agenda**: Citas del equipo por día/semana/mes
- **Gestión de citas**: Crear, editar, cancelar eventos
- **Integración con contactos**: Citas vinculadas a leads/clientes
- **Filtrado por equipo**: Ver citas de miembros específicos

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `CalendarView.tsx` | `/components/admin/` | Vista principal |
| `AppointmentModal.tsx` | `/components/admin/` | Crear/editar cita |
| `ContactAppointments.tsx` | `/components/admin/contact-details/` | Citas de un contacto |

---

## 💾 Modelo de Datos

### wp_citas
```typescript
interface Appointment {
  id: number;
  empresa_id: number;
  contacto_id: number | null;
  team_humano_id: number | null;
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string;  // timestamptz
  fecha_fin: string;     // timestamptz
  estado: 'programada' | 'confirmada' | 'cancelada' | 'completada';
  tipo: 'llamada' | 'videollamada' | 'presencial';
  ubicacion: string | null;
  metadata: Record<string, any>;
  created_at: string;
}
```

---

## 🎨 Vistas del Calendario

### Vista Mensual
- Grid de días con indicadores de citas
- Click en día para ver detalle
- Colores por tipo de cita

### Vista Semanal
- Timeline por horas
- Drag & drop para reagendar
- Vista lado a lado de múltiples agentes

### Vista Diaria (Columnas por Equipo)
- **Columnas por miembro del equipo**: Cada asesor activo tiene su propia columna
- **Integración con filtro global**: Si hay un miembro filtrado, solo muestra esa columna
- **Columna "Sin asignar"**: Para citas sin asesor asignado
- **Timeline por horas**: Grid de 8:00 a 20:00
- **Click en cita**: Abre detalle del contacto
- **Click en celda vacía**: Abre modal de nueva cita con fecha/hora/miembro preseleccionado (estilo Google Calendar)

### Crear Nueva Cita
- **Botón "+" en toolbar**: Abre modal de nueva cita (alineado a la derecha junto a Día/Semana/Recargar)
- **Click en slot vacío**: Pre-rellena fecha, hora y miembro del equipo según la celda clickeada
- **QuickScheduleModal**: Modal reutilizable con props opcionales para valores iniciales

```typescript
// Props del QuickScheduleModal
interface QuickScheduleModalProps {
  onClose: () => void;
  initialDate?: string;        // YYYY-MM-DD
  initialStartTime?: string;   // HH:MM
  initialEndTime?: string;     // HH:MM
  initialTeamMemberId?: number;
}
```

```typescript
// Lógica de columnas
const dayViewMembers = useMemo(() => {
  const activeMembers = teamMembers.filter(m => m.is_active);
  
  // Si hay filtro global, mostrar solo esa columna
  if (globalTeamMemberId) {
    return activeMembers.filter(m => m.id === globalTeamMemberId);
  }
  
  return activeMembers;
}, [teamMembers, globalTeamMemberId]);
```

---

## 🔄 Flujo de Datos

### Store: `contactStore.ts`

```typescript
// Estado
appointments: Appointment[];
selectedDate: Date;
calendarView: 'month' | 'week' | 'day';

// Acciones
fetchEnterpriseAppointments(enterpriseId, dateRange)
createAppointment(appointment)
updateAppointment(appointmentId, updates)
cancelAppointment(appointmentId)
```

---

## 🔗 Integración con Filtro Global

El calendario respeta el filtro global de equipo:

```typescript
const teamMemberId = useAdminStore(selectGlobalTeamMemberId);

// Si hay filtro activo, solo muestra citas de ese miembro
fetchEnterpriseAppointments(enterpriseId, {
  teamMemberId: teamMemberId || undefined
});
```

---

## 📊 Estados de Cita

| Estado | Color | Descripción |
|--------|-------|-------------|
| `programada` | Azul | Pendiente de confirmar |
| `confirmada` | Verde | Confirmada por el contacto |
| `cancelada` | Rojo | Cancelada |
| `completada` | Gris | Finalizada |

---

## 🔌 Integración Nylas

Para sincronización con calendarios externos:

```typescript
// Configuración en integraciones
{
  provider: 'nylas',
  calendarId: 'xxxxx',
  syncEnabled: true
}
```

Ver [Documentación de Nylas](../../integrations/nylas.md) para más detalles.

---

## 📚 Documentación Relacionada

- [Integración Nylas](../../integrations/nylas.md)
- [Contactos](../contacts/README.md)
- [Equipo](../team/README.md)
