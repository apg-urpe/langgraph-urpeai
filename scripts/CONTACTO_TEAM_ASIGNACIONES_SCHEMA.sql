-- ============================================================================
-- SISTEMA DE ASIGNACIONES MÚLTIPLES DE TEAM HUMANOS A CONTACTOS
-- ============================================================================
-- Permite asignar múltiples miembros del equipo a un mismo contacto
-- Mantiene compatibilidad con wp_contactos.team_humano_id (asesor principal)
-- ============================================================================

-- Tabla pivot para asignaciones múltiples
CREATE TABLE IF NOT EXISTS wp_contacto_team_asignaciones (
  id BIGSERIAL PRIMARY KEY,
  contacto_id BIGINT NOT NULL REFERENCES wp_contactos(id) ON DELETE CASCADE,
  team_humano_id BIGINT NOT NULL REFERENCES wp_team_humano(id) ON DELETE CASCADE,
  es_principal BOOLEAN DEFAULT false,
  rol_asignacion VARCHAR(50), -- 'principal', 'colaborador', 'observador'
  asignado_por BIGINT REFERENCES wp_team_humano(id) ON DELETE SET NULL,
  empresa_id BIGINT NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: Un team_humano solo puede estar asignado una vez a un contacto
  UNIQUE(contacto_id, team_humano_id)
);

-- Constraint: rol de asignación válido
ALTER TABLE wp_contacto_team_asignaciones
  DROP CONSTRAINT IF EXISTS chk_asignacion_rol;

ALTER TABLE wp_contacto_team_asignaciones
  ADD CONSTRAINT chk_asignacion_rol
  CHECK (
    rol_asignacion IS NULL
    OR rol_asignacion IN ('principal', 'colaborador', 'observador')
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_asignaciones_contacto 
  ON wp_contacto_team_asignaciones(contacto_id);

CREATE INDEX IF NOT EXISTS idx_asignaciones_team 
  ON wp_contacto_team_asignaciones(team_humano_id);

CREATE INDEX IF NOT EXISTS idx_asignaciones_principal 
  ON wp_contacto_team_asignaciones(contacto_id, es_principal) 
  WHERE es_principal = true;

-- Limpieza preventiva para evitar fallos al crear índice único de principal
WITH ranked_principals AS (
  SELECT
    id,
    contacto_id,
    ROW_NUMBER() OVER (PARTITION BY contacto_id ORDER BY created_at ASC, id ASC) AS rn
  FROM wp_contacto_team_asignaciones
  WHERE es_principal = true
)
UPDATE wp_contacto_team_asignaciones a
SET es_principal = false,
    rol_asignacion = COALESCE(a.rol_asignacion, 'colaborador'),
    updated_at = NOW()
FROM ranked_principals rp
WHERE a.id = rp.id
  AND rp.rn > 1;

-- Garantiza máximo 1 principal por contacto
CREATE UNIQUE INDEX IF NOT EXISTS uq_asignacion_principal_por_contacto
  ON wp_contacto_team_asignaciones(contacto_id)
  WHERE es_principal = true;

CREATE INDEX IF NOT EXISTS idx_asignaciones_empresa 
  ON wp_contacto_team_asignaciones(empresa_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_asignaciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_update_asignaciones_timestamp 
  ON wp_contacto_team_asignaciones;

CREATE TRIGGER trigger_update_asignaciones_timestamp
  BEFORE UPDATE ON wp_contacto_team_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_asignaciones_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE wp_contacto_team_asignaciones ENABLE ROW LEVEL SECURITY;

-- Policy: Ver asignaciones de tu empresa
DROP POLICY IF EXISTS "Ver asignaciones de empresa" ON wp_contacto_team_asignaciones;
CREATE POLICY "Ver asignaciones de empresa"
  ON wp_contacto_team_asignaciones
  FOR SELECT
  USING (
    is_dev_team_member()
    OR empresa_id = get_user_empresa_id()
  );

-- Policy: Crear asignaciones (role_id 1 dev team, 2/4 supervisión)
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

-- Policy: Actualizar asignaciones (role_id 1 dev team, 2/4 supervisión)
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

-- Policy: Eliminar asignaciones (role_id 1 dev team, 2/4 supervisión)
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
-- FUNCIÓN/ TRIGGER: Validar consistencia de empresa entre contacto y team
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

DROP TRIGGER IF EXISTS trigger_validate_contacto_team_asignacion_empresa ON wp_contacto_team_asignaciones;

CREATE TRIGGER trigger_validate_contacto_team_asignacion_empresa
  BEFORE INSERT OR UPDATE ON wp_contacto_team_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION validate_contacto_team_asignacion_empresa();

-- ============================================================================
-- FUNCIÓN RPC: Obtener asignaciones de un contacto con datos del team
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
-- FUNCIÓN RPC: Sincronizar asignación principal con wp_contactos.team_humano_id
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_principal_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Si se marca como principal, actualizar wp_contactos.team_humano_id
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

DROP TRIGGER IF EXISTS trigger_sync_principal ON wp_contacto_team_asignaciones;

CREATE TRIGGER trigger_sync_principal
  BEFORE INSERT OR UPDATE OF es_principal ON wp_contacto_team_asignaciones
  FOR EACH ROW
  WHEN (NEW.es_principal = true)
  EXECUTE FUNCTION sync_principal_assignment();

-- ============================================================================
-- FUNCIÓN/ TRIGGER: Mantener consistencia al eliminar principal
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

DROP TRIGGER IF EXISTS trigger_sync_principal_after_delete ON wp_contacto_team_asignaciones;

CREATE TRIGGER trigger_sync_principal_after_delete
  AFTER DELETE ON wp_contacto_team_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION sync_principal_after_delete();

-- ============================================================================
-- FUNCIÓN/ TRIGGER: Sincronizar tabla pivot cuando cambia wp_contactos.team_humano_id
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

DROP TRIGGER IF EXISTS trigger_sync_asignaciones_from_contacto_update ON wp_contactos;
CREATE TRIGGER trigger_sync_asignaciones_from_contacto_update
  AFTER UPDATE OF team_humano_id ON wp_contactos
  FOR EACH ROW
  WHEN (NEW.team_humano_id IS DISTINCT FROM OLD.team_humano_id)
  EXECUTE FUNCTION sync_asignaciones_from_contacto_principal();

DROP TRIGGER IF EXISTS trigger_sync_asignaciones_from_contacto_insert ON wp_contactos;
CREATE TRIGGER trigger_sync_asignaciones_from_contacto_insert
  AFTER INSERT ON wp_contactos
  FOR EACH ROW
  WHEN (NEW.team_humano_id IS NOT NULL)
  EXECUTE FUNCTION sync_asignaciones_from_contacto_principal();

-- ============================================================================
-- BACKFILL: Migrar team_humano_id existentes a tabla pivot (idempotente)
-- ============================================================================
-- NOTA: Se desactivan triggers temporalmente para evitar conflictos
-- con el batch INSERT + ON CONFLICT cuando sync_principal_assignment
-- intenta modificar filas del mismo comando.
-- ============================================================================

-- Desactivar triggers de usuario durante backfill (no afecta constraints del sistema)
SET LOCAL session_replication_role = replica;

-- Paso 1: Desmarcar principales que no coinciden con wp_contactos.team_humano_id
UPDATE wp_contacto_team_asignaciones a
SET es_principal = false,
    rol_asignacion = CASE
      WHEN a.rol_asignacion = 'principal' OR a.rol_asignacion IS NULL THEN 'colaborador'
      ELSE a.rol_asignacion
    END,
    updated_at = NOW()
FROM wp_contactos c
WHERE c.id = a.contacto_id
  AND c.team_humano_id IS NOT NULL
  AND a.es_principal = true
  AND a.team_humano_id <> c.team_humano_id;

-- Paso 2: Insertar/actualizar principal desde wp_contactos.team_humano_id
INSERT INTO wp_contacto_team_asignaciones (
  contacto_id,
  team_humano_id,
  es_principal,
  rol_asignacion,
  empresa_id,
  asignado_por
)
SELECT DISTINCT ON (c.id)
  c.id,
  c.team_humano_id,
  true,
  'principal',
  c.empresa_id,
  NULL
FROM wp_contactos c
JOIN wp_team_humano t
  ON t.id = c.team_humano_id
 AND t.empresa_id = c.empresa_id
WHERE c.team_humano_id IS NOT NULL
ON CONFLICT (contacto_id, team_humano_id)
DO UPDATE SET
  es_principal = true,
  rol_asignacion = 'principal',
  empresa_id = EXCLUDED.empresa_id,
  updated_at = NOW();

-- Re-activar triggers de usuario
RESET session_replication_role;

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON TABLE wp_contacto_team_asignaciones IS 
  'Asignaciones múltiples de miembros del equipo a contactos. Permite colaboración entre varios asesores.';

COMMENT ON COLUMN wp_contacto_team_asignaciones.es_principal IS 
  'Indica el asesor principal. Se sincroniza automáticamente con wp_contactos.team_humano_id';

COMMENT ON COLUMN wp_contacto_team_asignaciones.rol_asignacion IS 
  'Tipo de asignación: principal, colaborador, observador';

COMMENT ON FUNCTION get_contacto_asignaciones IS 
  'Obtiene todas las asignaciones de un contacto con datos completos del team humano';
