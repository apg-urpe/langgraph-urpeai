---
title: "Plan Sistema de Chat Multi-Sesión con Persistencia"
---

## 📋 Resumen Ejecutivo

Implementar un sistema de chat donde **cada sesión mantiene un estado completamente independiente**, permitiendo al usuario tener múltiples conversaciones activas simultáneamente, con **persistencia completa en Supabase** usando el schema `adaptive_interface`.

---

## 🎯 Objetivos

1. **Estado Independiente por Sesión**: Cada chat opera de forma aislada
2. **Persistencia en Supabase**: Todos los mensajes se guardan en `adaptive_interface.chat_messages`
3. **Sincronización Multi-Dispositivo**: Estado consistente entre dispositivos
4. **UI Concurrente**: Múltiples chats pueden estar activos sin interferencia

---

## 🏗️ Arquitectura Actual vs Propuesta

### Estado Actual

```
┌─────────────────────────────────────────────────────────────┐
│                        chatStore.ts                          │
├─────────────────────────────────────────────────────────────┤
│  sessions: Record<string, ChatSession & { messages[] }>      │
│  activeSessionId: string                                     │
│  ↓                                                           │
│  IndexedDB (persistencia local) + Sync parcial a Supabase    │
└─────────────────────────────────────────────────────────────┘
```

**Problemas:**
- Mensajes viven principalmente en memoria/IndexedDB local
- Sync a Supabase es inconsistente (solo en ciertos eventos)
- No hay carga de mensajes desde Supabase al cambiar de sesión
- Estado compartido puede causar race conditions entre sesiones

### Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────┐
│                    chatStore.ts (refactored)                 │
├─────────────────────────────────────────────────────────────┤
│  sessions: Record<string, ChatSessionMeta>  ← Solo metadata  │
│  activeSessionId: string                                     │
│  activeSessionMessages: Message[]  ← Mensajes de la activa   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase adaptive_interface                   │
├─────────────────────────────────────────────────────────────┤
│  chat_sessions    → Metadata de cada sesión                  │
│  chat_messages    → Todos los mensajes (source of truth)     │
│  activity_logs    → Auditoría de acciones                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Schema de Base de Datos (Existente)

### `chat_sessions`
```sql
CREATE TABLE adaptive_interface.chat_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text DEFAULT 'New Analysis',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now(),
  message_count integer DEFAULT 0,
  has_attachments boolean DEFAULT false,
  custom_instructions text,
  is_archived boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  role_id uuid REFERENCES adaptive_interface.monica_roles(id)
);
```

### `chat_messages`
```sql
CREATE TABLE adaptive_interface.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES adaptive_interface.chat_sessions(id),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  is_complete boolean DEFAULT false,
  request_id uuid,
  feedback text CHECK (feedback IN ('like', 'dislike')),
  is_archived boolean DEFAULT false
);
```

---

## 🔧 Cambios Requeridos

### Fase 1: Refactorizar chatStore.ts (2-3 días)

#### 1.1 Separar Metadata de Mensajes

```typescript
// ANTES: Mensajes embebidos en sesiones
interface ChatState {
  sessions: Record<string, ChatSession & { messages: Message[] }>;
}

// DESPUÉS: Mensajes separados, cargados bajo demanda
interface ChatState {
  // Metadata de sesiones (ligero, siempre en memoria)
  sessions: Record<string, ChatSessionMeta>;
  
  // Mensajes solo de la sesión activa
  activeSessionId: string;
  activeMessages: Message[];
  isLoadingMessages: boolean;
  
  // Cache de mensajes recientes (opcional, para UX)
  messageCache: Map<string, Message[]>;
}

interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
  roleId?: string;
  // NO incluye messages[]
}
```

#### 1.2 Nuevas Acciones del Store

```typescript
interface ChatActions {
  // Sesiones
  loadSessions: (userId: string) => Promise<void>;
  createSession: (title?: string) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionMeta: (sessionId: string, updates: Partial<ChatSessionMeta>) => Promise<void>;
  
  // Mensajes - CRUD completo contra Supabase
  loadMessages: (sessionId: string) => Promise<void>;
  addMessage: (sessionId: string, message: Omit<Message, 'id'>) => Promise<string>;
  updateMessage: (messageId: string, updates: Partial<Message>) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  
  // Cambio de sesión activa
  setActiveSession: (sessionId: string) => Promise<void>;
  
  // Streaming (estado temporal, no persiste)
  appendToActiveMessage: (content: string) => void;
  finalizeActiveMessage: (messageId: string, finalContent: string) => Promise<void>;
}
```

#### 1.3 Persistencia Optimista + Confirmación

```typescript
// Patrón: Actualizar UI inmediatamente, confirmar con DB
const addMessage = async (sessionId: string, message: Omit<Message, 'id'>) => {
  const tempId = `temp-${crypto.randomUUID()}`;
  
  // 1. Optimistic update (UI instantánea)
  set(state => ({
    activeMessages: [...state.activeMessages, { ...message, id: tempId, isPending: true }]
  }));
  
  // 2. Persistir en Supabase
  const { data, error } = await supabase
    .schema('adaptive_interface')
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role: message.role,
      content: { text: message.content, uiBlocks: message.uiBlocks },
      is_complete: message.isComplete,
      metadata: { attachments: message.attachments }
    })
    .select()
    .single();
  
  // 3. Reemplazar temp con real
  if (data) {
    set(state => ({
      activeMessages: state.activeMessages.map(m => 
        m.id === tempId ? { ...m, id: data.id, isPending: false } : m
      )
    }));
  }
  
  return data?.id || tempId;
};
```

---

### Fase 2: Actualizar useChatReliable.ts (1-2 días)

#### 2.1 Integrar con Nuevo Store

```typescript
export const useChatReliable = () => {
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const activeMessages = useChatStore(state => state.activeMessages);
  const isLoadingMessages = useChatStore(state => state.isLoadingMessages);
  
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const finalizeActiveMessage = useChatStore(state => state.finalizeActiveMessage);
  
  // ... resto del hook
};
```

#### 2.2 Flujo de Envío de Mensaje

```typescript
const sendMessage = async (text: string) => {
  // 1. Guardar mensaje del usuario en Supabase
  const userMsgId = await addMessage(activeSessionId, {
    role: 'user',
    content: text,
    isComplete: true,
    uiBlocks: []
  });
  
  // 2. Crear placeholder para respuesta
  const assistantMsgId = await addMessage(activeSessionId, {
    role: 'assistant',
    content: '',
    isComplete: false,
    uiBlocks: []
  });
  
  // 3. Stream response
  const response = await fetch('/api/chat', { ... });
  
  // 4. Durante streaming: actualizar solo estado local
  // (no persistir cada chunk)
  
  // 5. Al finalizar: persistir contenido completo
  await finalizeActiveMessage(assistantMsgId, fullContent);
};
```

---

### Fase 3: Sincronización y Carga de Mensajes (1-2 días)

#### 3.1 Carga de Mensajes al Cambiar de Sesión

```typescript
const setActiveSession = async (sessionId: string) => {
  set({ activeSessionId: sessionId, isLoadingMessages: true });
  
  // Verificar cache primero
  const cached = get().messageCache.get(sessionId);
  if (cached) {
    set({ activeMessages: cached, isLoadingMessages: false });
    return;
  }
  
  // Cargar desde Supabase
  const { data } = await supabase
    .schema('adaptive_interface')
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(100);
  
  const messages = data?.map(transformDbMessage) || [];
  
  // Actualizar cache y estado
  get().messageCache.set(sessionId, messages);
  set({ activeMessages: messages, isLoadingMessages: false });
};
```

#### 3.2 Realtime Subscriptions (Opcional pero Recomendado)

```typescript
// Suscribirse a cambios en la sesión activa
const subscribeToSession = (sessionId: string) => {
  return supabase
    .schema('adaptive_interface')
    .channel(`session-${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'adaptive_interface',
      table: 'chat_messages',
      filter: `session_id=eq.${sessionId}`
    }, (payload) => {
      // Agregar mensaje si no existe localmente
      const newMessage = transformDbMessage(payload.new);
      set(state => {
        if (!state.activeMessages.find(m => m.id === newMessage.id)) {
          return { activeMessages: [...state.activeMessages, newMessage] };
        }
        return state;
      });
    })
    .subscribe();
};
```

---

### Fase 4: UI y Componentes (1 día)

#### 4.1 ChatSidebar - Lista de Sesiones

```tsx
// Mostrar sesiones ordenadas por última actividad
const SessionList = () => {
  const sessions = useChatStore(state => state.sessions);
  const sortedSessions = Object.values(sessions)
    .filter(s => !s.isArchived)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  
  return (
    <div className="space-y-1">
      {sortedSessions.map(session => (
        <SessionItem key={session.id} session={session} />
      ))}
    </div>
  );
};
```

#### 4.2 Indicadores de Estado por Sesión

```tsx
// Badge de estado: thinking, streaming, error
const SessionItem = ({ session }: { session: ChatSessionMeta }) => {
  const status = useSessionStatus(session.id); // thinking | streaming | idle
  
  return (
    <div className="flex items-center gap-2">
      <span className="truncate">{session.title}</span>
      {status === 'thinking' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'streaming' && <Radio className="w-3 h-3 text-green-500" />}
    </div>
  );
};
```

---

## 📅 Timeline Estimado

| Fase | Descripción | Duración | Dependencias |
|------|-------------|----------|--------------|
| 1 | Refactorizar chatStore.ts | 2-3 días | - |
| 2 | Actualizar useChatReliable.ts | 1-2 días | Fase 1 |
| 3 | Sincronización y carga de mensajes | 1-2 días | Fase 2 |
| 4 | UI y componentes | 1 día | Fase 3 |
| 5 | Testing y bug fixes | 1-2 días | Fase 4 |
| **Total** | | **6-10 días** | |

---

## ✅ Criterios de Aceptación

1. [ ] Usuario puede crear múltiples sesiones de chat
2. [ ] Cada sesión mantiene su propio estado (thinking/streaming) independiente
3. [ ] Al cambiar de sesión, los mensajes se cargan desde Supabase
4. [ ] Los mensajes nuevos se persisten inmediatamente en Supabase
5. [ ] El estado se sincroniza entre pestañas/dispositivos
6. [ ] No hay pérdida de mensajes al refrescar la página
7. [ ] El streaming funciona correctamente sin bloquear otras sesiones

---

## 🔄 Migración de Datos

### Script de Migración

```sql
-- Migrar mensajes existentes de IndexedDB a Supabase
-- (Ejecutar desde el cliente una sola vez)

-- Verificar sesiones huérfanas
SELECT session_id, COUNT(*) 
FROM adaptive_interface.chat_messages 
WHERE session_id NOT IN (SELECT id FROM adaptive_interface.chat_sessions)
GROUP BY session_id;

-- Crear sesiones faltantes si es necesario
INSERT INTO adaptive_interface.chat_sessions (id, user_id, title)
SELECT DISTINCT session_id, user_id, 'Imported Chat'
FROM adaptive_interface.chat_messages
WHERE session_id NOT IN (SELECT id FROM adaptive_interface.chat_sessions);
```

---

## 🧪 Testing

### Unit Tests

```typescript
describe('chatStore', () => {
  it('should load messages for active session', async () => {
    await store.setActiveSession('session-1');
    expect(store.activeMessages.length).toBeGreaterThan(0);
  });
  
  it('should persist new message to Supabase', async () => {
    const msgId = await store.addMessage('session-1', { role: 'user', content: 'test' });
    const { data } = await supabase.from('chat_messages').select().eq('id', msgId).single();
    expect(data).toBeDefined();
  });
  
  it('should maintain independent state per session', async () => {
    store.setSessionStatus('session-1', { isThinking: true });
    store.setSessionStatus('session-2', { isStreaming: true });
    expect(store.getSessionStatus('session-1').isThinking).toBe(true);
    expect(store.getSessionStatus('session-2').isStreaming).toBe(true);
  });
});
```

---

## 📚 Referencias

- **Zustand Best Practices**: https://github.com/pmndrs/zustand
- **Supabase Realtime**: https://supabase.com/docs/guides/realtime
- **Schema Actual**: `adaptive_interface` en Supabase
- **Docs Relacionados**: `docs/modules/chat/main-chat-context.md`

---

## 🚨 Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Pérdida de datos durante migración | Alto | Backup previo + migración incremental |
| Latencia al cargar mensajes | Medio | Cache local + paginación |
| Race conditions en streaming | Medio | Locks por sesión + queue de operaciones |
| Límite de mensajes por sesión | Bajo | Paginación + archivado automático |

---

**Última actualización**: Diciembre 2024
**Responsable**: Equipo de Desarrollo
**Estado**: ✅ Implementado (Fase 1-3)

---

## 🚀 Implementación Completada

### Cambios Realizados

#### 1. Tipos (`types.ts`)
- Agregado `ChatSessionMeta` - metadata ligera de sesión
- Agregado `DbChatMessage` - estructura del mensaje en Supabase

#### 2. Store (`store/chatStore.ts`)
- **`isLoadingMessages`**: Estado de carga de mensajes
- **`loadMessagesForSession(sessionId)`**: Carga mensajes desde Supabase
- **`persistMessageToDb(sessionId, message)`**: Persiste mensaje en Supabase (optimista)
- **`finalizeMessageInDb(sessionId, messageId, content)`**: Finaliza mensaje después de streaming
- **`setActiveSession(id)`**: Actualizado para cargar mensajes automáticamente
- **`selectIsLoadingMessages`**: Selector para estado de carga

#### 3. Hook (`hooks/useChatReliable.ts`)
- Integrado `persistMessageToDb` para guardar mensajes del usuario
- Integrado `persistMessageToDb` para guardar placeholder del asistente
- Integrado `finalizeMessageInDb` para persistir respuesta completa
- Exporta `isLoadingMessages` desde el store

### Flujo de Datos

```
Usuario envía mensaje
    ↓
addMessage (estado local) + persistMessageToDb (Supabase async)
    ↓
API call → streaming
    ↓
updateMessageById (chunks locales)
    ↓
finalizeMessageInDb (Supabase - contenido final)
```

### Cambio de Sesión

```
setActiveSession(id)
    ↓
Actualiza activeSessionId
    ↓
Si sesión no tiene mensajes → loadMessagesForSession(id)
    ↓
Carga mensajes desde Supabase.chat_messages
    ↓
Actualiza estado local con mensajes
```
