-- ============================================================================
-- ENGAGEMENT TRACKING SCHEMA
-- Sistema de métricas de adopción y uso de la aplicación
-- ============================================================================

-- Tabla principal: Eventos de engagement del usuario
CREATE TABLE IF NOT EXISTS wp_user_engagement (
  id BIGSERIAL PRIMARY KEY,
  
  -- Usuario y empresa
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_humano_id BIGINT REFERENCES wp_team_humano(id) ON DELETE SET NULL,
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  
  -- Evento
  event_type VARCHAR(50) NOT NULL, -- 'page_view', 'action', 'feature_use', 'session_start', 'session_end'
  event_name VARCHAR(100) NOT NULL, -- 'contacts.view', 'contact.create', 'chat.send_message', etc.
  
  -- Contexto del módulo
  module VARCHAR(50) NOT NULL, -- 'dashboard', 'contacts', 'calendar', 'chat', 'tasks', 'marketing', 'team', 'observability'
  sub_module VARCHAR(50), -- 'funnel_view', 'detail_panel', etc.
  
  -- Metadata del evento
  metadata JSONB DEFAULT '{}'::jsonb, -- Datos adicionales (contactId, duration, etc.)
  
  -- Sesión
  session_id VARCHAR(100), -- Para agrupar eventos por sesión
  
  -- Device info
  device_type VARCHAR(20), -- 'mobile', 'tablet', 'desktop'
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Índices para queries eficientes
  CONSTRAINT valid_event_type CHECK (event_type IN ('page_view', 'action', 'feature_use', 'session_start', 'session_end'))
);

-- Índices para queries de analytics
CREATE INDEX IF NOT EXISTS idx_engagement_user_date ON wp_user_engagement(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_empresa_date ON wp_user_engagement(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_module ON wp_user_engagement(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_event ON wp_user_engagement(event_type, event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_session ON wp_user_engagement(session_id, created_at);

-- Tabla de resumen diario por usuario (para queries rápidas)
CREATE TABLE IF NOT EXISTS wp_user_engagement_daily (
  id BIGSERIAL PRIMARY KEY,
  
  -- Identificadores
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Métricas agregadas del día
  total_events INT DEFAULT 0,
  total_page_views INT DEFAULT 0,
  total_actions INT DEFAULT 0,
  session_count INT DEFAULT 0,
  total_duration_seconds INT DEFAULT 0, -- Tiempo total en app
  
  -- Módulos usados (array de nombres)
  modules_used TEXT[] DEFAULT '{}',
  
  -- Features usadas
  features_used TEXT[] DEFAULT '{}',
  
  -- Primera y última actividad del día
  first_activity_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_engagement_daily_user ON wp_user_engagement_daily(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_daily_empresa ON wp_user_engagement_daily(empresa_id, date DESC);

-- Tabla de resumen por módulo (para entender adoption)
CREATE TABLE IF NOT EXISTS wp_module_usage_daily (
  id BIGSERIAL PRIMARY KEY,
  
  empresa_id BIGINT REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  module VARCHAR(50) NOT NULL,
  
  -- Métricas
  unique_users INT DEFAULT 0,
  total_views INT DEFAULT 0,
  total_actions INT DEFAULT 0,
  avg_time_seconds INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(empresa_id, date, module)
);

CREATE INDEX IF NOT EXISTS idx_module_usage_empresa ON wp_module_usage_daily(empresa_id, date DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE wp_user_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_user_engagement_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_module_usage_daily ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden ver sus propios eventos
DROP POLICY IF EXISTS "Users can view own engagement" ON wp_user_engagement;
CREATE POLICY "Users can view own engagement" ON wp_user_engagement
  FOR SELECT USING (auth.uid() = user_id);

-- Los usuarios pueden insertar sus propios eventos
DROP POLICY IF EXISTS "Users can insert own engagement" ON wp_user_engagement;
CREATE POLICY "Users can insert own engagement" ON wp_user_engagement
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Daily summaries - users see their own
DROP POLICY IF EXISTS "Users can view own daily summary" ON wp_user_engagement_daily;
CREATE POLICY "Users can view own daily summary" ON wp_user_engagement_daily
  FOR SELECT USING (auth.uid() = user_id);

-- Module usage - visible to enterprise members (for admin views)
DROP POLICY IF EXISTS "Enterprise members can view module usage" ON wp_module_usage_daily;
CREATE POLICY "Enterprise members can view module usage" ON wp_module_usage_daily
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid()
    )
  );

-- ============================================================================
-- FUNCIÓN: Actualizar resumen diario (llamar después de cada evento)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_engagement_daily_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wp_user_engagement_daily (
    user_id,
    empresa_id,
    date,
    total_events,
    total_page_views,
    total_actions,
    session_count,
    modules_used,
    features_used,
    first_activity_at,
    last_activity_at
  )
  VALUES (
    NEW.user_id,
    NEW.empresa_id,
    DATE(NEW.created_at),
    1,
    CASE WHEN NEW.event_type = 'page_view' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'action' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'session_start' THEN 1 ELSE 0 END,
    ARRAY[NEW.module],
    CASE WHEN NEW.event_name IS NOT NULL THEN ARRAY[NEW.event_name] ELSE '{}' END,
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    total_events = wp_user_engagement_daily.total_events + 1,
    total_page_views = wp_user_engagement_daily.total_page_views + 
      CASE WHEN NEW.event_type = 'page_view' THEN 1 ELSE 0 END,
    total_actions = wp_user_engagement_daily.total_actions + 
      CASE WHEN NEW.event_type = 'action' THEN 1 ELSE 0 END,
    session_count = wp_user_engagement_daily.session_count + 
      CASE WHEN NEW.event_type = 'session_start' THEN 1 ELSE 0 END,
    modules_used = ARRAY(
      SELECT DISTINCT unnest(
        array_cat(wp_user_engagement_daily.modules_used, ARRAY[NEW.module])
      )
    ),
    features_used = ARRAY(
      SELECT DISTINCT unnest(
        array_cat(wp_user_engagement_daily.features_used, 
          CASE WHEN NEW.event_name IS NOT NULL THEN ARRAY[NEW.event_name] ELSE '{}' END)
      )
    ),
    last_activity_at = NEW.created_at,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar resumen automáticamente
DROP TRIGGER IF EXISTS trg_update_engagement_daily ON wp_user_engagement;
CREATE TRIGGER trg_update_engagement_daily
  AFTER INSERT ON wp_user_engagement
  FOR EACH ROW
  EXECUTE FUNCTION update_engagement_daily_summary();

-- ============================================================================
-- FUNCIÓN: Calcular métricas de retención
-- ============================================================================

CREATE OR REPLACE FUNCTION get_retention_metrics(
  p_empresa_id BIGINT,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  dau INT,           -- Daily Active Users (hoy)
  wau INT,           -- Weekly Active Users (últimos 7 días)
  mau INT,           -- Monthly Active Users (últimos 30 días)
  retention_rate NUMERIC, -- % de usuarios que volvieron esta semana vs anterior
  avg_sessions_per_user NUMERIC,
  avg_modules_per_user NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH date_ranges AS (
    SELECT 
      CURRENT_DATE as today,
      CURRENT_DATE - INTERVAL '7 days' as week_ago,
      CURRENT_DATE - INTERVAL '30 days' as month_ago,
      CURRENT_DATE - INTERVAL '14 days' as two_weeks_ago
  ),
  daily_users AS (
    SELECT COUNT(DISTINCT user_id) as cnt
    FROM wp_user_engagement_daily
    WHERE empresa_id = p_empresa_id
      AND date = CURRENT_DATE
  ),
  weekly_users AS (
    SELECT COUNT(DISTINCT user_id) as cnt
    FROM wp_user_engagement_daily
    WHERE empresa_id = p_empresa_id
      AND date >= CURRENT_DATE - INTERVAL '7 days'
  ),
  monthly_users AS (
    SELECT COUNT(DISTINCT user_id) as cnt
    FROM wp_user_engagement_daily
    WHERE empresa_id = p_empresa_id
      AND date >= CURRENT_DATE - INTERVAL '30 days'
  ),
  prev_week_users AS (
    SELECT DISTINCT user_id
    FROM wp_user_engagement_daily
    WHERE empresa_id = p_empresa_id
      AND date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '7 days'
  ),
  curr_week_returning AS (
    SELECT COUNT(DISTINCT e.user_id) as cnt
    FROM wp_user_engagement_daily e
    INNER JOIN prev_week_users p ON e.user_id = p.user_id
    WHERE e.empresa_id = p_empresa_id
      AND e.date >= CURRENT_DATE - INTERVAL '7 days'
  ),
  session_stats AS (
    SELECT 
      COALESCE(AVG(session_count), 0) as avg_sessions,
      COALESCE(AVG(array_length(modules_used, 1)), 0) as avg_modules
    FROM wp_user_engagement_daily
    WHERE empresa_id = p_empresa_id
      AND date >= CURRENT_DATE - INTERVAL '30 days'
  )
  SELECT 
    (SELECT cnt FROM daily_users)::INT as dau,
    (SELECT cnt FROM weekly_users)::INT as wau,
    (SELECT cnt FROM monthly_users)::INT as mau,
    CASE 
      WHEN (SELECT COUNT(*) FROM prev_week_users) > 0 
      THEN ROUND(((SELECT cnt FROM curr_week_returning)::NUMERIC / (SELECT COUNT(*) FROM prev_week_users)::NUMERIC) * 100, 1)
      ELSE 0 
    END as retention_rate,
    ROUND((SELECT avg_sessions FROM session_stats), 1) as avg_sessions_per_user,
    ROUND((SELECT avg_modules FROM session_stats), 1) as avg_modules_per_user;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCIÓN: Obtener uso por módulo
-- ============================================================================

CREATE OR REPLACE FUNCTION get_module_usage_stats(
  p_empresa_id BIGINT,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  module VARCHAR,
  unique_users BIGINT,
  total_views BIGINT,
  total_actions BIGINT,
  usage_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH module_stats AS (
    SELECT 
      e.module,
      COUNT(DISTINCT e.user_id) as users,
      COUNT(*) FILTER (WHERE e.event_type = 'page_view') as views,
      COUNT(*) FILTER (WHERE e.event_type = 'action') as actions
    FROM wp_user_engagement e
    WHERE e.empresa_id = p_empresa_id
      AND e.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY e.module
  ),
  total_users AS (
    SELECT COUNT(DISTINCT user_id) as cnt
    FROM wp_user_engagement
    WHERE empresa_id = p_empresa_id
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
  )
  SELECT 
    ms.module,
    ms.users,
    ms.views,
    ms.actions,
    CASE 
      WHEN (SELECT cnt FROM total_users) > 0 
      THEN ROUND((ms.users::NUMERIC / (SELECT cnt FROM total_users)::NUMERIC) * 100, 1)
      ELSE 0 
    END as usage_pct
  FROM module_stats ms
  ORDER BY ms.users DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON TABLE wp_user_engagement IS 'Eventos de engagement individual del usuario para tracking de adopción';
COMMENT ON TABLE wp_user_engagement_daily IS 'Resumen diario de engagement por usuario para queries rápidas';
COMMENT ON TABLE wp_module_usage_daily IS 'Uso de módulos por empresa por día';
COMMENT ON FUNCTION get_retention_metrics IS 'Calcula DAU/WAU/MAU y tasa de retención';
COMMENT ON FUNCTION get_module_usage_stats IS 'Obtiene estadísticas de uso por módulo';
