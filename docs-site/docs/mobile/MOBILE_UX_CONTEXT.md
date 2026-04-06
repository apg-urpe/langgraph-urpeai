---
title: "Contexto de Experiencia Móvil Nativa (Urpe AI Lab)"
---

## 🎯 Visión
Transformar "Chat Urpe AI LAB" en una experiencia **Mobile-First** que se sienta indistinguible de una aplicación nativa en dispositivos iOS y Android, manteniendo la potencia del dashboard de escritorio pero adaptando la ergonomía y los patrones de navegación.

## 📱 Principios de Diseño "Native-Feel"

### 1. Ergonomía del Pulgar (Thumb Zone)
- **Navegación**: Mover la navegación principal (`AdminNavBar`) de la izquierda a una **Barra de Pestañas Inferior (Bottom Tab Bar)** en móviles.
- **Acciones**: Los botones de acción principales (Enviar mensaje, Nuevas acciones) deben estar en la zona inferior de fácil alcance.
- **Inputs**: El área de chat (`InputArea`) debe manejar el teclado virtual sin ocultar contenido ni causar saltos de layout (layout shifts).

### 2. Arquitectura de Información Adaptativa
La estructura actual de 4 columnas (Nav | Admin | Chat | Artifact) es inviable en móvil.
- **Desktop**: Layout Horizontal (Split View).
- **Mobile**: Layout Apilado (Stacked Views) con navegación modal.
  - **Admin Panel**: Convertir de columna redimensionable a **Drawer/Off-canvas** o vistas completas de navegación.
  - **Artifact Panel**: Convertir de columna dividida a **Full-screen Modal** o **Bottom Sheet** deslizable.

### 3. Interacciones y Gestos
- **Feedback Táctil**: Estados `active` inmediatos para botones.
- **Transiciones**: Animaciones fluidas (GPU accelerated) para cambios de vista (Slide over, Fade in) en lugar de recargas bruscas.
- **Scroll**: Scroll suave con inercia nativa (`-webkit-overflow-scrolling: touch`) y prevención de "overscroll" en el `body`.

### 4. Inmersión (PWA Ready)
- **Viewport**: Ajuste de `viewport-fit=cover` para aprovechar el espacio alrededor del "notch" y la barra de inicio.
- **Safe Areas**: Respetar `env(safe-area-inset-bottom)` y `top` para evitar superposiciones con elementos del sistema.
- **StatusBar**: Integración visual con la barra de estado del dispositivo.

## 🔍 Análisis de Brechas (Current State vs Target)

### Layout (`App.tsx`)
- **Estado Actual**: `flex-row` fijo. `AdminNavBar` vertical. `AdminPanel` redimensionable (width en px).
- **Problema**: En móvil, el ancho fijo y el flex row rompen el layout o fuerzan un scroll horizontal.
- **Solución**: Media queries para cambiar a `flex-col` o ocultar paneles secundarios por defecto.

### Navegación (`AdminNavBar.tsx`)
- **Estado Actual**: Sidebar vertical de 48px/56px.
- **Problema**: Ocupa espacio horizontal valioso y es difícil de alcanzar en pantallas altas.
- **Solución**: Componente `MobileTabBar` visible solo en `< md`.

### Paneles (`AdminPanel` y `ArtifactPanel`)
- **Estado Actual**: Renderizado condicional en el flujo del documento.
- **Problema**: Comprime el `ChatArea` a 0 o muy poco ancho en pantallas pequeñas.
- **Solución**: 
  - `AdminPanel`: Drawer deslizable (z-index alto) sobre el contenido.
  - `ArtifactPanel`: Overlay de pantalla completa con botón de cierre ("X") accesible.

### Área de Chat (`ChatArea.tsx`)
- **Estado Actual**: Scroll container.
- **Problema**: El teclado virtual en iOS puede empujar el viewport de formas inesperadas.
- **Solución**: Usar `dvh` (Dynamic Viewport Height) y gestionar el focus del input para evitar zoom automático (font-size >= 16px ya aplicado, pero verificar padding).

## 🛠️ Stack Técnico para la Transformación
- **Tailwind CSS**: Prefijos `md:`, `lg:` para breakpoints.
- **Framer Motion** (o CSS Transitions): Para transiciones de entrada/salida de paneles móviles.
- **Lucide React**: Iconos adaptados a tamaños táctiles (min 24px, target 44px).

---

## ✅ Patrones Implementados (v3.0 - Dic 2025)

### 🎯 Arquitectura Móvil Completada

#### 1. Full-Screen Layout
- **Drawer Admin Panel**: `inset-0` (100% viewport) en móvil vs `w-[85vw] max-w-[360px]` antes
- **Contactos**: Ancho completo (`w-full`) en móvil, sin restricciones de ancho fijo
- **Modales**: Pantalla completa con `pb-20` para MobileNavBar

#### 2. Reglas de Tamaños Documentadas (`globals.css`)

```css
/* ===== MOBILE SIZE RULES ===== */
BREAKPOINTS:
  - Mobile:  < 768px  (md breakpoint)
  - Tablet:  768-1024px
  - Desktop: > 1024px (lg breakpoint)

REGLA #1: PANTALLA COMPLETA EN MÓVIL
  - Paneles/Modales: inset-0 (100% viewport)
  - Contenedores: w-full (no anchos fijos)
  - Evitar: max-w-[Xpx] en móvil

REGLA #2: PADDING RESPONSIVO
  - Móvil: p-3 (12px)
  - Desktop: p-4 a p-6 (16-24px)
  - Bottom extra: pb-20 (80px) para MobileNavBar

REGLA #3: TEXTO RESPONSIVO
  - Títulos: text-sm md:text-base lg:text-lg
  - Body: text-xs md:text-sm
  - Labels: text-[10px] md:text-xs

REGLA #4: GAPS Y ESPACIADO
  - Móvil: gap-2 (8px)
  - Desktop: gap-3 a gap-4 (12-16px)

REGLA #5: COMPONENTES INTERACTIVOS
  - Min height: min-h-[44px] para touch targets
  - Font-size inputs: 16px (evita zoom iOS)
```

#### 3. Nuevas Clases Utility

| Clase | Uso | Ejemplo |
|-------|-----|---------|
| `.mobile-screen` | Pantalla completa | `fixed inset-0` |
| `.mobile-container` | Con padding navbar | `w-full h-full pb-20 md:pb-0` |
| `.mobile-scroll-y` | Scroll vertical con padding | `overflow-y-auto pb-20 md:pb-0` |
| `.mobile-stack` | Stack móvil, row desktop | `flex-col md:flex-row` |
| `.mobile-full` | Ancho completo móvil | `w-full md:w-auto` |
| `.mobile-text-sm` | Texto responsivo | `text-xs md:text-sm` |
| `.mobile-touch` | Touch-friendly | `min-h-[44px] min-w-[44px]` |

#### 4. Componentes Actualizados

| Componente | Cambio Móvil | Estado |
|------------|--------------|--------|
| **App.tsx** | Drawer móvil: `inset-0` | ✅ |
| **ContactsView.tsx** | Ancho completo: `w-full` | ✅ |
| **ContactDetailModal.tsx** | Ya era full-screen | ✅ |
| **MobileNavBar.tsx** | Cierra detalle al navegar | ✅ |
| **AdminPanel** | Bottom padding `pb-20` | ✅ |
| **CalendarView** | Bottom padding `pb-20` | ✅ |
| **MarketingView** | Bottom padding `pb-20` | ✅ |
| **FunnelView** | Bottom padding `pb-20` | ✅ |
| **MessagesView** | Bottom padding `pb-20` | ✅ |

#### 5. Estado Global - Gestión de Detalles

**Problema resuelto:** El modal de detalle del contacto quedaba abierto al cambiar de sección.

**Solución implementada:**
```typescript
// MobileNavBar.tsx
const handleNavClick = (id: AdminView | 'chat') => {
  // Cerrar detalle de contacto al cambiar de sección
  selectContact(null);
  
  if (id === 'chat') {
    closeAdminPanel();
  } else {
    setActiveView(id as AdminView);
  }
};
```

#### 6. Reglas de Oro para Móvil (Actualizadas)

1. **Pantalla completa**: Usar `inset-0` para paneles/modales móviles
2. **Sin anchos fijos**: Evitar `w-[Xpx]` sin breakpoint en móvil
3. **Padding consistente**: `p-3` móvil, `p-4/p-6` desktop + `pb-20` para navbar
4. **Touch targets**: `min-h-[44px]` para elementos interactivos
5. **Scroll con padding**: `pb-20 md:pb-0` para contenido scrollable
6. **Estado limpio**: Cerrar modales/detalles al cambiar sección
7. **Texto responsivo**: `text-xs md:text-sm` para body, `text-[10px] md:text-xs` para labels

#### 7. Próximos Pasos (Opcional)

- **Gestos**: Swipe para cerrar modales (touch events)
- **Animaciones**: Transiciones suaves entre vistas (Framer Motion)
- **PWA**: Manifest y service worker para instalación nativa
- **Safe Areas**: Mejor integración con notches y barras del sistema
