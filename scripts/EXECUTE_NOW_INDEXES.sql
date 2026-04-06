-- ============================================
-- URGENTE: ÍNDICES CRÍTICOS DE PERFORMANCE
-- Ejecutar en Supabase SQL Editor INMEDIATAMENTE
-- ============================================

-- 1. ÍNDICE CRÍTICO: wp_citas (reduce 5s -> 200ms)
CREATE INDEX IF NOT EXISTS idx_wp_citas_empresa_fecha 
ON wp_citas (empresa_id, fecha_hora DESC);

-- 2. ÍNDICE CRÍTICO: wp_contactos (reduce 3s -> 300ms)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_empresa_interaccion 
ON wp_contactos (empresa_id, ultima_interaccion DESC NULLS LAST);

-- 3. Índice para filtro por asesor (team_humano_id)
CREATE INDEX IF NOT EXISTS idx_wp_citas_team_humano 
ON wp_citas (team_humano_id) 
WHERE team_humano_id IS NOT NULL;

-- 4. Índice compuesto completo para citas
CREATE INDEX IF NOT EXISTS idx_wp_citas_empresa_fecha_team 
ON wp_citas (empresa_id, fecha_hora DESC, team_humano_id);

-- 5. Índice para búsqueda por teléfono
CREATE INDEX IF NOT EXISTS idx_wp_contactos_telefono_empresa 
ON wp_contactos (empresa_id, telefono);

-- 6. Índice para filtro por etapa de embudo
CREATE INDEX IF NOT EXISTS idx_wp_contactos_embudo 
ON wp_contactos (empresa_id, etapa_embudo) 
WHERE etapa_embudo IS NOT NULL;

-- 7. Actualizar estadísticas para que PostgreSQL use los índices
ANALYZE wp_citas;
ANALYZE wp_contactos;
ANALYZE wp_mensajes;
ANALYZE wp_conversaciones;

-- ============================================
-- VERIFICACIÓN (ejecutar después)
-- ============================================
-- SELECT 
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) as size
-- FROM pg_indexes 
-- WHERE tablename IN ('wp_citas', 'wp_contactos')
-- ORDER BY tablename, indexname;
