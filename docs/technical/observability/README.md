# 📊 Observabilidad

> Logging, métricas y trazas del sistema

---

## 🎯 Propósito

El sistema de observabilidad proporciona:
- **Logging estructurado**: Acciones de usuario y sistema
- **Trazas de requests**: Seguimiento de chat y tools
- **Métricas de uso**: KPIs de Monica AI
- **Error monitoring**: Captura y alertas

---

## 🏗️ Arquitectura

### Dos Sistemas Paralelos

| Sistema | Schema | Uso |
|---------|--------|-----|
| CRM Principal | `public` | Actividades de contactos, citas, tareas |
| Chat AI | `adaptive_interface` | Eventos del chat, tools, sesiones |

---

## 📝 Logging del CRM

### Tabla: `wp_actividades_log`
```typescript
interface ActivityLog {
  id: number;
  user_id: number;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  created_at: string;
}
```

### Logger: `lib/activity-logger.ts`
```typescript
await logActivity({
  action: 'contact.updated',
  resourceType: 'contact',
  resourceId: contactId,
  details: { field: 'estado', oldValue, newValue }
});
```

---

## 📝 Logging del Chat

### Tabla: `adaptive_interface.activity_logs`
```typescript
interface ChatActivityLog {
  id: string;
  user_id: string;
  session_id: string;
  action: ChatActivityAction;
  resource_type: string;
  resource_id: string;
  details: ChatActivityDetails;
  ip_address: string;
  user_agent: string;
  created_at: string;
}
```

### Actions Disponibles
```typescript
type ChatActivityAction =
  | 'chat.request_started'
  | 'chat.request_completed'
  | 'chat.request_failed'
  | 'chat.tool_called'
  | 'chat.tool_completed'
  | 'gemini.generation_started'
  | 'gemini.generation_completed';
```

---

## 📈 Métricas de Monica

### Dashboard de Observabilidad
- **Usuarios activos**: Por rango de tiempo
- **Mensajes totales**: Histórico
- **Sesiones**: Conteo de sesiones
- **Tools más usadas**: Ranking

### Queries Útiles
```sql
-- Actividad por sesión
SELECT action, details, created_at
FROM adaptive_interface.activity_logs
WHERE session_id = 'xxx'
ORDER BY created_at;

-- Tools más usadas
SELECT details->>'tool_name' as tool, COUNT(*)
FROM adaptive_interface.activity_logs
WHERE action = 'chat.tool_called'
GROUP BY 1 ORDER BY 2 DESC;
```

---

## 📚 Documentación Relacionada

- [Sistema de Observabilidad](./OBSERVABILITY_SYSTEM.md)
- [Monica Observability](./MONICA_OBSERVABILITY_CONTEXT.md)
- [Roadmap](./OBSERVABILITY_ROADMAP.md)
- [Seguridad](./SECURITY_OBSERVABILITY.md)
