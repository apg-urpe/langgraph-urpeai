# CRM Toolset

Toolset para gestión de contactos, notas y embudo de ventas.

## 📁 Estructura

```
lib/ai/toolsets/crm/
├── index.ts          # Exports
├── toolset.ts        # CrmToolset class
├── README.md         # Esta documentación
└── tools/
    ├── index.ts      # Tools exports
    └── get-contacts.ts
```

## 🔧 Tools Disponibles

### `get_contacts`
Buscar y obtener contactos del CRM.

**Parámetros:**
| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `search` | string | No | Término de búsqueda |
| `estado` | enum | No | prospecto, cliente, inactivo, perdido |
| `es_calificado` | enum | No | si, no, evaluando |
| `is_active` | boolean | No | Si el contacto está activo |
| `etapa_embudo_id` | number | No | ID de la etapa del embudo |
| `asesor_id` | number | No | ID del asesor asignado |
| `limit` | number | No | Máximo de resultados (1-100, default: 10) |
| `order_by` | enum | No | nombre, created_at, ultima_interaccion |

**Ejemplo de uso:**
```typescript
const result = await orchestrator.execute('get_contacts', {
  search: 'Juan',
  estado: 'cliente',
  limit: 20
}, context);
```

## 🚧 Tools Pendientes (Fase 2)

- `search_contacts_deep` - Búsqueda profunda multi-fuente
- `get_contact_details` - Detalles completos de un contacto
- `get_contact_notes` - Notas de un contacto
- `create_note` - Crear nota en contacto

## 📋 Uso

```typescript
import { CrmToolset, createCrmToolset } from '@/lib/ai/toolsets/crm';

// Crear instancia
const crmToolset = createCrmToolset();

// Obtener tools
const tools = await crmToolset.getTools(context);

// O usar con el orchestrator
import { createToolOrchestrator } from '@/lib/ai/toolsets';

const orchestrator = createToolOrchestrator([
  createCrmToolset()
], supabase);
```
