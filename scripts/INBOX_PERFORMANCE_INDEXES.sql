-- ============================================================================
-- INBOX PERFORMANCE INDEXES
-- Ejecutar ANTES de desplegar GET_ENTERPRISE_INBOX_PAGINATED.sql
--
-- Problema: "canceling statement due to statement timeout" en empresas grandes.
-- Causa raíz: DISTINCT ON / LATERAL sobre wp_mensajes sin índice compuesto
--             hace full table scan + sort.
--
-- 2026-03-27
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CRÍTICO — Último mensaje por conversación
--    Usado por LATERAL (... ORDER BY created_at DESC LIMIT 1) en la función.
--    Sin este índice, Postgres hace seq-scan sobre toda wp_mensajes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wp_mensajes_conv_empresa_created
  ON wp_mensajes (conversacion_id, empresa_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Conversaciones por empresa
--    Para el filtro raíz WHERE empresa_id = p_empresa_id.
--    Es posible que ya exista; IF NOT EXISTS lo protege.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wp_conversaciones_empresa
  ON wp_conversaciones (empresa_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Template envíos — resolución de numero_id
--    Partial index (WHERE numero_id IS NOT NULL) para la subquery LATERAL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wp_template_envios_conv_created
  ON wp_whatsapp_template_envios (conversacion_id, created_at DESC)
  WHERE numero_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación rápida (ejecutar después de crear los índices):
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE indexname IN (
--   'idx_wp_mensajes_conv_empresa_created',
--   'idx_wp_conversaciones_empresa',
--   'idx_wp_template_envios_conv_created'
-- );
