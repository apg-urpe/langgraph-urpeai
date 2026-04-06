---
title: "Auditoría de Performance - Urpe AI Lab"
---

**Fecha**: 20 de Enero 2026  
**Basado en**: [React Best Practices de Vercel](./REACT_BEST_PRACTICES.md)

---

## Resumen Ejecutivo

| Categoría | Estado | Hallazgos |
|-----------|--------|-----------|
| ✅ Virtualización | Bueno | `react-window` implementado en listas críticas |
| ✅ Code Splitting | Bueno | `lazy()` en AdminPanel para todas las vistas |
| ✅ Selectores Zustand | Mayormente Bueno | 71 usos de selectores vs 6 sin selector |
| ⚠️ Waterfalls | Mejorable | 2 patrones secuenciales identificados |
| ⚠️ Memoización | Mejorable | 21 React.memo pero oportunidades adicionales |
| ❌ CSS content-visibility | No implementado | 0 usos encontrados |

---

## 🔴 Problemas Críticos (CRITICAL)

### 1. Waterfall en `refreshContacts`

**Archivo**: `store/contactStore.ts:1710-1713`

```typescript
// ❌ ACTUAL: Secuencial (2 round trips)
refreshContacts: async () => {
  await get().fetchContacts(true);      // Espera completo
  await get().fetchFunnelStages(true);  // Luego ejecuta
},

// ✅ CORREGIR: Paralelo (1 round trip)
refreshContacts: async () => {
  await Promise.all([
    get().fetchContacts(true),
    get().fetchFunnelStages(true)
  ]);
},
```

**Impacto**: ~50% reducción en tiempo de refresh.

---

### 2. Fetch Secuencial en `fetchContactDetails`

**Archivo**: `store/contactStore.ts:1959-1993`

Las 9 queries principales ya usan `Promise.all` ✅, pero hay 2 queries adicionales secuenciales:

```typescript
// ❌ ACTUAL: Secuencial después del Promise.all principal
// 1. Transcripciones
const { data: transcripciones } = await supabase
  .from('transcripciones')
  .in('cita_id', citaIds);

// 2. Messages  
const { data: messages } = await supabase
  .from('wp_mensajes')
  .in('conversacion_id', conversationIds);

// ✅ CORREGIR: Paralelizar estas 2 queries
const [transcripcionesRes, messagesRes] = await Promise.all([
  citaIds.length > 0 
    ? supabase.from('transcripciones').in('cita_id', citaIds)
    : Promise.resolve({ data: [] }),
  conversationIds.length > 0 
    ? supabase.from('wp_mensajes').in('conversacion_id', conversationIds)
    : Promise.resolve({ data: [] })
]);
```

**Impacto**: ~30% reducción en tiempo de carga de detalle de contacto.

---

## 🟡 Problemas Medios (MEDIUM)

### 3. Componentes sin Selectores Granulares

**6 componentes usan `useContactStore()` sin selector**, causando re-renders innecesarios:

| Archivo | Línea | Problema |
|---------|-------|----------|
| `tasks/TasksView.tsx` | 94 | `const { selectedEnterpriseId, userContext } = useContactStore()` |
| `projects/v3/ProjectCosts.tsx` | - | `useContactStore()` sin selector |
| `projects/v3/ProjectTasks.tsx` | - | `useContactStore()` sin selector |
| `tasks/ProjectsSidebar.tsx` | - | `useContactStore()` sin selector |
| `tasks/v3/TaskComments.tsx` | - | `useContactStore()` sin selector |
| `tasks/v3/TaskMedia.tsx` | - | `useContactStore()` sin selector |

**Corrección ejemplo**:
```typescript
// ❌ ACTUAL
const { selectedEnterpriseId, userContext } = useContactStore();

// ✅ CORREGIR: Selectores individuales
const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
const userContext = useContactStore(state => state.userContext);
```

**Impacto**: Reducción significativa de re-renders en vistas de tareas/proyectos.

---

### 4. CSS content-visibility No Implementado

No se encontró uso de `content-visibility: auto` en ningún componente.

**Componentes candidatos** (listas con 50+ items potenciales):
- `ContactNotes` - lista de notas
- `ConversationMessages` - mensajes de conversación
- `TasksView` - lista de tareas
- `CalendarView` - eventos del calendario

**Implementación sugerida**:
```css
/* globals.css o componente específico */
.virtualized-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px; /* Altura estimada del item */
}
```

**Impacto**: Mejora en scroll performance para listas largas.

---

## ✅ Buenas Prácticas Ya Implementadas

### 1. Virtualización con react-window
`VirtualizedContactList.tsx` implementa correctamente:
- `FixedSizeList` con `AutoSizer`
- `React.memo` en `ContactRow`
- `useMemo` para `itemData`
- `useCallback` para `getItemKey`

### 2. Code Splitting en AdminPanel
Todas las vistas principales usan `lazy()`:
```typescript
const DashboardView = lazy(() => import('./DashboardView'));
const ContactsFunnelView = lazy(() => import('./ContactsFunnelView'));
// ... 13 vistas más
```

### 3. Memoización en Componentes Críticos
- `FunnelKanbanView`: 10 `useCallback`, `memo` en subcomponentes
- `TasksView`: `MemoizedTaskCard` wrapper
- `ContactDetailPanel`: 9 `useCallback`

### 4. Paralelización en fetchContactDetails
9 queries ejecutadas en paralelo con `Promise.all`:
- Conversations, Appointments, Multimedia, Notes
- Funnel Status, Tasks, Services
- Funnel Stage, Assigned Advisor

### 5. Preload con Promise.all
`preloadEnterpriseData` ya usa `Promise.all` correctamente.

---

## 📋 Plan de Acción

### Fase 1: Quick Wins (1-2 horas)

| Prioridad | Tarea | Archivo | Impacto |
|-----------|-------|---------|---------|
| 🔴 1 | Paralelizar `refreshContacts` | `contactStore.ts:1710` | Alto |
| 🔴 2 | Paralelizar transcripciones/messages | `contactStore.ts:1959` | Alto |

### Fase 2: Selectores (2-3 horas)

| Prioridad | Tarea | Archivos |
|-----------|-------|----------|
| 🟡 3 | Refactorizar 6 componentes a selectores | `tasks/*.tsx`, `projects/*.tsx` |

### Fase 3: CSS Optimizations (1-2 horas)

| Prioridad | Tarea | Archivos |
|-----------|-------|----------|
| 🟢 4 | Agregar `content-visibility` a listas | `globals.css`, componentes de lista |

---

## Métricas a Monitorear

Después de implementar las correcciones, medir:

1. **Time to Interactive (TTI)** - Dashboard load
2. **First Contentful Paint (FCP)** - Inicio de sesión
3. **Cumulative Layout Shift (CLS)** - Navegación entre vistas
4. **Re-render count** - DevTools Profiler en ContactDetailPanel

---

## Referencias

- [React Best Practices Guide](./REACT_BEST_PRACTICES.md)
- [Vercel Dashboard 2x Faster](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
- [React DevTools Profiler](https://react.dev/learn/react-developer-tools)
