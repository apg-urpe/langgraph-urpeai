-- =====================================================
-- TEAM GROUPS - Grupos personalizables por empresa
-- Reemplaza el campo `rol` hardcodeado por grupos dinámicos
-- =====================================================

-- 1. Crear tabla de grupos personalizables
CREATE TABLE IF NOT EXISTS public.team_groups (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT DEFAULT 'Users',
  color TEXT DEFAULT 'blue',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, slug)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_team_groups_empresa ON team_groups(empresa_id);
CREATE INDEX IF NOT EXISTS idx_team_groups_active ON team_groups(empresa_id, is_active);

-- RLS
ALTER TABLE public.team_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_groups_select" ON team_groups;
CREATE POLICY "team_groups_select" ON team_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.wp_team_humano actor
      WHERE actor.auth_uid = auth.uid()
        AND (
          actor.role_id = 1
          OR actor.empresa_id = team_groups.empresa_id
        )
    )
  );

DROP POLICY IF EXISTS "team_groups_insert" ON team_groups;
CREATE POLICY "team_groups_insert" ON team_groups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.wp_team_humano actor
      WHERE actor.auth_uid = auth.uid()
        AND actor.role_id IN (1, 2)
        AND (
          actor.role_id = 1
          OR actor.empresa_id = team_groups.empresa_id
        )
    )
  );

DROP POLICY IF EXISTS "team_groups_update" ON team_groups;
CREATE POLICY "team_groups_update" ON team_groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.wp_team_humano actor
      WHERE actor.auth_uid = auth.uid()
        AND actor.role_id IN (1, 2)
        AND (
          actor.role_id = 1
          OR actor.empresa_id = team_groups.empresa_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.wp_team_humano actor
      WHERE actor.auth_uid = auth.uid()
        AND actor.role_id IN (1, 2)
        AND (
          actor.role_id = 1
          OR actor.empresa_id = team_groups.empresa_id
        )
    )
  );

DROP POLICY IF EXISTS "team_groups_delete" ON team_groups;
CREATE POLICY "team_groups_delete" ON team_groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.wp_team_humano actor
      WHERE actor.auth_uid = auth.uid()
        AND actor.role_id IN (1, 2)
        AND (
          actor.role_id = 1
          OR actor.empresa_id = team_groups.empresa_id
        )
    )
  );

-- 2. DROP el CHECK constraint que bloquea valores custom en wp_team_humano.rol
ALTER TABLE public.wp_team_humano DROP CONSTRAINT IF EXISTS wp_team_humano_rol_check;

-- 3. Seed: Crear grupos default para todas las empresas existentes
INSERT INTO team_groups (empresa_id, name, slug, icon, color, sort_order)
SELECT DISTINCT e.id, g.name, g.slug, g.icon, g.color, g.sort_order
FROM wp_empresa_perfil e
CROSS JOIN (VALUES
  ('Asesor',         'asesor',         'Users',     'blue',    1),
  ('Marketing',      'marketing',      'Target',    'pink',    2),
  ('Supervisor',     'supervisor',     'Briefcase', 'purple',  3),
  ('RRHH',           'rrhh',           'Heart',     'red',     4),
  ('Administrativo', 'administrativo', 'Shield',    'amber',   5),
  ('Operaciones',    'operaciones',    'Zap',       'cyan',    6)
) AS g(name, slug, icon, color, sort_order)
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- 4. Trigger para auto-crear grupos default cuando se crea una empresa nueva
CREATE OR REPLACE FUNCTION seed_default_team_groups()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_groups (empresa_id, name, slug, icon, color, sort_order) VALUES
    (NEW.id, 'Asesor',         'asesor',         'Users',     'blue',    1),
    (NEW.id, 'Marketing',      'marketing',      'Target',    'pink',    2),
    (NEW.id, 'Supervisor',     'supervisor',     'Briefcase', 'purple',  3),
    (NEW.id, 'RRHH',           'rrhh',           'Heart',     'red',     4),
    (NEW.id, 'Administrativo', 'administrativo', 'Shield',    'amber',   5),
    (NEW.id, 'Operaciones',    'operaciones',    'Zap',       'cyan',    6)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_team_groups ON wp_empresa_perfil;
CREATE TRIGGER trg_seed_team_groups
  AFTER INSERT ON wp_empresa_perfil
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_team_groups();

-- Verificación
SELECT empresa_id, name, slug, icon, color, sort_order
FROM team_groups
ORDER BY empresa_id, sort_order;
