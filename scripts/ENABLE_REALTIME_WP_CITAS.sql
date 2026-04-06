-- =====================================================
-- FIX: Habilitar Supabase Realtime para wp_citas
-- PROBLEMA: Los cambios de citas no se sincronizan entre usuarios
-- CAUSA: La tabla wp_citas probablemente no está en la publicación de Realtime
-- =====================================================

-- 1. Verificar si la tabla está en la publicación de Realtime
SELECT 
  schemaname,
  tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
  AND tablename = 'wp_citas';

-- 2. Si no aparece en los resultados, ejecutar este comando:
-- IMPORTANTE: Ejecutar solo si el SELECT anterior retorna 0 filas
ALTER PUBLICATION supabase_realtime ADD TABLE wp_citas;

-- 3. Verificar que se agregó correctamente
SELECT 
  schemaname,
  tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- =====================================================
-- VERIFICACIÓN DE RLS Y POLÍTICAS
-- =====================================================

-- 4. Verificar que RLS está habilitado
SELECT 
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'wp_citas';

-- 5. Ver todas las políticas de wp_citas
SELECT 
  policyname, 
  cmd, 
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'wp_citas'
ORDER BY cmd;

-- =====================================================
-- NOTA: Si después de esto sigue sin funcionar, 
-- verificar que la política SELECT permita a todos
-- los usuarios de la empresa ver las citas
-- =====================================================
