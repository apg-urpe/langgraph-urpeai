# 💬 Módulo: Chat Principal

> Asistente IA con Function Calling para Business Intelligence

---

## 🎯 Propósito

El Chat Principal es la interfaz de inteligencia artificial de Urpe AI Lab, diseñada para:
- **Análisis de datos**: Consultar métricas y KPIs del negocio
- **Gestión CRM**: Buscar contactos, crear notas, ver citas
- **Generación de contenido**: Asistencia en redacción y análisis
- **Automatización**: Ejecutar acciones mediante function calling

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  ChatArea   │  │useChatReliable│ │  chatStore  │              │
│  │    (UI)     │  │   (Hook)    │  │  (Estado)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API ROUTE /api/chat                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Auth      │→ │  Gemini 3   │→ │   Tools     │              │
│  │   Check     │  │   Flash     │  │  Executor   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ chat_sessions│ │chat_messages│  │  CRM Data   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `hooks/useChatReliable.ts` | Hook principal de gestión del chat |
| `app/api/chat/route.ts` | Endpoint de procesamiento |
| `lib/ai/tools.ts` | Definiciones de herramientas |
| `lib/ai/tool-executor.ts` | Implementación de tools |
| `components/ChatArea.tsx` | UI del chat |
| `store/chatStore.ts` | Estado global |

---

## 🛠️ Sistema de Tools

### Tools Disponibles

| Tool | Descripción | Tabla Principal |
|------|-------------|-----------------|
| `get_contacts` | Buscar contactos | `wp_contactos` |
| `get_contact_details` | Detalle de un contacto | `wp_contactos` |
| `get_appointments` | Obtener citas | `wp_citas` |
| `get_conversations` | Historial de chats | `wp_conversaciones` |
| `search_messages` | Buscar en mensajes | `wp_mensajes` |
| `get_team_members` | Miembros del equipo | `wp_team_humano` |
| `get_funnel_stages` | Etapas del embudo | `wp_empresa_embudo` |
| `get_funnel_stats` | Estadísticas de embudo | Múltiples |
| `get_metrics` | KPIs del negocio | Múltiples |
| `get_tasks` | Tareas pendientes | `wp_tareas` |
| `get_contact_notes` | Notas de contacto | `wp_contactos_nota` |
| `create_note` | Crear nota | `wp_contactos_nota` |
| `delegate_to_crm_searcher` | Sub-agente de búsqueda | Múltiples |

### Ejemplo de Flujo

```
Usuario: "¿Cuántos contactos nuevos tuvimos esta semana?"
    │
    ▼
Gemini: Analiza y decide usar get_contacts con filtro de fecha
    │
    ▼
Tool Executor: Ejecuta query en wp_contactos
    │
    ▼
Gemini: Procesa resultado y genera respuesta
    │
    ▼
Usuario: "Esta semana se registraron 15 nuevos contactos..."
```

---

## 🎨 Experiencia de Usuario

### Funcionalidades

- **Streaming en tiempo real**: Respuestas carácter por carácter
- **Instrucciones personalizadas**: Prompts globales por sesión
- **Historial de sesiones**: Últimas 50 conversaciones
- **Soporte multimedia**: Análisis de imágenes y PDFs
- **UI Dinámica**: Bloques visuales (KPIs, tablas, gráficos)

### Estados Visuales

| Estado | Indicador |
|--------|-----------|
| Pensando | Animación de loading |
| Tool Calling | Badge de herramienta |
| Streaming | Texto aparece gradualmente |
| Error | Mensaje con opción de reintentar |

---

## 🔧 Configuración

### Gemini Settings
```typescript
const config = {
  model: 'gemini-3-flash-preview',
  temperature: 0.7,
  maxOutputTokens: 2048,
  thinkingLevel: 'medium'
};
```

### Añadir Nueva Tool

1. **Definir en `lib/ai/tools.ts`**:
```typescript
{
  name: 'nueva_tool',
  description: 'Descripción clara',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' }
    }
  }
}
```

2. **Implementar en `tool-executor.ts`**:
```typescript
case 'nueva_tool':
  return await nuevaToolFunction(args);
```

---

## 📚 Documentación Relacionada

- [Contexto detallado del Chat](./main-chat-context.md)
- [Arquitectura Multi-Agente](../monica-ai/MULTI_AGENT_PLAN.md)
- [Protocolo UI v5](../../architecture/ui-protocol-v5.md)
