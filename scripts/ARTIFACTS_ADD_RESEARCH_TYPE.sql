-- ============================================================================
-- MIGRACION: Permitir type='research' en public.artifacts
-- Fecha: 2026-02-16
-- ============================================================================

ALTER TABLE public.artifacts
DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts
ADD CONSTRAINT artifacts_type_check
CHECK (type IN ('html', 'markdown', 'svg', 'mermaid', 'react', 'code', 'research'));
