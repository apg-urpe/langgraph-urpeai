# 🤖 Módulo: Monica AI

> Sistema multi-agente para inteligencia artificial avanzada

---

## 🎯 Propósito

Monica AI es el motor de inteligencia artificial de Urpe AI Lab:
- **Agente principal (Monica)**: Router inteligente de consultas
- **Sub-agentes especializados**: Búsqueda CRM, análisis, etc.
- **Function Calling**: Ejecución de herramientas
- **Roles personalizables**: Configuración de comportamiento
- **Observabilidad**: Trazas completas de ejecución

---

## 🏗️ Arquitectura Multi-Agente

```
┌─────────────────────────────────────────────────────────────────┐
│                      USUARIO                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MONICA (Router)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Tools     │  │  Delegate   │  │  Direct     │              │
│  │  Directas   │  │ Sub-Agente  │  │  Response   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
         │                   │                    │
         ▼                   ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Tool Executor  │  │  CRM Searcher   │  │   Gemini 3      │
│  (Supabase)     │  │  (Sub-Agent)    │  │   Streaming     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 📁 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `lib/ai/tools.ts` | Definiciones de tools |
| `lib/ai/tool-executor.ts` | Implementaciones |
| `lib/ai/sub-agents/` | Sub-agentes especializados |
| `app/api/chat/route.ts` | Endpoint principal |
| `components/chat/RoleEditorModal.tsx` | Editor de roles |

---

## 🛠️ Tools Disponibles

### Tools Directas (Monica)

| Tool | Descripción |
|------|-------------|
| `get_contacts` | Buscar contactos |
| `get_contact_details` | Detalle de contacto |
| `get_appointments` | Obtener citas |
| `get_conversations` | Historial de chats |
| `get_metrics` | KPIs del negocio |
| `get_tasks` | Tareas pendientes |
| `create_note` | Crear nota |
| `delegate_to_crm_searcher` | Delegar a sub-agente |

### Tools del CRM Searcher (Sub-Agente)

| Tool | Descripción |
|------|-------------|
| `get_projects` | Listar proyectos |
| `get_project_details` | Detalle con tareas/costos |
| `get_campaigns` | Campañas de email |
| `get_campaign_stats` | Métricas de campaña |
| `get_email_sends` | Historial de envíos |
| `get_sorted_contacts` | Con lead scoring |
| `get_full_contact_context` | Contexto completo |

---

## 🎭 Sistema de Roles

### Roles Predefinidos

| Rol | Descripción |
|-----|-------------|
| Default | Asistente general equilibrado |
| Analista | Enfocado en datos y métricas |
| Ventas | Orientado a conversión |
| Soporte | Enfocado en resolución |

### Personalización
```typescript
interface MonicaRole {
  id: string;
  nombre: string;
  descripcion: string;
  system_prompt: string;
  tools_enabled: string[];
  temperature: number;
}
```

---

## 📊 Observabilidad

### Estructura de Trazas

```typescript
interface RequestTrace {
  requestId: string;
  startTime: number;
  endTime: number;
  toolTraces: ToolTrace[];
  subAgentTraces: SubAgentTrace[];
  totalTokens: number;
  model: string;
}

interface ToolTrace {
  toolName: string;
  args: Record<string, any>;
  result: any;
  durationMs: number;
  success: boolean;
}

interface SubAgentTrace {
  agentName: string;
  query: string;
  iterations: number;
  toolTraces: ToolTrace[];
  resultSummary: string;
  durationMs: number;
}
```

### Logging
- `chat.tool_called` - Tool invocada
- `chat.tool_completed` - Tool completada
- `gemini.generation_started` - Gemini inicia
- `gemini.generation_completed` - Gemini termina

---

## 🔄 Flujo de Delegación

```
Usuario: "Dame un análisis completo de mis mejores leads"
    │
    ▼
Monica: Detecta necesidad de búsqueda profunda
    │
    ▼
delegate_to_crm_searcher: { query: "mejores leads" }
    │
    ▼
CRM Searcher: Ejecuta múltiples tools
    ├─ get_sorted_contacts
    ├─ get_full_contact_context (×N)
    └─ Combina resultados
    │
    ▼
Monica: Procesa y genera respuesta final
```

---

## 🔧 Configuración

### Gemini Settings
```typescript
const config = {
  model: 'gemini-3-flash-preview',
  temperature: 0.7,
  maxOutputTokens: 2048,
  thinkingLevel: 'medium'
};
```

### Sub-Agente Settings
```typescript
const crmSearcherConfig = {
  maxIterations: 5,
  maxToolsPerIteration: 3,
  timeout: 30000
};
```

---

## 📚 Documentación Relacionada

- [Contexto de Monica](./monica-context.md)
- [Plan Multi-Agente](./MULTI_AGENT_PLAN.md)
- [Contexto de Roles](./MONICA_ROLES_CONTEXT.md)
- [Resumen Gemini 3](./gemini-3-summary.md)
- [MCP Tools Migration](../../integrations/mcp-tools.md)
