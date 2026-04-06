-- ============================================================================
-- adaptive_interface SCHEMA
-- Schema completo para el sistema de Chat, Sesiones, Roles y Perfiles
-- ============================================================================

-- Crear el schema si no existe
CREATE SCHEMA IF NOT EXISTS adaptive_interface;

-- ============================================================================
-- 1. USER_PROFILES - Perfiles de usuario
-- Debe crearse primero ya que otras tablas pueden referenciarla
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.user_profiles (
  id uuid NOT NULL,
  display_name text,
  avatar_url text,
  language character varying DEFAULT 'es'::character varying,
  timezone character varying DEFAULT 'America/Lima'::character varying,
  theme character varying DEFAULT 'dark'::character varying,
  default_view character varying DEFAULT 'chat'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_active_at timestamp with time zone DEFAULT now(),
  total_sessions integer DEFAULT 0,
  total_messages integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_active ON adaptive_interface.user_profiles(last_active_at);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION adaptive_interface.update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_profiles_updated ON adaptive_interface.user_profiles;
CREATE TRIGGER trigger_user_profiles_updated
  BEFORE UPDATE ON adaptive_interface.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION adaptive_interface.update_user_profiles_timestamp();

-- ============================================================================
-- 2. USER_SETTINGS - Configuraciones de usuario
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  category character varying,
  is_encrypted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT user_settings_unique_key UNIQUE (user_id, key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON adaptive_interface.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_category ON adaptive_interface.user_settings(category);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION adaptive_interface.update_user_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_settings_updated ON adaptive_interface.user_settings;
CREATE TRIGGER trigger_user_settings_updated
  BEFORE UPDATE ON adaptive_interface.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION adaptive_interface.update_user_settings_timestamp();

-- ============================================================================
-- 3. MONICA_ROLES - Roles/Agentes personalizados de Monica
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.monica_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL,
  descripcion text,
  system_prompt text NOT NULL,
  welcome_message text,
  temperatura numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 4096,
  tools_enabled text[] DEFAULT ARRAY['get_contacts', 'get_appointments', 'search_contacts_deep']::text[],
  avatar_url text,
  color_theme text DEFAULT 'cyan'::text,
  icono text DEFAULT 'sparkles'::text,
  created_by uuid NOT NULL,
  empresa_id bigint,
  is_public boolean DEFAULT false,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  last_used_at timestamp with time zone,
  categoria text DEFAULT 'general'::text,
  tags text[] DEFAULT ARRAY[]::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT monica_roles_pkey PRIMARY KEY (id),
  CONSTRAINT monica_roles_slug_unique UNIQUE (slug),
  CONSTRAINT monica_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT monica_roles_temperatura_check CHECK (temperatura >= 0 AND temperatura <= 2)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_monica_roles_empresa ON adaptive_interface.monica_roles(empresa_id);
CREATE INDEX IF NOT EXISTS idx_monica_roles_public ON adaptive_interface.monica_roles(is_public, is_active);
CREATE INDEX IF NOT EXISTS idx_monica_roles_created_by ON adaptive_interface.monica_roles(created_by);
CREATE INDEX IF NOT EXISTS idx_monica_roles_slug ON adaptive_interface.monica_roles(slug);
CREATE INDEX IF NOT EXISTS idx_monica_roles_categoria ON adaptive_interface.monica_roles(categoria);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION adaptive_interface.update_monica_roles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_monica_roles_updated ON adaptive_interface.monica_roles;
CREATE TRIGGER trigger_monica_roles_updated
  BEFORE UPDATE ON adaptive_interface.monica_roles
  FOR EACH ROW
  EXECUTE FUNCTION adaptive_interface.update_monica_roles_timestamp();

-- ============================================================================
-- 4. MONICA_ROLES_FAVORITOS - Roles favoritos del usuario
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.monica_roles_favoritos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT monica_roles_favoritos_pkey PRIMARY KEY (id),
  CONSTRAINT monica_roles_favoritos_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT monica_roles_favoritos_role_fkey FOREIGN KEY (role_id) REFERENCES adaptive_interface.monica_roles(id) ON DELETE CASCADE,
  CONSTRAINT monica_roles_favoritos_unique UNIQUE (user_id, role_id)
);

-- ============================================================================
-- 5. CHAT_SESSIONS - Sesiones de chat
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.chat_sessions (
  id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'New Analysis'::text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone DEFAULT now(),
  message_count integer DEFAULT 0,
  has_attachments boolean DEFAULT false,
  custom_instructions text,
  is_archived boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  tags text[] DEFAULT ARRAY[]::text[],
  role_id uuid,
  
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT chat_sessions_role_id_fkey FOREIGN KEY (role_id) REFERENCES adaptive_interface.monica_roles(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON adaptive_interface.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON adaptive_interface.chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_role ON adaptive_interface.chat_sessions(role_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_archived ON adaptive_interface.chat_sessions(is_archived);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION adaptive_interface.update_chat_sessions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_chat_sessions_updated ON adaptive_interface.chat_sessions;
CREATE TRIGGER trigger_chat_sessions_updated
  BEFORE UPDATE ON adaptive_interface.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION adaptive_interface.update_chat_sessions_timestamp();

-- ============================================================================
-- 6. CHAT_MESSAGES - Mensajes de chat
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  is_complete boolean DEFAULT false,
  request_id uuid,
  feedback text,
  is_archived boolean DEFAULT false,
  
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES adaptive_interface.chat_sessions(id) ON DELETE CASCADE,
  CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT chat_messages_role_check CHECK (role = ANY (ARRAY['user', 'assistant', 'system'])),
  CONSTRAINT chat_messages_feedback_check CHECK (feedback IS NULL OR feedback = ANY (ARRAY['like', 'dislike']))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON adaptive_interface.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON adaptive_interface.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON adaptive_interface.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_archived ON adaptive_interface.chat_messages(is_archived);

-- ============================================================================
-- 7. CONTEXTO_USUARIO - Datos de contexto por sesión
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.contexto_usuario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  data_type character varying,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  
  CONSTRAINT contexto_usuario_pkey PRIMARY KEY (id),
  CONSTRAINT contexto_usuario_session_id_fkey FOREIGN KEY (session_id) REFERENCES adaptive_interface.chat_sessions(id) ON DELETE CASCADE,
  CONSTRAINT contexto_usuario_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT contexto_usuario_unique_key UNIQUE (session_id, key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contexto_usuario_session ON adaptive_interface.contexto_usuario(session_id);
CREATE INDEX IF NOT EXISTS idx_contexto_usuario_user ON adaptive_interface.contexto_usuario(user_id);
CREATE INDEX IF NOT EXISTS idx_contexto_usuario_expires ON adaptive_interface.contexto_usuario(expires_at);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION adaptive_interface.update_contexto_usuario_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contexto_usuario_updated ON adaptive_interface.contexto_usuario;
CREATE TRIGGER trigger_contexto_usuario_updated
  BEFORE UPDATE ON adaptive_interface.contexto_usuario
  FOR EACH ROW
  EXECUTE FUNCTION adaptive_interface.update_contexto_usuario_timestamp();

-- ============================================================================
-- 8. ACTIVITY_LOGS - Registro de actividad
-- ============================================================================
CREATE TABLE IF NOT EXISTS adaptive_interface.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  action character varying NOT NULL,
  resource_type character varying,
  resource_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT activity_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES adaptive_interface.chat_sessions(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON adaptive_interface.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_session ON adaptive_interface.activity_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON adaptive_interface.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON adaptive_interface.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON adaptive_interface.activity_logs(resource_type, resource_id);

-- ============================================================================
-- RLS POLICIES - Seguridad a nivel de fila
-- ============================================================================

-- User Profiles: Solo el usuario puede ver/editar su perfil
ALTER TABLE adaptive_interface.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON adaptive_interface.user_profiles;
CREATE POLICY "Users can view own profile" ON adaptive_interface.user_profiles
  FOR ALL USING (id = auth.uid());

-- User Settings: Solo el usuario puede ver/editar sus settings
ALTER TABLE adaptive_interface.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own settings" ON adaptive_interface.user_settings;
CREATE POLICY "Users can manage own settings" ON adaptive_interface.user_settings
  FOR ALL USING (user_id = auth.uid());

-- Monica Roles: Roles públicos o propios
ALTER TABLE adaptive_interface.monica_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view public or own roles" ON adaptive_interface.monica_roles;
CREATE POLICY "Users can view public or own roles" ON adaptive_interface.monica_roles
  FOR SELECT USING (
    is_public = true 
    OR created_by = auth.uid()
    OR empresa_id IN (
      SELECT empresa_id FROM public.wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage own roles" ON adaptive_interface.monica_roles;
CREATE POLICY "Users can manage own roles" ON adaptive_interface.monica_roles
  FOR ALL USING (created_by = auth.uid());

-- Monica Roles Favoritos: Solo el usuario
ALTER TABLE adaptive_interface.monica_roles_favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own favorites" ON adaptive_interface.monica_roles_favoritos;
CREATE POLICY "Users can manage own favorites" ON adaptive_interface.monica_roles_favoritos
  FOR ALL USING (user_id = auth.uid());

-- Chat Sessions: Solo el usuario propietario
ALTER TABLE adaptive_interface.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own sessions" ON adaptive_interface.chat_sessions;
CREATE POLICY "Users can manage own sessions" ON adaptive_interface.chat_sessions
  FOR ALL USING (user_id = auth.uid());

-- Chat Messages: Solo mensajes de sesiones propias
ALTER TABLE adaptive_interface.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own messages" ON adaptive_interface.chat_messages;
CREATE POLICY "Users can manage own messages" ON adaptive_interface.chat_messages
  FOR ALL USING (user_id = auth.uid());

-- Contexto Usuario: Solo el usuario propietario
ALTER TABLE adaptive_interface.contexto_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own context" ON adaptive_interface.contexto_usuario;
CREATE POLICY "Users can manage own context" ON adaptive_interface.contexto_usuario
  FOR ALL USING (user_id = auth.uid());

-- Activity Logs: Solo el usuario puede ver sus propios logs
ALTER TABLE adaptive_interface.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own logs" ON adaptive_interface.activity_logs;
CREATE POLICY "Users can view own logs" ON adaptive_interface.activity_logs
  FOR SELECT USING (user_id = auth.uid());

-- Permitir insertar logs para cualquier usuario autenticado
DROP POLICY IF EXISTS "Users can insert logs" ON adaptive_interface.activity_logs;
CREATE POLICY "Users can insert logs" ON adaptive_interface.activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ============================================================================
COMMENT ON SCHEMA adaptive_interface IS 'Schema para el sistema de Chat con Monica AI, sesiones, roles y perfiles de usuario';

COMMENT ON TABLE adaptive_interface.user_profiles IS 'Perfiles de usuario con preferencias y estadísticas de uso';
COMMENT ON TABLE adaptive_interface.user_settings IS 'Configuraciones key-value por usuario';
COMMENT ON TABLE adaptive_interface.monica_roles IS 'Roles/Agentes personalizados de Monica (similar a GPTs)';
COMMENT ON TABLE adaptive_interface.monica_roles_favoritos IS 'Roles marcados como favoritos por cada usuario';
COMMENT ON TABLE adaptive_interface.chat_sessions IS 'Sesiones de chat con Monica';
COMMENT ON TABLE adaptive_interface.chat_messages IS 'Mensajes individuales dentro de cada sesión';
COMMENT ON TABLE adaptive_interface.contexto_usuario IS 'Datos de contexto temporales por sesión (variables, estados)';
COMMENT ON TABLE adaptive_interface.activity_logs IS 'Registro de actividad para observabilidad y auditoría';
