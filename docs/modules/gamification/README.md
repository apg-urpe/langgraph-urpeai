# 🎮 Módulo: Gamificación

> Sistema de XP, niveles, medallas y rachas

---

## 🎯 Propósito

El módulo de Gamificación transforma las métricas de productividad en una experiencia motivadora:
- **Sistema de XP**: Puntos por acciones completadas
- **Niveles progresivos**: 6 niveles con gradientes visuales
- **Medallas**: Logros desbloqueables por categoría
- **Rachas**: Días consecutivos de actividad
- **Misiones diarias**: Objetivos renovables cada día
- **Leaderboard**: Ranking del equipo

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `UserProfileView.tsx` | `/components/admin/profile/` | Vista de perfil gamificado |

### Tabs del Perfil

| Tab | Contenido |
|-----|-----------|
| Resumen | Misiones diarias, stats rápidas, últimas medallas |
| Medallas | Catálogo completo de logros |
| Estadísticas | Métricas detalladas de rendimiento |
| Ranking | Leaderboard del equipo |

---

## 💾 Modelo de Datos

### Almacenamiento en `wp_team_humano.metadata.gamification`

```typescript
interface GamificationProfile {
  xp: number;
  level: number;
  
  streak: StreakData;
  badges: string[];           // IDs de medallas desbloqueadas
  missions: DailyMission[];
  stats: UserStats;
  
  lastXpGain: string;         // Timestamp
  lastMissionRefresh: string; // Fecha de última renovación
}

interface StreakData {
  current: number;
  longest: number;
  lastActivityDate: string;
  isActive: boolean;
}

interface DailyMission {
  id: string;
  type: MissionType;
  target: number;
  current: number;
  xpReward: number;
  completed: boolean;
}
```

---

## 📊 Sistema de Niveles

| Nivel | Nombre | XP Requerida | Color Gradiente |
|-------|--------|--------------|-----------------|
| 1 | Novato | 0-100 | Zinc (gris) |
| 2 | Aprendiz | 100-300 | Emerald (verde) |
| 3 | Competente | 300-600 | Cyan (azul) |
| 4 | Experto | 600-1000 | Violet (púrpura) |
| 5 | Maestro | 1000-1500 | Amber (ámbar) |
| 6 | Leyenda | 1500+ | Rose (rosa) |

---

## ⚡ Acciones y XP

| Acción | XP | Trigger |
|--------|-----|---------|
| `daily_login` | 5 | Login del día |
| `message_sent` | 1 | Enviar mensaje |
| `task_completed` | 10 | Completar tarea |
| `task_completed_on_time` | 15 | Completar antes de vencer |
| `appointment_scheduled` | 5 | Programar cita |
| `appointment_completed` | 20 | Completar cita |
| `contact_qualified` | 10 | Calificar contacto |
| `conversion_achieved` | 50 | Convertir a cliente |
| `streak_milestone` | 25 | Alcanzar milestone de racha |

---

## 🏅 Sistema de Medallas

### Categorías

| Categoría | Descripción |
|-----------|-------------|
| Velocidad | Respuesta rápida y eficiencia |
| Precisión | Calidad y exactitud |
| Comunicación | Interacciones con clientes |
| Consistencia | Actividad constante |
| Liderazgo | Impacto en equipo |
| Especial | Logros únicos |

### Tiers

| Tier | XP Bonus | Color |
|------|----------|-------|
| Bronze | 25 | Cobre |
| Silver | 50 | Plata |
| Gold | 100 | Oro |
| Platinum | 150 | Platino |

---

## 🔄 Store: `gamificationStore.ts`

```typescript
// Estado
profile: GamificationProfile | null;
leaderboard: LeaderboardEntry[];
isLoading: boolean;

// Acciones principales
fetchGamificationProfile(userId)
awardXP(action: XPAction, amount?: number)
updateMissionProgress(missionType, increment)
checkBadgeProgress()
saveProfileToServer()

// Misiones
refreshDailyMissions()
completeMission(missionId)

// Leaderboard
fetchLeaderboard(enterpriseId, period)

// Selectores
selectGamificationProfile
selectCurrentLevel
selectXPProgress
selectActiveMissions
```

---

## 🔥 Sistema de Rachas

### Lógica
- Se activa con cualquier actividad del día
- Se pierde si no hay actividad en 24h
- Milestones: 7, 14, 30, 60, 90 días

### Indicadores UI
- 🔥 Icono de fuego en header del chat
- Número de días actual
- Color ámbar/naranja para rachas activas

---

## 🎯 Misiones Diarias

### Tipos Disponibles
- Enviar X mensajes
- Completar X tareas
- Programar X citas
- Calificar X contactos
- Responder en menos de X minutos

### Renovación
- Expiran a medianoche
- 3 misiones aleatorias por día
- Dificultad variable

---

## 📚 Documentación Relacionada

- [Contexto de Gamificación](./GAMIFICATION_CONTEXT.md)
- [Plan de Actualización](./GAMIFICATION_UPDATE_PLAN.md)
- [Equipo](../team/README.md)
