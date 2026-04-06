---
title: "Monica Chat - Contexto Arquitectónico Completo"
---

## 📋 Resumen Ejecutivo

Monica es el asistente de IA principal de Urpe AI Lab, basado en **Gemini 3 Flash** con sistema de tools (function calling) para interactuar con el CRM.

### Errores Detectados Actualmente
1. **❌ Respuesta no se renderiza cuando usa tools** - El texto generado después de tool calls no aparece
2. **❌ TraceAccordion no muestra pasos intermedios** - Los traces de tools nunca llegan al frontend

---

## 🏗️ Arquitectura del Sistema

### Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────────────┐   │
│  │  ChatArea    │───▶│ useChatReliable │───▶│   POST /api/chat         │   │
│  │  (UI)        │    │    (Hook)       │    │                          │   │
│  └──────────────┘    └─────────────────┘    └──────────────────────────┘   │
│         │                    │                         │                    │
│         │                    │                         │                    │
│         ▼                    ▼                         ▼                    │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────────────┐   │
│  │MessageContent│    │  chatStore      │    │   Streaming Response     │   │
│  │  Renderer    │◀───│  (Zustand)      │◀───│   (text/plain)           │   │
│  └──────────────┘    └─────────────────┘    └──────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────────────┐   │
│  │ContentParser │───▶│ BlockValidator  │───▶│   VisualRenderer         │   │
│  │              │    │                 │    │   (KPI, Cards, etc)      │   │
│  └──────────────┘    └─────────────────┘    └──────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (API Route)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     /api/chat/route.ts                                │  │
│  │  1. Validar usuario y empresa                                         │  │
│  │  2. Crear ToolOrchestrator con toolsets                              │  │
│  │  3. Construir System Prompt con contexto                             │  │
│  │  4. Llamar streamText() con Vercel AI SDK                            │  │
│  │  5. Retornar textStream como Response                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     ToolOrchestrator                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ CrmToolset  │  │ Analytics   │  │ Paytony     │  │ Calendar    │  │  │
│  │  │             │  │ Toolset     │  │ Toolset     │  │ Toolset     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Vercel AI SDK (streamText)                        │  │
│  │  - model: google(GEMINI_MODEL) = 'gemini-3-flash-preview'            │  │
│  │  - tools: toVercelTools(toolsToUse, toolContext)                     │  │
│  │  - maxSteps: 5 (permite multi-turn tool calling)                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Gemini API                                        │  │
│  │  1. Recibe mensaje + tools disponibles                               │  │
│  │  2. Decide si usar tools o responder directamente                    │  │
│  │  3. Si usa tool → ejecuta → recibe resultado → genera texto          │  │
│  │  4. Puede iterar hasta maxSteps veces                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Archivos Involucrados

### Frontend - UI

| Archivo | Propósito | Líneas Clave |
|---------|-----------|--------------|
| `components/ChatArea.tsx` | Área principal del chat | MessageItem, TraceAccordion |
| `components/MessageContentRenderer.tsx` | Parsea y renderiza mensajes | ContentParser, VisualRenderer |
| `components/VisualRenderer.tsx` | Renderiza bloques UI | KPI, Cards, Charts, Forms |
| `components/chat/TraceAccordion.tsx` | Muestra tools ejecutadas (colapsable) | ToolTrace display |
| `components/chat/TraceDetailModal.tsx` | Modal con detalle de traces | Timeline, Tools, SubAgents |

### Frontend - Estado

| Archivo | Propósito |
|---------|-----------|
| `store/chatStore.ts` | Estado global del chat (sessions, messages) |
| `hooks/useChatReliable.ts` | Hook principal que maneja envío/recepción |

### Backend - API

| Archivo | Propósito |
|---------|-----------|
| `app/api/chat/route.ts` | Endpoint principal POST |
| `lib/ai/config.ts` | Configuración de Gemini (modelo, API key) |

### Backend - Tool System

| Archivo | Propósito |
|---------|-----------|
| `lib/ai/toolsets/orchestrator.ts` | Coordinador de toolsets |
| `lib/ai/toolsets/vercel-adapter.ts` | Convierte tools a formato Vercel AI SDK |
| `lib/ai/toolsets/crm/toolset.ts` | Tools de CRM (search, get_contact, etc) |
| `lib/ai/toolsets/analytics/toolset.ts` | Tools de analytics |
| `lib/ai/toolsets/types.ts` | Tipos TypeScript del sistema |

### Parseo y Validación

| Archivo | Propósito |
|---------|-----------|
| `lib/ui/ContentParser.ts` | Extrae bloques JSON:UI del texto |
| `lib/ui/BlockValidator.ts` | Valida bloques con Zod |
| `lib/ui/BlockRegistry.ts` | Registro de tipos de bloques soportados |

### Tipos

| Archivo | Propósito |
|---------|-----------|
| `types/chat.ts` | Message, UIBlock, Attachment |
| `types/observability.ts` | RequestTrace, ToolTrace, SubAgentTrace |
| `types/monica.ts` | MonicaRole, MonicaToolName |

---

## 🔴 PROBLEMAS IDENTIFICADOS

### Problema 1: Texto después de Tool Calls NO se renderiza

**Síntoma**: Cuando Monica usa una tool, el usuario no ve la respuesta final.

**Causa Raíz**: En `@/app/api/chat/route.ts:409-421`:

```typescript
const stream = new ReadableStream({
  async start(controller) {
    try {
      for await (const textPart of result.textStream) {
        controller.enqueue(encoder.encode(textPart));
      }
      controller.close();
    } catch (error) {
      logger.error('[Chat API] Stream iteration error:', error);
      controller.error(error);
    }
  }
});
```

**El problema**: `result.textStream` del Vercel AI SDK con `maxSteps > 1`:
- Solo emite texto cuando el modelo genera texto
- Durante tool calls, NO emite nada
- Si hay error en tool o el modelo no genera texto después, el stream queda vacío

**Evidencia**: El hook `useChatReliable.ts:226-244` muestra logs de chunks recibidos:
```typescript
logger.debug('[Stream] Chunk', chunkCount, '- Added:', decoded.length, 'chars. Total:', fullContent.length);
```
Si `chunkCount` queda en 0 cuando se usan tools, confirma el problema.

---

### Problema 2: Traces de Tools NO llegan al Frontend

**Síntoma**: `TraceAccordion` nunca se muestra porque `trace.toolTraces.length === 0`.

**Causa Raíz**: En `@/hooks/useChatReliable.ts:56-57`:

```typescript
const [messageTraces, setMessageTraces] = useState<Record<string, RequestTrace>>({});
const lastTraceRef = useRef<RequestTrace | null>(null);
```

**El problema**: 
1. `messageTraces` NUNCA se popula - no hay código que lo actualice
2. El API route NO envía información de traces al frontend
3. La función `getTraceForMessage` siempre retorna `null`

**En el API route** (`route.ts`):
- Se crean tools con `toVercelTools()` pero sin callbacks de trace
- No se usa `createTraceCallbacks()` del adapter
- No hay mecanismo para enviar traces al cliente

---

### Problema 3: Falta de comunicación de estado de Tools

**Síntoma**: Usuario no sabe qué está haciendo Monica mientras ejecuta tools.

**Causa**: El streaming es solo texto plano. No hay eventos SSE que indiquen:
- "Tool X iniciada"
- "Tool X completada con N resultados"
- "Generando respuesta..."

---

## 🟢 SOLUCIONES PROPUESTAS

### Solución 1: Usar `fullStream` en lugar de `textStream`

El Vercel AI SDK ofrece `fullStream` que emite TODOS los eventos, no solo texto:

```typescript
// ANTES (problemático)
for await (const textPart of result.textStream) {
  controller.enqueue(encoder.encode(textPart));
}

// DESPUÉS (correcto)
for await (const part of result.fullStream) {
  if (part.type === 'text-delta') {
    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'text',
      content: part.textDelta
    }) + '\n'));
  }
  if (part.type === 'tool-call') {
    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'tool-start',
      name: part.toolName,
      args: part.args
    }) + '\n'));
  }
  if (part.type === 'tool-result') {
    controller.enqueue(encoder.encode(JSON.stringify({
      type: 'tool-result',
      name: part.toolName,
      result: part.result
    }) + '\n'));
  }
}
```

### Solución 2: Protocolo de Streaming Estructurado

Definir un protocolo de eventos:

```typescript
// types/streaming.ts
export type StreamEvent = 
  | { type: 'text'; content: string }
  | { type: 'tool-start'; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; name: string; result: unknown; durationMs: number }
  | { type: 'trace'; trace: RequestTrace }
  | { type: 'done'; totalDurationMs: number }
  | { type: 'error'; message: string };
```

### Solución 3: Actualizar useChatReliable para parsear eventos

```typescript
// hooks/useChatReliable.ts
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split('\n').filter(Boolean);
  for (const line of lines) {
    const event = JSON.parse(line) as StreamEvent;
    
    switch (event.type) {
      case 'text':
        fullContent += event.content;
        updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
        break;
      case 'tool-start':
        // Actualizar UI con indicador de tool
        break;
      case 'tool-result':
        // Agregar al trace
        break;
      case 'trace':
        setMessageTraces(prev => ({ ...prev, [assistantMsgId]: event.trace }));
        break;
    }
  }
}
```

### Solución 4: Capturar Traces con Callbacks

En `route.ts`, usar los callbacks del adapter:

```typescript
const traceCollector = {
  traces: [] as ToolTrace[],
  addToolTrace(trace) {
    this.traces.push(trace);
  }
};

const vercelTools = toVercelTools(
  toolsToUse, 
  toolContext,
  createTraceCallbacks(traceCollector) // ← Agregar callbacks
);
```

---

## 📊 Modelo de Datos

### Message (Frontend)
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;           // Texto Markdown
  uiBlocks: UIBlock[];       // Bloques visuales parseados
  timestamp: Date;
  attachments?: Attachment[];
  isComplete?: boolean;
  feedback?: MessageFeedback;
}
```

### UIBlock (Generative UI)
```typescript
interface UIBlock {
  type: 'kpi_card' | 'chart' | 'table' | 'form' | 'card' | 'cards' | 'grid' | 'actions' | 'calendar' | ...;
  title?: string;
  theme?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'special';
  data: Record<string, any>;
}
```

### RequestTrace (Observability)
```typescript
interface RequestTrace {
  id: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  userMessage: string;
  historyLength: number;
  toolTraces: ToolTrace[];
  subAgentTraces?: SubAgentTrace[];
  status: 'in_progress' | 'completed' | 'error';
}

interface ToolTrace {
  id: string;
  iteration: number;
  timestamp: number;
  toolName: string;
  toolArgs: Record<string, any>;
  success: boolean;
  data?: any;
  error?: string;
  durationMs: number;
}
```

---

## 🛠️ Tools Disponibles

### CRM Toolset
- `search_crm` - Búsqueda unificada en contactos
- `get_contact_360` - Vista completa de un contacto
- `create_note` - Crear nota en contacto
- `get_conversational_intelligence` - Análisis de conversaciones

### Analytics Toolset
- `get_dashboard_metrics` - Métricas del dashboard
- `get_funnel_analytics` - Estadísticas del embudo

### Paytony Toolset
- `get_pending_payments` - Pagos pendientes
- `record_payment` - Registrar pago

---

## 🔧 Configuración

### Modelo AI
```typescript
// lib/ai/config.ts
export const GEMINI_MODEL = 'gemini-3-flash-preview';
export const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
```

### maxSteps
```typescript
// app/api/chat/route.ts
streamText({
  model: google(GEMINI_MODEL),
  tools: vercelTools,
  maxSteps: 5, // ← Permite hasta 5 iteraciones de tool calling
});
```

---

## 📝 Checklist de Corrección

- [x] Cambiar `textStream` por `fullStream` en route.ts ✅ **IMPLEMENTADO 2025-01-05**
- [ ] Implementar protocolo de eventos estructurado (FASE 2)
- [ ] Actualizar useChatReliable para parsear eventos (FASE 2)
- [ ] Capturar traces con callbacks del adapter (FASE 2)
- [ ] Enviar trace completo al final del stream (FASE 2)
- [ ] Poblar `messageTraces` en el hook (FASE 2)
- [ ] Verificar que TraceAccordion recibe datos (FASE 2)
- [x] Probar con tool call simple (search_crm) - PENDIENTE VALIDACIÓN
- [ ] Probar con múltiples tool calls encadenados

---

## ✅ CAMBIO IMPLEMENTADO (2025-01-05)

### Problema Original
`textStream` no emitía texto cuando había tool calls con `maxSteps > 1`.

### Solución Aplicada
Cambiar de `textStream` a `fullStream` en `@/app/api/chat/route.ts:414`:

```typescript
// ANTES (problemático)
for await (const textPart of result.textStream) {
  controller.enqueue(encoder.encode(textPart));
}

// DESPUÉS (correcto)
for await (const part of result.fullStream) {
  if (part.type === 'text-delta') {
    controller.enqueue(encoder.encode(part.text));
  }
}
```

### Por qué funciona
- `fullStream` emite TODOS los eventos del Vercel AI SDK
- Incluye `text-delta` que contiene el texto generado DESPUÉS de tool calls
- Mantenemos formato `text/plain` para compatibilidad con frontend actual
- No requiere cambios en `useChatReliable.ts`

---

## 🔗 Referencias

- [Vercel AI SDK - streamText](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text)
- [Vercel AI SDK - fullStream](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text#fullstream)
- [Gemini Function Calling](https://ai.google.dev/docs/function_calling)

---

*Documento generado: 2025-01-05*
*Modelo objetivo: gemini-3-flash-preview*
