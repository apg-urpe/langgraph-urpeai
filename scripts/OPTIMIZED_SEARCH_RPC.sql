-- Optimización de Búsqueda Profunda de Contactos con Full Text Search (FTS)
-- Implementa una función RPC para realizar búsquedas eficientes en múltiples campos y tablas relacionadas.

-- Paso 1: Asegurar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Paso 2: Crear función de búsqueda optimizada
CREATE OR REPLACE FUNCTION search_contacts_optimized(
    p_enterprise_id BIGINT,
    p_search_query TEXT,
    p_limit INTEGER DEFAULT 30
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
    relevance_score FLOAT,
    matched_sources TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_search_tsquery tsquery;
BEGIN
    -- Normalizar query para FTS
    -- Convertimos espacios en '&' para requerir todas las palabras o podríamos usar '|' para OR
    v_search_tsquery := websearch_to_tsquery('spanish', p_search_query);

    RETURN QUERY
    WITH scored_results AS (
        -- Búsqueda en wp_contactos (Campos principales)
        SELECT 
            c.id,
            100.0 * ts_rank_cd(
                setweight(to_tsvector('spanish', unaccent(coalesce(c.nombre, ''))), 'A') ||
                setweight(to_tsvector('spanish', unaccent(coalesce(c.apellido, ''))), 'A') ||
                setweight(to_tsvector('spanish', coalesce(c.telefono, '')), 'B') ||
                setweight(to_tsvector('spanish', coalesce(c.email, '')), 'B'),
                v_search_tsquery
            ) as rank,
            ARRAY['contacto'] as sources
        FROM wp_contactos c
        WHERE c.empresa_id = p_enterprise_id
          AND (
              v_search_tsquery @@ to_tsvector('spanish', unaccent(coalesce(c.nombre, '')) || ' ' || unaccent(coalesce(c.apellido, '')))
              OR c.telefono ILIKE '%' || p_search_query || '%'
              OR c.email ILIKE '%' || p_search_query || '%'
          )

        UNION ALL

        -- Búsqueda en Notas
        SELECT 
            n.contacto_id as id,
            40.0 as rank,
            ARRAY['notas'] as sources
        FROM wp_contactos_nota n
        JOIN wp_contactos c ON c.id = n.contacto_id
        WHERE c.empresa_id = p_enterprise_id
          AND (n.descripcion ILIKE '%' || p_search_query || '%' OR n.titulo ILIKE '%' || p_search_query || '%')

        UNION ALL

        -- Búsqueda en Mensajes (Limitado a los más recientes para performance)
        SELECT 
            conv.contacto_id as id,
            20.0 as rank,
            ARRAY['mensajes'] as sources
        FROM wp_mensajes m
        JOIN wp_conversaciones conv ON conv.id = m.conversacion_id
        WHERE conv.empresa_id = p_enterprise_id
          AND m.contenido ILIKE '%' || p_search_query || '%'
        LIMIT 100
    ),
    aggregated_results AS (
        SELECT 
            sr.id,
            SUM(sr.rank) as total_rank,
            array_agg(DISTINCT s) as all_sources
        FROM scored_results sr, unnest(sr.sources) s
        GROUP BY sr.id
    )
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
        ar.total_rank as relevance_score,
        ar.all_sources as matched_sources
    FROM aggregated_results ar
    JOIN wp_contactos c ON c.id = ar.id
    ORDER BY ar.total_rank DESC
    LIMIT p_limit;
END;
$$;

-- Paso 3: Crear índices GIN para acelerar búsquedas futuras si no existen
-- CREATE INDEX IF NOT EXISTS idx_contactos_fts ON wp_contactos USING GIN (to_tsvector('spanish', unaccent(coalesce(nombre, '')) || ' ' || unaccent(coalesce(apellido, ''))));
