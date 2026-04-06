-- ============================================================================
-- FIX: Agregar columna updated_at a chat_messages
-- Fecha: Enero 2025
-- Problema: Error PGRST204 - columna updated_at no existe
-- ============================================================================

-- 1. Agregar columna updated_at a chat_messages (si no existe)
ALTER TABLE adaptive_interface.chat_messages 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Crear función para trigger de updated_at (si no existe)
CREATE OR REPLACE FUNCTION adaptive_interface.update_chat_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear trigger (solo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_chat_messages_updated'
  ) THEN
    CREATE TRIGGER trigger_chat_messages_updated
      BEFORE UPDATE ON adaptive_interface.chat_messages
      FOR EACH ROW
      EXECUTE FUNCTION adaptive_interface.update_chat_messages_timestamp();
  END IF;
END $$;

-- 4. Actualizar registros existentes que no tienen updated_at
UPDATE adaptive_interface.chat_messages 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- 5. Verificación
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns 
WHERE table_schema = 'adaptive_interface' 
  AND table_name = 'chat_messages'
  AND column_name = 'updated_at';

-- ============================================================================
-- Resultado esperado:
-- column_name | data_type                | column_default
-- updated_at  | timestamp with time zone | now()
-- ============================================================================
