# 🔍 Auditoría del Sistema de Chat - Monica AI

## Estado Actual
**Síntoma**: El agente no muestra el mensaje de respuesta en la pantalla.

---

## 📋 Componentes Auditados

### 1. Backend: `/app/api/chat/route.ts`

#### ✅ Correcto
- Autenticación usando `auth_uid` en `wp_team_humano`
- Validación multi-tenant de `enterpriseId`
- Construcción de system prompt con contexto empresarial
- Integración con toolsets MCP (CRM, Analytics, Paytony)
- Filtrado de tools por Monica Role

#### ⚠️ Problema Crítico: Formato de Stream
```typescript
// Línea 376
return result.toTextStreamResponse();
```

**Diagnóstico**: `toTextStreamResponse()` de Vercel AI SDK v4 devuelve un stream con protocolo específico:
- Texto: `0:"contenido del texto"`
- Tool calls: `9:{"toolCallId":...}`
- Finish: `d:{"finishReason":"stop"}`

**El frontend espera formatos diferentes**, causando que el texto no se procese.

---

### 2. Frontend: `/hooks/useChatReliable.ts`

#### ✅ Correcto
- Envía `userContext.authUid` (UUID) al backend
- Gestión de estados `thinking` → `streaming` → `idle`
- Persistencia de mensajes en Supabase
- Tracking de engagement

#### ⚠️ Problema Crítico: Parser de Stream (líneas 224-267)

```typescript
// El código actual:
const type = line.slice(0, firstColonIndex);  // "0"
const content = line.slice(firstColonIndex + 1);  // "\"Hola...\""

if (type === '0') {
  let text = content;
  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);  // Debería funcionar...
  }
  fullContent += text;
}
```

**Problemas identificados**:

1. **Edge cases de parsing JSON**: Si el texto contiene saltos de línea o caracteres especiales, `JSON.parse()` puede fallar silenciosamente en el catch.

2. **Buffer incompleto**: El split por `\n` puede cortar chunks en medio de un JSON string.

3. **Silencio de errores**: El `catch(e)` no hace nada, causando pérdida silenciosa de datos.

---

### 3. Store: `/store/chatStore.ts`

#### ✅ Correcto
- `addMessage`: Agrega mensajes correctamente al estado
- `updateMessageById`: Actualiza contenido por ID
- Persistencia en Supabase (non-blocking)

#### ⚠️ Potencial Issue
El update es síncrono y debería funcionar, pero depende de que `updateMessageById` sea llamado con contenido válido.

---

### 4. UI: `/components/MessageContentRenderer.tsx`

#### ✅ Correcto
- Parsing robusto con `ContentParser`
- Manejo de streaming con `TextPart` y `BlockPart`
- Markdown rendering con estilos apropiados

#### ⚠️ Depende de contenido
Si `content` llega vacío, no hay nada que renderizar.

---

## 🔴 Causa Raíz Identificada

### Incompatibilidad de Protocolo Stream

**Backend** (Vercel AI SDK v4) emite:
```
0:"Hola, "
0:"¿en qué "
0:"puedo ayudarte?"
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":20}}
```

**Frontend** intenta parsear pero:
1. El formato `0:"texto"` requiere parsing JSON exacto
2. Chunks pueden llegar fragmentados
3. Errores silenciosos en el catch impiden debugging

---

## 📊 Diagrama de Flujo Actual

```
Usuario → InputArea.sendMessage()
       ↓
useChatReliable.sendMessage()
       ↓
fetch('/api/chat') → Backend procesa → streamText()
       ↓                                    ↓
       ← ← ← ← ← ← ← ← ← ← ← ← toTextStreamResponse()
       ↓
reader.read() → buffer += decode(value)
       ↓
split('\n') → for each line:
       ↓
type = line[0:colonIndex]  // "0"
content = line[colonIndex+1:]  // "\"texto\""
       ↓
if type === '0':
  JSON.parse(content) ← ⚠️ PUEDE FALLAR SILENCIOSAMENTE
       ↓
updateMessageById(content) ← ⚠️ NO SE LLAMA SI PARSE FALLA
       ↓
ChatArea recibe messages ← ⚠️ content = "" (vacío)
       ↓
MessageContentRenderer → Nada que mostrar
```

---

## 🛠️ Plan de Corrección

### Opción A: Usar `useChat` de Vercel AI SDK (Recomendado)
Ventajas: Manejo automático del protocolo, soporte nativo para tools, menos código.

```typescript
import { useChat } from 'ai/react';

const { messages, input, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  body: { enterpriseId, userId, ... }
});
```

### Opción B: Usar `toDataStreamResponse()` con formato custom
El backend puede emitir en formato más simple que el frontend ya soporta.

### Opción C: Corregir el Parser Actual (Quick Fix)
Agregar logging y manejo robusto de errores en el parser.

---

## 🚀 Plan de Implementación (Opción C - Quick Fix)

### Paso 1: Agregar logging detallado al parser
```typescript
// En useChatReliable.ts línea 234
try {
  if (type === '0') {
    let text = content;
    if (text.startsWith('"') && text.endsWith('"')) {
      text = JSON.parse(text);
    }
    fullContent += text;
    updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
    logger.debug('[Stream] Text chunk received:', text.length, 'chars');
  }
} catch (e) {
  logger.error('[Stream] Parse error:', { type, content: content.slice(0, 50), error: e });
  // FALLBACK: Intentar usar contenido raw si parece texto
  if (type === '0' && content) {
    fullContent += content.replace(/^"|"$/g, '');
    updateMessageById(activeSessionId, assistantMsgId, fullContent, false);
  }
}
```

### Paso 2: Manejar chunks fragmentados
El buffer actual puede cortar JSON en medio. Solución: acumular hasta tener línea completa.

### Paso 3: Verificar en consola del navegador
Abrir DevTools → Network → ver respuesta raw del stream.

---

## 📝 Archivos a Modificar

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `hooks/useChatReliable.ts` | Corregir parser de stream | 🔴 Alta |
| `app/api/chat/route.ts` | Opcional: cambiar a `toDataStreamResponse` | 🟡 Media |
| `components/ChatArea.tsx` | Ninguno requerido | ✅ OK |
| `store/chatStore.ts` | Ninguno requerido | ✅ OK |

---

## 🧪 Testing Recomendado

1. **Test manual**: Enviar "Hola" y verificar respuesta
2. **Test con tools**: Preguntar "¿Cuántos contactos hay?" para verificar function calling
3. **Test de streaming**: Mensaje largo para verificar chunks
4. **Test de UI blocks**: Preguntar por métricas para verificar JSON:ui

---

*Auditoría realizada: 2026-01-01*
*Versión: Monica Chat v2.0 (Post-MCP Migration)*
