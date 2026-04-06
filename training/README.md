# 🎓 Urpe Academy - Módulo de Capacitación

> Sistema de capacitación gamificado para equipos comerciales, inspirado en Duolingo.

## Estructura del Módulo

```
training/
├── components/
│   ├── FocusTrainingOverlay.tsx   # Portal fullscreen (Modo Enfoque)
│   ├── LessonPlayer.tsx           # Motor de lecciones interactivas
│   └── AcademyView.tsx            # Vista principal con catálogo de cursos
├── store/
│   └── trainingStore.ts           # Estado Zustand con persistencia
├── types/
│   └── training.ts                # Interfaces TypeScript
├── hooks/                         # Hooks personalizados (futuro)
├── lib/                           # Utilidades (futuro)
└── README.md                      # Este archivo
```

## Archivos Relacionados

| Ubicación | Archivo | Propósito |
|-----------|---------|-----------|
| `scripts/` | `TRAINING_SCHEMA.sql` | Schema de base de datos |
| `app/api/training/` | `generate-lesson/route.ts` | API de generación con IA |
| `store/` | `adminStore.ts` | Incluye `'academy'` en `AdminView` |
| `components/admin/` | `AdminNavBar.tsx` | Botón de navegación |
| `components/admin/` | `AdminPanel.tsx` | Integración de vista |

## Instalación

### 1. Ejecutar Schema SQL

```sql
-- En Supabase SQL Editor, ejecutar:
-- scripts/TRAINING_SCHEMA.sql
```

### 2. Verificar Instalación

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'training_%';
```

Debe mostrar:
- `training_courses`
- `training_lessons`
- `training_questions`
- `training_user_progress`
- `training_streaks`

## Uso

### Acceder a la Academia

1. Click en el botón **Academia** (🎓) en la barra de navegación
2. Ver cursos disponibles para tu empresa
3. Iniciar una lección

### Crear Cursos (Admins)

Los usuarios con rol 1 o 2 pueden crear cursos:

```typescript
// Insertar curso manualmente
const { data } = await supabase
  .from('training_courses')
  .insert({
    empresa_id: 1,
    titulo: 'Técnicas de Venta',
    descripcion: 'Aprende las mejores técnicas de cierre',
    categoria: 'Ventas',
    dificultad: 'intermedio'
  });
```

### Generar Lecciones con IA

```typescript
// POST /api/training/generate-lesson
const response = await fetch('/api/training/generate-lesson', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    courseId: 'uuid-del-curso',
    topic: 'Manejo de objeciones de precio',
    questionCount: 5,
    difficulty: 'intermedio',
    context: {
      productos: [...],
      objeciones: ['Es muy caro', 'Lo pienso']
    }
  })
});
```

## Mecánicas de Gamificación

### Sistema de Corazones
- 5 vidas máximas por lección
- -1 vida por respuesta incorrecta
- 0 vidas = lección fallida

### Sistema de XP
- +10 XP por respuesta correcta
- +25 XP bonus si no hay errores
- x1.5 multiplicador con racha activa

### Rachas (Streaks)
- Se actualiza al completar una lección diaria
- Se rompe si no entrenas un día
- "Streak Freeze" disponible (futuro)

## Integración con Gamification Store

```typescript
// Al completar lección, se otorga XP automáticamente
await gamificationStore.awardXP('task_completed', 'Lección completada: ...');
```

## Principio de Aislamiento

Este módulo está diseñado para **migración independiente**:

```
✅ training/ → puede importar de store/, lib/, types/
❌ components/ → NO debe importar de training/
❌ store/ → NO debe importar de training/store/
```

Para mover el módulo a otro proyecto:
1. Copiar carpeta `training/`
2. Copiar `scripts/TRAINING_SCHEMA.sql`
3. Copiar `app/api/training/`
4. Ajustar imports según estructura del nuevo proyecto

## Roadmap

- [ ] Vista de detalle de curso
- [ ] Tipos de pregunta: `order_steps`, `fill_blank`
- [ ] Roleplay con Monica AI
- [ ] Streak Freeze
- [ ] Leaderboards por empresa
- [ ] Badges específicos de academia
- [ ] Modo offline con sync

## Troubleshooting

### "No hay cursos disponibles"
- Verificar que el schema SQL esté ejecutado
- Verificar que existan cursos para la empresa seleccionada
- Verificar RLS policies

### "Error al generar lección"
- Verificar `GEMINI_API_KEY` en `.env`
- Verificar que el curso exista

### "trainingStore is undefined"
- Verificar imports en componentes
- Verificar que el store se exporte correctamente

---

Documentación completa: `docs/modules/training/README.md`
