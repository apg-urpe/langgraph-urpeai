---
title: "Auditoría del Sistema de Chat - Monica AI"
---

## 📅 Fecha: Enero 2025

---

## 🔴 Problemas Críticos Identificados

### 1. Error PGRST204: Columna `updated_at` faltante en `chat_messages`

**Error en consola:**
```
[ChatStore] Error finalizando mensaje: {"code":"PGRST204","details":null,"hint":null,"message":"Could not find the 'updated_at' column of 'chat_messages' in the schema cache"}
```

**Causa raíz:**
- El esquema SQL de `chat_messages` (definido en `docs/MULTI_SESSION_CHAT_PLAN.md`) **NO incluye** la columna `updated_at`
- El código en `chatStore.ts` línea 665 intenta actualizar esa columna inexistente

**Archivo afectado:** `store/chatStore.ts`
```typescript
// Línea 662-666
.update({
  content: { text: content, uiBlocks: uiBlocks || [] },
  is_complete: true,
  updated_at: new Date().toISOString()  // ❌ ESTA COLUMNA NO EXISTE
})
```

**Esquema actual de `chat_messages`:**
```sql
CREATE TABLE adaptive_interface.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),  -- Solo esta columna de tiempo
  metadata jsonb DEFAULT '{}',
  is_complete boolean DEFAULT false,
  request_id uuid,
  feedback text,
  is_archived boolean DEFAULT false
  -- ❌ NO HAY updated_at
);
```

---

### 2. API Key de Gemini no configurada correctamente

**Problema:**
- El SDK `@ai-sdk/google` busca por defecto `GOOGLE_GENERATIVE_AI_API_KEY`
- El proyecto usa `GEMINI_API_KEY`

**Archivo afectado:** `app/api/chat/route.ts`

**Estado:** ✅ CORREGIDO
```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});
```

---

## 🟡 Problemas Menores

### 3. Inconsistencia entre `DbChatMessage` type y esquema real

**Archivo:** `types.ts`
```typescript
export interface DbChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: { text?: string; uiBlocks?: any[]; };
  created_at: string;
  metadata?: { attachments?: any[]; };
  is_complete: boolean;
  feedback?: 'like' | 'dislike' | null;
  is_archived: boolean;
  // ❌ Falta: request_id que SÍ existe en DB
}
```

---

## 📋 Plan de Corrección

### Opción A: Agregar columna a la base de datos (Recomendado)
Agregar `updated_at` a `chat_messages` para consistencia con `chat_sessions`.

### Opción B: Eliminar del código (Más rápido)
Remover la referencia a `updated_at` del código de `finalizeMessageInDb`.

**Decisión:** Implementar **Opción A** porque:
1. Mantiene consistencia con `chat_sessions`
2. Permite tracking de ediciones futuras
3. Es una buena práctica tener timestamps de modificación

---

## 🛠️ Scripts de Corrección

### SQL: Agregar columna `updated_at` a `chat_messages`

```sql
-- Agregar columna updated_at a chat_messages
ALTER TABLE adaptive_interface.chat_messages 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Crear trigger para actualizar automáticamente
CREATE OR REPLACE FUNCTION adaptive_interface.update_chat_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Solo crear trigger si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_chat_messages_updated'
  ) THEN
    CREATE TRIGGER trigger_chat_messages_updated
      BEFORE UPDATE ON adaptive_interface.chat_messages
      FOR EACH ROW
      EXECUTE FUNCTION adaptive_interface.update_chat_messages_timestamp();
  END IF;
END $$;

-- Actualizar registros existentes que no tienen updated_at
UPDATE adaptive_interface.chat_messages 
SET updated_at = created_at 
WHERE updated_at IS NULL;
```

---

## 📁 Archivos a Modificar

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| `store/chatStore.ts` | Verificar que updated_at funcione post-migración | Alta |
| `types.ts` | Agregar `updated_at` a `DbChatMessage` | Media |
| `scripts/CHAT_MESSAGES_FIX.sql` | Crear script de migración | Alta |

---

## ✅ Checklist de Verificación Post-Corrección

- [ ] Ejecutar script SQL en Supabase
- [ ] Verificar que `finalizeMessageInDb` no arroje errores
- [ ] Probar envío de mensajes en el chat
- [ ] Verificar que la respuesta de Monica no esté en blanco
- [ ] Confirmar que los mensajes se persisten correctamente

---

## 🧹 Código Obsoleto Identificado

### En `store/chatStore.ts`:
- `updateMessageContentInDb` (línea 719-721): Función vacía que no hace nada
  ```typescript
  updateMessageContentInDb: async (sessionId, messageId, content) => {
     return; 
  },
  ```

---

**Última actualización:** Enero 2025
**Autor:** Sistema de Auditoría Automatizado
