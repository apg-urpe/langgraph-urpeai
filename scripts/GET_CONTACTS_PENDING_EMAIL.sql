-- ============================================================================
-- FUNCIÓN: get_contacts_pending_email
-- Busca contactos que requieren envío de correo basado en campañas activas
-- ============================================================================

CREATE OR REPLACE FUNCTION get_contacts_pending_email(
    p_empresa_id BIGINT,
    p_campana_id BIGINT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    contacto_id BIGINT,
    contacto_nombre TEXT,
    contacto_apellido TEXT,
    contacto_email TEXT,
    contacto_telefono TEXT,
    campana_id BIGINT,
    campana_nombre TEXT,
    audiencia_id BIGINT,
    audiencia_nombre TEXT,
    proximo_envio_en TIMESTAMPTZ,
    ultimo_estado TEXT,
    dias_desde_ultimo_envio INTEGER,
    secuencia_siguiente INTEGER,
    motivo_envio TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH campanas_activas AS (
        -- Campañas activas de la empresa o del sistema
        SELECT 
            c.id as campana_id,
            c.nombre as campana_nombre,
            c.audiencia_id,
            c.cadencia_dias,
            c.total_toques,
            a.nombre as audiencia_nombre
        FROM wp_email_campanas c
        LEFT JOIN wp_marketing_audiencias a ON c.audiencia_id = a.id
        WHERE c.estado = 'activa'
          AND (c.empresa_id = p_empresa_id OR c.empresa_id IS NULL)
          AND (p_campana_id IS NULL OR c.id = p_campana_id)
    ),
    
    contactos_audiencia AS (
        -- Contactos que pertenecen a las audiencias de campañas activas
        SELECT DISTINCT
            co.id as contacto_id,
            co.nombre,
            co.apellido, 
            co.email,
            co.telefono,
            ca.campana_id,
            ca.campana_nombre,
            ca.audiencia_id,
            ca.audiencia_nombre,
            ca.cadencia_dias,
            ca.total_toques
        FROM wp_contactos co
        INNER JOIN campanas_activas ca ON TRUE
        WHERE co.empresa_id = p_empresa_id
          AND co.email IS NOT NULL 
          AND co.email != ''
          AND (
            -- Contactos en audiencias estáticas
            (ca.audiencia_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM wp_marketing_audiencia_contacto mac 
                WHERE mac.audiencia_id = ca.audiencia_id 
                  AND mac.contacto_id = co.id
            ))
            OR
            -- Campañas sin audiencia específica (aplican a todos)
            ca.audiencia_id IS NULL
          )
    ),
    
    ultimo_envio_por_contacto AS (
        -- Último envío por contacto y campaña
        SELECT 
            e.contacto_id,
            e.campana_id,
            MAX(e.secuencia) as ultima_secuencia,
            MAX(e.enviado_en) as ultimo_envio_fecha,
            (SELECT estado FROM wp_email_envio e2 
             WHERE e2.contacto_id = e.contacto_id 
               AND e2.campana_id = e.campana_id 
               AND e2.secuencia = MAX(e.secuencia)
             ORDER BY e2.created_at DESC LIMIT 1) as ultimo_estado
        FROM wp_email_envio e
        INNER JOIN wp_contactos c ON e.contacto_id = c.id
        WHERE c.empresa_id = p_empresa_id
        GROUP BY e.contacto_id, e.campana_id
    ),
    
    contactos_pendientes AS (
        SELECT 
            ca.contacto_id,
            ca.nombre,
            ca.apellido,
            ca.email,
            ca.telefono,
            ca.campana_id,
            ca.campana_nombre,
            ca.audiencia_id,
            ca.audiencia_nombre,
            ca.cadencia_dias,
            ca.total_toques,
            ue.ultima_secuencia,
            ue.ultimo_envio_fecha,
            ue.ultimo_estado,
            COALESCE(ue.ultima_secuencia, 0) + 1 as secuencia_siguiente,
            CASE 
                WHEN ue.ultimo_envio_fecha IS NULL THEN NOW()
                ELSE ue.ultimo_envio_fecha + (ca.cadencia_dias || ' days')::INTERVAL
            END as proximo_envio_calculado,
            CASE 
                WHEN ue.ultimo_envio_fecha IS NULL THEN 
                    EXTRACT(days FROM NOW() - NOW())::INTEGER
                ELSE 
                    EXTRACT(days FROM NOW() - ue.ultimo_envio_fecha)::INTEGER
            END as dias_desde_ultimo
        FROM contactos_audiencia ca
        LEFT JOIN ultimo_envio_por_contacto ue ON ca.contacto_id = ue.contacto_id 
                                                AND ca.campana_id = ue.campana_id
        WHERE 
            -- Nunca se ha enviado nada
            (ue.contacto_id IS NULL)
            OR
            -- Ya pasó el tiempo de cadencia y no ha completado la secuencia
            (ue.ultimo_envio_fecha IS NOT NULL 
             AND ue.ultimo_envio_fecha + (ca.cadencia_dias || ' days')::INTERVAL <= NOW()
             AND (ca.total_toques IS NULL OR ue.ultima_secuencia < ca.total_toques)
             AND ue.ultimo_estado NOT IN ('fallido', 'cancelado'))
            OR
            -- Hay envíos fallidos que se pueden reintentar
            (ue.ultimo_estado = 'fallido' 
             AND ue.ultimo_envio_fecha + INTERVAL '1 hour' <= NOW())
    )
    
    SELECT 
        cp.contacto_id,
        cp.nombre::TEXT,
        cp.apellido::TEXT,
        cp.email::TEXT,
        cp.telefono::TEXT,
        cp.campana_id,
        cp.campana_nombre::TEXT,
        cp.audiencia_id,
        cp.audiencia_nombre::TEXT,
        cp.proximo_envio_calculado,
        COALESCE(cp.ultimo_estado, 'nuevo')::TEXT,
        cp.dias_desde_ultimo,
        cp.secuencia_siguiente,
        CASE 
            WHEN cp.ultima_secuencia IS NULL THEN 'Primer envío'
            WHEN cp.ultimo_estado = 'fallido' THEN 'Reintento por fallo'
            ELSE 'Siguiente en secuencia'
        END::TEXT as motivo_envio
    FROM contactos_pendientes cp
    ORDER BY 
        CASE WHEN cp.ultimo_estado = 'fallido' THEN 1 ELSE 2 END, -- Fallos primero
        cp.proximo_envio_calculado ASC,
        cp.contacto_id ASC
    LIMIT p_limit;
END;
$$;

-- ============================================================================
-- FUNCIÓN AUXILIAR: get_contacts_ready_to_send
-- Versión simplificada que solo retorna contactos listos AHORA
-- ============================================================================

CREATE OR REPLACE FUNCTION get_contacts_ready_to_send(
    p_empresa_id BIGINT,
    p_campana_id BIGINT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    contacto_id BIGINT,
    contacto_email TEXT,
    campana_id BIGINT,
    secuencia INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pending.contacto_id,
        pending.contacto_email,
        pending.campana_id,
        pending.secuencia_siguiente
    FROM get_contacts_pending_email(p_empresa_id, p_campana_id, p_limit) pending
    WHERE pending.proximo_envio_en <= NOW();
END;
$$;

-- ============================================================================
-- COMENTARIOS Y USO
-- ============================================================================

COMMENT ON FUNCTION get_contacts_pending_email IS 
'Busca contactos que requieren envío de correo basado en:
- Campañas activas de la empresa
- Audiencias asignadas a las campañas
- Cadencia de días configurada
- Secuencias completadas vs total_toques
- Estados de envíos previos (excluye fallidos/cancelados)
- Reintentos para envíos fallidos después de 1 hora';

COMMENT ON FUNCTION get_contacts_ready_to_send IS 
'Versión simplificada que retorna solo contactos listos para envío inmediato.
Útil para procesos automatizados que ejecutan envíos.';

-- ============================================================================
-- EJEMPLOS DE USO
-- ============================================================================

-- Ver todos los contactos pendientes de una empresa
-- SELECT * FROM get_contacts_pending_email(13);

-- Ver contactos de una campaña específica
-- SELECT * FROM get_contacts_pending_email(13, 5);

-- Ver solo contactos listos para envío inmediato
-- SELECT * FROM get_contacts_ready_to_send(13, NULL, 20);

-- Contar contactos pendientes por campaña
-- SELECT campana_nombre, COUNT(*) as contactos_pendientes 
-- FROM get_contacts_pending_email(13) 
-- GROUP BY campana_id, campana_nombre;
