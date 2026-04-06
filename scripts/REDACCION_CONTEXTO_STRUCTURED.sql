-- ============================================================================
-- Agregar columna contexto_structured a la tabla redaccion
-- Almacena el JSON organizado por IA con toda la data de contexto
-- ============================================================================

ALTER TABLE redaccion
ADD COLUMN IF NOT EXISTS contexto_structured jsonb DEFAULT NULL;

COMMENT ON COLUMN redaccion.contexto_structured IS 'JSON organizado por IA con la data de contexto usada para generar el documento';
