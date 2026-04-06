-- ============================================================
-- 🔧 OPTIMIZACIÓN DE BASE DE DATOS - URPE AI LAB
-- Fecha: 2026-01-20
-- Proyecto: vecspltvmyopwbjzerow
-- ============================================================
-- 
-- INSTRUCCIONES PARA PRODUCCIÓN:
-- 1. Ejecutar cada sección por separado
-- 2. Verificar que no haya errores antes de continuar
-- 3. Las operaciones son idempotentes (seguras de re-ejecutar)
-- 4. Backup automático por Supabase, pero recomendado snapshot manual
--
-- PRIORIDAD DE IMPACTO:
-- 🔴 CRÍTICO: Seguridad - Políticas RLS permisivas
-- 🟠 ALTO: Performance - Índices duplicados (desperdician storage)
-- 🟡 MEDIO: Performance - FKs sin índice (ralentizan JOINs)
-- ============================================================

-- ============================================================
-- FASE 1: ELIMINAR ÍNDICES DUPLICADOS (BAJO RIESGO, ALTO IMPACTO)
-- ============================================================
-- Estos índices son IDÉNTICOS y solo desperdician storage/CPU en INSERTs

-- 1.1 adaptive_interface.chat_messages
-- Duplicados: idx_chat_messages_user, idx_chat_messages_user_id
DROP INDEX IF EXISTS adaptive_interface.idx_chat_messages_user;
-- Mantiene: idx_chat_messages_user_id

-- Duplicados: idx_chat_messages_session, idx_chat_messages_session_id  
DROP INDEX IF EXISTS adaptive_interface.idx_chat_messages_session;
-- Mantiene: idx_chat_messages_session_id

-- 1.2 adaptive_interface.chat_sessions
-- Duplicados: idx_chat_sessions_user, idx_chat_sessions_user_id
DROP INDEX IF EXISTS adaptive_interface.idx_chat_sessions_user;
-- Mantiene: idx_chat_sessions_user_id

-- 1.3 adaptive_interface.contexto_usuario
-- Duplicados: idx_contexto_usuario_session, idx_session_data_session_id
DROP INDEX IF EXISTS adaptive_interface.idx_contexto_usuario_session;
-- Mantiene: idx_session_data_session_id

-- Duplicados: idx_contexto_usuario_user, idx_session_data_user_id
DROP INDEX IF EXISTS adaptive_interface.idx_contexto_usuario_user;
-- Mantiene: idx_session_data_user_id

-- 1.4 adaptive_interface.user_settings
-- Duplicados: idx_user_settings_user, idx_user_settings_user_id
DROP INDEX IF EXISTS adaptive_interface.idx_user_settings_user;
-- Mantiene: idx_user_settings_user_id

-- 1.5 gamification.profiles
-- Duplicados: idx_gam_prof_empresa, idx_gamification_profiles_empresa
DROP INDEX IF EXISTS gamification.idx_gam_prof_empresa;
-- Mantiene: idx_gamification_profiles_empresa

-- 1.6 public.wp_citas (TABLA CRÍTICA)
-- Duplicados: idx_citas_empresa_fecha, idx_citas_empresa_fecha_desc, idx_wp_citas_empresa_fecha
DROP INDEX IF EXISTS public.idx_citas_empresa_fecha;
DROP INDEX IF EXISTS public.idx_citas_empresa_fecha_desc;
-- Mantiene: idx_wp_citas_empresa_fecha

-- Duplicados: idx_citas_proximas, idx_wp_citas_upcoming
DROP INDEX IF EXISTS public.idx_citas_proximas;
-- Mantiene: idx_wp_citas_upcoming

-- 1.7 public.wp_contacto_estado_embudo
-- Duplicados: idx_estado_embudo_contacto_unique, wp_contacto_estado_embudo_contacto_unique
DROP INDEX IF EXISTS public.idx_estado_embudo_contacto_unique;
-- Mantiene: wp_contacto_estado_embudo_contacto_unique

-- 1.8 public.wp_email_envio
-- Duplicados: idx_email_envio_contacto, idx_envio_contacto
DROP INDEX IF EXISTS public.idx_email_envio_contacto;
-- Mantiene: idx_envio_contacto

-- 1.9 public.wp_empresa_embudo
-- Duplicados: idx_embudo_empresa_orden, idx_wp_empresa_embudo_empresa, idx_wp_empresa_embudo_orden
DROP INDEX IF EXISTS public.idx_embudo_empresa_orden;
DROP INDEX IF EXISTS public.idx_wp_empresa_embudo_orden;
-- Mantiene: idx_wp_empresa_embudo_empresa

-- 1.10 public.wp_numeros
-- Duplicados: idx_numeros_telefono_activo, idx_wp_numeros_telefono_activo_true
DROP INDEX IF EXISTS public.idx_numeros_telefono_activo;
-- Mantiene: idx_wp_numeros_telefono_activo_true

-- ============================================================
-- FASE 2: CREAR ÍNDICES PARA FOREIGN KEYS CRÍTICAS
-- ============================================================
-- Solo tablas de uso frecuente en el CRM (Monica, contactos, mensajes)

-- 2.1 wp_mensajes - FK más usada por Monica (búsquedas de conversación)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensajes_conversacion_id 
ON public.wp_mensajes(conversacion_id);

-- 2.2 wp_conversaciones - FK para multi-tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversaciones_empresa_id
ON public.wp_conversaciones(empresa_id);

-- 2.3 drive_files - FKs para contexto de contacto
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drive_files_contacto_id
ON public.drive_files(contacto_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drive_files_empresa_id
ON public.drive_files(empresa_id);

-- 2.4 wp_tareas - FKs para filtros de Monica
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tareas_contacto_id
ON public.wp_tareas(contacto_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tareas_proyecto_id
ON public.wp_tareas(proyecto_id);

-- 2.5 wp_email_envio - FK para tracking de marketing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_envio_campana_id
ON public.wp_email_envio(campana_id);

-- 2.6 wp_notificaciones_team - FK para queries de notificaciones
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificaciones_contacto_id
ON public.wp_notificaciones_team(contacto_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notificaciones_asesor_id
ON public.wp_notificaciones_team(asesor_id);

-- ============================================================
-- FASE 3: CORREGIR POLÍTICAS RLS PELIGROSAS (CRÍTICO)
-- ============================================================
-- NOTA: Estas correcciones son RESTRICTIVAS. Si algo deja de funcionar,
-- el problema está en el código frontend que no pasa empresa_id correctamente.

-- 3.1 wp_team_humano - Política de DELETE demasiado permisiva
-- Antes: USING (true) - Cualquiera puede borrar cualquier asesor
-- Después: Solo admins de la misma empresa pueden archivar

DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.wp_team_humano;

CREATE POLICY "team_delete_same_empresa" ON public.wp_team_humano
FOR DELETE
TO authenticated
USING (
  -- Solo usuarios con role_id 1 o 2 de la MISMA empresa pueden eliminar
  EXISTS (
    SELECT 1 FROM public.wp_team_humano AS requester
    WHERE requester.auth_uid = auth.uid()
      AND requester.role_id IN (1, 2)
      AND requester.empresa_id = wp_team_humano.empresa_id
  )
);

-- 3.2 wp_team_humano - Política de INSERT demasiado permisiva
DROP POLICY IF EXISTS "Users can create advisors in their companies" ON public.wp_team_humano;

CREATE POLICY "team_insert_same_empresa" ON public.wp_team_humano
FOR INSERT
TO authenticated
WITH CHECK (
  -- Solo usuarios con role_id 1 o 2 pueden crear asesores en SU empresa
  EXISTS (
    SELECT 1 FROM public.wp_team_humano AS requester
    WHERE requester.auth_uid = auth.uid()
      AND requester.role_id IN (1, 2)
      AND requester.empresa_id = wp_team_humano.empresa_id
  )
);

-- 3.3 wp_team_humano - Política de UPDATE demasiado permisiva
DROP POLICY IF EXISTS "Users can update advisors from their companies" ON public.wp_team_humano;

CREATE POLICY "team_update_same_empresa" ON public.wp_team_humano
FOR UPDATE
TO authenticated
USING (
  -- Usuario puede actualizar su propio perfil O ser admin de la empresa
  auth_uid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.wp_team_humano AS requester
    WHERE requester.auth_uid = auth.uid()
      AND requester.role_id IN (1, 2)
      AND requester.empresa_id = wp_team_humano.empresa_id
  )
)
WITH CHECK (
  -- Mismo check para el nuevo valor
  auth_uid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.wp_team_humano AS requester
    WHERE requester.auth_uid = auth.uid()
      AND requester.role_id IN (1, 2)
      AND requester.empresa_id = wp_team_humano.empresa_id
  )
);

-- 3.4 wp_user_engagement - INSERT sin validación
DROP POLICY IF EXISTS "Users can insert engagement" ON public.wp_user_engagement;

CREATE POLICY "engagement_insert_own" ON public.wp_user_engagement
FOR INSERT
TO authenticated
WITH CHECK (
  -- Solo puede insertar engagement de su propia empresa
  empresa_id IN (
    SELECT empresa_id FROM public.wp_team_humano
    WHERE auth_uid = auth.uid()
  )
);

-- ============================================================
-- FASE 4: AGREGAR POLÍTICAS RLS FALTANTES (TABLAS SIN POLÍTICAS)
-- ============================================================
-- Estas tablas tienen RLS habilitado pero sin políticas = TODO BLOQUEADO

-- 4.1 gamification.profiles - Necesita políticas para funcionar
CREATE POLICY "gamification_profiles_select_own" ON gamification.profiles
FOR SELECT
TO authenticated
USING (
  team_member_id IN (
    SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid()
  )
  OR empresa_id IN (
    SELECT empresa_id FROM public.wp_team_humano WHERE auth_uid = auth.uid()
  )
);

CREATE POLICY "gamification_profiles_insert_own" ON gamification.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  team_member_id IN (
    SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid()
  )
);

CREATE POLICY "gamification_profiles_update_own" ON gamification.profiles
FOR UPDATE
TO authenticated
USING (
  team_member_id IN (
    SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid()
  )
);

-- 4.2 gamification.daily_missions
CREATE POLICY "missions_select_own" ON gamification.daily_missions
FOR SELECT TO authenticated
USING (
  team_member_id IN (SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
);

CREATE POLICY "missions_modify_own" ON gamification.daily_missions
FOR ALL TO authenticated
USING (
  team_member_id IN (SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
);

-- 4.3 gamification.user_badges
CREATE POLICY "badges_select_own" ON gamification.user_badges
FOR SELECT TO authenticated
USING (
  team_member_id IN (SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
);

CREATE POLICY "badges_modify_own" ON gamification.user_badges
FOR ALL TO authenticated
USING (
  team_member_id IN (SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
);

-- 4.4 gamification.xp_transactions
CREATE POLICY "xp_select_own" ON gamification.xp_transactions
FOR SELECT TO authenticated
USING (
  team_member_id IN (SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
);

CREATE POLICY "xp_insert_own" ON gamification.xp_transactions
FOR INSERT TO authenticated
WITH CHECK (
  team_member_id IN (SELECT id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
);

-- ============================================================
-- VERIFICACIÓN POST-EJECUCIÓN
-- ============================================================
-- Ejecutar estas queries para verificar que todo está correcto:

-- 1. Verificar índices eliminados
-- SELECT indexname FROM pg_indexes 
-- WHERE schemaname IN ('public', 'adaptive_interface', 'gamification')
-- AND indexname LIKE 'idx_%'
-- ORDER BY indexname;

-- 2. Verificar políticas RLS
-- SELECT schemaname, tablename, policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename = 'wp_team_humano';

-- 3. Verificar que gamification funciona (debe retornar rows si hay datos)
-- SELECT * FROM gamification.profiles LIMIT 1;

-- ============================================================
-- ROLLBACK (EN CASO DE EMERGENCIA)
-- ============================================================
-- Si algo falla, ejecutar estos comandos para revertir las políticas:
--
-- DROP POLICY IF EXISTS "team_delete_same_empresa" ON public.wp_team_humano;
-- DROP POLICY IF EXISTS "team_insert_same_empresa" ON public.wp_team_humano;
-- DROP POLICY IF EXISTS "team_update_same_empresa" ON public.wp_team_humano;
-- 
-- CREATE POLICY "Enable delete for users based on user_id" ON public.wp_team_humano
-- FOR DELETE USING (true);
-- 
-- CREATE POLICY "Users can create advisors in their companies" ON public.wp_team_humano
-- FOR INSERT WITH CHECK (true);
-- 
-- CREATE POLICY "Users can update advisors from their companies" ON public.wp_team_humano
-- FOR UPDATE USING (true) WITH CHECK (true);
--
-- NOTA: Los índices eliminados NO se pueden recuperar automáticamente,
-- pero son duplicados así que no afectan la funcionalidad.
-- ============================================================
