-- ============================================================================
-- SUPER SEARCH OPTIMIZADO - Búsqueda Eficiente de Contactos
-- ============================================================================
-- Busca en: Perfil, Notas, Metadata, Mensajes
-- Fecha: Enero 2025
-- ============================================================================

-- Paso 1: Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- Para búsquedas fuzzy con trigramas

-- ============================================================================
-- Paso 2: ÍNDICES OPTIMIZADOS PARA BÚSQUEDA
-- ============================================================================

-- 2.1 Índices para wp_contactos (campos principales)
CREATE INDEX IF NOT EXISTS idx_contactos_empresa_id ON wp_contactos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contactos_nombre_trgm ON wp_contactos USING GIN (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contactos_apellido_trgm ON wp_contactos USING GIN (apellido gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contactos_telefono_trgm ON wp_contactos USING GIN (telefono gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contactos_email_trgm ON wp_contactos USING GIN (email gin_trgm_ops);

-- 2.2 Índice GIN para metadata JSONB (búsqueda full-text en JSON)
CREATE INDEX IF NOT EXISTS idx_contactos_metadata_gin ON wp_contactos USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_contactos_metadata_text ON wp_contactos USING GIN ((metadata::text) gin_trgm_ops);

-- 2.3 Índices para wp_contactos_nota
CREATE INDEX IF NOT EXISTS idx_contactos_nota_contacto ON wp_contactos_nota(contacto_id);
CREATE INDEX IF NOT EXISTS idx_contactos_nota_descripcion_trgm ON wp_contactos_nota USING GIN (descripcion gin_trgm_ops);

-- 2.4 Índices para wp_mensajes (búsqueda en contenido)
CREATE INDEX IF NOT EXISTS idx_mensajes_empresa ON wp_mensajes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON wp_mensajes(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_contenido_trgm ON wp_mensajes USING GIN (contenido gin_trgm_ops);

-- 2.5 Índices para wp_conversaciones
CREATE INDEX IF NOT EXISTS idx_conversaciones_empresa ON wp_conversaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_contacto ON wp_conversaciones(contacto_id);

-- ============================================================================
-- Paso 3: FUNCIÓN RPC DE BÚSQUEDA SUPER OPTIMIZADA
-- ============================================================================

CREATE OR REPLACE FUNCTION super_search_contacts(
    p_enterprise_id BIGINT,
    p_search_query TEXT,
    p_search_scope TEXT DEFAULT 'all', -- 'basic', 'messages', 'metadata', 'notes', 'all'
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id BIGINT,
    nombre TEXT,
    apellido TEXT,
    telefono TEXT,
    email TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    estado TEXT,
    es_calificado TEXT,
    empresa_id BIGINT,
    team_humano_id BIGINT,
    metadata JSONB,
    origen TEXT,
    ultima_interaccion TIMESTAMPTZ,
    is_active BOOLEAN,
    paused_until TIMESTAMPTZ,
    etapa_embudo BIGINT,
    notas TEXT,
    relevance_score FLOAT,
    match_source TEXT,
    match_preview TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search_term TEXT;
    v_search_lower TEXT;
BEGIN
    -- Normalizar término de búsqueda
    v_search_term := TRIM(p_search_query);
    v_search_lower := LOWER(unaccent(v_search_term));
    
    -- Si la búsqueda está vacía, retornar vacío
    IF LENGTH(v_search_term) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH scored_results AS (
        -- ================================================================
        -- BÚSQUEDA EN PERFIL (Campos principales del contacto)
        -- ================================================================
        SELECT 
            c.id,
            CASE 
                -- Nombre exacto = máxima puntuación
                WHEN LOWER(unaccent(c.nombre)) = v_search_lower THEN 200.0
                WHEN LOWER(unaccent(c.apellido)) = v_search_lower THEN 200.0
                -- Nombre empieza con = alta puntuación
                WHEN LOWER(unaccent(c.nombre)) LIKE v_search_lower || '%' THEN 150.0
                WHEN LOWER(unaccent(c.apellido)) LIKE v_search_lower || '%' THEN 150.0
                -- Nombre completo contiene
                WHEN LOWER(unaccent(c.nombre || ' ' || COALESCE(c.apellido, ''))) LIKE '%' || v_search_lower || '%' THEN 120.0
                -- Teléfono contiene
                WHEN c.telefono LIKE '%' || v_search_term || '%' THEN 100.0
                -- Email contiene
                WHEN LOWER(c.email) LIKE '%' || v_search_lower || '%' THEN 80.0
                -- Origen contiene
                WHEN LOWER(c.origen) LIKE '%' || v_search_lower || '%' THEN 50.0
                ELSE 40.0
            END as rank,
            'perfil'::TEXT as source,
            CASE 
                WHEN c.telefono LIKE '%' || v_search_term || '%' THEN c.telefono
                WHEN LOWER(c.email) LIKE '%' || v_search_lower || '%' THEN c.email
                ELSE c.nombre || ' ' || COALESCE(c.apellido, '')
            END as preview
        FROM wp_contactos c
        WHERE c.empresa_id = p_enterprise_id
          AND (p_search_scope IN ('basic', 'all'))
          AND (
              LOWER(unaccent(COALESCE(c.nombre, ''))) LIKE '%' || v_search_lower || '%'
              OR LOWER(unaccent(COALESCE(c.apellido, ''))) LIKE '%' || v_search_lower || '%'
              OR c.telefono LIKE '%' || v_search_term || '%'
              OR REPLACE(REPLACE(REPLACE(c.telefono, ' ', ''), '+', ''), '-', '') LIKE '%' || REPLACE(REPLACE(REPLACE(v_search_term, ' ', ''), '+', ''), '-', '') || '%'
              OR LOWER(c.email) LIKE '%' || v_search_lower || '%'
              OR LOWER(c.origen) LIKE '%' || v_search_lower || '%'
          )

        UNION ALL

        -- ================================================================
        -- BÚSQUEDA EN NOTAS
        -- ================================================================
        SELECT 
            n.contacto_id as id,
            50.0 as rank,
            'notas'::TEXT as source,
            SUBSTRING(n.descripcion FROM 1 FOR 100) as preview
        FROM wp_contactos_nota n
        JOIN wp_contactos c ON c.id = n.contacto_id
        WHERE c.empresa_id = p_enterprise_id
          AND (p_search_scope IN ('notes', 'all'))
          AND (
              LOWER(unaccent(COALESCE(n.descripcion, ''))) LIKE '%' || v_search_lower || '%'
              OR LOWER(unaccent(COALESCE(n.titulo, ''))) LIKE '%' || v_search_lower || '%'
          )

        UNION ALL

        -- ================================================================
        -- BÚSQUEDA EN METADATA (JSONB)
        -- ================================================================
        SELECT 
            c.id,
            40.0 as rank,
            'metadata'::TEXT as source,
            SUBSTRING(c.metadata::TEXT FROM 1 FOR 100) as preview
        FROM wp_contactos c
        WHERE c.empresa_id = p_enterprise_id
          AND (p_search_scope IN ('metadata', 'all'))
          AND c.metadata IS NOT NULL
          AND LOWER(c.metadata::TEXT) LIKE '%' || v_search_lower || '%'

        UNION ALL

        -- ================================================================
        -- BÚSQUEDA EN MENSAJES (Sin límite artificial para encontrar frases exactas)
        -- Prioridad: Si la frase es larga (>10 chars), aumentar puntuación
        -- ================================================================
        SELECT DISTINCT ON (conv.contacto_id)
            conv.contacto_id as id,
            -- Mayor puntuación para frases largas encontradas en mensajes
            CASE 
                WHEN LENGTH(v_search_term) > 20 THEN 80.0  -- Frase larga = alta relevancia
                WHEN LENGTH(v_search_term) > 10 THEN 60.0  -- Frase media
                ELSE 40.0  -- Palabra corta
            END as rank,
            'mensajes'::TEXT as source,
            -- Preview centrado en la frase encontrada
            CASE 
                WHEN POSITION(v_search_lower IN LOWER(unaccent(m.contenido))) > 50 
                THEN '...' || SUBSTRING(m.contenido FROM GREATEST(1, POSITION(v_search_lower IN LOWER(unaccent(m.contenido))) - 30) FOR 120) || '...'
                ELSE SUBSTRING(m.contenido FROM 1 FOR 120)
            END as preview
        FROM wp_mensajes m
        JOIN wp_conversaciones conv ON conv.id = m.conversacion_id
        WHERE conv.empresa_id = p_enterprise_id
          AND (p_search_scope IN ('messages', 'all'))
          AND LOWER(unaccent(COALESCE(m.contenido, ''))) LIKE '%' || v_search_lower || '%'
        ORDER BY conv.contacto_id, m.created_at DESC

        UNION ALL

        -- ================================================================
        -- BÚSQUEDA EN RESUMEN DE CONVERSACIÓN
        -- ================================================================
        SELECT DISTINCT ON (conv.contacto_id)
            conv.contacto_id as id,
            25.0 as rank,
            'conversacion'::TEXT as source,
            SUBSTRING(COALESCE(conv.resumen, conv.inteligencia_conversacional) FROM 1 FOR 100) as preview
        FROM wp_conversaciones conv
        WHERE conv.empresa_id = p_enterprise_id
          AND (p_search_scope = 'all')
          AND (
              LOWER(unaccent(COALESCE(conv.resumen, ''))) LIKE '%' || v_search_lower || '%'
              OR LOWER(unaccent(COALESCE(conv.inteligencia_conversacional, ''))) LIKE '%' || v_search_lower || '%'
          )
        ORDER BY conv.contacto_id, conv.updated_at DESC
    ),
    -- Agregar puntuaciones por contacto
    aggregated AS (
        SELECT 
            sr.id,
            SUM(sr.rank) as total_rank,
            -- Tomar la fuente con mayor puntuación
            (ARRAY_AGG(sr.source ORDER BY sr.rank DESC))[1] as best_source,
            (ARRAY_AGG(sr.preview ORDER BY sr.rank DESC))[1] as best_preview
        FROM scored_results sr
        GROUP BY sr.id
    )
    -- Unir con datos completos del contacto
    SELECT 
        c.id,
        c.nombre,
        c.apellido,
        c.telefono,
        c.email,
        c.created_at,
        c.updated_at,
        c.estado,
        c.es_calificado,
        c.empresa_id,
        c.team_humano_id,
        c.metadata,
        c.origen,
        c.ultima_interaccion,
        c.is_active,
        c.paused_until,
        c.etapa_embudo,
        c.notas,
        a.total_rank as relevance_score,
        a.best_source as match_source,
        a.best_preview as match_preview
    FROM aggregated a
    JOIN wp_contactos c ON c.id = a.id
    ORDER BY a.total_rank DESC, c.ultima_interaccion DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Paso 4: FUNCIÓN PARA BÚSQUEDA RÁPIDA (Solo perfil básico)
-- ============================================================================

CREATE OR REPLACE FUNCTION quick_search_contacts(
    p_enterprise_id BIGINT,
    p_search_query TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id BIGINT,
    nombre TEXT,
    apellido TEXT,
    telefono TEXT,
    email TEXT,
    estado TEXT,
    es_calificado TEXT,
    team_humano_id BIGINT,
    ultima_interaccion TIMESTAMPTZ,
    relevance_score FLOAT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search_lower TEXT;
    v_search_normalized TEXT;
BEGIN
    v_search_lower := LOWER(unaccent(TRIM(p_search_query)));
    v_search_normalized := REPLACE(REPLACE(REPLACE(v_search_lower, ' ', ''), '+', ''), '-', '');
    
    IF LENGTH(v_search_lower) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        c.id,
        c.nombre,
        c.apellido,
        c.telefono,
        c.email,
        c.estado,
        c.es_calificado,
        c.team_humano_id,
        c.ultima_interaccion,
        CASE 
            WHEN LOWER(unaccent(c.nombre)) = v_search_lower THEN 200.0
            WHEN LOWER(unaccent(c.apellido)) = v_search_lower THEN 200.0
            WHEN LOWER(unaccent(c.nombre)) LIKE v_search_lower || '%' THEN 150.0
            WHEN LOWER(unaccent(c.apellido)) LIKE v_search_lower || '%' THEN 150.0
            WHEN LOWER(unaccent(c.nombre || ' ' || COALESCE(c.apellido, ''))) LIKE '%' || v_search_lower || '%' THEN 120.0
            WHEN REPLACE(REPLACE(REPLACE(c.telefono, ' ', ''), '+', ''), '-', '') LIKE '%' || v_search_normalized || '%' THEN 100.0
            WHEN LOWER(c.email) LIKE '%' || v_search_lower || '%' THEN 80.0
            ELSE 40.0
        END as relevance_score
    FROM wp_contactos c
    WHERE c.empresa_id = p_enterprise_id
      AND (
          LOWER(unaccent(COALESCE(c.nombre, ''))) LIKE '%' || v_search_lower || '%'
          OR LOWER(unaccent(COALESCE(c.apellido, ''))) LIKE '%' || v_search_lower || '%'
          OR c.telefono LIKE '%' || p_search_query || '%'
          OR REPLACE(REPLACE(REPLACE(c.telefono, ' ', ''), '+', ''), '-', '') LIKE '%' || v_search_normalized || '%'
          OR LOWER(c.email) LIKE '%' || v_search_lower || '%'
      )
    ORDER BY relevance_score DESC, c.ultima_interaccion DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Paso 5: PERMISOS
-- ============================================================================

GRANT EXECUTE ON FUNCTION super_search_contacts TO authenticated;
GRANT EXECUTE ON FUNCTION super_search_contacts TO anon;
GRANT EXECUTE ON FUNCTION quick_search_contacts TO authenticated;
GRANT EXECUTE ON FUNCTION quick_search_contacts TO anon;

-- ============================================================================
-- NOTAS DE USO
-- ============================================================================
-- 
-- Búsqueda rápida (solo perfil básico):
-- SELECT * FROM quick_search_contacts(13, 'juan', 20);
--
-- Búsqueda completa (perfil + notas + metadata + mensajes):
-- SELECT * FROM super_search_contacts(13, 'cita', 'all', 50);
--
-- Búsqueda solo en mensajes:
-- SELECT * FROM super_search_contacts(13, 'hola', 'messages', 30);
--
-- Búsqueda solo en metadata:
-- SELECT * FROM super_search_contacts(13, 'facebook', 'metadata', 30);
-- ============================================================================
