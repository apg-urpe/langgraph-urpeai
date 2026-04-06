-- ============================================================================
-- MARKETING AUDIENCES SCHEMA
-- Sistema de audiencias independientes y reciclables para campañas
-- ============================================================================

-- 1. Tabla de Audiencias (El "Contenedor" reciclable)
CREATE TABLE IF NOT EXISTS public.wp_marketing_audiencias (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  tipo text NOT NULL DEFAULT 'estatica', -- 'estatica' o 'dinamica'
  filtros_json jsonb DEFAULT '{}'::jsonb, -- Si es dinámica, guarda los criterios de segmentación
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT check_tipo_audiencia CHECK (tipo IN ('estatica', 'dinamica'))
);

-- 2. Relación Audiencia-Contacto (Para audiencias estáticas o miembros actuales)
CREATE TABLE IF NOT EXISTS public.wp_marketing_audiencia_contacto (
  id bigserial PRIMARY KEY,
  audiencia_id bigint NOT NULL REFERENCES wp_marketing_audiencias(id) ON DELETE CASCADE,
  contacto_id bigint NOT NULL REFERENCES wp_contactos(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(audiencia_id, contacto_id)
);

-- 3. Modificación de Campañas para referenciar Audiencias
ALTER TABLE public.wp_email_campanas 
ADD COLUMN IF NOT EXISTS audiencia_id bigint REFERENCES wp_marketing_audiencias(id) ON DELETE SET NULL;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_audiencias_empresa ON wp_marketing_audiencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audiencia_contacto_audiencia ON wp_marketing_audiencia_contacto(audiencia_id);
CREATE INDEX IF NOT EXISTS idx_audiencia_contacto_contacto ON wp_marketing_audiencia_contacto(contacto_id);
CREATE INDEX IF NOT EXISTS idx_email_campanas_audiencia ON wp_email_campanas(audiencia_id);

-- 5. Trigger para updated_at
DROP TRIGGER IF EXISTS update_wp_marketing_audiencias_timestamp ON public.wp_marketing_audiencias;
CREATE TRIGGER update_wp_marketing_audiencias_timestamp BEFORE UPDATE ON public.wp_marketing_audiencias
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- 6. RLS POLICIES - Aislamiento de Seguridad
-- ============================================================================

ALTER TABLE wp_marketing_audiencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_marketing_audiencia_contacto ENABLE ROW LEVEL SECURITY;

-- Audiencias: Visible para empresa propietaria O rol_id 1 (Dev Team)
DROP POLICY IF EXISTS "Audiencias visibles por empresa" ON wp_marketing_audiencias;
CREATE POLICY "Audiencias visibles por empresa" ON wp_marketing_audiencias
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- Audiencias: INSERT/UPDATE/DELETE - misma lógica
DROP POLICY IF EXISTS "Audiencias modificables por empresa o dev" ON wp_marketing_audiencias;
CREATE POLICY "Audiencias modificables por empresa o dev" ON wp_marketing_audiencias
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- Audiencia-Contacto: Visible si la audiencia pertenece a tu empresa O eres rol_id 1
DROP POLICY IF EXISTS "Audiencia contactos visibles por empresa" ON wp_marketing_audiencia_contacto;
CREATE POLICY "Audiencia contactos visibles por empresa" ON wp_marketing_audiencia_contacto
  FOR ALL USING (
    audiencia_id IN (
      SELECT id FROM wp_marketing_audiencias 
      WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  )
  WITH CHECK (
    audiencia_id IN (
      SELECT id FROM wp_marketing_audiencias 
      WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- ============================================================================
-- 7. RESTRICCIÓN: Campañas de Sistema NO usan Audiencias
-- ============================================================================
-- Las campañas con empresa_id IS NULL (sistema/globales) no deben vincular audiencias
-- porque las audiencias siempre son privadas de una empresa.
-- El flujo de inscripción para campañas de sistema es:
--   1. n8n detecta evento (ej: contacto nuevo)
--   2. n8n inscribe directamente en wp_email_contacto_campana con empresa_id del contacto
--   3. Los datos de ejecución quedan aislados por empresa

-- NOTA: No se puede crear un CHECK constraint que valide esto porque audiencia_id
-- puede ser NULL para campañas normales también. La validación debe hacerse en la aplicación.

-- ============================================================================
-- 8. Comentarios de documentación
-- ============================================================================
COMMENT ON TABLE wp_marketing_audiencias IS 'Audiencias privadas por empresa. Las campañas de sistema (empresa_id IS NULL) NO deben vincular audiencias.';
COMMENT ON COLUMN wp_marketing_audiencias.tipo IS 'estatica: lista fija de contactos, dinamica: basada en filtros_json';
COMMENT ON COLUMN wp_marketing_audiencias.empresa_id IS 'Empresa propietaria. SIEMPRE requerido - las audiencias son privadas.';
COMMENT ON TABLE wp_marketing_audiencia_contacto IS 'Miembros de una audiencia específica. Heredan el aislamiento de la audiencia padre.';
