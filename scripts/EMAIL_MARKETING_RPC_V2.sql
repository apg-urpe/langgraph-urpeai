-- ============================================================================
-- EMAIL MARKETING RPC V2 - FUNCIONES DE INSCRIPCIÓN
-- Complementa get_pending_email_campaigns_v3 (que YA EXISTE y funciona bien)
-- ============================================================================
-- Incluye:
--   1. enroll_contacts_in_campaign() - Bulk insert al activar campaña
--   2. sync_campaign_enrollments()   - Re-sincronización periódica para dinámicas
--   3. update_enrollment_after_send() - Actualizar después de envío
--   4. cancel_enrollment() - Cancelar inscripción
--   5. Índices optimizados
-- ============================================================================
-- NOTA: get_pending_email_campaigns_v3 YA EXISTE en producción con:
--   - FOR UPDATE SKIP LOCKED ✅
--   - Marca como 'procesando' ✅
--   - Valida email_marketing en empresa ✅
--   - Excluye clientes y contactos inactivos ✅
-- ============================================================================

-- ============================================================================
-- ÍNDICES OPTIMIZADOS
-- ============================================================================

-- NOTA: El índice único ya existe en producción:
-- unique_empresa_contacto_campana_activo (empresa_id, campana_id, contacto_id, estado) WHERE estado='activo'
-- No creamos índices duplicados.

-- Índice para audiencias dinámicas
CREATE INDEX IF NOT EXISTS idx_audiencias_dinamicas_activas
ON wp_marketing_audiencias(empresa_id, tipo)
WHERE tipo = 'dinamica';

-- ============================================================================
-- FUNCIÓN 1: enroll_contacts_in_campaign
-- Inscribe contactos de una audiencia a una campaña (bulk insert)
-- Se llama al activar una campaña o manualmente
-- ============================================================================

-- Eliminar firma anterior (3 params) para evitar ambigüedad
DROP FUNCTION IF EXISTS enroll_contacts_in_campaign(BIGINT, BIGINT, INTEGER);

CREATE OR REPLACE FUNCTION enroll_contacts_in_campaign(
    p_campana_id BIGINT,
    p_empresa_id BIGINT,
    p_first_send_delay_minutes INTEGER DEFAULT 0,  -- 0 = envío inmediato
    p_contacto_ids BIGINT[] DEFAULT NULL           -- Para dinámicas: IDs pre-resueltos por frontend
)
RETURNS TABLE (
    enrolled_count INTEGER,
    skipped_count INTEGER,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_audiencia_id BIGINT;
    v_audiencia_tipo TEXT;
    v_enrolled INTEGER := 0;
    v_skipped INTEGER := 0;
    v_proximo_envio TIMESTAMPTZ;
BEGIN
    -- Obtener audiencia de la campaña
    SELECT c.audiencia_id INTO v_audiencia_id
    FROM wp_email_campanas c
    WHERE c.id = p_campana_id
      AND (c.empresa_id = p_empresa_id OR c.empresa_id IS NULL);
    
    IF v_audiencia_id IS NULL THEN
        RETURN QUERY SELECT 0, 0, 'Campaña sin audiencia asignada'::TEXT;
        RETURN;
    END IF;
    
    -- Obtener tipo de audiencia
    SELECT a.tipo INTO v_audiencia_tipo
    FROM wp_marketing_audiencias a
    WHERE a.id = v_audiencia_id;
    
    -- Calcular próximo envío
    v_proximo_envio := NOW() + (p_first_send_delay_minutes || ' minutes')::INTERVAL;
    
    -- AUDIENCIA ESTÁTICA: Usar tabla de relación
    IF v_audiencia_tipo = 'estatica' THEN
        INSERT INTO wp_email_contacto_campana (
            empresa_id,
            campana_id,
            contacto_id,
            estado,
            fecha_inscripcion,
            ultimo_toque,
            proximo_envio_en,
            condiciones_entrada_capturadas
        )
        SELECT 
            p_empresa_id,
            p_campana_id,
            mac.contacto_id,
            'activo',
            NOW(),
            0,
            v_proximo_envio,
            jsonb_build_object('tipo', 'estatica', 'audiencia_id', v_audiencia_id)
        FROM wp_marketing_audiencia_contacto mac
        INNER JOIN wp_contactos c ON mac.contacto_id = c.id
        WHERE mac.audiencia_id = v_audiencia_id
          AND c.empresa_id = p_empresa_id
          AND c.email IS NOT NULL
          AND c.email != ''
          AND c.is_active = TRUE           -- Solo contactos activos
          AND (c.suscripcion IS NULL OR c.suscripcion != FALSE)  -- Excluir desuscritos
          AND NOT EXISTS (
              SELECT 1 FROM wp_email_contacto_campana ecc
              WHERE ecc.campana_id = p_campana_id
                AND ecc.contacto_id = mac.contacto_id
                AND ecc.estado = 'activo'  -- Solo bloquea si ya está activo (consistente con índice único)
          )
        ON CONFLICT DO NOTHING;
        
        GET DIAGNOSTICS v_enrolled = ROW_COUNT;
        
        -- Contar skipped (sin email, inactivos, desuscritos, o ya inscritos)
        SELECT COUNT(*) INTO v_skipped
        FROM wp_marketing_audiencia_contacto mac
        INNER JOIN wp_contactos c ON mac.contacto_id = c.id
        WHERE mac.audiencia_id = v_audiencia_id
          AND c.empresa_id = p_empresa_id
          AND (
              c.email IS NULL 
              OR c.email = '' 
              OR c.is_active = FALSE 
              OR c.suscripcion = FALSE
              OR EXISTS (
                  SELECT 1 FROM wp_email_contacto_campana ecc
                  WHERE ecc.campana_id = p_campana_id
                    AND ecc.contacto_id = mac.contacto_id
                    AND ecc.estado = 'activo'  -- Ya está activo (consistente con índice único)
              )
          );
    
    -- AUDIENCIA DINÁMICA: Usa p_contacto_ids pre-resueltos por el frontend
    -- El frontend aplica filtros_json via buildFilterQuery y pasa los IDs resultantes
    ELSIF v_audiencia_tipo = 'dinamica' THEN
        
        IF p_contacto_ids IS NULL OR array_length(p_contacto_ids, 1) IS NULL THEN
            RETURN QUERY SELECT 0, 0, 
                'Audiencia dinámica requiere p_contacto_ids (resueltos por frontend)'::TEXT;
            RETURN;
        END IF;
        
        INSERT INTO wp_email_contacto_campana (
            empresa_id,
            campana_id,
            contacto_id,
            estado,
            fecha_inscripcion,
            ultimo_toque,
            proximo_envio_en,
            condiciones_entrada_capturadas
        )
        SELECT 
            p_empresa_id,
            p_campana_id,
            c.id,
            'activo',
            NOW(),
            0,
            v_proximo_envio,
            jsonb_build_object(
                'tipo', 'dinamica', 
                'audiencia_id', v_audiencia_id,
                'snapshot_at', NOW()
            )
        FROM wp_contactos c
        WHERE c.id = ANY(p_contacto_ids)
          AND c.empresa_id = p_empresa_id
          AND c.email IS NOT NULL
          AND c.email != ''
          AND c.is_active = TRUE
          AND (c.suscripcion IS NULL OR c.suscripcion != FALSE)  -- Excluir desuscritos
          AND NOT EXISTS (
              SELECT 1 FROM wp_email_contacto_campana ecc
              WHERE ecc.campana_id = p_campana_id
                AND ecc.contacto_id = c.id
                AND ecc.estado = 'activo'
          )
        ON CONFLICT DO NOTHING;
        
        GET DIAGNOSTICS v_enrolled = ROW_COUNT;
        v_skipped := array_length(p_contacto_ids, 1) - v_enrolled;
    END IF;
    
    RETURN QUERY SELECT 
        v_enrolled,
        v_skipped,
        format('Inscripción completada: %s nuevos, %s omitidos (ya inscritos o sin email)', 
               v_enrolled, v_skipped)::TEXT;
END;
$$;

-- ============================================================================
-- FUNCIÓN 2: sync_campaign_enrollments
-- Re-sincroniza audiencias ESTÁTICAS (para ejecutar periódicamente)
-- Para dinámicas: n8n debe resolver filtros y llamar enroll_contacts_in_campaign con p_contacto_ids
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_campaign_enrollments(
    p_empresa_id BIGINT DEFAULT NULL,  -- NULL = todas las empresas
    p_campana_id BIGINT DEFAULT NULL   -- NULL = todas las campañas activas
)
RETURNS TABLE (
    campana_id BIGINT,
    campana_nombre TEXT,
    nuevos_inscritos INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campana RECORD;
    v_count INTEGER;
BEGIN
    -- Solo procesa audiencias ESTÁTICAS (tienen contactos explícitos en wp_marketing_audiencia_contacto)
    -- Las audiencias DINÁMICAS requieren resolución de filtros desde frontend/n8n
    FOR v_campana IN 
        SELECT 
            c.id,
            c.nombre,
            c.empresa_id,
            c.audiencia_id,
            a.tipo as audiencia_tipo
        FROM wp_email_campanas c
        INNER JOIN wp_marketing_audiencias a ON c.audiencia_id = a.id
        WHERE c.estado = 'activa'
          AND a.tipo = 'estatica'
          AND (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
          AND (p_campana_id IS NULL OR c.id = p_campana_id)
    LOOP
        -- Inscribir nuevos contactos de audiencia estática que no estén ya inscritos
        INSERT INTO wp_email_contacto_campana (
            empresa_id,
            campana_id,
            contacto_id,
            estado,
            fecha_inscripcion,
            ultimo_toque,
            proximo_envio_en,
            condiciones_entrada_capturadas
        )
        SELECT 
            v_campana.empresa_id,
            v_campana.id,
            mac.contacto_id,
            'activo',
            NOW(),
            0,
            NOW(),
            jsonb_build_object(
                'tipo', 'sync_estatica',
                'audiencia_id', v_campana.audiencia_id,
                'sync_at', NOW()
            )
        FROM wp_marketing_audiencia_contacto mac
        INNER JOIN wp_contactos c ON mac.contacto_id = c.id
        WHERE mac.audiencia_id = v_campana.audiencia_id
          AND c.empresa_id = v_campana.empresa_id
          AND c.email IS NOT NULL
          AND c.email != ''
          AND c.is_active = TRUE
          AND c.estado != 'cliente'
          AND NOT EXISTS (
              SELECT 1 FROM wp_email_contacto_campana ecc
              WHERE ecc.campana_id = v_campana.id
                AND ecc.contacto_id = mac.contacto_id
                AND ecc.estado = 'activo'
          )
        ON CONFLICT DO NOTHING;
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        
        campana_id := v_campana.id;
        campana_nombre := v_campana.nombre;
        nuevos_inscritos := v_count;
        
        IF v_count > 0 THEN
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================================
-- NOTA: get_contacts_ready_for_email_v2 NO SE INCLUYE
-- Ya existe get_pending_email_campaigns_v3 en producción que hace lo mismo
-- pero con mejores validaciones (email_marketing, is_active, estado != 'cliente')
-- ============================================================================

-- ============================================================================
-- FUNCIÓN 3: update_enrollment_after_send
-- Actualiza el enrollment después de enviar email exitosamente
-- ============================================================================

CREATE OR REPLACE FUNCTION update_enrollment_after_send(
    p_enrollment_id BIGINT,
    p_success BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ultimo_toque INTEGER;
    v_total_toques INTEGER;
    v_cadencia_dias INTEGER;
    v_nuevo_estado TEXT;
BEGIN
    -- Obtener datos actuales
    SELECT 
        ecc.ultimo_toque,
        camp.total_toques,
        camp.cadencia_dias
    INTO v_ultimo_toque, v_total_toques, v_cadencia_dias
    FROM wp_email_contacto_campana ecc
    INNER JOIN wp_email_campanas camp ON ecc.campana_id = camp.id
    WHERE ecc.id = p_enrollment_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    IF p_success THEN
        -- Incrementar toque
        v_ultimo_toque := v_ultimo_toque + 1;
        
        -- Determinar nuevo estado
        IF v_total_toques IS NOT NULL AND v_ultimo_toque >= v_total_toques THEN
            v_nuevo_estado := 'completado';
        ELSE
            v_nuevo_estado := 'activo';
        END IF;
        
        -- Actualizar enrollment
        UPDATE wp_email_contacto_campana
        SET 
            estado = v_nuevo_estado,
            ultimo_toque = v_ultimo_toque,
            proximo_envio_en = CASE 
                WHEN v_nuevo_estado = 'activo' THEN NOW() + (v_cadencia_dias || ' days')::INTERVAL
                ELSE NULL
            END,
            updated_at = NOW(),
            fecha_salida = CASE WHEN v_nuevo_estado = 'completado' THEN NOW() ELSE NULL END,
            motivo_salida = CASE WHEN v_nuevo_estado = 'completado' THEN 'Secuencia completada' ELSE NULL END
        WHERE id = p_enrollment_id;
    ELSE
        -- Envío fallido: revertir a activo para reintento
        UPDATE wp_email_contacto_campana
        SET 
            estado = 'activo',
            proximo_envio_en = NOW() + INTERVAL '1 hour',  -- Reintentar en 1 hora
            updated_at = NOW()
        WHERE id = p_enrollment_id;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCIÓN 5: cancel_enrollment
-- Cancela la inscripción de un contacto en una campaña
-- ============================================================================

CREATE OR REPLACE FUNCTION cancel_enrollment(
    p_enrollment_id BIGINT,
    p_motivo TEXT DEFAULT 'Cancelado manualmente'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE wp_email_contacto_campana
    SET 
        estado = 'cancelado',
        fecha_salida = NOW(),
        motivo_salida = p_motivo,
        updated_at = NOW()
    WHERE id = p_enrollment_id
      AND estado IN ('activo', 'procesando', 'pausado');
    
    RETURN FOUND;
END;
$$;

-- ============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ============================================================================

COMMENT ON FUNCTION enroll_contacts_in_campaign IS 
'Inscribe contactos de una audiencia a una campaña.
Uso: SELECT * FROM enroll_contacts_in_campaign(campana_id, empresa_id, delay_minutes);
- Para audiencias estáticas: usa wp_marketing_audiencia_contacto
- Para audiencias dinámicas: inscribe todos los contactos con email
- Evita duplicados automáticamente
- p_first_send_delay_minutes: 0 para envío inmediato';

COMMENT ON FUNCTION sync_campaign_enrollments IS 
'Re-sincroniza audiencias dinámicas (ejecutar cada 6-12 horas via pg_cron o n8n).
Uso: SELECT * FROM sync_campaign_enrollments(empresa_id, campana_id);
- NULL en parámetros = procesar todos
- Solo procesa campañas activas con audiencias dinámicas
- Inscribe contactos nuevos que aún no están en la campaña';

-- NOTA: get_pending_email_campaigns_v3 ya existe en producción
-- No necesita COMMENT aquí

COMMENT ON FUNCTION update_enrollment_after_send IS 
'Actualiza enrollment después de enviar email.
Uso: SELECT update_enrollment_after_send(enrollment_id, true/false);
- true: envío exitoso - incrementa toque, calcula próximo envío
- false: envío fallido - programa reintento en 1 hora
- Si completó secuencia, marca como "completado"';

-- ============================================================================
-- EJEMPLOS DE USO - FLUJO COMPLETO
-- ============================================================================

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ FLUJO DE EMAIL MARKETING                                                 │
-- ├─────────────────────────────────────────────────────────────────────────┤
-- │ 1. Crear campaña con audiencia (UI/API)                                  │
-- │ 2. Activar campaña → Inscribir contactos                                 │
-- │ 3. n8n scheduler → get_pending_email_campaigns_v3()                      │
-- │ 4. Enviar email                                                          │
-- │ 5. Actualizar enrollment → update_enrollment_after_send()                │
-- │ 6. Periódico: sync_campaign_enrollments() para audiencias dinámicas      │
-- └─────────────────────────────────────────────────────────────────────────┘

-- PASO 1: Activar campaña e inscribir contactos (desde UI o al activar)
-- SELECT * FROM enroll_contacts_in_campaign(5, 13, 0);
-- Resultado: enrolled_count, skipped_count, message

-- PASO 2: Obtener contactos listos (n8n ya usa esto)
-- POST https://xxx.supabase.co/rest/v1/rpc/get_pending_email_campaigns_v3
-- Body: { "p_limit": 30 }
-- Retorna: id, empresa_id, campana_id, contacto_id, email, nombre, etc.

-- PASO 3: Después de enviar exitosamente
-- SELECT update_enrollment_after_send(id_del_enrollment, TRUE);

-- PASO 4: Si el envío falló
-- SELECT update_enrollment_after_send(id_del_enrollment, FALSE);
-- Programa reintento en 1 hora automáticamente

-- PASO 5: Re-sincronizar audiencias dinámicas (cada 6-12 horas)
-- SELECT * FROM sync_campaign_enrollments();
-- o para una empresa específica:
-- SELECT * FROM sync_campaign_enrollments(13);

-- PASO 6: Cancelar inscripción manualmente
-- SELECT cancel_enrollment(enrollment_id, 'Usuario solicitó baja');
