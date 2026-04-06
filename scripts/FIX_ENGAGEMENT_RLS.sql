-- ============================================================================
-- FIX: Limpieza de políticas RLS duplicadas/inseguras para engagement
-- Problema: Políticas duplicadas y con rol {public} (inseguro)
-- Fecha: 2026-02-13
-- ============================================================================

-- ============================================================
-- PASO 1: Eliminar TODAS las políticas existentes (limpieza total)
-- ============================================================

-- wp_user_engagement: eliminar las 5 políticas actuales
DROP POLICY IF EXISTS "Users can view own engagement" ON wp_user_engagement;
DROP POLICY IF EXISTS "Users can insert own engagement" ON wp_user_engagement;
DROP POLICY IF EXISTS "engagement_insert" ON wp_user_engagement;
DROP POLICY IF EXISTS "engagement_insert_own" ON wp_user_engagement;
DROP POLICY IF EXISTS "engagement_select" ON wp_user_engagement;

-- wp_user_engagement_daily: eliminar las 4 políticas actuales
DROP POLICY IF EXISTS "Users can view own daily summary" ON wp_user_engagement_daily;
DROP POLICY IF EXISTS "daily_insert" ON wp_user_engagement_daily;
DROP POLICY IF EXISTS "daily_select" ON wp_user_engagement_daily;
DROP POLICY IF EXISTS "daily_update" ON wp_user_engagement_daily;

-- ============================================================
-- PASO 2: Asegurar que RLS está habilitado
-- ============================================================
ALTER TABLE wp_user_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_user_engagement_daily ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PASO 3: Crear políticas limpias (solo rol authenticated)
-- ============================================================

-- wp_user_engagement: SELECT + INSERT
CREATE POLICY "engagement_select" ON wp_user_engagement
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "engagement_insert" ON wp_user_engagement
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- wp_user_engagement_daily: SELECT + INSERT + UPDATE
CREATE POLICY "daily_select" ON wp_user_engagement_daily
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "daily_insert" ON wp_user_engagement_daily
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "daily_update" ON wp_user_engagement_daily
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- PASO 4: Verificar resultado (debe mostrar exactamente 5 políticas)
-- ============================================================
SELECT 
    tablename,
    policyname,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('wp_user_engagement', 'wp_user_engagement_daily')
ORDER BY tablename, policyname;
