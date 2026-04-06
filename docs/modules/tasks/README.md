# ✅ Módulo: Tareas

> Sistema de gestión de tareas con checklist y contexto

---

## 🎯 Propósito

El módulo de Tareas proporciona:
- **Gestión de tareas**: Crear, asignar, completar
- **Checklist integrado**: Items de verificación por tarea
- **Contexto flexible**: Vincular a contactos, citas o proyectos
- **Priorización**: Sistema de prioridades con colores

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `TasksView.tsx` | `/components/admin/tasks/` | Vista principal |
| `TaskCard.tsx` | `/components/admin/tasks/` | Tarjeta de tarea |
| `TaskModal.tsx` | `/components/admin/tasks/` | Crear/editar tarea |
| `TaskSearchCreate.tsx` | `/components/admin/tasks/` | Barra de búsqueda y creación |
| `ContactTasks.tsx` | `/components/admin/contact-details/` | Tareas de un contacto |
| `ProjectTasks.tsx` | `/components/admin/projects/v3/` | Tareas de un proyecto |
| `TaskDetailModal.tsx` | `/components/admin/tasks/v3/` | Vista detallada de tarea |
| `TaskChecklist.tsx` | `/components/admin/tasks/v3/` | Checklist con estilo Notion |

---

## 💾 Modelo de Datos

### wp_tareas
```typescript
interface Task {
  id: number;
  empresa_id: number;
  proyecto_id: number | null;
  titulo: string;
  descripcion: string | null;
  descripcion_md: string | null;  // Markdown
  estado: TaskStatus;
  prioridad: TaskPriority;
  asignado_a: number | null;      // team_humano_id
  creado_por: number;             // team_humano_id
  contacto_id: number | null;     // Contexto
  cita_id: number | null;         // Contexto
  fecha_vencimiento: string | null;
  created_at: string;
  updated_at: string;
}

type TaskStatus = 'pendiente' | 'en_progreso' | 'completada' | 'cancelada';
type TaskPriority = 1 | 2 | 3 | 4;  // baja, media, alta, urgente
```

### wp_tareas_items
```typescript
interface TaskItem {
  id: number;
  tarea_id: number;
  descripcion: string;
  completado: boolean;
  orden: number;
}
```

---

## 📊 Sistema de Prioridades

| Nivel | Nombre | Color | Uso |
|-------|--------|-------|-----|
| 1 | Baja | Gris | Tareas sin urgencia |
| 2 | Media | Azul | Tareas normales |
| 3 | Alta | Ámbar | Tareas importantes |
| 4 | Urgente | Rojo | Atención inmediata |

---

## 🔄 Flujo de Datos

### Store: `tareasStore.ts`

```typescript
// Estado
tasks: Task[];
selectedTask: Task | null;
taskItems: Record<number, TaskItem[]>;
filters: TaskFilters;

// CRUD Tareas
fetchTasks(enterpriseId, filters?)
createTask(payload: CreateTaskPayload)
updateTask(taskId, updates)
deleteTask(taskId)

// Checklist
addTaskItem(taskId, description)
toggleTaskItem(itemId)
deleteTaskItem(itemId)
reorderTaskItems(taskId, itemIds)

// Por contexto
fetchTasksByContact(contactId)
fetchTasksByAppointment(appointmentId)
```

---

## 🎨 UI/UX

### Estilo Notion
El módulo implementa patrones de UX inspirados en Notion:

#### Filtros Rápidos (Quick Filters)
- **Ocultar completadas**: Toggle para ocultar tareas completadas
- **Ver mías**: Toggle para ver solo tareas asignadas o creadas por el usuario
- Diseño minimalista con pills/toggles sutiles

#### TaskCard Features
- Hover limpio y sutil (`hover:bg-white/[0.03]`)
- Checkboxes estilo Notion con animación suave
- Barra de progreso de checklist
- Badge de prioridad con color
- Contexto visual (contacto/cita)
- Expandible para ver checklist
- Quick actions (completar, editar)

### Filtros Disponibles
- Por estado
- Por prioridad
- Por asignado
- Por proyecto
- Por rango de fechas
- **Filtros rápidos**: Ocultar completadas, Ver mías

---

## 🔗 Integración con Contexto

Las tareas pueden vincularse a:

```typescript
// Tarea de contacto
{ contacto_id: 123, cita_id: null }

// Tarea de cita
{ contacto_id: null, cita_id: 456 }

// Tarea de proyecto
{ proyecto_id: 789, contacto_id: null, cita_id: null }

// Tarea general
{ proyecto_id: null, contacto_id: null, cita_id: null }
```

---

## 📚 Documentación Relacionada

- [Plan de Tareas V3](./TAREAS_V3_PLAN.md)
- [Activity Logging](./ACTIVITY_LOGGING_PLAN.md)
- [Contactos](../contacts/README.md)
