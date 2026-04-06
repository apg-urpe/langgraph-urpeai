-- ============================================
-- FUZZY SEARCH SETUP - Búsqueda con tolerancia a errores ortográficos
-- Urpe AI Lab - Enero 2025
-- ============================================
-- Este script habilita búsquedas flexibles que encuentran contactos incluso
-- cuando el usuario comete errores tipográficos (ej: "Gozalez" → "González")

-- ============================================
-- PASO 1: Habilitar extensiones necesarias
-- ============================================

-- pg_trgm: Permite búsquedas por similitud usando trigramas
-- Es el estándar de la industria para fuzzy search en PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent: Ya debería existir, pero aseguramos que esté habilitada
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================
-- PASO 2: Configurar umbral de similitud
-- ============================================
-- El umbral determina qué tan "flexible" es la búsqueda
-- 0.3 = Buena tolerancia a errores sin muchos falsos positivos
-- Rango: 0.0 (todo coincide) a 1.0 (coincidencia exacta)

-- Nota: Este SET afecta la sesión actual. Para hacerlo permanente,
-- se puede configurar en el código de aplicación antes de cada búsqueda.
-- SET pg_trgm.similarity_threshold = 0.3;

-- ============================================
-- PASO 3: Crear índices GIN para búsqueda difusa
-- ============================================

-- Índice para nombres (prioridad alta en búsquedas)
CREATE INDEX IF NOT EXISTS idx_contactos_nombre_trgm 
ON wp_contactos 
USING gin (nombre gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contactos_apellido_trgm 
ON wp_contactos 
USING gin (apellido gin_trgm_ops);

-- Índice combinado para búsqueda full-name
-- Útil cuando el usuario busca "Jose Garcia" como un término
CREATE INDEX IF NOT EXISTS idx_contactos_fullname_trgm 
ON wp_contactos 
USING gin ((COALESCE(nombre, '') || ' ' || COALESCE(apellido, '')) gin_trgm_ops);

-- ============================================
-- PASO 4: Función de búsqueda difusa optimizada
-- ============================================

CREATE OR REPLACE FUNCTION search_contacts_fuzzy(
    p_enterprise_id BIGINT,
    p_search_query TEXT,
    p_similarity_threshold FLOAT DEFAULT 0.3,
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
    similarity_score REAL,
    match_type TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_search_normalized TEXT;
BEGIN
    -- Normalizar término de búsqueda (remover acentos, lowercase)
    v_search_normalized := unaccent(lower(trim(p_search_query)));
    
    -- Configurar umbral de similitud para esta sesión
    -- En versiones recientes de pg_trgm se usa pg_trgm.similarity_threshold
    EXECUTE format('SET LOCAL pg_trgm.similarity_threshold = %L', p_similarity_threshold);
    
    RETURN QUERY
    WITH fuzzy_matches AS (
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
            -- Calcular similitud máxima entre nombre y apellido
            GREATEST(
                similarity(unaccent(lower(COALESCE(c.nombre, ''))), v_search_normalized),
                similarity(unaccent(lower(COALESCE(c.apellido, ''))), v_search_normalized),
                similarity(unaccent(lower(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, ''))), v_search_normalized),
                -- Añadir comparación con ILIKE unaccent para asegurar match exacto ignorando tildes
                CASE 
                    WHEN unaccent(lower(COALESCE(c.nombre, ''))) ILIKE '%' || v_search_normalized || '%'
                         OR unaccent(lower(COALESCE(c.apellido, ''))) ILIKE '%' || v_search_normalized || '%'
                    THEN 1.0 
                    ELSE 0.0 
                END
            )::REAL as sim_score,
            -- Determinar tipo de coincidencia
            CASE
                -- Coincidencia exacta (ilike ignorando acentos)
                WHEN unaccent(lower(COALESCE(c.nombre, ''))) ILIKE '%' || v_search_normalized || '%'
                     OR unaccent(lower(COALESCE(c.apellido, ''))) ILIKE '%' || v_search_normalized || '%'
                THEN 'exact'
                -- Coincidencia por similitud (trigramas ignorando acentos)
                WHEN unaccent(lower(COALESCE(c.nombre, ''))) % v_search_normalized
                     OR unaccent(lower(COALESCE(c.apellido, ''))) % v_search_normalized
                THEN 'fuzzy'
                -- Coincidencia en fullname
                WHEN unaccent(lower(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, ''))) % v_search_normalized
                THEN 'fullname'
                ELSE 'none'
            END::TEXT as match_category
        FROM wp_contactos c
        WHERE c.empresa_id = p_enterprise_id
          AND c.is_active = true
          AND (
              -- Búsqueda por ILIKE unaccent (indispensable para Jose -> José)
              unaccent(lower(COALESCE(c.nombre, ''))) ILIKE '%' || v_search_normalized || '%'
              OR unaccent(lower(COALESCE(c.apellido, ''))) ILIKE '%' || v_search_normalized || '%'
              -- Búsqueda por trigramas unaccent
              OR unaccent(lower(COALESCE(c.nombre, ''))) % v_search_normalized
              OR unaccent(lower(COALESCE(c.apellido, ''))) % v_search_normalized
              OR unaccent(lower(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, ''))) % v_search_normalized
              -- Teléfono y email
              OR c.telefono ILIKE '%' || p_search_query || '%'
              OR c.email ILIKE '%' || p_search_query || '%'
          )
    )
    SELECT 
        fm.id,
        fm.nombre,
        fm.apellido,
        fm.telefono,
        fm.email,
        fm.created_at,
        fm.updated_at,
        fm.estado,
        fm.es_calificado,
        fm.empresa_id,
        fm.team_humano_id,
        fm.metadata,
        fm.origen,
        fm.ultima_interaccion,
        fm.is_active,
        fm.paused_until,
        fm.etapa_embudo,
        fm.sim_score,
        fm.match_category
    FROM fuzzy_matches fm
    WHERE fm.match_category != 'none'
    ORDER BY 
        -- Priorizar coincidencias exactas, luego por similitud
        CASE fm.match_category 
            WHEN 'exact' THEN 0 
            WHEN 'fuzzy' THEN 1 
            WHEN 'fullname' THEN 2 
            ELSE 3 
        END,
        fm.sim_score DESC
    LIMIT p_limit;
END;
$$;

-- ============================================
-- PASO 5: Función helper para obtener sugerencias "Quizás quisiste decir..."
-- ============================================

CREATE OR REPLACE FUNCTION get_contact_suggestions(
    p_enterprise_id BIGINT,
    p_search_query TEXT,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    suggested_name TEXT,
    contact_id BIGINT,
    similarity_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_search_normalized TEXT;
BEGIN
    v_search_normalized := unaccent(lower(trim(p_search_query)));
    
    RETURN QUERY
    SELECT 
        COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '') as suggested_name,
        c.id as contact_id,
        GREATEST(
            similarity(unaccent(lower(COALESCE(c.nombre, ''))), v_search_normalized),
            similarity(unaccent(lower(COALESCE(c.apellido, ''))), v_search_normalized)
        ) as sim
    FROM wp_contactos c
    WHERE c.empresa_id = p_enterprise_id
      AND c.is_active = true
      AND (
          similarity(unaccent(lower(COALESCE(c.nombre, ''))), v_search_normalized) > 0.2
          OR similarity(unaccent(lower(COALESCE(c.apellido, ''))), v_search_normalized) > 0.2
      )
    ORDER BY sim DESC
    LIMIT p_limit;
END;
$$;

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Verificar que la extensión está activa
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- Ejemplo de uso:
-- SELECT * FROM search_contacts_fuzzy(13, 'Gozalez', 0.3, 10);
-- SELECT * FROM get_contact_suggestions(13, 'Gozalez', 5);

-- ============================================
-- NOTAS DE IMPLEMENTACIÓN
-- ============================================
-- 
-- 1. El operador % usa el umbral configurado con set_limit()
-- 2. similarity() retorna un valor entre 0 y 1
-- 3. Los índices gin_trgm_ops aceleran las búsquedas con %
-- 4. unaccent() normaliza tildes: "José" = "Jose"
-- 5. Multi-tenancy se mantiene con filtro empresa_id
--
-- Ejemplos de tolerancia con threshold 0.3:
-- "Gonzalez" → "Gonzales", "Gozalez", "Gonzale"
-- "Maria" → "Mariaa", "Mria", "Marìa"
-- "Jose" → "José", "Josse", "Hose"
