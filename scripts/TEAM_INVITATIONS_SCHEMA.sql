-- =====================================================
-- TEAM INVITATIONS SCHEMA
-- Sistema de invitaciones para nuevos miembros del equipo
-- =====================================================

-- Tabla principal de invitaciones
CREATE TABLE IF NOT EXISTS wp_team_invitations (
  id BIGSERIAL PRIMARY KEY,
  
  -- Token único para el link de invitación
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  
  -- Datos mínimos de la invitación
  email VARCHAR(255) NOT NULL,
  rol VARCHAR(50) NOT NULL DEFAULT 'asesor',
  role_id INTEGER NOT NULL DEFAULT 3,
  
  -- Empresa que invita
  empresa_id INTEGER NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  
  -- Quién invitó
  invited_by INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
  
  -- Estado de la invitación
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  
  -- Miembro creado al aceptar (referencia)
  team_member_id INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
  
  -- Metadata adicional (opcional)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON wp_team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON wp_team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_empresa ON wp_team_invitations(empresa_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON wp_team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_expires ON wp_team_invitations(expires_at) WHERE status = 'pending';

-- Índice único para evitar invitaciones duplicadas pendientes
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_unique_pending 
ON wp_team_invitations(email, empresa_id) 
WHERE status = 'pending';

-- Función para verificar y aceptar una invitación
CREATE OR REPLACE FUNCTION accept_team_invitation(
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
  v_new_member_id INTEGER;
BEGIN
  -- Buscar la invitación
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
  
  -- Verificar que no exista ya un miembro con ese email en la empresa
  IF EXISTS (
    SELECT 1 FROM wp_team_humano 
    WHERE email = v_invitation.email 
    AND empresa_id = v_invitation.empresa_id
    AND deleted IS NULL
  ) THEN
    RETURN QUERY SELECT FALSE, 'Ya existe un miembro con este email en la empresa'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- Crear el nuevo miembro
  INSERT INTO wp_team_humano (
    empresa_id,
    enterprise_id,
    nombre,
    apellido,
    email,
    telefono,
    rol,
    role_id,
    is_active,
    auth_uid,
    created_at,
    updated_at
  ) VALUES (
    v_invitation.empresa_id,
    v_invitation.empresa_id,
    p_nombre,
    p_apellido,
    v_invitation.email,
    p_telefono,
    v_invitation.rol,
    v_invitation.role_id,
    TRUE,
    p_auth_uid,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_member_id;
  
  -- Actualizar la invitación
  UPDATE wp_team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    team_member_id = v_new_member_id
  WHERE id = v_invitation.id;
  
  RETURN QUERY SELECT TRUE, 'Invitación aceptada exitosamente'::TEXT, v_new_member_id, v_invitation.empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para limpiar invitaciones expiradas (ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE wp_team_invitations
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE wp_team_invitations ENABLE ROW LEVEL SECURITY;

-- Política: Los miembros pueden ver invitaciones de su empresa
CREATE POLICY "team_invitations_select_policy" ON wp_team_invitations
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
    )
  );

-- Política: Solo roles 1, 2, 3 pueden crear invitaciones
CREATE POLICY "team_invitations_insert_policy" ON wp_team_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
      AND role_id IN (1, 2, 3)
      AND empresa_id = wp_team_invitations.empresa_id
    )
  );

-- Política: Solo el invitador o admins pueden cancelar
CREATE POLICY "team_invitations_update_policy" ON wp_team_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM wp_team_humano 
      WHERE auth_uid = auth.uid()
      AND (role_id IN (1, 2) OR id = wp_team_invitations.invited_by)
      AND empresa_id = wp_team_invitations.empresa_id
    )
  );

-- Política especial: Permitir lectura por token (para aceptar invitación sin auth)
-- Nota: Esto requiere un endpoint público que use service_role key
-- O usar una función RPC con SECURITY DEFINER

-- Comentarios de documentación
COMMENT ON TABLE wp_team_invitations IS 'Invitaciones pendientes para nuevos miembros del equipo';
COMMENT ON COLUMN wp_team_invitations.token IS 'Token UUID único para el link de invitación';
COMMENT ON COLUMN wp_team_invitations.status IS 'Estado: pending, accepted, expired, cancelled';
COMMENT ON COLUMN wp_team_invitations.expires_at IS 'Fecha de expiración (default: 7 días)';
