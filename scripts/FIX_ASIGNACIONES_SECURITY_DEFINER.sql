-- ============================================================================
-- FIX: SECURITY DEFINER para funciones de asignaciones múltiples
-- ============================================================================
-- PROBLEMA: Las funciones trigger y RPC se crearon sin SECURITY DEFINER.
-- En Supabase, las operaciones desde la API corren como rol 'authenticated'
-- y están sujetas a RLS. Los triggers internamente hacen SELECT/UPDATE en
-- wp_contactos y wp_team_humano (ambas con RLS), causando que las
-- operaciones fallen silenciosamente.
--
-- FIX: Recrear TODAS las funciones con SECURITY DEFINER SET search_path = public
-- ============================================================================

-- ============================================================================
-- 1. Función: Actualizar timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_asignaciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. Función: Validar consistencia de empresa
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_contacto_team_asignacion_empresa()
RETURNS TRIGGER AS $$
DECLARE
  contacto_empresa BIGINT;
  team_empresa BIGINT;
BEGIN
  SELECT empresa_id
  INTO contacto_empresa
  FROM wp_contactos
  WHERE id = NEW.contacto_id;

  SELECT empresa_id
  INTO team_empresa
  FROM wp_team_humano
  WHERE id = NEW.team_humano_id;

  IF contacto_empresa IS NULL THEN
    RAISE EXCEPTION 'Contacto % no existe o no tiene empresa_id', NEW.contacto_id;
  END IF;

  IF team_empresa IS NULL THEN
    RAISE EXCEPTION 'Team member % no existe o no tiene empresa_id', NEW.team_humano_id;
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM contacto_empresa THEN
    RAISE EXCEPTION 'empresa_id inválida: debe coincidir con la empresa del contacto (%)', contacto_empresa;
  END IF;

  IF team_empresa IS DISTINCT FROM contacto_empresa THEN
    RAISE EXCEPTION 'No se puede asignar team_humano de otra empresa (team=% , contacto=%)', team_empresa, contacto_empresa;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 3. Función RPC: Obtener asignaciones con datos del team
-- ============================================================================
CREATE OR REPLACE FUNCTION get_contacto_asignaciones(p_contacto_id BIGINT)
RETURNS TABLE (
  id BIGINT,
  contacto_id BIGINT,
  team_humano_id BIGINT,
  es_principal BOOLEAN,
  rol_asignacion VARCHAR,
  created_at TIMESTAMPTZ,
  team_nombre VARCHAR,
  team_apellido VARCHAR,
  team_email VARCHAR,
  team_rol VARCHAR,
  team_is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.contacto_id,
    a.team_humano_id,
    a.es_principal,
    a.rol_asignacion,
    a.created_at,
    t.nombre,
    t.apellido,
    t.email,
    t.rol,
    t.is_active
  FROM wp_contacto_team_asignaciones a
  JOIN wp_team_humano t ON a.team_humano_id = t.id
  WHERE a.contacto_id = p_contacto_id
  ORDER BY a.es_principal DESC, a.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. Función: Sincronizar principal ↔ wp_contactos.team_humano_id
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_principal_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.es_principal = true THEN
    -- Desmarcar otros como principal
    UPDATE wp_contacto_team_asignaciones
    SET es_principal = false,
        rol_asignacion = CASE
          WHEN rol_asignacion = 'principal' OR rol_asignacion IS NULL THEN 'colaborador'
          ELSE rol_asignacion
        END
    WHERE contacto_id = NEW.contacto_id
      AND es_principal = true
      AND (NEW.id IS NULL OR id <> NEW.id);

    -- Normalizar rol del nuevo principal (BEFORE trigger: usar NEW)
    NEW.rol_asignacion := 'principal';
    
    -- Actualizar contacto con el nuevo principal
    UPDATE wp_contactos
    SET team_humano_id = NEW.team_humano_id
    WHERE id = NEW.contacto_id
      AND team_humano_id IS DISTINCT FROM NEW.team_humano_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. Función: Mantener consistencia al eliminar principal
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_principal_after_delete()
RETURNS TRIGGER AS $$
DECLARE
  next_principal RECORD;
BEGIN
  IF OLD.es_principal THEN
    SELECT id, team_humano_id
    INTO next_principal
    FROM wp_contacto_team_asignaciones
    WHERE contacto_id = OLD.contacto_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF next_principal.id IS NOT NULL THEN
      UPDATE wp_contacto_team_asignaciones
      SET es_principal = true,
          rol_asignacion = 'principal'
      WHERE id = next_principal.id;
    ELSE
      UPDATE wp_contactos
      SET team_humano_id = NULL
      WHERE id = OLD.contacto_id;
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. Función: Sincronizar tabla pivot cuando cambia wp_contactos.team_humano_id
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_asignaciones_from_contacto_principal()
RETURNS TRIGGER AS $$
BEGIN
  -- Evitar bucles/duplicados cuando el cambio viene desde otro trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Si no hay principal en contacto, desmarcar principal en tabla pivot
  IF NEW.team_humano_id IS NULL THEN
    UPDATE wp_contacto_team_asignaciones
    SET es_principal = false,
        rol_asignacion = CASE
          WHEN rol_asignacion = 'principal' OR rol_asignacion IS NULL THEN 'colaborador'
          ELSE rol_asignacion
        END
    WHERE contacto_id = NEW.id
      AND es_principal = true;

    RETURN NEW;
  END IF;

  -- Desmarcar principal anterior del contacto
  UPDATE wp_contacto_team_asignaciones
  SET es_principal = false,
      rol_asignacion = CASE
        WHEN rol_asignacion = 'principal' OR rol_asignacion IS NULL THEN 'colaborador'
        ELSE rol_asignacion
      END
  WHERE contacto_id = NEW.id
    AND es_principal = true
    AND team_humano_id <> NEW.team_humano_id;

  -- Upsert principal nuevo desde wp_contactos.team_humano_id
  INSERT INTO wp_contacto_team_asignaciones (
    contacto_id,
    team_humano_id,
    es_principal,
    rol_asignacion,
    empresa_id,
    asignado_por
  )
  VALUES (
    NEW.id,
    NEW.team_humano_id,
    true,
    'principal',
    NEW.empresa_id,
    NULL
  )
  ON CONFLICT (contacto_id, team_humano_id)
  DO UPDATE SET
    es_principal = true,
    rol_asignacion = 'principal',
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. Actualizar RLS policies para usar helpers SECURITY DEFINER existentes
--    (is_dev_team_member / get_user_empresa_id de TEAM_RLS_DEV_ACCESS.sql)
-- ============================================================================

-- SELECT: Cualquier miembro de la misma empresa puede ver
DROP POLICY IF EXISTS "Ver asignaciones de empresa" ON wp_contacto_team_asignaciones;
CREATE POLICY "Ver asignaciones de empresa"
  ON wp_contacto_team_asignaciones
  FOR SELECT
  USING (
    is_dev_team_member()
    OR empresa_id = get_user_empresa_id()
  );

-- INSERT: Solo roles de gestión (1, 2, 4) + asesores para su misma empresa
DROP POLICY IF EXISTS "Crear asignaciones" ON wp_contacto_team_asignaciones;
CREATE POLICY "Crear asignaciones"
  ON wp_contacto_team_asignaciones
  FOR INSERT
  WITH CHECK (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND EXISTS (
        SELECT 1 FROM wp_team_humano
        WHERE auth_uid = auth.uid()
          AND role_id IN (2, 4)
      )
    )
  );

-- UPDATE: Solo roles de gestión (1, 2, 4)
DROP POLICY IF EXISTS "Actualizar asignaciones" ON wp_contacto_team_asignaciones;
CREATE POLICY "Actualizar asignaciones"
  ON wp_contacto_team_asignaciones
  FOR UPDATE
  USING (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND EXISTS (
        SELECT 1 FROM wp_team_humano
        WHERE auth_uid = auth.uid()
          AND role_id IN (2, 4)
      )
    )
  )
  WITH CHECK (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND EXISTS (
        SELECT 1 FROM wp_team_humano
        WHERE auth_uid = auth.uid()
          AND role_id IN (2, 4)
      )
    )
  );

-- DELETE: Solo roles de gestión (1, 2, 4)
DROP POLICY IF EXISTS "Eliminar asignaciones" ON wp_contacto_team_asignaciones;
CREATE POLICY "Eliminar asignaciones"
  ON wp_contacto_team_asignaciones
  FOR DELETE
  USING (
    is_dev_team_member()
    OR (
      empresa_id = get_user_empresa_id()
      AND EXISTS (
        SELECT 1 FROM wp_team_humano
        WHERE auth_uid = auth.uid()
          AND role_id IN (2, 4)
      )
    )
  );

-- ============================================================================
-- 8. Verificación
-- ============================================================================
SELECT 
  p.proname AS function_name,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'update_asignaciones_updated_at',
    'validate_contacto_team_asignacion_empresa',
    'get_contacto_asignaciones',
    'sync_principal_assignment',
    'sync_principal_after_delete',
    'sync_asignaciones_from_contacto_principal'
  )
ORDER BY p.proname;
