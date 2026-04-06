-- ============================================================================
-- DIAGNÓSTICO: wp_empresa_embudo - Problemas de guardado
-- Fecha: 2026-01-21
-- ============================================================================
-- INSTRUCCIONES: Ejecutar cada sección en Supabase SQL Editor
-- y pegar los resultados en el chat para análisis
-- ============================================================================

-- 1. ESTRUCTURA DE LA TABLA (columnas y tipos)
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'wp_empresa_embudo'
ORDER BY ordinal_position;

-- 2. CONSTRAINTS (UNIQUE, FK, PK)
SELECT 
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu 
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'wp_empresa_embudo';

-- 3. ÍNDICES
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'wp_empresa_embudo';

-- 4. POLÍTICAS RLS
SELECT 
  policyname,
  cmd AS operation,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'wp_empresa_embudo';

-- 5. RLS HABILITADO?
SELECT 
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'wp_empresa_embudo';

-- 6. TRIGGERS
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'wp_empresa_embudo';

-- 7. TEST: Verificar que puedes leer etapas (reemplaza empresa_id)
SELECT id, nombre_etapa, orden_etapa, empresa_id 
FROM wp_empresa_embudo 
WHERE empresa_id = 4  -- <-- CAMBIAR por tu empresa_id
ORDER BY orden_etapa
LIMIT 5;

-- 8. TEST: Intentar update directo SIN fecha_actualizacion (campo que puede no existir)
-- Descomenta y ejecuta SOLO si quieres probar:
/*
UPDATE wp_empresa_embudo 
SET nombre_etapa = nombre_etapa  -- No-op update para probar permisos
WHERE id = 236 AND empresa_id = 4  -- <-- CAMBIAR por un id/empresa_id válido
RETURNING id, nombre_etapa;
*/

-- Si el UPDATE falla, el error te dirá exactamente qué está bloqueando

-- ============================================================================
-- 9. VERIFICAR SI RLS ESTÁ BLOQUEANDO (EJECUTAR ESTO PRIMERO)
-- ============================================================================

-- 9.1 Ver si RLS está habilitado y si hay políticas
SELECT 
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'wp_empresa_embudo') AS policy_count
FROM pg_class c
WHERE c.relname = 'wp_empresa_embudo';

-- 9.2 LISTAR POLÍTICAS EXISTENTES (PARA ANALIZAR BLOQUEOS)
SELECT 
  policyname,
  cmd AS operation,
  roles,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'wp_empresa_embudo';

-- 9.3 Si policy_count = 0 y rls_enabled = true, ESTE ES EL PROBLEMA
-- La solución es crear una política o deshabilitar RLS temporalmente

-- ============================================================================
-- 10. FIX TEMPORAL: Deshabilitar RLS para wp_empresa_embudo (EJECUTAR SI 9.1 muestra el problema)
-- ============================================================================
-- ADVERTENCIA: Solo ejecutar si estás seguro
-- ALTER TABLE wp_empresa_embudo DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 11. FIX DEFINITIVO: Corregir políticas RLS (Referencia incorrecta a system_users)
-- ============================================================================
-- El diagnóstico mostró que las políticas usan 'system_users', que no parece existir 
-- o no es la tabla principal de miembros. Usaremos 'wp_team_humano'.

/*
-- 11.1 Eliminar políticas problemáticas (antiguas y nuevas si ya existen)
DROP POLICY IF EXISTS "embudo_empresa_insert_authenticated" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_empresa_update_authenticated" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_empresa_policy" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_empresa_select_all" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_select_policy" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_update_policy" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_insert_policy" ON wp_empresa_embudo;
DROP POLICY IF EXISTS "embudo_delete_policy" ON wp_empresa_embudo;

-- 11.2 Crear nuevas políticas robustas (versión corregida)
-- SELECT: Todos los autenticados pueden ver (necesario para la UI)
CREATE POLICY "embudo_select_policy" ON wp_empresa_embudo
FOR SELECT TO authenticated
USING (true);

-- UPDATE: Solo admins (1, 2) de la misma empresa
CREATE POLICY "embudo_update_policy" ON wp_empresa_embudo
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM wp_team_humano
    WHERE auth_uid = auth.uid()
    AND (empresa_id = wp_empresa_embudo.empresa_id OR role_id = 1)
    AND role_id IN (1, 2)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM wp_team_humano
    WHERE auth_uid = auth.uid()
    AND (empresa_id = wp_empresa_embudo.empresa_id OR role_id = 1)
    AND role_id IN (1, 2)
  )
);

-- INSERT: Solo admins
CREATE POLICY "embudo_insert_policy" ON wp_empresa_embudo
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM wp_team_humano
    WHERE auth_uid = auth.uid()
    AND (empresa_id = wp_empresa_embudo.empresa_id OR role_id = 1)
    AND role_id IN (1, 2)
  )
);

-- DELETE: Solo admins
CREATE POLICY "embudo_delete_policy" ON wp_empresa_embudo
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM wp_team_humano
    WHERE auth_uid = auth.uid()
    AND (empresa_id = wp_empresa_embudo.empresa_id OR role_id = 1)
    AND role_id IN (1, 2)
  )
);
*/
