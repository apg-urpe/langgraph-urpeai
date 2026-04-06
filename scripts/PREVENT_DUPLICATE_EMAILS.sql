-- ============================================================================
-- PREVENCIÓN DE EMAILS DUPLICADOS EN WP_TEAM_HUMANO
-- 
-- Problema: El constraint UNIQUE es case-sensitive, permitiendo:
--   - rigoberto@email.com
--   - Rigoberto@email.com
--   - RIGOBERTO@EMAIL.COM
--
-- Solución: Índice único con función LOWER() + trigger de normalización
-- ============================================================================

-- ============================================
-- PASO 1: Limpiar duplicados existentes
-- ============================================

-- Primero, identificar duplicados (mantener el registro más reciente)
WITH duplicates AS (
  SELECT 
    id,
    email,
    LOWER(email) as normalized_email,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email), empresa_id 
      ORDER BY 
        CASE WHEN auth_uid IS NOT NULL THEN 0 ELSE 1 END, -- Priorizar con auth
        is_active DESC,                                   -- Priorizar activos
        created_at DESC                                   -- Priorizar más reciente
    ) as rn
  FROM wp_team_humano
  WHERE deleted IS NULL
)
SELECT 
  id,
  email,
  normalized_email,
  created_at,
  rn
FROM duplicates
WHERE rn > 1
ORDER BY normalized_email, rn;

-- ============================================
-- PASO 2: Marcar duplicados como eliminados (ejecutar solo si hay duplicados)
-- ============================================
-- Descomenta y ejecuta esto SOLO si el query anterior muestra duplicados:

-- UPDATE wp_team_humano 
-- SET deleted = NOW()
-- WHERE id IN (
--   SELECT id FROM (
--     WITH duplicates AS (
--       SELECT 
--         id,
--         ROW_NUMBER() OVER (
--           PARTITION BY LOWER(email), empresa_id 
--           ORDER BY 
--             CASE WHEN auth_uid IS NOT NULL THEN 0 ELSE 1 END,
--             is_active DESC,
--             created_at DESC
--         ) as rn
--       FROM wp_team_humano
--       WHERE deleted IS NULL
--     )
--     SELECT id FROM duplicates WHERE rn > 1
--   ) to_delete
-- );

-- ============================================
-- PASO 3: Crear índice único case-insensitive
-- ============================================

-- Eliminar índice anterior si existe
DROP INDEX IF EXISTS idx_team_humano_email_lower;

-- Crear índice único case-insensitive por empresa
-- Esto previene: rigoberto@email.com y Rigoberto@email.com en la misma empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_humano_email_lower_empresa 
ON wp_team_humano (LOWER(email), empresa_id) 
WHERE deleted IS NULL;

-- ============================================
-- PASO 4: Trigger para normalizar email automáticamente
-- ============================================

CREATE OR REPLACE FUNCTION normalize_team_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Convertir email a minúsculas antes de insertar/actualizar
  NEW.email = LOWER(NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger anterior si existe
DROP TRIGGER IF EXISTS trg_normalize_team_email ON wp_team_humano;

-- Crear trigger
CREATE TRIGGER trg_normalize_team_email
  BEFORE INSERT OR UPDATE OF email ON wp_team_humano
  FOR EACH ROW
  EXECUTE FUNCTION normalize_team_email();

-- ============================================
-- PASO 5: Verificación
-- ============================================

-- Verificar que no haya duplicados
SELECT 
  LOWER(email) as normalized_email,
  empresa_id,
  COUNT(*) as count
FROM wp_team_humano
WHERE deleted IS NULL
GROUP BY LOWER(email), empresa_id
HAVING COUNT(*) > 1;

-- Resultado esperado: 0 filas (sin duplicados)

-- ============================================
-- NOTAS DE IMPLEMENTACIÓN
-- ============================================
-- 
-- 1. El índice idx_team_humano_email_lower_empresa previene duplicados
--    case-insensitive POR EMPRESA. Esto permite que el mismo email exista
--    en empresas diferentes (multi-tenant válido).
--
-- 2. El trigger trg_normalize_team_email asegura que siempre se guarde
--    el email en minúsculas, previniendo inconsistencias.
--
-- 3. Si necesitas permitir emails duplicados temporalmente (ej: migración),
--    comenta el índice único y mantén solo el trigger de normalización.
--
-- 4. Para verificar el estado actual de duplicados:
--    SELECT LOWER(email), empresa_id, COUNT(*) 
--    FROM wp_team_humano 
--    WHERE deleted IS NULL 
--    GROUP BY LOWER(email), empresa_id 
--    HAVING COUNT(*) > 1;
--
-- ============================================================================
