-- =====================================================
-- AGREGAR GRUPOS BASE FALTANTES (Marketing, RRHH, Administrativo, Operaciones)
-- Para empresas que solo tienen los 3 grupos originales
-- =====================================================

-- Insertar grupos faltantes para todas las empresas existentes
INSERT INTO team_groups (empresa_id, name, slug, icon, color, sort_order)
SELECT DISTINCT e.id, g.name, g.slug, g.icon, g.color, g.sort_order
FROM wp_empresa_perfil e
CROSS JOIN (VALUES
  ('Marketing',      'marketing',      'Target',    'pink',  2),
  ('RRHH',           'rrhh',           'Heart',     'red',   4),
  ('Administrativo', 'administrativo', 'Shield',    'amber', 5),
  ('Operaciones',    'operaciones',    'Zap',       'cyan',  6)
) AS g(name, slug, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM team_groups tg 
  WHERE tg.empresa_id = e.id AND tg.slug = g.slug
);

-- Verificar resultado
SELECT 
  empresa_id,
  COUNT(*) FILTER (WHERE slug IN ('asesor','marketing','supervisor','rrhh','administrativo','operaciones')) as base_groups_count,
  STRING_AGG(name, ', ' ORDER BY sort_order) as groups
FROM team_groups
WHERE slug IN ('asesor','marketing','supervisor','rrhh','administrativo','operaciones')
GROUP BY empresa_id
ORDER BY empresa_id;
