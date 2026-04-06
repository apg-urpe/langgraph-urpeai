-- ============================================================================
-- MERGE CONTACTS SYSTEM v1
-- Tabla de auditoría + Función atómica para unificar contactos duplicados
-- Solo roles 1-2 pueden ejecutar merges (validado en API)
-- ============================================================================

-- 1. Tabla de auditoría de merges
CREATE TABLE IF NOT EXISTS public.wp_contactos_merge_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES wp_empresa_perfil(id),
  primary_contact_id bigint NOT NULL,
  secondary_contact_id bigint NOT NULL,
  secondary_snapshot jsonb NOT NULL,
  field_choices jsonb NOT NULL DEFAULT '{}',
  tables_updated jsonb NOT NULL DEFAULT '{}',
  merged_by bigint REFERENCES wp_team_humano(id),
  merged_at timestamptz NOT NULL DEFAULT now()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_merge_log_empresa
  ON wp_contactos_merge_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_merge_log_primary
  ON wp_contactos_merge_log(primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_merge_log_secondary
  ON wp_contactos_merge_log(secondary_contact_id);

-- ============================================================================
-- 2. Función merge_contacts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_primary_id bigint,
  p_secondary_id bigint,
  p_field_choices jsonb DEFAULT '{}',
  p_merged_by bigint DEFAULT NULL,
  p_empresa_id bigint DEFAULT NULL,
  p_notes_strategy text DEFAULT 'both'  -- 'both' | 'primary_only' | 'secondary_only'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_primary   record;
  v_secondary record;
  v_snapshot  jsonb;
  v_result    jsonb := '{}';
  v_rows      int;
  v_log_id    bigint;
  v_tables    jsonb := '{}';
  v_field     text;
  v_source    text;
  v_update_sql text;
BEGIN
  -- ========================================================================
  -- VALIDATION
  -- ========================================================================
  IF p_primary_id = p_secondary_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede unificar un contacto consigo mismo');
  END IF;

  SELECT * INTO v_primary FROM wp_contactos WHERE id = p_primary_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contacto primario no encontrado (ID: ' || p_primary_id || ')');
  END IF;

  SELECT * INTO v_secondary FROM wp_contactos WHERE id = p_secondary_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contacto secundario no encontrado (ID: ' || p_secondary_id || ')');
  END IF;

  -- Validate same enterprise
  IF v_primary.empresa_id IS DISTINCT FROM v_secondary.empresa_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los contactos pertenecen a empresas diferentes');
  END IF;

  -- If empresa_id provided, verify it matches
  IF p_empresa_id IS NOT NULL AND v_primary.empresa_id IS DISTINCT FROM p_empresa_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los contactos no pertenecen a la empresa indicada');
  END IF;

  -- ========================================================================
  -- SNAPSHOT del contacto secundario (antes de cualquier cambio)
  -- ========================================================================
  SELECT to_jsonb(c) INTO v_snapshot FROM wp_contactos c WHERE c.id = p_secondary_id;

  -- ========================================================================
  -- APPLY FIELD CHOICES al contacto primario
  -- Formato: {"campo": "secondary"} → toma el valor del secundario
  -- Solo los campos marcados como "secondary" se copian
  -- ========================================================================
  FOR v_field, v_source IN SELECT key, value #>> '{}' FROM jsonb_each(p_field_choices)
  LOOP
    IF v_source = 'secondary' THEN
      CASE v_field
        WHEN 'nombre' THEN
          UPDATE wp_contactos SET nombre = v_secondary.nombre WHERE id = p_primary_id;
        WHEN 'apellido' THEN
          UPDATE wp_contactos SET apellido = v_secondary.apellido WHERE id = p_primary_id;
        WHEN 'telefono' THEN
          UPDATE wp_contactos SET telefono = v_secondary.telefono WHERE id = p_primary_id;
        WHEN 'email' THEN
          UPDATE wp_contactos SET email = v_secondary.email WHERE id = p_primary_id;
        WHEN 'estado' THEN
          UPDATE wp_contactos SET estado = v_secondary.estado WHERE id = p_primary_id;
        WHEN 'es_calificado' THEN
          UPDATE wp_contactos SET es_calificado = v_secondary.es_calificado WHERE id = p_primary_id;
        WHEN 'origen' THEN
          UPDATE wp_contactos SET origen = v_secondary.origen WHERE id = p_primary_id;
        WHEN 'etapa_embudo' THEN
          UPDATE wp_contactos SET etapa_embudo = v_secondary.etapa_embudo WHERE id = p_primary_id;
        WHEN 'team_humano_id' THEN
          UPDATE wp_contactos SET team_humano_id = v_secondary.team_humano_id WHERE id = p_primary_id;
        WHEN 'etapa_emocional' THEN
          UPDATE wp_contactos SET etapa_emocional = v_secondary.etapa_emocional WHERE id = p_primary_id;
        WHEN 'timezone' THEN
          UPDATE wp_contactos SET timezone = v_secondary.timezone WHERE id = p_primary_id;
        WHEN 'avatar_url' THEN
          UPDATE wp_contactos SET avatar_url = v_secondary.avatar_url WHERE id = p_primary_id;
        WHEN 'notas' THEN
          UPDATE wp_contactos SET notas = v_secondary.notas WHERE id = p_primary_id;
        ELSE
          -- Unknown field, skip silently
          NULL;
      END CASE;
    END IF;
  END LOOP;

  -- Merge metadata (combine both, primary wins on conflict)
  IF v_secondary.metadata IS NOT NULL THEN
    UPDATE wp_contactos
    SET metadata = COALESCE(v_secondary.metadata, '{}'::jsonb) || COALESCE(metadata, '{}'::jsonb)
    WHERE id = p_primary_id;
  END IF;

  -- Update ultima_interaccion to the most recent of both
  UPDATE wp_contactos
  SET ultima_interaccion = GREATEST(
    COALESCE(v_primary.ultima_interaccion, v_primary.created_at),
    COALESCE(v_secondary.ultima_interaccion, v_secondary.created_at)
  ),
  updated_at = now()
  WHERE id = p_primary_id;

  -- ========================================================================
  -- REASSIGN FK REFERENCES (27 tables)
  -- ========================================================================

  -- 1. wp_conversaciones
  UPDATE wp_conversaciones SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_conversaciones', v_rows); END IF;

  -- 2. wp_citas
  UPDATE wp_citas SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_citas', v_rows); END IF;

  -- 3. wp_contactos_nota (controlled by p_notes_strategy)
  IF p_notes_strategy = 'both' OR p_notes_strategy IS NULL THEN
    -- Keep all notes from both contacts → move secondary's to primary
    UPDATE wp_contactos_nota SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contactos_nota_moved', v_rows); END IF;
  ELSIF p_notes_strategy = 'primary_only' THEN
    -- Keep only primary's notes → delete secondary's
    DELETE FROM wp_contactos_nota WHERE contacto_id = p_secondary_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contactos_nota_deleted', v_rows); END IF;
  ELSIF p_notes_strategy = 'secondary_only' THEN
    -- Keep only secondary's notes → delete primary's, then move secondary's
    DELETE FROM wp_contactos_nota WHERE contacto_id = p_primary_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contactos_nota_primary_deleted', v_rows); END IF;
    UPDATE wp_contactos_nota SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contactos_nota_moved', v_rows); END IF;
  END IF;

  -- 4. wp_crm_servicios
  UPDATE wp_crm_servicios SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_crm_servicios', v_rows); END IF;

  -- 5. wp_crm_pagos
  UPDATE wp_crm_pagos SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_crm_pagos', v_rows); END IF;

  -- 6. wp_facturas
  UPDATE wp_facturas SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_facturas', v_rows); END IF;

  -- 7. wp_finanzas
  UPDATE wp_finanzas SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_finanzas', v_rows); END IF;

  -- 8. wp_contacto_estado_embudo (UNIQUE on contacto_id)
  -- Delete secondary's record if primary already has one
  IF EXISTS (SELECT 1 FROM wp_contacto_estado_embudo WHERE contacto_id = p_primary_id) THEN
    DELETE FROM wp_contacto_estado_embudo WHERE contacto_id = p_secondary_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contacto_estado_embudo_deleted', v_rows); END IF;
  ELSE
    UPDATE wp_contacto_estado_embudo SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contacto_estado_embudo', v_rows); END IF;
  END IF;

  -- 9. wp_contacto_team_asignaciones (possible duplicates on same team member)
  -- Delete assignments that would create duplicates
  DELETE FROM wp_contacto_team_asignaciones
  WHERE contacto_id = p_secondary_id
    AND team_humano_id IN (
      SELECT team_humano_id FROM wp_contacto_team_asignaciones WHERE contacto_id = p_primary_id
    );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contacto_team_asignaciones_deleted', v_rows); END IF;
  -- Update remaining
  UPDATE wp_contacto_team_asignaciones SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contacto_team_asignaciones', v_rows); END IF;

  -- 10. wp_contactos_auditoria
  UPDATE wp_contactos_auditoria SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_contactos_auditoria', v_rows); END IF;

  -- 11. wp_evaluacion_preliminar
  UPDATE wp_evaluacion_preliminar SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_evaluacion_preliminar', v_rows); END IF;

  -- 12. wp_recordatorios
  UPDATE wp_recordatorios SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_recordatorios', v_rows); END IF;

  -- 13. wp_notificaciones
  UPDATE wp_notificaciones SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_notificaciones', v_rows); END IF;

  -- 14. wp_notificaciones_team
  UPDATE wp_notificaciones_team SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_notificaciones_team', v_rows); END IF;

  -- 15. wp_tareas
  UPDATE wp_tareas SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_tareas', v_rows); END IF;

  -- 16. wp_multimedia
  UPDATE wp_multimedia SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_multimedia', v_rows); END IF;

  -- 17. wp_email_contacto_campana (possible duplicates on same campaign)
  DELETE FROM wp_email_contacto_campana
  WHERE contacto_id = p_secondary_id
    AND campana_id IN (
      SELECT campana_id FROM wp_email_contacto_campana WHERE contacto_id = p_primary_id
    );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_email_contacto_campana_deleted', v_rows); END IF;
  UPDATE wp_email_contacto_campana SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_email_contacto_campana', v_rows); END IF;

  -- 18. wp_email_envio
  UPDATE wp_email_envio SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_email_envio', v_rows); END IF;

  -- 19. wp_email_recibido
  UPDATE wp_email_recibido SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_email_recibido', v_rows); END IF;

  -- 20. wp_marketing_audiencia_contacto (possible duplicates on same audience)
  DELETE FROM wp_marketing_audiencia_contacto
  WHERE contacto_id = p_secondary_id
    AND audiencia_id IN (
      SELECT audiencia_id FROM wp_marketing_audiencia_contacto WHERE contacto_id = p_primary_id
    );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_marketing_audiencia_contacto_deleted', v_rows); END IF;
  UPDATE wp_marketing_audiencia_contacto SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_marketing_audiencia_contacto', v_rows); END IF;

  -- 21. wp_actividades_log
  UPDATE wp_actividades_log SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_actividades_log', v_rows); END IF;

  -- 22. wp_suscripciones
  UPDATE wp_suscripciones SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_suscripciones', v_rows); END IF;

  -- 23. wp_proyectos
  UPDATE wp_proyectos SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_proyectos', v_rows); END IF;

  -- 24. drive_files
  UPDATE drive_files SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('drive_files', v_rows); END IF;

  -- 25. redaccion
  UPDATE redaccion SET contacto_id = p_primary_id WHERE contacto_id = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('redaccion', v_rows); END IF;

  -- 26. wp_team_humano (id_contacto — reverse FK)
  UPDATE wp_team_humano SET id_contacto = p_primary_id WHERE id_contacto = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('wp_team_humano', v_rows); END IF;

  -- 27. test_respuestas_agente_evaluador (id_conversacion references contactos)
  UPDATE test_respuestas_agente_evaluador SET id_conversacion = p_primary_id WHERE id_conversacion = p_secondary_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_tables := v_tables || jsonb_build_object('test_respuestas_agente_evaluador', v_rows); END IF;

  -- ========================================================================
  -- SOFT-DELETE contacto secundario
  -- ========================================================================
  UPDATE wp_contactos
  SET is_active = false,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'merged_into', p_primary_id,
        'merged_at', now()::text,
        'merged_by', p_merged_by
      ),
      updated_at = now()
  WHERE id = p_secondary_id;

  -- ========================================================================
  -- NOTA AUTOMÁTICA en el contacto primario
  -- ========================================================================
  INSERT INTO wp_contactos_nota (
    descripcion,
    contacto_id,
    team_humano_id,
    titulo,
    etiquetas,
    visible_ia
  ) VALUES (
    'Contacto unificado con ' ||
      COALESCE(v_secondary.nombre, '') || ' ' || COALESCE(v_secondary.apellido, '') ||
      ' (ID: ' || p_secondary_id || ').' ||
      ' Origen: ' || COALESCE(v_secondary.origen, 'desconocido') ||
      '. Teléfono: ' || COALESCE(v_secondary.telefono, 'sin teléfono') ||
      '. Email: ' || COALESCE(v_secondary.email, 'sin email') || '.',
    p_primary_id,
    p_merged_by,
    'Contacto unificado',
    '["merge", "sistema"]'::jsonb,
    true
  );

  -- ========================================================================
  -- REGISTRO en merge_log
  -- ========================================================================
  INSERT INTO wp_contactos_merge_log (
    empresa_id,
    primary_contact_id,
    secondary_contact_id,
    secondary_snapshot,
    field_choices,
    tables_updated,
    merged_by
  ) VALUES (
    v_primary.empresa_id,
    p_primary_id,
    p_secondary_id,
    v_snapshot,
    p_field_choices,
    v_tables,
    p_merged_by
  )
  RETURNING id INTO v_log_id;

  -- ========================================================================
  -- RETURN
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'merge_log_id', v_log_id,
    'tables_updated', v_tables,
    'primary_id', p_primary_id,
    'secondary_id', p_secondary_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

-- ============================================================================
-- 3. Preview function — counts entities without modifying anything
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_contacts_preview(
  p_primary_id bigint,
  p_secondary_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_counts jsonb := '{}';
  v_cnt int;
BEGIN
  -- Validate contacts exist
  IF NOT EXISTS (SELECT 1 FROM wp_contactos WHERE id = p_primary_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contacto primario no encontrado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM wp_contactos WHERE id = p_secondary_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contacto secundario no encontrado');
  END IF;

  SELECT count(*) INTO v_cnt FROM wp_conversaciones WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('conversaciones', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_citas WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('citas', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_contactos_nota WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('notas', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_crm_servicios WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('servicios', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_crm_pagos WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('pagos', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_facturas WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('facturas', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_tareas WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('tareas', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_multimedia WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('multimedia', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_recordatorios WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('recordatorios', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_email_envio WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('emails_enviados', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_email_recibido WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('emails_recibidos', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_proyectos WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('proyectos', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM drive_files WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('archivos_drive', v_cnt); END IF;

  SELECT count(*) INTO v_cnt FROM wp_finanzas WHERE contacto_id = p_secondary_id;
  IF v_cnt > 0 THEN v_counts := v_counts || jsonb_build_object('finanzas', v_cnt); END IF;

  RETURN jsonb_build_object(
    'success', true,
    'secondary_id', p_secondary_id,
    'counts', v_counts
  );
END;
$$;
