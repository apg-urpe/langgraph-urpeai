-- =============================================
-- Índice para filtro de Origen en contactos
-- Acelera tanto el DISTINCT como el .eq('origen', ?) 
-- =============================================

CREATE INDEX IF NOT EXISTS idx_wp_contactos_empresa_origen 
ON wp_contactos(empresa_id, origen) 
WHERE origen IS NOT NULL;
