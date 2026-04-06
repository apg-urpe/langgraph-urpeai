-- ============================================================
-- PERFORMANCE FIX - 2026-02-24
-- Problema raíz: Queries lentas (33s appointments, 6-7s dashboard, 3-6s contacts)
-- Causa: Índices compuestos faltantes + múltiples llamadas paralelas sin lock
-- ============================================================
-- INSTRUCCIONES:
--   1. Ejecutar en Supabase SQL Editor (Settings > SQL Editor)
--   2. CONCURRENTLY = no bloquea tabla durante creación
--   3. Ejecutar cada bloque por separado si alguno falla
--   4. Después de ejecutar, correr el bloque VERIFICACIÓN al final
-- ============================================================

-- ============================================================
-- BLOQUE 1: wp_citas (fetchEnterpriseAppointments = 33s → <300ms)
-- ============================================================

-- Índice principal: empresa + fecha (patrón más común del query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_citas_empresa_fecha
ON wp_citas (empresa_id, fecha_hora DESC);

-- Índice compuesto completo: empresa + fecha + team (para filtro de asesor)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_citas_empresa_fecha_team
ON wp_citas (empresa_id, fecha_hora ASC, team_humano_id);

-- Índice para team filter (filtros de asesor)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_citas_team_humano
ON wp_citas (team_humano_id)
WHERE team_humano_id IS NOT NULL;

-- Índice para JOIN con wp_contactos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_citas_contacto
ON wp_citas (contacto_id)
WHERE contacto_id IS NOT NULL;

-- Índice para queries de dashboard (estado + empresa)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_citas_empresa_estado
ON wp_citas (empresa_id, estado);

-- Índice para dashboard: created_at range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_citas_empresa_created
ON wp_citas (empresa_id, created_at DESC);

-- ============================================================
-- BLOQUE 2: wp_contactos (fetchContacts = 3-6s → <800ms)
-- ============================================================

-- Índice principal: empresa + última interacción (orden por defecto)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_empresa_interaccion
ON wp_contactos (empresa_id, ultima_interaccion DESC NULLS LAST);

-- Índice para filtros de asesor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_team_humano
ON wp_contactos (empresa_id, team_humano_id)
WHERE team_humano_id IS NOT NULL;

-- Índice para búsqueda por teléfono
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_telefono_empresa
ON wp_contactos (empresa_id, telefono);

-- Índice para búsqueda por email
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_email_empresa
ON wp_contactos (empresa_id, email)
WHERE email IS NOT NULL;

-- Índice para filtro por etapa_embudo (FunnelView)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_embudo
ON wp_contactos (empresa_id, etapa_embudo)
WHERE etapa_embudo IS NOT NULL;

-- Índice para filtro por estado
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_estado
ON wp_contactos (empresa_id, estado);

-- Índice para dashboard: created_at range + is_active
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_empresa_created
ON wp_contactos (empresa_id, created_at DESC);

-- Índice para contactos activos con última interacción (ghosted contacts query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_contactos_activos_interaccion
ON wp_contactos (empresa_id, ultima_interaccion ASC)
WHERE is_active = true AND ultima_interaccion IS NOT NULL;

-- ============================================================
-- BLOQUE 3: wp_mensajes (dashboard queries = 2-3s → <500ms)
-- ============================================================

-- Índice para conteo por empresa + fecha (dashboard counter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_mensajes_empresa_created
ON wp_mensajes (empresa_id, created_at DESC);

-- Índice para queries por conversación
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_mensajes_conversacion
ON wp_mensajes (conversacion_id, created_at DESC);

-- ============================================================
-- BLOQUE 4: wp_conversaciones
-- ============================================================

-- Índice para MessagesView (empresa + fecha actualización)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_conversaciones_empresa_updated
ON wp_conversaciones (empresa_id, updated_at DESC);

-- Índice para lookup por contacto
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wp_conversaciones_contacto
ON wp_conversaciones (contacto_id, updated_at DESC);

-- ============================================================
-- BLOQUE 5: ANALYZE (actualizar estadísticas del planner)
-- Ejecutar DESPUÉS de crear los índices
-- ============================================================

ANALYZE wp_citas;
ANALYZE wp_contactos;
ANALYZE wp_mensajes;
ANALYZE wp_conversaciones;

-- ============================================================
-- VERIFICACIÓN: Ejecutar para confirmar que los índices existen
-- ============================================================
-- SELECT
--     tablename,
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) AS size,
--     idx_scan AS scans_used
-- FROM pg_indexes
-- JOIN pg_stat_user_indexes USING (indexrelid)
-- WHERE tablename IN ('wp_citas', 'wp_contactos', 'wp_mensajes', 'wp_conversaciones')
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- ============================================================
-- DIAGNÓSTICO: Si los tiempos siguen siendo lentos, ejecutar:
-- ============================================================
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT id, fecha_hora, titulo, estado, contacto_id, team_humano_id
-- FROM wp_citas
-- WHERE empresa_id = 2
--   AND fecha_hora >= NOW() - INTERVAL '3 months'
-- ORDER BY fecha_hora ASC
-- LIMIT 1000;
