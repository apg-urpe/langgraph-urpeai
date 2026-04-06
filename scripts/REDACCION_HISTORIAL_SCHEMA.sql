-- =====================================================
-- HISTORIAL DE CAMBIOS PARA SECCIONES DE REDACCIÓN
-- Guarda una snapshot antes de cada edición
-- =====================================================

-- 1. Tabla de historial
CREATE TABLE IF NOT EXISTS redaccion_detalle_historial (
  id           BIGSERIAL PRIMARY KEY,
  detalle_id   BIGINT NOT NULL REFERENCES redaccion_detalles(id) ON DELETE CASCADE,
  empresa_id   BIGINT NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  titulo       TEXT,
  contenido    TEXT,
  changed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type  TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'ai_assist' | 'ai_generate'
  change_summary TEXT,                          -- breve descripción del cambio
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_rdh_detalle ON redaccion_detalle_historial(detalle_id);
CREATE INDEX IF NOT EXISTS idx_rdh_empresa ON redaccion_detalle_historial(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rdh_created ON redaccion_detalle_historial(created_at DESC);

-- 3. RLS
ALTER TABLE redaccion_detalle_historial ENABLE ROW LEVEL SECURITY;

-- Policy: los miembros del equipo pueden ver historial de su empresa
CREATE POLICY "team_read_historial"
  ON redaccion_detalle_historial FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

-- Policy: los miembros del equipo pueden insertar historial de su empresa
CREATE POLICY "team_insert_historial"
  ON redaccion_detalle_historial FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

-- 4. Función trigger para auto-guardar historial en cada UPDATE de redaccion_detalles
CREATE OR REPLACE FUNCTION fn_redaccion_detalle_historial()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id BIGINT;
BEGIN
  -- Obtener empresa_id desde la redacción padre
  SELECT r.empresa_id INTO v_empresa_id
  FROM redaccion r
  WHERE r.id = OLD.redaccion_id;

  -- Solo guardar si cambió título o contenido
  IF OLD.titulo IS DISTINCT FROM NEW.titulo OR OLD.contenido IS DISTINCT FROM NEW.contenido THEN
    INSERT INTO redaccion_detalle_historial (
      detalle_id, empresa_id, titulo, contenido, changed_by, change_type
    ) VALUES (
      OLD.id, v_empresa_id, OLD.titulo, OLD.contenido, auth.uid(), 'manual'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger
DROP TRIGGER IF EXISTS trg_redaccion_detalle_historial ON redaccion_detalles;
CREATE TRIGGER trg_redaccion_detalle_historial
  BEFORE UPDATE ON redaccion_detalles
  FOR EACH ROW
  EXECUTE FUNCTION fn_redaccion_detalle_historial();

-- 6. Verificar
SELECT 'redaccion_detalle_historial table and trigger created' AS status;
