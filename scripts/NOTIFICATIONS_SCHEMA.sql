-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS SCHEMA v2.0
-- Sistema de Notificaciones del Equipo - Urpe AI Lab
-- ═══════════════════════════════════════════════════════════════════════════════

-- =====================================================
-- 1. VERIFICAR/CREAR TABLA wp_notificaciones_team
-- =====================================================

CREATE TABLE IF NOT EXISTS wp_notificaciones_team (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    empresa_id INT NOT NULL REFERENCES wp_empresas(id) ON DELETE CASCADE,
    asesor_id INT REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    contacto_id INT REFERENCES wp_contactos(id) ON DELETE SET NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'sistema',
    mensaje TEXT NOT NULL,
    visto BOOLEAN DEFAULT FALSE,
    requiere_respuesta BOOLEAN DEFAULT FALSE,
    respuesta TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    archivado BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE wp_notificaciones_team IS 'Notificaciones para el equipo humano - Centro de Actividad';
COMMENT ON COLUMN wp_notificaciones_team.asesor_id IS 'Si es NULL, la notificación es broadcast para toda la empresa';
COMMENT ON COLUMN wp_notificaciones_team.tipo IS 'Tipos: human_in_the_loop, nueva_cita, mensaje_urgente, tarea_asignada, recordatorio, sistema, tarea_mencion, tarea_estado, tarea_vencimiento_proximo, tarea_vencida, tarea_comentario, tarea_item_completado, proyecto_costo, deep_research';

-- =====================================================
-- 2. AGREGAR COLUMNAS FALTANTES (si no existen)
-- =====================================================

DO $$ 
BEGIN
    -- Columna archivado para soft delete
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wp_notificaciones_team' AND column_name = 'archivado'
    ) THEN
        ALTER TABLE wp_notificaciones_team ADD COLUMN archivado BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN wp_notificaciones_team.archivado IS 'Soft delete: notificación archivada';
    END IF;

    -- Columna metadata para datos adicionales
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wp_notificaciones_team' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE wp_notificaciones_team ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- =====================================================
-- 3. ÍNDICES OPTIMIZADOS
-- =====================================================

-- Índice principal: empresa + fecha (para listado con paginación)
CREATE INDEX IF NOT EXISTS idx_notificaciones_empresa_fecha 
ON wp_notificaciones_team(empresa_id, created_at DESC);

-- Índice para filtrar por asesor específico
CREATE INDEX IF NOT EXISTS idx_notificaciones_asesor 
ON wp_notificaciones_team(asesor_id) WHERE asesor_id IS NOT NULL;

-- Índice para no leídas (filtro más común)
CREATE INDEX IF NOT EXISTS idx_notificaciones_no_leidas 
ON wp_notificaciones_team(empresa_id, visto) WHERE visto = FALSE;

-- Índice para requieren respuesta (HITL)
CREATE INDEX IF NOT EXISTS idx_notificaciones_requiere_respuesta 
ON wp_notificaciones_team(empresa_id, requiere_respuesta) WHERE requiere_respuesta = TRUE AND visto = FALSE;

-- Índice por tipo (para filtrado)
CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo 
ON wp_notificaciones_team(empresa_id, tipo);

-- Índice para contacto (ver notificaciones de un contacto)
CREATE INDEX IF NOT EXISTS idx_notificaciones_contacto 
ON wp_notificaciones_team(contacto_id) WHERE contacto_id IS NOT NULL;

-- Índice para archivadas
CREATE INDEX IF NOT EXISTS idx_notificaciones_archivadas 
ON wp_notificaciones_team(empresa_id, archivado) WHERE archivado = TRUE;

-- =====================================================
-- 4. RLS (Row Level Security)
-- =====================================================

-- Habilitar RLS
ALTER TABLE wp_notificaciones_team ENABLE ROW LEVEL SECURITY;

-- Política: Roles 1/2 ven toda su empresa; rol 3 solo las notificaciones asignadas a su asesor_id
DROP POLICY IF EXISTS notificaciones_select_policy ON wp_notificaciones_team;
CREATE POLICY notificaciones_select_policy ON wp_notificaciones_team
    FOR SELECT
    USING (
        empresa_id IN (
            SELECT empresa_id FROM wp_team_humano 
            WHERE auth_uid = auth.uid()
        )
        AND (
            EXISTS (
                SELECT 1
                FROM wp_team_humano th
                WHERE th.auth_uid = auth.uid()
                  AND th.empresa_id = wp_notificaciones_team.empresa_id
                  AND th.role_id IN (1, 2)
            )
            OR asesor_id IN (
                SELECT id FROM wp_team_humano 
                WHERE auth_uid = auth.uid()
            )
        )
    );

-- Política: Inserción solo para su empresa
DROP POLICY IF EXISTS notificaciones_insert_policy ON wp_notificaciones_team;
CREATE POLICY notificaciones_insert_policy ON wp_notificaciones_team
    FOR INSERT
    WITH CHECK (
        empresa_id IN (
            SELECT empresa_id FROM wp_team_humano 
            WHERE auth_uid = auth.uid()
        )
    );

-- Política: Roles 1/2 actualizan toda su empresa; rol 3 solo sus registros
DROP POLICY IF EXISTS notificaciones_update_policy ON wp_notificaciones_team;
CREATE POLICY notificaciones_update_policy ON wp_notificaciones_team
    FOR UPDATE
    USING (
        empresa_id IN (
            SELECT empresa_id FROM wp_team_humano 
            WHERE auth_uid = auth.uid()
        )
        AND (
            EXISTS (
                SELECT 1
                FROM wp_team_humano th
                WHERE th.auth_uid = auth.uid()
                  AND th.empresa_id = wp_notificaciones_team.empresa_id
                  AND th.role_id IN (1, 2)
            )
            OR asesor_id IN (
                SELECT id FROM wp_team_humano 
                WHERE auth_uid = auth.uid()
            )
        )
    );

-- Política: Roles 1/2 eliminan toda su empresa; rol 3 solo sus registros
DROP POLICY IF EXISTS notificaciones_delete_policy ON wp_notificaciones_team;
CREATE POLICY notificaciones_delete_policy ON wp_notificaciones_team
    FOR DELETE
    USING (
        empresa_id IN (
            SELECT empresa_id FROM wp_team_humano 
            WHERE auth_uid = auth.uid()
        )
        AND (
            EXISTS (
                SELECT 1
                FROM wp_team_humano th
                WHERE th.auth_uid = auth.uid()
                  AND th.empresa_id = wp_notificaciones_team.empresa_id
                  AND th.role_id IN (1, 2)
            )
            OR asesor_id IN (
                SELECT id FROM wp_team_humano 
                WHERE auth_uid = auth.uid()
            )
        )
    );

-- =====================================================
-- 5. FUNCIÓN PARA STATS OPTIMIZADAS (single query)
-- =====================================================

CREATE OR REPLACE FUNCTION get_notification_stats(p_empresa_id INT, p_asesor_id INT DEFAULT NULL)
RETURNS TABLE (
    total BIGINT,
    unread BIGINT,
    requires_response BIGINT,
    by_type JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE NOT visto) AS unread,
        COUNT(*) FILTER (WHERE requiere_respuesta AND NOT visto) AS requires_response,
        jsonb_object_agg(
            COALESCE(tipo, 'sistema'), 
            tipo_count
        ) AS by_type
    FROM (
        SELECT 
            tipo,
            COUNT(*) AS tipo_count
        FROM wp_notificaciones_team
        WHERE empresa_id = p_empresa_id
          AND (p_asesor_id IS NULL OR asesor_id IS NULL OR asesor_id = p_asesor_id)
          AND NOT archivado
        GROUP BY tipo
    ) type_counts
    CROSS JOIN (
        SELECT 
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE NOT visto) AS unread,
            COUNT(*) FILTER (WHERE requiere_respuesta AND NOT visto) AS requires_response
        FROM wp_notificaciones_team
        WHERE empresa_id = p_empresa_id
          AND (p_asesor_id IS NULL OR asesor_id IS NULL OR asesor_id = p_asesor_id)
          AND NOT archivado
    ) stats;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_notification_stats IS 'Obtiene estadísticas de notificaciones en una sola query optimizada';

-- =====================================================
-- 6. TRIGGER PARA REALTIME (opcional, para debugging)
-- =====================================================

-- El trigger de Realtime se configura en el dashboard de Supabase
-- Asegúrate de que esté habilitado para INSERT, UPDATE, DELETE

-- =====================================================
-- 7. VISTA PARA NOTIFICACIONES CON CONTACTO
-- =====================================================

CREATE OR REPLACE VIEW vw_notificaciones_con_contacto AS
SELECT 
    n.*,
    c.nombre AS contact_nombre,
    c.apellido AS contact_apellido,
    c.telefono AS contact_telefono,
    c.ultima_interaccion AS contact_ultima_interaccion
FROM wp_notificaciones_team n
LEFT JOIN wp_contactos c ON n.contacto_id = c.id;

COMMENT ON VIEW vw_notificaciones_con_contacto IS 'Vista que incluye datos del contacto para evitar JOIN en el frontend';

-- =====================================================
-- 8. FUNCIÓN PARA MARCAR TODAS COMO LEÍDAS
-- =====================================================

CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_empresa_id INT, p_asesor_id INT DEFAULT NULL)
RETURNS INT AS $$
DECLARE
    updated_count INT;
BEGIN
    UPDATE wp_notificaciones_team
    SET visto = TRUE
    WHERE empresa_id = p_empresa_id
      AND NOT visto
      AND (p_asesor_id IS NULL OR asesor_id IS NULL OR asesor_id = p_asesor_id)
      AND NOT archivado;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_all_notifications_read IS 'Marca todas las notificaciones de un usuario como leídas';

-- =====================================================
-- FIN DEL SCHEMA
-- =====================================================
