# Contexto del Buscador Profundo de Contactos - Monica AI

## 🎯 Propósito

`search_contacts_deep` es una herramienta de búsqueda inteligente multi-fuente que permite a Monica encontrar contactos buscando simultáneamente en múltiples tablas y campos del CRM.

## 🏗️ Arquitectura

### Flujo de Búsqueda
```
Usuario pregunta → Monica detecta búsqueda → search_contacts_deep → 
5 búsquedas paralelas → Scoring por relevancia → Resultados ordenados
```

### Archivos Clave
- **Definición**: `lib/ai/tools.ts` - Tool declaration para Gemini
- **Implementación**: `lib/ai/tool-executor.ts` - `executeSearchContactsDeep()`
- **Instrucciones**: `app/api/chat/route.ts` - System prompt con ejemplos

---

## 🔍 Fuentes de Búsqueda

| Fuente | Tabla | Campos | Puntuación Base |
|--------|-------|--------|-----------------|
| **Nombre** | wp_contactos | nombre, apellido | 100-200 pts |
| **Contacto** | wp_contactos | telefono, email, notas, origen | 50 pts |
| **Teléfono** | wp_contactos | telefono (normalizado) | 80 pts |
| **Mensajes** | wp_mensajes | contenido | 15 pts |
| **Metadata** | wp_contactos | metadata::text | 30 pts |
| **Notas** | wp_contactos_nota | descripcion, titulo | 40 pts |
| **Resúmenes** | wp_conversaciones | resumen, inteligencia_conversacional | 20 pts |

### Sistema de Puntuación

```typescript
// Puntuación acumulativa por fuente
addScore(contactId, points, source);

// Bonus por coincidencia exacta en nombre
if (nombre.startsWith(searchTerm)) points += 50;
if (nombre === searchTerm) points += 50;

// Ejemplo: Contacto encontrado en múltiples fuentes
// Nombre: 150 pts + Mensajes: 15 pts + Notas: 40 pts = 205 pts total
```

---

## 📋 Parámetros de la Herramienta

```typescript
{
  query: string;           // REQUERIDO - Término de búsqueda
  scope?: 'all' | 'contacts' | 'messages' | 'metadata' | 'notes';  // Default: 'all'
  include_inactive?: boolean;  // Default: false
  limit?: number;          // Default: 15, Max: 30
}
```

### Scopes Disponibles

| Scope | Descripción | Tablas Consultadas |
|-------|-------------|-------------------|
| `all` | Búsqueda completa | Todas las fuentes |
| `contacts` | Solo datos de contacto | wp_contactos |
| `messages` | Solo mensajes | wp_mensajes |
| `metadata` | Solo metadata/tags | wp_contactos.metadata |
| `notes` | Solo notas | wp_contactos_nota |

---

## 📊 Estructura de Respuesta

```typescript
{
  success: true,
  data: {
    contacts: [
      {
        id: 123,
        nombre: "Juan",
        apellido: "Pérez",
        telefono: "+51999888777",
        email: "juan@email.com",
        estado: "cliente",
        es_calificado: "si",
        origen: "web",
        ultima_interaccion: "2024-12-27T10:00:00Z",
        is_active: true,
        paused_until: null,
        team_humano_id: 5,
        metadata: { tags: ["VIP", "Lima"] },
        _relevance: 185,           // Puntuación total
        _matchedIn: ["nombre", "mensajes", "notas"]  // Fuentes
      },
      // ... más contactos ordenados por _relevance DESC
    ],
    count: 15,
    query: "Juan",
    scope: "all",
    message: "Encontré 15 contacto(s) para \"Juan\""
  }
}
```

---

## 🎯 Cuándo Usar Esta Herramienta

### ✅ Usar `search_contacts_deep` cuando:
- Usuario busca por nombre: "Busca a Juan"
- Usuario busca por tema: "Contactos que hablaron de precio"
- Usuario busca por etiqueta: "Contactos VIP"
- Usuario busca por ubicación: "Clientes de Lima"
- Usuario busca por contenido: "Quién mencionó el proyecto X"

### ❌ Usar `get_contacts` cuando:
- Filtrar por estado específico: "Clientes activos"
- Filtrar por calificación: "Contactos calificados"
- Filtrar por asesor: "Contactos de María"
- Ordenar sin búsqueda: "Últimos 10 contactos"

---

## 🔧 Implementación Técnica

### Búsqueda Paralela
```typescript
const searchPromises: Promise<void>[] = [];

// 5 búsquedas ejecutadas en paralelo
searchPromises.push(searchInNames());
searchPromises.push(searchInSecondaryFields());
searchPromises.push(searchInMessages());
searchPromises.push(searchInMetadata());
searchPromises.push(searchInNotes());

await Promise.all(searchPromises);
```

### Normalización de Teléfono
```typescript
function normalizePhone(phone: string): string {
  return (phone || '').replace(/[\s\-\(\)\+\.]/g, '');
}

// "+51 999-888-777" → "51999888777"
// "999 888 777" → "999888777"
```

### Multi-Tenancy
Todas las queries filtran por `empresa_id` del contexto:
```typescript
.eq('empresa_id', ctx.enterpriseId)
```

---

## 📈 Performance

### Optimizaciones
- **Límites por query**: Máximo 100 resultados por fuente
- **Deduplicación**: Sets para evitar scoring duplicado
- **Búsqueda paralela**: 5 queries simultáneas
- **Top N final**: Solo retorna los mejores resultados

### Métricas Típicas
- **Tiempo promedio**: 200-500ms
- **Contactos evaluados**: Hasta 500 por búsqueda
- **Resultados finales**: Máximo 30

---

## 🎨 Integración con UI

Monica puede presentar los resultados usando UI blocks:

```markdown
Encontré 5 contactos que mencionaron "precio":

\`\`\`json:ui
{"type": "cards", "theme": "info", "data": {"items": [...]}}
\`\`\`
```

### Campos Útiles para Display
- `_relevance`: Mostrar como indicador de coincidencia
- `_matchedIn`: Mostrar badges de fuentes
- `nombre + apellido`: Título del contacto
- `telefono / email`: Info de contacto
- `estado`: Badge de estado

---

## 🧪 Ejemplos de Uso

### 1. Búsqueda Simple
```
Usuario: "Busca a María"
Monica: search_contacts_deep(query: "María")
```

### 2. Búsqueda en Mensajes
```
Usuario: "¿Quién preguntó por precios?"
Monica: search_contacts_deep(query: "precio", scope: "messages")
```

### 3. Búsqueda con Inactivos
```
Usuario: "Busca contactos pausados de Lima"
Monica: search_contacts_deep(query: "Lima", include_inactive: true)
```

### 4. Búsqueda en Notas
```
Usuario: "Contactos con nota de seguimiento"
Monica: search_contacts_deep(query: "seguimiento", scope: "notes")
```

---

## 🔒 Seguridad

- **RLS**: Filtrado automático por empresa
- **Límites**: Máximo 30 resultados
- **Validación**: Mínimo 2 caracteres de búsqueda
- **Sanitización**: Queries parametrizadas (no SQL injection)

---

## 📚 Referencias

- **Frontend equivalente**: `store/contactStore.ts` - SuperSearch
- **Tool definitions**: `lib/ai/tools.ts`
- **Tool executor**: `lib/ai/tool-executor.ts`
- **API Route**: `app/api/chat/route.ts`
