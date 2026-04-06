-- ============================================================================
-- FIX ADAPTIVE_INTERFACE RLS Y PERMISOS
-- ============================================================================
-- Ejecutar este script si hay errores de "relation does not exist" o problemas
-- de acceso a las tablas del schema adaptive_interface
-- ============================================================================

-- 1. Verificar que el schema existe
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'adaptive_interface';

-- 2. Verificar estado RLS actual (debería mostrar 'true' para todas)
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'adaptive_interface';

-- 3. Habilitar RLS en TODAS las tablas (idempotente)
ALTER TABLE adaptive_interface.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.contexto_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.monica_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.monica_roles_favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptive_interface.user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Políticas para user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON adaptive_interface.user_profiles;
CREATE POLICY "Users can view own profile" ON adaptive_interface.user_profiles
  FOR ALL USING (id = auth.uid());

-- 5. Políticas para chat_sessions
DROP POLICY IF EXISTS "Users can manage own sessions" ON adaptive_interface.chat_sessions;
CREATE POLICY "Users can manage own sessions" ON adaptive_interface.chat_sessions
  FOR ALL USING (user_id = auth.uid());

-- 6. Políticas para chat_messages
DROP POLICY IF EXISTS "Users can manage own messages" ON adaptive_interface.chat_messages;
CREATE POLICY "Users can manage own messages" ON adaptive_interface.chat_messages
  FOR ALL USING (user_id = auth.uid());

-- 7. Políticas para activity_logs
DROP POLICY IF EXISTS "Users can view own logs" ON adaptive_interface.activity_logs;
CREATE POLICY "Users can view own logs" ON adaptive_interface.activity_logs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert logs" ON adaptive_interface.activity_logs;
CREATE POLICY "Users can insert logs" ON adaptive_interface.activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 8. Políticas para contexto_usuario
DROP POLICY IF EXISTS "Users can manage own context" ON adaptive_interface.contexto_usuario;
CREATE POLICY "Users can manage own context" ON adaptive_interface.contexto_usuario
  FOR ALL USING (user_id = auth.uid());

-- 9. Políticas para monica_roles
DROP POLICY IF EXISTS "Users can view public or own roles" ON adaptive_interface.monica_roles;
CREATE POLICY "Users can view public or own roles" ON adaptive_interface.monica_roles
  FOR SELECT USING (is_public = true OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users can manage own roles" ON adaptive_interface.monica_roles;
CREATE POLICY "Users can manage own roles" ON adaptive_interface.monica_roles
  FOR ALL USING (created_by = auth.uid());

-- 10. Políticas para monica_roles_favoritos
DROP POLICY IF EXISTS "Users can manage own favorites" ON adaptive_interface.monica_roles_favoritos;
CREATE POLICY "Users can manage own favorites" ON adaptive_interface.monica_roles_favoritos
  FOR ALL USING (user_id = auth.uid());

-- 11. Políticas para user_settings
DROP POLICY IF EXISTS "Users can manage own settings" ON adaptive_interface.user_settings;
CREATE POLICY "Users can manage own settings" ON adaptive_interface.user_settings
  FOR ALL USING (user_id = auth.uid());

-- 12. Permisos de acceso al schema
GRANT USAGE ON SCHEMA adaptive_interface TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA adaptive_interface TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA adaptive_interface TO authenticated;

-- 13. Forzar recarga de PostgREST (CRÍTICO para Supabase)
NOTIFY pgrst, 'reload schema';
