-- ============================================================================
-- LIMPIEZA Y CONSOLIDACIÓN: Políticas RLS para wp_email_campanas
-- Problema: Políticas duplicadas y estructuradas incorrectamente
-- Solución: Eliminar todas las políticas y recrear solo las necesarias
-- Fecha: 2026-02-12
-- ============================================================================

-- 1. Eliminar TODAS las políticas existentes para wp_email_campanas
DROP POLICY IF EXISTS "wp_email_campanas_select" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_select_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_select_normal" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert_normal" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update_normal" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete_normal" ON public.wp_email_campanas;

-- 2. Política SELECT: Todos los usuarios ven campañas de su empresa + campañas de sistema
CREATE POLICY "wp_email_campanas_select" ON public.wp_email_campanas
  FOR SELECT
  USING (
    -- Campañas de su empresa
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- O campañas de sistema (solo lectura para usuarios normales)
    OR empresa_id IS NULL
  );

-- 3. Política INSERT: Solo crear campañas para tu empresa (NUNCA sin empresa)
CREATE POLICY "wp_email_campanas_insert" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- CRÍTICO: Forzar que empresa_id no sea NULL
    AND empresa_id IS NOT NULL
  );

-- 4. Política UPDATE: Usuarios normales solo modifican campañas de su empresa
CREATE POLICY "wp_email_campanas_update" ON public.wp_email_campanas
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- CRÍTICO: Excluir campañas de sistema
    AND empresa_id IS NOT NULL
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- CRÍTICO: No permitir cambiar empresa_id a NULL
    AND empresa_id IS NOT NULL
  );

-- 5. Política DELETE: Usuarios normales solo eliminan campañas de su empresa
CREATE POLICY "wp_email_campanas_delete" ON public.wp_email_campanas
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- CRÍTICO: Excluir campañas de sistema
    AND empresa_id IS NOT NULL
  );

-- 6. Políticas ESPECIALES para Role 1 (Admin): Acceso completo INCLUDING campañas de sistema

-- 6.1. INSERT para Role 1: Puede crear campañas SIN empresa (campañas de sistema)
CREATE POLICY "wp_email_campanas_insert_admin" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    -- Role 1 puede crear campañas con empresa_id IS NULL
    -- O para cualquier empresa específica
  );

-- 6.2. UPDATE para Role 1: Puede modificar CUALQUIER campaña, incluyendo las de sistema
CREATE POLICY "wp_email_campanas_update_admin" ON public.wp_email_campanas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    -- Role 1 puede cambiar empresa_id a NULL o cualquier otro valor
  );

-- 6.3. DELETE para Role 1: Puede eliminar CUALQUIER campaña, incluyendo las de sistema
CREATE POLICY "wp_email_campanas_delete_admin" ON public.wp_email_campanas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    -- Role 1 puede eliminar campañas de sistema (empresa_id IS NULL)
  );

-- 7. Verificar políticas finales (deberían ser 7 políticas)
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN qual IS NOT NULL THEN 'USING: ' || SUBSTRING(qual, 1, 100) || '...'
    ELSE 'Sin USING'
  END as using_clause,
  CASE 
    WHEN with_check IS NOT NULL THEN 'WITH CHECK: ' || SUBSTRING(with_check, 1, 100) || '...'
    ELSE 'Sin WITH CHECK'
  END as with_check_clause
FROM pg_policies 
WHERE tablename = 'wp_email_campanas'
ORDER BY policyname;

-- 8. Test de seguridad conceptual
/*
ESCOPOS DE ACCESO:

📋 SELECT (Todos los usuarios):
✅ Campañas de su empresa (empresa_id = X)
✅ Campañas de sistema (empresa_id IS NULL) - solo lectura

✏️ INSERT (Usuarios normales):
✅ Campañas para su empresa (empresa_id = X)
❌ Campañas de sistema (empresa_id IS NULL) - BLOQUEADO

✏️ INSERT (Role 1 Admin):
✅ Campañas para CUALQUIER empresa (empresa_id = X)
✅ Campañas de sistema (empresa_id IS NULL) - PERMITIDO

🔄 UPDATE (Usuarios normales):
✅ Campañas de su empresa (empresa_id = X)
❌ Campañas de sistema (empresa_id IS NULL) - BLOQUEADO

🔄 UPDATE (Role 1 Admin):
✅ CUALQUIER campaña (incluyendo empresa_id IS NULL)

🗑️ DELETE (Usuarios normales):
✅ Campañas de su empresa (empresa_id = X)
❌ Campañas de sistema (empresa_id IS NULL) - BLOQUEADO

🗑️ DELETE (Role 1 Admin):
✅ CUALQUIER campaña (incluyendo empresa_id IS NULL)
*/

-- 9. Resumen final
/*
POLÍTICAS FINALES (7 políticas):
1. wp_email_campanas_select - Todos ven su empresa + sistema
2. wp_email_campanas_insert - Solo crear para tu empresa
3. wp_email_campanas_update - Solo modificar tu empresa
4. wp_email_campanas_delete - Solo eliminar tu empresa
5. wp_email_campanas_insert_admin - Role 1: crear cualquier campaña
6. wp_email_campanas_update_admin - Role 1: modificar cualquier campaña
7. wp_email_campanas_delete_admin - Role 1: eliminar cualquier campaña

RESULTADO:
✅ Campañas sin empresa (empresa_id IS NULL) son SOLO LECTURA para usuarios normales
✅ Solo role_id = 1 puede modificar/eliminar/crear campañas de sistema
✅ Usuarios normales mantienen control total sobre sus campañas
✅ Role 1 tiene acceso administrativo completo
*/
