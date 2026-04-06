# 🔔 Alerts API

> Sistema de alertas y notificaciones

---

## Endpoints

```
GET  /api/alerts
POST /api/alerts
```

---

## GET /api/alerts

Obtener alertas pendientes para el usuario actual.

### Request
```
GET /api/alerts?enterpriseId=1&limit=10
```

### Query Parameters
| Param | Tipo | Descripción |
|-------|------|-------------|
| `enterpriseId` | number | ID de la empresa |
| `limit` | number | Máximo de alertas (default: 20) |
| `unreadOnly` | boolean | Solo no leídas (default: true) |

### Response
```json
{
  "data": {
    "alerts": [
      {
        "id": 1,
        "tipo": "cita_proxima",
        "mensaje": "Cita con Juan Pérez en 30 minutos",
        "contacto_id": 123,
        "visto": false,
        "created_at": "2024-12-28T10:00:00Z"
      }
    ],
    "unreadCount": 5
  }
}
```

---

## POST /api/alerts

Crear una nueva alerta.

### Request Body
```typescript
interface CreateAlertRequest {
  tipo: AlertType;
  mensaje: string;
  contacto_id?: number;
  asesor_id?: number;      // null = broadcast
  empresa_id: number;
  requiere_respuesta?: boolean;
}

type AlertType = 
  | 'cita_proxima'
  | 'mensaje_nuevo'
  | 'tarea_vencida'
  | 'contacto_transferido'
  | 'sistema';
```

### Ejemplo
```json
{
  "tipo": "contacto_transferido",
  "mensaje": "Se te ha asignado el contacto María García",
  "contacto_id": 456,
  "asesor_id": 5,
  "empresa_id": 1
}
```

### Response
```json
{
  "data": {
    "id": 42,
    "created_at": "2024-12-28T10:30:00Z"
  }
}
```

---

## Tipos de Alerta

| Tipo | Descripción | Icono |
|------|-------------|-------|
| `cita_proxima` | Recordatorio de cita | Calendar |
| `mensaje_nuevo` | Mensaje de contacto | MessageSquare |
| `tarea_vencida` | Tarea por vencer | Clock |
| `contacto_transferido` | Contacto asignado | UserPlus |
| `sistema` | Notificación del sistema | Bell |

---

## Marcar como Leída

```
PATCH /api/alerts/:id
```

### Body
```json
{
  "visto": true
}
```

---

## Tabla: wp_notificaciones_team

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | PK |
| `tipo` | text | Tipo de alerta |
| `mensaje` | text | Contenido |
| `contacto_id` | bigint | FK → wp_contactos |
| `asesor_id` | bigint | FK → wp_team_humano (null=broadcast) |
| `empresa_id` | bigint | FK → wp_empresa_perfil |
| `visto` | boolean | Estado de lectura |
| `requiere_respuesta` | boolean | Si necesita respuesta |
| `respuesta` | text | Respuesta del usuario |
| `created_at` | timestamptz | Timestamp |
