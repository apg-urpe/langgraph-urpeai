# Sistema de Tareas - Urpe AI Lab

## Arquitectura

El módulo de tareas implementa un sistema completo de gestión de tareas con diseño **Square UI Style**, optimizado para industria de servicios.

## Componentes

### TasksView.tsx
Vista principal de tareas con:
- **StatsCards**: Métricas (Vencen Hoy, Atrasadas, En Progreso, Completadas)
- **Filtros avanzados**: Estado, Prioridad, Tipo, Asignado
- **Búsqueda**: Por título, descripción o contacto
- **Sidebar de proyectos**: Organización por proyectos (colapsable)

### TaskCard.tsx (Compacto)
Tarjeta de tarea optimizada para navegación:
- **Header**: Título + Badge prioridad (letra inicial) + menú
- **Contacto**: Link clickeable cyan con icono → navega al detalle
- **Meta row**: Estado (dot), fecha vencimiento, checklist count, avatar
- **Checklist**: Expandible, máximo 5 items visibles

### TasksStatsCards.tsx
Panel de métricas estilo Square UI:
- Grid responsive 2-4 columnas
- Iconos semánticos por tipo de métrica
- Colores: Rose (atrasadas), Blue (progreso), Emerald (completadas)

### QuickTaskInput.tsx (NEW - AI Generation)
Cuadro de texto minimalista para generar tareas desde lenguaje natural:
- **Input**: Textarea auto-expandible con placeholder descriptivo
- **Generación**: Envía texto a `/api/monica/task-from-text` → Gemini procesa
- **Preview**: Muestra tarea generada con título, descripción, prioridad, fecha y checklist
- **Acciones**: Crear tarea o descartar
- **UX**: Enter para generar, Shift+Enter nueva línea

**Flujo**:
1. Usuario escribe descripción libre (ej: "Llamar a Juan mañana para confirmar reunión")
2. Gemini extrae: título, descripción, prioridad, items de checklist, fecha sugerida
3. Preview editable antes de crear
4. Click en "Crear tarea" → usa `onCreateTask` callback

### TaskModal.tsx
Formulario para crear/editar tareas con campos:
- Título, Descripción
- Prioridad, Estado
- Fecha de vencimiento
- Asignado, Contacto relacionado
- Items de checklist

### TaskDetailModal.tsx (V3)
Vista detallada con tabs:
- **Detalles**: Descripción (Markdown) + Checklist
- **Subtareas**: Checklist expandido
- **Comentarios**: Sistema de comentarios con autor y timestamp
- **Archivos**: Galería de media adjuntos
- **Actividad**: Historial de cambios

### TaskSidebar.tsx (V3)
Panel lateral en detalle de tarea:
- Estado (dropdown con iconos)
- Prioridad (dot coloreado)
- Asignado a (avatar + dropdown)
- **Contacto Relacionado**: Card cyan clickeable con teléfono/email
- Proyecto (dropdown)
- Fecha límite (date picker)
- Etiquetas (pills con selector)
- Meta info (ID, fecha creación, creador)

### TaskLabels.tsx (V3 - Mejorado)
Sistema de etiquetas genérico para servicios:
- Pills con dot de color + nombre
- Selector dropdown con búsqueda
- Selección múltiple sin cerrar
- Categorías: Estado, Prioridad, Tipo, Cliente, Servicio, Otro

### TaskComments.tsx (V3)
Sistema de comentarios:
- Lista de comentarios con avatar y timestamp
- Input con Shift+Enter para nueva línea
- Soporte para menciones (@)
- Reacciones (emojis)

### ProjectsSidebar.tsx
Navegación lateral de proyectos:
- Lista de proyectos con contador de tareas
- Inbox (tareas sin proyecto)
- Colapsable

## Estructura de Datos

### wp_tareas
```sql
id, titulo, descripcion, estado, prioridad
fecha_vencimiento, empresa_id
contacto_id, cita_id, conversacion_id (contexto)
asignado_a, creado_por (team_humano)
proyecto_id
descripcion_md, portada_url (V3)
tiempo_estimado_min, tiempo_real_min (V3)
costo_estimado, costo_real, moneda (V3)
```

### wp_tareas_items
```sql
id, tarea_id, texto, completado, orden
completado_por, completado_at
asignado_a, etiqueta_id (V3)
```

### wp_tareas_comentarios
```sql
id, tarea_id, contenido, autor_id
created_at, editado
```

### wp_tareas_etiquetas (relación)
```sql
tarea_id, etiqueta_id, created_at
```

### wp_etiquetas_equipo
```sql
id, empresa_id, nombre, color, descripcion
created_at
```

### wp_proyectos
```sql
id, empresa_id, nombre, descripcion
color, icono, orden, estado
creado_por, contacto_id (dueño del proyecto)
presupuesto, gasto_actual, moneda (V3)
fecha_inicio, fecha_fin_estimada, fecha_fin_real (V3)
```

## Navegación a Contacto

Cuando una tarea tiene `contacto_id`, se muestra un link clickeable:
```typescript
// TaskCard.tsx / TaskSidebar.tsx
onClick={() => {
  window.dispatchEvent(new CustomEvent('openContactDetail', { 
    detail: { contactId: task.contacto.id } 
  }));
}}
```

El AdminPanel escucha este evento y abre el detalle del contacto.

## Estilos Square UI

### Colores de Prioridad
```typescript
const PRIORITY_STYLES = {
  4: { bg: 'bg-red-500/20', text: 'text-red-400' },      // Urgente
  3: { bg: 'bg-amber-500/20', text: 'text-amber-400' },  // Alta
  2: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' }, // Media
  1: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' }, // Baja
};
```

### Colores de Estado
```typescript
const STATUS_STYLES = {
  pendiente: { dot: 'bg-zinc-400' },
  en_progreso: { dot: 'bg-blue-400' },
  completada: { dot: 'bg-emerald-400' },
  cancelada: { dot: 'bg-rose-400' },
};
```

### Patrones Visuales
- **Cards**: `rounded-xl border border-zinc-800/60 bg-zinc-900/80 p-3`
- **Contacto link**: `bg-cyan-500/10 border-cyan-500/20 text-cyan-300`
- **Etiquetas**: Pills `rounded-full` con dot de color
- **Avatares**: `w-5 h-5` con gradiente y iniciales

## Flujo de Datos

```
TasksView
  ├── useTareasStore (estado global)
  │   ├── tasks[], selectedTask
  │   ├── fetchTasks, fetchTaskById (incluye comentarios, etiquetas)
  │   ├── addComment, deleteComment, toggleReaction
  │   └── addTaskLabel, removeTaskLabel
  ├── useProyectosStore (proyectos)
  │   ├── projects[] (incluye contacto dueño)
  │   └── fetchProjects, createProject
  ├── useContactStore (empresa, usuario)
  └── useAdminStore (filtro global de equipo)
```

## Permisos
- **Modo Observación**: Bloquea creación/edición para rol 1 en empresas ajenas
- **Filtro de Equipo**: Roles 1-2 pueden ver todas, Rol 3 solo propias
