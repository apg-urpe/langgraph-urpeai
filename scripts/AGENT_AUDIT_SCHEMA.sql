-- ═══════════════════════════════════════════════════════════════════════════════
-- AGENT AUDIT SCHEMA - VERSIÓN UNIFICADA
-- Compatible con wp_auditoria existente + vista wp_agentes_historial para el store
-- ═══════════════════════════════════════════════════════════════════════════════

-- =====================================================
-- 0. AGREGAR COLUMNA archivado A wp_agentes (soft delete)
-- =====================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wp_agentes' AND column_name = 'archivado'
  ) THEN
    ALTER TABLE wp_agentes ADD COLUMN archivado BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN wp_agentes.archivado IS 'Soft delete: agente archivado no responde mensajes';
  END IF;
END $$;

-- =====================================================
-- 1. AGREGAR COLUMNA mensaje_commit SI NO EXISTE
-- =====================================================
-- La tabla wp_auditoria ya existe, solo agregamos lo que falta

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wp_auditoria' AND column_name = 'mensaje_commit'
  ) THEN
    ALTER TABLE wp_auditoria ADD COLUMN mensaje_commit TEXT;
  END IF;
END $$;

-- =====================================================
-- 2. VISTA wp_agentes_historial (para compatibilidad con store)
-- =====================================================
-- El store usa wp_agentes_historial, esta vista mapea desde wp_auditoria

DROP VIEW IF EXISTS wp_agentes_historial;

CREATE VIEW wp_agentes_historial AS
SELECT 
  a.id,
  a.registro_id AS agente_id,
  a.campo,
  a.valor_anterior,
  a.valor_nuevo,
  a.usuario_id,
  a.mensaje_commit,
  a.fecha AS created_at
FROM wp_auditoria a
WHERE a.tabla = 'wp_agentes';

COMMENT ON VIEW wp_agentes_historial IS 'Vista de compatibilidad sobre wp_auditoria para el store de agentes';

-- =====================================================
-- 3. MEJORAR TRIGGER DE wp_agentes (sin truncar valores)
-- =====================================================

CREATE OR REPLACE FUNCTION fn_audit_wp_agentes()
RETURNS TRIGGER AS $$
DECLARE
  campo_nombre TEXT;
  valor_old TEXT;
  valor_new TEXT;
  campos_a_auditar TEXT[] := ARRAY[
    'nombre_agente',
    'instrucciones', 
    'comportamiento', 
    'restricciones', 
    'formato_respuesta', 
    'areas_de_expertise', 
    'uso_de_emojis',
    'prompt_personalizado',
    'idioma',
    'url_imagen_agente',
    'llm',
    'mcp_url',
    'manejo_herramientas',
    'instrucciones_multimedia',
    'metadata_contacto',
    'id_rol'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOREACH campo_nombre IN ARRAY campos_a_auditar LOOP
      -- Obtener valores como texto (sin truncar)
      EXECUTE format('SELECT ($1).%I::TEXT', campo_nombre) INTO valor_old USING OLD;
      EXECUTE format('SELECT ($1).%I::TEXT', campo_nombre) INTO valor_new USING NEW;
      
      -- Solo registrar si el valor cambió
      IF valor_old IS DISTINCT FROM valor_new THEN
        INSERT INTO wp_auditoria (
          tabla,
          registro_id, 
          campo, 
          valor_anterior, 
          valor_nuevo,
          accion
        ) VALUES (
          'wp_agentes',
          NEW.id, 
          campo_nombre, 
          valor_old, 
          valor_new,
          'UPDATE'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear trigger
DROP TRIGGER IF EXISTS trg_audit_wp_agentes ON wp_agentes;

CREATE TRIGGER trg_audit_wp_agentes
  AFTER UPDATE ON wp_agentes
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_wp_agentes();

-- =====================================================
-- 4. FUNCIÓN PARA OBTENER HISTORIAL DE UN AGENTE
-- =====================================================

CREATE OR REPLACE FUNCTION fn_get_agent_history(
  p_agente_id BIGINT,
  p_campo TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  agente_id BIGINT,
  campo TEXT,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario_id BIGINT,
  usuario_nombre TEXT,
  mensaje_commit TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.registro_id AS agente_id,
    a.campo,
    a.valor_anterior,
    a.valor_nuevo,
    a.usuario_id,
    COALESCE(u.nombre || ' ' || u.apellido, a.usuario_nombre, 'Sistema') AS usuario_nombre,
    a.mensaje_commit,
    a.fecha AS created_at
  FROM wp_auditoria a
  LEFT JOIN wp_team_humano u ON a.usuario_id = u.id
  WHERE a.tabla = 'wp_agentes'
    AND a.registro_id = p_agente_id
    AND (p_campo IS NULL OR a.campo = p_campo)
  ORDER BY a.fecha DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. FUNCIÓN PARA RESTAURAR VALOR ANTERIOR
-- =====================================================

CREATE OR REPLACE FUNCTION fn_restore_agent_field(
  p_historial_id BIGINT,
  p_usuario_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_agente_id BIGINT;
  v_campo TEXT;
  v_valor_anterior TEXT;
BEGIN
  -- Obtener datos del historial desde wp_auditoria
  SELECT registro_id, campo, valor_anterior
  INTO v_agente_id, v_campo, v_valor_anterior
  FROM wp_auditoria
  WHERE id = p_historial_id
    AND tabla = 'wp_agentes';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Restaurar el valor (esto disparará el trigger de historial automáticamente)
  EXECUTE format(
    'UPDATE wp_agentes SET %I = $1, fecha_actualizacion = NOW() WHERE id = $2',
    v_campo
  ) USING v_valor_anterior, v_agente_id;
  
  -- Actualizar el último registro de historial con mensaje de restauración
  UPDATE wp_auditoria
  SET mensaje_commit = 'Restaurado desde versión anterior',
      usuario_id = COALESCE(p_usuario_id, usuario_id)
  WHERE id = (
    SELECT id FROM wp_auditoria 
    WHERE tabla = 'wp_agentes' 
      AND registro_id = v_agente_id 
    ORDER BY fecha DESC 
    LIMIT 1
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. GRANTS
-- =====================================================

GRANT SELECT, INSERT, UPDATE ON wp_auditoria TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE wp_auditoria_id_seq TO authenticated;
GRANT SELECT ON wp_agentes_historial TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_agent_history TO authenticated;
GRANT EXECUTE ON FUNCTION fn_restore_agent_field TO authenticated;

-- =====================================================
-- 7. RLS PARA wp_auditoria (si no existe)
-- =====================================================

-- Habilitar RLS
ALTER TABLE wp_auditoria ENABLE ROW LEVEL SECURITY;

-- Política: usuarios pueden ver auditoría de agentes de su empresa
DROP POLICY IF EXISTS "Users can view agent audit from their enterprise" ON wp_auditoria;
CREATE POLICY "Users can view agent audit from their enterprise"
  ON wp_auditoria
  FOR SELECT
  USING (
    tabla = 'wp_agentes' AND registro_id IN (
      SELECT a.id FROM wp_agentes a
      JOIN wp_team_humano t ON t.empresa_id = a.empresa_id
      WHERE t.auth_uid = auth.uid()
    )
    OR
    tabla = 'wp_agente_roles'
  );

-- Política: El trigger puede insertar (service role)
DROP POLICY IF EXISTS "Triggers can insert audit records" ON wp_auditoria;
CREATE POLICY "Triggers can insert audit records"
  ON wp_auditoria
  FOR INSERT
  WITH CHECK (true);

-- Política: usuarios pueden actualizar mensaje_commit
DROP POLICY IF EXISTS "Users can update commit messages" ON wp_auditoria;
CREATE POLICY "Users can update commit messages"
  ON wp_auditoria
  FOR UPDATE
  USING (
    tabla = 'wp_agentes' AND registro_id IN (
      SELECT a.id FROM wp_agentes a
      JOIN wp_team_humano t ON t.empresa_id = a.empresa_id
      WHERE t.auth_uid = auth.uid()
    )
  );

-- =====================================================
-- 8. FUNCIÓN DE LIMPIEZA (mantener últimos 180 días)
-- =====================================================

-- Eliminar versiones anteriores para evitar conflictos de sobrecarga
DROP FUNCTION IF EXISTS fn_cleanup_old_audit();
DROP FUNCTION IF EXISTS fn_cleanup_old_audit(INTEGER);

CREATE OR REPLACE FUNCTION fn_cleanup_old_audit(p_days INT DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM wp_auditoria 
  WHERE fecha < NOW() - (p_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION fn_cleanup_old_audit TO authenticated;

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON FUNCTION fn_audit_wp_agentes IS 'Trigger que registra cambios en wp_agentes (sin truncar valores)';
COMMENT ON FUNCTION fn_get_agent_history IS 'Obtener historial de cambios de un agente';
COMMENT ON FUNCTION fn_restore_agent_field IS 'Restaurar un campo a un valor anterior del historial';
COMMENT ON FUNCTION fn_cleanup_old_audit IS 'Eliminar registros de auditoría antiguos';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INSTRUCCIONES DE USO
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- Este script es COMPATIBLE con la estructura wp_auditoria existente.
-- 
-- El store usa wp_agentes_historial que ahora es una VISTA sobre wp_auditoria.
--
-- Para consultar historial:
--   SELECT * FROM wp_agentes_historial WHERE agente_id = 123;
--   -- o usar la función:
--   SELECT * FROM fn_get_agent_history(123);
--   SELECT * FROM fn_get_agent_history(123, 'instrucciones');
--
-- Para restaurar un valor:
--   SELECT fn_restore_agent_field(historial_id, usuario_id);
--
-- Para limpiar registros antiguos (>180 días):
--   SELECT fn_cleanup_old_audit();
--   SELECT fn_cleanup_old_audit(90); -- solo 90 días
--
-- ═══════════════════════════════════════════════════════════════════════════════
