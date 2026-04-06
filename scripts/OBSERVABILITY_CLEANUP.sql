-- ============================================
-- OBSERVABILITY LOG CLEANUP FUNCTIONS
-- Sistema de Limpieza Automática de Logs
-- ============================================

-- Function to clean up old logs based on retention period
CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(deleted_errors BIGINT, deleted_activities BIGINT, deleted_sessions BIGINT) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
  v_deleted_errors BIGINT;
  v_deleted_activities BIGINT;
  v_deleted_sessions BIGINT;
BEGIN
  -- Delete old error logs
  DELETE FROM wp_error_logs WHERE created_at < cutoff_date;
  GET DIAGNOSTICS v_deleted_errors = ROW_COUNT;
  
  -- Delete old activity logs
  DELETE FROM wp_actividades_log WHERE fecha_creacion < cutoff_date;
  GET DIAGNOSTICS v_deleted_activities = ROW_COUNT;
  
  -- Delete old session logs (if table exists)
  BEGIN
    DELETE FROM wp_sessions_log WHERE session_start < cutoff_date;
    GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    v_deleted_sessions := 0;
  END;
  
  -- Log the cleanup action
  INSERT INTO wp_actividades_log (tipo, accion, descripcion)
  VALUES ('sistema', 'eliminar', format('Limpieza automática: %s errores, %s actividades, %s sesiones eliminadas (retención: %s días)', 
    v_deleted_errors, v_deleted_activities, v_deleted_sessions, retention_days));
  
  RETURN QUERY SELECT v_deleted_errors, v_deleted_activities, v_deleted_sessions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Scheduled cleanup function for use with pg_cron or external schedulers
CREATE OR REPLACE FUNCTION scheduled_log_cleanup()
RETURNS void AS $$
BEGIN
  -- Default retention: 90 days for errors, 30 days for activities
  PERFORM cleanup_old_logs(90);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TABLE CREATION (if not exists)
-- ============================================

-- Error Logs Table (required for error-logger.ts)
CREATE TABLE IF NOT EXISTS wp_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  request_body TEXT,
  user_id TEXT,
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id),
  severity TEXT NOT NULL DEFAULT 'error',
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for error logs
ALTER TABLE wp_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "error_logs_insert" ON wp_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "error_logs_read" ON wp_error_logs
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()::text
    )
    OR empresa_id IS NULL
  );

-- System Alerts Table (for in-app alerts)
CREATE TABLE IF NOT EXISTS wp_system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT,
  context JSONB,
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id),
  user_id TEXT,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions Log Table
CREATE TABLE IF NOT EXISTS wp_sessions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  user_id TEXT,
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id),
  session_start TIMESTAMPTZ DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  duration_seconds INTEGER,
  page_views INTEGER DEFAULT 0,
  actions_count INTEGER DEFAULT 0,
  device_type TEXT,
  browser TEXT,
  ip_address TEXT,
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON wp_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON wp_error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_actividades_log_fecha ON wp_actividades_log(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_actividades_log_tipo ON wp_actividades_log(tipo);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON wp_system_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON wp_system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_sessions_log_start ON wp_sessions_log(session_start DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_log_user ON wp_sessions_log(user_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- System alerts - visible to all authenticated users
ALTER TABLE wp_system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_alerts_read" ON wp_system_alerts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_alerts_insert" ON wp_system_alerts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Sessions log - users can only see their own sessions
ALTER TABLE wp_sessions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_log_read" ON wp_sessions_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR empresa_id IN (
    SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()::text
  ));

CREATE POLICY "sessions_log_write" ON wp_sessions_log
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- USAGE NOTES
-- ============================================
-- 
-- To run cleanup manually:
--   SELECT * FROM cleanup_old_logs(90); -- 90 day retention
--
-- To schedule with pg_cron (if available):
--   SELECT cron.schedule('cleanup-logs', '0 3 * * 0', 'SELECT scheduled_log_cleanup()');
--
-- To call from n8n:
--   Use Supabase node with RPC call to cleanup_old_logs
--
