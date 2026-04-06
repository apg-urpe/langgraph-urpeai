-- =====================================================
-- FIX: Hacer create_team_invitation_v2 resiliente
-- Problema: unique constraint idx_team_invitations_unique_pending
--           causa error cuando ya existe invitación pendiente
-- Solución: EXCEPTION handler + auto-recuperación
-- Fecha: 2026-02-13
-- =====================================================

-- Reemplazar la función con versión resiliente
CREATE OR REPLACE FUNCTION create_team_invitation_v2(
  p_email VARCHAR,
  p_rol VARCHAR,
  p_role_id INTEGER,
  p_empresa_id INTEGER,
  p_invited_by INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  invitation_id BIGINT,
  invitation_token UUID,
  member_id INTEGER
) AS $$
DECLARE
  v_new_member_id INTEGER;
  v_new_invitation_id BIGINT;
  v_token UUID;
  v_existing_member RECORD;
  v_existing_invitation RECORD;
  v_other_empresa RECORD;
BEGIN
  -- Normalizar email
  p_email := LOWER(TRIM(p_email));
  
  -- ============================================
  -- CHECK 1: Email existe en OTRA empresa?
  -- ============================================
  SELECT th.id, th.empresa_id, ep.nombre AS empresa_nombre
  INTO v_other_empresa
  FROM wp_team_humano th
  LEFT JOIN wp_empresa_perfil ep ON ep.id = th.empresa_id
  WHERE th.email = p_email
  AND th.empresa_id != p_empresa_id
  AND th.deleted IS NULL
  AND th.is_active = TRUE
  LIMIT 1;
  
  IF v_other_empresa IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 
      ('Este email ya está registrado en otra empresa: ' || COALESCE(v_other_empresa.empresa_nombre, 'Desconocida'))::TEXT,
      NULL::BIGINT, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- CHECK 2: Miembro ACTIVO en misma empresa?
  -- ============================================
  SELECT id, is_active INTO v_existing_member
  FROM wp_team_humano 
  WHERE email = p_email 
  AND empresa_id = p_empresa_id
  AND deleted IS NULL
  LIMIT 1;
  
  IF v_existing_member IS NOT NULL AND v_existing_member.is_active = TRUE THEN
    RETURN QUERY SELECT FALSE, 'Ya existe un miembro activo con este email en la empresa'::TEXT, 
                        NULL::BIGINT, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- CHECK 3: Invitación pendiente vigente? → Devolver existente
  -- ============================================
  SELECT id, token, team_member_id INTO v_existing_invitation
  FROM wp_team_invitations
  WHERE email = p_email
  AND empresa_id = p_empresa_id
  AND status = 'pending'
  AND expires_at > NOW()
  LIMIT 1;
  
  IF v_existing_invitation IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 'Invitación pendiente existente - link regenerado'::TEXT,
                        v_existing_invitation.id::BIGINT,
                        v_existing_invitation.token::UUID,
                        v_existing_invitation.team_member_id::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- LIMPIAR: Cancelar invitaciones pendientes expiradas
  -- ============================================
  UPDATE wp_team_invitations
  SET status = 'cancelled'
  WHERE email = p_email
  AND empresa_id = p_empresa_id
  AND status = 'pending'
  AND expires_at <= NOW();
  
  -- ============================================
  -- MIEMBRO: Reusar inactivo o crear nuevo
  -- ============================================
  IF v_existing_member IS NOT NULL AND v_existing_member.is_active = FALSE THEN
    v_new_member_id := v_existing_member.id;
    UPDATE wp_team_humano
    SET rol = p_rol, role_id = p_role_id, updated_at = NOW()
    WHERE id = v_new_member_id;
  ELSE
    INSERT INTO wp_team_humano (
      empresa_id, enterprise_id, email, nombre, apellido,
      rol, role_id, is_active, created_at, updated_at
    ) VALUES (
      p_empresa_id, p_empresa_id, p_email, '(Pendiente)', '',
      p_rol, p_role_id, FALSE, NOW(), NOW()
    )
    RETURNING id INTO v_new_member_id;
  END IF;
  
  -- ============================================
  -- CREAR INVITACIÓN (con EXCEPTION handler)
  -- ============================================
  BEGIN
    INSERT INTO wp_team_invitations (
      email, rol, role_id, empresa_id, invited_by,
      status, team_member_id, expires_at
    ) VALUES (
      p_email, p_rol, p_role_id, p_empresa_id, p_invited_by,
      'pending', v_new_member_id, NOW() + INTERVAL '7 days'
    )
    RETURNING id, token INTO v_new_invitation_id, v_token;
    
    RETURN QUERY SELECT TRUE, 'Invitación creada exitosamente'::TEXT,
                        v_new_invitation_id, v_token, v_new_member_id;
  EXCEPTION 
    WHEN unique_violation THEN
      -- Race condition: otra invitación pendiente apareció entre el check y el insert
      -- Auto-recuperar: buscar la existente y devolverla
      SELECT id, token, team_member_id INTO v_existing_invitation
      FROM wp_team_invitations
      WHERE email = p_email
      AND empresa_id = p_empresa_id
      AND status = 'pending'
      LIMIT 1;
      
      IF v_existing_invitation IS NOT NULL THEN
        -- Extender expiración si estaba por expirar
        UPDATE wp_team_invitations 
        SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '7 days')
        WHERE id = v_existing_invitation.id;
        
        RETURN QUERY SELECT TRUE, 'Invitación pendiente existente - link regenerado'::TEXT,
                            v_existing_invitation.id::BIGINT,
                            v_existing_invitation.token::UUID,
                            COALESCE(v_existing_invitation.team_member_id, v_new_member_id)::INTEGER;
      ELSE
        RETURN QUERY SELECT FALSE, 'Error inesperado al crear invitación. Intenta de nuevo.'::TEXT,
                            NULL::BIGINT, NULL::UUID, NULL::INTEGER;
      END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar
SELECT 'create_team_invitation_v2 actualizado ✅' AS resultado;
