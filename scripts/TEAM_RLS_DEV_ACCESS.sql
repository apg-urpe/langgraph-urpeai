-- ============================================================================
-- TEAM_RLS_DEV_ACCESS.sql
-- Políticas RLS para permitir que role_id=1 (Dev Team) gestione equipo de cualquier empresa
-- Fecha: 21 Enero 2026
-- ============================================================================
-- PROBLEMA: 
-- Usuarios con role_id=1 en "Modo Observación" no pueden editar miembros de otras empresas
-- porque las políticas RLS solo permiten acceso a la empresa del usuario autenticado.
--
-- SOLUCIÓN:
-- Crear políticas RLS que permitan a usuarios con role_id=1 gestionar wp_team_humano
-- de cualquier empresa, mientras que usuarios normales solo pueden ver/editar su empresa.
-- ============================================================================

-- Constantes de referencia
-- DEV_TEAM_ROLE_ID = 1
-- URPE_LAB_ENTERPRISE_ID = 13

-- ============================================================================
-- PASO 0: Verificar si RLS está habilitado
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'wp_team_humano' 
    AND rowsecurity = true
  ) THEN
    RAISE NOTICE 'RLS no está habilitado en wp_team_humano. Habilitando...';
    ALTER TABLE wp_team_humano ENABLE ROW LEVEL SECURITY;
  ELSE
    RAISE NOTICE 'RLS ya está habilitado en wp_team_humano';
  END IF;
END $$;

-- ============================================================================
-- PASO 1: Función helper para verificar si el usuario es Dev Team (role_id=1)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_dev_team_member()
RETURNS BOOLEAN AS $$
DECLARE
  user_role_id INTEGER;
BEGIN
  -- Obtener el role_id del usuario autenticado
  SELECT role_id INTO user_role_id
  FROM wp_team_humano
  WHERE auth_uid = auth.uid()
  LIMIT 1;
  
  -- Si el usuario tiene role_id = 1, es Dev Team
  RETURN COALESCE(user_role_id = 1, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- PASO 2: Función helper para obtener empresa_id del usuario autenticado
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_empresa_id()
RETURNS INTEGER AS $$
DECLARE
  user_empresa_id INTEGER;
BEGIN
  SELECT empresa_id INTO user_empresa_id
  FROM wp_team_humano
  WHERE auth_uid = auth.uid()
  LIMIT 1;
  
  RETURN user_empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- PASO 3: Eliminar políticas existentes de wp_team_humano
-- ============================================================================
DROP POLICY IF EXISTS "team_select_policy" ON wp_team_humano;
DROP POLICY IF EXISTS "team_insert_policy" ON wp_team_humano;
DROP POLICY IF EXISTS "team_update_policy" ON wp_team_humano;
DROP POLICY IF EXISTS "team_delete_policy" ON wp_team_humano;
DROP POLICY IF EXISTS "team_humano_select" ON wp_team_humano;
DROP POLICY IF EXISTS "team_humano_insert" ON wp_team_humano;
DROP POLICY IF EXISTS "team_humano_update" ON wp_team_humano;
DROP POLICY IF EXISTS "team_humano_delete" ON wp_team_humano;
DROP POLICY IF EXISTS "team_delete_same_empresa" ON wp_team_humano;
DROP POLICY IF EXISTS "team_insert_same_empresa" ON wp_team_humano;
DROP POLICY IF EXISTS "team_update_same_empresa" ON wp_team_humano;
DROP POLICY IF EXISTS "Permitir lectura a usuarios autenticados" ON wp_team_humano;
DROP POLICY IF EXISTS "Permitir todas las operaciones al servicio" ON wp_team_humano;

-- ============================================================================
-- PASO 4: Crear nuevas políticas RLS
-- ============================================================================

-- SELECT: Dev Team puede ver todo, otros solo su empresa
CREATE POLICY "team_select_policy" ON wp_team_humano
FOR SELECT
USING (
  is_dev_team_member() 
  OR empresa_id = get_user_empresa_id()
);

-- INSERT: Dev Team puede insertar en cualquier empresa, otros solo en su empresa
CREATE POLICY "team_insert_policy" ON wp_team_humano
FOR INSERT
WITH CHECK (
  is_dev_team_member() 
  OR empresa_id = get_user_empresa_id()
);

-- UPDATE: Dev Team puede actualizar cualquier empresa, otros solo su empresa
CREATE POLICY "team_update_policy" ON wp_team_humano
FOR UPDATE
USING (
  is_dev_team_member() 
  OR empresa_id = get_user_empresa_id()
)
WITH CHECK (
  is_dev_team_member() 
  OR empresa_id = get_user_empresa_id()
);

-- DELETE: Dev Team puede eliminar de cualquier empresa, otros solo su empresa
CREATE POLICY "team_delete_policy" ON wp_team_humano
FOR DELETE
USING (
  is_dev_team_member() 
  OR empresa_id = get_user_empresa_id()
);

-- ============================================================================
-- PASO 5: Verificar las políticas creadas
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL as has_using,
  with_check IS NOT NULL as has_check
FROM pg_policies 
WHERE tablename = 'wp_team_humano'
ORDER BY policyname;

-- ============================================================================
-- PASO 6: Test de verificación (opcional, comentado)
-- ============================================================================
-- Descomentar para probar:
/*
-- Verificar si el usuario actual es dev team
SELECT is_dev_team_member() as es_dev_team;

-- Verificar empresa del usuario actual
SELECT get_user_empresa_id() as mi_empresa_id;

-- Ver miembros accesibles para el usuario actual
SELECT id, nombre, apellido, empresa_id, role_id 
FROM wp_team_humano 
ORDER BY empresa_id, nombre 
LIMIT 20;
*/

-- ============================================================================
-- NOTAS
-- ============================================================================
-- 1. Esta política permite que usuarios con role_id=1 gestionen equipo de CUALQUIER empresa
-- 2. Usuarios normales (role_id != 1) solo pueden ver/editar miembros de SU empresa
-- 3. El trigger TEAM_SECURITY_TRIGGER.sql sigue activo para prevenir creación de role_id=1
--    fuera de empresa_id=13
-- 4. Las funciones helper usan SECURITY DEFINER para acceder a los datos necesarios
-- ============================================================================
