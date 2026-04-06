# Profile Tabs Components

Componentes de tabs para `UserProfileView`, implementados con **lazy loading** para optimización de bundle y carga inicial.

## Arquitectura

```
UserProfileView.tsx (padre)
    ├── ProfileHeader (inline)
    └── <Suspense>
        ├── OverviewTab (lazy)
        ├── BadgesTab (lazy)
        ├── StatsTab (lazy)
        ├── LeaderboardTab (lazy)
        └── SettingsTab (lazy)
```

## Componentes

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| `OverviewTab` | `OverviewTab.tsx` | Misiones diarias y resumen rápido de stats |
| `BadgesTab` | `BadgesTab.tsx` | Catálogo completo de medallas por categoría |
| `StatsTab` | `StatsTab.tsx` | Estadísticas detalladas y historial de rachas |
| `LeaderboardTab` | `LeaderboardTab.tsx` | Ranking de equipo (semanal/mensual/total) |
| `SettingsTab` | `SettingsTab.tsx` | Configuración de tema e idioma |

## Performance

### Lazy Loading
Cada tab se carga bajo demanda usando `React.lazy()`:

```typescript
const OverviewTab = lazy(() => 
  import('./tabs/OverviewTab').then(m => ({ default: m.OverviewTab }))
);
```

### Beneficios
- **Bundle splitting**: Cada tab es un chunk separado
- **Carga inicial reducida**: Solo se carga el tab activo
- **Fallback uniforme**: `TabLoading` muestra spinner durante carga

## Dependencias

| Tab | Stores | Types |
|-----|--------|-------|
| Overview | - | `gamification` |
| Badges | - | `gamification` (BADGES_CATALOG) |
| Stats | - | - |
| Leaderboard | `gamificationStore`, `contactStore` | - |
| Settings | `chatStore`, `languageStore` | `AppTheme` |

## Props

### OverviewTab
```typescript
interface OverviewTabProps {
  profile: any;
  dailyMissions: any[];
  levelInfo: any;
}
```

### BadgesTab / StatsTab
```typescript
interface Props {
  profile: any;
}
```

### LeaderboardTab / SettingsTab
Sin props - obtienen datos directamente de stores.

## Estilos

Todos los tabs siguen el sistema de diseño:
- **Background**: `bg-zinc-900/50`
- **Borders**: `border-white/5`
- **Colores semánticos**: orange (racha), amber (medallas), emerald (completado), cyan (mensajes)
