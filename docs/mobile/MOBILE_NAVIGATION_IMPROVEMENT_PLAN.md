# Navegación Móvil - Urpe AI Lab v4.2

> **Versión**: 2.0 (Implementado)  
> **Fecha**: Enero 2026  
> **Principio Rector**: *"Ultra minimalismo - solo lo esencial en la barra inferior"*

---

## ✅ Estado: IMPLEMENTADO

## 🎯 Arquitectura Final

La navegación móvil se divide en dos zonas:

### 1. Barra Inferior (4 tabs esenciales)
```
┌─────────────────────────────────────────┐
│  💬      👥       ✓       📅           │
│ Chat  Contactos  Tareas   Citas        │
└─────────────────────────────────────────┘
```

### 2. Menú Hamburguesa (Header - todo lo demás)
```
┌─────────────────────────────┐
│ 👤 Usuario                  │
│    user@email.com           │
├─────────────────────────────┤
│ 🎭 Role Selector            │
├─────────────────────────────┤
│ 📊 Dashboard                │
│ 👥 Equipo                   │
│ ⚙️ Configuración            │
├─────────────────────────────┤
│ 🧪 Lab (roles 1-2)          │
│   📧 Email Marketing        │
│   ✨ Deep Research          │
│   📚 Artefactos             │
│   📊 Observabilidad (rol 1) │
├─────────────────────────────┤
│ 👤 Mi Perfil                │
│ 🤖 Gestionar Agentes        │
│ ✨ Novedades                │
├─────────────────────────────┤
│ 🚪 Cerrar Sesión            │
└─────────────────────────────┘
```

---

## 📊 Análisis Comparativo

### Vistas Desktop (AdminNavBar.tsx)

| Categoría | Vista | Disponible en Móvil | Prioridad |
|-----------|-------|---------------------|-----------|
| **Core** | Dashboard | ✅ Sí | - |
| **Core** | Contactos | ✅ Sí | - |
| **Core** | Calendario | ✅ Sí | - |
| **Core** | Tareas | ❌ No | 🔴 Alta |
| **Core** | Equipo | ❌ No | 🟡 Media |
| **User** | Mi Perfil | ❌ No | 🟡 Media |
| **User** | Configuración | ❌ No | 🟢 Baja |
| **Lab** | Email Marketing | ❌ No | 🟡 Media |
| **Lab** | Mi Email IA | ❌ No | 🟢 Baja |
| **Lab** | Deep Research | ❌ No | 🟢 Baja |
| **Lab** | Artefactos | ❌ No | 🟢 Baja |
| **Lab** | Observabilidad | ❌ No | 🟢 Baja |

### Distribución Actual (MobileNavBar)

```
┌─────────────────────────────────────────┐
│  💬    📊    👥    📅    ≡             │
│ Chat  Dash  Cont  Cal   Más            │
└─────────────────────────────────────────┘
       4 tabs fijos + 1 toggle
```

**Problema**: 9+ vistas → 4 slots visibles = 55% de funcionalidad oculta

---

## 🏗️ Propuesta de Arquitectura

### Opción A: Bottom Tab + Menú "Más" Mejorado ⭐ RECOMENDADA

Mantener 4 tabs principales + menú "Más" como **hub de navegación secundaria**.

```
┌─────────────────────────────────────────┐
│  💬    📊    👥    ✓     ≡             │
│ Chat  Dash  Cont  Tasks  Más           │
└─────────────────────────────────────────┘
```

**Cambio clave**: Reemplazar `Calendario` por `Tareas` en la barra principal.

**Razón**: 
- Tareas tiene uso diario más frecuente
- Calendario accesible desde menú "Más" (uso más esporádico)

### Menú "Más" Rediseñado (Bottom Sheet)

```
┌─────────────────────────────────────────┐
│ ─────────────────────────────────────── │ ← Handle de arrastre
│                                         │
│  📅 Calendario        👥 Equipo         │
│  📧 Marketing         ⚙️ Config         │
│                                         │
│ ─────────── Lab ────────────            │
│  🧪 Mi Email IA    ✨ Research             │
│  📚 Artefactos  📊 Observ.              │
│                                         │
│ ─────────── Perfil ─────────            │
│  👤 Mi Perfil   🔥 Racha: 5             │
│  🚪 Cerrar Sesión                       │
└─────────────────────────────────────────┘
```

### Opción B: Navegación Contextual (Alternativa)

Tabs dinámicos basados en el contexto del usuario.

```
Rol 1-2 (Admin):  💬  📊  👥  ✓  📧
Rol 3 (Asesor):   💬  📊  👥  ✓  📅
```

**Pros**: Personalizado por rol  
**Cons**: Inconsistencia, mayor complejidad

### Opción C: Floating Action Button (FAB)

Botón flotante para acciones rápidas + navegación.

```
                              ┌───┐
                              │ + │ ← FAB
                              └───┘
┌─────────────────────────────────────────┐
│  💬    📊    👥    📅                   │
└─────────────────────────────────────────┘
```

**Pros**: Más espacio en navbar  
**Cons**: Oculta contenido, patrón menos familiar

---

## ✨ Diseño del Menú "Más" (Bottom Sheet)

### Principios de Diseño

1. **Agrupación Lógica**: Secciones claras (Core, Lab, Perfil)
2. **Iconografía Consistente**: Mismos iconos que desktop
3. **Jerarquía Visual**: Items principales más prominentes
4. **Acceso Rápido**: Atajos a acciones frecuentes
5. **Gestos Nativos**: Swipe down para cerrar

### Wireframe Detallado

```
┌─────────────────────────────────────────────────┐
│                    ▬▬▬                          │ ← Pill indicator
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 📅 Calendario                     →     │   │ ← Item row
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ 👥 Equipo                         →     │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ 📧 Email Marketing                →     │   │ (Solo rol 1-2)
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ ⚙️ Configuración                  →     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ──────────── 🧪 Laboratorio ───────────────   │ ← Section header
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐   │
│  │ 📧               │  │ ✨               │   │
│  │ Mi Email IA         │  │ Research         │   │ ← Grid 2x2
│  └──────────────────┘  └──────────────────┘   │
│  ┌──────────────────┐  ┌──────────────────┐   │
│  │ 📚               │  │ 📊               │   │
│  │ Artefactos       │  │ Observabilidad   │   │
│  └──────────────────┘  └──────────────────┘   │
│                                                 │
│  ──────────────────────────────────────────    │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 👤 Tony P.                 🔥 5 días   │   │ ← Profile row
│  │    Ver perfil completo              →   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🚪 Cerrar Sesión                        │   │ ← Logout (danger)
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │ ← Home indicator
└─────────────────────────────────────────────────┘
```

### Estados del Bottom Sheet

| Estado | Altura | Trigger |
|--------|--------|---------|
| **Cerrado** | 0% | Tap fuera, swipe down, selección |
| **Peek** | 40% | Tap en "Más" |
| **Expandido** | 85% | Swipe up desde peek |

### Animaciones

- **Apertura**: `ease-out 200ms` con spring
- **Cierre**: `ease-in 150ms`
- **Backdrop**: Fade `0 → 0.5` opacity
- **Contenido**: Stagger de 30ms entre items

---

## 🎨 Especificaciones de UI

### Bottom Sheet Container

```css
.bottom-sheet {
  background: rgba(10, 10, 12, 0.98);
  backdrop-filter: blur(20px);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: env(safe-area-inset-bottom);
}
```

### Item Rows

```css
.menu-item {
  height: 52px;
  padding: 0 16px;
  border-radius: 12px;
  background: transparent;
  transition: background 150ms;
}

.menu-item:active {
  background: rgba(255, 255, 255, 0.05);
  transform: scale(0.98);
}
```

### Section Headers

```css
.section-header {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  padding: 16px 16px 8px;
}
```

### Lab Grid Items

```css
.lab-item {
  flex: 1;
  min-width: 45%;
  height: 72px;
  border-radius: 12px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
}
```

---

## 📱 Componentes a Crear/Modificar

### Nuevos Componentes

| Componente | Descripción | Prioridad |
|------------|-------------|-----------|
| `MobileBottomSheet.tsx` | Contenedor reutilizable de bottom sheet | 🔴 Alta |
| `MobileMoreMenu.tsx` | Menú "Más" con todas las secciones | 🔴 Alta |
| `MobileMenuItem.tsx` | Item de menú con icono, label, badge | 🟡 Media |
| `MobileLabGrid.tsx` | Grid 2x2 para items del Lab | 🟢 Baja |

### Componentes a Modificar

| Componente | Cambios | Prioridad |
|------------|---------|-----------|
| `MobileNavBar.tsx` | Reemplazar Calendario→Tareas, integrar BottomSheet | 🔴 Alta |
| `adminStore.ts` | Estado `isMobileMenuOpen` | 🔴 Alta |
| `page.tsx` | Renderizar MobileBottomSheet | 🟡 Media |

---

## 🔧 Implementación Técnica

### 1. Estado Global (adminStore.ts)

```typescript
interface AdminState {
  // ... existing
  
  // Mobile menu state
  isMobileMenuOpen: boolean;
  mobileMenuHeight: 'closed' | 'peek' | 'expanded';
  
  // Actions
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
  setMobileMenuHeight: (height: 'closed' | 'peek' | 'expanded') => void;
}
```

### 2. Bottom Sheet Base (MobileBottomSheet.tsx)

```typescript
interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  height?: 'peek' | 'expanded' | 'full';
  children: React.ReactNode;
}

// Features:
// - Gesture handling (swipe up/down)
// - Backdrop with tap-to-close
// - Safe area padding
// - Keyboard avoidance
// - Focus trap for accessibility
```

### 3. Nav Items Reorganizados (MobileNavBar.tsx)

```typescript
const navItems: NavItem[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'contacts', icon: Users, label: 'Contactos' },
  { id: 'tasks', icon: CheckSquare, label: 'Tareas' }, // ← NUEVO
  // Calendario movido al menú "Más"
];
```

### 4. Menú "Más" Estructurado (MobileMoreMenu.tsx)

```typescript
interface MenuSection {
  id: string;
  title?: string;
  items: MenuItem[];
  layout: 'list' | 'grid';
}

const menuSections: MenuSection[] = [
  {
    id: 'core',
    items: [
      { id: 'calendar', icon: Calendar, label: 'Calendario' },
      { id: 'team', icon: UsersRound, label: 'Equipo' },
      { id: 'email-marketing', icon: Mail, label: 'Marketing', roles: [1, 2] },
      { id: 'settings', icon: Settings, label: 'Configuración' },
    ],
    layout: 'list'
  },
  {
    id: 'lab',
    title: 'Laboratorio',
    items: [
      { id: 'emails', icon: Mail, label: 'Mi Email IA' },
      { id: 'research', icon: Sparkles, label: 'Research' },
      { id: 'artifacts', icon: BookMarked, label: 'Artefactos' },
      { id: 'observability', icon: Activity, label: 'Observ.', roles: [1] },
    ],
    layout: 'grid'
  },
  {
    id: 'profile',
    items: [
      { id: 'profile', icon: User, label: 'Mi Perfil', showStreak: true },
      { id: 'logout', icon: LogOut, label: 'Cerrar Sesión', variant: 'danger' },
    ],
    layout: 'list'
  }
];
```

---

## 📐 Métricas de Éxito

| Métrica | Actual | Objetivo | Método de Medición |
|---------|--------|----------|-------------------|
| Vistas accesibles en 1 tap | 4/13 (31%) | 5/13 (38%) | Auditoría de código |
| Vistas accesibles en 2 taps | 4/13 (31%) | 13/13 (100%) | Auditoría de código |
| Tiempo promedio a Tareas | N/A (no existe) | < 1s | Cronómetro |
| Satisfacción UX (thumb zone) | - | 90%+ acciones en zona inferior | Heatmap |

---

## 🚀 Fases de Implementación

### Fase 1: Infraestructura (2-3 horas)
- [ ] Crear `MobileBottomSheet.tsx` base
- [ ] Añadir estado en `adminStore.ts`
- [ ] Estilos base en `globals.css`

### Fase 2: Menú "Más" (3-4 horas)
- [ ] Crear `MobileMoreMenu.tsx`
- [ ] Implementar secciones y items
- [ ] Filtrado por rol
- [ ] Integrar en `page.tsx`

### Fase 3: Navegación Principal (1-2 horas)
- [ ] Actualizar `MobileNavBar.tsx` (Tareas en lugar de Calendario)
- [ ] Conectar botón "Más" con BottomSheet
- [ ] Animaciones de transición

### Fase 4: Polish (2-3 horas)
- [ ] Gestos de swipe
- [ ] Animaciones staggered
- [ ] Haptic feedback (vibración)
- [ ] Testing en dispositivos reales

---

## 🧪 Casos de Prueba

### Navegación
- [ ] Tap en "Más" abre bottom sheet en modo peek
- [ ] Swipe up expande a 85%
- [ ] Swipe down cierra completamente
- [ ] Tap en backdrop cierra
- [ ] Seleccionar item navega y cierra

### Roles
- [ ] Rol 3 no ve Marketing ni Lab
- [ ] Rol 2 no ve Observabilidad
- [ ] Rol 1 ve todo

### Transiciones
- [ ] Navegación entre vistas limpia (sin flash)
- [ ] Estado de detalle de contacto se cierra al navegar
- [ ] Bottom sheet no interfiere con keyboard

### Edge Cases
- [ ] Orientación landscape
- [ ] Teclado visible
- [ ] Safe areas (notch, home indicator)
- [ ] Scroll largo en sección Lab

---

## 📎 Referencias de Diseño

### Patrones Inspiracionales
- **iOS Shortcuts**: Bottom sheet con secciones colapsables
- **Google Maps**: FAB + bottom sheet contextual
- **Spotify**: Tab bar + modal para "Library"
- **Linear**: Menú minimalista con atajos de teclado

### Bibliotecas Útiles
- `react-spring`: Animaciones de física
- `@radix-ui/react-dialog`: Base accesible para sheets
- `framer-motion`: Gestos y variantes

---

## ✅ Checklist Pre-Implementación

- [ ] Revisar documento con el equipo
- [ ] Validar prioridad de Tareas vs Calendario
- [ ] Confirmar acceso a Lab por roles
- [ ] Definir si Bottom Sheet es modal o inline
- [ ] Aprobar wireframes de diseño

---

*Documento vivo - Actualizar según avance la implementación*
