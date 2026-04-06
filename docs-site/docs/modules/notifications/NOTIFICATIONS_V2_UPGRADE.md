---
title: "Sistema de Notificaciones v2.0 - Mejora Total"
---

> Análisis crítico, diseño de mejoras e implementación

---

## 📋 Análisis Crítico del Estado Actual

### 🔴 Problemas Críticos

#### 1. **Toast muestra notificaciones de otros usuarios**
```typescript
// notificationsStore.ts:701-725
// El filtro Realtime es solo por empresa_id, NO por asesor_id
filter: `empresa_id=eq.${empresaId}`
// Resultado: TODOS los usuarios de la empresa ven TODOS los toasts
```
**Impacto**: Spam de notificaciones irrelevantes, confusión del usuario.

#### 2. **Stats `byType` no implementado**
```typescript
// notificationsStore.ts:334
byType: initialStats.byType // TODO: Implement type counts if needed
```
**Impacto**: No se puede mostrar estadísticas por categoría en el Centro de Actividad.

#### 3. **3 queries separadas para estadísticas**
```typescript
// fetchStats() hace 3 roundtrips:
const { count: total } = await supabase...
const { count: unread } = await supabase...  
const { count: requiresResponse } = await supabase...
```
**Impacto**: Latencia innecesaria, carga en la base de datos.

#### 4. **Falta icono para `deep_research`**
```typescript
// NotificationItem.tsx:62-78
// No hay case para 'deep_research', cae en default
default: return <Bell className="w-4 h-4 text-zinc-400" />;
```

#### 5. **No hay validación de `contacto_id` antes de navegar**
```typescript
// NotificationItem.tsx:202-204
const handleViewContact = () => {
  selectContact(notification.contacto_id); // Puede ser null
};
```

### 🟡 Problemas Moderados

#### 6. **Búsqueda solo local**
- Solo filtra las 20 notificaciones ya cargadas
- No puede encontrar notificaciones antiguas

#### 7. **No hay sonido de notificación**
- Las notificaciones llegan silenciosamente
- Fácil perder alertas urgentes (HITL)

#### 8. **Toast no es stackable**
- Solo muestra una notificación a la vez
- Si llegan varias, solo se ve la última

#### 9. **HITL sin templates de respuesta rápida**
- El usuario debe escribir todo desde cero
- Respuestas comunes podrían ser templates

#### 10. **Sin indicador de estado del webhook**
- No se sabe si el mensaje HITL llegó a n8n
- No hay retry en caso de fallo

---

## 🎯 Diseño de Mejoras v2.0

### A. Mejoras en NotificationToast

1. **Stack de notificaciones** - Mostrar hasta 3 toasts simultáneos
2. **Filtrado por asesor_id** - Solo mostrar las que corresponden al usuario
3. **Sonido configurable** - Sonido suave para normales, distintivo para HITL
4. **Duración por prioridad** - HITL: 10s, Urgente: 8s, Normal: 5s
5. **Click para expandir** - Abrir dropdown directamente en esa notificación

### B. Mejoras en HITL (Human in the Loop)

1. **Templates de respuesta rápida** - 3-5 respuestas predefinidas configurables
2. **Indicador de envío** - Estados: enviando → enviado → entregado
3. **Retry automático** - Si el webhook falla, reintentar 3 veces
4. **Ventana 24h mejorada** - Countdown visual más prominente
5. **Sugerencia de plantilla WhatsApp** - Si la ventana está cerrada, sugerir enviar plantilla

### C. Mejoras en Centro de Actividad

1. **Stats por tipo** - Contador por cada tipo de notificación
2. **Búsqueda server-side** - Query a Supabase con texto
3. **Filtro por tipo** - Dropdown para filtrar por categoría
4. **Acción en lote** - Seleccionar múltiples y marcar/eliminar
5. **Archivo** - Mover a archivadas en lugar de eliminar
6. **Infinite scroll mejorado** - Prefetch de siguiente página

### D. Optimizaciones del Store

1. **Query única para stats** - Un solo query con COUNT FILTER
2. **Filtro Realtime mejorado** - Verificar asesor_id en el handler
3. **Cache del team_humano_id** - No re-fetchar en cada operación
4. **Optimistic updates** - Actualizar UI antes de confirmar DB
5. **Sound manager** - Servicio de audio para notificaciones

---

## 📁 Archivos a Modificar/Crear

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `store/notificationsStore.ts` | Modificar | Optimizar queries, cachear teamId, mejorar realtime |
| `components/notifications/NotificationToast.tsx` | Reescribir | Stack, sonido, prioridad |
| `components/notifications/NotificationItem.tsx` | Modificar | Templates HITL, mejor UX |
| `components/notifications/NotificationDropdown.tsx` | Modificar | Stats por tipo, búsqueda server |
| `lib/notification-sound.ts` | Crear | Servicio de sonidos |
| `types/notification.ts` | Modificar | Nuevos tipos para templates |
| `scripts/NOTIFICATIONS_SCHEMA.sql` | Crear | Schema dedicado con índices |

---

## 🚀 Orden de Implementación

1. **Store optimizations** - Base sólida
2. **Sound service** - Feedback auditivo
3. **Toast v2** - Stack + filtrado + sonido
4. **NotificationItem mejorado** - Templates HITL
5. **Dropdown mejorado** - Stats + búsqueda
6. **SQL Schema** - Índices y RLS

---

## 📊 Métricas de Éxito

| Métrica | Antes | Objetivo |
|---------|-------|----------|
| Queries para stats | 3 | 1 |
| Toast relevantes | ~30% | 100% |
| Tiempo respuesta HITL | N/A | < 30s promedio |
| Notificaciones perdidas | Alto | ~0 |

