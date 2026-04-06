-- =====================================================
-- DIAGNÓSTICO: Verificar Sistema de Invitaciones
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Verificar que la tabla wp_team_invitations existe
SELECT 
  'wp_team_invitations' AS tabla,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'wp_team_invitations'
  ) THEN '✅ EXISTE' ELSE '❌ NO EXISTE' END AS estado;

-- 2. Verificar que las funciones RPC existen
SELECT 
  routine_name AS funcion,
  '✅ EXISTE' AS estado
FROM information_schema.routines 
WHERE routine_name IN ('create_team_invitation_v2', 'accept_team_invitation_v2')
ORDER BY routine_name;

-- 3. Verificar RLS está habilitado
SELECT 
  tablename,
  rowsecurity AS rls_habilitado
FROM pg_tables 
WHERE tablename = 'wp_team_invitations';

-- 4. Verificar políticas RLS
SELECT 
  policyname AS politica,
  cmd AS operacion,
  permissive
FROM pg_policies 
WHERE tablename = 'wp_team_invitations'
ORDER BY policyname;

-- 5. Ver invitaciones recientes (últimas 10)
SELECT 
  id,
  email,
  rol,
  role_id,
  empresa_id,
  status,
  team_member_id,
  created_at,
  expires_at,
  accepted_at,
  LEFT(token::text, 8) || '...' AS token_preview
FROM wp_team_invitations 
ORDER BY created_at DESC 
LIMIT 10;

-- 6. Verificar miembros inactivos (pre-creados por invitación V2)
SELECT 
  id,
  email,
  nombre,
  rol,
  role_id,
  empresa_id,
  is_active,
  auth_uid IS NOT NULL AS tiene_auth_uid,
  created_at
FROM wp_team_humano 
WHERE is_active = FALSE 
AND deleted IS NULL
ORDER BY created_at DESC 
LIMIT 10;

-- 7. Verificar grants de las funciones RPC
SELECT 
  grantee,
  routine_name,
  privilege_type
FROM information_schema.routine_privileges 
WHERE routine_name IN ('create_team_invitation_v2', 'accept_team_invitation_v2')
ORDER BY routine_name, grantee;
