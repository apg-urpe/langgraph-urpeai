-- ============================================================
-- 🔧 OPTIMIZACIÓN DE BASE DE DATOS - FASE 2
-- Fecha: 2026-01-20
-- Proyecto: vecspltvmyopwbjzerow
-- ============================================================
-- 
-- Esta fase aborda:
-- 1. Índices duplicados restantes
-- 2. Consolidación de políticas RLS duplicadas
-- 3. Corrección de search_path en funciones críticas
--
-- NOTA: Las funciones con search_path mutable son un riesgo de 
-- seguridad menor en nuestro contexto pero afectan performance.
-- ============================================================

-- ============================================================
-- FASE 2.1: ÍNDICES DUPLICADOS RESTANTES
-- ============================================================

-- activity_logs - 3 pares duplicados
DROP INDEX IF EXISTS adaptive_interface.idx_activity_logs_user;
DROP INDEX IF EXISTS adaptive_interface.idx_activity_logs_session;
DROP INDEX IF EXISTS adaptive_interface.idx_activity_logs_created;
-- Mantiene: idx_activity_logs_user_id, idx_activity_logs_session_id, idx_activity_logs_created_at

-- chat_messages - 1 par duplicado adicional
DROP INDEX IF EXISTS adaptive_interface.idx_chat_messages_created;
-- Mantiene: idx_chat_messages_created_at

-- wp_notificaciones_team - índice duplicado creado en Fase 1
-- (Ya teníamos idx_wp_notificaciones_contacto_id, creamos otro)
DROP INDEX IF EXISTS public.idx_notificaciones_contacto_id;
-- Mantiene: idx_wp_notificaciones_contacto_id

-- ============================================================
-- FASE 2.2: CONSOLIDAR POLÍTICAS RLS DUPLICADAS
-- ============================================================
-- Múltiples políticas permisivas para el mismo rol/acción 
-- causan overhead de evaluación.

-- 2.2.1 wp_user_engagement - Tiene políticas duplicadas para INSERT
DROP POLICY IF EXISTS "Users can insert own engagement" ON public.wp_user_engagement;
DROP POLICY IF EXISTS "engagement_insert" ON public.wp_user_engagement;
-- Mantiene: engagement_insert_own (la más restrictiva que creamos)

-- 2.2.2 wp_user_engagement - Políticas duplicadas para SELECT
DROP POLICY IF EXISTS "engagement_select" ON public.wp_user_engagement;
-- Mantiene: "Users can view own engagement"

-- 2.2.3 wp_user_engagement_daily - Políticas duplicadas para SELECT
DROP POLICY IF EXISTS "daily_select" ON public.wp_user_engagement_daily;
-- Mantiene: "Users can view own daily summary"

-- 2.2.4 wp_team_humano - Limpiar políticas antiguas que quedaron
DROP POLICY IF EXISTS "team_humano_empresa_policy" ON public.wp_team_humano;
-- Las nuevas políticas team_*_same_empresa son más específicas

-- ============================================================
-- FASE 2.3: CORREGIR SEARCH_PATH EN FUNCIONES CRÍTICAS
-- ============================================================
-- Las funciones con SECURITY DEFINER necesitan search_path fijo
-- para evitar ataques de inyección de schema.
--
-- IMPORTANTE: Solo corregimos las funciones que USAMOS activamente.
-- Las demás son de Supabase/extensiones y no debemos modificarlas.

-- 2.3.1 Funciones de adaptive_interface (timestamps)
ALTER FUNCTION adaptive_interface.update_user_profiles_timestamp() 
  SET search_path = adaptive_interface, public;

ALTER FUNCTION adaptive_interface.update_user_settings_timestamp() 
  SET search_path = adaptive_interface, public;

ALTER FUNCTION adaptive_interface.update_chat_sessions_timestamp() 
  SET search_path = adaptive_interface, public;

ALTER FUNCTION adaptive_interface.update_contexto_usuario_timestamp() 
  SET search_path = adaptive_interface, public;

-- 2.3.2 Funciones públicas relacionadas con usuarios/contactos
ALTER FUNCTION public.relacionar_usuarios_contactos() 
  SET search_path = public;

ALTER FUNCTION public.trigger_relacionar_usuario_contacto() 
  SET search_path = public;

-- 2.3.3 Funciones de gamification
ALTER FUNCTION gamification.award_xp(bigint, varchar, integer, text, varchar, bigint) 
  SET search_path = gamification, public;

ALTER FUNCTION gamification.update_streak(bigint) 
  SET search_path = gamification, public;

ALTER FUNCTION gamification.generate_daily_missions(bigint) 
  SET search_path = gamification, public;

-- ============================================================
-- VERIFICACIÓN POST-EJECUCIÓN
-- ============================================================

-- 1. Verificar que las funciones tienen search_path fijo:
-- SELECT proname, prosecdef, proconfig 
-- FROM pg_proc 
-- WHERE pronamespace = 'gamification'::regnamespace;

-- 2. Verificar políticas consolidadas:
-- SELECT tablename, policyname FROM pg_policies 
-- WHERE tablename = 'wp_user_engagement' ORDER BY policyname;

-- 3. Contar issues restantes (debería bajar ~50-100):
-- Ejecutar el linter desde el dashboard de Supabase

-- ============================================================
-- NOTAS SOBRE ISSUES QUE NO CORREGIMOS
-- ============================================================
-- 
-- 1. FKs sin índice en tablas poco usadas (pacientes, diagnostico, etc.)
--    → Son tablas legacy o de otros proyectos, no impactan el CRM
--
-- 2. Funciones de extensiones (pgroonga, pg_graphql, etc.)
--    → No debemos modificarlas, son mantenidas por Supabase
--
-- 3. Funciones de auth/storage/realtime
--    → Son del sistema, no las tocamos
--
-- 4. extension_column_type_mismatch (vector/halfvec)
--    → Es un warning informativo sobre pgvector, no afecta nada
-- ============================================================
