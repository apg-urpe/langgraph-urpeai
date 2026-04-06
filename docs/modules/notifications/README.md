# 🔔 Centro de Actividad (Notificaciones + Novedades)

> Sistema unificado de notificaciones en tiempo real y changelog para el equipo.

---

## 🗺️ Vista General

El **Centro de Actividad** unifica las notificaciones del sistema y las novedades (changelog) en una sola interfaz, reduciendo la carga cognitiva del usuario al consolidar elementos de la pantalla.

### Características Principales
- **Interfaz Unificada**: Un solo botón y dropdown con tabs para Notificaciones y Novedades.
- **Tiempo Real**: Actualización instantánea mediante Supabase Realtime.
- **Estados**: Seguimiento de lectura (`visto`) y respuesta (`respondida`).
- **Interactividad**: Posibilidad de responder notificaciones que lo requieran.
- **Filtrado**: Por estado (no leídas), tipo o requerimiento de respuesta.
- **Contexto**: Enlaces directos a contactos o tareas relacionadas.
- **Changelog Integrado**: Visualización de actualizaciones de la plataforma sin salir del flujo.

---

## 🏗️ Arquitectura

### Base de Datos (`wp_notificaciones_team`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | Identificador único |
| `empresa_id` | bigint | Multi-tenancy |
| `asesor_id` | bigint | Destinatario específico (NULL = broadcast a equipo) |
| `tipo` | varchar | Tipo de evento (ver abajo) |
| `mensaje` | text | Contenido de la notificación |
| `visto` | boolean | Estado de lectura |
| `requiere_respuesta` | boolean | Si necesita acción del usuario |
| `respuesta` | text | Texto de la respuesta del usuario |
| `fecha_envio` | timestamptz | Cuándo se generó |
| `contacto_id` | bigint | Contexto opcional (Link al contacto) |

### Tipos de Notificación
- `nueva_cita`: Citas programadas.
- `human_in_the_loop`: Solicitud de intervención humana.
- `mensaje_urgente`: Mensajes de alta prioridad.
- `tarea_asignada`: Nuevas tareas.
- `recordatorio`: Alertas de tiempo.
- `sistema`: Notificaciones generales del sistema.
- `deep_research`: Estado de investigaciones profundas.

---

## 📦 Componentes UI

### 1. NotificationButton
- **Ubicación**: Header del `AdminPanel`.
- **Función**: Muestra icono de campana con badge combinado:
  - Badge rojo con contador: notificaciones no leídas.
  - Punto azul pulsante: nuevas novedades del changelog (si no hay notificaciones).
- **Props**: `hasNewChangelog` para indicar actualizaciones del changelog.
- **Title**: "Centro de Actividad".

### 2. NotificationDropdown
- **Ubicación**: Flotante bajo el botón (Portal).
- **Estructura con Tabs**:
  - **Tab "Notificaciones"**: Lista con filtros (Todas, No leídas, Requieren respuesta), búsqueda y acción "Marcar todas como leídas".
  - **Tab "Novedades"**: Lista de actualizaciones parseadas del `CHANGELOG.md`.
- **Props**:
  - `initialTab`: Tab inicial (`'notifications'` | `'changelog'`).
  - `onChangelogViewed`: Callback cuando se visualiza el changelog.
- **Responsive**: Modal completo en móviles, dropdown en desktop.

### 3. NotificationItem
- **Función**: Tarjeta individual de notificación.
- **Interactividad**:
  - Clic para marcar como leída.
  - Input de texto para responder (si `requiere_respuesta`).
  - Navegación al contacto relacionado.

---

## 💾 Estado (Store)

**Archivo**: `store/notificationsStore.ts`

### Estado Principal
```typescript
interface NotificationsState {
  notifications: Notification[];
  stats: {
    total: number;
    unread: number;
    requiresResponse: number;
  };
  filters: NotificationFilters;
}
```

### Acciones Clave
- `fetchNotifications()`: Carga paginada con filtros.
- `markAsRead(id)`: Marca local y remota.
- `respondToNotification(id, respuesta)`: Guarda respuesta y actualiza estado.
- `subscribeToNotifications()`: Conexión a canal Realtime de Supabase.

---

## 🔄 Flujo de Datos

1. **Inicialización**: Al cargar `AdminPanel`, se suscribe a cambios en `wp_notificaciones_team` para la empresa actual.
2. **Recepción**:
   - **Realtime**: `INSERT` dispara actualización del store y muestra Toast (opcional).
   - **Polling**: `fetchNotifications` se llama al abrir el dropdown.
3. **Changelog**: Se carga y parsea `CHANGELOG.md` al abrir el dropdown.
4. **Interacción**:
   - Usuario abre dropdown → `visto` no cambia automáticamente.
   - Usuario hace clic o "Marcar leídas" → Update a DB + Optimistic UI update.
   - Usuario responde → Update `respuesta` + `estado='respondida'` en DB.
   - Usuario cambia a tab "Novedades" → `markChangelogAsViewed()` actualiza `localStorage`.

---

## 🛠️ Uso para Desarrolladores

### Crear una Notificación
```typescript
const createNotification = useNotificationsStore.getState().createNotification;

await createNotification({
  tipo: 'sistema',
  mensaje: 'El proceso ha finalizado correctamente',
  asesor_id: 123, // Opcional, omitir para todos
  requiere_respuesta: false
});
```

### Integrar el Botón Unificado
```tsx
import { NotificationButton } from '../notifications/NotificationButton';
import { NotificationDropdown } from '../notifications/NotificationDropdown';

// En tu componente:
const [isOpen, setIsOpen] = useState(false);
const [hasNewChangelog, setHasNewChangelog] = useState(false);

<NotificationButton 
  onClick={() => setIsOpen(!isOpen)}
  isActive={isOpen}
  hasNewChangelog={hasNewChangelog}
/>
<NotificationDropdown 
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onChangelogViewed={() => setHasNewChangelog(false)}
/>
```

---

## 📝 Notas de Diseño

### Decisión: Unificación
Se unificaron Notificaciones y Novedades en un solo componente para:
- Reducir la cantidad de elementos en el header del AdminPanel.
- Disminuir la carga cognitiva del usuario.
- Agrupar información "de sistema" en un solo punto de acceso.

### Ubicación Única
El **Centro de Actividad** (Notificaciones + Novedades) está disponible **exclusivamente** en el header del AdminPanel. Esta centralización simplifica la interfaz y garantiza una experiencia consistente.

---

## 🚀 Notificaciones Automáticas al Inicio

### Hook: `useStartupNotifications`

**Archivo**: `hooks/useStartupNotifications.ts`

Sistema que genera notificaciones automáticas al entrar a la app, con un **delay de 3 segundos** para no afectar el tiempo de carga inicial.

### Verificaciones Automáticas

| Tipo | Condición | Notificación Generada |
|------|-----------|----------------------|
| **Citas próximas** | En las próximas 24h | `nueva_cita` con urgencia según tiempo restante |
| **Tareas vencidas** | `fecha_vencimiento < ahora` | `tarea_vencida` |
| **Tareas por vencer** | Vencen en las próximas 24h | `tarea_vencimiento_proximo` |

### Prevención de Duplicados

- **Citas**: No se notifica si ya existe notificación para esa cita en las últimas 12 horas.
- **Tareas**: No se notifica si ya existe notificación para esa tarea en las últimas 6 horas.
- Se guarda `metadata.cita_id` o `metadata.tarea_id` para identificar duplicados.

### Configuración

```typescript
// hooks/useStartupNotifications.ts
const STARTUP_DELAY_MS = 3000;      // Delay antes de verificar (3s)
const UPCOMING_HOURS = 24;          // Ventana de citas/tareas próximas
const NOTIFY_BEFORE_HOURS = 2;      // Citas en <2h se marcan como urgentes
```

### Mensajes Generados

**Citas urgentes (< 2h)**:
```
⏰ Cita próxima en 1 hora: "Consulta inicial" con Juan Pérez
```

**Citas normales**:
```
📅 Recordatorio: Tienes una cita en 5 horas - "Seguimiento" con María López
```

**Tareas vencidas**:
```
⚠️ Tarea vencida hace 3h: "Enviar propuesta" 🔴 Urgente
```

**Tareas por vencer**:
```
⏳ Tarea vence en 4 horas: "Revisar contrato" 🟠 Alta
```

### Uso

El hook se integra automáticamente en `app/page.tsx`:

```tsx
// app/page.tsx
import { useStartupNotifications } from '@/hooks/useStartupNotifications';

// Dentro del componente:
useStartupNotifications(); // Se ejecuta 3s después del login
```

### Comportamiento

1. Se ejecuta **una sola vez por sesión** (`hasRun.current`).
2. Espera a que existan `userId` y `selectedEnterpriseId`.
3. Después de 3 segundos, consulta citas y tareas en paralelo.
4. Filtra duplicados por `metadata` en notificaciones recientes.
5. Crea notificaciones para el usuario actual (`asesor_id = teamHumanoId`).
6. Llama a `fetchNotifications(true)` para actualizar el Centro de Actividad.
