-- ============================================================
-- FUNNEL REORDER RPC - 2026-02-24
-- Problema: reorder hace 2*N requests HTTP secuenciales, lento y frágil
-- Solución: RPC atómica que reordena en una sola transacción
-- ============================================================
-- INSTRUCCIONES:
--   1. Ejecutar en Supabase SQL Editor (Settings > SQL Editor)
--   2. Ejecutar TODO el script de una vez
--   3. Verificar con el bloque VERIFICACIÓN al final
-- ============================================================

-- ============================================================
-- FUNCIÓN 1: reorder_funnel_stages
-- Reordena etapas atómicamente (1 request, 1 transacción)
-- Evita violación de UNIQUE constraint con offset temporal
-- ============================================================
CREATE OR REPLACE FUNCTION reorder_funnel_stages(
  p_stage_ids BIGINT[],
  p_enterprise_id BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_offset INT := 100000; -- offset temporal para evitar colisiones UNIQUE
  i INT;
BEGIN
  -- Validación: verificar que todos los IDs pertenecen a la empresa
  SELECT COUNT(*)
  INTO v_count
  FROM wp_empresa_embudo
  WHERE id = ANY(p_stage_ids)
    AND empresa_id = p_enterprise_id;

  IF v_count != array_length(p_stage_ids, 1) THEN
    RAISE EXCEPTION 'Stage IDs do not match enterprise %', p_enterprise_id;
  END IF;

  -- Paso 1: Mover todos a ordenes temporales altos (evita UNIQUE conflicts)
  UPDATE wp_empresa_embudo
  SET orden_etapa = orden_etapa + v_offset
  WHERE empresa_id = p_enterprise_id
    AND id = ANY(p_stage_ids);

  -- Paso 2: Asignar ordenes finales basados en posición en el array
  FOR i IN 1..array_length(p_stage_ids, 1) LOOP
    UPDATE wp_empresa_embudo
    SET orden_etapa = i
    WHERE id = p_stage_ids[i]
      AND empresa_id = p_enterprise_id;
  END LOOP;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- FUNCIÓN 2: get_next_funnel_order
-- Retorna el siguiente orden disponible para una empresa
-- Garantiza que nuevas etapas siempre van al final
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_funnel_order(
  p_enterprise_id BIGINT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_order INT;
BEGIN
  SELECT COALESCE(MAX(orden_etapa), 0)
  INTO v_max_order
  FROM wp_empresa_embudo
  WHERE empresa_id = p_enterprise_id;

  RETURN v_max_order + 1;
END;
$$;

-- ============================================================
-- FUNCIÓN 3: fix_funnel_stage_orders
-- Utilidad para reparar órdenes rotos (etapas con 1000+)
-- Reasigna 1, 2, 3... basado en orden actual
-- ============================================================
CREATE OR REPLACE FUNCTION fix_funnel_stage_orders(
  p_enterprise_id BIGINT
) RETURNS TABLE(stage_id BIGINT, old_order INT, new_order INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT := 100000;
  rec RECORD;
  v_new_order INT := 0;
BEGIN
  -- Paso 1: Mover todos a offsets temporales
  UPDATE wp_empresa_embudo
  SET orden_etapa = orden_etapa + v_offset
  WHERE empresa_id = p_enterprise_id;

  -- Paso 2: Reasignar secuencialmente
  FOR rec IN
    SELECT id, orden_etapa AS current_order
    FROM wp_empresa_embudo
    WHERE empresa_id = p_enterprise_id
    ORDER BY orden_etapa ASC -- mantiene orden relativo original
  LOOP
    v_new_order := v_new_order + 1;

    UPDATE wp_empresa_embudo
    SET orden_etapa = v_new_order
    WHERE id = rec.id
      AND empresa_id = p_enterprise_id;

    -- Retornar info de lo que cambió
    stage_id := rec.id;
    old_order := rec.current_order - v_offset; -- orden original
    new_order := v_new_order;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ============================================================
-- PERMISOS: Permitir que usuarios autenticados llamen las RPCs
-- ============================================================
GRANT EXECUTE ON FUNCTION reorder_funnel_stages(BIGINT[], BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_funnel_order(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION fix_funnel_stage_orders(BIGINT) TO authenticated;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('reorder_funnel_stages', 'get_next_funnel_order', 'fix_funnel_stage_orders');

-- ============================================================
-- USO: Para reparar una empresa con órdenes rotos (ej: empresa 4)
-- SELECT * FROM fix_funnel_stage_orders(4);
-- ============================================================
