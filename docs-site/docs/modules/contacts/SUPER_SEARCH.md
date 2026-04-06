---
title: "Super Search - Sistema de Búsqueda Optimizado"
---

## Descripción
Sistema de búsqueda eficiente que permite buscar contactos en múltiples fuentes de datos de manera rápida y precisa.

## Fuentes de Búsqueda

| Fuente | Campos | Puntuación Base |
|--------|--------|-----------------|
| **Perfil** | nombre, apellido, telefono, email, origen | 100-200 |
| **Notas** | descripcion, titulo (wp_contactos_nota) | 50 |
| **Metadata** | JSONB completo (wp_contactos.metadata) | 40 |
| **Mensajes** | contenido (wp_mensajes) | 30 |
| **Conversaciones** | resumen, inteligencia_conversacional | 25 |

## Arquitectura

### Componentes

1. **ContactSearchInput.tsx** - Componente UI de búsqueda
   - Búsqueda progresiva (100ms básica, 800ms profunda)
   - Usa RPC `super_search_contacts` cuando está disponible
   - Fallback a queries múltiples si RPC no existe

2. **contactStore.ts** - Estado y lógica de búsqueda
   - Super Search con queries paralelas
   - Scoring por relevancia
   - Cache y paginación

3. **SUPER_SEARCH_OPTIMIZED.sql** - Función RPC e índices
   - Función `super_search_contacts()` - Búsqueda completa
   - Función `quick_search_contacts()` - Búsqueda rápida
   - Índices GIN para trigramas

## Función RPC Principal

```sql
SELECT * FROM super_search_contacts(
    p_enterprise_id := 13,      -- ID de empresa
    p_search_query := 'juan',   -- Término de búsqueda
    p_search_scope := 'all',    -- 'basic', 'messages', 'metadata', 'notes', 'all'
    p_limit := 50               -- Límite de resultados
);
```

### Retorna
- `id`, `nombre`, `apellido`, `telefono`, `email`
- `relevance_score` - Puntuación de relevancia (0-200+)
- `match_source` - Fuente del match ('perfil', 'notas', 'metadata', 'mensajes')
- `match_preview` - Preview del texto donde se encontró

## Índices Optimizados

```sql
-- Trigramas para búsqueda fuzzy
CREATE INDEX idx_contactos_nombre_trgm ON wp_contactos USING GIN (nombre gin_trgm_ops);
CREATE INDEX idx_contactos_apellido_trgm ON wp_contactos USING GIN (apellido gin_trgm_ops);
CREATE INDEX idx_contactos_telefono_trgm ON wp_contactos USING GIN (telefono gin_trgm_ops);

-- GIN para metadata JSONB
CREATE INDEX idx_contactos_metadata_gin ON wp_contactos USING GIN (metadata);

-- Índices para notas y mensajes
CREATE INDEX idx_contactos_nota_descripcion_trgm ON wp_contactos_nota USING GIN (descripcion gin_trgm_ops);
CREATE INDEX idx_mensajes_contenido_trgm ON wp_mensajes USING GIN (contenido gin_trgm_ops);
```

## Instalación

Ejecutar en Supabase SQL Editor:
```bash
scripts/SUPER_SEARCH_OPTIMIZED.sql
```

## Flujo de Búsqueda

```
Usuario escribe → [100ms] Búsqueda local instantánea
                → [800ms] RPC super_search_contacts
                → [fallback] Queries paralelas si RPC falla
                → Merge resultados con scoring
                → Mostrar con badges de fuente
```

## Scoring de Relevancia

| Condición | Puntos |
|-----------|--------|
| Nombre exacto | 200 |
| Nombre empieza con | 150 |
| Nombre contiene | 120 |
| Teléfono contiene | 100 |
| Email contiene | 80 |
| Nota contiene | 50 |
| Metadata contiene | 40 |
| Mensaje contiene | 30 |

## Scopes Disponibles

- **basic** - Solo perfil (nombre, teléfono, email)
- **messages** - Solo mensajes
- **metadata** - Solo metadata JSONB
- **notes** - Solo notas
- **all** - Búsqueda completa en todas las fuentes

## Performance

| Escenario | Sin índices | Con índices |
|-----------|-------------|-------------|
| Búsqueda básica | ~500ms | ~50ms |
| Búsqueda profunda | ~2000ms | ~200ms |
| Con 10K contactos | ~5000ms | ~300ms |

## Uso desde Componentes

```tsx
import { ContactSearchInput } from '@/components/admin/contacts/ContactSearchInput';

<ContactSearchInput
  selectedContact={contact}
  onSelectContact={setContact}
  placeholder="Buscar en todo..."
  maxResults={10}
/>
```

## Troubleshooting

### RPC no disponible
Si la función RPC no está instalada, el sistema hace fallback automático a queries paralelas. Verifica ejecutando:
```sql
SELECT * FROM super_search_contacts(13, 'test', 'basic', 5);
```

### Búsqueda lenta
1. Verificar que los índices GIN estén creados
2. Ejecutar `VACUUM ANALYZE wp_contactos;`
3. Revisar límites de resultados

### No encuentra en metadata
Asegurarse de que el campo `metadata` contiene JSON válido y que el índice GIN está activo:
```sql
SELECT id, metadata::text FROM wp_contactos WHERE metadata IS NOT NULL LIMIT 5;
```
