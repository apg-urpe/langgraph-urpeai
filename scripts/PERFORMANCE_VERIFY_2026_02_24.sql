-- ============================================================
-- PERFORMANCE VERIFY - 2026-02-24
-- Verificación de tablas, índices y uso real en PostgreSQL/Supabase
-- ============================================================

-- 0) Tablas críticas: existencia + filas estimadas
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  CASE c.relkind WHEN 'r' THEN 'table' WHEN 'm' THEN 'materialized_view' ELSE c.relkind::text END AS kind,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  COALESCE(s.n_live_tup, 0) AS live_rows_estimated,
  s.last_analyze,
  s.last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('wp_citas', 'wp_contactos', 'wp_mensajes', 'wp_conversaciones')
ORDER BY c.relname;


-- 1) Índices esperados de PERFORMANCE_FIX_2026_02_24.sql
WITH expected(index_name) AS (
  VALUES
    ('idx_wp_citas_empresa_fecha'),
    ('idx_wp_citas_empresa_fecha_team'),
    ('idx_wp_citas_team_humano'),
    ('idx_wp_citas_contacto'),
    ('idx_wp_citas_empresa_estado'),
    ('idx_wp_citas_empresa_created'),
    ('idx_wp_contactos_empresa_interaccion'),
    ('idx_wp_contactos_team_humano'),
    ('idx_wp_contactos_telefono_empresa'),
    ('idx_wp_contactos_email_empresa'),
    ('idx_wp_contactos_embudo'),
    ('idx_wp_contactos_estado'),
    ('idx_wp_contactos_empresa_created'),
    ('idx_wp_contactos_activos_interaccion'),
    ('idx_wp_mensajes_empresa_created'),
    ('idx_wp_mensajes_conversacion'),
    ('idx_wp_conversaciones_empresa_updated'),
    ('idx_wp_conversaciones_contacto')
)
SELECT
  e.index_name,
  CASE WHEN to_regclass('public.' || e.index_name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status,
  pg_size_pretty(COALESCE(pg_relation_size(to_regclass('public.' || e.index_name)), 0)) AS index_size
FROM expected e
ORDER BY e.index_name;


-- 2) Índices reales en tablas críticas + escaneos
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch
FROM pg_stat_user_indexes s
WHERE s.relname IN ('wp_citas', 'wp_contactos', 'wp_mensajes', 'wp_conversaciones')
ORDER BY s.relname, s.idx_scan DESC, s.indexrelname;


-- 3) Resumen de salud por tabla (sequential vs index scans)
SELECT
  relname AS table_name,
  seq_scan,
  idx_scan,
  CASE
    WHEN (seq_scan + idx_scan) = 0 THEN 0
    ELSE ROUND((idx_scan::numeric / (seq_scan + idx_scan)::numeric) * 100, 2)
  END AS idx_scan_ratio_pct,
  n_live_tup,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('wp_citas', 'wp_contactos', 'wp_mensajes', 'wp_conversaciones')
ORDER BY relname;


-- 4) (Opcional) Top queries lentas (requiere pg_stat_statements)
-- Si falla con "relation pg_stat_statements does not exist", ignora este bloque.
SELECT
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(max_exec_time::numeric, 2) AS max_ms,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  LEFT(query, 220) AS query_sample
FROM pg_stat_statements
WHERE query ILIKE '%wp_citas%'
   OR query ILIKE '%wp_contactos%'
   OR query ILIKE '%wp_mensajes%'
   OR query ILIKE '%wp_conversaciones%'
ORDER BY mean_exec_time DESC
LIMIT 20;


-- 5) Recomendación: tras crear índices, ejecutar ANALYZE manual
-- ANALYZE wp_citas;
-- ANALYZE wp_contactos;
-- ANALYZE wp_mensajes;
-- ANALYZE wp_conversaciones;
