-- ============================================================================
-- ENTERPRISE_ID_SYNC.sql
-- Sincroniza enterprise_id con empresa_id para TODOS los usuarios no dev team
-- Fecha: 30 Diciembre 2024
-- REGLA: Solo role_id=1 (Dev Team) puede tener enterprise_id diferente de empresa_id
-- ============================================================================

-- 1. Ver usuarios afectados ANTES de la corrección
SELECT 
  id, 
  nombre, 
  apellido, 
  email, 
  empresa_id, 
  enterprise_id, 
  role_id,
  CASE 
    WHEN enterprise_id IS NULL THEN '⚠️ NULL - Será asignado empresa_id'
    WHEN enterprise_id != empresa_id AND role_id != 1 THEN '🔴 INCONSISTENTE - Será corregido'
    WHEN enterprise_id != empresa_id AND role_id = 1 THEN '✅ Dev Team en modo observación'
    ELSE '✅ OK'
  END as estado
FROM wp_team_humano
WHERE enterprise_id IS NULL 
   OR (enterprise_id != empresa_id AND role_id != 1)
ORDER BY role_id, empresa_id;

-- 2. CORRECCIÓN PRINCIPAL: Sincronizar enterprise_id = empresa_id para TODOS los no dev team
-- Esto incluye:
--   a) Usuarios con enterprise_id NULL
--   b) Usuarios con enterprise_id diferente de empresa_id que NO son role_id=1
UPDATE wp_team_humano
SET enterprise_id = empresa_id,
    updated_at = NOW()
WHERE role_id != 1 
  AND (enterprise_id IS NULL OR enterprise_id != empresa_id);

-- 3. Verificar el resultado DESPUÉS de la corrección
SELECT 
  COUNT(*) as total_usuarios,
  COUNT(*) FILTER (WHERE enterprise_id IS NULL) as sin_enterprise_id,
  COUNT(*) FILTER (WHERE enterprise_id = empresa_id) as enterprise_igual_empresa,
  COUNT(*) FILTER (WHERE enterprise_id != empresa_id AND role_id = 1) as dev_team_observando,
  COUNT(*) FILTER (WHERE enterprise_id != empresa_id AND role_id != 1) as inconsistentes_restantes
FROM wp_team_humano;

-- ============================================================================
-- REGLAS DE NEGOCIO IMPORTANTES:
-- ============================================================================
-- 1. role_id = 1 (Dev Team): Puede tener enterprise_id diferente (modo observación)
-- 2. role_id != 1: enterprise_id DEBE ser igual a empresa_id SIEMPRE
-- 3. El frontend IGNORA enterprise_id para usuarios no dev team (usa empresa_id)
-- 4. Esta migración limpia datos inconsistentes en la DB
-- ============================================================================

-- 4. Crear índices para mejorar performance de consultas de seguridad
CREATE INDEX IF NOT EXISTS idx_team_humano_empresa_enterprise 
ON wp_team_humano(empresa_id, enterprise_id);

CREATE INDEX IF NOT EXISTS idx_team_humano_role_empresa 
ON wp_team_humano(role_id, empresa_id);

-- 5. (Opcional) Trigger para mantener consistencia automáticamente
-- Descomentar si quieres que la DB mantenga la regla automáticamente
/*
CREATE OR REPLACE FUNCTION enforce_enterprise_id_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el usuario NO es dev team (role_id != 1), forzar enterprise_id = empresa_id
  IF NEW.role_id IS NULL OR NEW.role_id != 1 THEN
    NEW.enterprise_id := NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_enterprise_id ON wp_team_humano;
CREATE TRIGGER trg_enforce_enterprise_id
  BEFORE INSERT OR UPDATE ON wp_team_humano
  FOR EACH ROW
  EXECUTE FUNCTION enforce_enterprise_id_consistency();
*/
