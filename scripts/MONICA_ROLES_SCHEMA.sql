-- =====================================================
-- MONICA ROLES SCHEMA - adaptive_interface
-- Sistema de Roles/Agentes Personalizados para Monica
-- =====================================================

-- Tabla principal de roles/agentes de Monica
-- Similar a GPTs o Gemas de Google
CREATE TABLE adaptive_interface.monica_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  
  -- Identificación
  nombre text NOT NULL,                          -- Nombre del rol (ej: "Asistente de Ventas")
  slug text NOT NULL UNIQUE,                     -- Identificador único URL-friendly
  descripcion text,                              -- Descripción corta del rol
  
  -- Instrucciones del sistema (el corazón del rol)
  system_prompt text NOT NULL,                   -- Instrucciones principales
  welcome_message text,                          -- Mensaje de bienvenida personalizado
  
  -- Configuración de comportamiento
  temperatura numeric(3,2) DEFAULT 0.7,          -- Temperatura de generación (0.0 - 2.0)
  max_tokens integer DEFAULT 4096,               -- Límite de tokens en respuesta
  
  -- Herramientas/Tools habilitadas (array de nombres)
  tools_enabled text[] DEFAULT ARRAY[            -- Tools del CRM habilitadas para este rol
    'get_contacts',
    'get_appointments',
    'update_appointment_status',
    'search_contacts_deep'
  ]::text[],
  
  -- Visuales
  avatar_url text,                               -- URL de avatar personalizado
  color_theme text DEFAULT 'cyan',               -- Color temático (cyan, violet, emerald, etc)
  icono text DEFAULT 'sparkles',                 -- Nombre del icono Lucide
  
  -- Propiedad y visibilidad
  created_by uuid NOT NULL,                      -- Usuario que creó el rol
  empresa_id bigint,                             -- NULL = público (Urpe Lab), valor = privado para empresa
  is_public boolean DEFAULT false,               -- Visible para todos los usuarios
  is_default boolean DEFAULT false,              -- Es el rol por defecto (Monica clásica)
  is_active boolean DEFAULT true,                -- Está habilitado
  
  -- Estadísticas de uso
  usage_count integer DEFAULT 0,                 -- Veces que se ha usado
  last_used_at timestamp with time zone,         -- Última vez usado
  
  -- Categorización
  categoria text DEFAULT 'general',              -- Categoría: general, ventas, soporte, marketing, custom
  tags text[] DEFAULT ARRAY[]::text[],           -- Tags para búsqueda
  
  -- Metadata flexible
  metadata jsonb DEFAULT '{}'::jsonb,            -- Configuración adicional
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT monica_roles_pkey PRIMARY KEY (id),
  CONSTRAINT monica_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT monica_roles_temperatura_check CHECK (temperatura >= 0 AND temperatura <= 2)
);

-- Índices para consultas frecuentes
CREATE INDEX idx_monica_roles_empresa ON adaptive_interface.monica_roles(empresa_id);
CREATE INDEX idx_monica_roles_public ON adaptive_interface.monica_roles(is_public, is_active);
CREATE INDEX idx_monica_roles_created_by ON adaptive_interface.monica_roles(created_by);
CREATE INDEX idx_monica_roles_slug ON adaptive_interface.monica_roles(slug);
CREATE INDEX idx_monica_roles_categoria ON adaptive_interface.monica_roles(categoria);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION adaptive_interface.update_monica_roles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_monica_roles_updated
  BEFORE UPDATE ON adaptive_interface.monica_roles
  FOR EACH ROW
  EXECUTE FUNCTION adaptive_interface.update_monica_roles_timestamp();

-- =====================================================
-- ROLES FAVORITOS DEL USUARIO
-- =====================================================
CREATE TABLE adaptive_interface.monica_roles_favoritos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT monica_roles_favoritos_pkey PRIMARY KEY (id),
  CONSTRAINT monica_roles_favoritos_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT monica_roles_favoritos_role_fkey FOREIGN KEY (role_id) REFERENCES adaptive_interface.monica_roles(id) ON DELETE CASCADE,
  CONSTRAINT monica_roles_favoritos_unique UNIQUE (user_id, role_id)
);

-- =====================================================
-- HISTORIAL DE USO DE ROLES POR SESIÓN
-- =====================================================
-- Añadir campo role_id a chat_sessions (ALTER existente)
ALTER TABLE adaptive_interface.chat_sessions 
ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES adaptive_interface.monica_roles(id);

-- Índice para filtrar sesiones por rol
CREATE INDEX IF NOT EXISTS idx_chat_sessions_role ON adaptive_interface.chat_sessions(role_id);

-- =====================================================
-- ROL POR DEFECTO: MONICA CLÁSICA
-- =====================================================
-- Este INSERT debe ejecutarse DESPUÉS de crear las tablas
-- El created_by debe ser un usuario válido (admin de Urpe Lab)

/*
INSERT INTO adaptive_interface.monica_roles (
  nombre,
  slug,
  descripcion,
  system_prompt,
  welcome_message,
  is_public,
  is_default,
  empresa_id,
  created_by,
  categoria,
  color_theme,
  icono,
  tools_enabled
) VALUES (
  'Monica',
  'monica-default',
  'Asistente IA general de Urpe AI Lab con acceso completo al CRM',
  'Eres Monica, Asistente IA de Urpe AI Lab. Tienes acceso a herramientas para consultar datos del CRM en tiempo real: Contactos, Citas, Conversaciones, Equipo, Embudo, Métricas, Tareas y Notas. Responde en español, de forma concisa y útil. Usa Markdown para texto y UI blocks para datos estructurados.',
  '¡Hola! Soy Monica, tu asistente de Urpe AI Lab. ¿En qué puedo ayudarte hoy?',
  true,
  true,
  NULL, -- Público (Urpe Lab)
  'UUID_DEL_ADMIN', -- Reemplazar con UUID real
  'general',
  'cyan',
  'sparkles',
  ARRAY['get_contacts', 'get_contact_details', 'get_appointments', 'get_conversations', 'search_messages', 'get_team_members', 'get_funnel_stages', 'get_funnel_stats', 'get_metrics', 'get_tasks', 'get_contact_notes', 'create_note', 'search_contacts_deep']
);
*/

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Habilitar RLS
ALTER TABLE adaptive_interface.monica_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.monica_roles_favoritos ENABLE ROW LEVEL SECURITY;

-- Policy: Usuarios pueden ver roles públicos o de su empresa
CREATE POLICY "Users can view public or own enterprise roles"
ON adaptive_interface.monica_roles
FOR SELECT
USING (
  is_active = true AND (
    is_public = true 
    OR created_by = auth.uid()
    OR empresa_id IN (
      SELECT th.empresa_id 
      FROM public.wp_team_humano th 
      WHERE th.auth_uid = auth.uid()
    )
  )
);

-- Policy: Usuarios pueden crear roles
CREATE POLICY "Users can create roles"
ON adaptive_interface.monica_roles
FOR INSERT
WITH CHECK (created_by = auth.uid());

-- Policy: Usuarios pueden editar sus propios roles
CREATE POLICY "Users can update own roles"
ON adaptive_interface.monica_roles
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Policy: Usuarios pueden eliminar sus propios roles (soft delete recomendado)
CREATE POLICY "Users can delete own roles"
ON adaptive_interface.monica_roles
FOR DELETE
USING (created_by = auth.uid());

-- Policy: Favoritos - usuarios solo ven/gestionan los suyos
CREATE POLICY "Users manage own favorites"
ON adaptive_interface.monica_roles_favoritos
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- FUNCIÓN HELPER: Obtener roles disponibles para usuario
-- =====================================================
CREATE OR REPLACE FUNCTION adaptive_interface.get_available_roles(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  nombre text,
  slug text,
  descripcion text,
  avatar_url text,
  color_theme text,
  icono text,
  is_default boolean,
  is_favorite boolean,
  categoria text,
  usage_count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.nombre,
    r.slug,
    r.descripcion,
    r.avatar_url,
    r.color_theme,
    r.icono,
    r.is_default,
    (f.id IS NOT NULL) as is_favorite,
    r.categoria,
    r.usage_count
  FROM adaptive_interface.monica_roles r
  LEFT JOIN adaptive_interface.monica_roles_favoritos f 
    ON f.role_id = r.id AND f.user_id = p_user_id
  WHERE r.is_active = true
    AND (
      r.is_public = true 
      OR r.created_by = p_user_id
      OR r.empresa_id IN (
        SELECT th.empresa_id 
        FROM public.wp_team_humano th 
        WHERE th.auth_uid = p_user_id
      )
    )
  ORDER BY 
    r.is_default DESC,
    (f.id IS NOT NULL) DESC,
    r.usage_count DESC,
    r.nombre ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- =====================================================
COMMENT ON TABLE adaptive_interface.monica_roles IS 'Roles/Agentes personalizados de Monica AI - similar a GPTs o Gemas';
COMMENT ON COLUMN adaptive_interface.monica_roles.system_prompt IS 'Instrucciones del sistema que modifican el comportamiento de Monica';
COMMENT ON COLUMN adaptive_interface.monica_roles.tools_enabled IS 'Array de nombres de herramientas CRM habilitadas para este rol';
COMMENT ON COLUMN adaptive_interface.monica_roles.empresa_id IS 'NULL = rol público de Urpe Lab, valor = rol privado de empresa específica';
COMMENT ON COLUMN adaptive_interface.monica_roles.is_public IS 'true = visible para todos los usuarios, false = solo creador y empresa';
