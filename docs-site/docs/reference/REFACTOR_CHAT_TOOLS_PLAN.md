---
title: "Plan de Refactorización Chat con Tools y Persistencia"
---

**Fecha**: 21 Enero 2026  
**Estado**: ✅ IMPLEMENTADO (Sprint 1-3)  
**Autor**: Tony + Cascade  
**Documentación Validada**: ✅ ai-sdk.dev (Enero 2026)

---

## ✅ Implementación Completada

### Archivos Modificados:
- `app/api/chat/route.ts` - toUIMessageStreamResponse + 3 tools
- `hooks/useChatReliable.ts` - Parser UI Message Protocol
- `components/chat/ToolExecutionCard.tsx` - Nuevo componente
- `components/chat/index.ts` - Export del nuevo componente
- `components/ChatArea.tsx` - Integración de tool parts
- `app/page.tsx` - Props para tool parts

### Tools Implementadas:
1. **search_contacts_deep** - Búsqueda en CRM
2. **get_full_contact_context** - Contexto 360° de contacto  
3. **create_note** - Crear notas en contactos

### Pendiente (Sprint 4):
- [ ] Persistencia en `onFinish` callback
- [ ] Animaciones de ejecución
- [ ] Error handling mejorado

---

## Validación con Documentación Oficial

### Fuentes Consultadas
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
- https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling

### Confirmaciones Clave

| Aspecto | Nuestro Plan | Documentación Oficial | ✅ |
|---------|--------------|----------------------|---|
| Response Type | `toUIMessageStreamResponse()` | "On the backend, you can use `toUIMessageStreamResponse()` from the streamText result" | ✅ |
| Multi-step | `stopWhen: stepCountIs(5)` | "You can also use multi-step calls with `streamText`. This works when all invoked tools have an `execute` function" | ✅ |
| Tool Format | `{ description, inputSchema, execute }` | Ejemplo oficial usa exactamente este formato con Zod | ✅ |
| Frontend | `message.parts.map()` con switch por type | Documentado: `case 'text'`, `case 'tool-*'`, `case 'step-start'` | ✅ |
| Persistencia | `onStepFinish` callback | "your own logic, e.g. for saving the chat history or recording usage" | ✅ |

### Imports Correctos (Validados)
```typescript
// Backend
import { 
  streamText, 
  UIMessage, 
  convertToModelMessages, 
  stepCountIs 
} from 'ai';
import { z } from 'zod';

// Frontend
import { useChat } from '@ai-sdk/react';
import { 
  DefaultChatTransport, 
  lastAssistantMessageIsCompleteWithToolCalls 
} from 'ai';
```

---

## Problemas Identificados

### 1. Tools No Muestran Respuesta
**Síntoma**: Cuando Monica usa una tool, el texto posterior al tool call no aparece en pantalla.

**Causa Raíz**:
- El API usa `toTextStreamResponse()` que NO soporta el protocolo de tools
- El frontend parsea texto plano, no el **UI Message Stream Protocol**

### 2. Persistencia No Funciona
**Síntoma**: Mensajes y sesiones no se guardan en Supabase.

**Causa Raíz**:
- `persistMessageToDb` y `finalizeMessageInDb` existen pero tienen bugs
- El `messageId` del assistant se genera localmente pero no se usa para la actualización en DB
- Falta el ID de mensaje real de la DB para hacer UPDATE

---

## Arquitectura Propuesta

### Stack Técnico
```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  useChat (@ai-sdk/react)                                        │
│  ├── UI Message Stream Protocol (automático)                    │
│  ├── Tool parts rendering (tool-input, tool-output)             │
│  └── Steps rendering (multi-step tool calls)                    │
├─────────────────────────────────────────────────────────────────┤
│                        API ROUTE                                 │
├─────────────────────────────────────────────────────────────────┤
│  streamText + toUIMessageStreamResponse()                       │
│  ├── tools: { ... } (CRM tools con execute)                     │
│  ├── stopWhen: stepCountIs(5)                                   │
│  ├── onStepFinish: persistir a DB                               │
│  └── onFinish: finalizar mensaje en DB                          │
├─────────────────────────────────────────────────────────────────┤
│                      SUPABASE                                    │
├─────────────────────────────────────────────────────────────────┤
│  adaptive_interface.chat_sessions                               │
│  adaptive_interface.chat_messages                               │
│  └── content: { text, parts[], uiBlocks[] }                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cambios Requeridos

### FASE 1: API Route (`/api/chat/route.ts`)

#### 1.1 Cambiar Response Type
```typescript
// ANTES (texto plano - NO soporta tools)
return result.toTextStreamResponse();

// DESPUÉS (UI Message Protocol - soporta tools)
return result.toUIMessageStreamResponse();
```

#### 1.2 Agregar Tools al streamText
```typescript
import { streamText, UIMessage, convertToModelMessages, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const result = streamText({
  model: google(GEMINI_MODEL),
  system: systemPrompt,
  messages: await convertToModelMessages(messages),
  tools: {
    search_contacts_deep: tool({
      description: '...',
      parameters: z.object({
        query: z.string(),
        scope: z.enum(['all', 'contacts', 'messages', 'metadata', 'notes']).optional(),
        limit: z.number().optional()
      }),
      execute: async ({ query, scope, limit }) => {
        // Lógica de búsqueda
        return { results: [...] };
      }
    }),
    // ... más tools
  },
  stopWhen: stepCountIs(5), // Máximo 5 iteraciones de tools
  onStepFinish: async ({ text, toolCalls, toolResults }) => {
    // Persistir paso intermedio si tiene tool results
    console.log('[Chat] Step finished:', { toolCalls: toolCalls?.length });
  },
  onFinish: async ({ text, usage, steps }) => {
    // Persistir mensaje final a Supabase
    await persistFinalMessage(sessionId, text, steps);
  }
});

return result.toUIMessageStreamResponse();
```

#### 1.3 Callbacks de Persistencia
```typescript
// En onFinish del streamText
onFinish: async ({ text, usage, steps }) => {
  try {
    // Construir content con partes del mensaje
    const content = {
      text: text,
      parts: steps.flatMap(step => [
        ...(step.toolCalls || []).map(tc => ({
          type: 'tool-call',
          toolName: tc.toolName,
          args: tc.args
        })),
        ...(step.toolResults || []).map(tr => ({
          type: 'tool-result',
          toolName: tr.toolName,
          result: tr.result
        }))
      ])
    };
    
    // Guardar en Supabase
    await supabase
      .schema('adaptive_interface')
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: 'assistant',
        content: content,
        is_complete: true,
        metadata: { usage, stepCount: steps.length }
      });
      
  } catch (err) {
    console.error('[Chat] Error persisting message:', err);
  }
}
```

### FASE 2: Frontend Hook

#### 2.1 Opción A: Usar `useChat` de `@ai-sdk/react` (Recomendado)
```typescript
// hooks/useChatAI.ts
import { useChat } from '@ai-sdk/react';

export function useChatAI() {
  const {
    messages,
    input,
    setInput,
    append,
    isLoading,
    error,
    reload
  } = useChat({
    api: '/api/chat',
    body: {
      // Datos adicionales enviados con cada request
      enterpriseId,
      userId,
      // etc.
    },
    onFinish: (message) => {
      // Callback cuando termina un mensaje
      console.log('Message finished:', message.id);
    },
    onError: (error) => {
      console.error('Chat error:', error);
    }
  });

  return {
    messages,
    input,
    setInput,
    sendMessage: (text: string) => append({ role: 'user', content: text }),
    isLoading,
    error
  };
}
```

#### 2.2 Opción B: Mantener Hook Custom con Parser UI Protocol
```typescript
// hooks/useChatReliable.ts - ACTUALIZADO
// Parsear UI Message Stream Protocol manualmente

const parseUIMessageStream = async (reader: ReadableStreamDefaultReader) => {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentMessage = { content: '', parts: [] };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      
      if (data === '[DONE]') continue;
      
      try {
        const event = JSON.parse(data);
        
        switch (event.type) {
          case 'text-delta':
            currentMessage.content += event.delta;
            updateMessageContent(currentMessage.content);
            break;
            
          case 'tool-input-available':
            currentMessage.parts.push({
              type: 'tool-call',
              toolName: event.toolName,
              args: event.input
            });
            break;
            
          case 'tool-output-available':
            currentMessage.parts.push({
              type: 'tool-result',
              toolCallId: event.toolCallId,
              output: event.output
            });
            break;
            
          case 'finish':
            finalizeMessage(currentMessage);
            break;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
};
```

### FASE 3: Renderizado de Tool Parts

#### 3.1 Componente MessagePart
```tsx
// components/chat/MessagePart.tsx
export function MessagePart({ part }: { part: MessagePartType }) {
  switch (part.type) {
    case 'text':
      return <MarkdownRenderer content={part.text} />;
      
    case 'tool-call':
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
          <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
          <span className="text-sm text-zinc-400">
            Ejecutando: {part.toolName}
          </span>
        </div>
      );
      
    case 'tool-result':
      return (
        <ToolResultCard 
          toolName={part.toolName}
          result={part.result}
        />
      );
      
    case 'step-start':
      return <hr className="border-white/10 my-2" />;
      
    default:
      return null;
  }
}
```

#### 3.2 Componente ToolResultCard
```tsx
// components/chat/ToolResultCard.tsx
export function ToolResultCard({ toolName, result }: ToolResultCardProps) {
  const toolConfig = TOOL_DESCRIPTIONS[toolName];
  
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
        <Icon name={toolConfig?.icon || 'Sparkles'} className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-medium text-zinc-200">
          {toolConfig?.label || toolName}
        </span>
        <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
      </div>
      <div className="p-3">
        {/* Renderizar resultado según tipo de tool */}
        <ToolResultRenderer toolName={toolName} data={result} />
      </div>
    </div>
  );
}
```

### FASE 4: Persistencia Mejorada

#### 4.1 Schema de Contenido
```typescript
// types/chat.ts
interface MessageContent {
  text: string;
  parts?: MessagePart[];
  uiBlocks?: UIBlock[];
}

interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'step-start';
  // Para tool-call
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  // Para tool-result
  result?: unknown;
  // Para text
  text?: string;
}
```

#### 4.2 Flujo de Persistencia
```
Usuario envía mensaje
       │
       ▼
┌─────────────────────────┐
│ 1. INSERT user message  │
│    (session + user msg) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. streamText comienza  │
│    → INSERT placeholder │
│    assistant message    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 3. onStepFinish         │
│    → Log tool calls     │
│    (opcional: update)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. onFinish             │
│    → UPDATE assistant   │
│    message with full    │
│    content + parts      │
└─────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `app/api/chat/route.ts` | toUIMessageStreamResponse + tools | **ALTA** |
| `hooks/useChatReliable.ts` | Parser UI Protocol | **ALTA** |
| `components/chat/ChatMessage.tsx` | Render parts | **ALTA** |
| `store/chatStore.ts` | Fix persistencia | **MEDIA** |
| `types/chat.ts` | Nuevos tipos | **MEDIA** |
| `components/chat/ToolResultCard.tsx` | Nuevo componente | **MEDIA** |

---

## Plan de Ejecución

### Sprint 1: Core Streaming (2-3h)
1. [ ] Modificar `/api/chat/route.ts`:
   - Cambiar a `toUIMessageStreamResponse()`
   - Agregar tools básicas (search_contacts_deep, get_full_contact_context)
   - Configurar `stopWhen: stepCountIs(5)`

2. [ ] Actualizar `useChatReliable.ts`:
   - Parsear UI Message Stream Protocol
   - Manejar eventos: text-delta, tool-input-available, tool-output-available, finish

### Sprint 2: Renderizado (1-2h)
3. [ ] Crear `ToolResultCard.tsx`
4. [ ] Actualizar `ChatMessage.tsx` para renderizar parts
5. [ ] Estilos glass morphism para tool cards

### Sprint 3: Persistencia (1-2h)
6. [ ] Implementar `onFinish` callback con INSERT correcto
7. [ ] Arreglar `finalizeMessageInDb` para usar el ID real de DB
8. [ ] Probar carga de sesiones con mensajes guardados

### Sprint 4: Polish (1h)
9. [ ] Animaciones de tool execution
10. [ ] Error handling mejorado
11. [ ] Documentación actualizada

---

## Notas Técnicas

### UI Message Stream Protocol Events
```
start           → Inicio del mensaje
text-start      → Inicio de bloque de texto
text-delta      → Delta de texto (usar .delta, NO .text)
text-end        → Fin de bloque de texto
tool-input-start      → Tool iniciando
tool-input-delta      → Args del tool en streaming
tool-input-available  → Args completos, listo para ejecutar
tool-output-available → Resultado del tool
start-step      → Inicio de un step
finish-step     → Fin de step
finish          → Fin del mensaje
[DONE]          → Stream completado
```

### Diferencia Clave
```typescript
// ❌ toTextStreamResponse() - Solo texto plano
// El frontend recibe: "Hola, déjame buscar..."
// Cuando hay tool call, el texto después del tool NO llega

// ✅ toUIMessageStreamResponse() - Protocolo completo
// El frontend recibe eventos estructurados:
// { type: "text-delta", delta: "Hola, " }
// { type: "text-delta", delta: "déjame buscar..." }
// { type: "tool-input-available", toolName: "search_contacts_deep", input: {...} }
// { type: "tool-output-available", output: {...} }
// { type: "text-delta", delta: "Encontré 3 contactos:" }
// { type: "finish" }
```

---

## Referencias
- [Vercel AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Tool Calling Guide](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [useChat Hook](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
