-- ============================================================================
-- FIX_WP_CONTACTOS_RLS_SECURE.sql
-- Corrige las políticas RLS de wp_contactos
--
-- PROBLEMA: 8 políticas permisivas que dan acceso público (anon) a todos los datos
-- SOLUCIÓN: Eliminar todas y reemplazar con políticas correctas multi-tenant
--
-- IMPORTANTE ANTES DE EJECUTAR:
-- 1. En n8n → Credencial Supabase → cambiar a SERVICE_ROLE KEY (no anon key)
--    Esto permite que n8n bypasee RLS sin necesitar políticas públicas
-- 2. Ejecutar este script en Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PASO 1: Asegurar que RLS está habilitado
-- ============================================================================
ALTER TABLE public.wp_contactos ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASO 2: Eliminar TODAS las políticas existentes (las 8 problemáticas)
-- ============================================================================
DROP POLICY IF EXISTS "Allow all users to select from wp_contactos" ON public.wp_contactos;
DROP POLICY IF EXISTS "Enable read access for all users"            ON public.wp_contactos;
DROP POLICY IF EXISTS "Policy with security definer functions"      ON public.wp_contactos;
DROP POLICY IF EXISTS "contactos_empresa_policy"                    ON public.wp_contactos;
DROP POLICY IF EXISTS "n8n puede actualizar wp_contactos"          ON public.wp_contactos;
DROP POLICY IF EXISTS "n8n puede eliminar wp_contactos"            ON public.wp_contactos;
DROP POLICY IF EXISTS "n8n puede insertar wp_contactos"            ON public.wp_contactos;
DROP POLICY IF EXISTS "n8n puede leer wp_contactos"                ON public.wp_contactos;

-- Por si acaso existen con nombres alternativos
DROP POLICY IF EXISTS "tenant_isolation"                            ON public.wp_contactos;
DROP POLICY IF EXISTS "contactos_select"                           ON public.wp_contactos;
DROP POLICY IF EXISTS "contactos_insert"                           ON public.wp_contactos;
DROP POLICY IF EXISTS "contactos_update"                           ON public.wp_contactos;
DROP POLICY IF EXISTS "contactos_delete"                           ON public.wp_contactos;

-- ============================================================================
-- PASO 3: La función get_user_empresa_ids() ya existe y es usada por 12 tablas.
-- No se toca. Las nuevas políticas la reutilizan directamente.
-- ============================================================================

-- ============================================================================
-- PASO 4: Crear políticas correctas
--
-- FILOSOFÍA:
-- - Usuarios autenticados (frontend) → solo ven/editan contactos de SU empresa
-- - Dev Team (role_id=1) → puede ver contactos de CUALQUIER empresa
-- - n8n → usa service_role key, bypasea RLS completamente (no necesita policy)
-- - Anon/público → SIN ACCESO
-- ============================================================================

-- SELECT: Usuarios autenticados ven solo contactos de su empresa
-- Dev Team (role_id=1) puede ver todos
CREATE POLICY "contactos_select" ON public.wp_contactos
FOR SELECT
TO authenticated
USING (
  empresa_id IN (SELECT public.get_user_empresa_ids())
);

-- INSERT: Solo usuarios autenticados de la misma empresa pueden insertar
-- (n8n usa service_role y no necesita esta policy)
CREATE POLICY "contactos_insert" ON public.wp_contactos
FOR INSERT
TO authenticated
WITH CHECK (
  empresa_id IN (SELECT public.get_user_empresa_ids())
);

-- UPDATE: Solo usuarios autenticados de la misma empresa pueden actualizar
CREATE POLICY "contactos_update" ON public.wp_contactos
FOR UPDATE
TO authenticated
USING (
  empresa_id IN (SELECT public.get_user_empresa_ids())
)
WITH CHECK (
  empresa_id IN (SELECT public.get_user_empresa_ids())
);

-- DELETE: Solo usuarios autenticados de la misma empresa pueden eliminar
CREATE POLICY "contactos_delete" ON public.wp_contactos
FOR DELETE
TO authenticated
USING (
  empresa_id IN (SELECT public.get_user_empresa_ids())
);

-- ============================================================================
-- PASO 5: Verificación — ver las políticas resultantes
-- ============================================================================
SELECT
  policyname,
  cmd        AS operacion,
  roles,
  permissive,
  qual       AS condicion_using,
  with_check AS condicion_check
FROM pg_policies
WHERE tablename = 'wp_contactos'
ORDER BY cmd, policyname;

-- ============================================================================
-- RESULTADO ESPERADO: 4 filas (contactos_delete, contactos_insert,
-- contactos_select, contactos_update), todas con roles = {authenticated}
-- Sin ninguna política para el rol "anon" o "public"
-- ============================================================================
