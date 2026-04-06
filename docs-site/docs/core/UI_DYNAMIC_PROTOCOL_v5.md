---
title: "Manual del Agente Protocolo de UI Dinámica v5"
---

## 🎯 Propósito

Este manual te enseña a generar componentes UI dinámicos que se renderizarán en la interfaz del usuario con la **nueva paleta de colores minimalista y alto contraste**. Sigue estas guías para crear visualizaciones interactivas, formularios, gráficos y más con coherencia visual perfecta.

---

## 🎨 Nueva Paleta de Colores Integrada

**v5 incluye la paleta `CardPalette.ts` con:**
- 🌑 **Fondos oscuros** con transparencias sutiles
- ✏️ **Texto de alto contraste** para máxima legibilidad  
- 🎨 **Bordes interactivos** que responden al usuario
- 🌟 **Sombras con efectos glow** para profundidad
- 🎮 **Estados contextuales** (success, warning, error, info)

**Uso en componentes:**
```tsx
import { cardThemes, cardClasses, cardUtils } from '@/lib/ui/CardPalette';

// Aplicar tema automáticamente
<div className={cardThemes.success}>

// Clase específica
<div className={cardClasses.primary}>

// Personalizado
<div className={cardUtils.createCustomCard({
  background: 'warning',
  border: 'warning',
  shadow: 'glowWarning'
})}>
```

---

## 🎯 Cuándo Usar UI Blocks

Usa UI blocks cuando necesites presentar información que se beneficie de visualización estructurada:

✅ **Ideal para:**
- Datos numéricos (KPIs, métricas)
- Visualizaciones (gráficos, tablas)
- Interacciones (formularios, botones)
- Calendarios y fechas
- Alertas y notificaciones
- Imágenes y videos
- **Tarjetas con estados visuales claros**

❌ **Evita para:**
- Texto simple (usa markdown normal)
- Listas básicas (usa markdown)
- Código (usa bloques de código markdown)

---

## 📝 Formato Básico v5

```markdown
Tu texto explicativo va aquí.

```json
{
  "type": "kpi_card",
  "title": "Ventas del Mes",
  "theme": "success",  // 🆕 Nuevo campo opcional
  "data": {
    "value": "$125,430",
    "trend": "up",
    "change": 12.5,
    "description": "vs mes anterior"
  }
}
```

Más texto explicativo después del bloque.
```

**🆕 Novedades v5:**
- Campo `theme` opcional para aplicar paleta de colores automáticamente
- Estados visuales mejorados con efectos glow
- Consistencia visual total con la aplicación

---

## 🎨 Tipos de Bloques Disponibles v5

### 1. KPI Card - Métricas con Temas
Perfecto para mostrar números clave con contexto visual mejorado.

```json
{
  "type": "kpi_card",
  "title": "Usuarios Activos",
  "theme": "success",  // 🆕 Aplica paleta verde
  "data": {
    "value": "2,847",
    "unit": "usuarios",
    "trend": "up",
    "change": 23.4,
    "description": "nuevos este mes",
    "actions": [
      { "id": "view_details", "label": "Ver Detalles", "icon": "Eye" }
    ]
  }
}
```

**🆈 Temas disponibles:** `default`, `success`, `warning`, `error`, `info`, `special`, `neutral`, `primary`, `secondary`

---

### 2. Chart - Gráficos Temáticos
Para visualizar datos numéricos con coherencia visual.

```json
{
  "type": "chart",
  "title": "Ventas por Mes",
  "theme": "primary",  // 🆕 Aplica paleta azul
  "data": {
    "chartType": "bar",
    "data": [
      { "name": "Enero", "value": 45000 },
      { "name": "Febrero", "value": 52000 },
      { "name": "Marzo", "value": 48000 }
    ],
    "colors": ["#3b82f6", "#10b981", "#f59e0b"]  // 🆕 Opcional, usa tema si no se especifica
  }
}
```

---

### 3. Table - Tablas con Estados
```json
{
  "type": "table",
  "title": "Lista de Productos",
  "theme": "neutral",  // 🆕 Aplica paleta cyan
  "data": {
    "headers": ["Producto", "Precio", "Stock"],
    "rows": [
      ["Laptop Pro", "$1,299", "15"],
      ["Mouse Gamer", "$79", "45"],
      ["Teclado RGB", "$149", "23"]
    ]
  }
}
```

---

### 4. Form - Formularios Contextuales
```json
{
  "type": "form",
  "title": "Contacto",
  "id": "contact_form",
  "theme": "info",  // 🆕 Aplica paleta azul info
  "data": {
    "fields": [
      { "name": "nombre", "label": "Nombre completo", "type": "text", "required": true },
      { "name": "email", "label": "Correo electrónico", "type": "email", "required": true },
      { "name": "mensaje", "label": "Mensaje", "type": "textarea", "placeholder": "Escribe tu mensaje aquí..." }
    ],
    "submitLabel": "Enviar"
  }
}
```

---

### 5. Actions - Botones con Estados
```json
{
  "type": "actions",
  "title": "Acciones Disponibles",
  "theme": "warning",  // 🆕 Aplica paleta ámbar
  "data": {
    "actions": [
      { "id": "generate_report", "label": "Generar Reporte", "icon": "FileText", "variant": "primary" },
      { "id": "export_data", "label": "Exportar CSV", "icon": "Download", "variant": "secondary" },
      { "id": "delete_all", "label": "Eliminar Todo", "icon": "Trash2", "variant": "danger" }
    ]
  }
}
```

---

### 6. Calendar - Calendarios Temáticos
```json
{
  "type": "calendar",
  "title": "Próximas Reuniones",
  "id": "calendar_main",
  "theme": "special",  // 🆕 Aplica paleta púrpura
  "data": {
    "view": "month",
    "events": [
      {
        "id": "1",
        "title": "Reunión de Equipo",
        "start": "2024-12-15T10:00:00",
        "end": "2024-12-15T11:00:00",
        "category": "meeting",
        "color": "#3b82f6"
      },
      {
        "id": "2",
        "title": "Deadline Proyecto",
        "start": "2024-12-20T23:59:59",
        "category": "deadline",
        "color": "#ef4444"
      }
    ],
    "actions": [
      { "id": "view_more", "label": "Ver más", "icon": "CalendarRange", "variant": "secondary" }
    ]
  }
}
```

---

### 7. Image - Imágenes con Temas
```json
{
  "type": "image",
  "title": "Screenshot del Dashboard",
  "theme": "default",  // 🆕 Aplica tema por defecto
  "data": {
    "url": "https://example.com/image.png",
    "alt": "Dashboard de analytics",
    "caption": "Vista general del rendimiento"
  }
}
```

---

### 8. Alerts - Notificaciones Contextuales v5
```json
{
  "type": "error",
  "title": "Error Crítico",
  "theme": "error",  // 🆕 Aplica paleta roja automáticamente
  "data": {
    "message": "No se pudo conectar a la base de datos",
    "details": "Error de conexión: timeout después de 30 segundos",
    "code": "DB_CONNECTION_ERROR"
  }
}
```

**🆈 Tipos con temas automáticos:**
- `error` → tema rojo con efecto glow
- `warning` → tema ámbar con efecto glow  
- `info` → tema azul con efecto glow
- `alert` → tema por defecto

---

### 9. Card - Tarjetas Detalladas v5
```json
{
  "type": "card",
  "title": "Firecrawl MCP Server",
  "theme": "success",  // 🆕 Aplica paleta verde a toda la tarjeta
  "data": {
    "content": [
      { "type": "section", "title": "Qué es", "body": "- Servidor MCP open-source..." },
      { "type": "section", "title": "Para qué se usa", "body": "- Scraping, crawling..." },
      { "type": "section", "title": "Cómo se usa", "body": "- Obtén API key... - Usa tools..." }
    ],
    "actions": [
      { "id": "open_docs", "label": "Ver Docs", "icon": "ExternalLink", "variant": "primary" }
    ]
  }
}
```

---

### 10. Cards - Listado de Tarjetas v5
```json
{
  "type": "cards",
  "title": "Recursos",
  "theme": "info",  // 🆕 Aplica paleta azul a todas las tarjetas
  "data": {
    "cards": [
      { "title": "Guía Rápida", "content": "Pasos iniciales<br>- Configura API<br>- Prueba en sandbox" },
      { "title": "FAQs", "content": "<ul><li>¿Tiempo de respuesta?</li><li>¿Costos?</li></ul>" }
    ]
  }
}
```

---

### 11. Grid - Cuadrícula de Tarjetas v5
```json
{
  "type": "grid",
  "title": "Cards Destacados",
  "theme": "special",  // 🆕 Aplica paleta púrpura a la cuadrícula
  "data": {
    "columns": "repeat(auto-fit,minmax(260px,1fr))",
    "items": [
      {
        "title": "Pikachu (#025)",
        "content": "Electric | HP:35 Atk:55 Spd:90 | ⚡ Thunderbolt",
        "image": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png"
      },
      {
        "title": "Gengar (#094)",
        "content": "Ghost/Poison | Spd:110 | 👻 Shadow Ball",
        "image": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png"
      }
    ],
    "actions": [
      { "id": "more_pokes", "label": "10 Pokémon Más", "icon": "Plus", "variant": "primary" }
    ]
  }
}
```

---

## 🎯 Mejores Prácticas v5

### 1. Uso de Temas Contextuales
Elige el tema según el tipo de información:

```markdown
Las ventas están superando las expectativas:

```json
{
  "type": "kpi_card",
  "title": "Ventas Totales Q3",
  "theme": "success",  // 🟢 Verde para éxito
  "data": {
    "value": "$487,230",
    "trend": "up",
    "change": 15.3,
    "description": "vs Q2"
  }
}
```

Pero hay áreas que necesitan atención:

```json
{
  "type": "kpi_card", 
  "title": "Tasa de Abandono",
  "theme": "warning",  // 🟡 Ámbar para advertencia
  "data": {
    "value": "12.4%",
    "trend": "up",
    "change": 2.1,
    "description": "vs mes anterior"
  }
}
```
```

### 2. Combinación de Temas
Usa diferentes temas para crear jerarquía visual:

```markdown
Dashboard de rendimiento del sitio:

```json
{
  "type": "kpi_card",
  "title": "Tráfico Total",
  "theme": "primary",  // 🔵 Azul para métrica principal
  "data": {"value": "125,847", "trend": "up", "change": 8.2}
}
```

```json
{
  "type": "kpi_card",
  "title": "Conversiones", 
  "theme": "success",  // 🟢 Verde para éxito
  "data": {"value": "3.2%", "trend": "up", "change": 0.4}
}
```

```json
{
  "type": "kpi_card",
  "title": "Errores 404",
  "theme": "error",  // 🔴 Rojo para problemas
  "data": {"value": "147", "trend": "down", "change": -12}
}
```
```

### 3. Estados Interactivos Mejorados
Los temas incluyen efectos hover y glow automáticos:

```json
{
  "type": "actions",
  "title": "Acciones Rápidas", 
  "theme": "info",  // 🔵 Botones con efecto azul en hover
  "data": {
    "actions": [
      { "id": "refresh", "label": "Actualizar Datos", "icon": "RefreshCw" },
      { "id": "export", "label": "Exportar PDF", "icon": "FileText" }
    ]
  }
}
```

---

## 🆕 Referencia Rápida de Temas v5

| Tema | Color Principal | Uso Recomendado | Efecto Visual |
|------|------------------|-----------------|---------------|
| `default` | Gris oscuro | Contenido neutro | Borde blanco sutil |
| `success` | Verde esmeralda | Éxito, crecimiento | Glow verde |
| `warning` | Ámbar | Advertencias, atención | Glow ámbar |
| `error` | Rosa rojo | Errores, problemas críticos | Glow rojo |
| `info` | Azul | Información, datos | Glow azul |
| `special` | Violeta | Funciones especiales | Glow violeta |
| `neutral` | Cyan | Contenido secundario | Glow cyan |
| `primary` | Azul primario | Acciones principales | Glow azul primario |
| `secondary` | Verde | Acciones secundarias | Glow verde |

---

## ⚠️ Errores Comunes v5

### 1. Temas Inconsistentes
❌ **Incorrecto:**
```json
{
  "type": "kpi_card",
  "title": "Error Crítico",
  "theme": "success",  // ← Tema verde para error
  "data": {"value": "500 errores"}
}
```

✅ **Correcto:**
```json
{
  "type": "kpi_card", 
  "title": "Error Crítico",
  "theme": "error",  // ← Tema rojo para error
  "data": {"value": "500 errores"}
}
```

### 2. Sobrecarga Visual
❌ **Incorrecto:**
```markdown
```json
{"type": "kpi_card", "theme": "error", "data": {"value": "5"}}
```
```json
{"type": "kpi_card", "theme": "warning", "data": {"value": "10"}}  
```
```json
{"type": "kpi_card", "theme": "error", "data": {"value": "2"}}
```
```

✅ **Correcto:**
```markdown
```json
{"type": "kpi_card", "theme": "error", "title": "Errores Críticos", "data": {"value": "7"}}
```
```json
{"type": "kpi_card", "theme": "warning", "title": "Advertencias", "data": {"value": "10"}}
```
```

---

## 🚀 Ejemplos Completos v5

### Dashboard de Ventas Temático
```markdown
Aquí está tu dashboard de ventas con análisis contextual:

```json
{
  "type": "kpi_card",
  "title": "📈 Ventas del Mes",
  "theme": "success",
  "data": {
    "value": "$87,450",
    "trend": "up", 
    "change": 12.3,
    "description": "vs mes anterior • Superando objetivos"
  }
}
```

```json
{
  "type": "chart",
  "title": "Desglose por Producto",
  "theme": "primary", 
  "data": {
    "chartType": "bar",
    "data": [
      {"name": "Laptops", "value": 45000},
      {"name": "Monitores", "value": 28000}, 
      {"name": "Accesorios", "value": 14500}
    ]
  }
}
```

```json
{
  "type": "actions",
  "title": "Próximos Pasos",
  "theme": "info",
  "data": {
    "actions": [
      {"id": "detailed_report", "label": "Ver Reporte Completo", "icon": "FileText"},
      {"id": "forecast", "label": "Proyección Q4", "icon": "TrendingUp"}
    ]
  }
}
```

Las ventas de laptops lideran con un crecimiento sostenido del 15%.
```

---

## 📋 Checklist v5 Antes de Enviar

- [ ] El JSON está bien formado (sin trailing commas)
- [ ] Cada bloque tiene `type` y `data`
- [ ] 🆕 El `theme` coincide con el tipo de información
- [ ] Los datos son realistas y tienen sentido
- [ ] Los formularios tienen `id` único
- [ ] Los valores numéricos usan formato apropiado
- [ ] 🆕 No hay sobrecarga de temas llamativos
- [ ] El texto explica qué muestra cada componente
- [ ] 🆕 Los estados visuales son coherentes con el mensaje

---

## 🔧 Referencia Rápida v5

| Tipo | Tema Recomendado | Campos Clave |
|------|------------------|--------------|
| `kpi_card` | Según tendencia | `value`, `trend`, `change` |
| `chart` | `primary` o `info` | `chartType`, `data[]` |
| `table` | `neutral` o `default` | `headers[]`, `rows[][]` |
| `form` | `info` o `primary` | `fields[]`, `id` |
| `actions` | Según criticidad | `actions[]` |
| `calendar` | `special` o `primary` | `events[]`, `view` |
| `image` | `default` | `url`, `alt` |
| `error/warning/info` | Automático | `message`, `details` |

---

## 🎨 Integración con CardPalette.ts

**Para desarrolladores:**

```tsx
import { cardThemes } from '@/lib/ui/CardPalette';

// Aplicar tema automáticamente
const themeClass = cardThemes[data.theme || 'default'];

// En el componente
<div className={themeClass}>
  {/* Contenido del bloque */}
</div>
```

**v5 garantiza coherencia visual perfecta** con la estética minimalista y alto contraste de la aplicación.

---

**¡Listo para v5!** 🚀

Con este protocolo y la nueva paleta de colores, puedes crear interfaces dinámicas visualmente coherentes que mejoran significativamente la experiencia del usuario manteniendo siempre el estilo minimalista y alto contraste de la aplicación.
