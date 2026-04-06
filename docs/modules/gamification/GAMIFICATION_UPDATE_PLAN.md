# 🎮 Gamificación - SQL Minimalista

## Versión: 2.0 (Minimalista)
## Fecha: 2024-12-27

---

## 🎯 Filosofía: Menos es Más

| V1 (Descartada) | V2 (Final) |
|-----------------|------------|
| 700+ líneas | **~200 líneas** |
| 6 tablas | **4 tablas** |
| Tabla `levels` | Config en TypeScript |
| Tabla `badge_catalog` | Config en TypeScript |
| Vista materializada | **Vista simple** |
| RLS complejo | Permisos básicos |

---

## 📁 Estructura Final

```
scripts/GAMIFICATION_SCHEMA.sql  ← Ejecutar esto
types/gamification.ts            ← Config de niveles/medallas (ya existe)
store/gamificationStore.ts       ← Store (ya existe, compatible)
```

---

## 🗄️ Tablas (solo 4)

| Tabla | Propósito |
|-------|-----------|
| `profiles` | XP, racha, timestamps por usuario |
| `xp_transactions` | Log inmutable de XP ganado |
| `user_badges` | Medallas desbloqueadas |
| `daily_missions` | Misiones diarias |

---

## ⚡ Funciones RPC (solo 3)

| Función | Qué hace |
|---------|----------|
| `award_xp(member_id, action, amount, desc)` | Otorga XP atómicamente |
| `update_streak(member_id)` | Actualiza racha diaria |
| `generate_daily_missions(member_id)` | Genera 3 misiones/día |

---

## 🚀 Despliegue

```sql
-- En Supabase SQL Editor, ejecutar:
-- scripts/GAMIFICATION_SCHEMA.sql

-- Verificar:
SELECT gamification.award_xp(1, 'test', 10, 'Test');
```

---

## 🎨 Feedback al Usuario

El sistema muestra:
- **+XP toast** al ganar puntos
- **Level up animation** al subir nivel
- **Badge unlock** al desbloquear medalla
- **Streak fire** al mantener racha
- **Leaderboard rank** en tiempo real
