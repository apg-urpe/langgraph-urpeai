# Monica AI - Function Calling System

Sistema de herramientas (tools) que permite a Monica acceder a datos del CRM en tiempo real.

## Arquitectura Actual (v2 - Unificada)

```
Usuario → Chat UI → /api/chat/route.ts → AI SDK (Gemini/OpenRouter) → Tools inline → Supabase → Respuesta
```

**IMPORTANTE**: Todas las tools ahora están definidas e implementadas directamente en `app/api/chat/route.ts`.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/api/chat/route.ts` | **PRINCIPAL** - Todas las tools definidas aquí |
| `tools.ts` | ⚠️ LEGACY - Mantener para compatibilidad |
| `tool-executor.ts` | ⚠️ LEGACY - Mantener para compatibilidad |

## Herramientas Disponibles (14 Tools)

### Contactos
| Tool | Descripción |
|------|-------------|
| `searchContacts` | Búsqueda fuzzy de contactos por nombre, teléfono, email |
| `getContactContext` | Contexto 360° de un contacto (conversaciones, citas, notas) |
| `countContacts` | Conteo con filtros (estado, calificado) |

### Notas
| Tool | Descripción |
|------|-------------|
| `createNote` | Crear nota en el historial de un contacto |

### Citas y Tareas
| Tool | Descripción |
|------|-------------|
| `getAppointments` | Citas programadas con filtros |
| `getTasks` | Tareas del CRM con búsqueda y prioridad |
| `getProjects` | Proyectos de la empresa |

### Equipo y Métricas
| Tool | Descripción |
|------|-------------|
| `getTeamMembers` | Miembros del equipo |
| `getMetrics` | KPIs por período (today, week, month, quarter, year) |
| `getFunnelStats` | Estadísticas del embudo de ventas |

### Análisis Avanzado
| Tool | Descripción |
|------|-------------|
| `getConversationalIntelligence` | Análisis de conversaciones RAW para patrones |

### Herramientas Externas (condicionales)
| Tool | Requiere | Descripción |
|------|----------|-------------|
| `webSearch` | FIRECRAWL_API_KEY | Búsqueda en internet |
| `webScrape` | FIRECRAWL_API_KEY | Scraping de URLs |
| `executePython` | E2B_API_KEY | Ejecución de código Python en sandbox |

## Seguridad

- Todas las queries filtran por `empresa_id` del contexto
- Verificación de pertenencia antes de acceder a datos de contacto
- El `enterpriseId` se pasa desde el frontend (store de contactos)

## Flujo de Function Calling

1. Usuario envía mensaje
2. API construye system prompt con capacidades de tools
3. Gemini decide si necesita usar una tool
4. Si hay `functionCall` en la respuesta:
   - Se ejecuta la tool con `executeTool()`
   - Se añade el resultado a la conversación
   - Se vuelve a llamar a Gemini
5. Cuando no hay más `functionCall`, se hace streaming de la respuesta final

## Ejemplo de Uso

```typescript
// El usuario pregunta:
"¿Cuántos contactos tengo este mes?"

// Monica usa la tool get_metrics:
{
  name: "get_metrics",
  args: { period: "month" }
}

// Tool ejecuta query y retorna:
{
  success: true,
  data: {
    metrics: {
      totalContacts: 150,
      newContacts: 23,
      // ...
    }
  }
}

// Monica responde con los datos formateados
```

## Configuración

Variables de entorno requeridas:
- `GEMINI_API_KEY` - API Key de Google AI
- `NEXT_PUBLIC_SUPABASE_URL` - URL de Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service Role Key para queries server-side

## Extensibilidad

Para agregar una nueva tool:

1. Añadir declaración en `tools.ts`:
```typescript
{
  name: 'my_new_tool',
  description: 'Descripción de la herramienta',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' }
    },
    required: ['param1']
  }
}
```

2. Implementar en `tool-executor.ts`:
```typescript
async function executeMyNewTool(args: {...}, ctx: ToolContext): Promise<ToolResult> {
  // Query a Supabase
  // Return { success: true, data: {...} }
}
```

3. Añadir case en `executeTool()`:
```typescript
case 'my_new_tool':
  return executeMyNewTool(args, ctx);
```

---

## Generative UI (UI Dinámica)

Monica puede generar componentes visuales dinámicos usando bloques JSON que el frontend renderiza automáticamente.

### Formato

```markdown
Texto explicativo aquí.

\`\`\`json:ui
{"type": "kpi_card", "title": "Título", "theme": "success", "data": {...}}
\`\`\`

Más texto después.
```

### Tipos de Bloques

| Tipo | Uso | Theme Recomendado |
|------|-----|-------------------|
| `kpi_card` | Métricas numéricas | Según tendencia |
| `chart` | Gráficos (bar, line, pie) | primary, info |
| `table` | Datos tabulares | neutral, default |
| `card` | Información detallada | Según contenido |
| `cards` | Listado de items | info |
| `grid` | Cuadrícula visual | special |
| `actions` | Botones de acción | info |
| `error/warning/info` | Alertas | Automático |

### Temas Disponibles

| Theme | Color | Uso |
|-------|-------|-----|
| `default` | Gris | Contenido neutro |
| `success` | Verde | Éxito, crecimiento, positivo |
| `warning` | Ámbar | Advertencias, atención |
| `error` | Rojo | Errores, problemas |
| `info` | Azul | Información general |
| `special` | Violeta | Funciones especiales |
| `neutral` | Cyan | Contenido secundario |
| `primary` | Azul | Acciones principales |
| `secondary` | Verde | Acciones secundarias |

### Auto-inferencia de Temas

El frontend infiere automáticamente el tema si no se especifica:
- `trend: "up"` → `success`
- `trend: "down"` → `error`
- `trend: "neutral"` → `default`

### Flujo Completo

```
1. Usuario: "¿Cuántos contactos nuevos este mes?"
2. Monica: usa get_metrics(period: "month")
3. Tool: retorna {newContacts: 23, ...}
4. Monica: genera respuesta con UI block:

   Este mes tienes un crecimiento notable:

   \`\`\`json:ui
   {"type": "kpi_card", "title": "Contactos Nuevos", "theme": "success", "data": {"value": "23", "trend": "up", "change": 15.2}}
   \`\`\`

5. Frontend: parsea, valida, renderiza KpiCard con tema verde
```

### Archivos Relacionados

| Archivo | Función |
|---------|---------|
| `lib/ui/CardPalette.ts` | Definición de colores y temas |
| `lib/ui/BlockValidator.ts` | Validación Zod de bloques |
| `lib/ui/ContentParser.ts` | Parser de bloques json:ui |
| `components/VisualRenderer.tsx` | Renderizador de bloques |
| `components/KpiCard.tsx` | Componente KPI con temas |
| `components/CardBlock.tsx` | Componente Card con temas |
