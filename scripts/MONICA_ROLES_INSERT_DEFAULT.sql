-- =====================================================
-- INSERT: Monica Default Role
-- Ejecutar DESPUÉS de MONICA_ROLES_SCHEMA.sql
-- =====================================================

-- Primero obtener un UUID de usuario admin para created_by
-- Puedes reemplazar este UUID con el de tu usuario admin
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Buscar un usuario admin (puedes ajustar la query según tu sistema)
  SELECT id INTO admin_user_id 
  FROM auth.users 
  LIMIT 1;

  -- Insertar el rol Monica Default si no existe
  INSERT INTO adaptive_interface.monica_roles (
    nombre,
    slug,
    descripcion,
    system_prompt,
    welcome_message,
    temperatura,
    max_tokens,
    tools_enabled,
    avatar_url,
    color_theme,
    icono,
    created_by,
    empresa_id,
    is_public,
    is_default,
    is_active,
    categoria,
    tags
  ) VALUES (
    'Monica',
    'monica-default',
    'Asistente IA general de Urpe AI Lab con acceso completo al CRM',
    'Eres Monica, Asistente IA de Urpe AI Lab.

## Capacidades
Tienes acceso a herramientas para consultar datos del CRM en tiempo real:
- **Contactos**: Buscar, filtrar y ver detalles de contactos
- **🔍 Búsqueda Profunda**: Busca contactos en TODAS las fuentes (nombre, mensajes, notas, metadata)
- **Citas**: Ver agenda, próximas citas, historial de citas y actualizar estados
- **Conversaciones**: Ver chats de WhatsApp, buscar en mensajes
- **Equipo**: Ver miembros del equipo y sus roles
- **Embudo**: Ver etapas del embudo y estadísticas
- **Métricas**: Obtener KPIs y métricas del negocio
- **Tareas**: Ver tareas pendientes y completadas
- **Notas**: Ver y crear notas de contactos

## Instrucciones Generales
- Usa las herramientas cuando el usuario pregunte por datos específicos
- Responde en español, de forma concisa y útil
- Usa Markdown para texto y UI blocks para datos estructurados
- Si no encuentras datos, indica claramente que no hay resultados',
    '¡Hola! Soy Monica, tu asistente de Urpe AI Lab. ¿En qué puedo ayudarte hoy?',
    0.7,
    4096,
    ARRAY[
      'get_contacts',
      'get_contact_details',
      'get_appointments',
      'update_appointment_status',
      'get_conversations',
      'search_messages',
      'get_team_members',
      'get_funnel_stages',
      'get_funnel_stats',
      'get_metrics',
      'get_tasks',
      'get_contact_notes',
      'create_note',
      'search_contacts_deep'
    ]::text[],
    NULL,
    'cyan',
    'Sparkles',
    admin_user_id,
    NULL, -- Público (Urpe Lab)
    true, -- is_public
    true, -- is_default
    true, -- is_active
    'general',
    ARRAY['default', 'crm', 'general']::text[]
  )
  ON CONFLICT (slug) DO NOTHING;

  RAISE NOTICE 'Monica Default role created with user_id: %', admin_user_id;
END $$;

-- Verificar que se creó correctamente
SELECT id, nombre, slug, is_default, is_public, created_at 
FROM adaptive_interface.monica_roles 
WHERE slug = 'monica-default';
