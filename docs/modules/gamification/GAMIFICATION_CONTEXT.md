# Contexto de Gamificación - Urpe AI Lab v2.0

Sistema de gamificación implementado para engagement de usuarios del equipo.

---

## 📁 Arquitectura de Archivos

```
types/
  └── gamification.ts       # Tipos, interfaces, constantes y helpers

store/
  └── gamificationStore.ts  # Estado Zustand + lógica de negocio

scripts/
  └── GAMIFICATION_SCHEMA.sql # Definición de esquema SQL, funciones y RLS

components/admin/profile/
  └── UserProfileView.tsx   # Vista principal del perfil gamificado
```

---

## 🎯 Sistema de Niveles y XP

### Niveles Predefinidos
| Nivel | Nombre     | XP Mínimo | XP Máximo | Color   |
|-------|------------|-----------|-----------|---------|
| 1     | Novato     | 0         | 100       | zinc    |
| 2     | Aprendiz   | 100       | 300       | emerald |
| 3     | Competente | 300       | 600       | cyan    |
| 4     | Experto    | 600       | 1000      | violet  |
| 5     | Maestro    | 1000      | 1500      | amber   |
| 6     | Leyenda    | 1500      | ∞         | rose    |

### Acciones que Otorgan XP
```typescript
XP_REWARDS = {
  task_completed: 10,
  task_completed_on_time: 15,
  message_sent: 1,
  appointment_scheduled: 5,
  appointment_completed: 20,
  contact_qualified: 10,
  conversion_achieved: 50,
  daily_login: 5,
  streak_milestone: 25,
  badge_earned: variable
}
```

---

## 🏅 Sistema de Medallas (Badges)

### Categorías
- **Velocidad**: Respuesta rápida, Rayo, Flash
- **Precisión**: Puntual, Certero, Infalible
- **Comunicación**: Comunicativo, Conversador, Orador
- **Consistencia**: Constante, Dedicado, Imparable
- **Liderazgo**: Mentor, Capitán, Comandante
- **Especiales**: Primer Día, Primera Tarea, Primera Venta

### Tiers
- **Bronze**: Logros iniciales (~25 XP)
- **Silver**: Logros intermedios (~50 XP)
- **Gold**: Logros avanzados (~100 XP)
- **Platinum**: Logros élite (~150 XP)

---

## 🔥 Sistema de Rachas (Streaks)

### Lógica (Server-Side)
- Se cuenta días consecutivos con actividad usando `gamification.update_streak()`
- Milestones en: 7, 14, 30, 60, 90 días
- Operación atómica para evitar manipulaciones

### Datos Trackeados
```typescript
StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string; // ISO Date
  streakStartDate: string;  // ISO Date
  isActive: boolean;
}
```

---

## 🎯 Misiones Diarias

### Generación Automática (SQL)
- Función `gamification.generate_daily_missions()`
- 3 misiones aleatorias por día
- Tipos: messages, tasks, appointments, contacts
- Se almacenan en tabla `gamification.daily_missions`

### Estructura
```typescript
DailyMission {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  target: number;
  current: number;
  xpReward: number;
  isCompleted: boolean;
  expiresAt: string;
}
```

---

## 📊 Estadísticas Trackeadas

```typescript
ActivityStats {
  // Totales
  totalMessages, totalTasksCompleted, totalAppointments,
  totalContactsCreated, totalConversions,
  
  // Calidad
  avgResponseTimeMinutes, tasksOnTimePercent, conversionRate,
  
  // Período actual
  monthlyMessages, monthlyTasks, monthlyAppointments
}
```

---

## 🏆 Leaderboard

### Scopes
- **Weekly**: XP ganado esta semana (Vista Materializada)
- **Monthly**: XP ganado este mes
- **All-time**: XP total acumulado

### Implementación
- Usa vista materializada `gamification.leaderboard_weekly`
- Refrescada periódicamente para alto rendimiento
- Campos: Rank, nombre, nivel, XP, racha actual, cantidad de medallas

---

## 💾 Persistencia de Datos (Nuevo Esquema SQL)

### Arquitectura Relacional (Schema `gamification`)
A diferencia de v1 (JSONB), v2 usa un esquema dedicado en Supabase para robustez, atomicidad y analytics.

### Tablas Principales
1. **`gamification.profiles`**: Estado actual (XP, nivel, racha).
2. **`gamification.xp_transactions`**: Log inmutable de cada punto ganado (auditoría).
3. **`gamification.user_badges`**: Medallas ganadas.
4. **`gamification.daily_missions`**: Misiones activas e historial.
5. **`gamification.levels` & `badge_catalog`**: Configuración dinámica.

### Ventajas
- **Atomicidad**: Funciones SQL evitan race conditions al ganar XP concurrentemente.
- **Seguridad**: RLS granular por empresa.
- **Rendimiento**: Índices optimizados y vistas materializadas para leaderboards.

---

## 🖼️ Componentes UI

### UserProfileView (Vista Principal)
- **Header**: Avatar con gradiente de nivel, nombre, badges de nivel y racha
- **Tabs**: Resumen, Medallas, Estadísticas, Ranking
- **Resumen**: Misiones diarias, stats rápidos, últimas medallas
- **Medallas**: Catálogo completo por categoría
- **Estadísticas**: Métricas detalladas y historial de rachas
- **Ranking**: Leaderboard con filtros de tiempo

### AdminNavBar (Integración)
- Botón de perfil con indicador de nivel (badge numérico)
- Icono de fuego si racha activa
- Tooltip con nivel actual

---

## 🔄 Flujo de Datos (v2.0)

```
Usuario realiza acción
       ↓
gamificationStore.awardXP()
       ↓
RPC Call: gamification.award_xp() (Atomic SQL)
       ↓
SQL: UPDATE profile + INSERT transaction (Lock de fila)
       ↓
Store recibe nuevo estado (XP, Nivel)
       ↓
UI se actualiza automáticamente (Zustand reactivity)
```

---

## 🚀 Próximos Pasos (Roadmap)

### Fase 2: Integración Profunda
- [x] Hook en `tareasStore` para otorgar XP al completar tareas
- [ ] Hook en `contactStore` para XP al calificar contactos
- [ ] Hook en chat para XP por mensajes enviados

### Fase 3: Social Features
- [ ] Comparación con equipo
- [ ] Desafíos entre usuarios
- [ ] Logros de equipo

### Fase 4: Recompensas Reales
- [ ] Sistema de canjes
- [ ] Integraciones con beneficios corporativos
