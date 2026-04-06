-- =====================================================
-- MIGRACIÓN: Renombrar esquema adaptive_interface a "adaptive_interface"
-- =====================================================
-- IMPORTANTE: Ejecutar este script ANTES de desplegar el código actualizado
-- 
-- RAZÓN: Los espacios en nombres de esquemas causan problemas con:
-- - Supabase Realtime (suscripciones pueden fallar)
-- - Filtros de postgres_changes
-- - Integraciones externas (n8n, webhooks)
-- - SQL manual sin comillas dobles
--
-- PREREQUISITOS:
-- 1. Hacer backup de la base de datos
-- 2. Verificar que no hay transacciones activas en el esquema
-- 3. Notificar a usuarios que habrá un breve downtime
-- =====================================================

-- Paso 1: Renombrar el esquema
ALTER SCHEMA adaptive_interface RENAME TO adaptive_interface;

-- Paso 2: Verificar que el esquema se renombró correctamente
-- (Ejecutar esta query para confirmar)
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'adaptive_interface';

-- Paso 3: Actualizar permisos si es necesario (generalmente se mantienen)
-- Los permisos existentes deberían persistir automáticamente

-- =====================================================
-- ROLLBACK (en caso de emergencia)
-- =====================================================
-- Si algo sale mal, ejecutar:
-- ALTER SCHEMA adaptive_interface RENAME TO adaptive_interface;
-- =====================================================

-- =====================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- =====================================================
-- Ejecutar estas queries para verificar que todo funciona:

-- 1. Verificar tablas en el nuevo esquema
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'adaptive_interface';

-- 2. Verificar que las políticas RLS siguen activas
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'adaptive_interface';

-- 3. Test rápido de lectura
-- SELECT COUNT(*) FROM adaptive_interface.chat_sessions LIMIT 1;
-- SELECT COUNT(*) FROM adaptive_interface.user_profiles LIMIT 1;
