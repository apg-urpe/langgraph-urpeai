-- ============================================
-- Script para habilitar búsquedas sin acentos en PostgreSQL/Supabase
-- ============================================

-- 1. Habilitar la extensión unaccent (si no está ya habilitada)
-- Nota: En Supabase, esta extensión ya está disponible por defecto
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Crear función wrapper inmutable para poder usar índices funcionales
CREATE OR REPLACE FUNCTION unaccent_immutable(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT unaccent($1);
$$;

-- 3. Crear índices funcionales para mejorar el rendimiento de búsquedas sin acentos
-- Estos índices permitirán que las consultas con unaccent() sean rápidas

-- Índice para nombre de contacto
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nombre_unaccent 
ON wp_contactos (unaccent_immutable(nombre));

-- Índice para apellido de contacto
CREATE INDEX IF NOT EXISTS idx_wp_contactos_apellido_unaccent 
ON wp_contactos (unaccent_immutable(apellido));

-- Índice compuesto para nombre + apellido
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nombre_apellido_unaccent 
ON wp_contactos (unaccent_immutable(nombre), unaccent_immutable(apellido));

-- Índice para email
CREATE INDEX IF NOT EXISTS idx_wp_contactos_email_unaccent 
ON wp_contactos (unaccent_immutable(email));

-- Índice para teléfono (normalizado)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_telefono_unaccent 
ON wp_contactos (unaccent_immutable(telefono));

-- Índice para notas
CREATE INDEX IF NOT EXISTS idx_wp_contactos_notas_unaccent 
ON wp_contactos (unaccent_immutable(notas));

-- Índice para origen
CREATE INDEX IF NOT EXISTS idx_wp_contactos_origen_unaccent 
ON wp_contactos (unaccent_immutable(origen));

-- Índices para otras tablas que usan búsquedas con texto

-- wp_contactos_nota
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nota_descripcion_unaccent 
ON wp_contactos_nota (unaccent_immutable(descripcion));

CREATE INDEX IF NOT EXISTS idx_wp_contactos_nota_titulo_unaccent 
ON wp_contactos_nota (unaccent_immutable(titulo));

-- wp_conversaciones
CREATE INDEX IF NOT EXISTS idx_wp_conversaciones_resumen_unaccent 
ON wp_conversaciones (unaccent_immutable(resumen));

CREATE INDEX IF NOT EXISTS idx_wp_conversaciones_inteligencia_unaccent 
ON wp_conversaciones (unaccent_immutable(inteligencia_conversacional));

-- wp_mensajes
CREATE INDEX IF NOT EXISTS idx_wp_mensajes_contenido_unaccent 
ON wp_mensajes (unaccent_immutable(contenido));

-- 4. Ejemplos de consultas que ahora funcionarán sin acentos
/*
-- Búsqueda simple (funciona con y sin acentos)
SELECT * FROM wp_contactos 
WHERE unaccent(nombre) ILIKE unaccent('%juan%')
  OR unaccent(apellido) ILIKE unaccent('%garcia%');

-- Búsqueda avanzada que encuentra:
--   - María, Maria
--   - José, Jose
--   - González, Gonzalez
--   - Niño, Nino
--   - etc.
SELECT * FROM wp_contactos 
WHERE unaccent_immutable(nombre) ILIKE unaccent_immutable('%maria%')
   OR unaccent_immutable(apellido) ILIKE unaccent_immutable('%gonzalez%');
*/

-- 5. Opcional: Crear una vista materializada para búsquedas frecuentes
/*
CREATE MATERIALIZED VIEW mv_contactos_search AS
SELECT 
  id,
  unaccent_immutable(nombre) as nombre_sin_acentos,
  unaccent_immutable(apellido) as apellido_sin_acentos,
  unaccent_immutable(email) as email_sin_acentos,
  unaccent_immutable(telefono) as telefono_sin_acentos,
  unaccent_immutable(notas) as notas_sin_acentos,
  empresa_id,
  is_active,
  created_at
FROM wp_contactos;

-- Crear índices en la vista materializada
CREATE INDEX idx_mv_contactos_search_nombre ON mv_contactos_search(nombre_sin_acentos);
CREATE INDEX idx_mv_contactos_search_apellido ON mv_contactos_search(apellido_sin_acentos);
CREATE INDEX idx_mv_contactos_search_empresa ON mv_contactos_search(empresa_id);

-- Para refrescar la vista materializada periódicamente
-- REFRESH MATERIALIZED VIEW mv_contactos_search;
*/

-- ============================================
-- Notas importantes:
-- ============================================
-- 1. La función unaccent_elimina los acentos pero NO las tildes (ñ, ç, etc.)
-- 2. Las búsquedas seguirán siendo case-insensitive gracias a ILIKE
-- 3. Los índices funcionales mejoran significativamente el rendimiento
-- 4. En Supabase, la extensión unaccent ya está preinstalada
-- 5. Para usar esto en producción, asegúrate de tener los permisos adecuados
-- ============================================
