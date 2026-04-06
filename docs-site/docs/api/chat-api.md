---
title: "Chat API"
---

> Endpoint principal del asistente IA

---

## Endpoint

```
POST /api/chat
```

---

## Request

### Headers
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

### Body
```typescript
interface ChatRequest {
  messages: ChatMessage[];
  sessionId: string;
  enterpriseId: number;
  userId: number;
  language?: 'es' | 'en';
  customInstructions?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

### Ejemplo
```json
{
  "messages": [
    { "role": "user", "content": "¿Cuántos contactos nuevos tuve esta semana?" }
  ],
  "sessionId": "session_abc123",
  "enterpriseId": 1,
  "userId": 5,
  "language": "es"
}
```

---

## Response

### Streaming (SSE)
El endpoint responde con Server-Sent Events para streaming en tiempo real.

```typescript
// Evento de texto
data: {"type":"text","content":"Basado en los datos..."}

// Evento de tool call
data: {"type":"tool_call","tool":"get_contacts","args":{}}

// Evento de tool result
data: {"type":"tool_result","tool":"get_contacts","result":[...]}

// Evento final
data: {"type":"done","requestId":"xxx"}
```

### Estructura de Eventos

| Tipo | Descripción |
|------|-------------|
| `text` | Fragmento de texto de la respuesta |
| `tool_call` | Notificación de tool siendo ejecutada |
| `tool_result` | Resultado de tool (opcional) |
| `error` | Error durante procesamiento |
| `done` | Fin del stream |

---

## Function Calling

El endpoint soporta function calling nativo de Gemini:

### Flujo
1. Usuario envía mensaje
2. Gemini decide si usar tools
3. Si usa tool, se ejecuta y el resultado vuelve a Gemini
4. Gemini genera respuesta final

### Tools Disponibles
Ver [Monica AI - Tools](/modules/monica-ai/#tools-disponibles)

---

## Errores

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | `Unauthorized` | Token inválido o expirado |
| 400 | `Invalid request body` | Body malformado |
| 500 | `Internal server error` | Error en Gemini o Supabase |

---

## Ejemplo de Uso

```typescript
// Con hook useChatReliable
const { sendMessage, messages, isLoading } = useChatReliable();

await sendMessage("¿Cuántos contactos tengo?");

// Respuesta aparece en messages[]
```

---

## Rate Limiting

- **60 requests/minuto** por usuario
- Backoff automático en cliente

---

## Observabilidad

Cada request genera logs en `activity_logs`:
- `chat.request_started`
- `chat.tool_called` (por cada tool)
- `chat.request_completed`

Ver [Observabilidad](../technical/observability/)
