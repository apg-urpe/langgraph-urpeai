-- ============================================================================
-- GAMIFICATION SCHEMA V2 - MINIMALISTA
-- Solo tablas de datos. Config en TypeScript (types/gamification.ts)
-- ============================================================================

-- Limpiar versión anterior si existe
DROP SCHEMA IF EXISTS gamification CASCADE;
CREATE SCHEMA gamification;

-- ============================================================================
-- TABLAS DE DATOS (solo lo esencial)
-- ============================================================================

-- 1. Perfiles de usuario
CREATE TABLE gamification.profiles (
  team_member_id BIGINT PRIMARY KEY REFERENCES public.wp_team_humano(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL,
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Log de XP (auditoría)
CREATE TABLE gamification.xp_transactions (
  id BIGSERIAL PRIMARY KEY,
  team_member_id BIGINT NOT NULL REFERENCES public.wp_team_humano(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  xp_amount INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Medallas ganadas
CREATE TABLE gamification.user_badges (
  id BIGSERIAL PRIMARY KEY,
  team_member_id BIGINT NOT NULL REFERENCES public.wp_team_humano(id) ON DELETE CASCADE,
  badge_id VARCHAR(50) NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_member_id, badge_id)
);

-- 4. Misiones diarias
CREATE TABLE gamification.daily_missions (
  id BIGSERIAL PRIMARY KEY,
  team_member_id BIGINT NOT NULL REFERENCES public.wp_team_humano(id) ON DELETE CASCADE,
  mission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mission_type VARCHAR(30) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  target_value INTEGER NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'claimed')),
  completed_at TIMESTAMPTZ,
  UNIQUE(team_member_id, mission_date, mission_type)
);

-- Índices esenciales
CREATE INDEX idx_gam_prof_empresa ON gamification.profiles(empresa_id);
CREATE INDEX idx_gam_xp_member ON gamification.xp_transactions(team_member_id);
CREATE INDEX idx_gam_missions_date ON gamification.daily_missions(team_member_id, mission_date);

-- ============================================================================
-- FUNCIONES RPC (mínimas y atómicas)
-- ============================================================================

-- Otorgar XP (compatible con store)
CREATE OR REPLACE FUNCTION gamification.award_xp(
  p_team_member_id BIGINT,
  p_action_type VARCHAR(50),
  p_xp_amount INTEGER,
  p_description TEXT DEFAULT '',
  p_related_entity_type VARCHAR(50) DEFAULT NULL,
  p_related_entity_id BIGINT DEFAULT NULL
)
RETURNS TABLE(new_total_xp INTEGER, new_level INTEGER, leveled_up BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_xp INTEGER;
  v_new_xp INTEGER;
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_empresa_id BIGINT;
BEGIN
  -- Obtener empresa
  SELECT empresa_id INTO v_empresa_id FROM public.wp_team_humano WHERE id = p_team_member_id;
  
  -- Upsert perfil
  INSERT INTO gamification.profiles (team_member_id, empresa_id, total_xp)
  VALUES (p_team_member_id, v_empresa_id, 0)
  ON CONFLICT (team_member_id) DO NOTHING;
  
  SELECT total_xp INTO v_old_xp FROM gamification.profiles WHERE team_member_id = p_team_member_id FOR UPDATE;
  v_new_xp := v_old_xp + p_xp_amount;
  
  -- Calcular niveles
  v_old_level := CASE WHEN v_old_xp >= 1500 THEN 6 WHEN v_old_xp >= 1000 THEN 5 WHEN v_old_xp >= 600 THEN 4 WHEN v_old_xp >= 300 THEN 3 WHEN v_old_xp >= 100 THEN 2 ELSE 1 END;
  v_new_level := CASE WHEN v_new_xp >= 1500 THEN 6 WHEN v_new_xp >= 1000 THEN 5 WHEN v_new_xp >= 600 THEN 4 WHEN v_new_xp >= 300 THEN 3 WHEN v_new_xp >= 100 THEN 2 ELSE 1 END;
  
  -- Actualizar
  UPDATE gamification.profiles 
  SET total_xp = v_new_xp, last_activity_date = CURRENT_DATE, updated_at = NOW()
  WHERE team_member_id = p_team_member_id;
  
  -- Log
  INSERT INTO gamification.xp_transactions (team_member_id, action_type, xp_amount, description)
  VALUES (p_team_member_id, p_action_type, p_xp_amount, p_description);
  
  -- Retornar
  new_total_xp := v_new_xp;
  new_level := v_new_level;
  leveled_up := v_new_level > v_old_level;
  RETURN NEXT;
END;
$$;

-- Actualizar racha (compatible con store)
CREATE OR REPLACE FUNCTION gamification.update_streak(p_team_member_id BIGINT)
RETURNS TABLE(current_streak INTEGER, streak_broken BOOLEAN, milestone_reached INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last DATE;
  v_streak INTEGER;
  v_longest INTEGER;
  v_empresa_id BIGINT;
  v_was_broken BOOLEAN := FALSE;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.wp_team_humano WHERE id = p_team_member_id;
  
  -- Upsert
  INSERT INTO gamification.profiles (team_member_id, empresa_id)
  VALUES (p_team_member_id, v_empresa_id)
  ON CONFLICT (team_member_id) DO NOTHING;
  
  SELECT last_activity_date, gamification.profiles.current_streak, longest_streak 
  INTO v_last, v_streak, v_longest
  FROM gamification.profiles WHERE team_member_id = p_team_member_id FOR UPDATE;
  
  -- Calcular nueva racha
  IF v_last = CURRENT_DATE THEN
    current_streak := v_streak;
  ELSIF v_last = CURRENT_DATE - 1 THEN
    current_streak := v_streak + 1;
  ELSE
    current_streak := 1;
    v_was_broken := v_streak > 0;
  END IF;
  
  -- Milestone check (7, 14, 30, 60, 90)
  milestone_reached := CASE 
    WHEN current_streak IN (7, 14, 30, 60, 90) AND current_streak > v_streak THEN current_streak 
    ELSE NULL 
  END;
  
  -- Update
  UPDATE gamification.profiles SET
    current_streak = update_streak.current_streak,
    longest_streak = GREATEST(v_longest, update_streak.current_streak),
    last_activity_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE team_member_id = p_team_member_id;
  
  streak_broken := v_was_broken;
  RETURN NEXT;
END;
$$;

-- Generar misiones diarias (con manejo de race condition)
CREATE OR REPLACE FUNCTION gamification.generate_daily_missions(p_team_member_id BIGINT)
RETURNS SETOF gamification.daily_missions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
  v_types TEXT[] := ARRAY['messages', 'tasks', 'appointments'];
  v_titles TEXT[] := ARRAY['Comunicador', 'Productivo', 'Agendador'];
  v_descs TEXT[] := ARRAY['Envía mensajes', 'Completa tareas', 'Gestiona citas'];
  v_targets INTEGER[] := ARRAY[10, 3, 2];
  v_xps INTEGER[] := ARRAY[15, 25, 30];
  i INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM gamification.daily_missions 
  WHERE team_member_id = p_team_member_id AND mission_date = CURRENT_DATE;
  
  IF v_count = 0 THEN
    FOR i IN 1..3 LOOP
      INSERT INTO gamification.daily_missions 
        (team_member_id, mission_type, title, description, target_value, xp_reward)
      VALUES 
        (p_team_member_id, v_types[i], v_titles[i], v_descs[i], v_targets[i], v_xps[i])
      ON CONFLICT (team_member_id, mission_date, mission_type) DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN QUERY SELECT * FROM gamification.daily_missions 
  WHERE team_member_id = p_team_member_id AND mission_date = CURRENT_DATE;
END;
$$;

-- ============================================================================
-- VISTA PARA LEADERBOARD (compatible con store)
-- ============================================================================

CREATE OR REPLACE VIEW gamification.leaderboard_weekly AS
SELECT 
  p.team_member_id,
  p.empresa_id,
  t.nombre,
  t.apellido,
  p.total_xp,
  CASE 
    WHEN p.total_xp >= 1500 THEN 6
    WHEN p.total_xp >= 1000 THEN 5
    WHEN p.total_xp >= 600 THEN 4
    WHEN p.total_xp >= 300 THEN 3
    WHEN p.total_xp >= 100 THEN 2
    ELSE 1
  END as current_level,
  p.current_streak,
  COALESCE((
    SELECT SUM(xp_amount) FROM gamification.xp_transactions x 
    WHERE x.team_member_id = p.team_member_id 
    AND x.created_at >= date_trunc('week', CURRENT_DATE)
  ), 0) as xp_this_week,
  (SELECT COUNT(*) FROM gamification.user_badges b WHERE b.team_member_id = p.team_member_id) as badge_count,
  RANK() OVER (ORDER BY p.total_xp DESC) as rank_total,
  RANK() OVER (ORDER BY COALESCE((
    SELECT SUM(xp_amount) FROM gamification.xp_transactions x 
    WHERE x.team_member_id = p.team_member_id 
    AND x.created_at >= date_trunc('week', CURRENT_DATE)
  ), 0) DESC) as rank_weekly
FROM gamification.profiles p
JOIN public.wp_team_humano t ON t.id = p.team_member_id AND t.is_active = true;

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT USAGE ON SCHEMA gamification TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA gamification TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA gamification TO authenticated;

-- ============================================================================
-- ✅ VERIFICACIÓN
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🎮 GAMIFICATION V2 DEPLOYED!';
  RAISE NOTICE '   - 4 tablas de datos';
  RAISE NOTICE '   - 3 funciones RPC';
  RAISE NOTICE '   - 1 vista de leaderboard';
  RAISE NOTICE '';
  RAISE NOTICE 'Test: SELECT gamification.award_xp(<team_member_id>, ''test'', 10, ''Test XP'');';
END $$;
