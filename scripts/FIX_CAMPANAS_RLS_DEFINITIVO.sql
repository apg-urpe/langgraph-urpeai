-- ============================================================================
-- FIX DEFINITIVO: Políticas RLS para wp_email_campanas
-- Problema: Role 1 (admin) no puede crear campañas en empresas externas
-- Causa: Políticas INSERT solo permiten empresa_id del propio usuario
-- Fecha: 2026-02-13
-- ============================================================================

-- PASO 1: Ver políticas actuales (ejecutar primero para diagnóstico)
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'wp_email_campanas'
ORDER BY policyname;

-- PASO 2: Eliminar TODAS las políticas existentes (limpieza total)
DROP POLICY IF EXISTS "wp_email_campanas_select" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_select_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_select_admin" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert_admin" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update_admin" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete_admin" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_select_normal" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert_normal" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update_normal" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete_normal" ON public.wp_email_campanas;

-- Asegurar que RLS está habilitado
ALTER TABLE public.wp_email_campanas ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASO 3: Crear políticas UNIFICADAS (una por operación, con lógica OR)
-- Cada política combina: acceso normal (su empresa) OR role_id=1 (todas)
-- ============================================================================

-- SELECT: Ver campañas de tu empresa + sistema, O role_id=1 ve todo
CREATE POLICY "campanas_select" ON public.wp_email_campanas
  FOR SELECT
  USING (
    -- Role 1: acceso total
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    OR
    -- Usuarios normales: su empresa + campañas de sistema
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    OR empresa_id IS NULL
  );

-- INSERT: Crear para tu empresa, O role_id=1 crea para cualquiera
CREATE POLICY "campanas_insert" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    -- Role 1: puede crear para CUALQUIER empresa (incluyendo NULL)
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    OR
    -- Usuarios normales: solo para su empresa (nunca NULL)
    (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
      )
    )
  );

-- UPDATE: Modificar campañas de tu empresa, O role_id=1 modifica cualquiera
CREATE POLICY "campanas_update" ON public.wp_email_campanas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    OR
    (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    OR
    (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
      )
    )
  );

-- DELETE: Eliminar campañas de tu empresa, O role_id=1 elimina cualquiera
CREATE POLICY "campanas_delete" ON public.wp_email_campanas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    OR
    (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
      )
    )
  );

-- ============================================================================
-- PASO 4: Verificar resultado (deben ser exactamente 4 políticas)
-- ============================================================================
SELECT 
  policyname,
  cmd,
  CASE WHEN qual IS NOT NULL THEN 'OK' ELSE '-' END as has_using,
  CASE WHEN with_check IS NOT NULL THEN 'OK' ELSE '-' END as has_with_check
FROM pg_policies 
WHERE tablename = 'wp_email_campanas'
ORDER BY policyname;

-- ============================================================================
-- RESULTADO ESPERADO:
--   campanas_select  | SELECT | OK | -
--   campanas_insert  | INSERT | -  | OK
--   campanas_update  | UPDATE | OK | OK
--   campanas_delete  | DELETE | OK | -
--
-- Role 1 puede: SELECT/INSERT/UPDATE/DELETE en CUALQUIER empresa
-- Normales pueden: SELECT/INSERT/UPDATE/DELETE solo en SU empresa
-- ============================================================================
