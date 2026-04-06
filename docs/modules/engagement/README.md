# 📊 Sistema de Engagement y Adopción

> Tracking de uso de la aplicación para entender patrones de adopción

---

## 🎯 Propósito

El sistema de engagement permite entender **cómo los usuarios usan la aplicación**:
- Qué módulos visitan más
- Qué features utilizan
- Cuánto tiempo pasan en la app
- Patrones de retención (DAU/WAU/MAU)
- Adopción de nuevas funcionalidades

---

## 🏗️ Arquitectura

### Componentes

| Archivo | Descripción |
|---------|-------------|
| `scripts/ENGAGEMENT_TRACKING_SCHEMA.sql` | Schema de base de datos |
| `lib/engagement-tracker.ts` | Servicio de tracking |
| `hooks/useEngagement.ts` | Hook de React |
| `components/admin/EngagementMetrics.tsx` | Dashboard de métricas |

### Flujo de Datos

```
Usuario Interactúa
        ↓
  trackPageView() / trackAction() / trackFeatureUse()
        ↓
  wp_user_engagement (evento individual)
        ↓
  Trigger → wp_user_engagement_daily (resumen diario)
        ↓
  EngagementMetrics (visualización)
```

---

## 📝 Tablas de Base de Datos

### `wp_user_engagement`
Eventos individuales de engagement.

```sql
- id: BIGSERIAL PRIMARY KEY
- user_id: UUID (auth.users)
- team_humano_id: BIGINT (opcional)
- empresa_id: BIGINT
- event_type: 'page_view' | 'action' | 'feature_use' | 'session_start' | 'session_end'
- event_name: VARCHAR(100) -- ej: 'contacts.view', 'chat.send_message'
- module: VARCHAR(50) -- dashboard, contacts, chat, etc.
- sub_module: VARCHAR(50) -- opcional
- metadata: JSONB -- datos adicionales
- session_id: VARCHAR(100)
- device_type: 'mobile' | 'tablet' | 'desktop'
- created_at: TIMESTAMPTZ
```

### `wp_user_engagement_daily`
Resumen diario por usuario (auto-generado via trigger).

```sql
- user_id, empresa_id, date: UNIQUE
- total_events, total_page_views, total_actions
- session_count
- modules_used: TEXT[] -- array de módulos visitados
- features_used: TEXT[] -- array de features usadas
- first_activity_at, last_activity_at
```

### `wp_module_usage_daily`
Uso agregado por módulo por empresa.

---

## 🔧 API de Tracking

### Inicialización (automática)

El hook `useEngagement` inicializa la sesión automáticamente cuando hay contexto de usuario.

### Tracking Manual

```typescript
import { useEngagement } from '@/hooks/useEngagement';

const { trackPageView, trackAction, trackFeature, trackClick } = useEngagement();

// Track vista de página/módulo
trackPageView('contacts', 'list_view');

// Track acción específica
trackAction('contacts', 'contact.create', { contactId: 123 });

// Track uso de feature
trackFeature('chat', 'multimedia_upload', { fileType: 'image' });

// Track click en elemento
trackClick('dashboard', 'kpi_card', { metric: 'contacts' });
```

### Hook Simplificado para Páginas

```typescript
import { usePageTracking } from '@/hooks/useEngagement';

// Auto-trackea page view al montar el componente
usePageTracking('contacts', 'funnel_view');
```

---

## 📈 Métricas Disponibles

### KPIs de Retención

| Métrica | Descripción |
|---------|-------------|
| **DAU** | Daily Active Users - usuarios activos hoy |
| **WAU** | Weekly Active Users - últimos 7 días |
| **MAU** | Monthly Active Users - últimos 30 días |
| **Retention Rate** | % usuarios que volvieron vs semana anterior |
| **Sesiones/Usuario** | Promedio de sesiones por usuario |
| **Módulos/Usuario** | Promedio de módulos distintos usados |

### Uso por Módulo

- Usuarios únicos por módulo
- Total de vistas
- Total de acciones
- % de adopción (usuarios del módulo / usuarios totales)

### Top Features

- Ranking de features más usadas
- Conteo de uso por feature

### Tendencias

- Eventos diarios
- Usuarios únicos diarios
- Sesiones diarias

---

## 🖥️ Visualización

El componente `EngagementMetrics` se muestra en la sección de **Observabilidad** del Admin Panel.

### Secciones del Dashboard

1. **KPIs de Retención**: DAU, WAU, MAU, tasa de retención
2. **Uso por Módulo**: Barras de progreso por módulo
3. **Top Features**: Ranking de features más usadas
4. **Tendencia de Uso**: Gráfico de barras diario

---

## 🔒 Seguridad y Performance

### RLS Policies

- Usuarios solo ven sus propios eventos
- Miembros de empresa ven estadísticas agregadas

### Debouncing

- Eventos idénticos dentro de 500ms se ignoran
- Previene spam de tracking

### Session Management

- Sesión expira después de 30 min de inactividad
- Nueva sesión se crea automáticamente al volver

---

## 🚀 Migración

### 1. Ejecutar Schema SQL

```sql
-- En Supabase SQL Editor
-- Ejecutar scripts/ENGAGEMENT_TRACKING_SCHEMA.sql
```

### 2. Verificar Tablas

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'wp_user_engagement%';
```

### 3. Probar Tracking

```sql
-- Ver eventos recientes
SELECT * FROM wp_user_engagement 
ORDER BY created_at DESC LIMIT 10;

-- Ver resumen diario
SELECT * FROM wp_user_engagement_daily 
ORDER BY date DESC LIMIT 10;
```

---

## 📊 Queries Útiles

### Usuarios Más Activos (Última Semana)

```sql
SELECT 
  user_id,
  SUM(total_events) as total_events,
  SUM(session_count) as total_sessions,
  COUNT(DISTINCT date) as active_days
FROM wp_user_engagement_daily
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id
ORDER BY total_events DESC
LIMIT 10;
```

### Módulos Más Usados

```sql
SELECT 
  module,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_events
FROM wp_user_engagement
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY module
ORDER BY unique_users DESC;
```

### Retención Semanal

```sql
SELECT * FROM get_retention_metrics(13, 30);
-- Retorna: dau, wau, mau, retention_rate, avg_sessions, avg_modules
```

---

## 🔮 Oportunidades Futuras

1. **Heatmaps**: Tracking de clicks por posición
2. **Funnels**: Análisis de flujos de conversión
3. **Cohortes**: Análisis de retención por cohorte
4. **Alertas**: Notificaciones por caídas en métricas
5. **A/B Testing**: Tracking de experimentos
6. **Segmentación**: Análisis por tipo de usuario/empresa

---

## 📚 Archivos Relacionados

- `@/lib/engagement-tracker.ts` - Servicio principal
- `@/hooks/useEngagement.ts` - Hook de React
- `@/components/admin/EngagementMetrics.tsx` - Dashboard
- `@/components/admin/ObservabilityDashboard.tsx` - Vista padre
