---
title: "Mobile UX"
---

> Guías de diseño responsive para Urpe AI Lab

---

## 🎯 Filosofía Mobile-First

Urpe AI Lab está diseñado con enfoque mobile-first:
- **Touch-optimized**: Targets de 44px mínimo
- **Responsive layouts**: Adaptación fluida
- **Navegación bottom**: Accesible con pulgar
- **Gestos naturales**: Swipe, pull-to-refresh

---

## 📐 Breakpoints

| Breakpoint | Ancho | Uso |
|------------|-------|-----|
| `sm` | 640px | Móvil landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / Desktop pequeño |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Desktop grande |

---

## 🧭 Navegación

### Mobile (<768px)
- **Bottom Navigation**: Barra fija inferior
- **Hamburger Menu**: Acciones secundarias
- **Gestos**: Swipe para volver

### Desktop (≥768px)
- **Sidebar**: Navegación lateral
- **Header**: Acciones principales
- **Breadcrumbs**: Contexto de ubicación

---

## 🎨 Adaptaciones por Módulo

### Chat
- Full-screen en mobile
- Input fijo en bottom
- Teclado ajusta viewport

### Admin Panel
- Cards apiladas verticalmente
- Tabs en lugar de sidebar
- Acciones en sheets

### Calendario
- Vista día por defecto
- Swipe entre días
- Modal para crear cita

---

## 📚 Documentación Detallada

- [UX Mobile Context](./MOBILE_UX_CONTEXT.md)
- [Contact Detail Mobile](./MOBILE_CONTACT_DETAIL_CONTEXT.md)
- [Notificaciones Mobile](./NOTIFICATIONS_MOBILE_CONTEXT.md)

---

## 🔧 Utilidades CSS

```css
/* Prevenir pull-to-refresh */
overscroll-behavior: none;

/* Prevenir highlight en tap */
-webkit-tap-highlight-color: transparent;

/* Prevenir zoom en inputs iOS */
font-size: 16px;

/* Safe area para notch */
padding-bottom: env(safe-area-inset-bottom);
```

---

## ✅ Checklist de Mobile

- [ ] Touch targets ≥ 44px
- [ ] Texto legible sin zoom (≥16px)
- [ ] Formularios con tipos de input correctos
- [ ] Navegación accesible con una mano
- [ ] Loading states para conexiones lentas
- [ ] Offline feedback claro
