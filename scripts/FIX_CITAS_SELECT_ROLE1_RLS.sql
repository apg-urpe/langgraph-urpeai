-- =====================================================
-- FIX: Política RLS para SELECT en wp_citas para Rol 1
-- Permite que los usuarios con role_id = 1 (Admin/Dev) puedan 
-- ver todas las citas de su misma empresa (empresa_id).
-- =====================================================

DO $$ 
BEGIN
  -- 1. Asegurarnos que RLS esté habilitado en wp_citas
  ALTER TABLE public.wp_citas ENABLE ROW LEVEL SECURITY;

  -- 2. Eliminar política si ya existe para evitar errores
  DROP POLICY IF EXISTS "Role 1 can view all enterprise appointments" ON public.wp_citas;

  -- 3. Crear política para SELECT
  CREATE POLICY "Role 1 can view all enterprise appointments"
  ON public.wp_citas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wp_team_humano
      WHERE wp_team_humano.auth_uid = auth.uid()
      AND wp_team_humano.empresa_id = wp_citas.empresa_id
      AND (wp_team_humano.role_id = 1 OR wp_team_humano.role_id = 2) -- Opcionalmente incluir Rol 2 (Manager) si también deben ver todas
    )
  );

  RAISE NOTICE 'Política aplicada exitosamente.';
END $$;
