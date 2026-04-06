# 🔌 API Reference

> Documentación de endpoints de Urpe AI Lab

---

## 📋 Endpoints Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/chat` | POST | Chat principal con IA |
| `/api/alerts` | GET/POST | Sistema de alertas |
| `/api/health` | GET | Health check |

---

## 🔐 Autenticación

Todos los endpoints requieren autenticación via Supabase Auth:

```typescript
// Header requerido
Authorization: Bearer <supabase_jwt_token>
```

El token se obtiene automáticamente del cliente Supabase:
```typescript
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

---

## 📡 Endpoints Detallados

### [POST] /api/chat
Endpoint principal del asistente IA.

**Ver documentación completa:** [Chat API](./chat-api.md)

### [GET/POST] /api/alerts
Sistema de alertas y notificaciones.

**Ver documentación completa:** [Alerts API](./alerts-api.md)

### [GET] /api/health
Verificación de estado del servicio.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-28T00:00:00Z",
  "version": "4.0.0"
}
```

---

## 🔄 Convenciones

### Formato de Response

```typescript
// Éxito
{
  "data": { ... },
  "error": null
}

// Error
{
  "data": null,
  "error": {
    "message": "Descripción del error",
    "code": "ERROR_CODE"
  }
}
```

### Códigos de Estado

| Código | Significado |
|--------|-------------|
| 200 | Éxito |
| 400 | Bad Request |
| 401 | No autenticado |
| 403 | Sin permisos |
| 404 | No encontrado |
| 500 | Error interno |

---

## 🛡️ Rate Limiting

| Endpoint | Límite |
|----------|--------|
| `/api/chat` | 60 req/min por usuario |
| `/api/alerts` | 100 req/min por usuario |
| `/api/health` | Sin límite |

---

## 📚 Documentación Relacionada

- [Chat API](./chat-api.md)
- [Alerts API](./alerts-api.md)
- [Arquitectura](../architecture/README.md)
