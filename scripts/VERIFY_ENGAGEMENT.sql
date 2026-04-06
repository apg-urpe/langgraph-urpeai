-- Verificar si las tablas de engagement existen
SELECT 
    table_name,
    row_level_security 
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name LIKE 'wp_user_engagement%'
ORDER BY table_name;

-- Verificar políticas RLS
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename LIKE 'wp_user_engagement%'
ORDER BY tablename, policyname;
