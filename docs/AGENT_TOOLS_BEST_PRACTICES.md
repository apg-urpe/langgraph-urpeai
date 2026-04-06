# Agent Tools Best Practices - Monica AI

**Fecha**: 22 Enero 2026  
**Autor**: Tony + Cascade  
**Fuentes**: Anthropic Context Engineering, Vercel AI SDK, LangChain

---

## Principios Clave (Investigación)

### 1. Context Engineering (Anthropic)
> "Good context engineering means finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome."

- **Descripciones claras** con lenguaje simple y directo
- **Tools sin overlap funcional** - Si un humano no puede decidir cuál usar, el LLM tampoco
- **Self-contained y robustas** - Cada tool debe manejar sus propios errores
- **Parámetros descriptivos** sin ambigüedad

### 2. Token Efficiency (Comet)
- **camelCase** para nombres (menos tokens que snake_case)
- **Solo tools necesarias** - Menos es más
- **Errores descriptivos** para "self-healing" del agente
- **Summarize, don't stream** - Outputs concisos

### 3. Vercel AI SDK Patterns
- **Descriptions específicas** sobre cuándo usar la tool
- **Zod schemas con .describe()** en cada campo
- **Execute con try/catch** y mensajes de recuperación

---

## Estructura Recomendada para Descriptions

```
PROPÓSITO: [Qué hace la tool en una línea]

CUÁNDO USAR:
- [Trigger phrase 1]
- [Trigger phrase 2]

CUÁNDO NO USAR:
- [Anti-pattern que confunde]

RETORNA: [Estructura del output esperado]

EJEMPLO: "[prompt del usuario]" → usa esta tool con {params}
```

---

## Tools Mejoradas - Monica CRM

### Tool 1: searchContacts (antes: search_contacts_deep)

**Cambios:**
- Nombre camelCase (ahorra ~2 tokens)
- Descripción estructurada
- Parámetros con ejemplos en .describe()
- Output uniforme con `_meta` para debugging
- Errores con sugerencia de acción

### Tool 2: getContactContext (antes: get_full_contact_context)

**Cambios:**
- Nombre más corto
- Descripción explica la diferencia con searchContacts
- Requiere contact_id con guía de cómo obtenerlo
- Output organizado por secciones

### Tool 3: createNote (antes: create_note)

**Cambios:**
- Nombre camelCase
- Validación de descripción mínima
- Confirmación clara en el output

### Tool 4: countContacts (NUEVA)

**Propósito:** Obtener métricas rápidas sin cargar datos completos

---

## Implementación

### Schema Base para Outputs

```typescript
interface ToolOutput<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    suggestion?: string;  // Guía para recovery
  };
  _meta?: {
    executionMs: number;
    recordCount?: number;
  };
}
```

### Naming Convention

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Lectura | `get*`, `search*`, `list*`, `count*` | `getContactContext` |
| Escritura | `create*`, `update*`, `delete*` | `createNote` |
| Acción | `send*`, `schedule*`, `assign*` | `sendMessage` |

### Error Codes

| Code | Significado | Suggestion |
|------|-------------|------------|
| `NOT_FOUND` | Recurso no existe | "Verifica el ID o busca primero" |
| `NO_ACCESS` | Sin permisos | "El contacto pertenece a otra empresa" |
| `INVALID_INPUT` | Parámetro inválido | "Revisa el formato de {param}" |
| `DB_ERROR` | Error de base de datos | "Intenta de nuevo en unos segundos" |

---

## Checklist de Calidad

- [ ] Nombre en camelCase
- [ ] Descripción con PROPÓSITO, CUÁNDO USAR, RETORNA
- [ ] Cada parámetro tiene .describe() con ejemplo
- [ ] Try/catch con error.suggestion
- [ ] Output tiene success boolean
- [ ] Logging al inicio del execute
- [ ] Sin overlap con otras tools

---

## Referencias

- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Comet: Context Engineering Best Practices](https://www.comet.com/site/blog/context-engineering/)
- [Vercel Academy: Tool Use](https://vercel.com/academy/ai-sdk/tool-use)
- [LangChain: Context Engineering for Agents](https://www.blog.langchain.com/context-engineering-for-agents/)
