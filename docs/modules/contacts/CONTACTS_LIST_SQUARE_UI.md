# Lista de Contactos - Estilo Square UI

## Resumen de Cambios Aplicados

Se ha actualizado el componente `ContactsView.tsx` para adoptar los patrones de diseño de **Square UI**, mejorando significativamente la apariencia visual de la lista de contactos.

## Patrones Implementados

### 1. Cards de Contacto con Bordes y Sombras

**Antes**: Items planos con border-left sutil
**Después**: Cards con `rounded-xl border` y efectos hover

```tsx
<div className={`
  group relative p-3 cursor-pointer transition-all duration-200 rounded-xl border
  ${isSelected 
    ? 'bg-primary-500/10 border-primary-500/50 shadow-[0_0_20px_rgba(var(--primary-500),0.15)]' 
    : 'bg-zinc-900/50 border-white/5 hover:bg-zinc-800/50 hover:border-white/10 hover:shadow-lg'
  }
`}>
```

### 2. Sistema de Badges de Estado (Light/Dark Variants)

Configuración de colores con soporte para temas claro y oscuro:

```typescript
const statusConfig: Record<string, { label: string; className: string }> = {
  prospecto: {
    label: 'Prospecto',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
  },
  cliente: {
    label: 'Cliente',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
  },
  calificado: {
    label: 'Calificado',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-400 border-purple-200 dark:border-purple-800/50'
  },
  no_calificado: {
    label: 'No Calif.',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800/50'
  },
  evaluando: {
    label: 'Evaluando',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
  }
};
```

### 3. Barras de Progreso con Gradientes (Top Performers Style)

Sistema de estilos para la barra de lead score:

```typescript
const scoreBarStyles = [
  { 
    borderColor: 'border-rose-500', 
    bgGradient: 'bg-gradient-to-r from-rose-500/50 via-rose-500/25 to-transparent', 
    isDashed: false  // Hot leads: borde sólido
  },
  { 
    borderColor: 'border-amber-400', 
    bgGradient: 'bg-gradient-to-r from-amber-400/40 via-amber-400/20 to-transparent', 
    isDashed: true   // Warm leads: borde punteado
  },
  { 
    borderColor: 'border-zinc-600', 
    bgGradient: 'bg-gradient-to-r from-zinc-600/30 via-zinc-600/15 to-transparent', 
    isDashed: true   // Cold leads: borde punteado gris
  }
];
```

### 4. Inner Container para Lead Score

Contenedor anidado con el score badge dentro de la barra:

```tsx
<div className="bg-zinc-800/50 border border-white/5 rounded-lg p-2">
  <div className={`
    relative h-6 rounded-md border overflow-hidden
    ${scoreBarStyle.borderColor}
    ${scoreBarStyle.isDashed ? 'border-dashed' : 'border-solid'}
  `}>
    {/* Gradient fill */}
    <div 
      className={`absolute inset-0 ${scoreBarStyle.bgGradient}`}
      style={{ width: `${Math.max(context.leadScore.value, 20)}%` }}
    />
    {/* Score badge inside bar */}
    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded px-1.5 py-0.5">
      <Activity className="w-3 h-3 text-zinc-400" />
      <span className="text-xs font-bold" style={{ textShadow: '...' }}>
        {context.leadScore.value}
      </span>
    </div>
  </div>
</div>
```

### 5. Glow Effects para Elementos Destacados

Efectos de brillo para estados especiales:

- **Selección activa**: `shadow-[0_0_20px_rgba(var(--primary-500),0.15)]`
- **Avatar seleccionado**: `shadow-[0_0_15px_rgba(var(--primary-500),0.5)]`
- **Badge calificado**: `shadow-[0_0_8px_rgba(245,158,11,0.6)]`
- **Text shadow en scores**: Hot = rosa, Warm = ámbar

### 6. Iconos en Contenedores con Borde

Acciones rápidas con contenedor visual:

```tsx
{context.quickActions.hasAppointment && (
  <div className="p-1 rounded-md bg-blue-500/10 border border-blue-500/20">
    <Calendar className="w-3 h-3 text-blue-400" />
  </div>
)}
```

## Estructura Visual de la Card

```
┌─────────────────────────────────────────────────────────┐
│  [Avatar]  Nombre del Contacto       [Estado] [Cita] → │
│     ⚡      📞 +51 999...  ✉️ email@...                 │
│            ┌─────────────────────────────────────────┐ │
│            │ [🔥 85] ════════════════  [Tag] [Agent] │ │
│            └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Referencias de Diseño

- **Square UI Dashboard 4**: `top-performers.tsx` - Barras con gradientes y bordes
- **Square UI Leads**: `leads-table.tsx` - Sistema de badges con variantes light/dark
- **Square UI Dashboard 4**: `stats-cards.tsx` - Inner containers con valores

## Archivos Modificados

- `components/admin/ContactsView.tsx` - Componente principal de lista

## Compatibilidad

- ✅ Dark mode (principal)
- ✅ Light mode (variantes automáticas)
- ✅ Mobile responsive
- ✅ Estados de selección
- ✅ Indicadores de pausa/desactivado
- ✅ Indicadores de calificado
