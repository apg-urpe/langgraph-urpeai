# Módulo de Calendario - Componentes

## Componentes

### CalendarView.tsx
Vista principal del calendario con modos día/semana y columnas por miembro del equipo.

### AssignContactToAppointmentModal.tsx
Modal para asignar un contacto a citas que no tienen `contacto_id`.

## Funcionalidad: Asignar Contacto a Cita

### Problema
Las citas registradas sin un contacto asignado (`contacto_id = null`) no permiten navegar al detalle del contacto.

### Solución
Cuando se hace click en una cita sin contacto:
1. Se abre el modal `AssignContactToAppointmentModal`
2. El usuario puede buscar contactos por nombre, teléfono o email
3. Al seleccionar un contacto y confirmar, se actualiza la cita con el `contacto_id`

### Indicadores Visuales
- **Vista Semana (Compacta)**: Las citas sin contacto muestran "Sin contacto" en color ámbar con icono de usuario
- **Vista Día (Estándar)**: Las citas sin contacto muestran un badge ámbar con "Click para asignar contacto"

### Store Action
```typescript
updateAppointmentContact(appointmentId: number | string, contactId: number): Promise<boolean>
```

- Actualiza `wp_citas.contacto_id` en Supabase
- Aplica actualización optimista en el estado local
- Respeta el modo observación (bloquea escrituras)
- Retorna `true` si la asignación fue exitosa

### Flujo de Datos
```
1. Click en cita sin contacto
   ↓
2. setAppointmentToAssign(apt)
   ↓
3. AssignContactToAppointmentModal se muestra
   ↓
4. Usuario busca y selecciona contacto
   ↓
5. updateAppointmentContact(apt.id, contactId)
   ↓
6. Actualización en Supabase + Estado local
   ↓
7. fetchEnterpriseAppointments() para refresh
```

### Archivos Relacionados
- `components/admin/CalendarView.tsx` - Vista principal
- `components/admin/calendar/AssignContactToAppointmentModal.tsx` - Modal de asignación
- `store/contactStore.ts` - Acción `updateAppointmentContact`
- `types/contact.ts` - Tipo `Appointment`
