# Plan de Migración: Sistema de Tools Profesional (MCP-Inspired)

> **Modelo**: `gemini-3-flash-preview` (producción actual) → `gemini-3-flash-preview` (target)
> **Fecha**: Diciembre 2024
> **Estado**: Planificación

---

## 📋 Resumen Ejecutivo

Este plan detalla la migración del sistema actual de tools de Monica Chat hacia una arquitectura profesional inspirada en **Google ADK (Agent Development Kit)** y el estándar **MCP (Model Context Protocol)**.

### Objetivos Principales
1. **Estandarización**: Adoptar patrones de Google ADK para definición y ejecución de tools
2. **Modularidad**: Implementar sistema de Toolsets para agrupación dinámica
3. **Observabilidad**: Mejorar trazabilidad y debugging de tools
4. **Escalabilidad**: Preparar arquitectura para MCP servers externos
5. **Type Safety**: Validación robusta con Zod schemas

---

## 🔍 Estado Actual vs Target

### Estado Actual

| Aspecto | Implementación Actual |
|---------|----------------------|
| **Definición de Tools** | Array `MONICA_TOOLS` en `lib/ai/tools.ts` |
| **Ejecución** | Switch-case en `lib/ai/tool-executor.ts` |
| **Context** | `ToolContext` básico (enterpriseId, userId) |
| **Validación** | Ninguna (confianza en Gemini) |
| **Agrupación** | No hay (tools planas) |
| **Sub-agentes** | Manual con `delegate_to_crm_searcher` |
| **Observabilidad** | `ToolTrace` básico |

### Target (MCP-Inspired)

| Aspecto | Nueva Implementación |
|---------|---------------------|
| **Definición de Tools** | Clases `BaseTool` con schemas Zod |
| **Ejecución** | Registry pattern con ejecutores tipados |
| **Context** | `ToolContext` enriquecido (state, actions, auth) |
| **Validación** | Zod schemas + runtime validation |
| **Agrupación** | `BaseToolset` con provisión dinámica |
| **Sub-agentes** | Toolsets especializados con contexto |
| **Observabilidad** | Traces estructurados + métricas |

---

## 🏗️ Nueva Arquitectura

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Route (/api/chat)                     │
│                    gemini-3-flash-preview                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ToolOrchestrator                            │
│  - Resolves tools from Toolsets                                  │
│  - Validates args with Zod                                       │
│  - Manages ToolContext lifecycle                                 │
│  - Handles traces and metrics                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  CRM Toolset    │ │ Calendar Toolset│ │ Marketing Toolset│
│  - get_contacts │ │ - get_appoints  │ │ - get_campaigns  │
│  - search_deep  │ │ - create_appoint│ │ - get_sends      │
│  - get_details  │ │ - update_appoint│ │ - enroll_contact │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Access Layer (DAL)                     │
│                         Supabase Client                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Nueva Estructura de Archivos

```
lib/ai/
├── index.ts                    # Exports principales
├── orchestrator.ts             # ToolOrchestrator (nuevo)
├── context.ts                  # ToolContext enriquecido (nuevo)
├── schemas/                    # Schemas Zod (nuevo)
│   ├── index.ts
│   ├── common.ts               # Schemas compartidos
│   ├── contacts.ts             # Schemas de contactos
│   ├── appointments.ts         # Schemas de citas
│   └── ...
├── toolsets/                   # Toolsets por dominio (nuevo)
│   ├── index.ts
│   ├── base.ts                 # BaseToolset interface
│   ├── crm/
│   │   ├── index.ts
│   │   ├── toolset.ts          # CrmToolset
│   │   └── tools/
│   │       ├── get-contacts.ts
│   │       ├── search-deep.ts
│   │       └── ...
│   ├── calendar/
│   │   ├── index.ts
│   │   ├── toolset.ts
│   │   └── tools/
│   ├── marketing/
│   ├── tasks/
│   └── analytics/
├── tools.ts                    # DEPRECAR → migrar a toolsets
├── tool-executor.ts            # DEPRECAR → migrar a orchestrator
└── sub-agents/                 # Mantener, refactorizar a toolset
```

---

## 🔧 Componentes Clave

### 1. BaseTool Interface

```typescript
// lib/ai/toolsets/base.ts

import { z } from 'zod';

export interface ToolDefinition<TInput extends z.ZodType, TOutput extends z.ZodType> {
  /** Nombre único de la tool (verb_noun format) */
  name: string;
  
  /** Descripción clara para el LLM */
  description: string;
  
  /** Schema Zod para validación de entrada */
  inputSchema: TInput;
  
  /** Schema Zod para validación de salida */
  outputSchema: TOutput;
  
  /** Categoría para agrupación */
  category: ToolCategory;
  
  /** Si requiere confirmación del usuario */
  requiresConfirmation?: boolean;
  
  /** Si es una tool de solo lectura */
  readOnly?: boolean;
}

export interface BaseTool<TInput, TOutput> extends ToolDefinition<z.ZodType<TInput>, z.ZodType<TOutput>> {
  /** Ejecuta la tool con contexto */
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

export type ToolCategory = 
  | 'crm'        // Contactos, notas, embudo
  | 'calendar'   // Citas, agenda
  | 'tasks'      // Tareas, proyectos
  | 'marketing'  // Campañas, envíos
  | 'analytics'  // Métricas, reportes
  | 'team'       // Equipo, roles
  | 'system';    // Delegación, utilidades
```

### 2. ToolContext Enriquecido

```typescript
// lib/ai/context.ts

export interface ToolContext {
  // Identificación
  requestId: string;
  functionCallId: string;
  
  // Multi-tenancy
  enterpriseId: number;
  userId?: number;
  
  // Estado de sesión (read/write)
  state: SessionState;
  
  // Acciones post-ejecución
  actions: ToolActions;
  
  // Servicios
  services: {
    supabase: SupabaseClient;
    logger: Logger;
    metrics: MetricsCollector;
  };
  
  // Metadata
  metadata: {
    userTimezone: string;
    language: string;
    roleId?: string;
  };
}

export interface SessionState {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

export interface ToolActions {
  /** Saltar summarization del resultado */
  skipSummarization(): void;
  
  /** Transferir a otro agente/rol */
  transferToAgent(agentId: string): void;
  
  /** Solicitar confirmación del usuario */
  requestConfirmation(message: string): void;
  
  /** Escalar a humano */
  escalateToHuman(reason: string): void;
}
```

### 3. BaseToolset Interface

```typescript
// lib/ai/toolsets/base.ts

export interface BaseToolset {
  /** Nombre del toolset */
  name: string;
  
  /** Descripción del toolset */
  description: string;
  
  /** Obtiene tools disponibles según contexto */
  getTools(context?: ReadonlyContext): Promise<BaseTool<any, any>[]>;
  
  /** Limpieza de recursos */
  close(): Promise<void>;
}

export interface ReadonlyContext {
  enterpriseId: number;
  userId?: number;
  roleId?: string;
  state: Readonly<Record<string, any>>;
}
```

### 4. ToolOrchestrator

```typescript
// lib/ai/orchestrator.ts

export class ToolOrchestrator {
  private toolsets: BaseToolset[];
  private toolCache: Map<string, BaseTool<any, any>>;
  
  constructor(toolsets: BaseToolset[]) {
    this.toolsets = toolsets;
    this.toolCache = new Map();
  }
  
  /** Resuelve todas las tools disponibles */
  async resolveTools(context: ReadonlyContext): Promise<BaseTool<any, any>[]> {
    const tools: BaseTool<any, any>[] = [];
    
    for (const toolset of this.toolsets) {
      const toolsetTools = await toolset.getTools(context);
      tools.push(...toolsetTools);
    }
    
    // Cache for performance
    tools.forEach(t => this.toolCache.set(t.name, t));
    
    return tools;
  }
  
  /** Ejecuta una tool con validación */
  async execute(
    toolName: string, 
    args: unknown, 
    context: ToolContext
  ): Promise<ToolResult<any>> {
    const tool = this.toolCache.get(toolName);
    if (!tool) {
      return { success: false, error: `Tool "${toolName}" not found` };
    }
    
    // 1. Validar input con Zod
    const inputValidation = tool.inputSchema.safeParse(args);
    if (!inputValidation.success) {
      return { 
        success: false, 
        error: `Invalid input: ${inputValidation.error.message}` 
      };
    }
    
    // 2. Crear trace
    const trace = this.createTrace(toolName, args, context);
    
    try {
      // 3. Ejecutar tool
      const result = await tool.execute(inputValidation.data, context);
      
      // 4. Validar output
      if (result.success && tool.outputSchema) {
        const outputValidation = tool.outputSchema.safeParse(result.data);
        if (!outputValidation.success) {
          context.services.logger.warn(
            `Tool ${toolName} output validation failed`,
            outputValidation.error
          );
        }
      }
      
      // 5. Finalizar trace
      this.finalizeTrace(trace, result);
      
      return result;
    } catch (error) {
      this.finalizeTrace(trace, { success: false, error: error.message });
      throw error;
    }
  }
  
  /** Convierte tools a formato Gemini */
  toGeminiFormat(tools: BaseTool<any, any>[]): GeminiToolsConfig {
    return {
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema)
      }))
    };
  }
}
```

---

## 📦 Ejemplo de Toolset: CRM

```typescript
// lib/ai/toolsets/crm/toolset.ts

import { BaseToolset, ReadonlyContext, BaseTool } from '../base';
import { getContactsTool } from './tools/get-contacts';
import { searchContactsDeepTool } from './tools/search-deep';
import { getContactDetailsTool } from './tools/get-details';
import { createNoteTool } from './tools/create-note';

export class CrmToolset implements BaseToolset {
  name = 'crm';
  description = 'Tools para gestión de contactos, notas y embudo de ventas';
  
  private tools: BaseTool<any, any>[] = [
    getContactsTool,
    searchContactsDeepTool,
    getContactDetailsTool,
    createNoteTool,
  ];
  
  async getTools(context?: ReadonlyContext): Promise<BaseTool<any, any>[]> {
    // Filtrar tools según permisos del rol
    if (context?.roleId) {
      return this.tools.filter(tool => 
        this.isToolAllowedForRole(tool.name, context.roleId!)
      );
    }
    return this.tools;
  }
  
  private isToolAllowedForRole(toolName: string, roleId: string): boolean {
    // Lógica de permisos por rol
    const writeTools = ['create_note'];
    if (writeTools.includes(toolName)) {
      return roleId !== 'viewer'; // Solo roles con escritura
    }
    return true;
  }
  
  async close(): Promise<void> {
    // Cleanup si es necesario
  }
}
```

### Ejemplo de Tool Individual

```typescript
// lib/ai/toolsets/crm/tools/get-contacts.ts

import { z } from 'zod';
import { BaseTool, ToolContext, ToolResult } from '../../base';
import { getContacts } from '@/lib/dal';

// Schema de entrada
const GetContactsInputSchema = z.object({
  search: z.string().optional().describe('Término de búsqueda'),
  estado: z.enum(['prospecto', 'cliente', 'inactivo', 'perdido']).optional(),
  es_calificado: z.enum(['si', 'no', 'evaluando']).optional(),
  is_active: z.boolean().optional(),
  etapa_embudo_id: z.number().optional(),
  asesor_id: z.number().optional(),
  limit: z.number().min(1).max(50).default(10),
  order_by: z.enum(['nombre', 'created_at', 'ultima_interaccion']).optional()
});

// Schema de salida
const GetContactsOutputSchema = z.object({
  contacts: z.array(z.any()),
  count: z.number(),
  message: z.string()
});

type GetContactsInput = z.infer<typeof GetContactsInputSchema>;
type GetContactsOutput = z.infer<typeof GetContactsOutputSchema>;

export const getContactsTool: BaseTool<GetContactsInput, GetContactsOutput> = {
  name: 'get_contacts',
  description: 'Buscar y obtener contactos del CRM. Puede filtrar por nombre, teléfono, email, estado, calificación, asesor asignado o etapa del embudo.',
  category: 'crm',
  readOnly: true,
  
  inputSchema: GetContactsInputSchema,
  outputSchema: GetContactsOutputSchema,
  
  async execute(input, context): Promise<ToolResult<GetContactsOutput>> {
    const result = await getContacts(context.services.supabase, {
      enterpriseId: context.enterpriseId,
      userId: context.userId
    }, {
      search: input.search,
      estado: input.estado,
      es_calificado: input.es_calificado,
      is_active: input.is_active,
      etapa_embudo_id: input.etapa_embudo_id,
      asesor_id: input.asesor_id,
      limit: input.limit,
      order_by: input.order_by
    });

    if (result.error) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        contacts: result.data || [],
        count: result.count || 0,
        message: result.count 
          ? `Encontré ${result.count} contacto(s)` 
          : 'No se encontraron contactos con esos criterios'
      }
    };
  }
};
```

---

## 🎯 Mejores Prácticas (Google ADK)

### 1. Naming Convention
- **Formato**: `verb_noun` (e.g., `get_contacts`, `create_note`, `search_messages`)
- **Verbos permitidos**: `get`, `search`, `create`, `update`, `delete`, `list`, `count`
- **Evitar**: Nombres genéricos como `run`, `process`, `handle`

### 2. Parámetros
- **Pocos parámetros**: Preferir 1-5 parámetros máximo
- **Tipos simples**: `string`, `number`, `boolean`, `array`
- **Sin defaults**: El LLM debe inferir todos los valores
- **Descripciones claras**: Cada parámetro con descripción

### 3. Respuestas
- **Estructura consistente**: Siempre `{ success, data?, error? }`
- **Keys descriptivas**: `contacts` en lugar de `items`
- **Mensajes útiles**: Incluir contexto para el LLM

### 4. Descomposición
- **Una tool = Una tarea**: No combinar múltiples operaciones
- **Granularidad**: Preferir tools específicas sobre genéricas

---

## 📊 Observabilidad Mejorada

### ToolTrace Enriquecido

```typescript
interface EnhancedToolTrace {
  // Identificación
  id: string;
  requestId: string;
  functionCallId: string;
  
  // Timing
  startedAt: number;
  completedAt: number;
  durationMs: number;
  
  // Tool info
  toolName: string;
  toolCategory: ToolCategory;
  toolset: string;
  
  // Input/Output
  inputArgs: Record<string, any>;
  inputValid: boolean;
  inputErrors?: string[];
  
  outputData?: any;
  outputValid: boolean;
  outputErrors?: string[];
  
  // Result
  success: boolean;
  error?: string;
  errorStack?: string;
  
  // Metrics
  dbQueriesCount?: number;
  dbQueryDurationMs?: number;
  
  // Context
  enterpriseId: number;
  userId?: number;
}
```

### Métricas a Recolectar

| Métrica | Descripción |
|---------|-------------|
| `tool_execution_duration_ms` | Tiempo de ejecución por tool |
| `tool_success_rate` | Tasa de éxito por tool |
| `tool_usage_count` | Conteo de uso por tool |
| `tool_validation_errors` | Errores de validación |
| `toolset_resolution_time_ms` | Tiempo de resolución de toolsets |

---

## 🗓️ Fases de Implementación (Actualizado SDK 6)

### Fase 1: Infraestructura Base (✅ Completada)
- [x] Crear estructura `lib/ai/toolsets/`
- [x] Implementar interfaces `BaseTool`, `BaseToolset`
- [x] Implementar `ToolContext` enriquecido
- [x] Implementar `ToolOrchestrator`
- [x] Crear schemas Zod comunes
- [x] Ejemplo `CrmToolset` con `get_contacts`

### Fase 2: Modernización con Vercel AI SDK 6 (🔥 Nueva)
- [ ] **Dependencias**: Instalar `ai` (latest) y `@ai-sdk/google`
- [ ] **Adaptador**: Crear `lib/ai/toolsets/vercel-adapter.ts`
  - Convierte nuestras `BaseTool` a formato Vercel `CoreTool`
  - Inyecta `ToolContext` automáticamente en tiempo de ejecución
- [ ] **Route Handler**: Refactorizar `/api/chat/route.ts`
  - Reemplazar loop manual con `streamText({ maxSteps: 5 })`
  - Usar `google('gemini-3-flash-preview-exp')` (o preview)
  - Integrar sistema de traces con `onStepFinish`
- [ ] **Sub-agentes**: Migrar `executeCrmSearcher` a patrón de herramientas del SDK

### Fase 3: Migración de Tools (En Progreso)
- [ ] **CRM Completo**:
  - `search_contacts_deep` (Crucial: Búsqueda semántica/full-text)
  - `get_contact_details` (Join de tablas)
  - `create_note`, `get_notes`
- [ ] **Nuevos Toolsets**:
  - `CalendarToolset` (Supabase queries)
  - `TasksToolset` (Integración Tasks V3)

### Fase 4: Limpieza Legacy
- [ ] Eliminar `lib/ai/tool-executor.ts` (Switch-case gigante)
- [ ] Eliminar `lib/ai/tools.ts` (JSON manual)
- [ ] Eliminar lógica manual de Gemini en `route.ts`

---

## 🔧 Integración Vercel AI SDK 6

### El Patrón "Adapter"

En lugar de definir las tools directamente en el objeto `tools` del SDK, usaremos un adaptador que transforma nuestras clases `BaseTool` (ricas en contexto y tipado) al formato que espera el SDK.

```typescript
// lib/ai/toolsets/vercel-adapter.ts

export function toVercelTools(
  tools: BaseTool<any, any>[], 
  context: ToolContext
): Record<string, CoreTool> {
  const vercelTools: Record<string, CoreTool> = {};
  
  for (const tool of tools) {
    vercelTools[tool.name] = {
      description: tool.description,
      parameters: tool.inputSchema,
      execute: async (args) => {
        // Inyección automática del contexto
        const result = await tool.execute(args, context);
        if (!result.success) throw new Error(result.error);
        return result.data;
      }
    };
  }
  
  return vercelTools;
}
```

### Nuevo Route Handler (Simplificado)

```typescript
// app/api/chat/route.ts

import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: Request) {
  // 1. Setup Context
  const context = orchestrator.createContext({...});
  
  // 2. Resolve Tools
  const myTools = await orchestrator.resolveTools();
  
  // 3. Stream with SDK
  const result = streamText({
    model: google('gemini-3-flash-preview-exp'),
    messages,
    tools: toVercelTools(myTools, context), // 🪄 Magia aquí
    maxSteps: 5, // Reemplaza el while loop manual
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Telemetría automática
    }
  });

  return result.toDataStreamResponse();
}
```

---

## 🔮 Futuro: Integración MCP

Una vez implementada esta arquitectura, será trivial agregar:

### MCP Server Externo
```typescript
// Consumir tools de un MCP server externo
import { McpToolset } from './toolsets/mcp';

const externalToolset = new McpToolset({
  serverUrl: 'http://localhost:3001/mcp',
  transport: 'stdio' // o 'sse'
});

orchestrator.addToolset(externalToolset);
```

### Exponer Tools como MCP Server
```typescript
// Exponer nuestras tools via MCP
import { McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({
  name: 'monica-crm-tools',
  version: '1.0.0'
});

// Registrar tools
orchestrator.getAllTools().forEach(tool => {
  server.registerTool(tool.name, tool.description, tool.execute);
});
```

---

## ✅ Criterios de Éxito

1. **Todas las tools migradas** a nueva arquitectura
2. **Validación Zod** en 100% de tools
3. **Traces completos** para debugging
4. **Tests unitarios** con >80% coverage
5. **Sin regresiones** en funcionalidad existente
6. **Latencia igual o menor** a implementación actual
7. **Modelo actualizado** a `gemini-3-flash-preview`

---

## 📚 Referencias

- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Gemini Function Calling](https://ai.google.dev/docs/function_calling)
- [Zod Documentation](https://zod.dev/)
