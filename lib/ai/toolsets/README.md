# MCP-Inspired Tool System

Sistema profesional de tools para Monica AI, inspirado en **Google ADK** y **Model Context Protocol (MCP)**.

## 📁 Estructura

```
lib/ai/toolsets/
├── index.ts          # Exports principales
├── types.ts          # Tipos e interfaces core
├── orchestrator.ts   # ToolOrchestrator central
├── utils.ts          # Utilidades (Zod→JSON, helpers)
├── schemas/          # Schemas Zod compartidos
│   ├── index.ts
│   └── common.ts
└── README.md         # Esta documentación
```

## 🔧 Componentes Principales

### ToolOrchestrator

Coordinador central que:
- Resuelve tools de múltiples toolsets
- Valida inputs/outputs con Zod
- Ejecuta tools con contexto enriquecido
- Genera traces de observabilidad
- Convierte a formato Gemini

```typescript
import { createToolOrchestrator } from '@/lib/ai/toolsets';

const orchestrator = createToolOrchestrator([
  new CrmToolset(),
  new CalendarToolset()
], supabase);

// Resolver todas las tools
await orchestrator.resolveTools(context);

// Ejecutar una tool
const result = await orchestrator.execute('get_contacts', { limit: 10 }, toolContext);

// Obtener formato Gemini
const geminiConfig = orchestrator.toGeminiFormat();
```

### BaseTool

Interface para definir una tool individual:

```typescript
import { z } from 'zod';
import { BaseTool, ToolContext, ToolResult } from '@/lib/ai/toolsets';

const InputSchema = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(50).default(10)
});

const OutputSchema = z.object({
  contacts: z.array(z.any()),
  count: z.number()
});

export const getContactsTool: BaseTool<
  z.infer<typeof InputSchema>, 
  z.infer<typeof OutputSchema>
> = {
  name: 'get_contacts',
  description: 'Buscar contactos del CRM',
  category: 'crm',
  readOnly: true,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  
  async execute(input, context): Promise<ToolResult> {
    // Implementación...
    return { success: true, data: { contacts: [], count: 0 } };
  }
};
```

### BaseToolset

Interface para agrupar tools relacionadas:

```typescript
import { BaseToolset, ReadonlyContext, BaseTool } from '@/lib/ai/toolsets';

export class CrmToolset implements BaseToolset {
  name = 'crm';
  description = 'Tools para gestión de contactos';
  category = 'crm' as const;
  
  private tools = [getContactsTool, searchDeepTool];
  
  async getTools(context?: ReadonlyContext) {
    // Filtrar por permisos si es necesario
    return this.tools;
  }
  
  async close() {
    // Cleanup
  }
}
```

### ToolContext

Contexto enriquecido para ejecución de tools:

```typescript
interface ToolContext {
  // Identificación
  requestId: string;
  functionCallId: string;
  
  // Multi-tenancy
  enterpriseId: number;
  userId?: number;
  
  // Estado de sesión
  state: SessionState;
  
  // Acciones post-ejecución
  actions: ToolActions;
  
  // Servicios
  services: {
    supabase: SupabaseClient;
    logger: ToolLogger;
    metrics: MetricsCollector;
  };
  
  // Metadata
  metadata: {
    userTimezone: string;
    language: string;
    roleId?: string;
  };
}
```

## 📋 Schemas Zod

Schemas reutilizables en `schemas/common.ts`:

```typescript
import { 
  IdSchema,
  LimitSchema,
  ContactEstadoSchema,
  AppointmentEstadoSchema,
  TaskEstadoSchema,
  ContactBasicSchema
} from '@/lib/ai/toolsets/schemas';

// Usar en definición de tool
const InputSchema = z.object({
  contact_id: IdSchema,
  estado: ContactEstadoSchema.optional(),
  limit: LimitSchema
});
```

## 🎯 Mejores Prácticas

### Naming Convention
- **Formato**: `verb_noun` (e.g., `get_contacts`, `create_note`)
- **Verbos**: `get`, `search`, `create`, `update`, `delete`, `list`, `count`

### Parámetros
- Preferir 1-5 parámetros máximo
- Tipos simples: `string`, `number`, `boolean`, `array`
- Descripciones claras con `.describe()`

### Respuestas
- Estructura consistente: `{ success, data?, error?, metadata? }`
- Keys descriptivas
- Mensajes útiles para el LLM

## 📊 Observabilidad

El sistema genera `EnhancedToolTrace` para cada ejecución:

```typescript
interface EnhancedToolTrace {
  id: string;
  requestId: string;
  toolName: string;
  toolCategory: ToolCategory;
  toolsetName: string;
  inputArgs: Record<string, unknown>;
  inputValid: boolean;
  outputData?: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
}
```

## 🛠️ Tools Disponibles (v2 - Unificadas)

### CrmToolset
| Tool | Descripción | Uso Principal |
|------|-------------|---------------|
| `search_crm` | 🔍 Búsqueda universal en contactos, mensajes, notas | **USAR PRIMERO** para cualquier búsqueda |
| `get_contact_360` | 👤 Contexto completo de UN contacto | Detalles + notas + citas + tareas + conversaciones |
| `get_contacts` | Filtrado avanzado de contactos | Listados con filtros específicos |

### CalendarToolset
| Tool | Descripción | Uso Principal |
|------|-------------|---------------|
| `get_agenda` | 📅 Citas y disponibilidad | Citas de hoy/semana/mes, por contacto o asesor |

### AnalyticsToolset
| Tool | Descripción | Uso Principal |
|------|-------------|---------------|
| `get_pipeline` | 📊 Estado del embudo | Contactos por etapa, leads calientes |
| `get_business_metrics` | 📈 KPIs y métricas | Conversión, citas, mensajes por período |

### TeamToolset
| Tool | Descripción | Uso Principal |
|------|-------------|---------------|
| `get_team_config` | 👥 Equipo y configuración | Miembros, etapas del embudo, roles |

## 🎯 Guía de Uso para Monica

```
REGLA DE ORO: Para la MAYORÍA de solicitudes, usa UNA SOLA tool:

"Busca a Juan"           → search_crm(query: "Juan")
"Detalles de Juan"       → get_contact_360(contact_id: 123)
"Citas de hoy"           → get_agenda(view: "today")
"¿Cómo va el embudo?"    → get_pipeline(view: "overview")
"Métricas del mes"       → get_business_metrics(period: "month")
"¿Quiénes son los asesores?" → get_team_config(view: "members")
```

## 📁 Estructura Actualizada

```
lib/ai/toolsets/
├── index.ts              # Exports principales
├── types.ts              # Tipos e interfaces core
├── orchestrator.ts       # ToolOrchestrator central
├── utils.ts              # Utilidades
├── vercel-adapter.ts     # Adapter para Vercel AI SDK
├── schemas/              # Schemas Zod compartidos
├── crm/                  # CRM Toolset
│   ├── toolset.ts
│   └── tools/
│       ├── search-crm.ts
│       ├── get-contact-360.ts
│       └── get-contacts.ts
├── calendar/             # Calendar Toolset
│   ├── toolset.ts
│   └── tools/get-agenda.ts
├── analytics/            # Analytics Toolset
│   ├── toolset.ts
│   └── tools/
│       ├── get-pipeline.ts
│       └── get-business-metrics.ts
└── team/                 # Team Toolset
    ├── toolset.ts
    └── tools/get-team-config.ts
```

## 📚 Referencias

- [Google ADK Docs](https://google.github.io/adk-docs/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Propuesta de Refactorización](../../../docs/TOOLS_REFACTORING_PROPOSAL.md)
