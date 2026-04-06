---
title: "Sistema de Notificaciones Móvil - Contexto Técnico y UX"
---

## 📱 Arquitectura del Sistema de Notificaciones en Móvil

### 🏗️ Estructura de Componentes

#### **1. NotificationButton** (`components/notifications/NotificationButton.tsx`)
**Propósito:** Botón minimalista con badge de contador de notificaciones no leídas.

**Características Móviles:**
- **Tamaño Touch-Optimized:** `w-10 h-10` (40px) cumple con la regla de 44px mínimo para elementos táctiles
- **Badge Animado:** `animate-pulse` cuando hay notificaciones no leídas
- **Tooltip Responsive:** Solo visible en hover (desktop), no interfiere en móvil
- **Feedback Visual:** `active:scale-95` para feedback táctil inmediato

**Estado Visual:**
```tsx
// Estados del botón
- Inactivo: text-zinc-500 hover:text-zinc-300
- Activo: bg-primary-500/20 text-primary-400 shadow-lg
- Con no leídas: Badge rojo + icono animado
```

#### **2. NotificationDropdown** (`components/notifications/NotificationDropdown.tsx`)
**Propósito:** Panel full-screen en móvil con lista de notificaciones, filtros y búsqueda.

**Comportamiento Móvil:**
- **Full Screen:** `fixed inset-0` ocupa 100% del viewport
- **Backdrop:** `bg-black/50 backdrop-blur-sm` con `z-[90]`
- **Panel Principal:** `z-[100]` sobre todos los elementos
- **Safe Area:** `pb-20` (80px) para espacio del MobileNavBar
- **Scroll Optimizado:** `overflow-y-auto` con scroll nativo

**Layout Móvil:**
```tsx
// Mobile Layout
<div className="fixed inset-0 z-[100]">
  {/* Backdrop táctil para cerrar */}
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90]" />
  
  {/* Panel full-screen */}
  <div className="w-full h-full flex flex-col pb-20">
    {/* Header con título y acciones */}
    {/* Buscador responsive */}
    {/* Filtros */}
    {/* Lista scrollable */}
  </div>
</div>
```

#### **3. MobileNavBar** (`components/mobile/MobileNavBar.tsx`)
**Importante:** **NO contiene botón de notificaciones** para evitar duplicación.

**Razón de Diseño:**
- El botón de notificaciones vive **únicamente en el header del AdminPanel**
- En móvil, el AdminPanel es un drawer full-screen
- Al abrir AdminPanel, el usuario accede a las notificaciones desde el header
- Evita confusión y duplicación de UI

## 🔄 Flujo de Usuario en Móvil

### **1. Acceso a Notificaciones**
```
Usuario en App Principal
    ↓
Toca "Más" en MobileNavBar (ícono de menú)
    ↓
Se abre AdminPanel Drawer (full-screen)
    ↓
Toca campana de notificaciones en header
    ↓
Se abre NotificationDropdown (full-screen)
```

### **2. Interacción con Notificaciones**
```
Panel Full-Screen de Notificaciones
    ↓
Scroll vertical para ver lista
    ↓
Pull-to-refresh implícito (al abrir se actualizan)
    ↓
Tap en notificación → abre detalles del contacto
    ↓
Tap fuera del panel → cierra automáticamente
    ↓
Tap "X" o backdrop → cierra panel
```

### **3. Estados y Transiciones**

#### **Estados del Dropdown:**
- **Cerrado:** No renderizado (`return null`)
- **Abriendo:** `animate-fade-in` + `animate-slide-in-bottom`
- **Abierto:** Full-screen con backdrop
- **Cerrando:** Animación inversa al hacer tap fuera

#### **Transiciones Táctiles:**
- **Botón:** `active:scale-95` (feedback inmediato)
- **Backdrop:** Tap para cerrar (100ms delay para evitar cierres accidentales)
- **Items:** `hover:bg-white/[0.02]` y `active:bg-white/[0.04]`

## 🎨 Sistema de Diseño Móvil

### **Colores y Temas**
```css
/* Paleta móvil - alto contraste */
--primary-400: 34 211 238;  /* Cyan brillante */
--bg-primary: #0a0a0c;     /* Fondo oscuro profundo */
--bg-secondary: #0c0c0e;   /* Fondo panel */
--text-primary: #f7fafc;   /* Blanco casi puro */
--text-secondary: #d1d5db; /* Gris claro */
```

### **Tipografía Responsiva**
```css
/* Jerarquía móvil */
- Títulos: text-base (16px)
- Subtítulos: text-sm (14px)
- Body: text-xs (12px)
- Labels: text-[10px] (10px)
```

### **Espaciado Móvil**
```css
/* Sistema de espaciado */
- Padding general: p-3 (12px)
- Padding compacto: p-2 (8px)
- Gaps: gap-2 (8px) a gap-3 (12px)
- Bottom safe area: pb-20 (80px)
```

### **Animaciones y Microinteracciones**
```css
/* Animaciones clave */
- pop-in: Aparición del badge (0.6s cubic-bezier)
- fade-in: Aparición del backdrop (300ms)
- slide-in-bottom: Panel desde abajo (400ms)
- pulse: Icono bell con notificaciones (2s infinite)
- scale-95: Feedback táctil (100ms)
```

## 🔧 Implementación Técnica

### **Store Management (Zustand)**
```typescript
// notificationsStore.ts - Estado global
interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  filters: NotificationFilters;
  
  // Acciones principales
  fetchNotifications: (forceRefresh?: boolean) => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  
  // Realtime updates
  subscribeToNotifications: (userId: string, empresaId: number) => void;
}
```

### **Realtime Updates (Supabase)**
```typescript
// Suscripción a cambios en tiempo real
useEffect(() => {
  if (user && selectedEnterpriseId) {
    // Fetch inicial
    fetchNotifications(true);
    
    // Subscribe a realtime
    subscribeToNotifications(user.id, selectedEnterpriseId);
    
    // Cleanup al cambiar de empresa/desmontar
    return () => unsubscribeFromNotifications();
  }
}, [user, selectedEnterpriseId]);
```

### **Tipos de Datos**
```typescript
// notification.ts - Tipos estrictos
export interface Notification {
  id: number;
  tipo: NotificationType;  // 'nueva_cita' | 'human_in_the_loop' | etc.
  mensaje: string;
  requiere_respuesta: boolean;
  visto: boolean;
  contacto_id: number;
  contact?: {  // Datos del contacto (join)
    nombre: string;
    apellido: string;
    telefono: string;
  };
}
```

## 📊 Performance y Optimización

### **Cache Strategy**
- **Duration:** 5 minutos (300,000ms)
- **Invalidation:** Force refresh al abrir dropdown
- **Background Updates:** Realtime via Supabase

### **Rendering Optimizado**
```typescript
// Selectores optimizados para evitar re-renders
const unreadCount = useNotificationsStore(selectUnreadCount);
const notifications = useNotificationsStore(selectNotifications);
```

### **Memory Management**
- **Cleanup:** Efectos limpios al desmontar
- **Subscription Management:** Unsubscribe automático
- **Event Listeners:** Removidos en cleanup

## 🚀 Características Avanzadas

### **1. Búsqueda en Tiempo Real**
```typescript
// Filtrado local instantáneo
const filteredNotifications = notifications.filter(notification => {
  const query = searchQuery.toLowerCase();
  const contactName = `${notification.contact?.nombre} ${notification.contact?.apellido}`;
  return contactName.includes(query) || 
         notification.mensaje.includes(query) || 
         notification.tipo.includes(query);
});
```

### **2. Filtros Contextuales**
- **Todas:** Sin filtros
- **No leídas:** `visto: false`
- **Requieren respuesta:** `requiere_respuesta: true && visto: false`

### **3. Acciones Inline**
- **Marcar como leída:** Tap en checkbox
- **Responder:** Input inline dentro de la notificación
- **Ver contacto:** Navegación a detalles del contacto
- **Eliminar:** Swipe o botón de eliminar

## 🔒 Seguridad y Multi-Tenant

### **Row Level Security (RLS)**
```sql
-- wp_notificaciones_team RLS
CREATE POLICY "Users can view their own notifications" 
ON wp_notificaciones_team FOR SELECT 
USING (
  empresa_id = auth.jwt() ->> 'empresa_id'::int 
  AND (
    asesor_id = auth.uid() OR 
    asesor_id IS NULL  -- Broadcast a todo el equipo
  )
);
```

### **Data Isolation**
- **Por Empresa:** `empresa_id` filter obligatorio
- **Por Usuario:** `asesor_id` para notificaciones individuales
- **Broadcast:** `asesor_id IS NULL` para todo el equipo

## 📱 UX Guidelines Móviles

### **Touch Targets**
- **Mínimo:** 44px × 44px (WCAG guidelines)
- **Implementado:** 40px × 40px con padding visual
- **Feedback:** `active:scale-95` inmediato

### **Gestos Nativos**
- **Tap:** Abrir/cerrar elementos
- **Scroll:** Vertical nativo
- **Pull-to-Refresh:** Implícito al abrir
- **Swipe:** Futuro para eliminar archivos

### **Safe Areas**
- **Notch:** Manejado por `inset-0`
- **Home Indicator:** `pb-20` para navbar
- **Status Bar:** Respetado por el layout

### **Accessibility**
- **Screen Reader:** Semantic HTML + ARIA labels
- **Contrast:** WCAG AA compliant (4.5:1 mínimo)
- **Focus:** Indicadores claros en navegación con teclado
- **Reduced Motion:** Respeta `prefers-reduced-motion`

## 🔄 Estado Actual y Mejoras Futuras

### **Implementado ✅**
- Full-screen drawer en móvil
- Realtime updates via Supabase
- Búsqueda y filtros funcionales
- Click outside para cerrar
- Z-index correcto (z-[100])
- Safe areas para MobileNavBar

### **Mejoras Futuras 🚀**
- **Gestos:** Swipe-to-delete
- **Vibración:** Haptic feedback en acciones
- **Notificaciones Push:** Integración con service worker
- **Offline Mode:** Cache para notificaciones recientes
- **Batch Actions:** Seleccionar múltiples para marcar como leídas

---

## 🐛 Problemas Identificados (Investigación 2024-12-25)

### **Arquitectura Actual - Flujo Móvil**

```
App.tsx
└── MobileNavBar (z-40, md:hidden)
    └── [NO tiene botón de notificaciones - CORRECTO]

└── AdminPanel Drawer (z-40, md:hidden, fixed inset-0)
    └── Backdrop (bg-black/60, onClick=closeAdminPanel)
    └── Panel Content (pb-20)
        └── AdminPanel.tsx
            └── Header (relative z-50)
                └── NotificationButton
                └── NotificationDropdown (z-[100], fixed inset-0)
                    └── Backdrop móvil (z-[90], md:hidden)
                    └── Panel (z-[100])
```

### **Posibles Causas del Problema**

#### **1. Conflicto de Z-index entre Drawers**
```tsx
// App.tsx - AdminPanel Drawer
<div className="fixed inset-0 z-40 md:hidden">
  <div className="absolute inset-0 bg-black/60" onClick={closeAdminPanel} />
  <div className="absolute inset-0 pb-20">
    <AdminPanel />  // NotificationDropdown está DENTRO
  </div>
</div>

// NotificationDropdown.tsx
<div className="fixed inset-0 z-[100]">  // ← Intenta ser z-100 pero...
```
**Problema:** El dropdown usa `fixed inset-0 z-[100]` pero está renderizado **dentro** de un elemento con `z-40`. En CSS, el z-index de un hijo no puede superar el stacking context del padre.

#### **2. Event Propagation del Backdrop**
```tsx
// App.tsx línea 154
<div 
  className="absolute inset-0 bg-black/60"
  onClick={() => useAdminStore.getState().closeAdminPanel()}  // ← CAPTURA clicks
/>
```
**Problema:** El backdrop del AdminPanel puede interceptar clicks antes que lleguen al NotificationDropdown.

#### **3. Estado Local Aislado**
```tsx
// AdminPanel.tsx línea 37
const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
```
**Problema:** Si el AdminPanel se desmonta/remonta, el estado de notificaciones se pierde.

### **Soluciones Propuestas**

#### **Opción A: Portal para Dropdown (Recomendada)**
Renderizar el NotificationDropdown fuera del árbol del AdminPanel usando React Portal:
```tsx
// NotificationDropdown.tsx
import { createPortal } from 'react-dom';

return createPortal(
  <div className="fixed inset-0 z-[100]">...</div>,
  document.body
);
```

#### **Opción B: Mover estado a Store Global**
```tsx
// adminStore.ts
isNotificationsOpen: boolean;
setNotificationsOpen: (open: boolean) => void;
```

#### **Opción C: Ajustar Z-index del AdminPanel Drawer**
```tsx
// App.tsx - Subir z-index del drawer
<div className="fixed inset-0 z-[60] md:hidden">
```

### **Verificación Requerida**
1. Abrir app en móvil
2. Tap "Más" → AdminPanel drawer se abre
3. Tap campana → ¿El dropdown aparece?
4. Si aparece: ¿El tap fuera cierra SOLO el dropdown o también el AdminPanel?
5. Si no aparece: Problema de stacking context confirmado

---

## 📋 Resumen de Arquitectura Móvil

El sistema de notificaciones móvil está diseñado como una experiencia **full-screen optimizada para touch** que sigue las mejores prácticas de UX móvil:

1. **Acceso Contextual:** Desde AdminPanel drawer, no duplicado en navbar
2. **Full-Screen Experience:** `inset-0` con backdrop y safe areas
3. **Performance:** Cache + realtime updates + selectores optimizados
4. **Seguridad:** RLS multi-tenant con aislamiento por empresa/usuario
5. **UX Premium:** Animaciones fluidas, feedback táctil, accesibilidad

La implementación prioriza la **usabilidad táctil** y **consistencia visual** con el resto de la aplicación, manteniendo la coherencia del diseño oscuro y minimalista de Urpe AI Lab.

**⚠️ NOTA:** El problema reportado de "ventana rota" probablemente se debe al **stacking context** del AdminPanel drawer (`z-40`) que impide que el NotificationDropdown (`z-[100]`) se muestre correctamente. La solución recomendada es usar **React Portal** para renderizar el dropdown fuera del árbol del drawer.
