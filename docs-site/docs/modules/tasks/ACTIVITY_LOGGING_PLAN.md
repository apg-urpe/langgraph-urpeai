---
title: "Activity Logging en Tareas"
---

## ✅ Estado: IMPLEMENTADO (2024-12-29)

El sistema de activity logging ahora está integrado en `store/tareasStore.ts`.

### Función disponible no utilizada:
```typescript
// lib/activity-logger.ts:286
export async function logTaskActivity(
  accion: ActivityAction,
  tareaId: number,
  empresaId: number,
  contactoId?: number,
  descripcion?: string,
  datos?: { antes?: Record<string, unknown>; despues?: Record<string, unknown> }
): Promise<void>
```

## Acciones a Registrar

| Acción | Función Store | Datos a Capturar |
|--------|---------------|------------------|
| `crear` | `createTask()` | payload completo |
| `actualizar` | `updateTask()` | datos antes/después |
| `eliminar` | `deleteTask()` | datos de tarea eliminada |
| `ver` | `fetchTaskById()` | ID de tarea |

### Acciones secundarias (opcionales):
| Acción | Función Store | Datos |
|--------|---------------|-------|
| `actualizar` | `toggleTaskItem()` | item completado |
| `actualizar` | `addComment()` | comentario agregado |
| `actualizar` | `addTaskLabel()` | etiqueta agregada |

## Implementación Requerida

### 1. Importar en tareasStore.ts
```typescript
import { logTaskActivity } from '../lib/activity-logger';
```

### 2. Integrar en createTask()
```typescript
// Después de crear exitosamente (línea ~410)
await logTaskActivity(
  'crear',
  task.id,
  empresaId,
  payload.contacto_id,
  `Tarea creada: ${payload.titulo}`,
  { despues: payload }
);
```

### 3. Integrar en updateTask()
```typescript
// Antes del update, capturar estado actual
const currentTask = get().tasks.find(t => t.id === taskId);

// Después del update exitoso
await logTaskActivity(
  'actualizar',
  taskId,
  fullTask.empresa_id,
  fullTask.contacto_id,
  `Tarea actualizada: ${fullTask.titulo}`,
  { 
    antes: currentTask ? { estado: currentTask.estado, ...currentTask } : undefined,
    despues: payload 
  }
);
```

### 4. Integrar en deleteTask()
```typescript
// Antes de eliminar, capturar datos
const taskToDelete = get().tasks.find(t => t.id === taskId);

// Después de eliminar exitosamente
await logTaskActivity(
  'eliminar',
  taskId,
  taskToDelete?.empresa_id ?? 0,
  taskToDelete?.contacto_id,
  `Tarea eliminada: ${taskToDelete?.titulo}`,
  { antes: taskToDelete }
);
```

## Tabla de Destino

```sql
-- wp_actividades_log
CREATE TABLE wp_actividades_log (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tipo VARCHAR(50),           -- 'tarea'
  accion VARCHAR(50),         -- 'crear', 'actualizar', 'eliminar'
  descripcion TEXT,
  empresa_id INTEGER,
  contacto_id INTEGER,
  entidad_id VARCHAR(50),     -- ID de la tarea
  datos_antes JSONB,
  datos_despues JSONB,
  usuario_id UUID,
  user_agent TEXT
);
```

## Prioridad

**ALTA** - El registro de actividad es esencial para:
- Auditoría de cambios
- Debugging de problemas
- Compliance
- Historial de acciones por usuario

## Notas

- El logging es asíncrono y no bloquea operaciones
- Los errores de logging se capturan pero no interrumpen el flujo
- En desarrollo se muestra log en consola
