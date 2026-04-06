-- =====================================================
-- VERIFICACIÓN: ¿Se ejecutó TEAM_GROUPS_SCHEMA.sql?
-- =====================================================

-- 1. Verificar si la tabla team_groups existe
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE  table_schema = 'public'
   AND    table_name   = 'team_groups'
) AS table_exists;

-- 2. Verificar si el CHECK constraint fue eliminado
SELECT EXISTS (
   SELECT FROM information_schema.check_constraints cc
   JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
   WHERE tc.table_name = 'wp_team_humano'
   AND cc.constraint_name = 'wp_team_humano_rol_check'
) AS check_constraint_exists;

-- 3. Verificar si las políticas RLS existen
SELECT policyname, tablename 
FROM pg_policies 
WHERE tablename = 'team_groups'
ORDER BY policyname;

-- 4. Verificar si el trigger existe
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trg_seed_team_groups'
AND event_object_table = 'wp_empresa_perfil';

-- 5. Verificar si hay grupos creados (conteo por empresa)
SELECT 
  empresa_id,
  COUNT(*) as total_groups,
  STRING_AGG(name, ', ' ORDER BY sort_order) as groups
FROM team_groups
GROUP BY empresa_id
ORDER BY empresa_id;

-- 6. Verificar grupos base esperados
SELECT 
  empresa_id,
  COUNT(*) FILTER (WHERE slug IN ('asesor','marketing','supervisor','rrhh','administrativo','operaciones')) as base_groups_count,
  COUNT(*) FILTER (WHERE slug NOT IN ('asesor','marketing','supervisor','rrhh','administrativo','operaciones')) as custom_groups_count
FROM team_groups
GROUP BY empresa_id
ORDER BY empresa_id;
