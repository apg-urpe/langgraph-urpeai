---
title: "Propuesta de Refactorización Tools del CRM Searcher"
---

## 📋 Resumen Ejecutivo

**Fecha**: 29 Diciembre 2024  
**Problema**: Monica usa demasiadas herramientas para consultas simples y el Card no renderiza contenido key-value.

### Ejemplo del Problema
**Solicitud**: "Busca a Anthony"  
**Resultado**: 5 tools ejecutadas (10.42s), 3 fallaron, UI no muestra datos del card.

---

## 🔍 Diagnóstico

### Problema 1: Card Block no renderiza datos key-value

**JSON generado por Monica:**
```json
{
  "type": "card",
  "title": "Ficha de Contacto: Anthony Alarcon",
  "data": {
    "Email": "tonyalarcon27@gmail.com",
    "Teléfono": "+57 3197338787",
    "Estado": "Prospecto (Evaluando)"
  }
}
```

**Causa raíz**: `CardBlock.tsx` espera:
- `data.sections` (array de secciones)
- `data.content` (string o array)
- Campos legacy: `overview`, `productos`, `contacto`

El formato **key-value plano en `data`** NO está soportado.

**Fix propuesto**: Agregar normalización en `BlockValidator.ts` para convertir key-value plano a formato sections.

---

### Problema 2: Tools fragmentadas causan ineficiencia

**Arquitectura actual (18+ tools):**

| Categoría | Tools | Problema |
|-----------|-------|----------|
| Contactos | `get_contacts`, `get_contact_details`, `search_contacts_deep`, `get_sorted_contacts`, `get_full_contact_context` | 5 tools que se superponen |
| Citas | `get_appointments` | OK |
| Tareas | `get_tasks` | OK |
| Proyectos | `get_projects`, `get_project_details` | 2 tools |
| Marketing | `get_campaigns`, `get_campaign_stats`, `get_email_sends` | 3 tools |
| Conversaciones | `get_conversations`, `search_messages` | 2 tools |
| Equipo | `get_team_members`, `get_funnel_stages`, `get_funnel_stats` | 3 tools |
| Métricas | `get_metrics` | OK |
| Notas | `get_contact_notes` | Debería incluirse en contexto del contacto |

**Comportamiento observado**: Para "Busca a Anthony", el sub-agente ejecutó:
1. `get_contacts` ✅ (encontró al contacto)
2. `get_full_contact_context` ❌ (falló)
3. `get_contact_details` ✅ (redundante)
4. `get_conversations` ❌ (falló)
5. `get_funnel_stages` ❌ (innecesario)

**Causa raíz**: 
- Prompt del sub-agente no guía claramente cuándo usar cada tool
- Tools con nombres similares confunden al modelo
- No hay jerarquía clara de "usa esta primero, luego esta si necesitas más"

---

## 🎯 Propuesta de Refactorización

### Nueva Arquitectura: 6 Tools Unificadas

```
ANTES (18+ tools fragmentadas)     →     DESPUÉS (6 tools claras)
─────────────────────────────────────────────────────────────────
get_contacts                        │
get_contact_details                 │  → search_crm
search_contacts_deep                │    (búsqueda universal)
get_sorted_contacts                 │
search_messages                     │
─────────────────────────────────────────────────────────────────
get_full_contact_context            │  → get_contact_360
get_contact_notes                   │    (vista completa de contacto)
(+ conversaciones, citas, tareas)   │
─────────────────────────────────────────────────────────────────
get_appointments                    │  → get_agenda
                                    │    (todo sobre citas)
─────────────────────────────────────────────────────────────────
get_funnel_stages                   │
get_funnel_stats                    │  → get_pipeline
get_sorted_contacts                 │    (embudo y contactos)
─────────────────────────────────────────────────────────────────
get_metrics                         │
get_campaign_stats                  │  → get_business_metrics
                                    │    (KPIs y métricas)
─────────────────────────────────────────────────────────────────
get_team_members                    │  → get_team_config
get_funnel_stages                   │    (equipo y configuración)
```

---

### Definición de Nuevas Tools

#### 1. `search_crm` - Búsqueda Universal

```typescript
{
  name: 'search_crm',
  description: `🔍 BÚSQUEDA UNIVERSAL EN EL CRM
  
  USAR SIEMPRE PRIMERO para encontrar contactos, buscar información, 
  o cuando el usuario mencione un nombre/teléfono/email.
  
  EJEMPLOS:
  - "Busca a Juan" → search_crm(query: "Juan")
  - "Contactos nuevos de hoy" → search_crm(filter: "created_today")
  - "Quién habló de precios" → search_crm(query: "precios", scope: "messages")
  
  RETORNA: Lista de contactos con contexto básico (nombre, estado, última interacción)`,
  parameters: {
    query: 'string - Texto a buscar (nombre, teléfono, email, contenido)',
    scope: 'enum - Dónde buscar: all|contacts|messages|notes',
    filter: 'enum - Filtro rápido: created_today|active_week|hot_leads|no_response',
    limit: 'number - Máximo de resultados (default: 10)'
  }
}
```

#### 2. `get_contact_360` - Vista Completa de Contacto

```typescript
{
  name: 'get_contact_360',
  description: `👤 CONTEXTO COMPLETO DE UN CONTACTO
  
  USAR después de search_crm cuando necesites detalles de UN contacto específico.
  Retorna TODO el contexto en UNA sola llamada.
  
  INCLUYE:
  ✅ Perfil (datos básicos, estado, calificación)
  ✅ Notas del equipo
  ✅ Últimas conversaciones + resumen
  ✅ Citas (pasadas y programadas)
  ✅ Tareas relacionadas
  ✅ Historial de embudo
  ✅ Campañas donde está inscrito
  ✅ Cartera/Finanzas (si aplica)
  
  EJEMPLO: Usuario encontró a "Anthony" con search_crm, ahora quiere detalles
  → get_contact_360(contact_id: 123)`,
  parameters: {
    contact_id: 'number - ID del contacto (obtenido de search_crm)'
  }
}
```

#### 3. `get_agenda` - Citas y Disponibilidad

```typescript
{
  name: 'get_agenda',
  description: `📅 CITAS Y DISPONIBILIDAD
  
  USAR para preguntas sobre citas, agenda, disponibilidad.
  
  EJEMPLOS:
  - "¿Qué citas tengo hoy?" → get_agenda(view: "today")
  - "Citas de la semana" → get_agenda(view: "week")
  - "Citas de Juan Pérez" → get_agenda(contact_id: 123)
  - "¿Está disponible María mañana?" → get_agenda(asesor_id: 5, view: "tomorrow")`,
  parameters: {
    view: 'enum - today|tomorrow|week|month|all',
    contact_id: 'number - Filtrar por contacto',
    asesor_id: 'number - Filtrar por asesor',
    estado: 'enum - pendiente|confirmada|completada|cancelada'
  }
}
```

#### 4. `get_pipeline` - Embudo y Estado de Contactos

```typescript
{
  name: 'get_pipeline',
  description: `📊 ESTADO DEL EMBUDO Y CONTACTOS
  
  USAR para ver el pipeline de ventas, contactos por etapa, leads calientes.
  
  EJEMPLOS:
  - "¿Cómo está el embudo?" → get_pipeline(view: "overview")
  - "Contactos en negociación" → get_pipeline(etapa: "negociacion")
  - "Leads más calientes" → get_pipeline(view: "hot_leads")
  - "Mis prospectos sin respuesta" → get_pipeline(filter: "no_response")`,
  parameters: {
    view: 'enum - overview|hot_leads|stale|by_stage',
    etapa_id: 'number - Filtrar por etapa específica',
    asesor_id: 'number - Filtrar por asesor',
    filter: 'enum - no_response|needs_followup|qualified'
  }
}
```

#### 5. `get_business_metrics` - KPIs y Métricas

```typescript
{
  name: 'get_business_metrics',
  description: `📈 MÉTRICAS Y KPIS DEL NEGOCIO
  
  USAR para reportes, estadísticas, rendimiento.
  
  EJEMPLOS:
  - "Métricas de hoy" → get_business_metrics(period: "today")
  - "¿Cómo va la conversión?" → get_business_metrics(metric: "conversion")
  - "Rendimiento del equipo" → get_business_metrics(view: "team_performance")
  - "¿Cómo va la campaña de verano?" → get_business_metrics(campaign_id: 5)`,
  parameters: {
    period: 'enum - today|week|month|quarter|year',
    metric: 'enum - all|conversion|appointments|messages|leads',
    view: 'enum - summary|team_performance|trends',
    asesor_id: 'number - Filtrar por asesor',
    campaign_id: 'number - Métricas de campaña específica'
  }
}
```

#### 6. `get_team_config` - Equipo y Configuración

```typescript
{
  name: 'get_team_config',
  description: `👥 EQUIPO Y CONFIGURACIÓN
  
  USAR para información del equipo, roles, configuración del sistema.
  
  EJEMPLOS:
  - "¿Quiénes son los asesores?" → get_team_config(view: "members")
  - "Etapas del embudo" → get_team_config(view: "funnel_stages")
  - "¿Quién está disponible hoy?" → get_team_config(view: "availability")`,
  parameters: {
    view: 'enum - members|funnel_stages|availability|roles',
    only_active: 'boolean - Solo miembros activos (default: true)'
  }
}
```

---

## 🔧 Nuevo System Prompt del CRM Searcher

```markdown
Eres un agente especializado en búsqueda de datos CRM.

## REGLA DE ORO
Para la MAYORÍA de solicitudes, usa **UNA SOLA herramienta**:
- "Busca a X" → `search_crm` (y si piden detalles: `get_contact_360`)
- "Citas de hoy" → `get_agenda`
- "¿Cómo va el embudo?" → `get_pipeline`
- "Métricas del mes" → `get_business_metrics`

## FLUJO TÍPICO
1. **Búsqueda inicial**: `search_crm` para encontrar contactos/información
2. **Detalles específicos**: `get_contact_360` SOLO si el usuario pide más información
3. **NUNCA** llames múltiples tools si una es suficiente

## HERRAMIENTAS DISPONIBLES

| Tool | Cuándo Usar | Ejemplo |
|------|-------------|---------|
| `search_crm` | Buscar contactos, información, cualquier texto | "Busca a Juan" |
| `get_contact_360` | Detalles COMPLETOS de UN contacto ya identificado | "Dime todo sobre Juan (ID:123)" |
| `get_agenda` | Citas, disponibilidad, calendario | "Citas de mañana" |
| `get_pipeline` | Estado del embudo, leads por etapa | "¿Cómo va el embudo?" |
| `get_business_metrics` | KPIs, estadísticas, reportes | "Métricas del mes" |
| `get_team_config` | Equipo, configuración, roles | "¿Quiénes son los asesores?" |

## ANTI-PATRONES (NO HACER)
❌ Llamar `search_crm` + `get_contact_360` + `get_agenda` para "Busca a Juan"
✅ Solo `search_crm` es suficiente

❌ Llamar múltiples tools "por si acaso"
✅ Una tool bien elegida con los parámetros correctos

## FORMATO DE RESPUESTA
Retorna datos estructurados que el agente principal usará para generar UI.
```

---

## 📝 Fix del CardBlock

### Cambio en `BlockValidator.ts`

Agregar normalización para formato key-value plano:

```typescript
// Paso 2.6: Normalización de Card con data key-value plano
if (obj.type === 'card' && obj.data && typeof obj.data === 'object') {
  const data = obj.data as Record<string, unknown>;
  
  // Detectar si es key-value plano (sin sections, content, ni campos conocidos)
  const hasStructuredContent = data.sections || data.content || 
    data.overview || data.header;
  
  if (!hasStructuredContent) {
    // Convertir key-value plano a formato sections con fields
    const fields = Object.entries(data)
      .filter(([key]) => !['title', 'subtitle', 'image', 'footer', 'actions'].includes(key))
      .map(([label, value]) => ({
        label,
        value: String(value)
      }));
    
    if (fields.length > 0) {
      obj.data = {
        title: data.title,
        subtitle: data.subtitle,
        image: data.image,
        footer: data.footer,
        actions: data.actions,
        sections: [{
          title: 'Información',
          fields
        }]
      };
      warnings.push('Normalized flat key-value card data to sections format');
    }
  }
}
```

---

## 📊 Impacto Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Tools por búsqueda simple | 3-5 | 1 |
| Tiempo de respuesta | ~10-18s | ~2-4s |
| Tasa de éxito | ~60% | ~95% |
| Tokens consumidos | Alto | Bajo |
| Mantenibilidad | Difícil (18 tools) | Fácil (6 tools) |

---

## 🚀 Plan de Implementación

### Fase 1: Fix Inmediato (1 día)
1. ✅ Agregar normalización key-value en BlockValidator
2. ✅ Probar que cards rendericen correctamente

### Fase 2: Refactorización de Tools (2-3 días)
1. Crear nuevas 6 tools unificadas en `lib/ai/sub-agents/crm-searcher/tools-v2.ts`
2. Implementar executors en `executor-v2.ts`
3. Actualizar prompt del CRM Searcher
4. Mantener tools antiguas como deprecated (backward compatibility)

### Fase 3: Migración y Testing (1-2 días)
1. Activar nuevas tools con feature flag
2. Comparar performance A/B
3. Eliminar tools deprecated después de validación

---

## ✅ Checklist de Aceptación

- [ ] "Busca a Anthony" usa solo 1 tool y retorna en <3s
- [ ] Card renderiza datos key-value correctamente
- [ ] "Detalles de Anthony" usa máximo 2 tools
- [ ] No hay tools que fallen por falta de datos
- [ ] Todas las solicitudes comunes funcionan con las 6 nuevas tools
