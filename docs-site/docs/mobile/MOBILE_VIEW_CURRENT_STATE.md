---
title: "Estado Actual de la Vista Móvil - Urpe AI Lab v4.1"
---

> **Fecha de Captura**: Enero 2026  
> **Empresa Demo**: URPE Integral Services  
> **Breakpoint Móvil**: `< 768px` (md)

---

## 📱 Arquitectura de Navegación Móvil

### Barra de Navegación Inferior (`MobileNavBar.tsx`)

**Componente**: `components/mobile/MobileNavBar.tsx`

| Posición | Ícono | Label | Destino | Estado Activo |
|----------|-------|-------|---------|---------------|
| 1 | `MessageSquare` | Chat | Cierra AdminPanel | Primary glow + dot |
| 2 | `LayoutDashboard` | Dashboard | `activeView: 'dashboard'` | Primary glow + dot |
| 3 | `Users` | Contactos | `activeView: 'contacts'` | Primary glow + dot |
| 4 | `Calendar` | Calendario | `activeView: 'calendar'` | Primary glow + dot |
| 5 | `Menu`/`X` | Más/Cerrar | Toggle AdminPanel | Neutro |

**Características Visuales**:
- **Altura**: `h-16` (64px) + `safe-area-inset-bottom`
- **Background**: `bg-[#0a0a0c]/95` + `backdrop-blur-xl`
- **Borde**: `border-t border-white/5`
- **Gradiente Superior**: Fade de 24px para integración suave

**Comportamiento**:
- Cerrar modal de detalle de contacto al cambiar de sección (`selectContact(null)`)
- Indicador de punto activo bajo el ícono seleccionado
- Escala al presionar (`active:scale-95`)

---

## 🖼️ Vistas Capturadas

### 1. Vista Chat (Home)

**Screenshot**: Imagen 1  
**Estado**: Admin Panel cerrado (Chat activo en navbar)

**Layout**:
```
┌─────────────────────────────┐
│ [+] Header        🔥 📜 ≡  │ ← h-10 (40px)
├─────────────────────────────┤
│                             │
│     YOU            16:37   │
│     ┌─────────────────┐    │
│     │ Busca porfa a   │    │
│     │ 524921049743    │    │
│     └─────────────────┘    │
│                             │
│ 🤖 MONICA [AI]    16:37    │
│     (Procesando...)         │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│ 📎 Haz una pregunta...  ➤  │ ← Input area
│ ⚠️ La IA puede cometer...  │
├─────────────────────────────┤
│ 💬 📊 👥 📅    ≡           │ ← MobileNavBar h-16
└─────────────────────────────┘
```

**Elementos Visibles**:
- **Header**: Botón [+] Nuevo Chat, indicador de racha 🔥, historial 📜, menú hamburguesa
- **Chat Area**: Mensajes con burbujas diferenciadas (usuario vs AI)
- **Input**: Campo con placeholder, botón de adjuntos, botón enviar
- **Disclaimer**: Texto de advertencia sobre errores de IA

**Observaciones**:
- ✅ Espacio completo para chat cuando admin panel cerrado
- ✅ Input accesible en zona inferior
- ⚠️ El mensaje de MONICA muestra solo "[AI]" badge, contenido en carga

---

### 2. Vista Dashboard

**Screenshot**: Imagen 2  
**Estado**: `activeView: 'dashboard'`, Admin Panel abierto

**Layout**:
```
┌─────────────────────────────┐
│ Dashboard  PANEL v2.2 🔔 ✕ │ ← Header
├─────────────────────────────┤
│ 🏢 URPE Integral Services ▼│
│ 👥 Todo el Equipo        ▼ │ ← Filtros
├─────────────────────────────┤
│ Dashboard de Métricas    🔄│
│ Rendimiento de agentes...  │
│ 📅 Últimos 7 días       ▼  │
├──────────────┬──────────────┤
│ Nuevos      │ Citas        │
│ Contactos ↗ │ Agendadas ↗  │
│ 140         │ 43           │
│ 🟢 +2700%   │ 🟢 +231%     │
├──────────────┼──────────────┤
│ Conv.       │ Mensajes     │
│ Cont/Cita ↗ │ Totales   ↗  │
│ 31%         │ 10118        │
│ 🔴 -88%     │ 🔴 -3%       │
├──────────────┴──────────────┤
│ Tendencia: Contactos vs... │
│     📈 (Gráfico de línea)  │
│                             │
├─────────────────────────────┤
│ 💬 📊 👥 📅    ✕           │
└─────────────────────────────┘
```

**Componentes**:
- **Header Empresa**: Selector de empresa + filtro de equipo
- **KPI Cards**: Grid 2x2 con métricas principales
  - Nuevos Contactos: 140 (+2700% ↗ verde)
  - Citas Agendadas: 43 (+231% ↗ verde)
  - Conv. Contacto/Cita: 31% (-88% ↘ rojo)
  - Mensajes Totales: 10118 (-3% ↘ rojo)
- **Selector de Período**: "Últimos 7 días" (dropdown)
- **Gráfico de Tendencia**: Line chart Contactos vs Citas

**Observaciones**:
- ✅ Cards de KPI adaptadas a 2 columnas
- ✅ Scroll vertical funcional
- ✅ Padding inferior para navbar (`pb-20`)
- ✅ Indicadores de trend con colores semánticos

---

### 3. Vista Contactos (Lista)

**Screenshot**: Imagen 3  
**Estado**: `activeView: 'contacts'`, Admin Panel abierto

**Layout**:
```
┌─────────────────────────────┐
│ Contactos  PANEL v2.2 🔔 ✕ │
├─────────────────────────────┤
│ 🏢 URPE Integral Services ▼│
│ 👥 Todo el Equipo        ▼ │
├─────────────────────────────┤
│ 🔍 Buscar contactos...     │
│ [≡][⊞] [↕] [🎚] [🔄]      │ ← Controles
├─────────────────────────────┤
│ Carlos Martinez            │
│ 📞 133652... 📧 cqmm79@... │
│                [prospecto][sí]│
├─────────────────────────────┤
│ Javier Delgado             │
│ 📞 190840... 📧 jdelgado...│
│                [prospecto][sí]│
├─────────────────────────────┤
│ Jorge Manjarrez Castañeda  │
│ 📞 195658... 📧 manjacas...│
│                [prospecto][sí]│
├─────────────────────────────┤
│ ... (más contactos)        │
├─────────────────────────────┤
│ 14400 contactos   ◀ 1/576 ▶│ ← Paginación
├─────────────────────────────┤
│ 💬 📊 👥 📅    ✕           │
└─────────────────────────────┘
```

**Componentes**:
- **Barra de Búsqueda**: Input con placeholder
- **Controles**: Toggle vista (lista/grid), ordenar, filtrar, refresh
- **Lista de Contactos**: Cards compactas con:
  - Nombre completo
  - Teléfono (📞) + Email (📧) truncados
  - Badge estado (ej: "prospecto")
  - Badge calificación (ej: "sí")
- **Paginación**: Total + navegación páginas

**Observaciones**:
- ✅ Ancho completo (`w-full`) 
- ✅ Cards touch-friendly con información esencial
- ✅ Paginación visible y funcional
- ✅ 14,400 contactos cargados correctamente

---

### 4. Vista Detalle de Contacto (Modal)

**Screenshot**: Imagen 4  
**Estado**: Modal full-screen sobre Contactos

**Layout**:
```
┌─────────────────────────────┐
│ Detalle de Contacto  ✨ ✕  │ ← Monica AI accesible
├─────────────────────────────┤
│ 👤 💬 📅 📋 ✓ 📷 ⚙️       │ ← Tabs de sección
├─────────────────────────────┤
│ Detalle de Conversación    │
│ ID: 36446                  │
├─────────────────────────────┤
│           [ Hoy ]          │
│                             │
│ 👤 Cliente                 │
│ ┌─────────────────────┐    │
│ │ Sí, quiero saber si │    │
│ │ soy elegible para   │    │
│ │ la visa EB2-NIW     │    │
│ └─────────────────────┘    │
│                      17:40 │
│                             │
│                   Agente 🤖│
│     ┌─────────────────────┐│
│     │ Hola, soy Monica de ││
│     │ URPE Integral...    ││
│     │                     ││
│     │ Para generarte el   ││
│     │ reporte de elegib...││
│     └─────────────────────┘│
│                 17:41 ✓    │
│                             │
│ 👤 Cliente                 │
│ ┌─────────────────────┐    │
│ │ Ecuador             │    │
│ │ Hola Monica         │    │
│ └─────────────────────┘    │
│                      17:41 │
├─────────────────────────────┤
│ 💬 📊 👥 📅    ✕           │
└─────────────────────────────┘
```

**Componentes**:
- **Header**: Título + acceso a Monica AI (✨) + cerrar (✕)
- **Tabs de Navegación**: 
  - 👤 Perfil
  - 💬 Conversación (activa)
  - 📅 Citas
  - 📋 Notas
  - ✓ Tareas
  - 📷 Multimedia
  - ⚙️ Config
- **Área de Conversación**:
  - Mensajes del cliente (izquierda, fondo oscuro)
  - Mensajes del agente (derecha, fondo cyan)
  - Timestamps + indicadores de envío

**Observaciones**:
- ✅ Modal full-screen (`inset-0`)
- ✅ Tabs scrollables horizontalmente
- ✅ Conversación clara con diferenciación visual
- ✅ Acceso directo a Monica AI desde el detalle
- ⚠️ Verificar que se cierra correctamente al navegar

---

### 5. Vista Calendario

**Screenshot**: Imagen 5  
**Estado**: `activeView: 'calendar'`, Admin Panel abierto

**Layout**:
```
┌─────────────────────────────┐
│ Calendario PANEL v2.2 🔔 ✕ │
├─────────────────────────────┤
│ 🏢 URPE Integral Services ▼│
│ 👥 Todo el Equipo        ▼ │
├─────────────────────────────┤
│ ◀ Hoy ▶ 5 - 11 Ene 2026   │
│ 👥 Todos  [Día][Sem]   🔄  │ ← Controles
├─────────────────────────────┤
│ LUN  MAR  MIÉ  JUE  VIE... │
│  5    6    7    8    9 ... │
├─────────────────────────────┤
│11:30│09:00│11:00│16:00│    │
│Sal..│Ce...│Gu...│Jor..│    │
│ 📅  │ 📅  │ 📅  │ 📅  │    │
├─────│─────│─────│─────│────┤
│12:00│09:30│22:00│     │    │
│Jo...│Ca...│M....│     │    │
│ 📅  │ 📅  │ 📅  │     │    │
├─────│─────│─────│─────│────┤
│13:00│10:30│     │     │    │
│Jes..│Os...│     │     │    │
│... (más citas)              │
├─────────────────────────────┤
│ 💬 📊 👥 📅    ✕           │
└─────────────────────────────┘
```

**Componentes**:
- **Navegación de Fecha**: Botones ◀ Hoy ▶ + rango de fechas
- **Controles**: Filtro de equipo, toggle Día/Sem, refresh
- **Cabecera de Días**: Lun-Dom con números
- **Grid de Citas**: 
  - Celdas con hora + nombre truncado
  - Colores diferenciados (amarillo, cyan)
  - Icono de calendario en cada cita

**Observaciones**:
- ✅ Vista semanal compacta para móvil
- ✅ Scroll horizontal para días de la semana
- ✅ Información esencial visible (hora + nombre)
- ✅ Colores para diferenciar tipos/asesores
- ⚠️ Nombres muy truncados - considerar tooltip o tap para expandir

---

## 🎨 Sistema de Diseño Móvil

### Colores Principales
| Uso | Color | Ejemplo |
|-----|-------|---------|
| Background | `#020204`, `#0a0a0c`, `#0c0c0e` | Fondos de paneles |
| Primary | `primary-400/500` | Elementos activos, CTAs |
| Success | Verde (`emerald`) | Trends positivos |
| Error | Rojo (`rose`) | Trends negativos |
| Neutral | `zinc-400/500` | Texto secundario |

### Tipografía Móvil
| Elemento | Clase | Tamaño |
|----------|-------|--------|
| Labels navbar | `text-[10px]` | 10px |
| Body text | `text-xs` | 12px |
| Subtítulos | `text-sm` | 14px |
| Títulos | `text-base` | 16px |
| KPI Values | `text-3xl`+ | 30px+ |

### Espaciado
| Contexto | Valor |
|----------|-------|
| Padding general | `p-3` (12px) |
| Padding navbar | `pb-20` (80px) |
| Gap entre elementos | `gap-2` (8px) |
| Safe area bottom | `env(safe-area-inset-bottom)` |

---

## ✅ Features Implementadas

1. **Navegación Inferior Nativa**: 5 tabs con indicadores activos
2. **Drawer Full-Screen**: Admin Panel cubre 100% del viewport
3. **KPI Dashboard**: Grid responsivo 2x2
4. **Lista de Contactos**: Cards compactas con paginación
5. **Detalle de Contacto**: Modal full-screen con tabs
6. **Calendario Semanal**: Vista compacta con scroll
7. **Filtros Globales**: Empresa + Equipo persistentes
8. **Chat Integrado**: Área completa cuando admin cerrado

---

## 🔄 Interacciones Documentadas

### Flujo de Navegación
```
MobileNavBar tap
    │
    ├─► 'chat' ──► closeAdminPanel() ──► Chat visible
    │
    └─► 'dashboard'|'contacts'|'calendar'
            │
            ├─► selectContact(null) // Limpia detalle
            └─► setActiveView(view) // Cambia vista
```

### Ciclo de Vida del Modal de Detalle
```
ContactCard tap
    │
    └─► selectContact(contactId)
            │
            └─► ContactDetailModal opens (full-screen)
                    │
                    ├─► Tabs navigation (interno)
                    │
                    └─► MobileNavBar tap
                            │
                            └─► selectContact(null) // Cierra modal
```

---

## 📋 Checklist de Cumplimiento UX

| Criterio | Estado | Notas |
|----------|--------|-------|
| Touch targets ≥ 44px | ✅ | Navbar items, botones |
| Font-size inputs ≥ 16px | ✅ | Evita zoom iOS |
| Padding bottom navbar | ✅ | `pb-20` consistente |
| Full-screen modales | ✅ | `inset-0` en móvil |
| Safe area respect | ✅ | `env(safe-area-*)` |
| Scroll suave | ✅ | `-webkit-overflow-scrolling` |
| Estado limpio al navegar | ✅ | `selectContact(null)` |
| Feedback táctil | ✅ | `active:scale-95` |

---

## 🚀 Próximas Mejoras Sugeridas

1. **Gestos**: Swipe-to-close en modales
2. **Skeleton Loading**: Estados de carga más elegantes
3. **Pull-to-Refresh**: En listas de contactos
4. **Haptic Feedback**: Vibración en acciones importantes
5. **Offline Mode**: Cache de datos frecuentes
6. **PWA Manifest**: Instalación como app nativa

---

*Documento generado para referencia del equipo de desarrollo*
