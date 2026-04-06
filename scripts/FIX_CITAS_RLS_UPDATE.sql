-- =====================================================
-- FIX: Política RLS para UPDATE en wp_citas
-- Permite actualizar citas de la empresa del usuario
-- =====================================================

-- Verificar estado actual de RLS
SELECT 
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'wp_citas';

-- Ver políticas existentes
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'wp_citas';

-- =====================================================
-- OPCIÓN 1: Agregar política UPDATE (si RLS está habilitado)
-- =====================================================
DO $$
BEGIN
  -- Solo crear si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'wp_citas' 
    AND policyname = 'Allow update for authenticated users on own enterprise'
  ) THEN
    CREATE POLICY "Allow update for authenticated users on own enterprise"
    ON public.wp_citas
    FOR UPDATE
    TO authenticated
    USING (
      empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid()
      )
    )
    WITH CHECK (
      empresa_id IN (
        SELECT empresa_id FROM wp_team_humano 
        WHERE auth_uid = auth.uid()
      )
    );
    
    RAISE NOTICE 'Política UPDATE creada exitosamente';
  ELSE
    RAISE NOTICE 'Política UPDATE ya existe';
  END IF;
END $$;

-- =====================================================
-- OPCIÓN 2 (ALTERNATIVA): Deshabilitar RLS temporalmente para pruebas
-- CUIDADO: Solo usar en desarrollo
-- =====================================================
-- ALTER TABLE wp_citas DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- Verificar que la política se creó
-- =====================================================
SELECT policyname, cmd, permissive, roles
FROM pg_policies 
WHERE tablename = 'wp_citas'
ORDER BY cmd;
