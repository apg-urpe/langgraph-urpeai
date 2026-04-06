-- ============================================
-- CRITICAL PERFORMANCE INDEXES
-- Fecha: 2026-01-23
-- Problema: Queries lentas (21-26s appointments, 4-12s contacts)
-- ============================================

-- ============================================
-- 1. ÍNDICES PARA wp_citas (CRÍTICO)
-- Query: fetchEnterpriseAppointments
-- Tiempo actual: 21-26 segundos
-- Tiempo esperado: <500ms
-- ============================================

-- Índice principal: empresa + fecha (patrón más común)
CREATE INDEX IF NOT EXISTS idx_wp_citas_empresa_fecha 
ON wp_citas (empresa_id, fecha_hora DESC);

-- Índice para filtro por team_humano_id
CREATE INDEX IF NOT EXISTS idx_wp_citas_team_humano 
ON wp_citas (team_humano_id) 
WHERE team_humano_id IS NOT NULL;

-- Índice compuesto completo para el query pattern exacto
CREATE INDEX IF NOT EXISTS idx_wp_citas_empresa_fecha_team 
ON wp_citas (empresa_id, fecha_hora DESC, team_humano_id);

-- Índice para contacto_id (JOIN con wp_contactos)
CREATE INDEX IF NOT EXISTS idx_wp_citas_contacto 
ON wp_citas (contacto_id) 
WHERE contacto_id IS NOT NULL;

-- ============================================
-- 2. ÍNDICES PARA wp_contactos (CRÍTICO)
-- Query: fetchContacts, SuperSearch
-- Tiempo actual: 4-12 segundos
-- Tiempo esperado: <1s
-- ============================================

-- Índice principal: empresa + última interacción (ordenamiento más común)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_empresa_interaccion 
ON wp_contactos (empresa_id, ultima_interaccion DESC NULLS LAST);

-- Índice para búsqueda por teléfono (muy frecuente)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_telefono_empresa 
ON wp_contactos (empresa_id, telefono);

-- Índice para búsqueda por email
CREATE INDEX IF NOT EXISTS idx_wp_contactos_email_empresa 
ON wp_contactos (empresa_id, email) 
WHERE email IS NOT NULL;

-- Índice para filtro por team_humano_id (asesores)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_team_humano 
ON wp_contactos (empresa_id, team_humano_id) 
WHERE team_humano_id IS NOT NULL;

-- Índice para filtro por etapa_embudo
CREATE INDEX IF NOT EXISTS idx_wp_contactos_embudo 
ON wp_contactos (empresa_id, etapa_embudo) 
WHERE etapa_embudo IS NOT NULL;

-- Índice para filtro por estado
CREATE INDEX IF NOT EXISTS idx_wp_contactos_estado 
ON wp_contactos (empresa_id, estado);

-- Índice GIN para búsqueda full-text en nombre/apellido
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nombre_gin 
ON wp_contactos USING gin (
  to_tsvector('spanish', coalesce(nombre, '') || ' ' || coalesce(apellido, ''))
);

-- ============================================
-- 3. ÍNDICES PARA wp_mensajes (SuperSearch)
-- ============================================

-- Índice para búsqueda por conversación
CREATE INDEX IF NOT EXISTS idx_wp_mensajes_conversacion 
ON wp_mensajes (conversacion_id, created_at DESC);

-- Índice GIN para búsqueda en contenido (si hay muchas búsquedas de mensajes)
CREATE INDEX IF NOT EXISTS idx_wp_mensajes_contenido_gin 
ON wp_mensajes USING gin (to_tsvector('spanish', coalesce(contenido, '')));

-- ============================================
-- 4. ÍNDICES PARA wp_conversaciones
-- ============================================

-- Índice para lookup por contacto
CREATE INDEX IF NOT EXISTS idx_wp_conversaciones_contacto 
ON wp_conversaciones (contacto_id, updated_at DESC);

-- Índice para empresa + fecha (MessagesView)
CREATE INDEX IF NOT EXISTS idx_wp_conversaciones_empresa_fecha 
ON wp_conversaciones (empresa_id, updated_at DESC);

-- ============================================
-- 5. ÍNDICES PARA wp_contactos_nota (SuperSearch)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_wp_notas_contacto 
ON wp_contactos_nota (contacto_id, created_at DESC);

-- ============================================
-- 6. ANALYZE TABLES (actualizar estadísticas)
-- ============================================

ANALYZE wp_citas;
ANALYZE wp_contactos;
ANALYZE wp_mensajes;
ANALYZE wp_conversaciones;
ANALYZE wp_contactos_nota;

-- ============================================
-- VERIFICACIÓN
-- Ejecutar después de crear los índices:
-- ============================================
-- SELECT 
--     schemaname,
--     tablename,
--     indexname,
--     pg_size_pretty(pg_relation_size(indexrelid)) as size
-- FROM pg_indexes 
-- WHERE tablename IN ('wp_citas', 'wp_contactos', 'wp_mensajes')
-- ORDER BY tablename, indexname;

-- ============================================
-- NOTAS DE IMPLEMENTACIÓN
-- ============================================
-- 1. Ejecutar en horario de bajo tráfico
-- 2. CONCURRENTLY no bloquea la tabla pero es más lento
-- 3. Si un índice falla, puede quedar en estado INVALID
--    Verificar con: SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;
-- 4. Después de crear índices, monitorear:
--    - Dashboard de Supabase > Database > Query Performance
--    - Logs de la aplicación (performance-monitor)
