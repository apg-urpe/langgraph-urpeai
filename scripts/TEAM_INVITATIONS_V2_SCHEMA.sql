-- =====================================================
-- TEAM INVITATIONS V2 SCHEMA
-- Sistema mejorado: Crea wp_team_humano AL MOMENTO de invitar
-- Esto asegura que el auto-linking por email funcione siempre
-- =====================================================

-- ============================================
-- 1. FUNCIÓN: Crear invitación + miembro en una transacción
-- ============================================
DROP FUNCTION IF EXISTS create_team_invitation_v2(VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER);

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
BEGIN
  -- Normalizar email
  p_email := LOWER(TRIM(p_email));
  
  -- ============================================
  -- Verificar si ya existe un miembro ACTIVO con este email
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
  -- Verificar si hay una invitación pendiente
  -- ============================================
  SELECT id, token, team_member_id INTO v_existing_invitation
  FROM wp_team_invitations
  WHERE email = p_email
  AND empresa_id = p_empresa_id
  AND status = 'pending'
  AND expires_at > NOW()
  LIMIT 1;
  
  IF v_existing_invitation IS NOT NULL THEN
    -- Retornar la invitación existente
    RETURN QUERY SELECT TRUE, 'Invitación pendiente existente'::TEXT,
                        v_existing_invitation.id::BIGINT,
                        v_existing_invitation.token::UUID,
                        v_existing_invitation.team_member_id::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- Si existe miembro INACTIVO (invitación previa no completada), reusarlo
  -- ============================================
  IF v_existing_member IS NOT NULL AND v_existing_member.is_active = FALSE THEN
    v_new_member_id := v_existing_member.id;
    
    -- Actualizar datos del miembro existente
    UPDATE wp_team_humano
    SET 
      rol = p_rol,
      role_id = p_role_id,
      updated_at = NOW()
    WHERE id = v_new_member_id;
    
  ELSE
    -- ============================================
    -- Crear nuevo miembro en wp_team_humano (INACTIVO)
    -- ============================================
    INSERT INTO wp_team_humano (
      empresa_id,
      enterprise_id,
      email,
      nombre,
      apellido,
      rol,
      role_id,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      p_empresa_id,
      p_empresa_id,
      p_email,
      '(Pendiente)',  -- Nombre temporal
      '',             -- Apellido vacío
      p_rol,
      p_role_id,
      FALSE,          -- IMPORTANTE: Inactivo hasta que acepte
      NOW(),
      NOW()
    )
    RETURNING id INTO v_new_member_id;
  END IF;
  
  -- ============================================
  -- Cancelar invitaciones previas expiradas para este email/empresa
  -- ============================================
  UPDATE wp_team_invitations
  SET status = 'cancelled'
  WHERE email = p_email
  AND empresa_id = p_empresa_id
  AND status = 'pending'
  AND expires_at <= NOW();
  
  -- ============================================
  -- Crear la invitación
  -- ============================================
  INSERT INTO wp_team_invitations (
    email,
    rol,
    role_id,
    empresa_id,
    invited_by,
    status,
    team_member_id,
    expires_at
  ) VALUES (
    p_email,
    p_rol,
    p_role_id,
    p_empresa_id,
    p_invited_by,
    'pending',
    v_new_member_id,
    NOW() + INTERVAL '7 days'
  )
  RETURNING id, token INTO v_new_invitation_id, v_token;
  
  RETURN QUERY SELECT TRUE, 'Invitación creada exitosamente'::TEXT,
                      v_new_invitation_id,
                      v_token,
                      v_new_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. FUNCIÓN: Aceptar invitación (UPDATE en vez de INSERT)
-- ============================================
CREATE OR REPLACE FUNCTION accept_team_invitation_v2(
  p_token UUID,
  p_nombre VARCHAR,
  p_apellido VARCHAR,
  p_telefono VARCHAR DEFAULT NULL,
  p_auth_uid UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  member_id INTEGER,
  empresa_id INTEGER
) AS $$
DECLARE
  v_invitation RECORD;
  v_member RECORD;
BEGIN
  -- ============================================
  -- Buscar la invitación
  -- ============================================
  SELECT * INTO v_invitation
  FROM wp_team_invitations
  WHERE token = p_token
  FOR UPDATE;
  
  -- Validaciones
  IF v_invitation IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Invitación no encontrada'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  IF v_invitation.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, ('Invitación ya ' || v_invitation.status)::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  IF v_invitation.expires_at < NOW() THEN
    -- Marcar como expirada
    UPDATE wp_team_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RETURN QUERY SELECT FALSE, 'Invitación expirada'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- Verificar que el miembro existe (debería existir por V2)
  -- ============================================
  IF v_invitation.team_member_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Error interno: miembro no pre-creado'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  SELECT * INTO v_member
  FROM wp_team_humano
  WHERE id = v_invitation.team_member_id
  FOR UPDATE;
  
  IF v_member IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Error interno: miembro no encontrado'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- Verificar que no esté ya activo
  -- ============================================
  IF v_member.is_active = TRUE THEN
    RETURN QUERY SELECT FALSE, 'Este usuario ya está activo en el sistema'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- ============================================
  -- ACTUALIZAR el miembro existente (no INSERT)
  -- ============================================
  UPDATE wp_team_humano
  SET 
    nombre = p_nombre,
    apellido = p_apellido,
    telefono = COALESCE(p_telefono, telefono),
    auth_uid = COALESCE(p_auth_uid, auth_uid),
    is_active = TRUE,
    updated_at = NOW()
  WHERE id = v_invitation.team_member_id;
  
  -- ============================================
  -- Actualizar la invitación
  -- ============================================
  UPDATE wp_team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE id = v_invitation.id;
  
  RETURN QUERY SELECT TRUE, 'Invitación aceptada exitosamente'::TEXT, 
                      v_invitation.team_member_id, 
                      v_invitation.empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. GRANT permisos para que el cliente pueda usar las funciones
-- ============================================
GRANT EXECUTE ON FUNCTION create_team_invitation_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION accept_team_invitation_v2 TO anon, authenticated;

-- ============================================
-- 4. Comentarios de documentación
-- ============================================
COMMENT ON FUNCTION create_team_invitation_v2 IS 
'V2: Crea invitación + miembro inactivo en wp_team_humano. 
Esto asegura que el auto-linking por email funcione cuando el usuario se autentique.';

COMMENT ON FUNCTION accept_team_invitation_v2 IS 
'V2: Activa un miembro existente (UPDATE) en vez de crear uno nuevo (INSERT).
Completa nombre, apellido, teléfono y vincula auth_uid.';
