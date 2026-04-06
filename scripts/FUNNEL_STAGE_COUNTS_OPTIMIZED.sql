-- =============================================================================
-- FUNNEL STAGE COUNTS OPTIMIZED - Sistema de conteos resilientes para embudo
-- =============================================================================
-- Problema: fetchStageCounts trae TODOS los contactos y cuenta en JS
-- Solución: Función RPC que cuenta directamente en PostgreSQL con índices

-- =============================================================================
-- 1. FUNCIÓN RPC: get_funnel_stage_counts
-- =============================================================================
-- Retorna conteo de contactos por etapa de embudo de forma eficiente
-- Usa GROUP BY en la DB en lugar de traer todos los registros

CREATE OR REPLACE FUNCTION public.get_funnel_stage_counts(p_empresa_id BIGINT)
RETURNS TABLE (
  etapa_id BIGINT,
  count BIGINT
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    COALESCE(etapa_embudo, -1) as etapa_id,
    COUNT(*)::BIGINT as count
  FROM wp_contactos
  WHERE empresa_id = p_empresa_id
  GROUP BY COALESCE(etapa_embudo, -1)
  ORDER BY etapa_id;
$$;

-- Comentario explicativo
COMMENT ON FUNCTION public.get_funnel_stage_counts(BIGINT) IS 
'Retorna conteo de contactos por etapa de embudo. etapa_id=-1 representa contactos sin etapa asignada.';

-- =============================================================================
-- 2. ÍNDICE OPTIMIZADO PARA CONTEOS
-- =============================================================================
-- Índice parcial para acelerar los conteos por empresa y etapa

CREATE INDEX IF NOT EXISTS idx_wp_contactos_empresa_etapa_embudo
ON public.wp_contactos(empresa_id, etapa_embudo);

-- Índice para contactos sin etapa (NULL handling)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_empresa_etapa_null
ON public.wp_contactos(empresa_id)
WHERE etapa_embudo IS NULL;

-- =============================================================================
-- 3. TRIGGER: Sincronizar wp_contacto_estado_embudo automáticamente
-- =============================================================================
-- Cuando cambia etapa_embudo en wp_contactos, actualiza el historial

CREATE OR REPLACE FUNCTION public.sync_funnel_status_on_contact_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo actuar si etapa_embudo cambió
  IF OLD.etapa_embudo IS DISTINCT FROM NEW.etapa_embudo THEN
    -- Upsert en wp_contacto_estado_embudo
    INSERT INTO wp_contacto_estado_embudo (
      contacto_id,
      etapa_actual,
      etapa_anterior,
      fecha_ultimo_cambio,
      origen_cambio,
      notas
    ) VALUES (
      NEW.id,
      NEW.etapa_embudo,
      OLD.etapa_embudo,
      NOW(),
      'trigger',
      'Actualizado automáticamente por trigger'
    )
    ON CONFLICT (contacto_id) 
    DO UPDATE SET
      etapa_actual = EXCLUDED.etapa_actual,
      etapa_anterior = EXCLUDED.etapa_anterior,
      fecha_ultimo_cambio = EXCLUDED.fecha_ultimo_cambio,
      origen_cambio = CASE 
        WHEN wp_contacto_estado_embudo.origen_cambio = 'trigger' THEN 'trigger'
        ELSE wp_contacto_estado_embudo.origen_cambio -- Preserve manual/ia origin if set recently
      END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS trg_sync_funnel_status ON public.wp_contactos;
CREATE TRIGGER trg_sync_funnel_status
  AFTER UPDATE OF etapa_embudo ON public.wp_contactos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_funnel_status_on_contact_update();

-- =============================================================================
-- 4. FUNCIÓN RPC: get_funnel_stage_counts_with_filters
-- =============================================================================
-- Versión extendida que soporta filtros de equipo (para rol 3)

CREATE OR REPLACE FUNCTION public.get_funnel_stage_counts_filtered(
  p_empresa_id BIGINT,
  p_team_humano_ids BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  etapa_id BIGINT,
  count BIGINT
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    COALESCE(etapa_embudo, -1) as etapa_id,
    COUNT(*)::BIGINT as count
  FROM wp_contactos
  WHERE empresa_id = p_empresa_id
    AND (p_team_humano_ids IS NULL OR team_humano_id = ANY(p_team_humano_ids))
  GROUP BY COALESCE(etapa_embudo, -1)
  ORDER BY etapa_id;
$$;

COMMENT ON FUNCTION public.get_funnel_stage_counts_filtered(BIGINT, BIGINT[]) IS 
'Retorna conteo de contactos por etapa con filtro opcional por miembros del equipo.';

-- =============================================================================
-- 5. VISTA MATERIALIZADA (OPCIONAL - para empresas con muchos contactos)
-- =============================================================================
-- Descomentar si se necesita performance extrema (requiere REFRESH periódico)

-- CREATE MATERIALIZED VIEW IF NOT EXISTS mv_funnel_stage_counts AS
-- SELECT 
--   empresa_id,
--   COALESCE(etapa_embudo, -1) as etapa_id,
--   COUNT(*) as count
-- FROM wp_contactos
-- GROUP BY empresa_id, COALESCE(etapa_embudo, -1);

-- CREATE UNIQUE INDEX ON mv_funnel_stage_counts(empresa_id, etapa_id);

-- -- Función para refrescar la vista
-- CREATE OR REPLACE FUNCTION refresh_funnel_counts()
-- RETURNS void
-- LANGUAGE sql
-- SECURITY DEFINER
-- AS $$
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_funnel_stage_counts;
-- $$;

-- =============================================================================
-- 6. PERMISOS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_funnel_stage_counts(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_stage_counts_filtered(BIGINT, BIGINT[]) TO authenticated;

-- =============================================================================
-- NOTAS DE USO
-- =============================================================================
-- 
-- En el frontend, llamar:
-- const { data } = await supabase.rpc('get_funnel_stage_counts', { p_empresa_id: enterpriseId });
-- 
-- Resultado: [{ etapa_id: 1, count: 45 }, { etapa_id: 2, count: 30 }, { etapa_id: -1, count: 5 }]
-- donde etapa_id = -1 son contactos sin etapa asignada
--
-- Con filtro de equipo (para rol 3):
-- const { data } = await supabase.rpc('get_funnel_stage_counts_filtered', { 
--   p_empresa_id: enterpriseId,
--   p_team_humano_ids: [1, 2, 3] 
-- });
--
