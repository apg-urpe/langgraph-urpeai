-- ============================================================================
-- RPC: get_enterprise_inbox
-- Retorna todas las conversaciones de una empresa ordenadas por el último
-- mensaje más reciente, sin importar el canal de origen.
--
-- Resolución de numero_id:
--   1) metadata->>'numero_id' en wp_conversaciones
--   2) wp_whatsapp_template_envios.numero_id vía conversacion_id
-- (puede ser NULL si la conversación no tiene número asociado)
-- ============================================================================

DROP FUNCTION IF EXISTS get_enterprise_inbox(int8);

CREATE OR REPLACE FUNCTION get_enterprise_inbox(p_empresa_id int8)
RETURNS TABLE (
  id                        int8,
  contacto_id               int8,
  nombre_contacto           text,
  telefono_contacto         text,
  ultimo_mensaje_contenido  text,
  ultimo_mensaje_fecha      timestamptz,
  canal                     text,
  estado                    text,
  numero_id                 int8,
  nombre_numero             text,
  telefono_numero           text,
  remitente_ultimo_mensaje  text,
  contacto_origen           text,
  contacto_ultima_interaccion timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Paso 1: Conversaciones de la empresa (base, usa índice empresa_id)
  WITH empresa_convs AS (
    SELECT
      c.id AS conv_id,
      c.contacto_id,
      c.canal,
      c.seguimiento AS estado,
      (c.metadata->>'numero_id')::int8 AS metadata_numero_id
    FROM wp_conversaciones c
    WHERE c.empresa_id = p_empresa_id
  ),
  -- Paso 2: Último envío de plantilla por conversación
  -- INNER JOIN con empresa_convs evita escanear toda la tabla
  latest_template AS (
    SELECT DISTINCT ON (e.conversacion_id)
      e.conversacion_id,
      e.numero_id
    FROM wp_whatsapp_template_envios e
    INNER JOIN empresa_convs ec ON ec.conv_id = e.conversacion_id
    WHERE e.numero_id IS NOT NULL
    ORDER BY e.conversacion_id, e.created_at DESC
  ),
  -- Paso 3: Resolver numero_id final para cada conversación
  valid_convs AS (
    SELECT
      ec.conv_id,
      ec.contacto_id,
      ec.canal,
      ec.estado,
      COALESCE(ec.metadata_numero_id, lt.numero_id) AS resolved_numero_id
    FROM empresa_convs ec
    LEFT JOIN latest_template lt ON lt.conversacion_id = ec.conv_id
  ),
  -- Paso 4: Último mensaje por conversación
  -- Filtra por empresa_id directamente (usa índice) en vez de hacer JOIN
  latest_msg AS (
    SELECT DISTINCT ON (m.conversacion_id)
      m.conversacion_id,
      m.contenido  AS ultimo_contenido,
      m.created_at AS ultimo_fecha,
      m.remitente  AS ultimo_remitente
    FROM wp_mensajes m
    WHERE m.empresa_id = p_empresa_id
    ORDER BY m.conversacion_id, m.created_at DESC
  )
  SELECT
    vc.conv_id                                        AS id,
    vc.contacto_id,
    COALESCE(ct.nombre, ct.telefono, 'Sin nombre')::text AS nombre_contacto,
    ct.telefono::text                                 AS telefono_contacto,
    LEFT(lm.ultimo_contenido, 200)::text              AS ultimo_mensaje_contenido,
    lm.ultimo_fecha                                   AS ultimo_mensaje_fecha,
    vc.canal::text,
    vc.estado::text,
    vc.resolved_numero_id                             AS numero_id,
    COALESCE(n.nombre, n.telefono)::text              AS nombre_numero,
    n.telefono::text                                  AS telefono_numero,
    lm.ultimo_remitente::text                         AS remitente_ultimo_mensaje,
    ct.origen::text                                   AS contacto_origen,
    ct.ultima_interaccion                             AS contacto_ultima_interaccion
  FROM valid_convs vc
  INNER JOIN latest_msg lm ON lm.conversacion_id = vc.conv_id
  LEFT JOIN wp_contactos ct ON ct.id = vc.contacto_id
  LEFT JOIN wp_numeros n ON n.id = vc.resolved_numero_id
  ORDER BY lm.ultimo_fecha DESC
  LIMIT 200;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION get_enterprise_inbox(int8) TO authenticated;
GRANT EXECUTE ON FUNCTION get_enterprise_inbox(int8) TO service_role;

-- Índices recomendados (ejecutar si no existen):
-- CREATE INDEX IF NOT EXISTS idx_wp_conversaciones_empresa_id ON wp_conversaciones(empresa_id);
-- CREATE INDEX IF NOT EXISTS idx_wp_mensajes_empresa_conv_created ON wp_mensajes(empresa_id, conversacion_id, created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_wp_template_envios_conv_numero ON wp_whatsapp_template_envios(conversacion_id, numero_id);
