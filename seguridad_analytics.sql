-- ══════════════════════════════════════════════════════
-- SEGURIDAD Y PERMISOS — Esquema Analytics
-- Proyecto: vecspltvmyopwbjzerow (Monica CRM Inteligent)
-- ══════════════════════════════════════════════════════

-- 1. Permitir el uso del esquema a usuarios internos y autenticados
GRANT USAGE ON SCHEMA analytics TO authenticated, service_role;

-- 2. Permisos de LECTURA (SELECT) para usuarios que han iniciado sesión
-- Esto permite que los Dashboards y la App vean los KPIs pero NO los borren.
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO authenticated;

-- 3. Permisos TOTALES (ALL) solo para la llave maestra (Backend/Admin)
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO service_role;

-- 4. Configurar permisos automáticos para CUALQUIER tabla futura en este esquema
-- Así no tendrás que ejecutar este script cada vez que crees una tabla nueva.
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT ALL ON TABLES TO service_role;

-- NOTA DE SEGURIDAD: 
-- Hemos excluido al rol 'anon' para evitar que cualquier persona en internet 
-- pueda acceder a tus datos de facturación y marketing.
