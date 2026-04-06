---
title: "Auditoría de Rendimiento y Escalabilidad"
---

**Fecha**: Enero 2025  
**Objetivo**: Optimizar la app para usuarios con computadoras de gama baja y conexiones lentas.

---

## 📊 Resumen Ejecutivo

| Área | Estado | Impacto | Prioridad |
|------|--------|---------|-----------|
| Bundle Size | ⚠️ Mejorable | Alto | P0 |
| Carga Inicial | ⚠️ Waterfall crítico | Crítico | P0 |
| Stores (Estado) | ⚠️ Muy grandes | Alto | P1 |
| Re-renders | ✅ Parcialmente optimizado | Medio | P2 |
| Lazy Loading | ✅ Implementado | Bajo | - |
| Caching | ✅ Implementado (5min) | Bajo | - |

---

## 🔴 PROBLEMAS CRÍTICOS (P0)

### 1. Bundle Size - Dependencias Pesadas

**Problema**: Librerías grandes que aumentan el tiempo de carga inicial.

| Dependencia | Tamaño Estimado | Uso |
|-------------|-----------------|-----|
| `recharts` | ~500KB | Gráficos (solo dashboard) |
| `@google/genai` + `@google/generative-ai` | ~300KB | Duplicado |
| `react-markdown` + plugins | ~150KB | Renderizado markdown |
| `lucide-react` | ~200KB (sin tree-shake) | Iconos |
| `@supabase/supabase-js` | ~100KB | DB client |

**Impacto**: En 2G/3G esto significa 10-30 segundos de carga.

**Soluciones**:
```javascript
// next.config.js - Ya tienes esto parcialmente
experimental: {
  optimizePackageImports: ['lucide-react', 'recharts', '@supabase/supabase-js', 'zustand'],
}
```

**Acciones Inmediatas**:
1. **Eliminar `@google/generative-ai`** - Duplica funcionalidad de `@google/genai`
2. **Lazy load Recharts** - Solo cargar cuando el Dashboard está visible
3. **Analizar bundle** con `@next/bundle-analyzer`

---

### 2. Waterfall de Requests en Carga Inicial

**Problema**: Múltiples requests secuenciales bloquean la UI.

```
Flujo Actual (LENTO):
Auth Init → getSession() 
         → fetchUserContext() 
         → fetchEnterpriseProfile() 
         → preloadEnterpriseData() 
               ├── fetchContacts() 
               ├── fetchFunnelStages()
               └── fetchTeamMembers()
```

**Tiempo estimado en 3G**: 8-15 segundos antes de ver datos.

**Solución - Paralelización**:
```typescript
// Cambiar en app/page.tsx
useEffect(() => {
  if (userId && selectedEnterpriseId) {
    // Ejecutar en PARALELO, no secuencial
    Promise.all([
      fetchEnterpriseProfile(selectedEnterpriseId),
      preloadEnterpriseData()
    ]);
  }
}, [userId, selectedEnterpriseId]);
```

**Solución - Skeleton Loading**:
Mostrar UI esqueleto inmediatamente, no esperar datos.

---

### 3. Stores Monolíticos (contactStore = 84KB)

**Problema**: `contactStore.ts` tiene 2236 líneas y 84KB.

**Impacto**:
- Cada cambio de estado re-evalúa todo el store
- Parse inicial consume CPU en dispositivos lentos
- Memory footprint alto

**Métricas de Stores**:
```
contactStore.ts:      84,415 bytes  ⚠️ MUY GRANDE
tareasStore.ts:       47,157 bytes  ⚠️ Grande
chatStore.ts:         32,813 bytes  
gamificationStore.ts: 29,149 bytes
artifactStore.ts:     27,305 bytes
```

**Solución - Dividir contactStore**:
```
store/
├── contacts/
│   ├── contactsCore.ts      (CRUD básico)
│   ├── contactsSearch.ts    (búsqueda)
│   ├── contactsDetails.ts   (detalle individual)
│   └── index.ts             (re-export)
```

---

## 🟡 PROBLEMAS IMPORTANTES (P1)

### 4. Queries sin Paginación Efectiva

**Problema**: Algunas queries traen demasiados datos.

```typescript
// contactStore.ts - Línea ~750
.limit(SEARCH_QUERY_LIMIT) // 150 resultados por sub-query
// Super Search hace 5-6 queries x 150 = hasta 900 contactos en memoria
```

**Solución**:
```typescript
// Reducir límites para conexiones lentas
const SEARCH_QUERY_LIMIT = 50;  // Era 150
const SEARCH_RESULT_LIMIT = 50; // Era 100
const MAX_CONTACTS_IN_MEMORY = 200; // Era 500
```

---

### 5. IndexedDB para Chat (Riesgo de Bloqueo)

**Problema**: `chatStore.ts` usa IndexedDB sincrónicamente.

```typescript
// chatStore.ts línea 16-104
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Operaciones IDB pueden bloquear el main thread
  }
}
```

**Riesgo**: En dispositivos lentos, IDB puede congelar la UI.

**Solución**:
```typescript
// Agregar timeout y fallback
const idbWithTimeout = async (operation: Promise<any>, timeoutMs = 3000) => {
  return Promise.race([
    operation,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('IDB Timeout')), timeoutMs)
    )
  ]).catch(() => null); // Fallback silencioso
};
```

---

### 6. Animaciones CSS Costosas

**Problema**: `tailwind.config.ts` define 20+ animaciones complejas.

```typescript
// Animaciones que usan blur() y scale() son costosas en GPU débiles
'charFadeIn': { filter: 'blur(4px)', transform: 'translateY(2px)' },
'wordReveal': { filter: 'blur(8px)', transform: 'scale(0.98)' },
```

**Solución - Reducir en dispositivos lentos**:
```css
/* globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Detectar conexión lenta */
@media (max-width: 768px) {
  .animate-blob-1, .animate-blob-2, .animate-blob-3 {
    animation: none !important;
  }
}
```

---

## 🟢 LO QUE YA ESTÁ BIEN

### ✅ Lazy Loading Implementado
```typescript
// AdminPanel.tsx - Todas las vistas son lazy
const DashboardView = lazy(() => import('./DashboardView'));
const ContactsFunnelView = lazy(() => import('./ContactsFunnelView'));
// ... 12 vistas más
```

### ✅ Caching de 5 minutos
```typescript
const PRELOAD_CACHE_MS = 300000; // 5 minutos
```

### ✅ Debounce en búsqueda
```typescript
const SEARCH_DEBOUNCE_MS = 300;
```

### ✅ Selectores Estables
```typescript
// ContactsFunnelView.tsx
const selectActions = (state) => ({
  fetchContacts: state.fetchContacts,
  // Evita re-renders innecesarios
});
```

### ✅ Performance Monitor
```typescript
// lib/performance-monitor.ts
trackMetric('query_fetchContacts', duration, 'ms');
```

---

## 📋 PLAN DE ACCIÓN PRIORIZADO

### Semana 1 - Impacto Inmediato (P0)

| # | Tarea | Archivo | Impacto |
|---|-------|---------|---------|
| 1 | Eliminar `@google/generative-ai` | package.json | -300KB bundle |
| 2 | Lazy load Recharts | DashboardView.tsx | -500KB inicial |
| 3 | Paralelizar fetches iniciales | app/page.tsx | -3s carga |
| 4 | Skeleton loading global | components/InitialLoader.tsx | UX inmediata |
| 5 | Reducir límites de búsqueda | contactStore.ts | -50% memoria |

### Semana 2 - Optimización Media (P1)

| # | Tarea | Archivo | Impacto |
|---|-------|---------|---------|
| 6 | Timeout en IndexedDB | chatStore.ts | Evita freezes |
| 7 | Deshabilitar animaciones blur | globals.css | GPU savings |
| 8 | Bundle analyzer | next.config.js | Visibilidad |
| 9 | Dividir contactStore | store/contacts/*.ts | Mantenibilidad |

### Semana 3 - Polish (P2)

| # | Tarea | Archivo | Impacto |
|---|-------|---------|---------|
| 10 | Virtualización de listas | VirtualizedContactList.tsx | Ya existe, validar uso |
| 11 | Service Worker para cache | public/sw.js | Offline support |
| 12 | Compress images on upload | chat-upload.ts | Ya implementado |

---

## 🔧 CAMBIOS RÁPIDOS (< 1 hora cada uno)

### 1. Eliminar Dependencia Duplicada
```bash
npm uninstall @google/generative-ai
```
Y actualizar imports a usar solo `@google/genai`.

### 2. Reducir Límites de Búsqueda
```typescript
// contactStore.ts línea 65-68
const SEARCH_RESULT_LIMIT = 50;  // Era 100
const SEARCH_QUERY_LIMIT = 50;   // Era 150
const MAX_CONTACTS_IN_MEMORY = 200; // Era 500
```

### 3. Agregar prefers-reduced-motion
```css
/* globals.css - Al final del archivo */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  .animate-blob-1, .animate-blob-2, .animate-blob-3,
  .animate-grain, .animate-shimmer {
    display: none !important;
  }
}
```

### 4. Lazy Load Recharts
```typescript
// components/ChartBlock.tsx
import dynamic from 'next/dynamic';

const AreaChart = dynamic(
  () => import('recharts').then(mod => mod.AreaChart),
  { ssr: false, loading: () => <div className="h-48 animate-pulse bg-zinc-800 rounded" /> }
);
```

---

## 📈 MÉTRICAS OBJETIVO

| Métrica | Actual (Estimado) | Objetivo | Mejora |
|---------|-------------------|----------|--------|
| First Contentful Paint | ~4s | <2s | 50% |
| Time to Interactive | ~8s | <4s | 50% |
| Bundle Size (JS) | ~2MB | <1MB | 50% |
| Memory Usage | ~150MB | <80MB | 47% |
| Queries iniciales | 6 secuenciales | 3 paralelas | 50% |

---

## 🧪 CÓMO TESTEAR

### Simular Conexión Lenta (Chrome DevTools)
1. F12 → Network → Throttling → Slow 3G
2. Recargar página y medir tiempos

### Simular Dispositivo Lento (Performance)
1. F12 → Performance → CPU: 6x slowdown
2. Grabar interacciones y buscar jank

### Bundle Analysis
```bash
npm install @next/bundle-analyzer
# Agregar a next.config.js y ejecutar
ANALYZE=true npm run build
```

---

## 📝 NOTAS FINALES

**Prioridad Absoluta**: Los cambios P0 de la Semana 1 tendrán el mayor impacto para usuarios con conexiones lentas. Enfocarse en:

1. **Reducir bundle** = Menos bytes a descargar
2. **Paralelizar requests** = Menos tiempo esperando
3. **Skeleton loading** = Percepción de velocidad

Tony, te recomiendo empezar por los **Cambios Rápidos** ya que cada uno toma menos de 1 hora y el impacto combinado es significativo.
