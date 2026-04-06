# Sistema de Notificaciones - Human In The Loop (HITL)

## Descripción
Sistema de notificaciones en tiempo real que permite la escalación de conversaciones de WhatsApp a asesores humanos (Human In The Loop).

## Componentes

| Componente | Descripción |
|------------|-------------|
| `NotificationButton.tsx` | Botón con badge en el header |
| `NotificationDropdown.tsx` | Panel con lista, filtros por tipo y búsqueda |
| `NotificationItem.tsx` | Item individual con templates HITL |
| `NotificationToast.tsx` | Toast stack con prioridad y sonido |

## Características v2.0

### 🔔 Toast System
- **Stack de notificaciones**: Hasta 3 toasts simultáneos
- **Filtrado por asesor_id**: Solo muestra notificaciones relevantes al usuario
- **Sonido configurable**: Web Audio API con tonos por prioridad
- **Duración por tipo**: HITL 10s, Urgente 8s, Normal 5s
- **Indicador visual de urgencia**: Borde ámbar + pulse para HITL

### 💬 Human in the Loop (HITL)
- **Templates de respuesta rápida**: 4 respuestas predefinidas
- **Mejora con IA**: Botón "Mejorar" con Gemini
- **Ventana 24h**: Indicador visual del tiempo restante
- **Validación de contacto**: Verifica `contacto_id` antes de navegar

### 📊 Centro de Actividad
- **Filtro por tipo**: Dropdown con categorías principales
- **Filtros combinables**: Estado + Tipo simultáneamente
- **Búsqueda local**: En notificaciones cargadas
- **Infinite scroll**: Con prefetch

## Tipos de Notificación

| Tipo | Icono | Descripción |
|------|-------|-------------|
| `human_in_the_loop` | 👤 Amber | Requiere intervención humana en WhatsApp |
| `mensaje_urgente` | ⚠️ Red | Mensaje marcado como urgente |
| `nueva_cita` | 📅 Blue | Nueva cita agendada |
| `tarea_asignada` | 👥 Purple | Tarea asignada al usuario |
| `tarea_vencida` | ⏰ Rose | Tarea pasada de fecha límite |
| `deep_research` | 🔍 Violet | Investigación profunda completada |
| `recordatorio` | 🔔 Cyan | Recordatorio programado |
| `sistema` | ℹ️ Zinc | Notificación del sistema |

## Store (`notificationsStore.ts`)

### Selectores
```typescript
selectNotifications(state)  // Notification[]
selectUnreadCount(state)    // number
selectStats(state)          // NotificationStats
selectToastQueue(state)     // Notification[]
selectSoundEnabled(state)   // boolean
```

### Acciones Principales
```typescript
fetchNotifications(forceRefresh?)
addToToastQueue(notification)
removeFromToastQueue(notificationId)
setSoundEnabled(enabled)
getTeamData() // Cached team_humano info
```

## SQL Schema

Ejecutar `scripts/NOTIFICATIONS_SCHEMA.sql` para:
- Índices optimizados para queries comunes
- RLS policies para seguridad multi-tenant
- Función `get_notification_stats()` para stats en 1 query
- Vista `vw_notificaciones_con_contacto`

## Archivos Relacionados

- `lib/notification-sound.ts` - Servicio de sonidos
- `types/notification.ts` - Tipos y helpers
- `hooks/useNotifications.ts` - Hook de inicialización
- `hooks/useStartupNotifications.ts` - Notificaciones automáticas al inicio

## Flujo HITL

```
1. Agente IA detecta consulta compleja
         │
         ▼
2. Crea notificación tipo 'human_in_the_loop'
         │
         ▼
3. Asesor recibe alerta (Realtime)
         │
         ▼
4. Asesor escribe respuesta
         │
         ├──[Opcional]── Botón "Mejorar" → Gemini AI
         │
         ▼
5. Asesor envía respuesta
         │
         ├── Guarda mensaje en wp_mensajes
         ├── Envía a webhook n8n
         └── Actualiza notificación como respondida
         │
         ▼
6. n8n envía mensaje al cliente por WhatsApp
```

## Webhook de Envío

**URL**: `https://n8n.urpeailab.com/webhook/dd09c8a8-ba99-48ab-mensajes`

**Headers**:
```json
{
  "Content-Type": "application/json",
  "X-Urpe-Auth": "urpe-secure-chat-2024"
}
```

**Body**:
```json
{
  "message_id": 123456,
  "content": "Texto del mensaje",
  "metadata": {
    "enviado_por": "humano",
    "team_humano_id": 70,
    "team_humano_nombre": "Anthony Alarcon",
    "empresa_id": 13,
    "contacto_id": 78247,
    "conversacion_id": 33824,
    "timestamp_envio": "2025-01-07T20:00:00.000Z",
    "webhook_destino": "dd09c8a8-ba99-48ab-mensajes",
    "ventana_24h": true,
    "contacto_telefono": "573197338787"
  },
  "contact": { /* datos completos del contacto */ }
}
```

## API Endpoints

### `POST /api/improve-message`
Mejora la redacción de un mensaje usando Gemini AI con contexto 360 del contacto.

**Request**:
```json
{
  "message": "Texto a mejorar",
  "contactId": 78247,
  "enterpriseId": 13
}
```

**Response**:
```json
{
  "success": true,
  "original": "Texto original",
  "improved": "Texto mejorado por IA"
}
```

## Store Actions

### `notificationsStore.ts`

| Action | Descripción |
|--------|-------------|
| `respondToNotification` | Actualiza respuesta en DB (simple) |
| `respondToNotificationWithMessage` | **HITL**: Guarda mensaje + envía webhook + actualiza notificación |

## Ventana de 24 Horas

WhatsApp requiere que los mensajes proactivos se envíen dentro de las 24 horas siguientes a la última interacción del cliente.

El sistema verifica `notification.metadata.ultima_interaccion` para:
- Mostrar el tiempo restante de la ventana
- Bloquear el envío si la ventana está cerrada

## Tabla: `wp_notificaciones_team`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL | ID único |
| `tipo` | TEXT | `human_in_the_loop`, `nueva_cita`, etc. |
| `contacto_id` | INT | FK a wp_contactos |
| `mensaje` | TEXT | Contenido de la notificación |
| `requiere_respuesta` | BOOLEAN | Si necesita intervención |
| `respuesta` | TEXT | Respuesta del asesor |
| `fecha_respuesta` | TIMESTAMPTZ | Cuándo se respondió |
| `metadata` | JSONB | Datos adicionales (conversacion_id, ultima_interaccion) |

## Consideraciones de Seguridad

- Las notificaciones se filtran por `empresa_id` y `asesor_id`
- El header `X-Urpe-Auth` autentica las llamadas al webhook
- Los mensajes se guardan con metadata completa para auditoría
