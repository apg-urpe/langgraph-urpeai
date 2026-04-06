-- ============================================================================
-- RPC: get_enterprise_inbox_paginated
-- Versión paginada de get_enterprise_inbox.
-- Acepta p_limit, p_offset, p_numero_id y p_team_humano_id.
-- Retorna conversaciones ordenadas por último mensaje DESC.
--
-- PERFORMANCE FIX (2026-03-27):
--   - LATERAL join solo para las filas paginadas
--   - COUNT(*) OVER() en vez de cross join con CTE counted
--   - Enriquecimiento (contacto, número, template) solo sobre la página
--   - Filtro por numero_id en el servidor (antes de paginar)
--
-- SECURITY (2026-03-28):
--   - p_team_humano_id filtra conversaciones por contactos asignados al
--     usuario (dual-source: wp_contacto_team_asignaciones + legacy
--     wp_contactos.team_humano_id). Usar para rol 3.
-- ============================================================================

-- Drop ALL old signatures to avoid overload conflicts
DROP FUNCTION IF EXISTS get_enterprise_inbox_paginated(int8, int4, int4);
DROP FUNCTION IF EXISTS get_enterprise_inbox_paginated(int8, int4, int4, int8);
DROP FUNCTION IF EXISTS get_enterprise_inbox_paginated(int8, int4, int4, int8, int8);
DROP FUNCTION IF EXISTS get_enterprise_inbox_paginated(int8, int4, int4, int8, int8, text);

CREATE OR REPLACE FUNCTION get_enterprise_inbox_paginated(
  p_empresa_id      int8,
  p_limit           int4 DEFAULT 50,
  p_offset          int4 DEFAULT 0,
  p_numero_id       int8 DEFAULT NULL,
  p_team_humano_id  int8 DEFAULT NULL,
  p_canal           text DEFAULT NULL
)
RETURNS TABLE (
  id                          int8,
  contacto_id                 int8,
  nombre_contacto             text,
  telefono_contacto           text,
  ultimo_mensaje_contenido    text,
  ultimo_mensaje_fecha        timestamptz,
  canal                       text,
  estado                      text,
  numero_id                   int8,
  nombre_numero               text,
  telefono_numero             text,
  remitente_ultimo_mensaje    text,
  contacto_origen             text,
  contacto_ultima_interaccion timestamptz,
  total_count                 int8
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- CTE auxiliar: contactos visibles para el team member (dual-source).
  -- Solo se materializa cuando p_team_humano_id IS NOT NULL.
  WITH visible_contacts AS (
    SELECT contacto_id AS cid
    FROM wp_contacto_team_asignaciones
    WHERE team_humano_id = p_team_humano_id
      AND empresa_id = p_empresa_id
    UNION
    SELECT id AS cid
    FROM wp_contactos
    WHERE team_humano_id = p_team_humano_id
      AND empresa_id = p_empresa_id
  ),
  -- Paso 1: Conversaciones con su último mensaje.
  --         Filtros de numero_id y team_humano_id ANTES de paginar.
  conv_with_last_msg AS (
    SELECT
      c.id   AS conv_id,
      c.contacto_id,
      c.canal,
      c.seguimiento                                                AS estado,
      COALESCE(c.numero_id, (c.metadata->>'numero_id')::int8)     AS conv_numero_id,
      lm.ultimo_contenido,
      lm.ultimo_fecha,
      lm.ultimo_remitente
    FROM wp_conversaciones c
    INNER JOIN LATERAL (
      SELECT
        m.contenido  AS ultimo_contenido,
        m.created_at AS ultimo_fecha,
        m.remitente  AS ultimo_remitente
      FROM wp_mensajes m
      WHERE m.conversacion_id = c.id
        AND m.empresa_id = p_empresa_id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE c.empresa_id = p_empresa_id
      AND (p_numero_id IS NULL
           OR COALESCE(c.numero_id, (c.metadata->>'numero_id')::int8) = p_numero_id)
      AND (p_canal IS NULL OR c.canal = p_canal)
      AND (p_team_humano_id IS NULL
           OR c.contacto_id IN (SELECT cid FROM visible_contacts))
  ),
  page AS (
    SELECT
      *,
      COUNT(*) OVER() AS total_count
    FROM conv_with_last_msg
    ORDER BY ultimo_fecha DESC
    LIMIT  p_limit
    OFFSET p_offset
  )
  -- Paso 2: Enriquecer SOLO las filas de la página.
  SELECT
    p.conv_id                                              AS id,
    p.contacto_id,
    COALESCE(ct.nombre, ct.telefono, 'Sin nombre')::text   AS nombre_contacto,
    ct.telefono::text                                      AS telefono_contacto,
    LEFT(p.ultimo_contenido, 200)::text                    AS ultimo_mensaje_contenido,
    p.ultimo_fecha                                         AS ultimo_mensaje_fecha,
    p.canal::text,
    p.estado::text,
    COALESCE(p.conv_numero_id, lt.numero_id)                AS numero_id,
    COALESCE(n.nombre, n.telefono)::text                   AS nombre_numero,
    n.telefono::text                                       AS telefono_numero,
    p.ultimo_remitente::text                               AS remitente_ultimo_mensaje,
    ct.origen::text                                        AS contacto_origen,
    ct.ultima_interaccion                                  AS contacto_ultima_interaccion,
    p.total_count
  FROM page p
  LEFT JOIN wp_contactos ct ON ct.id = p.contacto_id
  LEFT JOIN LATERAL (
    SELECT e.numero_id
    FROM wp_whatsapp_template_envios e
    WHERE e.conversacion_id = p.conv_id
      AND e.numero_id IS NOT NULL
    ORDER BY e.created_at DESC
    LIMIT 1
  ) lt ON p.conv_numero_id IS NULL
  LEFT JOIN wp_numeros n ON n.id = COALESCE(p.conv_numero_id, lt.numero_id)
  ORDER BY p.ultimo_fecha DESC;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION get_enterprise_inbox_paginated(int8, int4, int4, int8, int8, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_enterprise_inbox_paginated(int8, int4, int4, int8, int8, text) TO service_role;
