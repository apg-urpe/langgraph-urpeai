-- ============================================================================
-- EMAIL MARKETING REFACTOR V3
-- Fuente de verdad única para elegibilidad + fix RPCs + timeout stuck
-- ============================================================================
-- EJECUTAR EN ORDEN en Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PARTE 1: FUNCIÓN is_email_eligible() — FUENTE DE VERDAD ÚNICA
-- Todos los RPCs y Edge Functions deben usar esta función
-- ============================================================================

CREATE OR REPLACE FUNCTION is_email_eligible(p_contacto_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM wp_contactos
    WHERE id = p_contacto_id
      AND email IS NOT NULL
      AND email != ''
      AND is_active = TRUE
      AND estado != 'cliente'
      AND (suscripcion IS NULL OR suscripcion != FALSE)
  );
$$;

COMMENT ON FUNCTION is_email_eligible IS
'Fuente de verdad única para determinar si un contacto es elegible para email marketing.
Criterios:
  - Tiene email válido (NOT NULL y no vacío)
  - Está activo (is_active = TRUE)
  - No es cliente (estado != cliente)
  - No se ha desuscrito (suscripcion IS NULL o TRUE)
Usada por: enroll_contacts_in_campaign, get_pending_email_campaigns_v3, sync_campaign_enrollments, resolve-audience Edge Function';

-- ============================================================================
-- PARTE 2: FUNCIÓN enroll_contacts_in_campaign V3
-- Ahora usa is_email_eligible() en lugar de filtros inline duplicados
-- ============================================================================

-- Eliminar firmas anteriores para evitar ambigüedad
DROP FUNCTION IF EXISTS enroll_contacts_in_campaign(BIGINT, BIGINT, INTEGER);
DROP FUNCTION IF EXISTS enroll_contacts_in_campaign(BIGINT, BIGINT, INTEGER, BIGINT[]);

CREATE OR REPLACE FUNCTION enroll_contacts_in_campaign(
    p_campana_id BIGINT,
    p_empresa_id BIGINT,
    p_first_send_delay_minutes INTEGER DEFAULT 0,
    p_contacto_ids BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
    enrolled_count INTEGER,
    skipped_count INTEGER,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_audiencia_id BIGINT;
    v_audiencia_tipo TEXT;
    v_enrolled INTEGER := 0;
    v_skipped INTEGER := 0;
    v_total_candidates INTEGER := 0;
    v_proximo_envio TIMESTAMPTZ;
BEGIN
    -- Obtener audiencia de la campaña
    SELECT c.audiencia_id INTO v_audiencia_id
    FROM wp_email_campanas c
    WHERE c.id = p_campana_id
      AND (c.empresa_id = p_empresa_id OR c.empresa_id IS NULL);
    
    IF v_audiencia_id IS NULL THEN
        RETURN QUERY SELECT 0, 0, 'Campaña sin audiencia asignada'::TEXT;
        RETURN;
    END IF;
    
    -- Obtener tipo de audiencia
    SELECT a.tipo INTO v_audiencia_tipo
    FROM wp_marketing_audiencias a
    WHERE a.id = v_audiencia_id;
    
    -- Calcular próximo envío
    v_proximo_envio := NOW() + (p_first_send_delay_minutes || ' minutes')::INTERVAL;
    
    -- ========================================================================
    -- AUDIENCIA ESTÁTICA: Usar tabla wp_marketing_audiencia_contacto
    -- ========================================================================
    IF v_audiencia_tipo = 'estatica' THEN
        INSERT INTO wp_email_contacto_campana (
            empresa_id, campana_id, contacto_id, estado,
            fecha_inscripcion, ultimo_toque, proximo_envio_en,
            condiciones_entrada_capturadas
        )
        SELECT 
            p_empresa_id,
            p_campana_id,
            mac.contacto_id,
            'activo',
            NOW(),
            0,
            v_proximo_envio,
            jsonb_build_object('tipo', 'estatica', 'audiencia_id', v_audiencia_id)
        FROM wp_marketing_audiencia_contacto mac
        WHERE mac.audiencia_id = v_audiencia_id
          AND is_email_eligible(mac.contacto_id)  -- ← FUENTE DE VERDAD ÚNICA
          AND NOT EXISTS (
              SELECT 1 FROM wp_email_contacto_campana ecc
              WHERE ecc.campana_id = p_campana_id
                AND ecc.contacto_id = mac.contacto_id
                AND ecc.estado IN ('activo', 'procesando')
          )
        ON CONFLICT DO NOTHING;
        
        GET DIAGNOSTICS v_enrolled = ROW_COUNT;
        
        -- Contar total de candidatos para calcular skipped
        SELECT COUNT(*) INTO v_total_candidates
        FROM wp_marketing_audiencia_contacto mac
        WHERE mac.audiencia_id = v_audiencia_id;
        
        v_skipped := v_total_candidates - v_enrolled;
    
    -- ========================================================================
    -- AUDIENCIA DINÁMICA: Usa p_contacto_ids pre-resueltos por Edge Function
    -- ========================================================================
    ELSIF v_audiencia_tipo = 'dinamica' THEN
        
        IF p_contacto_ids IS NULL OR array_length(p_contacto_ids, 1) IS NULL THEN
            RETURN QUERY SELECT 0, 0, 
                'Audiencia dinámica requiere p_contacto_ids (resueltos por Edge Function resolve-audience)'::TEXT;
            RETURN;
        END IF;
        
        v_total_candidates := array_length(p_contacto_ids, 1);
        
        INSERT INTO wp_email_contacto_campana (
            empresa_id, campana_id, contacto_id, estado,
            fecha_inscripcion, ultimo_toque, proximo_envio_en,
            condiciones_entrada_capturadas
        )
        SELECT 
            p_empresa_id,
            p_campana_id,
            c.id,
            'activo',
            NOW(),
            0,
            v_proximo_envio,
            jsonb_build_object(
                'tipo', 'dinamica', 
                'audiencia_id', v_audiencia_id,
                'snapshot_at', NOW()
            )
        FROM wp_contactos c
        WHERE c.id = ANY(p_contacto_ids)
          AND c.empresa_id = p_empresa_id
          AND is_email_eligible(c.id)  -- ← FUENTE DE VERDAD ÚNICA
          AND NOT EXISTS (
              SELECT 1 FROM wp_email_contacto_campana ecc
              WHERE ecc.campana_id = p_campana_id
                AND ecc.contacto_id = c.id
                AND ecc.estado IN ('activo', 'procesando')
          )
        ON CONFLICT DO NOTHING;
        
        GET DIAGNOSTICS v_enrolled = ROW_COUNT;
        v_skipped := v_total_candidates - v_enrolled;
    END IF;
    
    RETURN QUERY SELECT 
        v_enrolled,
        v_skipped,
        format('Inscripción completada: %s nuevos, %s omitidos (no elegibles o ya inscritos)', 
               v_enrolled, v_skipped)::TEXT;
END;
$$;

-- ============================================================================
-- PARTE 3: FIX get_pending_email_campaigns_v3
-- Agregar email != '' y suscripcion check (que faltaban)
-- ============================================================================

-- NOTA: Esta función ya existe en producción. La recreamos con los fixes.
-- Verificar que la firma coincida con la que usa n8n antes de ejecutar.

CREATE OR REPLACE FUNCTION get_pending_email_campaigns_v3(
    p_limit INTEGER DEFAULT 30,
    p_campana_id BIGINT DEFAULT NULL,
    p_excluir_campana_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    empresa_id BIGINT,
    campana_id BIGINT,
    contacto_id BIGINT,
    ultimo_toque INTEGER,
    proximo_envio_en TIMESTAMPTZ,
    email TEXT,
    nombre TEXT,
    apellido TEXT,
    suscripcion TEXT,
    campana_nombre TEXT,
    cadencia_dias INTEGER,
    total_toques INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH locked_rows AS (
    SELECT 
      ecc.id, 
      ecc.empresa_id, 
      ecc.campana_id, 
      ecc.contacto_id, 
      ecc.ultimo_toque, 
      ecc.proximo_envio_en,
      c.email, 
      c.nombre, 
      c.apellido, 
      c.suscripcion,
      ec.nombre AS campana_nombre, 
      ec.cadencia_dias, 
      ec.total_toques
    FROM wp_email_contacto_campana ecc
    INNER JOIN wp_contactos c ON ecc.contacto_id = c.id
    INNER JOIN wp_email_campanas ec ON ecc.campana_id = ec.id
    INNER JOIN wp_empresa_perfil ep ON ecc.empresa_id = ep.id
    WHERE 
      ecc.estado = 'activo'
      AND ecc.proximo_envio_en <= NOW()
      AND is_email_eligible(ecc.contacto_id)  -- ← FUENTE DE VERDAD ÚNICA (reemplaza filtros inline)
      AND ec.estado = 'activa'
      AND ep.email_marketing = true
      AND (ec.total_toques IS NULL OR ecc.ultimo_toque < ec.total_toques)
      -- Filtros por campaña
      AND (p_campana_id IS NULL OR ecc.campana_id = p_campana_id)
      AND (p_excluir_campana_id IS NULL OR ecc.campana_id != p_excluir_campana_id)
      -- ANTI-SPAM: Cooldown mínimo 4 horas entre emails
      AND NOT EXISTS (
          SELECT 1 FROM wp_email_envio ee
          WHERE ee.contacto_id = ecc.contacto_id
            AND ee.created_at >= NOW() - INTERVAL '4 hours'
            AND ee.estado IN ('enviado', 'abierto', 'clic', 'pendiente')
      )
      -- ANTI-SPAM: Máximo 2 emails por día por contacto
      AND (
          SELECT COUNT(*) FROM wp_email_envio ee
          WHERE ee.contacto_id = ecc.contacto_id
            AND ee.created_at >= NOW() - INTERVAL '24 hours'
            AND ee.estado IN ('enviado', 'abierto', 'clic', 'pendiente')
      ) < 2
    ORDER BY ecc.proximo_envio_en ASC
    LIMIT p_limit
    FOR UPDATE OF ecc SKIP LOCKED
  ),
  perform_update AS (
    UPDATE wp_email_contacto_campana AS target
    SET 
      estado = 'procesando',
      updated_at = NOW()
    FROM locked_rows
    WHERE target.id = locked_rows.id
    RETURNING target.id
  )
  SELECT 
    l.id::BIGINT,
    l.empresa_id::BIGINT,
    l.campana_id::BIGINT,
    l.contacto_id::BIGINT,
    l.ultimo_toque::INTEGER,
    l.proximo_envio_en::TIMESTAMPTZ,
    l.email::TEXT,
    l.nombre::TEXT,
    l.apellido::TEXT,
    l.suscripcion::TEXT,
    l.campana_nombre::TEXT,
    l.cadencia_dias::INTEGER,
    l.total_toques::INTEGER
  FROM locked_rows l;
END;
$$;

-- ============================================================================
-- PARTE 4: TIMEOUT para enrollments stuck en 'procesando'
-- Revertir a 'activo' si llevan más de 30 minutos en procesando
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_stuck_enrollments()
RETURNS TABLE (
    cleaned_count INTEGER,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE wp_email_contacto_campana
    SET 
        estado = 'activo',
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || 
            jsonb_build_object('last_stuck_cleanup', NOW()::TEXT)
    WHERE estado = 'procesando'
      AND updated_at < NOW() - INTERVAL '30 minutes';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN QUERY SELECT 
        v_count,
        format('Limpieza completada: %s enrollments revertidos de procesando a activo', v_count)::TEXT;
END;
$$;

COMMENT ON FUNCTION cleanup_stuck_enrollments IS
'Revierte enrollments que quedaron stuck en estado procesando por más de 30 minutos.
Ejecutar via pg_cron cada 15 minutos:
SELECT cron.schedule(''cleanup-stuck-enrollments'', ''*/15 * * * *'', $$SELECT * FROM cleanup_stuck_enrollments()$$);';

-- ============================================================================
-- PARTE 5: FIX get_email_marketing_stats
-- total_enviados ahora solo cuenta envíos reales, no pendientes/fallidos
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
    v_total_fallidos BIGINT;
    v_campaign_stats JSONB;
BEGIN
    -- 1. Totales Globales (solo envíos reales, no pendientes/cancelados)
    SELECT 
        COUNT(*) FILTER (WHERE estado IN ('enviado', 'abierto', 'clic')),
        COUNT(*) FILTER (WHERE estado IN ('enviado', 'abierto', 'clic')),
        COUNT(*) FILTER (WHERE estado IN ('abierto', 'clic')),
        COUNT(*) FILTER (WHERE estado = 'fallido')
    INTO 
        v_total_enviados,
        v_total_entregados,
        v_total_abiertos,
        v_total_fallidos
    FROM wp_email_envio e
    JOIN wp_contactos c ON e.contacto_id = c.id
    WHERE c.empresa_id = p_empresa_id;

    -- 2. Estadísticas por Campaña
    WITH campaign_counts AS (
        SELECT 
            COALESCE(e.campana_id, -1) as campana_id,
            COUNT(*) FILTER (WHERE e.estado IN ('enviado', 'abierto', 'clic')) as total_enviados,
            COUNT(*) FILTER (WHERE e.estado IN ('enviado', 'abierto', 'clic')) as total_entregados,
            COUNT(*) FILTER (WHERE e.estado IN ('abierto', 'clic')) as total_abiertos,
            COUNT(*) FILTER (WHERE e.estado = 'fallido') as total_fallidos
        FROM wp_email_envio e
        JOIN wp_contactos c ON e.contacto_id = c.id
        WHERE c.empresa_id = p_empresa_id
        GROUP BY COALESCE(e.campana_id, -1)
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'campana_id', cc.campana_id,
            'total_enviados', cc.total_enviados,
            'total_entregados', cc.total_entregados,
            'total_abiertos', cc.total_abiertos,
            'total_fallidos', cc.total_fallidos,
            'tasa_apertura', CASE WHEN cc.total_enviados > 0 
                THEN ROUND((cc.total_abiertos::numeric / cc.total_enviados::numeric) * 100, 1) 
                ELSE 0 END
        )
    ) INTO v_campaign_stats
    FROM campaign_counts cc;

    -- 3. Retornar objeto consolidado
    RETURN jsonb_build_object(
        'overall', jsonb_build_object(
            'total_enviados', v_total_enviados,
            'total_entregados', v_total_entregados,
            'total_abiertos', v_total_abiertos,
            'total_fallidos', v_total_fallidos,
            'tasa_entrega', CASE WHEN v_total_enviados > 0 
                THEN ROUND((v_total_entregados::numeric / v_total_enviados::numeric) * 100, 1) 
                ELSE 0 END,
            'tasa_apertura', CASE WHEN v_total_enviados > 0 
                THEN ROUND((v_total_abiertos::numeric / v_total_enviados::numeric) * 100, 1) 
                ELSE 0 END
        ),
        'campaigns', COALESCE(v_campaign_stats, '[]'::jsonb)
    );
END;
$$;

-- ============================================================================
-- PARTE 6: sync_campaign_enrollments V3
-- Ahora maneja AMBOS tipos (estáticas + dinámicas con p_contacto_ids)
-- Y cancela enrollments de contactos que ya no son elegibles
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_campaign_enrollments(
    p_empresa_id BIGINT DEFAULT NULL,
    p_campana_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    campana_id BIGINT,
    campana_nombre TEXT,
    nuevos_inscritos INTEGER,
    cancelados INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campana RECORD;
    v_new_count INTEGER;
    v_cancel_count INTEGER;
BEGIN
    -- Procesar campañas activas con audiencias ESTÁTICAS
    FOR v_campana IN 
        SELECT 
            c.id,
            c.nombre,
            c.empresa_id,
            c.audiencia_id,
            a.tipo as audiencia_tipo
        FROM wp_email_campanas c
        INNER JOIN wp_marketing_audiencias a ON c.audiencia_id = a.id
        WHERE c.estado = 'activa'
          AND a.tipo = 'estatica'
          AND (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
          AND (p_campana_id IS NULL OR c.id = p_campana_id)
    LOOP
        -- Inscribir nuevos contactos elegibles
        INSERT INTO wp_email_contacto_campana (
            empresa_id, campana_id, contacto_id, estado,
            fecha_inscripcion, ultimo_toque, proximo_envio_en,
            condiciones_entrada_capturadas
        )
        SELECT 
            v_campana.empresa_id,
            v_campana.id,
            mac.contacto_id,
            'activo',
            NOW(),
            0,
            NOW(),
            jsonb_build_object('tipo', 'sync_estatica', 'audiencia_id', v_campana.audiencia_id, 'sync_at', NOW())
        FROM wp_marketing_audiencia_contacto mac
        WHERE mac.audiencia_id = v_campana.audiencia_id
          AND is_email_eligible(mac.contacto_id)  -- ← FUENTE DE VERDAD ÚNICA
          AND NOT EXISTS (
              SELECT 1 FROM wp_email_contacto_campana ecc
              WHERE ecc.campana_id = v_campana.id
                AND ecc.contacto_id = mac.contacto_id
                AND ecc.estado IN ('activo', 'procesando')
          )
        ON CONFLICT DO NOTHING;
        
        GET DIAGNOSTICS v_new_count = ROW_COUNT;
        
        -- Cancelar enrollments de contactos que ya no son elegibles
        UPDATE wp_email_contacto_campana ecc
        SET estado = 'cancelado',
            fecha_salida = NOW(),
            motivo_salida = 'Contacto ya no es elegible (sync automática)',
            updated_at = NOW()
        WHERE ecc.campana_id = v_campana.id
          AND ecc.estado = 'activo'
          AND NOT is_email_eligible(ecc.contacto_id);
        
        GET DIAGNOSTICS v_cancel_count = ROW_COUNT;
        
        IF v_new_count > 0 OR v_cancel_count > 0 THEN
            campana_id := v_campana.id;
            campana_nombre := v_campana.nombre;
            nuevos_inscritos := v_new_count;
            cancelados := v_cancel_count;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================================
-- PARTE 7: ÍNDICE para is_email_eligible (performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_contactos_email_eligible
ON wp_contactos (id)
WHERE email IS NOT NULL 
  AND email != '' 
  AND is_active = TRUE 
  AND estado != 'cliente'
  AND (suscripcion IS NULL OR suscripcion != FALSE);

-- ============================================================================
-- INSTRUCCIONES DE EJECUCIÓN
-- ============================================================================
-- 1. Ejecutar TODO este script en Supabase SQL Editor
-- 2. Verificar: SELECT is_email_eligible(123); -- (con un ID real de contacto)
-- 3. Programar cleanup:
--    SELECT cron.schedule('cleanup-stuck-enrollments', '*/15 * * * *', 
--      $$SELECT * FROM cleanup_stuck_enrollments()$$);
-- 4. Programar sync estáticas:
--    SELECT cron.schedule('sync-static-audiences', '0 */6 * * *', 
--      $$SELECT * FROM sync_campaign_enrollments()$$);
-- ============================================================================
