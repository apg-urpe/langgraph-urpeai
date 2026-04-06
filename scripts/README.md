# 📁 Scripts SQL - Urpe AI Lab

Scripts de migración y configuración para Supabase.

---

## 🚀 Orden de Ejecución

| # | Archivo | Descripción | Dependencias |
|---|---------|-------------|--------------|
| 1 | `MONICA_ROLES_SCHEMA.sql` | Roles y personalidades de Monica | - |
| 2 | `GAMIFICATION_SCHEMA.sql` | Sistema de gamificación | `wp_team_humano` |
| 3 | `CONTACT_PAUSE_SCHEMA.sql` | Pausar contactos | `wp_contactos` |
| 4 | `NOTES_V2_SCHEMA.sql` | Notas con títulos/tags | `wp_contactos_nota` |

---

## 🎮 GAMIFICATION_SCHEMA.sql

**Estado**: ⏳ Pendiente de deploy

### Qué crea:
- Schema `gamification`
- 4 tablas: `profiles`, `xp_transactions`, `user_badges`, `daily_missions`
- 3 funciones RPC: `award_xp`, `update_streak`, `generate_daily_missions`
- 1 vista: `leaderboard_weekly`

### Ejecutar:
```sql
-- Copiar todo el contenido de GAMIFICATION_SCHEMA.sql
-- Pegar en Supabase SQL Editor → Run
```

### Verificar:
```sql
-- Debe retornar datos
SELECT gamification.award_xp(1, 'test', 10, 'Test XP');
SELECT * FROM gamification.profiles;
```

---

## 📋 Otros Scripts

### CONTACT_PAUSE_SCHEMA.sql
Añade campo `paused_until` a `wp_contactos` para pausar contactos temporalmente.

### NOTES_V2_SCHEMA.sql  
Añade campos `titulo`, `etiquetas`, `es_fijado` a `wp_contactos_nota`.

### MONICA_ROLES_SCHEMA.sql
Crea tabla `wp_monica_roles` para personalidades de Monica AI.

---

## ⚠️ Notas Importantes

1. **Siempre hacer backup** antes de ejecutar scripts en producción
2. Los scripts usan `DROP ... CASCADE` - ejecutar en orden
3. Verificar que dependencias existan antes de ejecutar
