-- ============================================================================
-- URPE ACADEMY - Training System Schema
-- Sistema de Capacitación Gamificado para Equipos Comerciales
-- ============================================================================
-- Ejecutar en Supabase SQL Editor
-- Fecha: Enero 2025
-- ============================================================================

-- ============================================================================
-- 1. TABLAS PRINCIPALES
-- ============================================================================

-- Cursos de capacitación por empresa
CREATE TABLE IF NOT EXISTS training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  
  -- Metadata del curso
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(100),
  dificultad VARCHAR(20) DEFAULT 'intermedio' CHECK (dificultad IN ('principiante', 'intermedio', 'avanzado')),
  
  -- Configuración
  duracion_estimada_min INT DEFAULT 15,
  portada_url TEXT,
  color_tema VARCHAR(7) DEFAULT '#6366f1', -- Color hex para UI
  
  -- Estado
  is_public BOOLEAN DEFAULT false,  -- Visible para otras empresas
  is_active BOOLEAN DEFAULT true,
  orden INT DEFAULT 0,
  
  -- Auditoría
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE training_courses IS 'Cursos de capacitación creados por cada empresa';
COMMENT ON COLUMN training_courses.is_public IS 'Si true, otras empresas pueden ver/usar el curso';

-- Lecciones (módulos dentro de un curso)
CREATE TABLE IF NOT EXISTS training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  
  -- Contenido
  orden INT NOT NULL DEFAULT 0,
  titulo VARCHAR(200) NOT NULL,
  contenido_intro TEXT,           -- Texto introductorio antes de preguntas
  imagen_url TEXT,                -- Imagen opcional de la lección
  
  -- Configuración de juego
  tiempo_estimado_seg INT DEFAULT 180,  -- 3 minutos por defecto
  xp_reward INT DEFAULT 10,             -- XP base por completar
  xp_perfect_bonus INT DEFAULT 25,      -- Bonus si no hay errores
  max_hearts INT DEFAULT 5,             -- Vidas máximas
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE training_lessons IS 'Lecciones individuales dentro de un curso';

-- Preguntas (generadas por IA o manuales)
CREATE TABLE IF NOT EXISTS training_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  
  -- Tipo de pregunta
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
    'multiple_choice',   -- 4 opciones, 1 correcta
    'true_false',        -- Verdadero/Falso
    'order_steps',       -- Ordenar secuencia correcta
    'fill_blank',        -- Completar oración
    'roleplay'           -- Escenario conversacional (futuro)
  )),
  
  -- Contenido
  pregunta TEXT NOT NULL,
  opciones JSONB,                    -- Array de opciones para multiple_choice
  respuesta_correcta TEXT NOT NULL,  -- Índice o valor correcto
  explicacion TEXT,                  -- Feedback al responder
  hint TEXT,                         -- Pista opcional
  
  -- Metadata
  dificultad INT DEFAULT 1 CHECK (dificultad BETWEEN 1 AND 3),
  ai_generated BOOLEAN DEFAULT false,
  ai_context JSONB,                  -- Contexto usado para generar (productos, etc)
  orden INT DEFAULT 0,
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE training_questions IS 'Preguntas de cada lección, pueden ser generadas por IA';
COMMENT ON COLUMN training_questions.opciones IS 'Array JSON: ["Opción A", "Opción B", "Opción C", "Opción D"]';
COMMENT ON COLUMN training_questions.respuesta_correcta IS 'Índice (0-3) o valor textual de la respuesta correcta';

-- Progreso del usuario
CREATE TABLE IF NOT EXISTS training_user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id BIGINT NOT NULL REFERENCES wp_team_humano(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  
  -- Estado
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN (
    'not_started',
    'in_progress',
    'completed',
    'failed'
  )),
  
  -- Métricas
  score INT,                          -- Puntuación final (0-100)
  attempts INT DEFAULT 0,             -- Número de intentos
  best_score INT,                     -- Mejor puntuación histórica
  time_spent_sec INT DEFAULT 0,       -- Tiempo total invertido
  questions_correct INT DEFAULT 0,    -- Preguntas correctas en último intento
  questions_total INT DEFAULT 0,      -- Total de preguntas
  
  -- Sesión activa (para sincronizar con localStorage)
  local_checkpoint JSONB,             -- Estado guardado localmente
  last_sync_at TIMESTAMPTZ,           -- Última sincronización
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint único: un usuario solo tiene un registro por lección
  UNIQUE(team_member_id, lesson_id)
);

COMMENT ON TABLE training_user_progress IS 'Progreso de cada usuario en cada lección';
COMMENT ON COLUMN training_user_progress.local_checkpoint IS 'JSON con estado de sesión para recuperar si se cierra el navegador';

-- Tabla de streaks de entrenamiento (rachas diarias)
CREATE TABLE IF NOT EXISTS training_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id BIGINT NOT NULL REFERENCES wp_team_humano(id) ON DELETE CASCADE,
  
  -- Racha actual
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  
  -- Tracking diario
  last_activity_date DATE,
  streak_frozen_until DATE,           -- Si usó "Streak Freeze"
  freeze_count_used INT DEFAULT 0,    -- Freezes usados este mes
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(team_member_id)
);

COMMENT ON TABLE training_streaks IS 'Rachas de entrenamiento diario por usuario';

-- ============================================================================
-- 2. ÍNDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_training_courses_empresa 
  ON training_courses(empresa_id);

CREATE INDEX IF NOT EXISTS idx_training_courses_active 
  ON training_courses(empresa_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_training_lessons_course 
  ON training_lessons(course_id, orden);

CREATE INDEX IF NOT EXISTS idx_training_questions_lesson 
  ON training_questions(lesson_id, orden);

CREATE INDEX IF NOT EXISTS idx_training_progress_member 
  ON training_user_progress(team_member_id);

CREATE INDEX IF NOT EXISTS idx_training_progress_lesson 
  ON training_user_progress(lesson_id);

CREATE INDEX IF NOT EXISTS idx_training_progress_status 
  ON training_user_progress(team_member_id, status);

CREATE INDEX IF NOT EXISTS idx_training_streaks_member 
  ON training_streaks(team_member_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_streaks ENABLE ROW LEVEL SECURITY;

-- Políticas para COURSES
DROP POLICY IF EXISTS "Users can view courses from their empresa or public courses" ON training_courses;
CREATE POLICY "Users can view courses from their empresa or public courses"
  ON training_courses FOR SELECT
  USING (
    is_public = true
    OR empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage courses from their empresa" ON training_courses;
CREATE POLICY "Admins can manage courses from their empresa"
  ON training_courses FOR ALL
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

-- Políticas para LESSONS (heredan acceso del curso)
DROP POLICY IF EXISTS "Users can view lessons from accessible courses" ON training_lessons;
CREATE POLICY "Users can view lessons from accessible courses"
  ON training_lessons FOR SELECT
  USING (
    course_id IN (
      SELECT id FROM training_courses 
      WHERE is_public = true
      OR empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins can manage lessons" ON training_lessons;
CREATE POLICY "Admins can manage lessons"
  ON training_lessons FOR ALL
  USING (
    course_id IN (
      SELECT c.id FROM training_courses c
      JOIN wp_team_humano t ON c.empresa_id = t.empresa_id
      WHERE t.auth_uid = auth.uid() AND t.role_id IN (1, 2)
    )
  );

-- Políticas para QUESTIONS (heredan acceso de la lección)
DROP POLICY IF EXISTS "Users can view questions from accessible lessons" ON training_questions;
CREATE POLICY "Users can view questions from accessible lessons"
  ON training_questions FOR SELECT
  USING (
    lesson_id IN (
      SELECT l.id FROM training_lessons l
      JOIN training_courses c ON l.course_id = c.id
      WHERE c.is_public = true
      OR c.empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins can manage questions" ON training_questions;
CREATE POLICY "Admins can manage questions"
  ON training_questions FOR ALL
  USING (
    lesson_id IN (
      SELECT l.id FROM training_lessons l
      JOIN training_courses c ON l.course_id = c.id
      JOIN wp_team_humano t ON c.empresa_id = t.empresa_id
      WHERE t.auth_uid = auth.uid() AND t.role_id IN (1, 2)
    )
  );

-- Políticas para PROGRESS (solo el propio usuario)
DROP POLICY IF EXISTS "Users can view their own progress" ON training_user_progress;
CREATE POLICY "Users can view their own progress"
  ON training_user_progress FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own progress" ON training_user_progress;
CREATE POLICY "Users can update their own progress"
  ON training_user_progress FOR INSERT
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can modify their own progress" ON training_user_progress;
CREATE POLICY "Users can modify their own progress"
  ON training_user_progress FOR UPDATE
  USING (
    team_member_id IN (
      SELECT id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

-- Políticas para STREAKS (solo el propio usuario)
DROP POLICY IF EXISTS "Users can view their own streaks" ON training_streaks;
CREATE POLICY "Users can view their own streaks"
  ON training_streaks FOR SELECT
  USING (
    team_member_id IN (
      SELECT id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their own streaks" ON training_streaks;
CREATE POLICY "Users can manage their own streaks"
  ON training_streaks FOR ALL
  USING (
    team_member_id IN (
      SELECT id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

-- ============================================================================
-- 4. FUNCIONES Y TRIGGERS
-- ============================================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION training_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
DROP TRIGGER IF EXISTS trg_training_courses_updated ON training_courses;
CREATE TRIGGER trg_training_courses_updated
  BEFORE UPDATE ON training_courses
  FOR EACH ROW EXECUTE FUNCTION training_update_timestamp();

DROP TRIGGER IF EXISTS trg_training_lessons_updated ON training_lessons;
CREATE TRIGGER trg_training_lessons_updated
  BEFORE UPDATE ON training_lessons
  FOR EACH ROW EXECUTE FUNCTION training_update_timestamp();

DROP TRIGGER IF EXISTS trg_training_progress_updated ON training_user_progress;
CREATE TRIGGER trg_training_progress_updated
  BEFORE UPDATE ON training_user_progress
  FOR EACH ROW EXECUTE FUNCTION training_update_timestamp();

DROP TRIGGER IF EXISTS trg_training_streaks_updated ON training_streaks;
CREATE TRIGGER trg_training_streaks_updated
  BEFORE UPDATE ON training_streaks
  FOR EACH ROW EXECUTE FUNCTION training_update_timestamp();

-- Función para actualizar racha al completar lección
CREATE OR REPLACE FUNCTION training_update_streak(p_team_member_id BIGINT)
RETURNS void AS $$
DECLARE
  v_last_date DATE;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Obtener última fecha de actividad
  SELECT last_activity_date INTO v_last_date
  FROM training_streaks
  WHERE team_member_id = p_team_member_id;
  
  -- Si no existe registro, crear uno
  IF NOT FOUND THEN
    INSERT INTO training_streaks (team_member_id, current_streak, longest_streak, last_activity_date)
    VALUES (p_team_member_id, 1, 1, v_today);
    RETURN;
  END IF;
  
  -- Actualizar racha según la fecha
  IF v_last_date = v_today THEN
    -- Ya entrenó hoy, no hacer nada
    RETURN;
  ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
    -- Día consecutivo, incrementar racha
    UPDATE training_streaks
    SET 
      current_streak = current_streak + 1,
      longest_streak = GREATEST(longest_streak, current_streak + 1),
      last_activity_date = v_today
    WHERE team_member_id = p_team_member_id;
  ELSE
    -- Se rompió la racha, reiniciar
    UPDATE training_streaks
    SET 
      current_streak = 1,
      last_activity_date = v_today
    WHERE team_member_id = p_team_member_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. VISTAS ÚTILES
-- ============================================================================

-- Vista de cursos con estadísticas
CREATE OR REPLACE VIEW vw_training_courses_stats AS
SELECT 
  c.id,
  c.empresa_id,
  c.titulo,
  c.descripcion,
  c.categoria,
  c.dificultad,
  c.duracion_estimada_min,
  c.portada_url,
  c.color_tema,
  c.is_public,
  c.is_active,
  c.orden,
  c.created_at,
  COUNT(DISTINCT l.id) AS lessons_count,
  COUNT(DISTINCT q.id) AS questions_count,
  COALESCE(SUM(l.xp_reward), 0) AS total_xp
FROM training_courses c
LEFT JOIN training_lessons l ON c.id = l.course_id AND l.is_active = true
LEFT JOIN training_questions q ON l.id = q.lesson_id AND q.is_active = true
GROUP BY c.id;

-- Vista de progreso del usuario con info del curso
CREATE OR REPLACE VIEW vw_training_user_dashboard AS
SELECT 
  p.team_member_id,
  c.id AS course_id,
  c.titulo AS course_titulo,
  c.categoria,
  c.color_tema,
  COUNT(l.id) AS total_lessons,
  COUNT(CASE WHEN p.status = 'completed' THEN 1 END) AS completed_lessons,
  ROUND(
    COUNT(CASE WHEN p.status = 'completed' THEN 1 END)::NUMERIC / 
    NULLIF(COUNT(l.id), 0) * 100, 
    0
  ) AS progress_percent,
  SUM(COALESCE(p.best_score, 0)) AS total_score,
  MAX(p.completed_at) AS last_activity
FROM training_courses c
JOIN training_lessons l ON c.id = l.course_id AND l.is_active = true
LEFT JOIN training_user_progress p ON l.id = p.lesson_id
WHERE c.is_active = true
GROUP BY p.team_member_id, c.id, c.titulo, c.categoria, c.color_tema;

-- ============================================================================
-- 6. DATOS INICIALES (Curso de Ejemplo)
-- ============================================================================

-- Nota: Descomentar y ajustar empresa_id según necesidad

/*
-- Insertar curso de ejemplo
INSERT INTO training_courses (empresa_id, titulo, descripcion, categoria, dificultad, duracion_estimada_min)
VALUES (
  1,  -- Ajustar al empresa_id real
  'Introducción a Urpe Academy',
  'Aprende cómo funciona el sistema de capacitación gamificado',
  'Onboarding',
  'principiante',
  5
)
RETURNING id;

-- Insertar lección de ejemplo (usar el ID retornado arriba)
INSERT INTO training_lessons (course_id, orden, titulo, contenido_intro, xp_reward)
VALUES (
  'UUID_DEL_CURSO',  -- Reemplazar con UUID real
  1,
  '¿Cómo funciona Urpe Academy?',
  'En esta lección aprenderás las mecánicas básicas del sistema de capacitación.',
  15
)
RETURNING id;

-- Insertar preguntas de ejemplo (usar el ID de lección)
INSERT INTO training_questions (lesson_id, tipo, pregunta, opciones, respuesta_correcta, explicacion, orden)
VALUES 
  (
    'UUID_DE_LECCION',  -- Reemplazar con UUID real
    'multiple_choice',
    '¿Qué pasa cuando contestas incorrectamente?',
    '["Ganas XP extra", "Pierdes un corazón", "Nada", "Se reinicia la lección"]',
    '1',
    '¡Correcto! Cada error te cuesta un corazón. Si pierdes todos, debes esperar o practicar.',
    1
  ),
  (
    'UUID_DE_LECCION',
    'true_false',
    'Las rachas (streaks) se mantienen si entrenas todos los días.',
    '["Verdadero", "Falso"]',
    '0',
    'Las rachas son una forma de motivarte a mantener el hábito de aprendizaje diario.',
    2
  );
*/

-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================

-- Para verificar la instalación, ejecutar:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'training_%';
