-- ============================================================================
-- EMAIL MARKETING ANALYTICS RPC
-- Proporciona métricas globales y por campaña sin límites de paginación
-- Excluye emails transaccionales (metadata->>'email_kind' = 'transactional')
-- ============================================================================

CREATE OR REPLACE FUNCTION get_email_marketing_stats(p_empresa_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_enviados BIGINT;
    v_total_entregados BIGINT;
    v_total_abiertos BIGINT;
    v_campaign_stats JSONB;
BEGIN
    -- 1. Totales Globales (excluyendo transaccionales)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE e.estado IN ('enviado', 'abierto', 'clic')),
        COUNT(*) FILTER (WHERE e.estado IN ('abierto', 'clic'))
    INTO
        v_total_enviados,
        v_total_entregados,
        v_total_abiertos
    FROM wp_email_envio e
    JOIN wp_contactos c ON e.contacto_id = c.id
    WHERE c.empresa_id = p_empresa_id
      AND (e.metadata->>'email_kind' IS NULL OR e.metadata->>'email_kind' <> 'transactional');

    -- 2. Estadísticas por Campaña (excluyendo transaccionales)
    WITH campaign_counts AS (
        SELECT
            e.campana_id,
            COUNT(*) as total_enviados,
            COUNT(*) FILTER (WHERE e.estado IN ('enviado', 'abierto', 'clic')) as total_entregados,
            COUNT(*) FILTER (WHERE e.estado IN ('abierto', 'clic')) as total_abiertos
        FROM wp_email_envio e
        JOIN wp_contactos c ON e.contacto_id = c.id
        WHERE c.empresa_id = p_empresa_id
          AND (e.metadata->>'email_kind' IS NULL OR e.metadata->>'email_kind' <> 'transactional')
        GROUP BY e.campana_id
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'campana_id', cc.campana_id,
            'total_enviados', cc.total_enviados,
            'total_entregados', cc.total_entregados,
            'total_abiertos', cc.total_abiertos,
            'tasa_apertura', CASE WHEN cc.total_enviados > 0 THEN (cc.total_abiertos::float / cc.total_enviados::float) * 100 ELSE 0 END
        )
    ) INTO v_campaign_stats
    FROM campaign_counts cc;

    -- 3. Retornar objeto consolidado
    RETURN jsonb_build_object(
        'overall', jsonb_build_object(
            'total_enviados', v_total_enviados,
            'total_entregados', v_total_entregados,
            'total_abiertos', v_total_abiertos,
            'tasa_entrega', CASE WHEN v_total_enviados > 0 THEN (v_total_entregados::float / v_total_enviados::float) * 100 ELSE 0 END,
            'tasa_apertura', CASE WHEN v_total_enviados > 0 THEN (v_total_abiertos::float / v_total_enviados::float) * 100 ELSE 0 END
        ),
        'campaigns', COALESCE(v_campaign_stats, '[]'::jsonb)
    );
END;
$$;

-- ============================================================================
-- ÍNDICES DE RENDIMIENTO para email marketing analytics
-- ============================================================================

-- Índice para el JOIN principal: wp_email_envio.contacto_id
CREATE INDEX IF NOT EXISTS idx_email_envio_contacto_id
ON wp_email_envio (contacto_id);

-- Índice para filtro por empresa
CREATE INDEX IF NOT EXISTS idx_contactos_empresa_id
ON wp_contactos (empresa_id);

-- Índice para excluir transaccionales eficientemente
CREATE INDEX IF NOT EXISTS idx_email_envio_email_kind
ON wp_email_envio ((metadata->>'email_kind'));

-- Índice compuesto para el patrón más frecuente: JOIN + filtro de estado
CREATE INDEX IF NOT EXISTS idx_email_envio_contacto_estado
ON wp_email_envio (contacto_id, estado);
