# 🚀 Plan de Optimización: Vista Pipeline de Contactos

> **Versión**: 1.0  
> **Fecha**: Enero 2025  
> **Estado**: Planificación  
> **Prioridad**: Alta

---

## 📋 Resumen Ejecutivo

Este documento presenta el plan de arquitectura para optimizar la vista de Pipeline (Embudo/Kanban) de contactos. Se identificaron dos problemas críticos:

1. **Desbordamiento Visual**: El contenedor Kanban desborda el viewport, eliminando el scroll horizontal funcional.
2. **Filtrado Incompleto**: La paginación de 25 registros impide visualizar el pipeline completo.

---

## 🔍 Análisis del Estado Actual

### Arquitectura de Componentes

```
ContactsFunnelView.tsx (Contenedor Principal)
├── Header (Búsqueda + Filtros + Controles)
├── ViewMode Toggle (Table | Kanban)
│
├── [Table Mode] → FunnelTableView.tsx
│   └── Lista paginada con scroll vertical
│
└── [Kanban Mode] → FunnelKanbanView.tsx
    └── Columnas horizontales por etapa
        └── Cards de contactos con drag-and-drop
```

### Archivos Involucrados

| Archivo | Propósito | Líneas Clave |
|---------|-----------|--------------|
| `components/admin/ContactsFunnelView.tsx` | Contenedor principal, lógica de fetch | L277: Container sin overflow-hidden |
| `components/admin/funnel/FunnelKanbanView.tsx` | Vista Kanban | L31-32: min-w-max causa overflow |
| `components/admin/funnel/FunnelTableView.tsx` | Vista Tabla | Paginación funcional |
| `store/contactStore.ts` | Estado y acciones | L44: pageSize=25 |
| `types/contact.ts` | Tipos y helpers | ContactFilters, sorting |

### Problema 1: Desbordamiento CSS

**Ubicación**: `FunnelKanbanView.tsx:31-32`

```tsx
// ACTUAL (Problemático)
<div className="flex-1 overflow-x-auto overflow-y-hidden">
  <div className="h-full p-4 flex gap-4 min-w-max">  {/* ⚠️ min-w-max */}
```

**Causa Raíz**:
- `min-w-max` fuerza al contenedor interno a expandirse indefinidamente.
- El contenedor padre (`ContactsFunnelView`) no tiene restricción de ancho (`max-w-full` o `overflow-hidden`).
- El scroll horizontal aparece en el `<body>` en lugar del área de trabajo.

### Problema 2: Paginación Limitada

**Ubicación**: `contactStore.ts:44`

```typescript
const initialPagination: PaginationState = {
  page: 1,
  pageSize: 25,  // ⚠️ Solo 25 contactos por página
  totalCount: 0,
  totalPages: 0
};
```

**Causa Raíz**:
- `fetchContacts` usa `range(from, to)` con límite de 25.
- La vista Kanban NO tiene paginación propia.
- Si hay 100 contactos, solo se muestran 25 en el pipeline.

---

## 🎯 Benchmarking: CRMs Líderes

### Comparativa de Arquitectura

| Feature | HubSpot | Pipedrive | Salesforce | **Urpe (Actual)** |
|---------|---------|-----------|------------|-------------------|
| **Carga de Datos** | Lazy Loading por columna | Scroll infinito | Virtual Scrolling | Paginación global (25) |
| **Scroll Horizontal** | Contenedor fijo | Contenedor fijo | Canvas infinito | Overflow al body |
| **Filtros Pipeline** | Persistentes | Por vista | Dinámicos | Se reinician |
| **Performance** | Client-side cache | IndexedDB | Server rendering | Zustand + fetch |
| **Max Contactos** | ~1000 visibles | ~500 visibles | Virtual (ilimitado) | 25 |

### Lecciones Aprendidas

1. **Pipedrive**: Usa `overflow: hidden` en el contenedor principal y `overflow-x: auto` solo en el área de columnas.
2. **HubSpot**: Carga datos por columna (lazy) para evitar bloqueo inicial.
3. **Salesforce**: Usa virtualización para manejar miles de registros.

---

## 🏗️ Arquitectura Propuesta

### Diagrama de Contenedores (Nuevo)

```
┌─────────────────────────────────────────────────────────────────┐
│ ContactsFunnelView (h-full flex flex-col overflow-hidden)       │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Header (shrink-0)                                           │ │
│ │ [Búsqueda] [Filtros] [Vista: Table|Kanban] [Refresh]       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Content Area (flex-1 min-h-0 overflow-hidden)               │ │
│ │                                                             │ │
│ │ [Kanban Mode]                                               │ │
│ │ ┌───────────────────────────────────────────────────────┐   │ │
│ │ │ KanbanScrollContainer (w-full overflow-x-auto)        │   │ │
│ │ │                                                       │   │ │
│ │ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │   │ │
│ │ │ │ Col1 │ │ Col2 │ │ Col3 │ │ Col4 │ │ Col5 │ ← →     │   │ │
│ │ │ │      │ │      │ │      │ │      │ │      │         │   │ │
│ │ │ │ ↕    │ │ ↕    │ │ ↕    │ │ ↕    │ │ ↕    │         │   │ │
│ │ │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │   │ │
│ │ └───────────────────────────────────────────────────────┘   │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Footer (shrink-0) - Stats: "150 contactos en 5 etapas"      │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de Datos (Nuevo)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ User Action │ ──▶ │ ContactsFunnel   │ ──▶ │ contactStore    │
│ (Kanban On) │     │ View.tsx         │     │ .fetchContacts  │
└─────────────┘     └──────────────────┘     └─────────────────┘
                             │                        │
                             │ viewMode='kanban'      │ forceRefresh=true
                             │                        │ pageSize=200 (new!)
                             ▼                        ▼
                    ┌──────────────────┐     ┌─────────────────┐
                    │ FunnelKanbanView │ ◀── │ contacts[]      │
                    │ (Lazy Columns)   │     │ funnelStages[]  │
                    └──────────────────┘     └─────────────────┘
                             │
                             │ Por cada columna
                             ▼
                    ┌──────────────────┐
                    │ KanbanColumn     │
                    │ (overflow-y-auto)│
                    │ + Lazy Load More │
                    └──────────────────┘
```

---

## 📐 Especificaciones Técnicas

### Fase 1: Corrección de Layout (1-2 días)

#### 1.1 Contenedor Principal

**Archivo**: `components/admin/ContactsFunnelView.tsx`

```tsx
// ANTES (L277)
<div className="h-full flex flex-col bg-[#0c0c0e] pb-20 md:pb-0">

// DESPUÉS
<div className="h-full w-full flex flex-col bg-[#0c0c0e] pb-20 md:pb-0 overflow-hidden">
```

#### 1.2 Contenedor Kanban

**Archivo**: `components/admin/funnel/FunnelKanbanView.tsx`

```tsx
// ANTES (L31-32)
<div className="flex-1 overflow-x-auto overflow-y-hidden">
  <div className="h-full p-4 flex gap-4 min-w-max">

// DESPUÉS
<div className="flex-1 min-h-0 overflow-hidden">
  <div className="h-full w-full overflow-x-auto overflow-y-hidden">
    <div className="h-full p-4 flex gap-4" style={{ minWidth: 'max-content' }}>
```

#### 1.3 Columnas con Scroll Interno

```tsx
// Cada columna debe manejar su propio scroll vertical
<div className="w-72 md:w-80 flex flex-col h-full bg-zinc-900/30 rounded-xl border border-white/5">
  {/* Header - Fixed */}
  <div className="p-3 border-b border-white/5 shrink-0">...</div>
  
  {/* Cards - Scrollable */}
  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
    {stageContacts.map(...)}
  </div>
</div>
```

### Fase 2: Modo Full Pipeline (2-3 días)

#### 2.1 Nueva Constante de Límite

**Archivo**: `store/contactStore.ts`

```typescript
// Nuevas constantes
const PIPELINE_PAGE_SIZE = 200;  // Para vista Kanban
const LIST_PAGE_SIZE = 25;       // Para vista Tabla

// Modificar fetchContacts para aceptar modo
fetchContacts: async (forceRefresh = false, mode: 'list' | 'pipeline' = 'list') => {
  const effectivePageSize = mode === 'pipeline' ? PIPELINE_PAGE_SIZE : LIST_PAGE_SIZE;
  // ...
}
```

#### 2.2 Detección de Modo en el Componente

**Archivo**: `components/admin/ContactsFunnelView.tsx`

```tsx
// Detectar cambio de viewMode y refetch si necesario
useEffect(() => {
  if (viewMode === 'kanban') {
    // Solicitar más datos para el pipeline
    fetchContacts(true, 'pipeline');
  }
}, [viewMode]);
```

#### 2.3 Indicador de Carga Parcial

```tsx
// Mostrar cuántos contactos se están viendo
<div className="text-xs text-zinc-500">
  Mostrando {contacts.length} de {pagination.totalCount} contactos
  {contacts.length < pagination.totalCount && (
    <button onClick={loadMore} className="ml-2 text-primary-400">
      Cargar más
    </button>
  )}
</div>
```

### Fase 3: Lazy Loading por Columna (3-4 días)

#### 3.1 Estado por Columna

```typescript
interface ColumnState {
  stageId: number;
  contacts: Contact[];
  hasMore: boolean;
  isLoading: boolean;
  page: number;
}

const [columnStates, setColumnStates] = useState<Map<number, ColumnState>>();
```

#### 3.2 Carga Incremental

```tsx
const loadMoreForColumn = async (stageId: number) => {
  const column = columnStates.get(stageId);
  if (!column || !column.hasMore || column.isLoading) return;
  
  // Fetch next page for this column only
  const { data } = await supabase
    .from('wp_contactos')
    .select('*')
    .eq('empresa_id', enterpriseId)
    .eq('etapa_embudo', stageId)
    .range(column.page * 20, (column.page + 1) * 20 - 1);
  
  // Update column state
  setColumnStates(prev => new Map(prev).set(stageId, {
    ...column,
    contacts: [...column.contacts, ...data],
    page: column.page + 1,
    hasMore: data.length === 20
  }));
};
```

#### 3.3 Intersection Observer para Auto-Load

```tsx
// En cada columna, al final de la lista
<div ref={(el) => {
  if (el) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMoreForColumn(stage.id);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }
}} />
```

---

## 📅 Roadmap de Implementación

| Fase | Descripción | Esfuerzo | Dependencias |
|------|-------------|----------|--------------|
| **1.1** | Fix CSS overflow en contenedor principal | 1h | - |
| **1.2** | Fix CSS en FunnelKanbanView | 2h | 1.1 |
| **1.3** | Scroll interno por columna | 2h | 1.2 |
| **2.1** | Constante PIPELINE_PAGE_SIZE | 1h | - |
| **2.2** | Lógica de modo en fetchContacts | 3h | 2.1 |
| **2.3** | Indicador de contactos cargados | 2h | 2.2 |
| **3.1** | Estado por columna (opcional) | 4h | 2.3 |
| **3.2** | Lazy loading por columna | 4h | 3.1 |
| **3.3** | Intersection Observer | 2h | 3.2 |

**Total Estimado**: 
- Fase 1 (Crítica): 5 horas
- Fase 2 (Importante): 6 horas  
- Fase 3 (Opcional): 10 horas

---

## ✅ Criterios de Aceptación

### Fase 1: Layout
- [ ] El scroll horizontal funciona dentro del área de trabajo
- [ ] El sidebar y header permanecen fijos al hacer scroll
- [ ] Cada columna tiene scroll vertical independiente
- [ ] No hay desbordamiento al nivel del `<body>`

### Fase 2: Datos
- [ ] Vista Kanban muestra mínimo 200 contactos
- [ ] Indicador muestra "X de Y contactos"
- [ ] Cambio de vista (Table ↔ Kanban) carga datos apropiados
- [ ] Performance: < 2s para cargar 200 contactos

### Fase 3: Lazy Loading (Opcional)
- [ ] Cada columna carga sus primeros 20 contactos inicialmente
- [ ] Scroll al fondo de columna dispara carga de más
- [ ] Indicador de "Cargando..." por columna
- [ ] Sin bloqueo de UI durante carga

---

## 🔗 Referencias

### Documentación Interna
- [Módulo Contactos README](./README.md)
- [Contexto de Perfil](./CONTACT_PROFILE_CONTEXT.md)
- [Búsqueda Profunda](./SEARCH_CONTACTS_DEEP_CONTEXT.md)

### Benchmarks Externos
- [Pipedrive Pipeline Features](https://www.pipedrive.com/en/features/pipeline-management)
- [HubSpot Kanban for Contacts](https://community.hubspot.com/t5/HubSpot-Ideas/Kanban-view-for-Contacts-and-Companies-and-maybe-custom-objects/idi-p/410608)
- [CSS Flexbox Kanban Pattern](https://codepen.io/cbracco/pen/mgYwPR)

---

## 📝 Notas de Implementación

### Performance Considerations

1. **Memoización**: Usar `useMemo` para `columns` (agrupación por etapa).
2. **Callbacks Estables**: Usar `useCallback` para handlers de drag-and-drop.
3. **Virtual List**: Considerar `react-window` si columnas > 50 cards.

### Testing

1. **Viewport Test**: Probar en 1280x720, 1920x1080, 2560x1440.
2. **Data Test**: Probar con 10, 50, 200, 500 contactos.
3. **Mobile Test**: Verificar comportamiento en tablets (768px-1024px).

### Rollback Plan

Si la Fase 2 causa problemas de performance:
1. Reducir `PIPELINE_PAGE_SIZE` a 100.
2. Activar Fase 3 (lazy loading) como mitigación.
3. Volver a paginación global con indicador de "página incompleta".

---

> **Próximo Paso**: Aprobar este plan para proceder con la implementación de Fase 1.
