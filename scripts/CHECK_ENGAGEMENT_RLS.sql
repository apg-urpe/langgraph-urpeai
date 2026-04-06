-- ============================================================================
-- CHECK: Estado actual de RLS en tablas de engagement
-- Ejecutar en Supabase SQL Editor para diagnosticar
-- ============================================================================

-- 1. ¿Las tablas existen?
SELECT 
    table_name,
    CASE 
        WHEN obj_description((table_schema || '.' || table_name)::regclass) IS NOT NULL 
        THEN 'con descripción' 
        ELSE 'sin descripción' 
    END as info
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('wp_user_engagement', 'wp_user_engagement_daily')
ORDER BY table_name;

-- 2. ¿RLS está habilitado?
SELECT 
    relname as tabla,
    relrowsecurity as rls_habilitado,
    relforcerowsecurity as rls_forzado
FROM pg_class 
WHERE relname IN ('wp_user_engagement', 'wp_user_engagement_daily');

-- 3. ¿Qué políticas existen? (ESTA ES LA CLAVE)
SELECT 
    tablename as tabla,
    policyname as politica,
    roles,
    cmd as operacion,
    qual as condicion_using,
    with_check as condicion_check
FROM pg_policies 
WHERE tablename IN ('wp_user_engagement', 'wp_user_engagement_daily')
ORDER BY tablename, policyname;

-- 4. Conteo de políticas por tabla
SELECT 
    tablename as tabla,
    COUNT(*) as total_politicas
FROM pg_policies 
WHERE tablename IN ('wp_user_engagement', 'wp_user_engagement_daily')
GROUP BY tablename;
