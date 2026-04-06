# Sistema Multi-Agente Monica AI

## Resumen Ejecutivo

Arquitectura de agentes especializados donde Monica (agente principal) actúa como router y delega tareas de búsqueda a un sub-agente especializado "Buscador CRM".

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENTE PRINCIPAL (Router)                         │
│                         "Monica"                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • Recibe mensaje del usuario                                │   │
│  │  • Decide si necesita delegar a sub-agente                  │   │
│  │  • Genera respuesta final con Generative UI                 │   │
│  │  • Tools: create_note (escritura), delegate_to_crm_searcher │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │delegate_to_crm_   │                            │
│                    │    searcher       │                            │
│                    └─────────┬─────────┘                            │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   SUB-AGENTE: Buscador CRM                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  TOOLS DE LECTURA                                            │   │
│  │  ─────────────────                                          │   │
│  │  CONTACTOS:                                                  │   │
│  │    • get_contacts - Filtrar contactos                       │   │
│  │    • get_contact_details - Detalle completo                 │   │
│  │    • search_contacts_deep - Búsqueda multi-fuente           │   │
│  │    • get_sorted_contacts - Con lead scoring (NUEVO)         │   │
│  │    • get_full_contact_context - Todo sobre un contacto      │   │
│  │                                                              │   │
│  │  CITAS:                                                      │   │
│  │    • get_appointments - Por fecha, contacto, estado         │   │
│  │                                                              │   │
│  │  CONVERSACIONES:                                             │   │
│  │    • get_conversations - Chats de WhatsApp                  │   │
│  │    • search_messages - Buscar en contenido                  │   │
│  │                                                              │   │
│  │  TAREAS:                                                     │   │
│  │    • get_tasks - Por estado, asignado, prioridad            │   │
│  │                                                              │   │
│  │  PROYECTOS (NUEVO):                                          │   │
│  │    • get_projects - Listar proyectos                        │   │
│  │    • get_project_details - Detalle con tareas/costos        │   │
│  │                                                              │   │
│  │  MARKETING (NUEVO):                                          │   │
│  │    • get_campaigns - Campañas de email                      │   │
│  │    • get_campaign_stats - Métricas de campaña               │   │
│  │    • get_email_sends - Historial de envíos                  │   │
│  │                                                              │   │
│  │  EQUIPO Y EMBUDO:                                            │   │
│  │    • get_team_members, get_funnel_stages, get_funnel_stats  │   │
│  │                                                              │   │
│  │  MÉTRICAS:                                                   │   │
│  │    • get_metrics - KPIs agregados                           │   │
│  │                                                              │   │
│  │  NOTAS:                                                      │   │
│  │    • get_contact_notes - Notas de contacto                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  OBSERVABILIDAD INTERNA                                      │   │
│  │  ──────────────────────                                     │   │
│  │  • SubAgentTrace anidado bajo RequestTrace padre            │   │
│  │  • Cada tool trace se registra individualmente              │   │
│  │  • Métricas: tiempo total, tools usadas, iteraciones        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Datos

### Ejemplo: "Muéstrame los contactos más calientes de esta semana"

```
1. Usuario envía mensaje
   └─> /api/chat (Router Monica)

2. Router analiza el mensaje
   └─> Detecta necesidad de búsqueda compleja
   └─> Llama tool: delegate_to_crm_searcher({
         task: "contactos más calientes esta semana",
         hints: { period: "week", sort: "intelligence" }
       })

3. Sub-Agente CRM Searcher se activa
   └─> Analiza la tarea
   └─> Ejecuta: get_sorted_contacts({ sort: "intelligence", period: "week", limit: 10 })
   └─> Opcionalmente: get_funnel_stats() para contexto adicional
   └─> Compila resultados + genera trace

4. Router recibe respuesta del sub-agente
   └─> Datos: { contacts: [...], funnel: {...} }
   └─> Trace: { agentName: "crm_searcher", tools: [...], duration: 450ms }

5. Router genera respuesta final
   └─> Usa Generative UI para crear cards visuales
   └─> Incluye trace completo (router + sub-agente)
   └─> Streaming al cliente
```

---

## Estructura de Archivos

```
lib/ai/
├── index.ts                      # Exports principales
├── tools.ts                      # Tools del Router (incluye delegate)
├── tool-executor.ts              # Ejecutor principal del router
├── README.md                     # Documentación
│
├── sub-agents/                   # Directorio de sub-agentes
│   ├── index.ts                  # Exports de sub-agentes
│   ├── types.ts                  # Tipos compartidos (SubAgentTrace, etc)
│   │
│   └── crm-searcher/             # Sub-agente Buscador CRM
│       ├── index.ts              # Entry point
│       ├── agent.ts              # Lógica principal del sub-agente
│       ├── tools.ts              # Tools específicas (lectura CRM)
│       └── executor.ts           # Ejecutor de tools del sub-agente

types/
├── observability.ts              # Actualizado con SubAgentTrace
```

---

## Tools del Sub-Agente CRM Searcher

### Nuevas Tools a Implementar

| Tool | Descripción | Tabla(s) |
|------|-------------|----------|
| `get_projects` | Listar proyectos por estado/asignado | `wp_proyectos` |
| `get_project_details` | Detalle con tareas y costos | `wp_proyectos` + `wp_tareas` |
| `get_campaigns` | Campañas de email marketing | `wp_email_campanas` |
| `get_campaign_stats` | Métricas de campaña | `wp_email_envio` + conteos |
| `get_email_sends` | Historial de envíos | `wp_email_envio` |
| `get_sorted_contacts` | Contactos con lead scoring | `wp_contactos` + scoring |
| `get_full_contact_context` | Todo sobre un contacto | Múltiples tablas |

### Tools Existentes (Migradas al Sub-Agente)

- `get_contacts`
- `get_contact_details`
- `search_contacts_deep`
- `get_appointments`
- `get_conversations`
- `search_messages`
- `get_team_members`
- `get_funnel_stages`
- `get_funnel_stats`
- `get_metrics`
- `get_tasks`
- `get_contact_notes`

---

## Observabilidad

### Tipos Actualizados

```typescript
// types/observability.ts

export interface RequestTrace {
  id: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  
  userMessage: string;
  historyLength: number;
  
  // Tools directas del router
  toolTraces: ToolTrace[];
  totalIterations: number;
  
  // NUEVO: Sub-agentes invocados
  subAgentTraces: SubAgentTrace[];
  
  status: 'in_progress' | 'completed' | 'error';
  error?: string;
}

export interface SubAgentTrace {
  id: string;
  parentRequestId: string;
  agentName: 'crm_searcher';
  
  // Input
  task: string;
  hints?: Record<string, any>;
  
  // Timing
  startedAt: number;
  completedAt: number;
  durationMs: number;
  
  // Tools usadas
  toolTraces: ToolTrace[];
  iterations: number;
  
  // Output
  success: boolean;
  resultSummary?: string;
  error?: string;
}
```

### Visualización en UI

El trace del sub-agente se muestra anidado bajo el request principal:

```
📊 Request Trace (1.2s total)
├─ 🤖 Router: delegate_to_crm_searcher (450ms)
│   └─ 🔍 Sub-Agent: crm_searcher
│       ├─ get_sorted_contacts (320ms) ✓
│       └─ get_funnel_stats (85ms) ✓
└─ ✨ Final Response Generated
```

---

## Seguridad

1. **Multi-tenant**: Todas las queries filtran por `empresa_id`
2. **Sin escritura**: El sub-agente CRM Searcher NO tiene tools de escritura
3. **Contexto heredado**: El sub-agente recibe `ToolContext` del router
4. **Rate limiting**: Máximo 5 iteraciones por sub-agente

---

## Fases de Implementación

### Fase 1: Documentación ✅
- [x] Crear `docs/MULTI_AGENT_PLAN.md`

### Fase 2: Nuevas Tools
- [ ] `get_projects` y `get_project_details`
- [ ] `get_campaigns`, `get_campaign_stats`, `get_email_sends`
- [ ] `get_sorted_contacts` (con lead scoring)
- [ ] `get_full_contact_context`

### Fase 3: Sub-Agente CRM Searcher
- [ ] Crear estructura `lib/ai/sub-agents/`
- [ ] Implementar `crm-searcher/agent.ts`
- [ ] Implementar `crm-searcher/tools.ts`
- [ ] Implementar `crm-searcher/executor.ts`

### Fase 4: Integración Router
- [ ] Añadir tool `delegate_to_crm_searcher` al router
- [ ] Actualizar `types/observability.ts` con `SubAgentTrace`
- [ ] Actualizar UI de traces para mostrar sub-agentes

### Fase 5: Testing y Polish
- [ ] Tests de integración
- [ ] Optimización de latencia
- [ ] Documentación de uso

---

## Configuración

### Variables de Entorno

```env
GEMINI_API_KEY=xxx               # Compartida entre router y sub-agente
NEXT_PUBLIC_SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Constantes

```typescript
// lib/ai/sub-agents/crm-searcher/constants.ts
export const CRM_SEARCHER_CONFIG = {
  maxIterations: 5,
  model: 'gemini-3-flash-preview-exp',
  temperature: 0.3,  // Más determinístico para búsquedas
  systemPrompt: `Eres un agente especializado en búsqueda de datos CRM...`
};
```

---

## Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Latencia promedio sub-agente | < 500ms |
| Tasa de éxito de delegación | > 95% |
| Reducción de iteraciones router | -30% |
| Cobertura de datos CRM | 100% tablas principales |
