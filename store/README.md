# Stores - Urpe AI Lab

Colección de stores Zustand para gestión de estado global. Cada store maneja un dominio específico de la aplicación con persistencia, caché y optimizaciones de rendimiento.

## Índice de Stores

| Store | Tamaño | Dominio | Persistencia |
|-------|--------|---------|--------------|
| `contactStore.ts` | 137KB | CRM Contactos, Empresas, Citas | Partial (localStorage) |
| `chatStore.ts` | 37KB | Sesiones de chat con Monica | IndexedDB |
| `authStore.ts` | 7KB | Autenticación Firebase | localStorage |
| `adminStore.ts` | 15KB | Panel de administración | localStorage |
| `teamStore.ts` | 27KB | Equipos, roles, permisos | localStorage |
| `notificationsStore.ts` | 28KB | Notificaciones en tiempo real | No |
| `artifactStore.ts` | 27KB | Artefactos generados por AI | No |
| `agentsStore.ts` | 17KB | Configuración de agentes AI | No |
| `tareasStore.ts` | 48KB | Gestión de tareas y proyectos | No |
| `proyectosStore.ts` | 22KB | Proyectos (legacy) | No |
| `financeStore.ts` | 23KB | Finanzas y presupuestos | No |
| `invoiceStore.ts` | 11KB | Facturación | No |
| `emailStore.ts` | 15KB | Email y comunicaciones | No |
| `emailMarketingStore.ts` | 33KB | Marketing por email | No |
| `gamificationStore.ts` | 33KB | Gamificación y logros | No |
| `deepResearchStore.ts` | 15KB | Deep Research Jobs | No |
| `monicaRolesStore.ts` | 16KB | Roles conversacionales de Monica | No |
| `languageStore.ts` | <1KB | Idioma de la UI | localStorage |

---

## Jerarquía de Dependencias

```
authStore (raíz)
    │
    ├──> contactStore (requiere auth)
    │       │
    │       ├──> notificationsStore
    │       ├──> teamStore
    │       └──> adminStore
    │
    └──> chatStore (independiente)
            │
            └──> agentsStore (tools de chat)

Stores de feature (independientes):
    ├──> artifactStore
    ├──> tareasStore
    ├──> financeStore
    ├──> emailMarketingStore
    └──> gamificationStore
```

---

## Stores Core (Críticos)

### `authStore.ts`

Autenticación con Firebase Auth.

```typescript
const { user, session, signIn, signOut } = useAuthStore();
```

**Estado:**
- `user` - Usuario Firebase
- `session` - Token JWT
- `isLoading` - Estado de carga

**Persistencia:** localStorage (token de sesión)

---

### `contactStore.ts`

Store más grande y crítico. Gestiona contactos CRM, empresas, funnel de ventas.

```typescript
const { 
  contacts, 
  selectedContact, 
  fetchContacts,
  selectedEnterpriseId 
} = useContactStore();
```

**Estado principal:**
- `contacts` - Lista paginada de contactos
- `selectedContact` - Contacto en detalle
- `enterprises` - Empresas disponibles
- `selectedEnterpriseId` - Empresa actual (multi-tenancy)
- `funnelStages` - Etapas del embudo

**Features:**
- Auto-linking de usuarios por email
- Modo observación Dev Team (rol_id = 1)
- Caché inteligente (5 minutos)
- Prevención de race conditions

**Persistencia:** `selectedEnterpriseId`, filtros

---

### `chatStore.ts`

Sesiones de chat con Monica AI.

```typescript
const { 
  sessions, 
  activeSessionId,
  createSession,
  addMessage 
} = useChatStore();
```

**Estado:**
- `sessions` - Mapa de sesiones por ID
- `activeSessionId` - Sesión actual
- `attachments` - Archivos adjuntos

**Persistencia:** IndexedDB (soporta imágenes grandes)

---

## Stores de Soporte

### `teamStore.ts`

Gestión de equipos y miembros.

```typescript
const { teamMembers, currentTeam, fetchTeamMembers } = useTeamStore();
```

### `notificationsStore.ts`

Notificaciones en tiempo real vía Supabase Realtime.

```typescript
const { notifications, unreadCount, markAsRead } = useNotificationsStore();
```

### `adminStore.ts`

Panel de administración y métricas.

```typescript
const { metrics, filters, fetchMetrics } = useAdminStore();
```

---

## Stores de Feature

### `tareasStore.ts` + `proyectosStore.ts`

Gestión de tareas y proyectos.

### `financeStore.ts` + `invoiceStore.ts`

Finanzas, presupuestos y facturación.

### `gamificationStore.ts`

Sistema de logros, badges y puntos.

### `emailMarketingStore.ts`

Campañas de email marketing.

### `deepResearchStore.ts`

Deep Research Jobs con polling.

---

## Patrones Comunes

### Selectores Optimizados

```typescript
// Evita re-renders innecesarios
const contacts = useContactStore(state => state.contacts);
const selectFilteredContacts = useContactStore(
  state => state.selectFilteredContacts
);
```

### Acciones Async

```typescript
// Todas las acciones de fetch retornan Promise
await useContactStore.getState().fetchContacts();

// Manejo de errores integrado
const { error } = useContactStore.getState();
if (error) console.error(error);
```

### Persistencia Selectiva

```typescript
// Solo persistir campos específicos
persist(middleware, {
  name: 'store-name',
  partialize: (state) => ({ 
    selectedId: state.selectedId,
    filters: state.filters 
  })
})
```

---

## Rendimiento

| Optimización | Stores Aplicados |
|-------------|------------------|
| Selectores memoizados | contactStore, teamStore |
| Lazy loading | artifactStore, chatStore |
| IndexedDB para blobs | chatStore |
| Caché temporal (5min) | contactStore |
| Debounce en búsquedas | contactStore, tareasStore |
| LRU para listas | contactStore (150 items) |

---

## Testing

```typescript
// Resetear store en tests
beforeEach(() => {
  useContactStore.setState(useContactStore.getInitialState());
});

// Mock de stores
jest.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: { id: '123' } })
}));
```

---

## Convenciones

### Estructura de Store

```typescript
interface State {
  // Data
  items: Item[];
  selectedItem: Item | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchItems: () => Promise<void>;
  selectItem: (id: string) => void;
}
```

### Naming

- **Estado:** camelCase (`contacts`, `isLoading`)
- **Acciones:** verbo + sustantivo (`fetchContacts`, `setSelectedContact`)
- **Selectores:** prefijo `select` (`selectFilteredContacts`)

---

*Última actualización: 2026-02-03*
