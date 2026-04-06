---
title: "Plan de Unificación Data Layer Compartido (Tools + Dashboard)"
---

## 📋 Contexto Actual

### Arquitectura Existente

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DASHBOARD (UI)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  ContactsView   │  │  CalendarView   │  │   TasksView     │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │               │
│           ▼                    ▼                    ▼               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    ZUSTAND STORES                            │    │
│  │  contactStore.ts │ tareasStore.ts │ marketingStore.ts │ etc │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │           supabase-client.ts (Browser Client)                │    │
│  │           - Anon Key / User Session                          │    │
│  │           - RLS aplicado automáticamente                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        AGENTE MONICA (API)                          │
│  ┌─────────────────┐                                                 │
│  │  /api/chat      │ ──▶ Gemini Function Calling                    │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    tool-executor.ts                          │    │
│  │  executeGetContacts │ executeSearchContactsDeep │ etc        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │           Supabase Client (Service Role Key)                 │    │
│  │           - Acceso completo, sin RLS                         │    │
│  │           - Filtro manual por empresa_id                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Funciones Duplicadas Identificadas

| Funcionalidad | tool-executor.ts | contactStore.ts | Diferencias |
|---------------|------------------|-----------------|-------------|
| **Buscar contactos** | `executeGetContacts()` | `fetchContacts()` | Store tiene caching, paginación, scoring |
| **Búsqueda profunda** | `executeSearchContactsDeep()` | Super Search en `fetchContacts()` | Lógica de scoring similar pero independiente |
| **Obtener citas** | `executeGetAppointments()` | `fetchEnterpriseAppointments()` | Store integra Nylas, tool no |
| **Obtener conversaciones** | `executeGetConversations()` | `fetchConversationMessages()` | Store tiene más detalle |
| **Buscar mensajes** | `executeSearchMessages()` | Super Search (messages scope) | Mismo patrón duplicado |
| **Miembros de equipo** | `executeGetTeamMembers()` | `fetchTeamMembers()` | Casi idénticos |
| **Etapas embudo** | `executeGetFunnelStages()` | `fetchFunnelStages()` | Casi idénticos |
| **Notas de contacto** | `executeGetContactNotes()` | `fetchContactDetails()` | Store las incluye en detalle |

### Problema Principal

**Cada actualización debe hacerse en DOS lugares:**
1. Cambio de búsqueda `unaccent()` → Editar `contactStore.ts` Y `tool-executor.ts`
2. Nueva funcionalidad → Implementar en ambos archivos
3. Bug fix → Corregir en ambos lugares

---

## ⚠️ Posibles Problemas

### 1. **Cliente Supabase Diferente**
```typescript
// tool-executor.ts (Server-side, Service Role)
const supabase = createClient(url, SUPABASE_SERVICE_ROLE_KEY);

// contactStore.ts (Browser-side, Anon + Session)
import { supabase } from '../lib/supabase-client';
```

**Implicación**: Las funciones compartidas deben aceptar el cliente como parámetro.

### 2. **Contexto de Ejecución**
```typescript
// Tool: Recibe contexto explícito
executeGetContacts(args, { enterpriseId: 123, userId: 456 });

// Store: Usa estado global de Zustand
const { selectedEnterpriseId, userContext } = get();
```

**Implicación**: Las funciones base deben recibir contexto como parámetro, no leerlo de global.

### 3. **Caching y Estado**
- **Store**: Maneja cache con `lastFetch` timestamps y `PRELOAD_CACHE_MS`
- **Tool**: Sin cache, siempre consulta fresh

**Implicación**: El caching debe permanecer en la capa del store, no en las funciones base.

### 4. **Formato de Respuesta**
```typescript
// Tool: Retorna ToolResult para Gemini
return { success: true, data: { contacts: [...], count: 10 } };

// Store: Actualiza estado directamente
set({ contacts: [...], isLoading: false });
```

**Implicación**: Las funciones base retornan datos puros, cada capa los transforma.

### 5. **Tipos TypeScript**
- **Store**: Usa tipos de `types/contact.ts`
- **Tool**: Tipos inline o genéricos

**Implicación**: Unificar todos los tipos en archivos compartidos.

---

## 🎯 Propuesta: Data Access Layer (DAL)

### Nueva Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DASHBOARD (UI)                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    ZUSTAND STORES                            │    │
│  │  - Maneja estado global (contacts, loading, cache)           │    │
│  │  - Llama a DAL para operaciones de datos                     │    │
│  │  - Transforma respuestas para UI                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    📦 DATA ACCESS LAYER (DAL)                        │
│                       lib/dal/index.ts                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Funciones puras que reciben:                                │    │
│  │  - supabaseClient (cualquier tipo)                           │    │
│  │  - context: { enterpriseId, userId? }                        │    │
│  │  - args: filtros/parámetros específicos                      │    │
│  │                                                               │    │
│  │  Retornan: { data: T, error?: string }                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  lib/dal/                                                            │
│  ├── contacts.ts     # getContacts, searchContacts, getContactById   │
│  ├── appointments.ts # getAppointments, createAppointment            │
│  ├── conversations.ts # getConversations, searchMessages             │
│  ├── team.ts         # getTeamMembers, getTeamMember                 │
│  ├── funnel.ts       # getFunnelStages, getFunnelStats               │
│  ├── tasks.ts        # getTasks, createTask, updateTask              │
│  ├── notes.ts        # getNotes, createNote, updateNote              │
│  └── index.ts        # Re-exports todo                               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▲
┌──────────────────────────────┴──────────────────────────────────────┐
│                        AGENTE MONICA (API)                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    tool-executor.ts                          │    │
│  │  - Llama a DAL con service role client                       │    │
│  │  - Transforma respuestas para ToolResult                     │    │
│  │  - Añade mensajes descriptivos para el LLM                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Ejemplo de Implementación

#### 1. Función DAL Base (`lib/dal/contacts.ts`)

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

export interface DALContext {
  enterpriseId: number;
  userId?: number;
}

export interface GetContactsArgs {
  search?: string;
  estado?: string;
  es_calificado?: string;
  is_active?: boolean;
  etapa_embudo_id?: number;
  asesor_id?: number;
  limit?: number;
  order_by?: string;
}

export interface DALResult<T> {
  data: T | null;
  error: string | null;
  count?: number;
}

export async function getContacts(
  client: SupabaseClient,
  ctx: DALContext,
  args: GetContactsArgs = {}
): Promise<DALResult<Contact[]>> {
  try {
    const limit = Math.min(args.limit || 25, 100);
    
    let query = client
      .from('wp_contactos')
      .select('id, nombre, apellido, telefono, email, estado, es_calificado, ...')
      .eq('empresa_id', ctx.enterpriseId);

    // Búsqueda con unaccent (una sola implementación!)
    if (args.search) {
      const term = `%${args.search}%`;
      query = query.or(
        `unaccent(nombre).ilike.unaccent('${term}'),` +
        `unaccent(apellido).ilike.unaccent('${term}'),` +
        `unaccent(telefono).ilike.unaccent('${term}'),` +
        `unaccent(email).ilike.unaccent('${term}')`
      );
    }

    // Filtros
    if (args.estado) query = query.eq('estado', args.estado);
    if (args.es_calificado) query = query.eq('es_calificado', args.es_calificado);
    if (args.is_active !== undefined) query = query.eq('is_active', args.is_active);
    if (args.etapa_embudo_id) query = query.eq('etapa_embudo', args.etapa_embudo_id);
    if (args.asesor_id) query = query.eq('team_humano_id', args.asesor_id);

    // Ordenamiento
    const orderField = args.order_by || 'ultima_interaccion';
    query = query.order(orderField, { ascending: false, nullsFirst: false });
    query = query.limit(limit);

    const { data, error, count } = await query;
    
    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null, count: count || data?.length };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}
```

#### 2. Uso en Store (`contactStore.ts`)

```typescript
import { getContacts } from '@/lib/dal/contacts';
import { supabase } from '@/lib/supabase-client';

// En fetchContacts:
const result = await getContacts(supabase, {
  enterpriseId: selectedEnterpriseId,
  userId: userContext?.id
}, {
  search: filters.search,
  estado: filters.estado,
  asesor_id: filters.asesorId,
  limit: pagination.pageSize
});

if (result.error) {
  set({ error: result.error, isLoading: false });
  return;
}

set({ 
  contacts: result.data!, 
  isLoading: false,
  contactsLastFetch: Date.now() // Caching permanece en store
});
```

#### 3. Uso en Tool (`tool-executor.ts`)

```typescript
import { getContacts } from '@/lib/dal/contacts';

export async function executeGetContacts(args: any, ctx: ToolContext): Promise<ToolResult> {
  const result = await getContacts(supabase, {
    enterpriseId: ctx.enterpriseId,
    userId: ctx.userId
  }, args);

  if (result.error) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      contacts: result.data,
      count: result.count,
      message: result.count 
        ? `Encontré ${result.count} contacto(s)` 
        : 'No se encontraron contactos'
    }
  };
}
```

---

## 📊 Análisis de Viabilidad

| Aspecto | Viabilidad | Notas |
|---------|------------|-------|
| **Técnico** | ✅ Alta | Supabase client es agnóstico, funciones puras son portables |
| **Esfuerzo** | ⚠️ Medio | ~2-3 días para migrar funciones existentes |
| **Riesgo** | ⚠️ Bajo-Medio | Requiere testing cuidadoso de ambos flujos |
| **Beneficio** | ✅ Alto | Elimina duplicación, un solo lugar para updates |
| **Mantenibilidad** | ✅ Alto | Código más limpio y predecible |

---

## 📅 Micro Plan de Implementación

### Fase 1: Infraestructura Base (1 día)
1. Crear `lib/dal/` con estructura de archivos
2. Definir interfaces comunes (`DALContext`, `DALResult<T>`)
3. Crear tipos compartidos en `types/dal.ts`
4. Implementar `lib/dal/contacts.ts` como piloto

### Fase 2: Migrar Funciones de Contactos (1 día)
1. Mover lógica de `getContacts` a DAL
2. Mover `searchContactsDeep` a DAL
3. Actualizar `contactStore.ts` para usar DAL
4. Actualizar `tool-executor.ts` para usar DAL
5. Testing: Verificar búsquedas en UI y agente

### Fase 3: Migrar Resto de Funciones (1-2 días)
1. `appointments.ts`: getAppointments, createAppointment
2. `conversations.ts`: getConversations, searchMessages
3. `team.ts`: getTeamMembers
4. `funnel.ts`: getFunnelStages, getFunnelStats
5. `notes.ts`: getNotes, createNote
6. `tasks.ts`: getTasks, createTask

### Fase 4: Limpieza y Documentación (0.5 días)
1. Eliminar código duplicado de stores
2. Actualizar README en `lib/dal/`
3. Agregar tests unitarios para funciones DAL

---

## ✅ Beneficios Esperados

1. **Single Source of Truth**: Una sola implementación de búsquedas, filtros, etc.
2. **Actualizaciones Unificadas**: Cambios como `unaccent()` se hacen una vez
3. **Testing Simplificado**: Funciones puras son fáciles de testear
4. **Consistencia**: Mismo comportamiento en UI y agente
5. **Onboarding**: Nuevos devs entienden mejor la arquitectura

---

## 🔄 Decisión Requerida

**¿Proceder con la implementación del DAL?**

- **Opción A**: Implementar Fase 1+2 (contactos) como prueba piloto
- **Opción B**: Implementar todo el DAL de una vez
- **Opción C**: Mantener arquitectura actual (aceptar duplicación)

**Recomendación**: Opción A - Piloto con contactos, validar el patrón, luego extender.

---

## ✅ Estado de Implementación del Piloto

### Fase 1: Completada ✅
- [x] `types/dal.ts` - Tipos compartidos
- [x] `lib/dal/contacts.ts` - Funciones `getContacts`, `searchContactsDeep`, `getContactById`
- [x] `lib/dal/index.ts` - Exports
- [x] `lib/dal/README.md` - Documentación

### Fase 2: Parcialmente Completada
- [x] `tool-executor.ts` - **Migrado a DAL** ✅
  - `executeGetContacts()` ahora usa `getContacts()` del DAL
  - `executeSearchContactsDeep()` ahora usa `searchContactsDeep()` del DAL
- [ ] `contactStore.ts` - **Pendiente para Fase 3**
  - El store tiene lógica adicional (cache, paginación, scope "basic")
  - Las queries ya usan `unaccent()` gracias a la actualización anterior
  - Migración completa requiere refactorización más extensa

### Próximos Pasos (Fase 3)
1. Refactorizar `contactStore.fetchContacts()` para usar DAL
2. Crear `lib/dal/appointments.ts`
3. Crear `lib/dal/conversations.ts`
4. Migrar otras tools del agente al DAL

### Beneficio Inmediato
- **Tool Executor**: Ahora usa el DAL, cualquier mejora en `lib/dal/contacts.ts` beneficia al agente
- **Store**: Tiene la misma lógica de `unaccent()` aplicada directamente
- **Un solo cambio**: Futuras mejoras a búsquedas se hacen en el DAL y automáticamente benefician al agente
