-- ============================================================================
-- FIX: Políticas RLS para wp_email_campanas - Acceso Role ID 1 (Dev Team)
-- Problema: Usuarios con role_id=1 no pueden crear campañas para otras empresas
-- porque la RLS solo permite INSERT donde empresa_id = su propia empresa.
-- Fecha: 2026-02-11
-- ============================================================================

-- 1. Política SELECT para role_id 1: Ver TODAS las campañas
DROP POLICY IF EXISTS "wp_email_campanas_select_role1" ON public.wp_email_campanas;
CREATE POLICY "wp_email_campanas_select_role1" ON public.wp_email_campanas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- 2. Política INSERT para role_id 1: Crear campañas en CUALQUIER empresa
DROP POLICY IF EXISTS "wp_email_campanas_insert_role1" ON public.wp_email_campanas;
CREATE POLICY "wp_email_campanas_insert_role1" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- 3. Política UPDATE para role_id 1: Actualizar campañas de CUALQUIER empresa
DROP POLICY IF EXISTS "wp_email_campanas_update_role1" ON public.wp_email_campanas;
CREATE POLICY "wp_email_campanas_update_role1" ON public.wp_email_campanas
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
  );

-- 4. Política DELETE para role_id 1: Eliminar campañas de CUALQUIER empresa
DROP POLICY IF EXISTS "wp_email_campanas_delete_role1" ON public.wp_email_campanas;
CREATE POLICY "wp_email_campanas_delete_role1" ON public.wp_email_campanas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- 5. Verificar todas las políticas
SELECT 
  policyname,
  cmd
FROM pg_policies 
WHERE tablename = 'wp_email_campanas'
ORDER BY policyname;
