# 🎓 Urpe Academy

> Sistema de Capacitación Gamificado para Equipos Comerciales

## Visión General

Urpe Academy es un módulo de capacitación inspirado en Duolingo, diseñado para entrenar equipos comerciales usando contenido generado por **Monica AI** basado en el contexto real del CRM.

### Características Principales

- **Modo Enfoque**: Overlay 100% pantalla que elimina distracciones
- **Generación IA**: Cursos creados automáticamente desde datos del CRM
- **Gamificación**: Streaks, XP, Corazones, Leaderboards
- **Persistencia Dual**: localStorage + Supabase para sesiones interrumpibles
- **Multi-tenant**: Cada empresa crea sus propios cursos

---

## 🏗️ Arquitectura Modular

El módulo está diseñado para **aislamiento total**, permitiendo migración independiente.

### Estructura de Archivos

```
training/
├── components/
│   ├── FocusTrainingOverlay.tsx    # Portal React (Modo Enfoque)
│   ├── LessonPlayer.tsx            # Motor de lecciones interactivas
│   ├── QuestionCard.tsx            # Renderizado de preguntas
│   ├── AnswerFeedback.tsx          # Feedback correcto/incorrecto
│   ├── LessonComplete.tsx          # Pantalla de finalización
│   └── CourseCard.tsx              # Card de curso en catálogo
├── store/
│   └── trainingStore.ts            # Estado Zustand independiente
├── types/
│   └── training.ts                 # Interfaces TypeScript
├── hooks/
│   └── useLesson.ts                # Hook para lógica de lecciones
├── lib/
│   └── question-generator.ts       # Utilidades de generación
└── README.md                       # Documentación del módulo

scripts/
└── TRAINING_SCHEMA.sql             # Schema de base de datos

app/api/training/
├── generate-lesson/route.ts        # Genera lección con Monica AI
├── courses/route.ts                # CRUD de cursos
└── progress/route.ts               # Sincronización de progreso
```

### Principio de Aislamiento

| Dirección | Permitido |
|-----------|-----------|
| `training/` → `store/gamificationStore` | ✅ Solo para XP/badges |
| `training/` → `lib/utils` | ✅ Utilidades generales |
| `components/` → `training/` | ❌ Prohibido |
| `store/` → `training/store/` | ❌ Prohibido |

---

## 📋 Plan de Trabajo

### Fase 1: Schema SQL ⬜
**Archivo**: `scripts/TRAINING_SCHEMA.sql`

```sql
-- Namespace separado para migración fácil
CREATE SCHEMA IF NOT EXISTS training;

-- Cursos por empresa
CREATE TABLE training.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id),
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(100),
  dificultad VARCHAR(20) CHECK (dificultad IN ('principiante', 'intermedio', 'avanzado')),
  duracion_estimada_min INT,
  portada_url TEXT,
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lecciones (nodos del curso)
CREATE TABLE training.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES training.courses(id) ON DELETE CASCADE,
  orden INT NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  contenido_intro TEXT,
  tiempo_estimado_seg INT DEFAULT 180,
  xp_reward INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preguntas (generadas por IA o manuales)
CREATE TABLE training.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES training.lessons(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'multiple_choice', 'true_false', 'order_steps', 
    'fill_blank', 'roleplay'
  )),
  pregunta TEXT NOT NULL,
  opciones JSONB, -- Array de opciones para multiple_choice
  respuesta_correcta TEXT NOT NULL,
  explicacion TEXT,
  dificultad INT DEFAULT 1 CHECK (dificultad BETWEEN 1 AND 3),
  ai_generated BOOLEAN DEFAULT false,
  orden INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Progreso del usuario
CREATE TABLE training.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id BIGINT REFERENCES wp_team_humano(id),
  lesson_id UUID REFERENCES training.lessons(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'in_progress', 'completed', 'failed'
  )),
  score INT,
  attempts INT DEFAULT 0,
  best_score INT,
  time_spent_sec INT,
  completed_at TIMESTAMPTZ,
  local_checkpoint JSONB, -- Para sincronizar localStorage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_member_id, lesson_id)
);

-- Índices
CREATE INDEX idx_courses_empresa ON training.courses(empresa_id);
CREATE INDEX idx_lessons_course ON training.lessons(course_id);
CREATE INDEX idx_questions_lesson ON training.questions(lesson_id);
CREATE INDEX idx_progress_member ON training.user_progress(team_member_id);
CREATE INDEX idx_progress_lesson ON training.user_progress(lesson_id);

-- RLS
ALTER TABLE training.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE training.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training.user_progress ENABLE ROW LEVEL SECURITY;
```

---

### Fase 2: Types TypeScript ⬜
**Archivo**: `training/types/training.ts`

```typescript
// Tipos de pregunta soportados
export type QuestionType = 
  | 'multiple_choice'  // 4 opciones, 1 correcta
  | 'true_false'       // Verdadero/Falso
  | 'order_steps'      // Ordenar secuencia
  | 'fill_blank'       // Completar oración
  | 'roleplay';        // Escenario conversacional

export type Difficulty = 'principiante' | 'intermedio' | 'avanzado';
export type LessonStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

export interface Course {
  id: string;
  empresa_id: number;
  titulo: string;
  descripcion?: string;
  categoria?: string;
  dificultad: Difficulty;
  duracion_estimada_min?: number;
  portada_url?: string;
  is_public: boolean;
  lessons_count?: number;
  progress_percent?: number;
}

export interface Lesson {
  id: string;
  course_id: string;
  orden: number;
  titulo: string;
  contenido_intro?: string;
  tiempo_estimado_seg: number;
  xp_reward: number;
  questions?: Question[];
}

export interface Question {
  id: string;
  lesson_id: string;
  tipo: QuestionType;
  pregunta: string;
  opciones?: string[];
  respuesta_correcta: string;
  explicacion?: string;
  dificultad: number;
  ai_generated: boolean;
  orden: number;
}

export interface UserProgress {
  id: string;
  team_member_id: number;
  lesson_id: string;
  status: LessonStatus;
  score?: number;
  attempts: number;
  best_score?: number;
  time_spent_sec?: number;
  completed_at?: string;
}

// Estado de sesión activa (localStorage)
export interface TrainingSession {
  lessonId: string;
  courseId: string;
  startedAt: string;
  currentQuestionIndex: number;
  answers: Record<string, string>;
  hearts: number;        // Vidas restantes (máx 5)
  xpEarned: number;      // XP acumulado en sesión
  streakBonus: boolean;  // Si mantiene racha
}
```

---

### Fase 3: Training Store ⬜
**Archivo**: `training/store/trainingStore.ts`

```typescript
interface TrainingState {
  // UI
  isOverlayOpen: boolean;
  
  // Data
  courses: Course[];
  activeLesson: Lesson | null;
  currentSession: TrainingSession | null;
  
  // Loading
  isLoading: boolean;
  error: string | null;
  
  // Actions
  openOverlay: () => void;
  closeOverlay: () => void;
  startLesson: (lessonId: string) => Promise<void>;
  submitAnswer: (questionId: string, answer: string) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  completeLesson: () => Promise<void>;
  syncProgress: () => Promise<void>;
  
  // Courses
  fetchCourses: (empresaId: number) => Promise<void>;
  fetchLesson: (lessonId: string) => Promise<void>;
}
```

**Características Clave**:
- `persist` middleware con `localStorage`
- Sincronización con Supabase al completar/pausar
- Integración con `gamificationStore.awardXP()`

---

### Fase 4: Focus Training Overlay ✅
**Archivo**: `components/FocusTrainingOverlay.tsx` (EXISTE - mover a `training/components/`)

**Estado**: Ya implementado con:
- Portal React a `document.body`
- z-index 9999 (máxima prioridad)
- Barra de progreso
- Indicadores de Corazones y XP
- Manejo de tecla ESC con confirmación
- Bloqueo de scroll del body

**Pendiente**: Mover a `training/components/`

---

### Fase 5: Lesson Player ⬜
**Archivo**: `training/components/LessonPlayer.tsx`

**Componentes**:
- `QuestionCard`: Renderiza pregunta según tipo
- `AnswerOptions`: Opciones clickeables
- `AnswerFeedback`: Animación correcto/incorrecto
- `ProgressFooter`: Botón "Verificar" / "Continuar"

**Estados Visuales**:
| Estado | Visual |
|--------|--------|
| Idle | Opciones neutras |
| Selected | Opción resaltada |
| Correct | Verde + confetti + XP animation |
| Incorrect | Rojo + shake + -1 corazón |
| Complete | Pantalla resumen + CTA continuar |

---

### Fase 6: Integración AdminNavBar ⬜
**Archivos**: 
- `store/adminStore.ts`: Agregar `'academy'` a `AdminView`
- `components/admin/AdminNavBar.tsx`: Agregar botón
- `components/admin/AdminPanel.tsx`: Agregar case para vista

```typescript
// adminStore.ts
export type AdminView = '...' | 'academy';

// AdminNavBar.tsx
{ id: 'academy', icon: GraduationCap, label: 'Academia' }
```

---

### Fase 7: API Generate Lesson ⬜
**Archivo**: `app/api/training/generate-lesson/route.ts`

```typescript
// POST /api/training/generate-lesson
{
  "courseId": "uuid",
  "topic": "Manejo de objeciones de precio",
  "context": {
    "productos": [...],     // Del CRM
    "objeciones_comunes": [...],
    "casos_exito": [...]
  },
  "questionCount": 5,
  "difficulty": "intermedio"
}

// Response
{
  "lesson": {
    "titulo": "Objeciones de Precio: Técnicas Avanzadas",
    "questions": [
      {
        "tipo": "multiple_choice",
        "pregunta": "Un cliente dice 'Es muy caro'. ¿Cuál es la mejor respuesta?",
        "opciones": [...],
        "respuesta_correcta": "B",
        "explicacion": "..."
      }
    ]
  }
}
```

---

### Fase 8: Documentación ⬜
**Archivo**: `training/README.md`

---

## ✅ Checklist de Implementación

### Fase 1: Base de Datos
- [ ] Crear `scripts/TRAINING_SCHEMA.sql`
- [ ] Ejecutar en Supabase SQL Editor
- [ ] Verificar tablas en schema `training`
- [ ] Configurar RLS policies

### Fase 2: Types
- [ ] Crear `training/types/training.ts`
- [ ] Exportar todos los tipos
- [ ] Agregar JSDoc comments

### Fase 3: Store
- [ ] Crear `training/store/trainingStore.ts`
- [ ] Implementar persistencia localStorage
- [ ] Conectar con `gamificationStore`
- [ ] Agregar selectors optimizados

### Fase 4: Overlay
- [ ] Mover `FocusTrainingOverlay.tsx` a `training/components/`
- [ ] Actualizar imports
- [ ] Verificar funcionamiento del Portal

### Fase 5: Lesson Player
- [ ] Crear `LessonPlayer.tsx`
- [ ] Crear `QuestionCard.tsx` (múltiple choice)
- [ ] Crear `AnswerFeedback.tsx`
- [ ] Implementar animaciones (confetti, shake)
- [ ] Agregar sonidos opcionales

### Fase 6: Integración UI
- [ ] Agregar `'academy'` a `AdminView` type
- [ ] Agregar botón en `AdminNavBar.tsx`
- [ ] Crear `AcademyView.tsx` (lista de cursos)
- [ ] Integrar en `AdminPanel.tsx`

### Fase 7: API
- [ ] Crear `app/api/training/generate-lesson/route.ts`
- [ ] Implementar prompt para Monica AI
- [ ] Agregar validación de entrada
- [ ] Manejar errores y rate limiting

### Fase 8: Testing
- [ ] Test de flujo completo (iniciar → completar lección)
- [ ] Test de persistencia (cerrar → reabrir)
- [ ] Test de sincronización Supabase
- [ ] Test responsive (móvil)

---

## 🎮 Mecánicas de Gamificación

### Sistema de Corazones (Vidas)
| Acción | Resultado |
|--------|-----------|
| Respuesta correcta | Mantiene corazones |
| Respuesta incorrecta | -1 corazón |
| 0 corazones | Lección fallida, esperar 5h o práctica extra |

### Sistema de XP
| Acción | XP |
|--------|-----|
| Pregunta correcta | +10 XP |
| Lección completada | +50 XP bonus |
| Sin errores (Perfect) | +25 XP bonus |
| Racha activa | x1.5 multiplicador |

### Integración con Gamification Store
```typescript
// Al completar lección
gamificationStore.awardXP(
  'lesson_complete', 
  totalXP, 
  { lessonId, courseId, perfect: noErrors }
);
```

---

## 📊 Métricas de Éxito

| Métrica | Objetivo | Medición |
|---------|----------|----------|
| Completion Rate | >70% | Lecciones completadas / iniciadas |
| Daily Active Users | +25% | Usuarios únicos con sesión/día |
| Knowledge Retention | >60% | Score promedio en re-tests |
| Time to Complete | <5 min | Duración promedio por lección |

---

## 🔗 Dependencias

| Módulo Externo | Uso |
|----------------|-----|
| `gamificationStore` | XP, badges, streaks |
| `authStore` | Usuario actual |
| `contactStore` | `selectedEnterpriseId` |
| Monica AI | Generación de contenido |

---

## 📝 Notas de Diseño

### Paleta de Colores
- **Fondo**: `#0a0a0c` (profundo)
- **Correcto**: `emerald-500`
- **Incorrecto**: `rose-500`
- **XP**: `amber-500`
- **Corazones**: `rose-500`
- **Progreso**: `primary-500` (cyan)

### Animaciones
- **Entrada pregunta**: `animate-in slide-in-from-bottom`
- **Correcto**: `confetti` + `scale-up`
- **Incorrecto**: `shake` + `flash-red`
- **Transición**: `fade-in duration-300`

---

## 🚀 Próximos Pasos

1. **Ejecutar Fase 1**: Crear y ejecutar SQL schema
2. **Implementar Types**: Definir interfaces base
3. **Crear Store**: Estado con persistencia
4. **Mover Overlay**: Reorganizar estructura
5. **Construir Player**: Motor de lecciones

¿Comenzamos con la **Fase 1 (Schema SQL)**?
