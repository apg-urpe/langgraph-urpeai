---
title: "Centro de Actividad - Análisis Completo"
---

> Auditoría del sistema de notificaciones + novedades (changelog) unificado.

---

## 📍 Ubicación de Archivos Relacionados

### Componentes UI
| Archivo | Función |
|---------|---------|
| `components/notifications/NotificationButton.tsx` | Botón con badge de contador (rojo) o novedad (azul) |
| `components/notifications/NotificationDropdown.tsx` | Dropdown con tabs: Notificaciones / Novedades |
| `components/notifications/NotificationItem.tsx` | Card individual de notificación con acciones |
| `components/admin/AdminPanel.tsx:248-260` | Integración del Centro de Actividad en header |

### Estado (Store)
| Archivo | Función |
|---------|---------|
| `store/notificationsStore.ts` | Estado Zustand: fetch, CRUD, realtime, stats |
| `types/notification.ts` | Tipos: `Notification`, `NotificationFilters`, `NotificationStats` |

### Utilidades
| Archivo | Función |
|---------|---------|
| `lib/changelogParser.ts` | Parseo de `CHANGELOG.md` y tracking de "visto" en localStorage |
| `lib/sanitize-html.ts` | Sanitización de mensajes HTML |

### Base de Datos (Scripts SQL)
| Archivo | Función |
|---------|---------|
| `scripts/TAREAS_V2_FULL_DEPLOY.sql` | Triggers de notificaciones para tareas |
| `scripts/TAREAS_V3_SCHEMA.sql` | Triggers adicionales (estado, comentarios, vencimiento) |
| `scripts/DELETE_EMPRESA_COMPLETO.sql` | Limpieza de `wp_notificaciones_team` |

### Documentación
| Archivo | Función |
|---------|---------|
| `docs/modules/notifications/README.md` | Documentación principal |
| `docs/modules/changelog/README.md` | Documentación del changelog |
| `docs/mobile/NOTIFICATIONS_MOBILE_CONTEXT.md` | Contexto mobile |

---

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CENTRO DE ACTIVIDAD                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │ NotificationButton│ ──────> │NotificationDropdown│               │
│  │  • Badge rojo     │         │  • Tab: Notificaciones             │
│  │  • Badge azul     │         │  • Tab: Novedades                  │
│  └──────────────────┘         └─────────┬────────┘                 │
│                                         │                           │
│         ┌───────────────────────────────┼───────────────────┐      │
│         │                               │                   │      │
│         ▼                               ▼                   ▼      │
│  ┌──────────────┐          ┌────────────────┐     ┌────────────┐  │
│  │NotificationItem│         │  CHANGELOG.md   │     │localStorage│  │
│  │  • markAsRead │         │  (fetch /public)│     │changelog_  │  │
│  │  • respond    │         └────────────────┘     │last_viewed │  │
│  │  • delete     │                               └────────────┘  │
│  │  • viewContact│                                               │
│  └──────┬───────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 notificationsStore                        │    │
│  │  • fetchNotifications() ◄──── Supabase Query              │    │
│  │  • subscribeToNotifications() ◄──── Realtime Channel      │    │
│  │  • markAsRead() ──────────────► UPDATE wp_notificaciones  │    │
│  │  • respondToNotification() ───► UPDATE wp_notificaciones  │    │
│  │  • createNotification() ──────► INSERT wp_notificaciones  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Problemas Identificados y Riesgos

### 🔴 Críticos

#### 1. **Falta Schema SQL dedicado para `wp_notificaciones_team`**
- **Problema**: No existe un script `NOTIFICATIONS_SCHEMA.sql` explícito. La tabla se menciona en triggers pero no hay DDL visible.
- **Riesgo**: Imposible verificar estructura, índices, RLS.
- **Recomendación**: Crear script de schema dedicado.

#### 2. **Realtime filtra solo por `empresa_id`, no por `asesor_id`**
```typescript
// notificationsStore.ts:429
filter: `empresa_id=eq.${empresaId}`
```
- **Problema**: Todos los usuarios de una empresa reciben TODAS las notificaciones vía Realtime, incluyendo las destinadas a otros.
- **Riesgo**: Toast spam, privacidad (aunque la query de fetch sí filtra correctamente).
- **Recomendación**: Añadir filtro `or=(asesor_id.eq.${teamId},asesor_id.is.null)` al subscription.

#### 3. **`byType` stats no implementado**
```typescript
// notificationsStore.ts:236
byType: initialStats.byType // TODO: Implement type counts if needed
```
- **Problema**: El conteo por tipo siempre retorna 0.
- **Impacto**: UI no puede mostrar estadísticas por categoría.

### 🟡 Advertencias

#### 4. **Cache de 5 min puede ser stale**
- Aunque hay Realtime, si falla la reconexión, los datos pueden estar desactualizados.
- La UI muestra "cached data" sin indicador visual.

#### 5. **Falta validación de `contacto_id` en `handleViewContact`**
```typescript
// NotificationItem.tsx:89
selectContact(notification.contacto_id);
```
- **Problema**: Si `contacto_id` es null, puede causar error.
- **Recomendación**: Añadir check `if (notification.contacto_id)`.

#### 6. **`fetchStats` hace 3 queries separadas**
```typescript
// notificationsStore.ts:208-229
const { count: total } = await supabase...
const { count: unread } = await supabase...
const { count: requiresResponse } = await supabase...
```
- **Problema**: 3 roundtrips a DB.
- **Recomendación**: Usar una sola query con `SELECT COUNT(*) FILTER (...)`.

#### 7. **Changelog hardcodeado a `2024-12-25`**
```typescript
// changelogParser.ts:187
const LATEST_UPDATE_DATE = new Date('2024-12-25').getTime();
```
- **Problema**: Fecha estática, no detecta actualizaciones nuevas automáticamente.
- **Recomendación**: Parsear la fecha del primer entry del CHANGELOG o usar hash del contenido.

### 🟢 Mejoras Menores

#### 8. **Búsqueda en dropdown es solo local**
- El campo de búsqueda filtra la lista ya cargada, no hace query al servidor.
- Para notificaciones antiguas (no en el `limit: 50`), la búsqueda no encontrará resultados.

#### 9. **No hay paginación**
- Siempre se cargan 50 notificaciones máximo.
- Para usuarios con muchas notificaciones, no hay forma de ver las antiguas.

#### 10. **Falta tipo `deep_research` en iconos**
```typescript
// NotificationItem.tsx:32-48
// No hay case para 'deep_research'
default: return <Bell className="w-4 h-4 text-zinc-400" />;
```
- **Recomendación**: Añadir icono específico (ej: `Search` o `Sparkles`).

---

## 📊 Tipos de Notificación Soportados

| Tipo | Icono | Color | Trigger Automático |
|------|-------|-------|-------------------|
| `nueva_cita` | Calendar | blue | ❌ Manual |
| `human_in_the_loop` | User | amber | ❌ Manual |
| `mensaje_urgente` | MessageSquare | red | ❌ Manual |
| `tarea_asignada` | UserPlus | purple | ✅ `notify_task_assigned` |
| `recordatorio` | Bell | cyan | ❌ Manual |
| `sistema` | Info | zinc | ❌ Manual |
| `tarea_mencion` | AtSign | pink | ✅ `notify_task_mention` |
| `tarea_estado` | RefreshCw | blue | ✅ `notify_task_status_change` |
| `tarea_vencimiento_proximo` | Clock | amber | ✅ `notify_tasks_due_soon` |
| `tarea_vencida` | AlertTriangle | rose | ❌ (función existe pero sin cron) |
| `tarea_comentario` | MessageSquare | indigo | ✅ `notify_task_comment` |
| `tarea_item_completado` | CheckSquare | emerald | ❌ (no implementado) |
| `proyecto_costo` | DollarSign | emerald | ✅ `notify_project_cost` |
| `deep_research` | ❌ Default | zinc | ❌ Manual vía API |

---

## 🗄️ SQL de Verificación

```sql
-- ============================================================================
-- VERIFICACIÓN DEL SISTEMA DE NOTIFICACIONES
-- Ejecutar en Supabase SQL Editor para confirmar estado del sistema
-- ============================================================================

-- 1. Verificar que la tabla existe y su estructura
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'wp_notificaciones_team'
ORDER BY ordinal_position;

-- 2. Verificar índices existentes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'wp_notificaciones_team';

-- 3. Verificar RLS está habilitado
SELECT 
    relname as table_name,
    relrowsecurity as rls_enabled
FROM pg_class
WHERE relname = 'wp_notificaciones_team';

-- 4. Verificar políticas RLS
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'wp_notificaciones_team';

-- 5. Verificar Foreign Keys
SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'wp_notificaciones_team'
    AND tc.constraint_type = 'FOREIGN KEY';

-- 6. Verificar triggers relacionados
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('wp_tareas', 'wp_tareas_comentarios', 'wp_proyectos_costos')
    AND action_statement ILIKE '%wp_notificaciones_team%';

-- 7. Conteo de notificaciones por tipo (últimos 30 días)
SELECT 
    tipo,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE NOT visto) as no_leidas,
    COUNT(*) FILTER (WHERE requiere_respuesta AND respuesta IS NULL) as sin_responder
FROM wp_notificaciones_team
WHERE fecha_envio > NOW() - INTERVAL '30 days'
GROUP BY tipo
ORDER BY total DESC;

-- 8. Verificar notificaciones huérfanas (sin contacto válido)
SELECT COUNT(*) as notificaciones_huerfanas
FROM wp_notificaciones_team n
LEFT JOIN wp_contactos c ON n.contacto_id = c.id
WHERE n.contacto_id IS NOT NULL 
    AND c.id IS NULL;

-- 9. Verificar notificaciones con asesor inválido
SELECT COUNT(*) as asesor_invalido
FROM wp_notificaciones_team n
LEFT JOIN wp_team_humano t ON n.asesor_id = t.id
WHERE n.asesor_id IS NOT NULL 
    AND t.id IS NULL;

-- 10. Schema esperado (para comparar/crear si falta)
-- Si la tabla NO existe, ejecutar este CREATE:
/*
CREATE TABLE IF NOT EXISTS wp_notificaciones_team (
    id BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    mensaje TEXT NOT NULL,
    fecha_envio TIMESTAMPTZ DEFAULT NOW(),
    estado VARCHAR(20) DEFAULT 'pendiente',
    visto BOOLEAN DEFAULT FALSE,
    requiere_respuesta BOOLEAN DEFAULT FALSE,
    respuesta TEXT,
    fecha_respuesta TIMESTAMPTZ,
    empresa_id BIGINT REFERENCES wp_empresa_perfil(id),
    asesor_id BIGINT REFERENCES wp_team_humano(id),
    agente_id BIGINT REFERENCES wp_agentes(id),
    contacto_id BIGINT REFERENCES wp_contactos(id) ON DELETE CASCADE,
    origen VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices recomendados
CREATE INDEX IF NOT EXISTS idx_notif_empresa_asesor 
    ON wp_notificaciones_team(empresa_id, asesor_id);
CREATE INDEX IF NOT EXISTS idx_notif_visto 
    ON wp_notificaciones_team(visto) WHERE NOT visto;
CREATE INDEX IF NOT EXISTS idx_notif_fecha 
    ON wp_notificaciones_team(fecha_envio DESC);
CREATE INDEX IF NOT EXISTS idx_notif_tipo 
    ON wp_notificaciones_team(tipo);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_notificacion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notificacion_updated
    BEFORE UPDATE ON wp_notificaciones_team
    FOR EACH ROW EXECUTE FUNCTION update_notificacion_timestamp();

-- RLS básico
ALTER TABLE wp_notificaciones_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their enterprise notifications"
    ON wp_notificaciones_team FOR SELECT
    USING (
        empresa_id IN (
            SELECT empresa_id FROM wp_team_humano 
            WHERE auth_uid = auth.uid()
        )
    );

CREATE POLICY "Users can update their own notifications"
    ON wp_notificaciones_team FOR UPDATE
    USING (
        asesor_id IN (
            SELECT id FROM wp_team_humano 
            WHERE auth_uid = auth.uid()
        )
        OR asesor_id IS NULL
    );
*/
```

---

## ✅ Checklist de Verificación

- [ ] Tabla `wp_notificaciones_team` existe con todos los campos
- [ ] Índices están creados para queries frecuentes
- [ ] RLS habilitado y políticas correctas
- [ ] FK a `wp_contactos`, `wp_team_humano`, `wp_empresa_perfil`
- [ ] Triggers de tareas funcionando
- [ ] No hay notificaciones huérfanas
- [ ] Realtime channel funciona
- [ ] Badge se actualiza en tiempo real
- [ ] Respuestas se guardan correctamente
- [ ] Changelog se parsea sin errores

---

## 📝 Recomendaciones Prioritarias

1. **Crear `scripts/NOTIFICATIONS_SCHEMA.sql`** con DDL completo
2. **Arreglar filtro Realtime** para incluir `asesor_id`
3. **Implementar `byType` stats** con query optimizada
4. **Añadir icono para `deep_research`** en NotificationItem
5. **Validar `contacto_id`** antes de llamar `selectContact`
6. **Actualizar `LATEST_UPDATE_DATE`** dinámicamente

---

*Generado: 2025-01-05*
