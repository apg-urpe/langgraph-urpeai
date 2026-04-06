# Data Access Layer (DAL)

## Propósito

Capa de acceso a datos **compartida** entre:
- **UI (Zustand Stores)**: `contactStore.ts`, `tareasStore.ts`, etc.
- **Agente IA (Tool Executor)**: `tool-executor.ts`

## Problema que Resuelve

Antes, las mismas consultas existían en dos lugares:
- `contactStore.ts` → Búsqueda para el dashboard
- `tool-executor.ts` → Búsqueda para el agente

Esto causaba que actualizaciones (ej: agregar `unaccent()`) debían hacerse en **dos lugares**.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD (UI)                 │  AGENTE MONICA (API)      │
│  contactStore.ts                │  tool-executor.ts         │
│       │                         │       │                   │
│       ▼                         │       ▼                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           DATA ACCESS LAYER (DAL)                    │   │
│  │           lib/dal/contacts.ts                        │   │
│  │           lib/dal/appointments.ts (futuro)           │   │
│  │           ...                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│       │                         │       │                   │
│       ▼                         │       ▼                   │
│  supabase-client (Anon)         │  supabase (Service Role)  │
└─────────────────────────────────────────────────────────────┘
```

## Uso

### En Stores (Browser)

```typescript
import { getContacts, searchContactsDeep } from '@/lib/dal';
import { supabase } from '@/lib/supabase-client';

// En una acción del store:
const result = await getContacts(supabase, {
  enterpriseId: selectedEnterpriseId,
  userId: userContext?.id
}, {
  search: filters.search,
  estado: filters.estado,
  limit: 25
});

if (result.error) {
  set({ error: result.error });
  return;
}

set({ contacts: result.data });
```

### En Tool Executor (Server)

```typescript
import { getContacts, searchContactsDeep } from '@/lib/dal';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, SERVICE_ROLE_KEY);

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
      message: `Encontré ${result.count} contacto(s)`
    }
  };
}
```

## Funciones Disponibles

### contacts.ts

| Función | Descripción |
|---------|-------------|
| `getContacts(client, ctx, args)` | Obtener contactos con filtros |
| `searchContactsDeep(client, ctx, args)` | Búsqueda profunda multi-fuente |
| `getContactById(client, ctx, id)` | Obtener un contacto por ID |

### Tipos

```typescript
interface DALContext {
  enterpriseId: number;
  userId?: number;
}

interface DALResult<T> {
  data: T | null;
  error: string | null;
  count?: number;
}
```

## Principios de Diseño

1. **Funciones Puras**: No dependen de estado global
2. **Cliente como Parámetro**: Acepta cualquier cliente Supabase
3. **Contexto Explícito**: `enterpriseId` siempre requerido
4. **Retorno Estándar**: `{ data, error, count }`
5. **Un Solo Lugar**: Lógica de búsqueda centralizada

## Extensión Futura

Para agregar más funciones, crear archivos en `lib/dal/`:
- `appointments.ts`
- `conversations.ts`
- `team.ts`
- `notes.ts`
- `tasks.ts`

Y exportarlos desde `index.ts`.
