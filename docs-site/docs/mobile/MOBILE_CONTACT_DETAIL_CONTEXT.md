---
title: "Contexto Móvil - \"Ver Información del Contacto\""
---

## 🎯 Visión del Componente

Transformar la vista de detalle de contacto en una experiencia **mobile-first** que optimice el espacio vertical y facilite la navegación táctil, manteniendo toda la funcionalidad del dashboard pero adaptada a la ergonomía móvil.

## 📱 Principios de Diseño Aplicados

### 1. Layout Full-Screen (Regla #1)
- **Pantalla completa**: `fixed inset-0` en móvil para maximizar espacio
- **Sin anchos fijos**: Evitar `w-[Xpx]` sin breakpoint, usar `w-full`
- **Contenedor con padding**: `mobile-container` con `pb-20` para MobileNavBar

### 2. Navegación por Pestañas Verticales
- **Stack navigation**: Pestañas organizadas verticalmente en lugar de horizontal
- **Touch targets**: `min-h-[44px]` para todos los elementos interactivos
- **Scroll con padding**: `mobile-scroll-y` con `pb-20 md:pb-0`

### 3. Información Jerárquica
- **Header compacto**: Avatar + nombre + estado calificado en la parte superior
- **Info grid**: 2 columnas en móvil, 3-4 en desktop
- **Collapsible sections**: Metadata y notas expandibles para ahorrar espacio

## 🏗️ Estructura del Componente

### Header del Contacto
```typescript
// Mobile-First Header
<div className="mobile-container">
  {/* Avatar + Nombre Principal */}
  <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
    <Avatar className="w-12 h-12 md:w-14 md:h-14">
      <AvatarFallback className="text-sm md:text-base">
        {contact.nombre?.[0]}
      </AvatarFallback>
    </Avatar>
    <div className="flex-1 min-w-0">
      <h3 className="text-sm md:text-base font-medium text-zinc-50 truncate">
        {contact.nombre} {contact.apellido}
      </h3>
      <div className="flex items-center gap-2 mt-1">
        {contact.es_calificado === 'si' && (
          <Badge className="text-[10px] md:text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            Calificado
          </Badge>
        )}
        <span className="text-xs md:text-sm text-zinc-400">
          {contact.estado}
        </span>
      </div>
    </div>
  </div>
</div>
```

### Grid de Información (2 Columnas Móvil)
```typescript
// Responsive Info Grid
<div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 md:gap-3 md:p-4">
  <InfoCard 
    label="Teléfono"
    value={contact.telefono}
    icon={Phone}
    className="mobile-touch"
  />
  <InfoCard 
    label="Email"
    value={contact.email}
    icon={Mail}
    className="mobile-touch"
  />
  <InfoCard 
    label="Origen"
    value={contact.origen}
    icon={Globe}
    className="mobile-touch"
  />
  <InfoCard 
    label="Creado"
    value={formatDate(contact.created_at)}
    icon={Calendar}
    className="mobile-touch"
  />
</div>
```

### Sistema de Pestañas Verticales
```typescript
// Mobile Tab Navigation
<div className="flex flex-col md:flex-row border-b border-zinc-800">
  {tabs.map((tab) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`
        mobile-touch text-left px-3 py-3 md:px-4 md:py-2
        text-xs md:text-sm font-medium
        border-b-2 md:border-b-0 md:border-r-2
        transition-colors duration-200
        ${
          activeTab === tab.id
            ? 'text-primary-400 border-primary-400 bg-primary-400/5'
            : 'text-zinc-400 border-transparent hover:text-zinc-300'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <tab.icon className="w-4 h-4 md:w-5 md:h-5" />
        <span>{tab.label}</span>
        {tab.count > 0 && (
          <span className="ml-auto text-[10px] md:text-xs bg-zinc-700 px-1.5 py-0.5 rounded">
            {tab.count}
          </span>
        )}
      </div>
    </button>
  ))}
</div>
```

## 📋 Pestañas Optimizadas para Móvil

### 1. Conversaciones (Primary)
- **Lista compacta**: Avatar + nombre + último mensaje
- **Touch targets**: `min-h-[44px]` para cada conversación
- **Infinite scroll**: Cargar más conversaciones al hacer scroll

### 2. Citas
- **Calendar compact**: Vista de mes reducida para móvil
- **Quick actions**: Botón flotante para nueva cita
- **Swipe actions**: Deslizar para confirmar/cancelar

### 3. Notas
- **Input expandible**: Textarea que crece al escribir
- **Quick add**: Botón flotante `+` para nota rápida
- **Timestamp compact**: Fecha relativa (hace 2h)

### 4. Multimedia
- **Grid responsivo**: 2 columnas móvil, 3-4 desktop
- **Preview cards**: Thumbnail + tipo + tamaño
- **Touch preview**: Tap para vista previa fullscreen

### 5. Tareas
- **Checklist compact**: Progress bar + items count
- **Quick toggle**: Checkbox grande para touch
- **Priority badges**: Colores visibles en móvil

## 🎨 Estilos Mobile-First

### Clases Utility Aplicadas
```css
/* Layout */
.mobile-screen      /* fixed inset-0 */
.mobile-container   /* w-full h-full pb-20 md:pb-0 */
.mobile-scroll-y    /* overflow-y-auto pb-20 md:pb-0 */

/* Texto */
.mobile-text-sm     /* text-xs md:text-sm */
.mobile-text-xs     /* text-[10px] md:text-xs */

/* Interacción */
.mobile-touch       /* min-h-[44px] min-w-[44px] */
.mobile-active      /* active:scale-95 transition-transform */
```

### Estados Visuales
```typescript
// Touch Feedback
const touchClasses = `
  mobile-touch
  active:scale-95
  transition-all duration-150
  hover:bg-zinc-800/50
  active:bg-zinc-700/50
`;

// Responsive Spacing
const spacingClasses = `
  p-3 md:p-4
  gap-2 md:gap-3
  text-xs md:text-sm
`;
```

## 🔍 Optimizaciones de Performance

### 1. Lazy Loading
- **Tabs content**: Cargar contenido solo cuando la pestaña está activa
- **Images**: Lazy loading con placeholder
- **Metadata**: Expandible con carga bajo demanda

### 2. Memoización
- **Contact data**: Memoizar datos básicos del contacto
- **Tab content**: Evitar re-renders al cambiar pestañas
- **List items**: Memoizar items de listas largas

### 3. Scroll Optimizado
- **Virtual scrolling**: Para listas largas (conversaciones, notas)
- **Smooth scroll**: `scroll-behavior: smooth`
- **Overscroll control**: Prevenir pull-to-refresh

## 📊 Estados y Loading

### Skeleton Loading Móvil
```typescript
// Mobile Skeleton Cards
<div className="animate-pulse">
  <div className="h-12 bg-zinc-800 rounded mb-2" />
  <div className="grid grid-cols-2 gap-2">
    <div className="h-16 bg-zinc-800 rounded" />
    <div className="h-16 bg-zinc-800 rounded" />
  </div>
</div>
```

### Empty States
- **Icono grande**: 48px centrado
- **Mensaje claro**: Texto `text-xs md:text-sm`
- **Action button**: CTA visible y touch-friendly

## 🚀 Integración con MobileNavBar

### Estado Global
```typescript
// Cerrar detalle al navegar
useEffect(() => {
  const handleNavChange = () => {
    selectContact(null); // Limpiar selección
  };
  
  // Escuchar cambios de navegación
  return () => cleanup();
}, []);
```

### Bottom Padding
- **Siempre `pb-20`**: Espacio para MobileNavBar
- **Safe areas**: Respetar `env(safe-area-inset-bottom)`
- **Scroll con padding**: Contenido scrollable con espacio inferior

## ✅ Reglas de Oro para Contact Detail

1. **Full-screen**: `inset-0` para el modal en móvil
2. **Touch-first**: `min-h-[44px]` para todos los elementos interactivos
3. **Vertical stack**: Información organizada verticalmente
4. **Responsive text**: `text-xs md:text-sm` para contenido
5. **Collapsible**: Secciones expandibles para ahorrar espacio
6. **Quick actions**: Botones flotantes para acciones comunes
7. **Clean state**: Cerrar modal al cambiar de sección

## 🎯 Métricas de UX

- **Time to first interaction**: < 200ms para touch feedback
- **Scroll performance**: 60fps en listas largas
- **Touch accuracy**: 44px minimum touch targets
- **Information density**: Optimizada para pantallas pequeñas
- **Navigation efficiency**: Máximo 2 taps para cualquier acción
