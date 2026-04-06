# Sistema de Artefactos - Urpe AI Lab

## Descripción General

El sistema de artefactos permite a Monica AI generar contenido interactivo (HTML, SVG, Markdown, React, etc.) que se muestra en un panel dedicado junto al chat. Los usuarios pueden editar, versionar, guardar y compartir estos artefactos.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         page.tsx                                 │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   ChatArea    │  │ ArtifactPanel│  │   ArtifactSidebar     │ │
│  │               │  │   (Editor)   │  │     (Biblioteca)      │ │
│  │  ┌─────────┐  │  │              │  │                       │ │
│  │  │HtmlBlock│──┼──│→ Preview     │  │  Lista de artefactos  │ │
│  │  └─────────┘  │  │  Code        │  │  Filtros y búsqueda   │ │
│  │               │  │  Edit        │  │  Favoritos/Fijados    │ │
│  └───────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  artifactStore  │
                    │    (Zustand)    │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │          Supabase            │
              │  ┌────────────────────────┐  │
              │  │      artifacts         │  │
              │  │  artifact_versions     │  │
              │  │    artifact_stars      │  │
              │  └────────────────────────┘  │
              └──────────────────────────────┘
```

## Archivos Principales

| Archivo | Descripción |
|---------|-------------|
| `types/artifact.ts` | Tipos, interfaces y helpers (detectArtifactType) |
| `store/artifactStore.ts` | Estado global con Zustand |
| `lib/artifact-renderer.ts` | **Renderizado inteligente (cliente)** |
| `lib/research-renderer.server.ts` | **Renderizado Deep Research (servidor)** |
| `components/ArtifactPanel.tsx` | Panel de visualización/edición |
| `components/ArtifactSidebar.tsx` | Biblioteca de artefactos |
| `components/HtmlBlock.tsx` | Trigger para abrir artefactos desde el chat |
| `scripts/ARTIFACTS_SCHEMA.sql` | Schema de base de datos |

## Tipos de Artefactos

| Tipo | Descripción | Detección |
|------|-------------|-----------|
| `html` | Aplicaciones HTML interactivas | Tags HTML estándar |
| `markdown` | Documentos Markdown | Headers `#`, listas, links |
| `svg` | Imágenes vectoriales | `<svg>` tag |
| `mermaid` | Diagramas (flowchart, sequence) | Keywords mermaid |
| `react` | Componentes React | Import de React |
| `research` | Datos estructurados (JSON) | JSON con arrays de objetos, investigaciones |
| `code` | Snippets de código | Default fallback |

## Sistema de Renderizado Inteligente

El archivo `lib/artifact-renderer.ts` proporciona renderizado automático e inteligente de datos estructurados.

### Patrones de Datos Detectados

| Patrón | Descripción | Campos Clave |
|--------|-------------|--------------|
| `people` | Lista de personas | nombre, email, cargo, afiliación, áreas |
| `companies` | Lista de empresas | empresa, fundadores, industria |
| `products` | Lista de productos | producto, precio, categoría |
| `events` | Lista de eventos | evento, fecha, ubicación |
| `locations` | Lista de ubicaciones | ciudad, país, dirección |
| `stats` | Métricas/estadísticas | value, label, trend |
| `table` | Datos tabulares | Cualquier array de objetos consistentes |
| `key-value` | Pares clave-valor | Objetos simples |

### Análisis de Datos

```typescript
import { analyzeData, renderDataToHtml } from '@/lib/artifact-renderer';

// Analizar estructura de datos
const analysis = analyzeData(jsonData);
// { pattern: 'people', confidence: 0.85, rootKey: 'investigadores', items: [...] }

// Renderizar a HTML visual
const html = renderDataToHtml(jsonData, 'Título', 'Consulta original');
```

### Renderizado por Patrón

#### People (Personas/Investigadores)
- Tarjetas con avatar (inicial), nombre, cargo, afiliación
- Tags de áreas de investigación/especialidades
- Información adicional colapsable
- Soporte para campos: nombre, posicion, afiliacion, pais, email, areas_investigacion, tipo, salario_estimado, roles_adicionales

#### Companies (Empresas)
- Tarjetas con logo (inicial), nombre, industria
- Lista de fundadores como badges
- Fecha de fundación y empleados

#### Table (Datos Tabulares)
- Tabla responsiva con headers detectados automáticamente
- Límite de 50 filas y 8 columnas para rendimiento
- Hover effects y alternancia de colores

### Integración con Deep Research

El sistema procesa automáticamente resultados de Monica Deep Research:

```markdown
# 🔍 Investigación: Tema

**Consulta original:** ...
**Fecha:** ...

```json
{
  "investigadores": [...]
}
```
```

Se convierte automáticamente en una visualización rica con:
- Header con icono y título
- Caja de consulta original
- Cards visuales por cada item
- Footer con créditos

## Flujo de Datos

### 1. Creación de Artefacto (desde chat)

```
Usuario pregunta → Monica genera HTML → HtmlBlock detecta → 
Usuario click "Open" → openArtifact() → Panel se abre
```

### 2. Guardado de Artefacto

```
Usuario edita → updateEditContent() → hasUnsavedChanges=true →
Usuario click "Guardar" → saveCurrentArtifact() → 
  - Si temp: createArtifact() en DB
  - Si existe: createVersion() + updateArtifact()
```

### 3. Versionado

```
Cada guardado → createVersion() → 
artifact_versions (auto-incrementa version_number)
```

## API del Store

### Panel Actions

```typescript
openArtifact(content, options?)  // Abrir nuevo artefacto temporal
openExistingArtifact(id)         // Abrir artefacto de DB
closeArtifact()                  // Cerrar panel
setMode('preview'|'code'|'edit') // Cambiar modo
setPreviewSize('desktop'|'tablet'|'mobile')
updateEditContent(content)       // Actualizar contenido en edición
```

### CRUD Actions

```typescript
fetchArtifacts(userId)           // Cargar todos los artefactos
createArtifact(userId, payload)  // Crear nuevo
updateArtifact(artifactId, payload) // Actualizar existente
deleteArtifact(artifactId)       // Eliminar
```

### Version Actions

```typescript
fetchVersions(artifactId)        // Cargar historial
createVersion(artifactId, payload) // Crear versión
restoreVersion(artifactId, versionId) // Restaurar versión anterior
```

### Share Actions

```typescript
makePublic(artifactId)           // Generar URL pública
makePrivate(artifactId)          // Quitar acceso público
forkArtifact(artifactId)         // Crear copia (fork)
```

## Schema de Base de Datos

### artifacts

```sql
id UUID PRIMARY KEY
user_id UUID (FK auth.users)
session_id TEXT (FK chat_sessions)
message_id UUID (FK chat_messages)
title TEXT
content TEXT
type TEXT ('html'|'markdown'|'svg'|'mermaid'|'react'|'code')
language TEXT (para type='code')
description TEXT
tags TEXT[]
is_pinned BOOLEAN
is_public BOOLEAN
public_slug TEXT UNIQUE
view_count INTEGER
fork_count INTEGER
forked_from UUID (FK artifacts)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### artifact_versions

```sql
id UUID PRIMARY KEY
artifact_id UUID (FK artifacts)
content TEXT
title TEXT
description TEXT
version_number INTEGER (auto-increment por artifact)
change_description TEXT
is_auto_save BOOLEAN
created_at TIMESTAMPTZ
```

### artifact_stars

```sql
id UUID PRIMARY KEY
user_id UUID (FK auth.users)
artifact_id UUID (FK artifacts)
created_at TIMESTAMPTZ
UNIQUE(user_id, artifact_id)
```

## Componentes UI

### ArtifactPanel

Panel principal con tres modos:

1. **Preview**: Renderiza HTML en iframe con Tailwind
2. **Code**: Muestra código fuente (read-only)
3. **Edit**: Edición visual con iframe contenteditable

Features:
- Responsive preview (desktop/tablet/mobile)
- Copiar, descargar, abrir en nueva pestaña
- Status indicator (building/ready/saving)
- Guardar/descartar cambios

### ArtifactSidebar

Biblioteca de artefactos guardados:

- Búsqueda por título/descripción/tags
- Filtros: tipo, favoritos, fijados
- Agrupación: sesión actual vs otras sesiones
- Acciones: abrir, star, eliminar

### HtmlBlock

Tarjeta en el chat que indica un artefacto:

- Detecta cuando Monica genera HTML
- Status de "building" durante streaming
- Click para abrir en ArtifactPanel

## Seguridad (RLS)

```sql
-- Solo ver propios + públicos
artifacts_select: user_id = auth.uid() OR is_public = TRUE

-- Solo modificar propios
artifacts_update: user_id = auth.uid()
artifacts_delete: user_id = auth.uid()

-- Versiones heredan permisos del artifact padre
artifact_versions: EXISTS(SELECT 1 FROM artifacts WHERE ...)
```

## Funciones Helper (PostgreSQL)

```sql
-- Generar slug único para compartir
generate_artifact_slug(title TEXT) RETURNS TEXT

-- Hacer público con slug
make_artifact_public(artifact_uuid UUID) RETURNS TEXT

-- Fork de artefacto
fork_artifact(source_artifact_id UUID) RETURNS UUID
```

## Próximas Mejoras

1. **Más tipos de artefactos**:
   - Mermaid diagrams (requiere librería)
   - React components (requiere sandbox como Sandpack)

2. **Artefactos con IA embebida**:
   - API endpoint que el artefacto pueda llamar
   - Rate limiting por usuario

3. **Colaboración**:
   - Compartir con equipo
   - Edición colaborativa en tiempo real

4. **Templates**:
   - Galería de templates predefinidos
   - Fork de artefactos públicos

## Migración

Para aplicar el schema:

```bash
# Ejecutar en Supabase SQL Editor
cat scripts/ARTIFACTS_SCHEMA.sql | supabase db query
```
