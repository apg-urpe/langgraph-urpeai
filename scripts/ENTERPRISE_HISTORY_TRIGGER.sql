-- ═══════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE HISTORY TRIGGER - Registra cambios en wp_empresa_perfil
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Crear tabla de historial si no existe
CREATE TABLE IF NOT EXISTS wp_empresa_historial (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario_id BIGINT REFERENCES wp_team_humano(id) ON DELETE SET NULL,
  mensaje_commit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_empresa_historial_empresa ON wp_empresa_historial(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_historial_campo ON wp_empresa_historial(campo);
CREATE INDEX IF NOT EXISTS idx_empresa_historial_created ON wp_empresa_historial(created_at DESC);

-- 2. Función trigger que registra cambios
CREATE OR REPLACE FUNCTION fn_audit_empresa_perfil()
RETURNS TRIGGER AS $$
DECLARE
  campo_nombre TEXT;
  valor_old TEXT;
  valor_new TEXT;
  campos_auditar TEXT[] := ARRAY[
    'nombre', 'ciudad', 'pais', 'rubro',
    'informacion_empresarial', 'preguntas_frecuentes', 
    'servicios_generales', 'embudo_ventas',
    'logo_url', 'sitio_web', 'telefono', 'email', 'direccion',
    'reglas_negocio', 'canal_comunicacion', 'timezone',
    'metadata', 'branding',
    'activo', 'metricas_activa', 'email_marketing', 'team_slack'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOREACH campo_nombre IN ARRAY campos_auditar LOOP
      -- Obtener valores como texto
      EXECUTE format('SELECT ($1).%I::TEXT', campo_nombre) INTO valor_old USING OLD;
      EXECUTE format('SELECT ($1).%I::TEXT', campo_nombre) INTO valor_new USING NEW;
      
      -- Solo registrar si el valor cambió
      IF valor_old IS DISTINCT FROM valor_new THEN
        INSERT INTO wp_empresa_historial (
          empresa_id,
          campo,
          valor_anterior,
          valor_nuevo,
          usuario_id,
          mensaje_commit
        ) VALUES (
          NEW.id,
          campo_nombre,
          valor_old,
          valor_new,
          NULL, -- Se puede pasar via app si se necesita
          'UPDATE'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear trigger
DROP TRIGGER IF EXISTS trg_audit_empresa_perfil ON wp_empresa_perfil;
CREATE TRIGGER trg_audit_empresa_perfil
  AFTER UPDATE ON wp_empresa_perfil
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_empresa_perfil();

-- 4. Función para restaurar valor anterior
CREATE OR REPLACE FUNCTION fn_restore_enterprise_field(
  p_historial_id BIGINT,
  p_usuario_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_empresa_id BIGINT;
  v_campo TEXT;
  v_valor_anterior TEXT;
BEGIN
  -- Obtener datos del historial
  SELECT empresa_id, campo, valor_anterior
  INTO v_empresa_id, v_campo, v_valor_anterior
  FROM wp_empresa_historial
  WHERE id = p_historial_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Restaurar el valor (el trigger registrará este cambio automáticamente)
  EXECUTE format(
    'UPDATE wp_empresa_perfil SET %I = $1, fecha_actualizacion = NOW() WHERE id = $2',
    v_campo
  ) USING v_valor_anterior, v_empresa_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 5. RLS Policies
ALTER TABLE wp_empresa_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their enterprise history" ON wp_empresa_historial;
CREATE POLICY "Users can view their enterprise history"
  ON wp_empresa_historial
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

-- 6. Grants
GRANT SELECT ON wp_empresa_historial TO authenticated;
GRANT EXECUTE ON FUNCTION fn_restore_enterprise_field TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════
-- Después de ejecutar, verifica que el trigger existe:
-- SELECT * FROM pg_trigger WHERE tgname = 'trg_audit_empresa_perfil';
--
-- Prueba editando un campo y luego consulta:
-- SELECT * FROM wp_empresa_historial ORDER BY created_at DESC LIMIT 10;
-- ═══════════════════════════════════════════════════════════════════════════════
