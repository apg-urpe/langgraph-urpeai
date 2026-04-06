-- ============================================
-- ÍNDICES CRÍTICOS PARA PERFORMANCE
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2026-01-23
-- ============================================

-- NOTA: Sin CONCURRENTLY porque Supabase SQL Editor 
-- ejecuta en transacción. Para tablas muy grandes,
-- ejecutar en horario de bajo tráfico.

-- ============================================
-- 1. wp_mensajes (500K+ filas) - MÁS CRÍTICO
-- ============================================
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion_id 
ON public.wp_mensajes(conversacion_id);

CREATE INDEX IF NOT EXISTS idx_mensajes_created_at 
ON public.wp_mensajes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensajes_remitente 
ON public.wp_mensajes(remitente);

-- Índice compuesto para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_mensajes_conv_created 
ON public.wp_mensajes(conversacion_id, created_at DESC);

-- ============================================
-- 2. wp_conversaciones (38K+ filas)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversaciones_contacto_id 
ON public.wp_conversaciones(contacto_id);

CREATE INDEX IF NOT EXISTS idx_conversaciones_empresa_id 
ON public.wp_conversaciones(empresa_id);

CREATE INDEX IF NOT EXISTS idx_conversaciones_agente_id 
ON public.wp_conversaciones(agente_id);

CREATE INDEX IF NOT EXISTS idx_conversaciones_updated_at 
ON public.wp_conversaciones(updated_at DESC);

-- Índice compuesto para dashboard/listados
CREATE INDEX IF NOT EXISTS idx_conversaciones_empresa_updated 
ON public.wp_conversaciones(empresa_id, updated_at DESC);

-- ============================================
-- 3. wp_contactos (42K filas)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_contactos_team_humano_id 
ON public.wp_contactos(team_humano_id);

CREATE INDEX IF NOT EXISTS idx_contactos_etapa_embudo 
ON public.wp_contactos(etapa_embudo);

CREATE INDEX IF NOT EXISTS idx_contactos_empresa_id 
ON public.wp_contactos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_contactos_estado 
ON public.wp_contactos(estado);

CREATE INDEX IF NOT EXISTS idx_contactos_es_calificado 
ON public.wp_contactos(es_calificado);

-- Índice compuesto para multi-tenant + filtros
CREATE INDEX IF NOT EXISTS idx_contactos_empresa_estado 
ON public.wp_contactos(empresa_id, estado);

CREATE INDEX IF NOT EXISTS idx_contactos_empresa_team 
ON public.wp_contactos(empresa_id, team_humano_id);

-- Índice para búsqueda por teléfono (lookups frecuentes)
CREATE INDEX IF NOT EXISTS idx_contactos_telefono 
ON public.wp_contactos(telefono);

-- ============================================
-- 4. wp_citas
-- ============================================
CREATE INDEX IF NOT EXISTS idx_citas_contacto_id 
ON public.wp_citas(contacto_id);

CREATE INDEX IF NOT EXISTS idx_citas_team_humano_id 
ON public.wp_citas(team_humano_id);

CREATE INDEX IF NOT EXISTS idx_citas_empresa_id 
ON public.wp_citas(empresa_id);

CREATE INDEX IF NOT EXISTS idx_citas_fecha_hora 
ON public.wp_citas(fecha_hora);

CREATE INDEX IF NOT EXISTS idx_citas_estado 
ON public.wp_citas(estado);

-- Índice compuesto para agenda
CREATE INDEX IF NOT EXISTS idx_citas_empresa_fecha 
ON public.wp_citas(empresa_id, fecha_hora);

CREATE INDEX IF NOT EXISTS idx_citas_team_fecha 
ON public.wp_citas(team_humano_id, fecha_hora);

-- ============================================
-- 5. wp_tareas
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tareas_contacto_id 
ON public.wp_tareas(contacto_id);

CREATE INDEX IF NOT EXISTS idx_tareas_proyecto_id 
ON public.wp_tareas(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_tareas_conversacion_id 
ON public.wp_tareas(conversacion_id);

CREATE INDEX IF NOT EXISTS idx_tareas_empresa_id 
ON public.wp_tareas(empresa_id);

CREATE INDEX IF NOT EXISTS idx_tareas_asignado_id 
ON public.wp_tareas(asignado_id);

CREATE INDEX IF NOT EXISTS idx_tareas_status 
ON public.wp_tareas(status);

-- Índice compuesto para listados
CREATE INDEX IF NOT EXISTS idx_tareas_empresa_status 
ON public.wp_tareas(empresa_id, status);

-- ============================================
-- 6. wp_marketing_audiencia_contacto
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audiencia_contacto_contacto_id 
ON public.wp_marketing_audiencia_contacto(contacto_id);

CREATE INDEX IF NOT EXISTS idx_audiencia_contacto_audiencia_id 
ON public.wp_marketing_audiencia_contacto(audiencia_id);

-- ============================================
-- 7. wp_notificaciones_team
-- ============================================
CREATE INDEX IF NOT EXISTS idx_notificaciones_team_asesor_id 
ON public.wp_notificaciones_team(asesor_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_team_empresa_id 
ON public.wp_notificaciones_team(empresa_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_team_visto 
ON public.wp_notificaciones_team(visto);

-- ============================================
-- 8. wp_email_envio
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_envio_contacto_id 
ON public.wp_email_envio(contacto_id);

CREATE INDEX IF NOT EXISTS idx_email_envio_campana_id 
ON public.wp_email_envio(campana_id);

CREATE INDEX IF NOT EXISTS idx_email_envio_empresa_id 
ON public.wp_email_envio(empresa_id);

-- ============================================
-- 9. artifacts
-- ============================================
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id 
ON public.artifacts(user_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_forked_from 
ON public.artifacts(forked_from);

CREATE INDEX IF NOT EXISTS idx_artifacts_message_id 
ON public.artifacts(message_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_is_public 
ON public.artifacts(is_public);

-- ============================================
-- 10. artifact_stars
-- ============================================
CREATE INDEX IF NOT EXISTS idx_artifact_stars_artifact_id 
ON public.artifact_stars(artifact_id);

CREATE INDEX IF NOT EXISTS idx_artifact_stars_user_id 
ON public.artifact_stars(user_id);

-- ============================================
-- 11. wp_multimedia
-- ============================================
CREATE INDEX IF NOT EXISTS idx_multimedia_contacto_id 
ON public.wp_multimedia(contacto_id);

CREATE INDEX IF NOT EXISTS idx_multimedia_conversacion_id 
ON public.wp_multimedia(conversacion_id);

-- ============================================
-- 12. wp_proyectos
-- ============================================
CREATE INDEX IF NOT EXISTS idx_proyectos_empresa_id 
ON public.wp_proyectos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_proyectos_contacto_id 
ON public.wp_proyectos(contacto_id);

-- ============================================
-- 13. evaluaciones
-- ============================================
CREATE INDEX IF NOT EXISTS idx_evaluaciones_empresa_id 
ON public.evaluaciones(empresa_id);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_agente_id 
ON public.evaluaciones(agente_id);

-- ============================================
-- 14. metricas
-- ============================================
CREATE INDEX IF NOT EXISTS idx_metricas_empresa_id 
ON public.metricas(empresa_id);

-- ============================================
-- LIMPIEZA: Eliminar índice duplicado
-- ============================================
DROP INDEX IF EXISTS public.test_respuestas_agente_evaluador_id_key;

-- ============================================
-- VERIFICACIÓN: Ver índices creados
-- ============================================
-- SELECT 
--     schemaname,
--     tablename,
--     indexname
-- FROM pg_indexes 
-- WHERE schemaname = 'public'
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
