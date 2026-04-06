-- ============================================================================
-- EMAIL COMPOSER DRAFTS — Soporte para borradores persistentes
-- ============================================================================
-- Cambios:
-- 1. campana_id → NULLABLE (permite emails libres sin campaña)
-- 2. estado → agrega 'borrador' al CHECK constraint
-- 3. Índice para borradores por remitente
-- ============================================================================

-- 1. Hacer campana_id nullable para emails libres (sin campaña)
ALTER TABLE wp_email_envio ALTER COLUMN campana_id DROP NOT NULL;

-- 2. Reemplazar CHECK constraint de estado para incluir 'borrador'
ALTER TABLE wp_email_envio DROP CONSTRAINT IF EXISTS check_estado_envio;
ALTER TABLE wp_email_envio ADD CONSTRAINT check_estado_envio CHECK (
  estado = ANY(ARRAY['borrador', 'pendiente', 'programado', 'enviado', 'abierto', 'clic', 'fallido', 'cancelado'])
);

-- 3. Índice parcial para borradores del asesor (consulta rápida)
CREATE INDEX IF NOT EXISTS idx_email_envio_borrador_remitente
  ON wp_email_envio(remitente_team_humano, estado)
  WHERE estado = 'borrador';

-- 4. Índice para emails por contacto incluyendo borradores
-- (ya existe idx_email_envio_contacto, pero aseguramos cobertura)
CREATE INDEX IF NOT EXISTS idx_email_envio_contacto_estado_created
  ON wp_email_envio(contacto_id, estado, created_at DESC);
