# Sub-Agentes Monica AI

Sistema de agentes especializados que pueden ser invocados por el agente principal (Router).

## Arquitectura

```
Router (Monica) → delegate_to_* → Sub-Agente → Tools → Datos → Respuesta
```

## Sub-Agentes Disponibles

### CRM Searcher (`crm_searcher`)

Especializado en búsqueda y consulta de datos del CRM.

**Ubicación**: `./crm-searcher/`

**Características**:
- Solo herramientas de LECTURA (sin escritura)
- Máximo 8 iteraciones por búsqueda
- Temperature 1.0 (Gemini 2 default)
- Modelo: gemini-3-flash-preview
- **Detección de anomalías**: Reporta warnings cuando hay 0 resultados inesperados
- **Transparencia**: Siempre lista las herramientas ejecutadas en su respuesta

**Tools Disponibles** (20 herramientas):

| Categoría | Tool | Descripción |
|-----------|------|-------------|
| Contactos | `get_contacts` | Filtrar contactos |
| | `get_contact_details` | Detalle completo |
| | `search_contacts_deep` | Búsqueda multi-fuente |
| | `get_sorted_contacts` | Con lead scoring |
| | `get_full_contact_context` | Todo sobre un contacto |
| Citas | `get_appointments` | Agenda y citas |
| Tareas | `get_tasks` | Por estado/asignado |
| Proyectos | `get_projects` | Listar proyectos |
| | `get_project_details` | Con tareas y costos |
| Marketing | `get_campaigns` | Campañas de email |
| | `get_campaign_stats` | Métricas |
| | `get_email_sends` | Historial de envíos |
| Conversaciones | `get_conversations` | Chats WhatsApp |
| | `search_messages` | Buscar en mensajes |
| Equipo | `get_team_members` | Lista de asesores |
| Embudo | `get_funnel_stages` | Etapas del pipeline |
| | `get_funnel_stats` | Stats por etapa |
| Métricas | `get_metrics` | KPIs del negocio |
| Notas | `get_contact_notes` | Notas de contacto |
| | `search_notes` | **NUEVO** Búsqueda global de notas |

## Detección de Anomalías

El sub-agente ahora incluye lógica para detectar problemas potenciales:

- **Métricas en 0**: Si `get_metrics` retorna 0 contactos pero se esperaban datos
- **Equipo vacío**: Si `get_team_members` no encuentra asesores
- **Embudo no configurado**: Si `get_funnel_stages` está vacío
- **Sin conversaciones**: Si hay contactos pero 0 conversaciones

Cada tool retorna un campo `warnings` cuando detecta anomalías.

## Uso

```typescript
import { executeCrmSearcher } from '@/lib/ai/sub-agents';

const response = await executeCrmSearcher({
  task: "contactos más calientes de esta semana",
  hints: { period: "week", sort: "intelligence" },
  parentTraceId: trace.id,
  context: toolContext
});

// response.success - boolean
// response.data - datos recolectados
// response.summary - resumen generado
// response.trace - SubAgentTrace con detalles
```

## Observabilidad

Cada sub-agente genera un `SubAgentTrace` que incluye:
- `toolTraces[]` - Cada tool ejecutada
- `iterations` - Número de iteraciones
- `durationMs` - Tiempo total
- `resultSummary` - Resumen del resultado

El trace se anida bajo el `RequestTrace` principal.

## Seguridad

- Todas las queries filtran por `empresa_id`
- El contexto (`ToolContext`) se hereda del router
- Sin acceso a herramientas de escritura

## Agregar un Nuevo Sub-Agente

1. Crear carpeta en `./sub-agents/nuevo-agente/`
2. Implementar:
   - `config.ts` - Configuración del agente
   - `tools.ts` - Herramientas disponibles
   - `executor.ts` - Implementación de tools
   - `agent.ts` - Lógica principal
   - `index.ts` - Exports
3. Actualizar `types.ts` con el nuevo `SubAgentName`
4. Exportar en `./sub-agents/index.ts`
5. Añadir tool `delegate_to_nuevo_agente` en el router
