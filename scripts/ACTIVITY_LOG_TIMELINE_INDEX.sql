-- ============================================
-- ÍNDICE PARA TIMELINE DE ACTIVIDAD POR CONTACTO
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2026-03-28
-- ============================================
--
-- La query del ContactActivityTimeline filtra por:
--   WHERE empresa_id = X AND contacto_id = Y
--   ORDER BY fecha_creacion DESC
--
-- Sin este índice compuesto, Postgres hace seq scan o
-- usa los índices individuales (fecha, tipo) con merge.
-- Con contactos activos esto puede ser lento.
-- ============================================

CREATE INDEX IF NOT EXISTS idx_actividades_log_contact_timeline
  ON public.wp_actividades_log(empresa_id, contacto_id, fecha_creacion DESC);
