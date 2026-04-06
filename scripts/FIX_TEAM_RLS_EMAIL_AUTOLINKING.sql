-- ============================================================================
-- FIX_TEAM_RLS_EMAIL_AUTOLINKING.sql
-- Problema: Usuarios con auth_uid no vinculado en wp_team_humano quedan
--           bloqueados por RLS al intentar auto-linking por email.
--           La política actual solo permite SELECT donde empresa_id = get_user_empresa_id(),
--           pero get_user_empresa_id() retorna NULL si auth_uid no existe → 0 filas.
--
-- Solución: Agregar condición OR que permita ver el propio registro por email
--           cuando el JWT del usuario coincide con el email del registro.
-- ============================================================================

-- PASO 1: Ver políticas actuales
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'wp_team_humano'
ORDER BY policyname;

-- PASO 2: Reemplazar la política SELECT para incluir auto-linking por email
DROP POLICY IF EXISTS "team_select_policy" ON wp_team_humano;

CREATE POLICY "team_select_policy" ON wp_team_humano
FOR SELECT
USING (
  -- Dev Team puede ver todo
  is_dev_team_member()
  -- Usuarios normales ven su empresa (cuando auth_uid ya está vinculado)
  OR empresa_id = get_user_empresa_id()
  -- Auto-linking: usuario puede ver su propio registro por email aunque auth_uid no esté vinculado
  OR email = auth.jwt() ->> 'email'
);

-- PASO 3: También actualizar la política UPDATE para permitir el auto-linking
--         (el código hace UPDATE auth_uid = user.id cuando encuentra el registro por email)
DROP POLICY IF EXISTS "team_update_policy" ON wp_team_humano;

CREATE POLICY "team_update_policy" ON wp_team_humano
FOR UPDATE
USING (
  is_dev_team_member()
  OR empresa_id = get_user_empresa_id()
  -- Permitir que el usuario actualice su propio registro (para vincular auth_uid)
  OR email = auth.jwt() ->> 'email'
)
WITH CHECK (
  is_dev_team_member()
  OR empresa_id = get_user_empresa_id()
  OR email = auth.jwt() ->> 'email'
);

-- PASO 4: Verificar políticas resultantes
SELECT policyname, cmd, permissive, roles
FROM pg_policies
WHERE tablename = 'wp_team_humano'
ORDER BY policyname;
