# 🔭 Roadmap de Observabilidad Avanzada - Urpe AI Lab v4.0

> Plan de implementación para maximizar la visibilidad operacional del sistema

---

## 📊 Estado Actual

| Componente | Estado | Cobertura |
|------------|--------|-----------|
| Error Logger (`error-logger.ts`) | ✅ Implementado | ~40% del código |
| Activity Logger (`activity-logger.ts`) | ✅ Implementado | ~30% del código |
| Env Validator (`env-validator.ts`) | ✅ Implementado | ✅ Inicializado en layout |
| API Schemas (`api-schemas.ts`) | ✅ Implementado | ~30% de endpoints |
| Performance Monitor (`performance-monitor.ts`) | ✅ Implementado | ✅ Integrado en stores |
| Error Boundaries | ✅ Implementado | ✅ Integrado en App.tsx |
| Web Vitals Reporter | ✅ Implementado | ✅ Integrado en layout |
| Alert Service (`alert-service.ts`) | ✅ Implementado | ✅ Con webhook endpoint |
| Session Tracker (`session-tracker.ts`) | ✅ Implementado | Listo para integrar |
| Health Check (`/api/health`) | ✅ Implementado | ✅ Con deep check |
| Observability Dashboard | ✅ Implementado | ✅ Integrado en Admin |
| Cleanup SQL | ✅ Implementado | Script listo para ejecutar |
| Tablas BD (`wp_error_logs`, `wp_actividades_log`) | ✅ Creadas | N/A |

---

## 🚀 Fases de Implementación

### Fase 1: Web Vitals Automáticos 
**Prioridad:** 🔴 Alta | **Esfuerzo:** 2h | **Impacto:** Alto

Integrar `next/web-vitals` para tracking automático de métricas Core Web Vitals.

**Archivos a crear/modificar:**
- `app/layout.tsx` - Agregar reportador
- `lib/web-vitals-reporter.ts` - Nuevo archivo

**Implementación:**
```typescript
// app/layout.tsx
import { reportWebVitals } from '@/lib/web-vitals-reporter';

export function reportWebVitals(metric) {
  trackWebVital(metric.name, metric.value);
}
```

**Métricas a capturar:**
- **LCP** (Largest Contentful Paint) - < 2.5s
- **FID** (First Input Delay) - < 100ms
- **CLS** (Cumulative Layout Shift) - < 0.1
- **FCP** (First Contentful Paint) - < 1.8s
- **TTFB** (Time to First Byte) - < 800ms

---

### Fase 2: Sistema de Alertas en Tiempo Real
**Prioridad:** 🔴 Alta | **Esfuerzo:** 4h | **Impacto:** Alto

Notificaciones automáticas cuando ocurren errores críticos.

**Archivos a crear:**
- `lib/alert-service.ts` - Servicio de alertas
- `app/api/alerts/webhook/route.ts` - Endpoint para webhooks

**Canales de alerta:**
```typescript
interface AlertConfig {
  slack?: { webhookUrl: string; channel: string };
  email?: { recipients: string[]; smtpConfig: SmtpConfig };
  webhook?: { url: string; headers: Record<string, string> };
  inApp?: { enabled: boolean }; // Notificaciones en panel admin
}
```

**Triggers de alerta:**
| Evento | Severidad | Acción |
|--------|-----------|--------|
| Error crítico | 🔴 Critical | Slack + Email inmediato |
| 5+ errores en 5 min | 🟠 High | Slack |
| Query > 5s | 🟡 Medium | Log + Dashboard |
| Web Vital "poor" | 🟡 Medium | Dashboard |
| Login fallido 3x | 🟠 High | Email al admin |

---

### Fase 3: Dashboard de Métricas en Admin
**Prioridad:** 🟠 Media | **Esfuerzo:** 8h | **Impacto:** Alto

Panel visual para monitorear salud del sistema.

**Archivos a crear:**
- `components/admin/ObservabilityDashboard.tsx`
- `components/admin/metrics/ErrorsChart.tsx`
- `components/admin/metrics/PerformanceChart.tsx`
- `components/admin/metrics/ActivityTimeline.tsx`
- `app/api/admin/metrics/route.ts`

**Widgets del Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│  📊 OBSERVABILITY DASHBOARD                                  │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Errores 24h    │  Queries/min    │  Web Vitals Score       │
│  ⚠️ 12          │  📈 245         │  🟢 92/100              │
├─────────────────┴─────────────────┴─────────────────────────┤
│  📉 Error Trend (últimos 7 días)                            │
│  [===== gráfico de líneas =====]                            │
├─────────────────────────────────────────────────────────────┤
│  ⏱️ Query Performance                                        │
│  fetchContacts: avg 450ms | p95 1200ms | p99 2100ms         │
│  fetchAppointments: avg 320ms | p95 800ms | p99 1500ms      │
├─────────────────────────────────────────────────────────────┤
│  📋 Actividad Reciente                                       │
│  • 10:32 - Usuario X actualizó contacto #123                │
│  • 10:28 - Nueva cita creada por Y                          │
│  • 10:15 - Login exitoso: admin@empresa.com                 │
└─────────────────────────────────────────────────────────────┘
```

---

### Fase 4: Error Boundaries Globales
**Prioridad:** 🔴 Alta | **Esfuerzo:** 2h | **Impacto:** Alto

Envolver componentes críticos para evitar crashes completos.

**Archivos a modificar:**
- `app/page.tsx` - Wrap ChatArea
- `components/admin/AdminPanel.tsx` - Wrap secciones
- `components/CalendarBlock.tsx` - Wrap calendario

**Implementación:**
```tsx
// app/page.tsx
import { ChatErrorBoundary } from '@/components/ErrorBoundary';

export default function Home() {
  return (
    <ChatErrorBoundary>
      <ChatArea />
    </ChatErrorBoundary>
  );
}

// components/admin/AdminPanel.tsx
import { AdminErrorBoundary, MinimalErrorBoundary } from '@/components/ErrorBoundary';

<AdminErrorBoundary>
  <AdminNavBar />
  <MinimalErrorBoundary>
    <ContactsTable />
  </MinimalErrorBoundary>
  <MinimalErrorBoundary>
    <CalendarView />
  </MinimalErrorBoundary>
</AdminErrorBoundary>
```

---

### Fase 5: Query Performance Tracking
**Prioridad:** 🟠 Media | **Esfuerzo:** 4h | **Impacto:** Alto

Instrumentar todas las queries de Supabase.

**Archivos a modificar:**
- `store/contactStore.ts` - Todas las funciones fetch*
- `store/adminStore.ts` - Queries administrativas
- `store/chatStore.ts` - Queries de mensajes

**Patrón de implementación:**
```typescript
// Antes (sin tracking)
const { data, error } = await supabase
  .from('wp_contactos')
  .select('*')
  .eq('empresa_id', empresaId);

// Después (con tracking)
import { trackQuery } from '@/lib/performance-monitor';

const { data, error } = await trackQuery('fetchContacts', async () => {
  return supabase
    .from('wp_contactos')
    .select('*')
    .eq('empresa_id', empresaId);
});
```

**Queries prioritarias a instrumentar:**
| Query | Store | Frecuencia | Impacto |
|-------|-------|------------|---------|
| fetchContacts | contactStore | Alta | Crítico |
| fetchConversationMessages | contactStore | Alta | Crítico |
| fetchEnterpriseAppointments | contactStore | Media | Alto |
| fetchFunnelStages | contactStore | Baja | Medio |
| fetchTeamMembers | contactStore | Baja | Bajo |

---

### Fase 6: Activity Logging Completo
**Prioridad:** 🟠 Media | **Esfuerzo:** 6h | **Impacto:** Alto

Auditoría completa de todas las operaciones CRUD.

**Operaciones a instrumentar:**

| Operación | Store/Componente | Función Logger |
|-----------|------------------|----------------|
| Crear contacto | contactStore | `logCreate('contacto', ...)` |
| Actualizar contacto | contactStore | `logUpdate('contacto', ...)` |
| Eliminar contacto | contactStore | `logDelete('contacto', ...)` |
| Crear cita | contactStore | `logCreate('cita', ...)` |
| Actualizar cita | contactStore | `logUpdate('cita', ...)` |
| Enviar mensaje | contactStore | `logActivity({ tipo: 'conversacion', ... })` |
| Login/Logout | authStore | `logAuth('login', ...)` |
| Crear tarea | taskStore | `logCreate('tarea', ...)` |
| Crear campaña | marketingStore | `logCreate('campana', ...)` |

**Ejemplo de implementación:**
```typescript
// store/contactStore.ts - updateContactField
updateContactField: async (contactId, field, value) => {
  const oldContact = get().contacts.find(c => c.id === contactId);
  
  const { error } = await supabase
    .from('wp_contactos')
    .update({ [field]: value })
    .eq('id', contactId);

  if (!error) {
    await logUpdate('contacto', contactId, 
      { [field]: oldContact?.[field] },
      { [field]: value },
      { empresaId: get().selectedEnterpriseId }
    );
  }
};
```

---

### Fase 7: Session Tracking
**Prioridad:** 🟡 Baja | **Esfuerzo:** 4h | **Impacto:** Medio

Seguimiento de sesiones de usuario para análisis de comportamiento.

**Archivos a crear:**
- `lib/session-tracker.ts`
- Nueva tabla: `wp_sessions_log`

**Datos a capturar:**
```typescript
interface SessionData {
  sessionId: string;
  userId: string;
  empresaId: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  pageViews: number;
  actions: number;
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  lastActivity: Date;
}
```

**SQL para tabla:**
```sql
CREATE TABLE wp_sessions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id),
  session_start TIMESTAMPTZ DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  duration_seconds INTEGER,
  page_views INTEGER DEFAULT 0,
  actions_count INTEGER DEFAULT 0,
  device_type TEXT,
  browser TEXT,
  ip_address TEXT,
  last_activity TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Fase 8: Exportación de Logs
**Prioridad:** 🟡 Baja | **Esfuerzo:** 3h | **Impacto:** Medio

API para exportar logs a sistemas externos.

**Archivos a crear:**
- `app/api/admin/logs/export/route.ts`

**Formatos de exportación:**
- JSON (para APIs externas)
- CSV (para análisis en Excel)
- NDJSON (para streaming a Datadog/Elasticsearch)

**Endpoints:**
```
GET /api/admin/logs/export?type=errors&format=json&from=2024-01-01&to=2024-01-31
GET /api/admin/logs/export?type=activities&format=csv&empresaId=1
GET /api/admin/logs/export?type=performance&format=ndjson
```

---

### Fase 9: Health Checks
**Prioridad:** 🟡 Baja | **Esfuerzo:** 2h | **Impacto:** Medio

Endpoints de salud para monitoreo externo (UptimeRobot, etc.).

**Archivos a crear:**
- `app/api/health/route.ts` - Health check básico
- `app/api/health/deep/route.ts` - Health check completo

**Respuesta del endpoint:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-26T20:15:00Z",
  "version": "4.0.0",
  "checks": {
    "database": { "status": "up", "latency": 45 },
    "supabase": { "status": "up", "latency": 120 },
    "gemini": { "status": "up" },
    "nylas": { "status": "up" }
  },
  "uptime": 86400,
  "memory": {
    "used": "45MB",
    "limit": "512MB"
  }
}
```

---

### Fase 10: Limpieza Automática de Logs
**Prioridad:** 🟡 Baja | **Esfuerzo:** 2h | **Impacto:** Bajo

Jobs programados para mantenimiento de tablas.

**Opciones de implementación:**

1. **Supabase Edge Function (Recomendado):**
```typescript
// supabase/functions/cleanup-logs/index.ts
Deno.serve(async () => {
  const { error } = await supabaseAdmin.rpc('cleanup_old_logs', { days: 90 });
  return new Response(JSON.stringify({ success: !error }));
});
```

2. **Cron job externo (n8n):**
   - Webhook trigger cada domingo a las 3am
   - Llama a función de limpieza

**SQL function:**
```sql
CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(deleted_errors BIGINT, deleted_activities BIGINT) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
BEGIN
  DELETE FROM wp_error_logs WHERE created_at < cutoff_date;
  GET DIAGNOSTICS deleted_errors = ROW_COUNT;
  
  DELETE FROM wp_actividades_log WHERE fecha_creacion < cutoff_date;
  GET DIAGNOSTICS deleted_activities = ROW_COUNT;
  
  RETURN QUERY SELECT deleted_errors, deleted_activities;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 📋 Mejoras Adicionales Identificadas

### 🔐 Seguridad

1. **Rate Limiting en APIs**
   - Limitar requests por IP/usuario
   - Prevenir abuse de endpoints

2. **Sanitización de Logs**
   - No loguear datos sensibles (passwords, tokens)
   - Enmascarar PII en logs

3. **Audit Trail Inmutable**
   - Logs con firma digital
   - Prevenir modificación de registros

### 📈 Performance

4. **Lazy Loading de Componentes**
   - Cargar módulos bajo demanda
   - Reducir bundle inicial

5. **Query Caching**
   - Cache de queries frecuentes
   - Invalidación inteligente

6. **Connection Pooling**
   - Optimizar conexiones a Supabase
   - Reducir latencia

### 🔍 Debugging

7. **Request Tracing (Trace ID)**
   - ID único por request
   - Correlacionar logs relacionados

8. **Source Maps en Producción**
   - Stack traces legibles
   - Debugging más fácil

9. **Replay de Sesiones**
   - Grabar interacciones de usuario
   - Reproducir bugs

---

## 📅 Timeline Sugerido

| Semana | Fases | Horas Est. |
|--------|-------|------------|
| 1 | Fase 1 (Web Vitals) + Fase 4 (Error Boundaries) | 4h |
| 2 | Fase 5 (Query Tracking) + Fase 6 (Activity Logging) | 10h |
| 3 | Fase 2 (Alertas) + Fase 9 (Health Checks) | 6h |
| 4 | Fase 3 (Dashboard) | 8h |
| 5 | Fase 7 (Sessions) + Fase 8 (Export) + Fase 10 (Cleanup) | 9h |

**Total estimado:** ~37 horas de desarrollo

---

## 🎯 Quick Wins (Implementar Ya)

1. ✅ **Error Boundaries** en componentes críticos (2h)
2. ✅ **trackQuery()** en las 5 queries más usadas (2h)
3. ✅ **logActivity()** en operaciones de contactos (2h)
4. ✅ **Web Vitals** básico con console.log (30min)
5. ✅ **Health check** endpoint simple (30min)

---

*Última actualización: Diciembre 2024*  
*Autor: Sistema de Observabilidad Urpe AI Lab*
