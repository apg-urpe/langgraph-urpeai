# Contexto minimalista de la base de datos

## Visión general

La base de datos combina un CRM multi-tenant, operaciones internas, automatización con IA, marketing, agenda, entrenamiento, proyectos y módulos clínicos.

La entidad raíz más importante es `wp_empresa_perfil`. Casi todos los dominios cuelgan de `empresa_id` o `enterprise_id` para aislamiento por empresa.

## Núcleo del modelo

### 1. Empresa
- `wp_empresa_perfil`
- `wp_empresa_embudo`
- `wp_empresa_historial`
- `wp_empresa_ads_config`

La empresa define configuración comercial, branding, embudo, reglas y contexto operativo.

### 2. Equipo y permisos
- `wp_team_humano`
- `team_groups`
- `system_roles`
- `system_modules`
- `system_actions`
- `system_permissions`
- `system_users`
- `team_invitations`
- `wp_team_invitations`

Aquí viven los usuarios internos, sus grupos, permisos y procesos de invitación.

### 3. CRM
- `wp_contactos`
- `wp_contacto_estado_embudo`
- `wp_contacto_team_asignaciones`
- `wp_contactos_nota`
- `wp_contactos_auditoria`
- `wp_contactos_merge_log`
- `wp_conversaciones`
- `wp_mensajes`
- `wp_recordatorios`
- `wp_notificaciones`
- `wp_notificaciones_team`

Este es el corazón operacional del producto: contactos, seguimiento, conversaciones y coordinación del equipo.

### 4. Agenda y reuniones
- `wp_citas`
- `transcripciones`

Gestiona citas, sincronización calendaria y resultados de reuniones.

### 5. Agentes e IA
- `wp_agentes`
- `wp_agente_roles`
- `wp_agente_tools`
- `wp_mcp_tools_catalog`
- `agent_memory`
- `agent_memory_interno`
- `monica_memories`
- `monica_user_profile`
- `wp_deep_research`
- `artifacts`
- `artifact_versions`
- `artifact_stars`

Este bloque soporta agentes configurables, memoria, herramientas, investigación y artefactos generados.

### 6. Marketing y email
- `wp_marketing_audiencias`
- `wp_marketing_audiencia_contacto`
- `wp_email_campanas`
- `wp_email_contacto_campana`
- `wp_email_envio`
- `wp_email_recibido`
- `shortened_links`

Modela audiencias, campañas, inscripciones, envíos y recepción de correos.

### 7. Finanzas, planes y facturación
- `wp_finanzas`
- `wp_crm_servicios`
- `wp_crm_pagos`
- `wp_facturas`
- `wp_planes_suscripcion`
- `wp_planes_caracteristicas`
- `wp_plan_consumo`
- `wp_suscripciones`
- `wp_suscripcion_historial`
- `wp_metodos_pago`

Este dominio cubre monetización, servicios, pagos, facturación y planes.

### 8. Proyectos y tareas
- `wp_proyectos`
- `wp_proyectos_costos`
- `wp_tareas`
- `wp_tareas_asignados`
- `wp_tareas_items`
- `wp_tareas_comentarios`
- `wp_tareas_reacciones`
- `wp_tareas_historial`
- `wp_tareas_media`
- `wp_tareas_etiquetas`
- `wp_etiquetas_equipo`

Es el módulo de ejecución interna para trabajo colaborativo.

### 9. Entrenamiento y gamificación
- `training_courses`
- `training_lessons`
- `training_questions`
- `training_user_progress`
- `training_streaks`
- `minijuegos_organizaciones`
- `minijuegos_jugadores`

Se usa para formación del equipo y dinámicas de engagement.

### 10. Clínica y consentimientos
- `pacientes`
- `diagnostico`
- `aceptacion`
- `usuarios_consentimientos`
- `reporte_preliminar`

Este bloque parece responder a un vertical clínico/salud dentro del producto.

### 11. Redacción y documentación
- `redaccion_tipos`
- `redaccion`
- `redaccion_detalles`
- `redaccion_detalle_historial`
- `wp_documentacion`
- `drive_files`
- `wp_multimedia`

Agrupa contenido estructurado, soporte documental y activos externos.

### 12. Observabilidad y analítica
- `wp_actividades_log`
- `wp_auditoria`
- `auditoria_historial`
- `wp_error_logs`
- `metricas`
- `evaluaciones`
- `wp_module_usage_daily`
- `wp_user_engagement`
- `wp_user_engagement_daily`
- `wp_system_alerts`

Aquí vive la trazabilidad del sistema, el uso del producto y el monitoreo.

### 13. Pruebas y datasets auxiliares
- `sintetico_perfiles`
- `sintetico_escenarios`
- `sintetico_ejecuciones`
- `test_escritura`
- `test_respuestas_agente_evaluador`
- `temp_contactos_sin_citas`
- `n8n_chat_histories`
- `dau_tracked_users`
- `dau_user_tweets`
- `wp_follow_up`
- `aplicaciones_cliente`
- `aplicaciones_dispositivos`
- `system_users`

Son tablas de soporte, pruebas, integraciones o casos especializados.

## Relaciones clave

```text
wp_empresa_perfil
 ├─ wp_team_humano
 │   ├─ wp_contactos
 │   │   ├─ wp_conversaciones
 │   │   │   └─ wp_mensajes
 │   │   ├─ wp_citas
 │   │   │   └─ transcripciones
 │   │   ├─ wp_contactos_nota
 │   │   ├─ wp_recordatorios
 │   │   ├─ wp_crm_servicios
 │   │   │   ├─ wp_crm_pagos
 │   │   │   └─ wp_facturas
 │   │   └─ wp_email_contacto_campana
 │   │       └─ wp_email_envio
 │   ├─ wp_tareas
 │   └─ training_user_progress
 ├─ wp_agentes
 ├─ wp_marketing_audiencias
 ├─ wp_email_campanas
 ├─ wp_proyectos
 ├─ wp_finanzas
 └─ system_roles
```

## Invariantes conceptuales

- `wp_empresa_perfil` es la raíz tenant principal.
- `wp_contactos` es la entidad central del negocio diario.
- `wp_team_humano` conecta operación, agenda, entrenamiento, tareas y permisos.
- `wp_agentes` y sus tablas relacionadas encapsulan la capa IA.
- `wp_marketing_*` y `wp_email_*` forman un subdominio separado pero conectado al CRM.
- `wp_crm_servicios`, `wp_crm_pagos`, `wp_facturas` y `wp_finanzas` representan el ciclo económico.

## Uso recomendado de lectura mental

Si necesitas entender el sistema rápido, lee en este orden:

1. `wp_empresa_perfil`
2. `wp_team_humano`
3. `wp_contactos`
4. `wp_conversaciones` y `wp_mensajes`
5. `wp_citas`
6. `wp_agentes`
7. `wp_marketing_audiencias`, `wp_email_campanas`, `wp_email_envio`
8. `wp_tareas` y `wp_proyectos`
9. `wp_crm_servicios`, `wp_crm_pagos`, `wp_facturas`, `wp_finanzas`

## Artefactos generados en este repo

- `scripts/DB_TABLE_COMMENTS.sql`: comentarios `COMMENT ON TABLE` para documentar el esquema.
- `docs/architecture/database-context-minimal.md`: mapa rápido y minimalista del modelo.
