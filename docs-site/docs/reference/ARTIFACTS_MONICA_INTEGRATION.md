---
title: "Contexto Sistema de Artefactos + Monica Chat — Propuesta de Integración"
---

**Fecha**: Enero 2026  
**Autor**: Cascade + Tony  
**Estado**: Propuesta / Investigación

---

## 1. Sistema de Artefactos (Estado Actual)

### 1.1 Tablas (Schema `public`)

| Tabla | PK | FKs Clave |
|-------|-----|-----------|
| `artifacts` | `id` UUID | `user_id` → `auth.users(id)`, `session_id` → `adaptive_interface.chat_sessions(id)`, `message_id` → `adaptive_interface.chat_messages(id)` |
| `artifact_versions` | `id` UUID | `artifact_id` → `artifacts(id)` CASCADE |
| `artifact_stars` | `id` UUID | `user_id` → `auth.users(id)`, `artifact_id` → `artifacts(id)` CASCADE |

**Relación con Deep Research**: `wp_deep_research.artifact_id` → `artifacts(id)` (genera artifact al completar investigación).

### 1.2 Tipos Soportados

**TypeScript** (`types/artifact.ts`):
```
'html' | 'markdown' | 'svg' | 'mermaid' | 'react' | 'code' | 'research'
```

**⚠️ BUG ENCONTRADO — CHECK constraint en BD**:
```sql
CHECK (type IN ('html', 'markdown', 'svg', 'mermaid', 'react', 'code'))
-- FALTA: 'research' no está en el CHECK constraint
```
Esto significa que crear un artifact de tipo `'research'` **falla silenciosamente a nivel DB**. Necesita migración.

### 1.3 Componentes

| Componente | Archivo | Función |
|-----------|---------|---------|
| `ArtifactPanel` | `components/ArtifactPanel.tsx` | Modal para ver/editar/previsualizar un artifact (iframe, modos preview/code/edit) |
| `ArtifactSidebar` | `components/ArtifactSidebar.tsx` | Panel lateral con lista de artifacts, filtros, búsqueda, star/delete |
| `ArtifactsView` | `components/admin/artifacts/ArtifactsView.tsx` | Grid admin de todos los artifacts |

### 1.4 Store (`store/artifactStore.ts`)

Zustand con `persist`. Acciones principales:
- `fetchArtifacts(userId)` — Lee de `public.artifacts`
- `createArtifact(userId, payload)` — Inserta en DB con `session_id` y `message_id` opcionales
- `openArtifact(artifact)` / `openExistingArtifact(id)` — Abre panel
- `saveCurrentArtifact(userId)` — Persiste cambios (crea o actualiza)
- `createVersion(artifactId, payload)` — Nuevo snapshot
- `toggleStar(userId, artifactId)` — Favoritos
- `makePublic(artifactId)` — Genera slug público

### 1.5 Flujo Actual de Creación

```
Usuario crea contenido manualmente → artifactStore.createArtifact() → INSERT en public.artifacts
                                                                    → Trigger crea version_number=1
                                                                    → ArtifactPanel se abre
```

**No hay creación automática desde Monica Chat.** Los campos `session_id` y `message_id` existen en la tabla pero **ninguna tool de Monica los usa**.

---

## 2. Monica Chat (Estado Actual)

### 2.1 Tablas (Schema `adaptive_interface`)

| Tabla | PK | Tipo PK | Notas |
|-------|-----|---------|-------|
| `chat_sessions` | `id` | TEXT | Incluye `user_id`, `title`, `is_archived`, `role_id` |
| `chat_messages` | `id` | UUID | Incluye `session_id` (TEXT), `user_id`, `content` (JSONB), `is_complete` |

### 2.2 API Route (`/api/chat`)

- **Modelo primario**: Gemini (via `@ai-sdk/google`)
- **Fallback**: OpenRouter
- **Protocolo**: Vercel AI SDK `streamText` + `toUIMessageStreamResponse()`
- **Auth**: Hybrid (cookies SSR + Bearer token)
- **Max steps**: 15 iteraciones de tools

### 2.3 Tools Actuales (14)

| # | Tool | Función |
|---|------|---------|
| 1 | `searchContacts` | Buscar contactos en CRM |
| 2 | `getContactContext` | Historial completo de un contacto |
| 3 | `createNote` | Crear nota en contacto |
| 4 | `countContacts` | Contar contactos con filtros |
| 5 | `getConversationalIntelligence` | Análisis de conversaciones RAW |
| 6 | `webSearch` | Búsqueda en internet (Firecrawl) |
| 7 | `webScrape` | Scraping de páginas web |
| 8 | `executePython` | Ejecución de Python (E2B sandbox) |
| 9 | `getAppointments` | Citas programadas |
| 10 | `getTasks` | Tareas del CRM |
| 11 | `getProjects` | Proyectos |
| 12 | `getTeamMembers` | Miembros del equipo |
| 13 | `getMetrics` | KPIs del negocio |
| 14 | `getFunnelStats` | Embudo de ventas |

**Ninguna tool crea, lee ni interactúa con artifacts.**

### 2.4 Hook (`useChatReliable.ts`)

- Maneja streaming SSE con estados: `idle → thinking → streaming → tool_executing → idle`
- Soporta `ToolPart` para mostrar progreso de tools en UI
- Persiste mensajes en `adaptive_interface.chat_messages`
- No tiene awareness de artifacts

### 2.5 Flujo de Mensajes

```
Usuario escribe → useChatReliable.sendMessage()
  → POST /api/chat (con history, enterpriseContext, roleId, attachments)
  → Gemini procesa + ejecuta tools si necesario
  → Stream SSE: text-delta, tool-input-start, tool-output-available, finish
  → updateMessageById() en chatStore
  → finalizeMessageInDb() persiste en Supabase
```

---

## 3. Verificación de Referencias (FKs)

### ✅ Correctas
- `artifacts.user_id` → `auth.users(id)` ON DELETE CASCADE
- `artifacts.session_id` (TEXT) → `adaptive_interface.chat_sessions(id)` ON DELETE SET NULL
- `artifacts.message_id` (UUID) → `adaptive_interface.chat_messages(id)` ON DELETE SET NULL
- `artifact_versions.artifact_id` → `artifacts(id)` ON DELETE CASCADE
- `artifact_stars` → ambas FKs correctas con CASCADE
- `wp_deep_research.artifact_id` → `artifacts(id)` ON DELETE SET NULL

### ⚠️ Issues Encontrados

1. **CHECK constraint de `type` falta `'research'`** — El frontend y TypeScript soportan `'research'` pero la DB lo rechaza.
2. **Cross-schema references** — `artifacts` está en `public`, `chat_sessions`/`chat_messages` en `adaptive_interface`. Las FKs están correctas pero es importante saberlo para queries directas.
3. **RLS en artifacts** usa `auth.uid()` directamente — Esto es correcto para acceso desde cliente, pero las tools de la API usan `service_role` key que bypasea RLS.

---

## 4. Mini-Propuesta de Integración

### 4.1 Objetivo

Permitir que Monica Chat **cree artifacts automáticamente** cuando genera contenido rico (HTML, código, investigaciones, diagramas, etc.) y que el usuario pueda **verlos inline** en el chat.

### 4.2 Cambios Necesarios

#### A. Migración DB — Arreglar CHECK constraint

```sql
ALTER TABLE public.artifacts 
DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts 
ADD CONSTRAINT artifacts_type_check 
CHECK (type IN ('html', 'markdown', 'svg', 'mermaid', 'react', 'code', 'research'));
```

#### B. Nueva Tool: `createArtifact` en `/api/chat/route.ts`

```
Tool 15: createArtifact
- Descripción: Crear un artifact persistente (HTML, código, diagrama, investigación)
- Parámetros:
  - content: string (contenido del artifact)
  - title?: string (título, auto-generado si no se provee)
  - type?: ArtifactType (auto-detectado si no se provee)
  - language?: string (para type='code')
  - description?: string
- Comportamiento:
  - Inserta en public.artifacts con session_id del chat actual y message_id
  - Usa service_role para bypass RLS
  - Retorna { artifactId, title, type } al modelo
  - El modelo incluye un marcador en su respuesta para el frontend
```

#### C. Marcador en Respuesta del Stream

Cuando Monica crea un artifact, incluir en el texto un marcador especial:

```
[artifact:UUID_DEL_ARTIFACT]
```

O alternativamente, usar un nuevo tipo de evento SSE:

```json
{"type": "artifact-created", "artifactId": "uuid", "title": "Mi Gráfico", "artifactType": "html"}
```

#### D. Frontend — Detectar y Renderizar

1. **En `useChatReliable.ts`**: Detectar evento `artifact-created` y agregar a `toolParts` o a un nuevo array `artifactParts`
2. **En `ChatArea.tsx`** o componente de mensaje: Renderizar un **ArtifactCard inline** que al hacer click abre `ArtifactPanel`
3. **En `ArtifactSidebar.tsx`**: Ya filtra por `session_id` — funcionará automáticamente

#### E. System Prompt Update

Agregar al prompt de Monica instrucciones sobre cuándo crear artifacts:

```
## Artifacts
Cuando generes contenido extenso o visual (HTML, código, diagramas, tablas complejas, investigaciones),
usa la herramienta createArtifact para persistirlo. Esto permite al usuario:
- Verlo en modo preview interactivo
- Editarlo
- Guardarlo en su biblioteca
- Compartirlo

CUÁNDO crear artifact:
- Código de más de 20 líneas
- HTML/CSS interactivo
- Diagramas Mermaid
- Investigaciones estructuradas
- Tablas complejas con datos

CUÁNDO NO crear artifact:
- Respuestas cortas de texto
- Listas simples
- Explicaciones breves
```

### 4.3 Flujo Integrado Propuesto

```
Usuario: "Genera un dashboard HTML con las métricas de este mes"
  ↓
Monica: getMetrics({periodo: "month"})  →  datos
  ↓
Monica: createArtifact({
  content: "<html>..dashboard HTML con datos...</html>",
  title: "Dashboard Métricas Enero 2026",
  type: "html"
})
  ↓
API: INSERT en public.artifacts con session_id + message_id
  ↓
Stream: text-delta con respuesta + evento artifact-created
  ↓
Frontend: Muestra mensaje + ArtifactCard inline [Click para ver]
  ↓
Usuario: Click → ArtifactPanel se abre con preview del dashboard
```

### 4.4 Prioridades de Implementación

| Fase | Tarea | Esfuerzo |
|------|-------|----------|
| **1** | Migración DB (CHECK constraint + 'research') | 5 min |
| **2** | Tool `createArtifact` en API route | 1-2 horas |
| **3** | Evento SSE `artifact-created` en stream | 30 min |
| **4** | Detección en `useChatReliable` + UI inline | 2-3 horas |
| **5** | Update system prompt | 15 min |
| **6** | Testing E2E | 1-2 horas |

**Total estimado**: ~1 día de trabajo.

### 4.5 Riesgos y Consideraciones

- **Token usage**: Crear artifacts grandes consume tokens del modelo. Limitar tamaño max a ~50KB.
- **Rate limiting**: Si Monica crea muchos artifacts por sesión, podría afectar performance. Limitar a ~10 por sesión.
- **Versioning**: La primera versión se crea automáticamente via trigger. Si Monica "mejora" un artifact, debería usar `updateArtifact` en vez de crear uno nuevo.
- **Cleanup**: Artifacts huérfanos de sesiones archivadas. El `ON DELETE SET NULL` ya maneja esto correctamente.
