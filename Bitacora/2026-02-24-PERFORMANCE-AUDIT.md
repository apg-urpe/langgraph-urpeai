# Auditoría de Rendimiento - 24 Feb 2026

> **Estado**: Documento de referencia para reparaciones incrementales
> **Riesgo**: App en producción - cada fix debe ser aislado y testeable
> **Autor**: Cascade + Tony

---

## Resumen Ejecutivo

La plataforma experimenta lentitud generalizada. El análisis identificó **12 problemas** organizados en 3 niveles de impacto. La causa raíz principal es una **explosión de queries SQL por flujo de usuario** combinada con **waterfalls de carga secuencial**.

### Conteo de Queries por Flujo de Usuario

| Flujo | Queries actuales | Queries óptimas | Ahorro |
|-------|:---:|:---:|:---:|
| Login → Dashboard | ~30 | ~8 | 73% |
| Abrir Contactos | ~8 | ~3 | 63% |
| Buscar contacto (scope=all) | ~12 | ~4 | 67% |
| Abrir detalle de contacto | ~12 (3 fases) | ~8 (2 fases) | 33% |
| Abrir Calendario | ~3 | ~1 | 67% |
| Dashboard refresh | ~19 | ~5 | 74% |

---

## NIVEL 1 — IMPACTO CRÍTICO (hacer primero)

---

### P1: Índices SQL no aplicados
- **Archivo**: `scripts/PERFORMANCE_FIX_2026_02_24.sql`
- **Impacto**: Toda la plataforma. Sin índices, cada query hace seq scan.
- **Síntoma**: 33s appointments, 6-7s dashboard, 3-6s contacts
- **Acción**: Ejecutar el SQL en Supabase SQL Editor (ya preparado)
- **Riesgo**: BAJO — `CREATE INDEX CONCURRENTLY` no bloquea tablas
- **Verificación**: Ejecutar el bloque VERIFICACIÓN del script para confirmar

```
ESTADO: [x] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
FECHA APLICACIÓN: _______________
NOTAS: _______________
```

---

### P2: `logActivity` bloquea `fetchContacts` con `await`
- **Archivo**: `store/contactStore.ts` línea ~920
- **Impacto**: +200-400ms en CADA listado de contactos
- **Causa**: `await logActivity(...)` se ejecuta ANTES del fetch real
- **Síntoma**: Delay visible al cargar contactos incluso con cache válido

**Código actual** (línea ~920):
```typescript
await logActivity({
  tipo: 'contacto',
  accion: 'ver',
  // ...
});
```

**Fix propuesto** — Quitar `await` (fire-and-forget):
```typescript
// Fire-and-forget: no bloquear la UI por logging
logActivity({
  tipo: 'contacto',
  accion: 'ver',
  // ...
});
```

- **Riesgo**: MUY BAJO — Solo cambia timing del log, no su existencia
- **Verificación**: El log sigue apareciendo en `wp_actividades_log`

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [x] Completado  [ ] Verificado
```

> ✅ Aplicado en código el 2026-02-24. Pendiente verificación con métricas reales.

---

### P3: `preloadEnterpriseData` ejecuta waterfall de 3 fases seriales
- **Archivo**: `store/contactStore.ts` líneas ~847-888
- **Impacto**: 3-9 segundos de carga inicial al entrar al panel
- **Causa**: Batch 1 (profile) → await → Batch 2 (contacts+funnel) → await → Batch 3 (appointments)
- **Síntoma**: El panel tarda en mostrar datos después del login

**Código actual**:
```typescript
// BATCH 1: Secuencial
await get().fetchEnterpriseProfile();

// BATCH 2: Solo empieza cuando batch 1 termina
const batch2 = [];
if (!isCacheValid('contacts')) batch2.push(get().fetchContacts(true));
if (!isCacheValid('funnelStages')) batch2.push(get().fetchFunnelStages(true));
await Promise.all(batch2);

// BATCH 3: Solo empieza cuando batch 2 termina
if (!isCacheValid('appointments')) { ... }
```

**Fix propuesto** — Todo en paralelo (profile no bloquea contacts):
```typescript
const allPromises: Promise<void>[] = [];

// Profile (no tiene dependientes)
allPromises.push(get().fetchEnterpriseProfile());

// Contacts + Funnel en paralelo
if (!isCacheValid('contacts')) allPromises.push(get().fetchContacts(true));
if (!isCacheValid('funnelStages')) allPromises.push(get().fetchFunnelStages(true));

// Appointments también en paralelo
if (!isCacheValid('appointments')) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  allPromises.push(
    get().fetchEnterpriseAppointments(null, { start: start.toISOString(), end: end.toISOString() }, true)
  );
}

await Promise.all(allPromises);
```

- **Riesgo**: BAJO — Los 4 fetches son independientes entre sí
- **Verificación**: Medir tiempo total de preload (debería bajar de ~6s a ~2s)

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [x] Completado  [ ] Verificado
```

---

### P4: Lock de deduplicación de `fetchContacts` está roto
- **Archivo**: `store/contactStore.ts` línea ~937
- **Impacto**: Fetch duplicado cada vez que ContactsView + FunnelView + preload corren simultáneamente
- **Causa**: El lock se asigna como una promise vacía que se resuelve inmediato

**Código actual** (línea ~937):
```typescript
if (!contactsFetchInFlight) {
  contactsFetchInFlight = (async () => { /* placeholder assigned below */ })();
}
```

El `(async () => {})()` se resuelve INMEDIATAMENTE. La promise real del fetch nunca se asigna al lock.

**Fix propuesto** — Crear la promise real y asignarla al lock:
```typescript
// Crear la promise del fetch y asignarla al lock
const fetchPromise = (async () => {
  try {
    // ... todo el código del fetch aquí ...
  } finally {
    contactsFetchInFlight = null;
  }
})();
contactsFetchInFlight = fetchPromise;
return fetchPromise;
```

Nota: El lock de `fetchEnterpriseAppointments` (línea ~2071) SÍ está bien implementado.

- **Riesgo**: MEDIO — Requiere reestructurar el flujo del fetch. Testear que no se quede en loading infinito.
- **Verificación**: Abrir console, buscar "Contacts fetch already in-flight" — debería aparecer cuando múltiples vistas cargan

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [x] Completado  [ ] Verificado
```

---

## NIVEL 2 — IMPACTO ALTO (hacer después)

---

### P5: Dashboard dispara 16-19 queries SQL simultáneas
- **Archivo**: `hooks/useAdminMetrics.ts` líneas ~261-460
- **Impacto**: 4-8 segundos por carga del dashboard
- **Causa**: 16 queries base + 3 de período anterior, muchas redundantes

**Queries redundantes identificadas**:
1. Query [0] (contactos con created_at, origen) + Query [4] (contactos con es_calificado) + Query [6] (contactos con etapa_embudo) + Query [12] (contactos con metadata) + Query [13] (contactos con email) → **5 queries a wp_contactos** que podrían ser **1 sola** con más campos en el SELECT
2. Query [1] (citas count) + Query [8] (citas con estado) → **2 queries a wp_citas** que podrían ser **1 sola**
3. Query [14] (citas con contacto_id) es un subset de Query [8]

**Fix propuesto**: Crear un RPC `get_dashboard_metrics(p_empresa_id, p_date_from, p_date_to, p_team_ids)` que devuelve todo en 1 round trip. O al mínimo, consolidar las 5 queries de contactos en 1.

- **Riesgo**: MEDIO — Requiere cambios significativos pero el hook tiene buen error handling
- **Verificación**: Medir `[AdminMetrics] ✅ Dashboard loaded in Xms` antes y después

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

### P6: `ContactsFunnelView` dispara 5 fetches al montar (duplicados con preload)
- **Archivo**: `components/admin/ContactsFunnelView.tsx` líneas ~184-193
- **Impacto**: Queries duplicados en cada navegación a Contactos
- **Causa**: El componente llama `fetchContacts`, `fetchFunnelStages`, `fetchStageCounts`, `fetchTeamMembers`, `fetchEnterpriseAppointments` al montar, pero `preloadEnterpriseData` en AdminPanel ya llamó a 3 de esos.

**Código actual** (línea ~184):
```typescript
useEffect(() => {
  if (selectedEnterpriseId && !initialFetchDoneRef.current) {
    initialFetchDoneRef.current = true;
    fetchContacts();         // ← Ya llamado por preload
    fetchFunnelStages();     // ← Ya llamado por preload  
    fetchStageCounts();      // ← NUEVO, no en preload
    fetchTeamMembers();      // ← NUEVO, no en preload
    fetchEnterpriseAppointments(); // ← Ya llamado por preload
  }
}, [...]);
```

Los 3 duplicados (`fetchContacts`, `fetchFunnelStages`, `fetchEnterpriseAppointments`) tienen cache, así que SI los índices están creados, el cache debería funcionar. Pero sin índices, son fetches reales duplicados.

**Fix propuesto**: 
- Agregar `fetchStageCounts()` y `fetchTeamMembers()` al `preloadEnterpriseData` 
- Que el componente confíe en el cache (ya lo hace parcialmente)
- Los 5 fetches del componente se convierten en cache hits instantáneos

- **Riesgo**: BAJO — Solo reordena CUÁNDO se hacen los fetches
- **Verificación**: Los fetches muestran "Using cached" en console

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

### P7: Middleware ejecuta `getUser()` en CADA request
- **Archivo**: `middleware.ts` línea ~47
- **Impacto**: +100-300ms por cada request (páginas, APIs)
- **Causa**: `supabase.auth.getUser()` hace un round trip al servidor de Supabase Auth en cada request
- **Síntoma**: Latencia base elevada en toda la app

**Código actual**:
```typescript
const { data: { user } } = await supabase.auth.getUser();
```

**Fix propuesto**: Evaluar primero la ruta. Si no es protegida, no llamar getUser():
```typescript
const pathname = request.nextUrl.pathname;
const isProtectedPage = protectedPagePaths.some(path => pathname.startsWith(path));
const isProtectedApi = protectedApiPaths.some(path => pathname.startsWith(path));
const isPublicApi = publicApiPaths.some(path => pathname.startsWith(path));
const requiresAuth = isProtectedPage || (isProtectedApi && !isPublicApi);

// Solo verificar auth si la ruta lo requiere
const user = requiresAuth 
  ? (await supabase.auth.getUser()).data.user 
  : null;
```

- **Riesgo**: BAJO-MEDIO — Rutas públicas dejan de verificar auth (correcto), pero hay que asegurar que las rutas protegidas sigan funcionando
- **Verificación**: Medir TTFB (Time To First Byte) antes y después

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [x] Completado  [ ] Verificado
```

---

## NIVEL 3 — IMPACTO MEDIO (mejoras incrementales)

---

### P8: Engagement tracker inserta a DB en cada acción
- **Archivo**: `lib/engagement-tracker.ts` líneas ~220-269
- **Impacto**: +1 INSERT por cada page_view, action, feature_use
- **Causa**: `trackEvent()` hace INSERT a `wp_user_engagement` por cada evento
- **Mitigantes ya existentes**: Debounce de 2s, circuit breaker tras 2 fallos

**Observación**: El engagement tracker ya tiene buenas protecciones (debounce, circuit breaker). El impacto es menor porque los inserts son fire-and-forget (sin await visible al usuario). Sin embargo, en sesiones activas puede generar docenas de inserts.

**Fix propuesto (futuro)**: Batch inserts — acumular eventos en memoria y hacer un solo INSERT cada 30 segundos.

- **Riesgo**: BAJO
- **Prioridad**: Baja — las protecciones existentes son adecuadas

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

### P9: `chatStore` usa `await import()` dinámico en cada operación
- **Archivo**: `store/chatStore.ts` (6+ ubicaciones)
- **Impacto**: Overhead de microtasks por dynamic import en cada operación de chat
- **Causa**: Pattern repetido:
```typescript
const { createAuthenticatedClient } = await import('../lib/supabase');
const { useAuthStore } = await import('./authStore');
```

**Observación**: El cache de módulos de JS hace que los imports subsecuentes sean rápidos (~0.1ms). El `createAuthenticatedClient` ya cachea por token. El impacto es menor pero es código innecesariamente complejo.

**Fix propuesto**: Importar los módulos al tope del archivo:
```typescript
import { createAuthenticatedClient } from '../lib/supabase';
import { useAuthStore } from './authStore';
```

- **Riesgo**: BAJO — Solo cambia import dinámico a estático. Podría afectar tree-shaking mínimamente.
- **Nota**: Si el import dinámico se usó para evitar circular dependencies, verificar primero.

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

### P10: `fetchContactDetails` tiene 3 fases con 12 queries total
- **Archivo**: `store/contactStore.ts` líneas ~2247-2452
- **Impacto**: 1-3 segundos por cada apertura de detalle de contacto
- **Estructura actual**:
  - **Fase 1** (bloquea UI): 1 query profile + 4 queries paralelas (appointments, funnel, advisor, funnelStatus) = **5 queries**
  - **Fase 2** (background): 5 queries paralelas (conversations, multimedia, notes, tasks, services)
  - **Fase 3** (dependiente): 2 queries (transcripciones, mensajes) — depende de IDs de fase 1 y 2

**Observación**: La arquitectura de 3 fases es BUENA — la UI se desbloquea rápido en fase 1. Las fases 2 y 3 son background.

**Fix potencial**:
- Fase 1: Combinar profile + funnelStage + advisor en 1 query con JOINs
- No es urgente dado que la UI ya se desbloquea en fase 1

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

### P11: CalendarView re-suscribe a Realtime en cada cambio de fetchRange
- **Archivo**: `components/admin/CalendarView.tsx` líneas ~226-299
- **Impacto**: Canal realtime se destruye y recrea al navegar semanas/meses
- **Causa**: Las dependencias del useEffect incluyen `fetchRange.start` y `fetchRange.end`

**Código actual** (línea ~299):
```typescript
}, [selectedEnterpriseId, fetchRange.start, fetchRange.end, ...]);
```

**Fix propuesto**: El canal de realtime solo necesita `selectedEnterpriseId`. El `fetchRange` es para el fetch, no para la suscripción. Separar en 2 useEffects.

- **Riesgo**: BAJO
- **Prioridad**: Media

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

### P12: Super Search (scope=all) ejecuta hasta 10 queries por búsqueda
- **Archivo**: `store/contactStore.ts` líneas ~987-1266
- **Impacto**: 2-5 segundos por búsqueda profunda
- **Causa**: Busca en 7 fuentes + 2 pre-filtros de visibilidad + query final
- **Mitigantes**: Scope por defecto es `basic` (2-3 queries). `all` es opt-in.

**Observación**: El scope `basic` ya está optimizado (2 queries). Solo el `all` es pesado.

**Fix potencial (futuro)**: Crear función PostgreSQL `super_search(p_empresa_id, p_term, p_scope)` que haga todo server-side en 1 round trip.

```
ESTADO: [ ] Pendiente  [ ] En Progreso  [ ] Completado  [ ] Verificado
```

---

## Orden Recomendado de Implementación

| Prioridad | Ticket | Estimación | Riesgo |
|:---------:|--------|:----------:|:------:|
| 1 | **P1**: Ejecutar SQL de índices | 5 min | Bajo |
| 2 | **P2**: logActivity fire-and-forget | 2 min | Muy bajo |
| 3 | **P3**: Preload paralelo | 10 min | Bajo |
| 4 | **P4**: Fix lock deduplicación | 20 min | Medio |
| 5 | **P7**: Middleware lazy getUser | 10 min | Bajo-Medio |
| 6 | **P6**: Agregar fetchStageCounts+TeamMembers al preload | 10 min | Bajo |
| 7 | **P5**: Consolidar queries dashboard | 1-2h | Medio |
| 8 | **P9**: chatStore imports estáticos | 15 min | Bajo |
| 9 | **P11**: Separar realtime de fetchRange | 10 min | Bajo |
| 10 | **P10**: Optimizar fetchContactDetails | 30 min | Bajo |
| 11 | **P8**: Batch engagement inserts | 30 min | Bajo |
| 12 | **P12**: RPC para super search | 1h+ | Medio |

---

## Métricas de Referencia (Pre-Fix)

Registrar estos valores ANTES de aplicar fixes para medir mejora:

| Métrica | Valor Actual | Post-P1 | Post-P2+P3 | Post-All |
|---------|:---:|:---:|:---:|:---:|
| Dashboard load time | ___s | ___s | ___s | ___s |
| Contacts list load | ___s | ___s | ___s | ___s |
| Calendar load | ___s | ___s | ___s | ___s |
| Contact detail open | ___s | ___s | ___s | ___s |
| Search (basic) | ___s | ___s | ___s | ___s |
| Initial panel load | ___s | ___s | ___s | ___s |

> **Cómo medir**: Abrir Chrome DevTools → Console. Buscar los logs `[ContactStore] ✅ Loaded X contacts in Yms` y `[AdminMetrics] ✅ Dashboard loaded in Xms`.

---

## Notas Técnicas

### Sobre el cliente Supabase dual
Existen 2 rutas de creación de cliente:
1. **Singleton** en `lib/supabase-client.ts` — usado por `contactStore`, `adminMetrics`, etc.
2. **`createAuthenticatedClient()`** en `lib/supabase.ts` — usado por `chatStore` para el schema `adaptive_interface`

El `createAuthenticatedClient` ya cachea por token (Map). El warning "Multiple GoTrueClient instances" está mitigado pero no eliminado. No es causa de lentitud significativa.

### Sobre Realtime
Solo 2 suscripciones activas:
- `notificationsStore`: Canal `notifications-changes` (siempre activo)
- `CalendarView`: Canal `calendar-appointments-{enterpriseId}` (solo cuando calendario visible)

Impacto de realtime en rendimiento: **bajo**. Las suscripciones son livianas.

### Sobre `persist` middleware en stores
`contactStore` usa `persist` (localStorage) solo para `selectedEnterpriseId`. Payload mínimo.
`chatStore` usa `persist` (IndexedDB) para sesiones y mensajes. Puede ser pesado pero es asincrono.
