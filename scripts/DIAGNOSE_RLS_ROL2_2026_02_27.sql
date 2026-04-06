-- ============================================================================
-- DIAGNÓSTICO: Tablas usadas por fetchContactDetails sin policies para rol 2
-- Fecha: 2026-02-27
-- Ejecutar en Supabase SQL Editor (seguro - solo lectura)
-- ============================================================================

-- 1. Ver qué tablas tienen RLS habilitado
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'wp_contactos',
    'wp_citas',
    'wp_conversaciones',
    'wp_multimedia',
    'wp_contactos_nota',
    'wp_tareas',
    'wp_tareas_items',
    'wp_crm_servicios',
    'wp_crm_pagos',
    'wp_empresa_embudo',
    'wp_team_humano',
    'wp_contacto_estado_embudo',
    'wp_mensajes',
    'transcripciones'
  )
ORDER BY tablename;

-- 2. Ver policies existentes por tabla
SELECT 
  tablename,
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'wp_contactos',
    'wp_citas',
    'wp_conversaciones',
    'wp_multimedia',
    'wp_contactos_nota',
    'wp_tareas',
    'wp_tareas_items',
    'wp_crm_servicios',
    'wp_crm_pagos',
    'wp_empresa_embudo',
    'wp_team_humano',
    'wp_contacto_estado_embudo',
    'wp_mensajes',
    'transcripciones'
  )
ORDER BY tablename, policyname;

-- 3. Tablas con RLS habilitado pero SIN ninguna policy (PELIGROSO: bloquea todo)
SELECT 
  t.tablename,
  t.rowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count,
  CASE 
    WHEN t.rowsecurity AND COUNT(p.policyname) = 0 THEN '⛔ RLS SIN POLICIES - BLOQUEA TODO'
    WHEN NOT t.rowsecurity THEN '⚠️ RLS DESHABILITADO'
    ELSE '✅ OK'
  END AS status
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'wp_contactos',
    'wp_citas',
    'wp_conversaciones',
    'wp_multimedia',
    'wp_contactos_nota',
    'wp_tareas',
    'wp_tareas_items',
    'wp_crm_servicios',
    'wp_crm_pagos',
    'wp_empresa_embudo',
    'wp_team_humano',
    'wp_contacto_estado_embudo',
    'wp_mensajes',
    'transcripciones'
  )
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;

-- 4. Ver últimos errores registrados (si la tabla existe)
SELECT 
  component,
  error_message,
  created_at
FROM wp_error_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
