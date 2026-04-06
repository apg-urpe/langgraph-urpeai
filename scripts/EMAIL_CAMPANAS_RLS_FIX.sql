-- ============================================================================
-- FIX: Políticas RLS para wp_email_campanas
-- Problema: Las actualizaciones de campañas fallan por falta de políticas RLS
-- Fecha: 2026-01-20
-- ============================================================================

-- 1. Verificar estado actual de RLS
SELECT 
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'wp_email_campanas';

-- 2. Habilitar RLS si no está habilitado
ALTER TABLE public.wp_email_campanas ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar políticas existentes (si las hay) para recrearlas
DROP POLICY IF EXISTS "wp_email_campanas_select" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_insert" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_update" ON public.wp_email_campanas;
DROP POLICY IF EXISTS "wp_email_campanas_delete" ON public.wp_email_campanas;

-- 4. Crear política SELECT: Ver campañas de tu empresa O campañas de sistema (empresa_id IS NULL)
CREATE POLICY "wp_email_campanas_select" ON public.wp_email_campanas
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR empresa_id IS NULL
  );

-- 5. Crear política INSERT: Solo crear campañas para tu empresa
CREATE POLICY "wp_email_campanas_insert" ON public.wp_email_campanas
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

-- 6. Crear política UPDATE: Actualizar campañas de tu empresa (NO las de sistema)
CREATE POLICY "wp_email_campanas_update" ON public.wp_email_campanas
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

-- 7. Crear política DELETE: Eliminar campañas de tu empresa (NO las de sistema)
CREATE POLICY "wp_email_campanas_delete" ON public.wp_email_campanas
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

-- ============================================================================
-- NOTA: Las campañas con empresa_id IS NULL son campañas de sistema
-- y solo pueden ser vistas (SELECT) pero no modificadas por usuarios normales.
-- Si necesitas que el Dev Team (rol 1) pueda editar campañas de sistema,
-- agrega esta política adicional:
-- ============================================================================

-- (OPCIONAL) Política para Dev Team - editar cualquier campaña
-- CREATE POLICY "wp_email_campanas_dev_update" ON public.wp_email_campanas
--   FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM wp_team_humano 
--       WHERE auth_uid = auth.uid() AND role_id = 1
--     )
--   );

-- 8. Verificar políticas creadas
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'wp_email_campanas';
