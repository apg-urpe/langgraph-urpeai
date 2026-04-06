# React Best Practices para Urpe AI Lab

**Versión 1.0.0** | Enero 2026  
**Basado en**: [Vercel Engineering React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)

---

## Resumen

Esta guía contiene **40+ reglas** organizadas en 8 categorías, priorizadas por impacto:
- **CRITICAL**: Eliminar waterfalls, optimizar bundle
- **HIGH**: Performance del servidor
- **MEDIUM**: Re-renders, rendering
- **LOW**: Patrones avanzados

---

## Tabla de Contenidos

1. [Eliminar Waterfalls](#1-eliminar-waterfalls) — **CRITICAL**
2. [Optimización de Bundle](#2-optimización-de-bundle) — **CRITICAL**
3. [Performance del Servidor](#3-performance-del-servidor) — **HIGH**
4. [Data Fetching del Cliente](#4-data-fetching-del-cliente) — **MEDIUM-HIGH**
5. [Optimización de Re-renders](#5-optimización-de-re-renders) — **MEDIUM**
6. [Performance de Rendering](#6-performance-de-rendering) — **MEDIUM**
7. [Performance de JavaScript](#7-performance-de-javascript) — **LOW-MEDIUM**
8. [Patrones Avanzados](#8-patrones-avanzados) — **LOW**

---

## 1. Eliminar Waterfalls

**Impacto: CRITICAL** — Los waterfalls son el #1 killer de performance.

### 1.1 Diferir Await Hasta que Sea Necesario

Mueve `await` a las ramas donde realmente se usa.

```typescript
// ❌ INCORRECTO: Bloquea ambas ramas
async function handleRequest(userId: string, skipProcessing: boolean) {
  const userData = await fetchUserData(userId)
  
  if (skipProcessing) {
    return { skipped: true } // Esperó innecesariamente
  }
  
  return processUserData(userData)
}

// ✅ CORRECTO: Solo bloquea cuando es necesario
async function handleRequest(userId: string, skipProcessing: boolean) {
  if (skipProcessing) {
    return { skipped: true } // Retorna inmediatamente
  }
  
  const userData = await fetchUserData(userId)
  return processUserData(userData)
}
```

### 1.2 Promise.all() para Operaciones Independientes

**Mejora: 2-10×** cuando las operaciones no dependen entre sí.

```typescript
// ❌ INCORRECTO: Ejecución secuencial (3 round trips)
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()

// ✅ CORRECTO: Ejecución paralela (1 round trip)
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```

#### Aplicación en Urpe AI Lab

```typescript
// ❌ Actual en algunos stores
async function loadContactDetail(contactId: number) {
  const contact = await fetchContact(contactId)
  const conversations = await fetchConversations(contactId)
  const appointments = await fetchAppointments(contactId)
  const notes = await fetchNotes(contactId)
  // Total: 4 round trips secuenciales
}

// ✅ Optimizado
async function loadContactDetail(contactId: number) {
  const [contact, conversations, appointments, notes] = await Promise.all([
    fetchContact(contactId),
    fetchConversations(contactId),
    fetchAppointments(contactId),
    fetchNotes(contactId)
  ])
  // Total: 1 round trip (paralelo)
}
```

### 1.3 Prevenir Waterfalls en API Routes

Inicia operaciones independientes inmediatamente.

```typescript
// ❌ INCORRECTO: config espera auth, data espera ambos
export async function GET(request: Request) {
  const session = await auth()
  const config = await fetchConfig()
  const data = await fetchData(session.user.id)
  return Response.json({ data, config })
}

// ✅ CORRECTO: auth y config inician juntos
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  
  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ])
  return Response.json({ data, config })
}
```

---

## 2. Optimización de Bundle

**Impacto: CRITICAL** — Reduce tiempo de carga inicial.

### 2.1 Evitar Barrel File Imports

Los barrel files (`index.ts`) pueden incluir todo el módulo aunque solo uses una función.

```typescript
// ❌ INCORRECTO: Carga TODO lucide-react
import { Search, Plus, X } from 'lucide-react'

// ✅ CORRECTO: Solo carga los iconos usados
import Search from 'lucide-react/dist/esm/icons/search'
import Plus from 'lucide-react/dist/esm/icons/plus'
import X from 'lucide-react/dist/esm/icons/x'
```

> **Nota**: Next.js 14+ tiene `optimizePackageImports` que maneja esto automáticamente para `lucide-react`.

### 2.2 Dynamic Imports para Componentes Pesados

**Ya implementado en AdminPanel.tsx** ✅

```typescript
// AdminPanel.tsx - Ejemplo actual (correcto)
const DashboardView = lazy(() => import('./DashboardView'))
const ContactsFunnelView = lazy(() => import('./ContactsFunnelView'))
const CalendarView = lazy(() => import('./CalendarView'))
// etc.
```

### 2.3 Carga Condicional de Módulos

Solo carga módulos cuando realmente se necesitan.

```typescript
// ❌ INCORRECTO: Monaco siempre se carga
import MonacoEditor from '@monaco-editor/react'

function CodeBlock({ code, isEditable }) {
  return isEditable 
    ? <MonacoEditor value={code} />
    : <pre>{code}</pre>
}

// ✅ CORRECTO: Monaco solo se carga si es editable
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { loading: () => <div>Cargando editor...</div> }
)

function CodeBlock({ code, isEditable }) {
  return isEditable 
    ? <MonacoEditor value={code} />
    : <pre>{code}</pre>
}
```

### 2.4 Preload Basado en Intención del Usuario

```typescript
// Precargar componente en hover (antes del click)
function NavItem({ href, children }) {
  const prefetchComponent = () => {
    // Precarga el chunk del componente
    import('./HeavyComponent')
  }
  
  return (
    <Link 
      href={href}
      onMouseEnter={prefetchComponent}
      onFocus={prefetchComponent}
    >
      {children}
    </Link>
  )
}
```

---

## 3. Performance del Servidor

**Impacto: HIGH**

### 3.1 Cache con LRU para Cross-Request

Usa `lru-cache` para datos que se comparten entre requests.

```typescript
import { LRUCache } from 'lru-cache'

const configCache = new LRUCache<string, Config>({
  max: 100,
  ttl: 1000 * 60 * 5 // 5 minutos
})

export async function getConfig(tenantId: string) {
  const cached = configCache.get(tenantId)
  if (cached) return cached
  
  const config = await fetchConfigFromDB(tenantId)
  configCache.set(tenantId, config)
  return config
}
```

### 3.2 Per-Request Deduplication con React.cache()

```typescript
import { cache } from 'react'

// Se deduplica automáticamente dentro del mismo request
export const getUser = cache(async (userId: string) => {
  return await db.user.findUnique({ where: { id: userId } })
})

// Ambos componentes comparten la misma llamada
async function Header() {
  const user = await getUser(userId) // Primera llamada
  return <div>{user.name}</div>
}

async function Sidebar() {
  const user = await getUser(userId) // Usa resultado cacheado
  return <nav>{user.role}</nav>
}
```

### 3.3 Minimizar Serialización en RSC Boundaries

```typescript
// ❌ INCORRECTO: Pasa objeto completo
async function Dashboard() {
  const data = await fetchFullData() // { user, posts, comments, settings, logs... }
  return <ClientComponent data={data} />
}

// ✅ CORRECTO: Solo pasa lo necesario
async function Dashboard() {
  const { user, posts } = await fetchFullData()
  return <ClientComponent user={user} postCount={posts.length} />
}
```

---

## 4. Data Fetching del Cliente

**Impacto: MEDIUM-HIGH**

### 4.1 Usar SWR para Deduplicación Automática

```typescript
import useSWR from 'swr'

// Múltiples componentes pueden llamar esto sin duplicar requests
function useUser(userId: string) {
  return useSWR(`/api/users/${userId}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000 // 5 segundos
  })
}
```

#### Recomendación para Urpe AI Lab

Considerar migrar fetching repetitivo a SWR:

```typescript
// Actual: Zustand con manual fetching
const contacts = useContactStore(state => state.contacts)

// Alternativa con SWR para mejor caching/deduplication
const { data: contacts, mutate } = useSWR(
  `/api/contacts?empresa=${empresaId}`,
  fetcher,
  { revalidateOnFocus: false }
)
```

### 4.2 Event Listeners Pasivos para Scroll

```typescript
// ❌ INCORRECTO: Bloquea scroll
element.addEventListener('scroll', handler)

// ✅ CORRECTO: No bloquea scroll
element.addEventListener('scroll', handler, { passive: true })

// En React:
<div onScroll={handler} /> // React no soporta passive directamente

// Usar useEffect para control completo:
useEffect(() => {
  const el = ref.current
  el?.addEventListener('scroll', handler, { passive: true })
  return () => el?.removeEventListener('scroll', handler)
}, [])
```

### 4.3 Versionar y Minimizar localStorage

```typescript
// ❌ INCORRECTO: Sin versión, datos crecen sin control
localStorage.setItem('userData', JSON.stringify(hugeObject))

// ✅ CORRECTO: Versionado + datos mínimos
const STORAGE_VERSION = 2
const STORAGE_KEY = 'urpe_user_v2'

interface StoredData {
  version: number
  userId: number
  preferences: { theme: string; lang: string }
  // Solo datos esenciales
}

function saveUserData(data: StoredData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...data,
    version: STORAGE_VERSION
  }))
}

function loadUserData(): StoredData | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  
  const data = JSON.parse(raw)
  if (data.version !== STORAGE_VERSION) {
    localStorage.removeItem(STORAGE_KEY) // Migrar o limpiar
    return null
  }
  return data
}
```

---

## 5. Optimización de Re-renders

**Impacto: MEDIUM**

### 5.1 Diferir Lecturas de Estado al Punto de Uso

```typescript
// ❌ INCORRECTO: Componente padre re-renderiza innecesariamente
function Parent() {
  const theme = useStore(state => state.theme) // Re-render en cada cambio de theme
  return <Child theme={theme} />
}

// ✅ CORRECTO: Solo Child re-renderiza
function Parent() {
  return <Child />
}

function Child() {
  const theme = useStore(state => state.theme) // Aislado
  return <div className={theme}>...</div>
}
```

### 5.2 Selectores Granulares en Zustand

**Crítico para Urpe AI Lab** - Ya usan selectores, pero revisar:

```typescript
// ❌ INCORRECTO: Re-render en cualquier cambio del store
const state = useContactStore()

// ✅ CORRECTO: Solo re-render cuando cambia lo específico
const contacts = useContactStore(state => state.contacts)
const isLoading = useContactStore(state => state.isLoading)

// ✅ MEJOR: Selector memoizado para datos derivados
const activeContacts = useContactStore(
  state => state.contacts.filter(c => c.is_active)
)
```

### 5.3 Extraer a Componentes Memoizados

```typescript
// ❌ INCORRECTO: Lista completa re-renderiza en cada cambio
function ContactList({ contacts, onSelect }) {
  return contacts.map(contact => (
    <div key={contact.id} onClick={() => onSelect(contact)}>
      {contact.name}
    </div>
  ))
}

// ✅ CORRECTO: Cada item se memoiza individualmente
const ContactItem = React.memo(function ContactItem({ contact, onSelect }) {
  return (
    <div onClick={() => onSelect(contact)}>
      {contact.name}
    </div>
  )
})

function ContactList({ contacts, onSelect }) {
  const handleSelect = useCallback((contact) => onSelect(contact), [onSelect])
  
  return contacts.map(contact => (
    <ContactItem 
      key={contact.id} 
      contact={contact} 
      onSelect={handleSelect} 
    />
  ))
}
```

### 5.4 Usar Functional setState

```typescript
// ❌ INCORRECTO: Puede causar race conditions
const [count, setCount] = useState(0)
setCount(count + 1)
setCount(count + 1) // Ambos usan el mismo valor de count

// ✅ CORRECTO: Siempre usa el valor más reciente
setCount(prev => prev + 1)
setCount(prev => prev + 1) // Correctamente incrementa 2 veces
```

### 5.5 Lazy State Initialization

```typescript
// ❌ INCORRECTO: Se ejecuta en cada render
const [data, setData] = useState(expensiveComputation())

// ✅ CORRECTO: Solo se ejecuta una vez
const [data, setData] = useState(() => expensiveComputation())
```

### 5.6 useTransition para Updates No Urgentes

```typescript
import { useTransition } from 'react'

function SearchResults({ query }) {
  const [isPending, startTransition] = useTransition()
  const [results, setResults] = useState([])
  
  const handleSearch = (newQuery) => {
    // Input se actualiza inmediatamente
    setQuery(newQuery)
    
    // Resultados se actualizan sin bloquear UI
    startTransition(() => {
      setResults(filterResults(newQuery))
    })
  }
  
  return (
    <div>
      <input onChange={e => handleSearch(e.target.value)} />
      {isPending ? <Spinner /> : <ResultList results={results} />}
    </div>
  )
}
```

---

## 6. Performance de Rendering

**Impacto: MEDIUM**

### 6.1 CSS content-visibility para Listas Largas

```css
/* Para listas con muchos items (100+) */
.contact-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px; /* Altura estimada del item */
}
```

### 6.2 Hoisting de Elementos JSX Estáticos

```typescript
// ❌ INCORRECTO: Se recrea en cada render
function Component() {
  const icon = <SearchIcon className="w-4 h-4" />
  return <div>{icon}</div>
}

// ✅ CORRECTO: Creado una vez fuera del componente
const SearchIconElement = <SearchIcon className="w-4 h-4" />

function Component() {
  return <div>{SearchIconElement}</div>
}
```

### 6.3 Conditional Rendering Explícito

```typescript
// ❌ INCORRECTO: Puede renderizar 0 o ""
{count && <span>{count} items</span>}  // Renderiza "0" si count es 0
{text && <span>{text}</span>}          // Renderiza "" si text es ""

// ✅ CORRECTO: Siempre boolean
{count > 0 && <span>{count} items</span>}
{text !== '' && <span>{text}</span>}
{Boolean(items.length) && <List items={items} />}
```

### 6.4 Virtualización para Listas Largas

**Ya implementado con react-window** ✅

```typescript
// Actual en el proyecto (correcto)
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={400}
  width="100%"
  itemCount={contacts.length}
  itemSize={72}
>
  {({ index, style }) => (
    <ContactRow contact={contacts[index]} style={style} />
  )}
</FixedSizeList>
```

---

## 7. Performance de JavaScript

**Impacto: LOW-MEDIUM**

### 7.1 Set/Map para Lookups O(1)

```typescript
// ❌ INCORRECTO: O(n) por cada búsqueda
const allowedIds = ['a', 'b', 'c', ...]
items.filter(item => allowedIds.includes(item.id)) // O(n²)

// ✅ CORRECTO: O(1) por cada búsqueda
const allowedIds = new Set(['a', 'b', 'c', ...])
items.filter(item => allowedIds.has(item.id)) // O(n)
```

### 7.2 Index Maps para Lookups Repetidos

```typescript
// ❌ INCORRECTO: Busca cada vez
function getUser(users: User[], id: string) {
  return users.find(u => u.id === id) // O(n)
}

// ✅ CORRECTO: Construir índice una vez
const userMap = new Map(users.map(u => [u.id, u]))

function getUser(id: string) {
  return userMap.get(id) // O(1)
}
```

### 7.3 toSorted() en lugar de sort() para Inmutabilidad

```typescript
// ❌ INCORRECTO: Muta el array original (bug con React state)
const sorted = users.sort((a, b) => a.name.localeCompare(b.name))

// ✅ CORRECTO: Crea nuevo array
const sorted = users.toSorted((a, b) => a.name.localeCompare(b.name))

// Fallback para browsers antiguos:
const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name))
```

### 7.4 Early Return para Evitar Cómputo Innecesario

```typescript
// ❌ INCORRECTO: Procesa todo aunque encuentre error
function validateUsers(users: User[]) {
  let hasError = false
  for (const user of users) {
    if (!user.email) hasError = true
    if (!user.name) hasError = true
  }
  return !hasError
}

// ✅ CORRECTO: Retorna inmediatamente
function validateUsers(users: User[]) {
  for (const user of users) {
    if (!user.email) return { valid: false, error: 'Email required' }
    if (!user.name) return { valid: false, error: 'Name required' }
  }
  return { valid: true }
}
```

### 7.5 Hoisting de RegExp

```typescript
// ❌ INCORRECTO: Nueva RegExp en cada render
function Highlighter({ text, query }) {
  const regex = new RegExp(`(${query})`, 'gi') // Recreada cada vez
  return text.split(regex).map(...)
}

// ✅ CORRECTO: Memoizada
function Highlighter({ text, query }) {
  const regex = useMemo(
    () => new RegExp(`(${escapeRegex(query)})`, 'gi'),
    [query]
  )
  return text.split(regex).map(...)
}
```

### 7.6 Combinar Iteraciones de Array

```typescript
// ❌ INCORRECTO: 3 iteraciones
const active = users.filter(u => u.active)
const verified = active.filter(u => u.verified)
const sorted = verified.sort((a, b) => a.name.localeCompare(b.name))

// ✅ CORRECTO: 1 iteración + sort
const result = users
  .filter(u => u.active && u.verified)
  .toSorted((a, b) => a.name.localeCompare(b.name))
```

---

## 8. Patrones Avanzados

**Impacto: LOW** — Para casos específicos.

### 8.1 useLatest para Callbacks Estables

```typescript
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

// Uso: Evita re-suscripciones en effects
function SearchInput({ onSearch }) {
  const [query, setQuery] = useState('')
  const onSearchRef = useLatest(onSearch)
  
  useEffect(() => {
    const timeout = setTimeout(() => onSearchRef.current(query), 300)
    return () => clearTimeout(timeout)
  }, [query]) // onSearch no está en deps, pero siempre usa la versión actual
}
```

### 8.2 Event Handlers en Refs

```typescript
// ❌ INCORRECTO: Re-suscribe en cada cambio de handler
function useWindowEvent(event: string, handler: () => void) {
  useEffect(() => {
    window.addEventListener(event, handler)
    return () => window.removeEventListener(event, handler)
  }, [event, handler]) // handler causa re-suscripción
}

// ✅ CORRECTO: Suscripción estable
function useWindowEvent(event: string, handler: () => void) {
  const handlerRef = useLatest(handler)
  
  useEffect(() => {
    const listener = (e: Event) => handlerRef.current()
    window.addEventListener(event, listener)
    return () => window.removeEventListener(event, listener)
  }, [event]) // Solo re-suscribe si event cambia
}
```

---

## Checklist de Revisión para Urpe AI Lab

### 🔴 Prioridad Alta

- [ ] **Revisar stores**: Buscar `await` secuenciales que puedan paralelizarse
- [ ] **API routes**: Verificar que operaciones independientes usen `Promise.all()`
- [ ] **Selectores Zustand**: Asegurar selectores granulares en componentes pesados
- [ ] **contactStore**: Optimizar `loadContactDetail` con Promise.all()

### 🟡 Prioridad Media

- [ ] **Memoización**: Agregar `React.memo` a items de listas largas
- [ ] **Callbacks**: Usar `useCallback` en handlers pasados a listas
- [ ] **Effects**: Revisar dependencias innecesarias en useEffect
- [ ] **Derived state**: Usar selectores memoizados para filtros/ordenamiento

### 🟢 Prioridad Baja

- [ ] **CSS content-visibility**: Aplicar a listas con 50+ items
- [ ] **Index maps**: Crear para lookups frecuentes de contactos/team members
- [ ] **Hoisting**: Mover JSX estático fuera de componentes

---

## Referencias

1. [React Documentation](https://react.dev)
2. [Next.js Documentation](https://nextjs.org)
3. [SWR](https://swr.vercel.app)
4. [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills)
5. [How Vercel Made Dashboard 2× Faster](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
