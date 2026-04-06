-- ============================================================================
-- DELETE_EMPRESA_COMPLETO.sql
-- Script para eliminar una empresa y TODOS sus datos relacionados
-- Fecha: 30 Diciembre 2024
-- ============================================================================
-- IMPORTANTE: Este script elimina datos de forma PERMANENTE e IRREVERSIBLE
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- CONSTANTE: Cambiar este valor para borrar otra empresa
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    TARGET_EMPRESA_ID CONSTANT bigint := 39;  -- ← CAMBIAR AQUÍ EL ID DE EMPRESA
    
    -- Contadores para reporte
    v_count bigint;
    v_total bigint := 0;
BEGIN
    RAISE NOTICE '══════════════════════════════════════════════════════════════════';
    RAISE NOTICE 'INICIANDO ELIMINACIÓN DE EMPRESA ID: %', TARGET_EMPRESA_ID;
    RAISE NOTICE '══════════════════════════════════════════════════════════════════';

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 0: Verificar que la empresa existe
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_count FROM wp_empresa_perfil WHERE id = TARGET_EMPRESA_ID;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'ERROR: La empresa con ID % no existe', TARGET_EMPRESA_ID;
    END IF;
    RAISE NOTICE '✓ Empresa verificada: ID %', TARGET_EMPRESA_ID;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 1: TABLAS DE TAREAS (dependencias más profundas primero)
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 1: Eliminando datos de TAREAS ──';
    
    -- wp_tareas_reacciones (vía comentarios → tareas → empresa)
    DELETE FROM wp_tareas_reacciones 
    WHERE comentario_id IN (
        SELECT tc.id FROM wp_tareas_comentarios tc
        JOIN wp_tareas t ON tc.tarea_id = t.id
        WHERE t.empresa_id = TARGET_EMPRESA_ID
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_reacciones: % registros', v_count;

    -- wp_tareas_comentarios
    DELETE FROM wp_tareas_comentarios 
    WHERE tarea_id IN (SELECT id FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_comentarios: % registros', v_count;

    -- wp_tareas_items
    DELETE FROM wp_tareas_items 
    WHERE tarea_id IN (SELECT id FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_items: % registros', v_count;

    -- wp_tareas_historial
    DELETE FROM wp_tareas_historial 
    WHERE tarea_id IN (SELECT id FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_historial: % registros', v_count;

    -- wp_tareas_media
    DELETE FROM wp_tareas_media 
    WHERE tarea_id IN (SELECT id FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_media: % registros', v_count;

    -- wp_tareas_etiquetas
    DELETE FROM wp_tareas_etiquetas 
    WHERE tarea_id IN (SELECT id FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_etiquetas: % registros', v_count;

    -- wp_tareas_asignados
    DELETE FROM wp_tareas_asignados 
    WHERE tarea_id IN (SELECT id FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas_asignados: % registros', v_count;

    -- wp_proyectos_costos (depende de tareas y proyectos)
    DELETE FROM wp_proyectos_costos 
    WHERE proyecto_id IN (SELECT id FROM wp_proyectos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_proyectos_costos: % registros', v_count;

    -- wp_tareas (ahora sin dependientes)
    DELETE FROM wp_tareas WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_tareas: % registros', v_count;

    -- wp_proyectos
    DELETE FROM wp_proyectos WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_proyectos: % registros', v_count;

    -- wp_etiquetas_equipo
    DELETE FROM wp_etiquetas_equipo WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_etiquetas_equipo: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 2: TABLAS DE CITAS Y TRANSCRIPCIONES
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 2: Eliminando CITAS y TRANSCRIPCIONES ──';

    -- transcripciones (depende de wp_citas)
    DELETE FROM transcripciones 
    WHERE cita_id IN (SELECT id FROM wp_citas WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  transcripciones: % registros', v_count;

    -- wp_citas
    DELETE FROM wp_citas WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_citas: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 3: MENSAJES Y CONVERSACIONES
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 3: Eliminando MENSAJES y CONVERSACIONES ──';

    -- wp_recordatorios (depende de conversaciones y contactos)
    DELETE FROM wp_recordatorios 
    WHERE conversacion_id IN (SELECT id FROM wp_conversaciones WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_recordatorios: % registros', v_count;

    -- wp_mensajes
    DELETE FROM wp_mensajes 
    WHERE conversacion_id IN (SELECT id FROM wp_conversaciones WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_mensajes: % registros', v_count;

    -- También borrar mensajes con empresa_id directo
    DELETE FROM wp_mensajes WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_mensajes (directo): % registros', v_count;

    -- wp_conversaciones
    DELETE FROM wp_conversaciones WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_conversaciones: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 4: EMAIL MARKETING
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 4: Eliminando EMAIL MARKETING ──';

    -- wp_email_envio (NO tiene empresa_id, usa contacto_id)
    DELETE FROM wp_email_envio 
    WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_email_envio: % registros', v_count;

    -- wp_email_recibido
    DELETE FROM wp_email_recibido WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_email_recibido: % registros', v_count;

    -- wp_email_contacto_campana
    DELETE FROM wp_email_contacto_campana WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_email_contacto_campana: % registros', v_count;

    -- wp_email_campanas
    DELETE FROM wp_email_campanas WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_email_campanas: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 5: CRM Y FINANZAS
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 5: Eliminando CRM y FINANZAS ──';

    -- wp_crm_pagos
    DELETE FROM wp_crm_pagos WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_crm_pagos: % registros', v_count;

    -- wp_crm_servicios
    DELETE FROM wp_crm_servicios WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_crm_servicios: % registros', v_count;

    -- wp_finanzas
    DELETE FROM wp_finanzas WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_finanzas: % registros', v_count;

    -- wp_suscripcion_historial (vía suscripciones)
    DELETE FROM wp_suscripcion_historial 
    WHERE suscripcion_id IN (SELECT id FROM wp_suscripciones WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_suscripcion_historial: % registros', v_count;

    -- wp_suscripciones
    DELETE FROM wp_suscripciones WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_suscripciones: % registros', v_count;

    -- wp_plan_consumo
    DELETE FROM wp_plan_consumo WHERE id_empresa = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_plan_consumo: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 6: NOTIFICACIONES Y ACTIVIDADES
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 6: Eliminando NOTIFICACIONES y ACTIVIDADES ──';

    -- wp_notificaciones_team
    DELETE FROM wp_notificaciones_team WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_notificaciones_team: % registros', v_count;

    -- wp_notificaciones (vía contacto_id)
    DELETE FROM wp_notificaciones 
    WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_notificaciones: % registros', v_count;

    -- wp_actividades_log
    DELETE FROM wp_actividades_log WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_actividades_log: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 7: CONTACTOS Y DEPENDENCIAS
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 7: Eliminando CONTACTOS y dependencias ──';

    -- wp_contactos_nota
    DELETE FROM wp_contactos_nota 
    WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_contactos_nota: % registros', v_count;

    -- wp_contactos_auditoria
    DELETE FROM wp_contactos_auditoria WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_contactos_auditoria: % registros', v_count;

    -- wp_contacto_estado_embudo
    DELETE FROM wp_contacto_estado_embudo WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_contacto_estado_embudo: % registros', v_count;

    -- wp_evaluacion_preliminar (vía contacto_id)
    DELETE FROM wp_evaluacion_preliminar 
    WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_evaluacion_preliminar: % registros', v_count;

    -- wp_multimedia
    DELETE FROM wp_multimedia 
    WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_multimedia (por contacto): % registros', v_count;

    DELETE FROM wp_multimedia WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_multimedia (directo): % registros', v_count;

    -- drive_files
    DELETE FROM drive_files WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  drive_files: % registros', v_count;

    -- redaccion_detalles (vía redaccion → contacto)
    DELETE FROM redaccion_detalles 
    WHERE redaccion_id IN (
        SELECT r.id FROM redaccion r
        JOIN wp_contactos c ON r.contacto_id = c.id
        WHERE c.empresa_id = TARGET_EMPRESA_ID
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  redaccion_detalles: % registros', v_count;

    -- redaccion (vía contacto_id)
    DELETE FROM redaccion 
    WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  redaccion: % registros', v_count;

    -- test_respuestas_agente_evaluador (vía id_conversacion que es contacto_id)
    DELETE FROM test_respuestas_agente_evaluador 
    WHERE id_conversacion IN (SELECT id FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  test_respuestas_agente_evaluador: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 8: TEAM HUMANO Y SISTEMA
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 8: Eliminando TEAM HUMANO y SISTEMA ──';

    -- team_invitations (vía team_humano)
    DELETE FROM team_invitations 
    WHERE team_humano_id IN (SELECT id FROM wp_team_humano WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  team_invitations: % registros', v_count;

    -- system_users (vía team_humano o enterprise_id)
    DELETE FROM system_users WHERE enterprise_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  system_users (enterprise_id): % registros', v_count;

    DELETE FROM system_users WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  system_users (empresa_id): % registros', v_count;

    -- Limpiar referencias de wp_contactos a team_humano antes de borrar team_humano
    UPDATE wp_contactos SET team_humano_id = NULL WHERE empresa_id = TARGET_EMPRESA_ID;

    -- Limpiar referencias de enterprise_id en wp_team_humano que no pertenecen a la empresa
    -- (Usuarios de otras empresas observando esta empresa)
    UPDATE wp_team_humano SET enterprise_id = NULL WHERE enterprise_id = TARGET_EMPRESA_ID AND empresa_id != TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  wp_team_humano (enterprise_id nullified): % registros', v_count;

    -- Limpiar referencias de wp_team_humano a contactos (id_contacto)
    UPDATE wp_team_humano SET id_contacto = NULL WHERE empresa_id = TARGET_EMPRESA_ID;

    -- wp_team_humano
    DELETE FROM wp_team_humano WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_team_humano: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 9: AGENTES Y NÚMEROS (orden crítico: numeros ANTES que agentes)
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 9: Eliminando AGENTES y NÚMEROS ──';

    -- sintetico_ejecuciones (vía escenarios)
    DELETE FROM sintetico_ejecuciones 
    WHERE escenario_id IN (SELECT id FROM sintetico_escenarios WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  sintetico_ejecuciones: % registros', v_count;

    -- sintetico_escenarios
    DELETE FROM sintetico_escenarios WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  sintetico_escenarios: % registros', v_count;

    -- wp_numeros_horarios (vía numero_id o empresa_id)
    DELETE FROM wp_numeros_horarios WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_numeros_horarios: % registros', v_count;

    -- wp_numeros (ANTES de wp_agentes porque tiene FK a agentes)
    DELETE FROM wp_numeros WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_numeros: % registros', v_count;

    -- wp_agente_tools (vía agente_id)
    DELETE FROM wp_agente_tools 
    WHERE agente_id IN (SELECT id FROM wp_agentes WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_agente_tools: % registros', v_count;

    -- evaluaciones (vía agente_id o empresa_id)
    DELETE FROM evaluaciones WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  evaluaciones: % registros', v_count;

    -- wp_agentes
    DELETE FROM wp_agentes WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_agentes: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 10: CONTACTOS (ahora sin dependencias)
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 10: Eliminando CONTACTOS ──';

    -- Limpiar etapa_embudo FK antes de borrar embudo
    UPDATE wp_contactos SET etapa_embudo = NULL WHERE empresa_id = TARGET_EMPRESA_ID;

    -- wp_contactos
    DELETE FROM wp_contactos WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_contactos: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 11: EMBUDO Y CONFIGURACIONES DE EMPRESA
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 11: Eliminando EMBUDO y CONFIGURACIONES ──';

    -- wp_empresa_embudo
    DELETE FROM wp_empresa_embudo WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_empresa_embudo: % registros', v_count;

    -- metricas
    DELETE FROM metricas WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  metricas: % registros', v_count;

    -- wp_mcp_tools_catalog
    DELETE FROM wp_mcp_tools_catalog WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_mcp_tools_catalog: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE 12: OTRAS TABLAS CON empresa_id
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE 12: Eliminando OTRAS TABLAS ──';

    -- aplicaciones_dispositivos (vía aplicaciones_cliente)
    DELETE FROM aplicaciones_dispositivos 
    WHERE id_aplicacion IN (SELECT id FROM aplicaciones_cliente WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  aplicaciones_dispositivos: % registros', v_count;

    -- aplicaciones_cliente
    DELETE FROM aplicaciones_cliente WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  aplicaciones_cliente: % registros', v_count;

    -- aceptacion y diagnostico (vía pacientes)
    DELETE FROM aceptacion 
    WHERE id_paciente IN (SELECT id FROM pacientes WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  aceptacion: % registros', v_count;

    DELETE FROM diagnostico 
    WHERE id_paciente IN (SELECT id FROM pacientes WHERE empresa_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  diagnostico: % registros', v_count;

    -- pacientes
    DELETE FROM pacientes WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  pacientes: % registros', v_count;

    -- usuarios_consentimientos
    DELETE FROM usuarios_consentimientos WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  usuarios_consentimientos: % registros', v_count;

    -- system_permissions (vía system_roles de la empresa)
    DELETE FROM system_permissions 
    WHERE role_id IN (SELECT id FROM system_roles WHERE enterprise_id = TARGET_EMPRESA_ID);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  system_permissions: % registros', v_count;

    -- system_roles
    DELETE FROM system_roles WHERE enterprise_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  system_roles: % registros', v_count;

    -- wp_deep_research
    DELETE FROM wp_deep_research WHERE empresa_id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_deep_research: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- FASE FINAL: ELIMINAR LA EMPRESA
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '── FASE FINAL: Eliminando EMPRESA ──';

    DELETE FROM wp_empresa_perfil WHERE id = TARGET_EMPRESA_ID;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE '  wp_empresa_perfil: % registros', v_count;

    -- ══════════════════════════════════════════════════════════════════════════
    -- RESUMEN
    -- ══════════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ ELIMINACIÓN COMPLETADA';
    RAISE NOTICE '   Empresa ID: %', TARGET_EMPRESA_ID;
    RAISE NOTICE '   Total registros eliminados: %', v_total;
    RAISE NOTICE '══════════════════════════════════════════════════════════════════';

END $$;
