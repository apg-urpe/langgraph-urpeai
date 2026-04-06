# Monica Chat Observability - Contexto y Propuesta

## 📊 Objetivo
Implementar un sistema de observabilidad para los pasos intermedios de Gemini en Monica Chat, permitiendo al equipo de desarrollo (rol id 1) visualizar:
- **Herramientas usadas** (function calling)
- **Argumentos enviados** a cada tool
- **Respuestas de las herramientas** (data/error)
- **Flujo de pensamiento** del modelo
- **Tiempos de ejecución** por paso

---

## 🏗️ Arquitectura Actual

### Flujo del Chat (`/api/chat/route.ts`)
```
Usuario → chatInput → Gemini (con tools) → [Loop hasta 5 iteraciones]
                                              ↓
                                    ¿functionCall? 
                                         ↓ SI
                              executeTool() → resultado
                                         ↓
                              Añadir a contents[]
                                         ↓
                              Siguiente iteración
                                         ↓ NO
                              streamFinalResponse()
```

### Puntos de Captura Actuales
- `console.log` básicos para debugging
- Sin persistencia de pasos intermedios
- Sin visibilidad para el frontend

### Tools Disponibles (13 herramientas)
| Tool | Descripción |
|------|-------------|
| `get_contacts` | Buscar/filtrar contactos |
| `search_contacts_deep` | Búsqueda profunda multi-fuente |
| `get_contact_details` | Detalles completos de contacto |
| `get_appointments` | Citas programadas |
| `get_conversations` | Historial de chats |
| `search_messages` | Buscar en mensajes |
| `get_team_members` | Miembros del equipo |
| `get_funnel_stages` | Etapas del embudo |
| `get_funnel_stats` | Estadísticas del embudo |
| `get_metrics` | KPIs del negocio |
| `get_tasks` | Tareas pendientes |
| `get_contact_notes` | Notas de contacto |
| `create_note` | Crear nota |

---

## 💡 Lluvia de Ideas - Opciones

### **Opción A: Panel Lateral en Chat (In-Context)**
**Descripción**: Panel colapsable al lado del chat que muestra los pasos en tiempo real.

**Pros**:
- Contexto inmediato sin cambiar de pantalla
- Actualización en tiempo real durante streaming
- UX fluida para debugging rápido

**Contras**:
- Espacio limitado en pantallas pequeñas
- Puede distraer del flujo de conversación
- Complejidad en mobile

**Complejidad**: Media

---

### **Opción B: Modal de Inspección por Mensaje**
**Descripción**: Botón "🔍 Inspeccionar" en cada mensaje del asistente que abre un modal con los pasos.

**Pros**:
- No interfiere con el chat normal
- Inspección detallada por mensaje específico
- Modal amplio para JSON viewer

**Contras**:
- Requiere click adicional
- No muestra flujo en tiempo real
- Necesita persistir datos por mensaje

**Complejidad**: Media-Alta

---

### **Opción C: Vista Dedicada en Admin Panel**
**Descripción**: Nueva sección "Observabilidad Monica" en el panel de administración con historial de requests.

**Pros**:
- Espacio amplio para visualización
- Historial completo de requests
- Filtros avanzados (por fecha, usuario, tools)
- Separación clara del chat de usuario

**Contras**:
- No es real-time durante el chat
- Requiere navegar fuera del chat
- Mayor overhead de desarrollo

**Complejidad**: Alta

---

### **Opción D: DevTools Flotante (Estilo Chrome DevTools)**
**Descripción**: Panel flotante tipo DevTools que se puede anclar abajo o al lado, con tabs para diferentes vistas.

**Pros**:
- Familiar para desarrolladores
- Flexible en posición y tamaño
- Tabs para organizar información
- Persistente durante la sesión

**Contras**:
- Puede ser complejo de implementar
- Overhead de estado global
- Mobile-unfriendly

**Complejidad**: Alta

---

### **Opción E: Inline Expandible (Accordion)**
**Descripción**: Cada mensaje del asistente tiene un accordion "Ver pasos" que expande los detalles inline.

**Pros**:
- Mínima interferencia visual
- Contexto por mensaje
- Implementación simple
- Mobile-friendly

**Contras**:
- Espacio limitado para JSON grande
- No permite comparar entre mensajes
- Scroll puede ser largo

**Complejidad**: Baja

---

## ✅ Propuesta Seleccionada: **Opción E + B Híbrida**

### "Inline Expandible con Modal Detallado"

**Razón de selección**:
1. **Bajo impacto visual**: No cambia el layout del chat
2. **Acceso rápido**: Accordion inline para vista rápida
3. **Detalle completo**: Modal para inspección profunda con JSON viewer
4. **Implementación progresiva**: Fácil de iterar
5. **Mobile-compatible**: Funciona en todas las pantallas

---

## 🎨 Diseño Propuesto

### 1. Estructura de Datos - `ToolTrace`
```typescript
interface ToolTrace {
  id: string;                    // UUID del trace
  requestId: string;             // ID del request completo
  iteration: number;             // Número de iteración (1-5)
  timestamp: number;             // Epoch ms
  
  // Tool Call
  toolName: string;              // Nombre de la herramienta
  toolArgs: Record<string, any>; // Argumentos enviados
  
  // Tool Result
  success: boolean;
  data?: any;                    // Datos retornados
  error?: string;                // Error si falló
  durationMs: number;            // Tiempo de ejecución
}

interface RequestTrace {
  id: string;                    // UUID del request
  sessionId: string;             // ID de sesión del chat
  userId: string;                // Usuario que hizo el request
  enterpriseId: number;          // Empresa
  
  // Timing
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  
  // Input
  userMessage: string;
  historyLength: number;
  
  // Tool Traces
  toolTraces: ToolTrace[];
  totalIterations: number;
  
  // Output
  finalResponse?: string;
  status: 'in_progress' | 'completed' | 'error';
  error?: string;
}
```

### 2. Componentes UI

#### A. `TraceAccordion` (Inline en mensaje)
```
┌─────────────────────────────────────────────────┐
│ [Respuesta del asistente...]                    │
│                                                 │
│ ▼ 🔧 3 tools ejecutadas • 1.2s total           │
│   ┌─────────────────────────────────────────┐  │
│   │ ✓ get_contacts (245ms)                  │  │
│   │ ✓ get_contact_details (389ms)           │  │
│   │ ✓ get_appointments (156ms)              │  │
│   │                         [Ver detalle 🔍] │  │
│   └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

#### B. `TraceDetailModal` (JSON Viewer completo)
```
┌──────────────────────────────────────────────────────────┐
│  🔬 Trace de Request                              [X]    │
├──────────────────────────────────────────────────────────┤
│  Tabs: [Timeline] [Tools] [Raw JSON]                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📥 Input                                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ "Busca contactos de Lima con citas pendientes"     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  🔧 Tool 1: search_contacts_deep                        │
│  ├─ Args: { query: "Lima", scope: "all" }               │
│  ├─ Duration: 456ms                                      │
│  └─ Result: ✓ 12 contactos                              │
│     ┌──────────────────────────────────────────────┐    │
│     │ {                                            │    │
│     │   "success": true,                           │    │
│     │   "data": {                                  │    │
│     │     "contacts": [...],                       │    │
│     │     "count": 12                              │    │
│     │   }                                          │    │
│     │ }                                            │    │
│     └──────────────────────────────────────────────┘    │
│                          [Copy] [Expand]                 │
│                                                          │
│  🔧 Tool 2: get_appointments                            │
│  ├─ Args: { contact_ids: [1,2,3], status: "pending" }   │
│  ├─ Duration: 234ms                                      │
│  └─ Result: ✓ 5 citas                                   │
│                                                          │
│  📤 Output (Final Response)                             │
│  ┌────────────────────────────────────────────────────┐ │
│  │ "Encontré 12 contactos de Lima..."                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ⏱️ Total: 1.2s | 🔧 3 tools | ✓ Success                │
└──────────────────────────────────────────────────────────┘
```

### 3. JSON Viewer Component
Usar librería especializada o custom:
- **`react-json-view-lite`**: Ligera, dark theme
- **`@uiw/react-json-view`**: Más features, collapsible
- **Custom**: Con syntax highlighting via Prism/Shiki

**Features del JSON Viewer**:
- Collapsible nodes
- Copy button por nivel
- Syntax highlighting
- Search dentro del JSON
- Expandir/Colapsar todo

### 4. Control de Acceso (Solo Rol 1)
```typescript
// En ChatArea.tsx o MessageBubble.tsx
const { userContext } = useContactStore();
const isDeveloper = userContext?.role_id === 1;

// Solo mostrar si es desarrollador
{isDeveloper && trace && (
  <TraceAccordion trace={trace} onViewDetail={() => setShowModal(true)} />
)}
```

### 5. Persistencia de Traces

#### Opción A: Solo en memoria (session)
```typescript
// chatStore.ts
interface ChatState {
  requestTraces: Map<string, RequestTrace>; // messageId -> trace
}
```

#### Opción B: LocalStorage para debugging extendido
```typescript
// Guardar últimos 50 traces
localStorage.setItem('monica_traces', JSON.stringify(traces.slice(-50)));
```

#### Opción C: Supabase para análisis histórico
```sql
-- Tabla en schema adaptive_interface
CREATE TABLE request_traces (
  id UUID PRIMARY KEY,
  session_id TEXT,
  user_id UUID,
  enterprise_id INTEGER,
  user_message TEXT,
  tool_traces JSONB,
  final_response TEXT,
  total_duration_ms INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Recomendación**: Empezar con Opción A (memoria) + B (localStorage) para MVP, luego migrar a C si se necesita análisis histórico.

---

## 🔧 Cambios Técnicos Requeridos

### 1. API Route (`/api/chat/route.ts`)
- Crear `RequestTrace` al inicio
- Capturar cada `ToolTrace` en el loop
- Retornar trace en header o body adicional

### 2. Hook `useChatReliable.ts`
- Recibir y almacenar trace del response
- Exponer trace por mensaje

### 3. Componentes Nuevos
- `components/chat/TraceAccordion.tsx`
- `components/chat/TraceDetailModal.tsx`
- `components/chat/JsonViewer.tsx`

### 4. Store
- Añadir `requestTraces` a `chatStore.ts`

---

## 📅 Estimación de Implementación

| Fase | Tarea | Tiempo |
|------|-------|--------|
| 1 | Tipos y estructura de datos | 1h |
| 2 | Modificar API para capturar traces | 2h |
| 3 | TraceAccordion component | 2h |
| 4 | TraceDetailModal + JSON Viewer | 3h |
| 5 | Integración en ChatArea | 1h |
| 6 | Control de acceso rol 1 | 0.5h |
| 7 | Testing y polish | 1.5h |
| **Total** | | **~11h** |

---

## 🎯 Criterios de Éxito

1. ✅ Desarrollador puede ver qué tools se ejecutaron por mensaje
2. ✅ Argumentos y respuestas son visibles en formato JSON legible
3. ✅ Tiempos de ejecución por tool y total
4. ✅ Solo visible para rol id 1
5. ✅ No afecta performance del chat normal
6. ✅ UX fluida sin fricción para debugging

---

## 🔗 Referencias

- **Langfuse**: https://langfuse.com/docs/observability/overview
- **LangSmith**: https://docs.smith.langchain.com/
- **Gemini Function Calling**: https://ai.google.dev/docs/function_calling

---

## ✅ Implementación Completada

### Archivos Creados
| Archivo | Descripción |
|---------|-------------|
| `types/observability.ts` | Tipos `RequestTrace`, `ToolTrace` y helpers |
| `components/chat/JsonViewer.tsx` | Visor JSON interactivo con collapsible nodes |
| `components/chat/TraceAccordion.tsx` | Accordion inline bajo mensajes |
| `components/chat/TraceDetailModal.tsx` | Modal completo con tabs Timeline/Tools/Raw |
| `components/chat/index.ts` | Exports del módulo |
| `components/chat/README.md` | Documentación del módulo |

### Archivos Modificados
| Archivo | Cambios |
|---------|---------|
| `app/api/chat/route.ts` | Captura traces en loop de tools, envía como primer evento SSE |
| `hooks/useChatReliable.ts` | Recibe traces, almacena por messageId, expone `getTraceForMessage` |
| `app/page.tsx` | Pasa `getTraceForMessage` a ChatArea |
| `components/ChatArea.tsx` | Integra TraceAccordion y TraceDetailModal con control de acceso |

### Control de Acceso
- Solo visible para usuarios con `roleId === 1` (equipo de desarrollo)
- Verificación en ChatArea antes de renderizar componentes de observabilidad

### Flujo de Datos
```
/api/chat:
  1. Crea RequestTrace al inicio
  2. Por cada tool call → crea ToolTrace con args, mide tiempo, captura resultado
  3. Envía trace como primer evento SSE antes del streaming de texto

useChatReliable:
  1. Parsea primer evento SSE
  2. Si contiene trace → almacena en messageTraces[messageId]
  3. Expone getTraceForMessage() para consultar

ChatArea:
  1. Si isDeveloper && trace.toolTraces.length > 0:
     - Muestra TraceAccordion inline bajo el mensaje
     - Click en "Ver detalle" abre TraceDetailModal
```

### Características del UI
- **TraceAccordion**: Resumen compacto con contador de tools, tiempo total, lista expandible
- **TraceDetailModal**: 3 tabs (Timeline, Tools, Raw JSON), visor JSON interactivo
- **JsonViewer**: Collapsible, syntax highlighting, copy button, truncado de strings largos
