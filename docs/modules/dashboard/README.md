# 📊 Módulo: Dashboard

> Métricas y KPIs en tiempo real

---

## 🎯 Propósito

El Dashboard proporciona visibilidad instantánea del negocio:
- **KPIs principales**: Contactos, mensajes, citas, conversión
- **Tendencias**: Comparación con períodos anteriores
- **Actividad reciente**: Últimas interacciones y eventos
- **Filtrado flexible**: Por fecha, equipo, agente

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `DashboardView.tsx` | `/components/admin/` | Vista principal |
| `useAdminMetrics.ts` | `/hooks/` | Hook de métricas |
| `ObservabilityDashboard.tsx` | `/components/admin/` | Métricas técnicas |

---

## 📈 Métricas Disponibles

### KPIs Principales (6 tarjetas)

| Métrica | Fuente | Descripción |
|---------|--------|-------------|
| Nuevos Contactos | `wp_contactos` | Contactos creados en el período |
| Citas Agendadas | `wp_citas` | Citas en el período |
| Conversión | Calculado | `(Citas / Contactos) * 100` |
| Efectividad | `wp_citas.estado` | `Realizadas / (Realizadas + Canceladas) * 100` |
| **📧 Con Email** | `wp_contactos.email` | Contactos con email pero sin cita |
| **📉 Rebote** | `wp_mensajes` | 3+ mensajes de agente sin respuesta cliente |

### Gráficos de Análisis

| Gráfico | Tipo | Descripción |
|---------|------|-------------|
| Tendencia: Contactos vs Citas | Area | Evolución diaria del período |
| **Calificación de Contactos** | Pie | Distribución: Si/No/Evaluando/Pendiente |
| **Distribución por Etapa** | Bar (horizontal) | Contactos por etapa del embudo |

### Gráficos de Inteligencia Comercial (v3)

| Gráfico | Tipo | Descripción |
|---------|------|-------------|
| **📬 Marketing: Correos** | Pie | Correos enviados, abiertos y fallidos con tasa de apertura |
| **🏷️ Patrones en Contactos** | Bar | Top 8 valores repetidos en metadata (nacionalidad, origen, etc) |

### Métricas v2: Inteligencia Comercial

#### Efectividad de Citas
```sql
SELECT 
  COUNT(*) FILTER (WHERE estado = 'realizada') as realizadas,
  COUNT(*) FILTER (WHERE estado = 'cancelada') as canceladas
FROM wp_citas
WHERE empresa_id = ? AND created_at BETWEEN ? AND ?
```
**Fórmula**: `Realizadas / (Realizadas + Canceladas) * 100`

#### Hot Leads (Leads Activos Hoy)
```sql
SELECT id, nombre, apellido, ultima_interaccion, es_calificado
FROM wp_contactos
WHERE empresa_id = ?
  AND is_active = true
  AND ultima_interaccion >= NOW() - INTERVAL '24 hours'
ORDER BY ultima_interaccion DESC
LIMIT 10
```

#### Tasa de Rebote (Bounce Rate)
Identifica contactos donde el equipo envió 3+ mensajes sin obtener respuesta del cliente:

```sql
-- Agrupa mensajes por conversación y remitente
SELECT conversacion_id, remitente
FROM wp_mensajes
WHERE empresa_id = ?
ORDER BY created_at
```

**Lógica de procesamiento:**
- `agente/sistema/asistente/humano` → Mensaje saliente
- `cliente/user` → Mensaje entrante
- **Rebote**: 3+ mensajes salientes Y 0 mensajes entrantes
- **Fórmula**: `(rebotados / total_con_mensajes) * 100`

#### Patrones de Metadata
Analiza campos repetidos en `wp_contactos.metadata`:

**Campos analizados**: nacionalidad, pais, ciudad, origen, fuente, tipo, categoria, interes, servicio, producto

**Filtros**:
- Solo valores string < 50 caracteres
- Mínimo 2 ocurrencias para aparecer
- Top 10 patrones más frecuentes

### Lógica de "Esperando Respuesta"

Esta métrica identifica **leads fríos** que requieren atención:

```sql
SELECT id, nombre, apellido, ultima_interaccion, es_calificado
FROM wp_contactos
WHERE empresa_id = ?
  AND is_active = true
  AND ultima_interaccion < NOW() - INTERVAL '3 days'
  AND ultima_interaccion IS NOT NULL
ORDER BY ultima_interaccion ASC
LIMIT 50
```

**Temas visuales:**
- 🟢 `success`: 0 contactos (todo al día)
- 🔵 `info`: 1-5 contactos (seguimiento normal)
- 🟡 `warning`: >5 contactos (requiere atención)

### Métricas del Equipo

| Métrica | Descripción |
|---------|-------------|
| Respuestas por agente | Mensajes enviados por cada miembro |
| Citas por agente | Citas gestionadas |
| Tiempo de respuesta | Promedio de respuesta |

---

## 🔄 Hook de Métricas

### `useAdminMetrics.ts`

```typescript
const {
  metrics,        // KPIs calculados
  isLoading,      // Estado de carga
  error,          // Error si existe
  refetch,        // Recargar datos
  lastUpdated     // Timestamp de última actualización
} = useAdminMetrics({
  enterpriseId,
  dateRange: { from, to },
  teamMemberId   // Opcional: filtro por miembro
});
```

### Estructura de Métricas
```typescript
interface DashboardMetrics {
  totalMessages: number;
  activeConversations: number;
  appointmentsCount: number;
  newContactsCount: number;
  recentChats: any[];
  nextAppointments: any[];
  isLoading: boolean;
  error: string | null;
  // New metrics (Enero 2026)
  qualificationBreakdown: { si: number; no: number; evaluando: number; pendiente: number };
  funnelStages: Array<{ name: string; count: number; id: number }>;
  ghostedContacts: number; // Contactos sin respuesta >48h
}
```

---

## 🎨 UI Blocks Generados

El dashboard utiliza el sistema de UI Blocks:

```typescript
// KPI Card
{
  type: 'kpi_card',
  title: 'Contactos Nuevos',
  value: 45,
  trend: 'up',
  trendValue: '+12%',
  theme: 'success'
}

// Grid de actividad
{
  type: 'grid',
  columns: 2,
  items: [...]
}
```

---

## 🔍 Filtros

### Rango de Fechas
- Hoy
- Últimos 7 días
- Últimos 30 días
- Este mes
- Rango personalizado

### Filtro de Equipo
Sincronizado con `adminStore.globalTeamFilter`:
- Roles 1-2: Pueden ver todos los miembros
- Role 3: Solo sus propios datos

---

## 📊 Observabilidad

### ObservabilityDashboard

Dashboard técnico para monitoreo:

| Métrica | Fuente |
|---------|--------|
| Usuarios activos Monica | `user_profiles` |
| Mensajes IA | `chat_messages` |
| Sesiones totales | `chat_sessions` |
| Requests | `activity_logs` |

---

## 🔧 Configuración

### Cache
```typescript
// Métricas se cachean por 5 minutos
const CACHE_TTL = 5 * 60 * 1000;
```

### Refresh Automático
```typescript
// Polling cada 30 segundos cuando está visible
useInterval(refetch, 30000);
```

---

## 📚 Documentación Relacionada

- [Arquitectura](../../architecture/README.md)
- [Protocolo UI v5](../../architecture/ui-protocol-v5.md)
- [Observabilidad](../../technical/observability/README.md)
