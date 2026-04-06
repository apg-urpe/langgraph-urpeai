-- ============================================================================
-- TRANSCRIPCIONES RLS — Políticas de seguridad por rol
-- Fecha: 2026-02-25
-- ============================================================================
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- 1. Habilitar RLS
ALTER TABLE public.transcripciones ENABLE ROW LEVEL SECURITY;

-- 2. Índice adicional para queries por grant_id (role 3)
CREATE INDEX IF NOT EXISTS idx_transcripciones_grant_id 
  ON public.transcripciones USING btree (grant_id) 
  TABLESPACE pg_default;

-- 3. DROP policies existentes (por si se re-ejecuta + pre-existentes)
DROP POLICY IF EXISTS "transcripciones_select" ON public.transcripciones;
DROP POLICY IF EXISTS "transcripciones_insert" ON public.transcripciones;
DROP POLICY IF EXISTS "transcripciones_update" ON public.transcripciones;
DROP POLICY IF EXISTS "transcripciones_delete" ON public.transcripciones;
-- Limpiar policies pre-existentes que no son nuestras
DROP POLICY IF EXISTS "select_transcripciones_authenticated" ON public.transcripciones;
DROP POLICY IF EXISTS "transcripciones_empresa_policy" ON public.transcripciones;

-- ============================================================================
-- SELECT: Lectura según rol
-- Role 1 (Dev): Ve transcripciones de CUALQUIER empresa (la UI filtra por empresa)
-- Role 2 (Admin/Líder): Ve transcripciones de SU empresa (via cita.empresa_id)
-- Role 3 (Asesor): Ve solo SUS transcripciones (grant_id o cita.team_humano_id)
-- ============================================================================
CREATE POLICY "transcripciones_select" ON public.transcripciones
  FOR SELECT TO authenticated
  USING (
    -- Role 1: acceso total
    EXISTS (
      SELECT 1 FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
    -- Role 2: transcripciones de su empresa (via cita)
    OR cita_id IN (
      SELECT c.id FROM public.wp_citas c
      WHERE c.empresa_id IN (
        SELECT empresa_id FROM public.wp_team_humano
        WHERE auth_uid = auth.uid() AND role_id = 2
      )
    )
    -- Role 2: transcripciones sin cita pero con grant_id de un miembro de su empresa
    OR (
      cita_id IS NULL
      AND grant_id IN (
        SELECT th2.grant_id FROM public.wp_team_humano th2
        WHERE th2.grant_id IS NOT NULL
          AND th2.empresa_id IN (
            SELECT empresa_id FROM public.wp_team_humano
            WHERE auth_uid = auth.uid() AND role_id = 2
          )
      )
    )
    -- Role 3: transcripciones propias por grant_id (con o sin cita)
    OR grant_id IN (
      SELECT grant_id FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id = 3 AND grant_id IS NOT NULL
    )
    -- Role 3: transcripciones propias por cita asignada
    OR cita_id IN (
      SELECT c.id FROM public.wp_citas c
      WHERE c.team_humano_id IN (
        SELECT id FROM public.wp_team_humano
        WHERE auth_uid = auth.uid() AND role_id = 3
      )
    )
  );

-- ============================================================================
-- INSERT: Solo roles 1-2 pueden insertar (el sistema/webhook inserta)
-- ============================================================================
CREATE POLICY "transcripciones_insert" ON public.transcripciones
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

-- ============================================================================
-- UPDATE: Solo roles 1-2
-- ============================================================================
CREATE POLICY "transcripciones_update" ON public.transcripciones
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id IN (1, 2)
    )
  );

-- ============================================================================
-- DELETE: Solo role 1 (Dev)
-- ============================================================================
CREATE POLICY "transcripciones_delete" ON public.transcripciones
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wp_team_humano
      WHERE auth_uid = auth.uid() AND role_id = 1
    )
  );

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT 
  schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'transcripciones'
ORDER BY policyname;
