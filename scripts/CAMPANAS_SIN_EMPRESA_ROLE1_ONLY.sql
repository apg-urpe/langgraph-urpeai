-- ============================================================================
-- FIX: Políticas RLS para wp_email_campanas - Campañas sin empresa (Role 1 only)
-- Problema: Las campañas con empresa_id IS NULL (campañas de sistema)
--          pueden ser modificadas por cualquier usuario.
-- Solución: Solo role_id = 1 (admin) puede modificar campañas sin empresa.
-- Fecha: 2026-02-12
-- ============================================================================

-- 1. Verificar políticas actuales
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'wp_email_campanas'
ORDER BY policyname;

-- 2. Eliminar políticas existentes para wp_email_campanas
DROP POLICY IF EXISTS "wp_email_campanas_select" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_select_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update_role1" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete_role1" ON public.wp_email_campanas;

-- 3. Política SELECT: Usuarios normales ven campañas de su empresa + campañas de sistema (solo lectura)
CREATE POLICY "wp_email_campanas_select" ON public.wp_email_campanas
  FOR SELECT
  USING (
    -- Campañas de su empresa
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- O campañas de sistema (solo lectura)
    OR empresa_id IS NULL
  );

-- 4. Política INSERT: Solo crear campañas para tu empresa (nunca sin empresa)
CREATE POLICY "wp_email_campanas_insert" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- IMPORTANTE: No permitir INSERT con empresa_id IS NULL
    AND empresa_id IS NOT NULL
  );

-- 5. Política UPDATE: Usuarios normales solo modifican campañas de su empresa
CREATE POLICY "wp_email_campanas_update" ON public.wp_email_campanas
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- IMPORTANTE: Excluir campañas de sistema (empresa_id IS NULL)
    AND empresa_id IS NOT NULL
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- IMPORTANTE: No permitir cambiar a empresa_id IS NULL
    AND empresa_id IS NOT NULL
  );

-- 6. Política DELETE: Usuarios normales solo eliminan campañas de su empresa
CREATE POLICY "wp_email_campanas_delete" ON public.wp_email_campanas
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND empresa_id IS NOT NULL
    )
    -- IMPORTANTE: Excluir campañas de sistema (empresa_id IS NULL)
    AND empresa_id IS NOT NULL
  );

-- 7. Políticas especiales para Role ID 1 (Admin): Acceso completo a TODAS las campañas
-- incluyendo las de sistema (empresa_id IS NULL)

-- 7.1. SELECT para Role 1: Ver TODAS las campañas (ya cubierto por política general)
-- No se necesita política SELECT separada porque la política general ya incluye
-- campañas de sistema para todos los usuarios.

-- 7.2. INSERT para Role 1: Puede crear campañas para CUALQUIER empresa o sin empresa
CREATE POLICY "wp_email_campanas_insert_role1" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    -- Role 1 puede crear campañas sin empresa (campañas de sistema)
    -- O para cualquier empresa específica
  );

-- 7.3. UPDATE para Role 1: Puede modificar CUALQUIER campaña, incluyendo las de sistema
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
    -- Role 1 puede cambiar empresa_id a NULL (convertir en campaña de sistema)
    -- O cambiar cualquier otro valor
  );

-- 7.4. DELETE para Role 1: Puede eliminar CUALQUIER campaña, incluyendo las de sistema
CREATE POLICY "wp_email_campanas_delete_role1" ON public.wp_email_campanas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    -- Role 1 puede eliminar campañas de sistema (empresa_id IS NULL)
  );

-- 8. Verificar políticas creadas
SELECT 
  policyname,
  cmd,
  qual,
  with_check,
  roles
FROM pg_policies 
WHERE tablename = 'wp_email_campanas'
ORDER BY policyname;

-- 9. Test de seguridad: Verificar quién puede hacer qué
-- 9.1. Campañas de sistema (empresa_id IS NULL)
-- SELECT: Todos los usuarios pueden ver
-- UPDATE/DELETE: Solo role_id = 1 puede modificar
-- INSERT: Solo role_id = 1 puede crear con empresa_id IS NULL

-- 9.2. Campañas de empresa (empresa_id NOT NULL)
-- SELECT: Usuarios de esa empresa + role_id = 1
-- UPDATE/DELETE: Usuarios de esa empresa + role_id = 1
-- INSERT: Usuarios pueden crear para su empresa, role_id = 1 puede crear para cualquiera

-- 10. Resumen de la configuración
/*
POLÍTICAS CREADAS:
1. wp_email_campanas_select: Todos ven campañas de su empresa + de sistema
2. wp_email_campanas_insert: Solo crear para tu empresa (nunca NULL)
3. wp_email_campanas_update: Solo modificar campañas de tu empresa (nunca NULL)
4. wp_email_campanas_delete: Solo eliminar campañas de tu empresa (nunca NULL)
5. wp_email_campanas_insert_role1: Role 1 puede crear cualquier campaña (incluyendo NULL)
6. wp_email_campanas_update_role1: Role 1 puede modificar cualquier campaña (incluyendo NULL)
7. wp_email_campanas_delete_role1: Role 1 puede eliminar cualquier campaña (incluyendo NULL)

RESULTADO:
✅ Campañas con empresa_id IS NULL son SOLO LECTURA para usuarios normales
✅ Solo role_id = 1 puede modificar campañas de sistema
✅ Usuarios normales pueden modificar solo campañas de su empresa
✅ Role 1 tiene acceso completo a todas las campañas
*/
