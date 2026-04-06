-- ============================================================
-- FIX: Trigger update_user_total_sessions()
-- Problema: Referencia esquema inexistente "Adaptive Interface"
-- Corrección: Usar esquema correcto adaptive_interface
-- Fecha: 2026-03-30
-- ============================================================

-- Reemplazar la función trigger con el nombre de esquema correcto
CREATE OR REPLACE FUNCTION adaptive_interface.update_user_total_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE adaptive_interface.user_profiles
    SET total_sessions = total_sessions + 1,
        updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE adaptive_interface.user_profiles
    SET total_sessions = GREATEST(0, total_sessions - 1),
        updated_at = NOW()
    WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
