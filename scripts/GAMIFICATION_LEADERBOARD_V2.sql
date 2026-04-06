-- ============================================================================
-- GAMIFICATION LEADERBOARD V2
-- Mejoras: XP mensual, rankings por empresa, mejor performance
-- ============================================================================

-- Eliminar vista anterior
DROP VIEW IF EXISTS gamification.leaderboard_weekly;

-- ============================================================================
-- VISTA MEJORADA PARA LEADERBOARD
-- Incluye XP semanal, mensual y rankings por empresa
-- ============================================================================

CREATE OR REPLACE VIEW gamification.leaderboard_weekly AS
SELECT 
  p.team_member_id,
  p.empresa_id,
  t.nombre,
  t.apellido,
  p.total_xp,
  -- Calcular nivel dinámicamente
  CASE 
    WHEN p.total_xp >= 1500 THEN 6
    WHEN p.total_xp >= 1000 THEN 5
    WHEN p.total_xp >= 600 THEN 4
    WHEN p.total_xp >= 300 THEN 3
    WHEN p.total_xp >= 100 THEN 2
    ELSE 1
  END as current_level,
  p.current_streak,
  -- XP de esta semana
  COALESCE((
    SELECT SUM(xp_amount) FROM gamification.xp_transactions x 
    WHERE x.team_member_id = p.team_member_id 
    AND x.created_at >= date_trunc('week', CURRENT_DATE)
  ), 0)::INTEGER as xp_this_week,
  -- XP de este mes
  COALESCE((
    SELECT SUM(xp_amount) FROM gamification.xp_transactions x 
    WHERE x.team_member_id = p.team_member_id 
    AND x.created_at >= date_trunc('month', CURRENT_DATE)
  ), 0)::INTEGER as xp_this_month,
  -- Conteo de medallas
  (SELECT COUNT(*) FROM gamification.user_badges b WHERE b.team_member_id = p.team_member_id)::INTEGER as badge_count,
  -- Ranking total (global por empresa)
  RANK() OVER (PARTITION BY p.empresa_id ORDER BY p.total_xp DESC)::INTEGER as rank_total,
  -- Ranking semanal (por empresa)
  RANK() OVER (PARTITION BY p.empresa_id ORDER BY COALESCE((
    SELECT SUM(xp_amount) FROM gamification.xp_transactions x 
    WHERE x.team_member_id = p.team_member_id 
    AND x.created_at >= date_trunc('week', CURRENT_DATE)
  ), 0) DESC)::INTEGER as rank_weekly,
  -- Ranking mensual (por empresa)
  RANK() OVER (PARTITION BY p.empresa_id ORDER BY COALESCE((
    SELECT SUM(xp_amount) FROM gamification.xp_transactions x 
    WHERE x.team_member_id = p.team_member_id 
    AND x.created_at >= date_trunc('month', CURRENT_DATE)
  ), 0) DESC)::INTEGER as rank_monthly
FROM gamification.profiles p
JOIN public.wp_team_humano t ON t.id = p.team_member_id AND t.is_active = true;

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================

-- Índice en xp_transactions para queries de período
CREATE INDEX IF NOT EXISTS idx_xp_transactions_member_date 
ON gamification.xp_transactions(team_member_id, created_at DESC);

-- Índice en profiles para empresa
CREATE INDEX IF NOT EXISTS idx_gamification_profiles_empresa 
ON gamification.profiles(empresa_id);

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT ON gamification.leaderboard_weekly TO authenticated;

-- ============================================================================
-- ✅ VERIFICACIÓN
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🏆 LEADERBOARD V2 DEPLOYED!';
  RAISE NOTICE '   - Rankings por empresa (PARTITION BY empresa_id)';
  RAISE NOTICE '   - XP semanal y mensual';
  RAISE NOTICE '   - Índices de performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Test: SELECT * FROM gamification.leaderboard_weekly WHERE empresa_id = 4 ORDER BY rank_weekly;';
END $$;
