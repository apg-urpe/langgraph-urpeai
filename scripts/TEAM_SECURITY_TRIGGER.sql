-- ============================================================================
-- TEAM_SECURITY_TRIGGER.sql
-- Trigger de seguridad para wp_team_humano
-- Fecha: 30 Diciembre 2024
-- ============================================================================
-- REGLAS DE NEGOCIO:
-- 1. role_id = 1 (Dev Team) SOLO puede existir en empresa_id = 13 (Urpe AI Lab)
-- 2. Si se intenta asignar role_id = 1 en otra empresa, se degrada a role_id = 2
-- 3. enterprise_id NUNCA puede ser NULL, debe ser igual a empresa_id al crear
-- 4. Para usuarios no dev team, enterprise_id SIEMPRE = empresa_id
-- ============================================================================

-- Constantes de seguridad
-- DEV_TEAM_ROLE_ID = 1
-- URPE_LAB_ENTERPRISE_ID = 13

-- ============================================================================
-- PASO 1: Crear la función del trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_team_security_rules()
RETURNS TRIGGER AS $$
DECLARE
  DEV_TEAM_ROLE_ID CONSTANT INTEGER := 1;
  URPE_LAB_ENTERPRISE_ID CONSTANT INTEGER := 13;
  FALLBACK_ROLE_ID CONSTANT INTEGER := 2; -- Rol por defecto si se viola regla
BEGIN
  -- ============================================
  -- REGLA 1: enterprise_id nunca puede ser NULL
  -- Al crear/actualizar, si es NULL → usar empresa_id
  -- ============================================
  IF NEW.enterprise_id IS NULL THEN
    NEW.enterprise_id := NEW.empresa_id;
    RAISE NOTICE '[SECURITY] enterprise_id was NULL, set to empresa_id: %', NEW.empresa_id;
  END IF;

  -- ============================================
  -- REGLA 2: role_id = 1 SOLO en empresa_id = 13
  -- Si se intenta crear/actualizar con role_id=1 en otra empresa → degradar a role_id=2
  -- ============================================
  IF NEW.role_id = DEV_TEAM_ROLE_ID AND NEW.empresa_id != URPE_LAB_ENTERPRISE_ID THEN
    RAISE NOTICE '[SECURITY] ⚠️ role_id=1 attempted in empresa_id=% (not 13). Downgrading to role_id=%', 
                 NEW.empresa_id, FALLBACK_ROLE_ID;
    NEW.role_id := FALLBACK_ROLE_ID;
  END IF;

  -- ============================================
  -- REGLA 3: Para usuarios NO dev team, enterprise_id = empresa_id
  -- Esto previene que usuarios normales tengan enterprise_id diferente
  -- ============================================
  IF NEW.role_id IS NULL OR NEW.role_id != DEV_TEAM_ROLE_ID THEN
    IF NEW.enterprise_id != NEW.empresa_id THEN
      RAISE NOTICE '[SECURITY] Non-dev user had mismatched enterprise_id. Correcting % → %', 
                   NEW.enterprise_id, NEW.empresa_id;
      NEW.enterprise_id := NEW.empresa_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PASO 2: Crear el trigger (eliminar si existe)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_team_security ON wp_team_humano;

CREATE TRIGGER trg_team_security
  BEFORE INSERT OR UPDATE ON wp_team_humano
  FOR EACH ROW
  EXECUTE FUNCTION enforce_team_security_rules();

-- ============================================================================
-- PASO 3: Corregir datos existentes ANTES de activar el trigger
-- ============================================================================

-- 3.1 Ver usuarios afectados ANTES de la corrección
SELECT 
  id, 
  nombre, 
  apellido,
  empresa_id, 
  enterprise_id, 
  role_id,
  CASE 
    WHEN role_id = 1 AND empresa_id != 13 THEN '🔴 DEV TEAM EN EMPRESA INCORRECTA → será role_id=2'
    WHEN enterprise_id IS NULL THEN '⚠️ enterprise_id NULL → será empresa_id'
    WHEN enterprise_id != empresa_id AND role_id != 1 THEN '🔴 enterprise_id inconsistente → será empresa_id'
    ELSE '✅ OK'
  END as estado
FROM wp_team_humano
WHERE (role_id = 1 AND empresa_id != 13)
   OR enterprise_id IS NULL 
   OR (enterprise_id != empresa_id AND role_id != 1)
ORDER BY empresa_id, role_id;

-- 3.2 Corregir usuarios con role_id=1 en empresa diferente a 13 → degradar a role_id=2
UPDATE wp_team_humano
SET role_id = 2,
    updated_at = NOW()
WHERE role_id = 1 AND empresa_id != 13;

-- 3.3 Corregir enterprise_id NULL
UPDATE wp_team_humano
SET enterprise_id = empresa_id,
    updated_at = NOW()
WHERE enterprise_id IS NULL;

-- 3.4 Corregir enterprise_id inconsistente para usuarios no dev team
UPDATE wp_team_humano
SET enterprise_id = empresa_id,
    updated_at = NOW()
WHERE role_id != 1 AND enterprise_id != empresa_id;

-- ============================================================================
-- PASO 4: Verificar el resultado
-- ============================================================================
SELECT 
  COUNT(*) as total_usuarios,
  COUNT(*) FILTER (WHERE role_id = 1 AND empresa_id != 13) as dev_team_empresa_incorrecta,
  COUNT(*) FILTER (WHERE enterprise_id IS NULL) as enterprise_id_null,
  COUNT(*) FILTER (WHERE enterprise_id != empresa_id AND role_id != 1) as enterprise_inconsistente,
  COUNT(*) FILTER (WHERE role_id = 1 AND empresa_id = 13) as dev_team_correcto
FROM wp_team_humano;

-- ============================================================================
-- NOTAS DE SEGURIDAD
-- ============================================================================
-- Este trigger garantiza:
-- 1. Solo empleados de Urpe AI Lab (empresa 13) pueden ser dev team (role_id=1)
-- 2. Nadie puede tener enterprise_id NULL
-- 3. Usuarios normales siempre tienen enterprise_id = empresa_id
-- 4. El frontend también valida estas reglas, pero la DB es la última línea de defensa
-- ============================================================================
