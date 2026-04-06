-- ============================================================================
-- FIX: RLS Policies para tablas de redacción
-- Fecha: 2026-02-25
-- Problema: redaccion_tipos, redaccion, redaccion_detalles tienen RLS
--           habilitado pero sin policies → todos los INSERT/SELECT fallan con 403
-- ============================================================================

-- ============================================================================
-- 1. REDACCION_TIPOS — empresa_id directo
-- ============================================================================

ALTER TABLE redaccion_tipos ENABLE ROW LEVEL SECURITY;

-- SELECT: miembros de la empresa + devs (role_id=1)
CREATE POLICY "redaccion_tipos_select" ON redaccion_tipos
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- INSERT: miembros de la empresa + devs
CREATE POLICY "redaccion_tipos_insert" ON redaccion_tipos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- UPDATE: miembros de la empresa + devs
CREATE POLICY "redaccion_tipos_update" ON redaccion_tipos
  FOR UPDATE TO authenticated
  USING (
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

-- DELETE: miembros de la empresa + devs
CREATE POLICY "redaccion_tipos_delete" ON redaccion_tipos
  FOR DELETE TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- ============================================================================
-- 2. REDACCION — acceso vía tipo_id → redaccion_tipos.empresa_id
-- ============================================================================

ALTER TABLE redaccion ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "redaccion_select" ON redaccion
  FOR SELECT TO authenticated
  USING (
    tipo_id IN (
      SELECT id FROM redaccion_tipos WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- INSERT
CREATE POLICY "redaccion_insert" ON redaccion
  FOR INSERT TO authenticated
  WITH CHECK (
    tipo_id IN (
      SELECT id FROM redaccion_tipos WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- UPDATE
CREATE POLICY "redaccion_update" ON redaccion
  FOR UPDATE TO authenticated
  USING (
    tipo_id IN (
      SELECT id FROM redaccion_tipos WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  )
  WITH CHECK (
    tipo_id IN (
      SELECT id FROM redaccion_tipos WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- DELETE
CREATE POLICY "redaccion_delete" ON redaccion
  FOR DELETE TO authenticated
  USING (
    tipo_id IN (
      SELECT id FROM redaccion_tipos WHERE empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- ============================================================================
-- 3. REDACCION_DETALLES — acceso vía redaccion_id → redaccion → tipo
-- ============================================================================

ALTER TABLE redaccion_detalles ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "redaccion_detalles_select" ON redaccion_detalles
  FOR SELECT TO authenticated
  USING (
    redaccion_id IN (
      SELECT r.id FROM redaccion r
      JOIN redaccion_tipos rt ON r.tipo_id = rt.id
      WHERE rt.empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- INSERT
CREATE POLICY "redaccion_detalles_insert" ON redaccion_detalles
  FOR INSERT TO authenticated
  WITH CHECK (
    redaccion_id IN (
      SELECT r.id FROM redaccion r
      JOIN redaccion_tipos rt ON r.tipo_id = rt.id
      WHERE rt.empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- UPDATE
CREATE POLICY "redaccion_detalles_update" ON redaccion_detalles
  FOR UPDATE TO authenticated
  USING (
    redaccion_id IN (
      SELECT r.id FROM redaccion r
      JOIN redaccion_tipos rt ON r.tipo_id = rt.id
      WHERE rt.empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  )
  WITH CHECK (
    redaccion_id IN (
      SELECT r.id FROM redaccion r
      JOIN redaccion_tipos rt ON r.tipo_id = rt.id
      WHERE rt.empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- DELETE
CREATE POLICY "redaccion_detalles_delete" ON redaccion_detalles
  FOR DELETE TO authenticated
  USING (
    redaccion_id IN (
      SELECT r.id FROM redaccion r
      JOIN redaccion_tipos rt ON r.tipo_id = rt.id
      WHERE rt.empresa_id IN (
        SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM wp_team_humano WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Ejecutar después para confirmar que las policies existen:

-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('redaccion_tipos', 'redaccion', 'redaccion_detalles')
-- ORDER BY tablename, cmd;
