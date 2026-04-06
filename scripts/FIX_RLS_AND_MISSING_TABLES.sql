-- ============================================================================
-- FIX: RLS Policies and Missing Tables/RPCs (v6)
-- Ejecutar este script en Supabase SQL Editor para solucionar:
-- 1. RLS violation en wp_actividades_log
-- 2. RLS violation en wp_user_engagement_daily
-- 3. Tablas faltantes o incompletas: wp_error_logs, wp_system_alerts
-- 4. RPCs faltantes: get_retention_metrics, get_module_usage_stats
-- ============================================================================

-- ============================================================================
-- PASO 1: Fix wp_actividades_log
-- ============================================================================

DO $$
BEGIN
    -- Crear tabla si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wp_actividades_log' AND table_schema = 'public') THEN
        CREATE TABLE public.wp_actividades_log (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            tipo text NOT NULL,
            accion text NOT NULL,
            descripcion text,
            agente_id bigint REFERENCES public.wp_agentes(id),
            empresa_id bigint REFERENCES public.wp_empresa_perfil(id) ON DELETE CASCADE,
            contacto_id bigint REFERENCES public.wp_contactos(id),
            entidad_tipo text,
            datos_antes jsonb,
            datos_despues jsonb,
            fecha_creacion timestamp with time zone NOT NULL DEFAULT now(),
            usuario_id uuid,
            entidad_id text,
            ip_origen text,
            user_agent text,
            tipo_valido text
        );
        RAISE NOTICE 'Tabla wp_actividades_log creada';
    ELSE
        -- Asegurar columnas críticas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_actividades_log' AND column_name = 'empresa_id') THEN
            ALTER TABLE public.wp_actividades_log ADD COLUMN empresa_id bigint REFERENCES public.wp_empresa_perfil(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_actividades_log' AND column_name = 'usuario_id') THEN
            ALTER TABLE public.wp_actividades_log ADD COLUMN usuario_id uuid;
        END IF;
        RAISE NOTICE 'Columnas de wp_actividades_log verificadas';
    END IF;
END $$;

-- RLS y Políticas
ALTER TABLE public.wp_actividades_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "actividades_log_insert" ON public.wp_actividades_log;
    DROP POLICY IF EXISTS "actividades_log_select" ON public.wp_actividades_log;
    
    CREATE POLICY "actividades_log_insert" ON public.wp_actividades_log
        FOR INSERT TO authenticated WITH CHECK (true);
        
    CREATE POLICY "actividades_log_select" ON public.wp_actividades_log
        FOR SELECT TO authenticated
        USING (
            empresa_id IN (SELECT empresa_id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
            OR empresa_id IS NULL
            OR usuario_id = auth.uid()
        );
END $$;

DO $$ BEGIN RAISE NOTICE 'PASO 1: wp_actividades_log completado'; END $$;

-- ============================================================================
-- PASO 2: Fix wp_user_engagement / daily
-- ============================================================================

DO $$
BEGIN
    -- wp_user_engagement columnas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_user_engagement' AND column_name = 'empresa_id') THEN
        ALTER TABLE public.wp_user_engagement ADD COLUMN empresa_id bigint REFERENCES public.wp_empresa_perfil(id);
    END IF;
    
    -- wp_user_engagement_daily columnas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_user_engagement_daily' AND column_name = 'empresa_id') THEN
        ALTER TABLE public.wp_user_engagement_daily ADD COLUMN empresa_id bigint REFERENCES public.wp_empresa_perfil(id);
    END IF;
END $$;

ALTER TABLE public.wp_user_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_user_engagement_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "engagement_insert" ON public.wp_user_engagement;
    DROP POLICY IF EXISTS "engagement_select" ON public.wp_user_engagement;
    DROP POLICY IF EXISTS "daily_insert" ON public.wp_user_engagement_daily;
    DROP POLICY IF EXISTS "daily_select" ON public.wp_user_engagement_daily;
    DROP POLICY IF EXISTS "daily_update" ON public.wp_user_engagement_daily;

    CREATE POLICY "engagement_insert" ON public.wp_user_engagement
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "engagement_select" ON public.wp_user_engagement
        FOR SELECT TO authenticated USING (auth.uid() = user_id);
        
    CREATE POLICY "daily_insert" ON public.wp_user_engagement_daily
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "daily_select" ON public.wp_user_engagement_daily
        FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "daily_update" ON public.wp_user_engagement_daily
        FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

DO $$ BEGIN RAISE NOTICE 'PASO 2: Engagement RLS completado'; END $$;

-- ============================================================================
-- PASO 3: Fix wp_error_logs
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wp_error_logs' AND table_schema = 'public') THEN
        CREATE TABLE public.wp_error_logs (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            function_name text NOT NULL,
            error_message text,
            error_stack text,
            request_body text,
            empresa_id bigint REFERENCES public.wp_empresa_perfil(id),
            user_id uuid,
            created_at timestamp with time zone DEFAULT now()
        );
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_error_logs' AND column_name = 'empresa_id') THEN
            ALTER TABLE public.wp_error_logs ADD COLUMN empresa_id bigint REFERENCES public.wp_empresa_perfil(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_error_logs' AND column_name = 'user_id') THEN
            ALTER TABLE public.wp_error_logs ADD COLUMN user_id uuid;
        END IF;
    END IF;
END $$;

ALTER TABLE public.wp_error_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "error_logs_insert" ON public.wp_error_logs;
    DROP POLICY IF EXISTS "error_logs_read" ON public.wp_error_logs;
    
    CREATE POLICY "error_logs_insert" ON public.wp_error_logs
        FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "error_logs_read" ON public.wp_error_logs
        FOR SELECT TO authenticated
        USING (
            empresa_id IN (SELECT empresa_id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
            OR empresa_id IS NULL
            OR user_id = auth.uid()
        );
END $$;

DO $$ BEGIN RAISE NOTICE 'PASO 3: Error logs completado'; END $$;

-- ============================================================================
-- PASO 4: Fix wp_system_alerts
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wp_system_alerts' AND table_schema = 'public') THEN
        CREATE TABLE public.wp_system_alerts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            type text NOT NULL,
            severity text NOT NULL DEFAULT 'medium',
            title text NOT NULL,
            message text,
            context jsonb,
            empresa_id bigint REFERENCES public.wp_empresa_perfil(id),
            user_id uuid,
            dismissed_at timestamp with time zone,
            created_at timestamp with time zone DEFAULT now()
        );
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_system_alerts' AND column_name = 'empresa_id') THEN
            ALTER TABLE public.wp_system_alerts ADD COLUMN empresa_id bigint REFERENCES public.wp_empresa_perfil(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wp_system_alerts' AND column_name = 'user_id') THEN
            ALTER TABLE public.wp_system_alerts ADD COLUMN user_id uuid;
        END IF;
    END IF;
END $$;

ALTER TABLE public.wp_system_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "system_alerts_read" ON public.wp_system_alerts;
    DROP POLICY IF EXISTS "system_alerts_insert" ON public.wp_system_alerts;
    DROP POLICY IF EXISTS "system_alerts_update" ON public.wp_system_alerts;
    
    CREATE POLICY "system_alerts_read" ON public.wp_system_alerts
        FOR SELECT TO authenticated
        USING (
            user_id = auth.uid() 
            OR empresa_id IN (SELECT empresa_id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
            OR (user_id IS NULL AND empresa_id IS NULL)
        );
    CREATE POLICY "system_alerts_insert" ON public.wp_system_alerts
        FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "system_alerts_update" ON public.wp_system_alerts
        FOR UPDATE TO authenticated
        USING (
            user_id = auth.uid()
            OR empresa_id IN (SELECT empresa_id FROM public.wp_team_humano WHERE auth_uid = auth.uid())
        );
END $$;

DO $$ BEGIN RAISE NOTICE 'PASO 4: System alerts completado'; END $$;

-- ============================================================================
-- PASO 5: RPCs
-- ============================================================================

-- Limpiar versiones anteriores con firmas diferentes para evitar overloading
DROP FUNCTION IF EXISTS public.get_retention_metrics(BIGINT);
DROP FUNCTION IF EXISTS public.get_retention_metrics(BIGINT, INT);
DROP FUNCTION IF EXISTS public.get_retention_metrics(BIGINT, INT, BIGINT);

-- Función unificada: acepta AMBOS nombres de parámetro usados en el código
-- ObservabilityDashboard usa: { p_enterprise_id: null }
-- engagement-tracker usa:     { p_empresa_id: X, p_days: 30 }
CREATE OR REPLACE FUNCTION public.get_retention_metrics(
    p_empresa_id BIGINT DEFAULT NULL,
    p_days INT DEFAULT 30,
    p_enterprise_id BIGINT DEFAULT NULL
)
RETURNS TABLE (dau INT, wau INT, mau INT, retention_rate NUMERIC, avg_sessions_per_user NUMERIC, avg_modules_per_user NUMERIC) 
AS $$
DECLARE
    v_eid BIGINT;
BEGIN
    -- Unificar: usar p_empresa_id si viene, sino p_enterprise_id
    v_eid := COALESCE(p_empresa_id, p_enterprise_id);

    RETURN QUERY
    WITH daily_users AS (
        SELECT COUNT(DISTINCT user_id)::INT as cnt FROM public.wp_user_engagement_daily
        WHERE (v_eid IS NULL OR empresa_id = v_eid) AND date = CURRENT_DATE
    ),
    weekly_users AS (
        SELECT COUNT(DISTINCT user_id)::INT as cnt FROM public.wp_user_engagement_daily
        WHERE (v_eid IS NULL OR empresa_id = v_eid) AND date >= CURRENT_DATE - INTERVAL '7 days'
    ),
    monthly_users AS (
        SELECT COUNT(DISTINCT user_id)::INT as cnt FROM public.wp_user_engagement_daily
        WHERE (v_eid IS NULL OR empresa_id = v_eid) AND date >= CURRENT_DATE - INTERVAL '30 days'
    ),
    prev_week_users AS (
        SELECT DISTINCT user_id FROM public.wp_user_engagement_daily
        WHERE (v_eid IS NULL OR empresa_id = v_eid) AND date BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE - INTERVAL '7 days'
    ),
    curr_week_returning AS (
        SELECT COUNT(DISTINCT e.user_id)::INT as cnt FROM public.wp_user_engagement_daily e
        INNER JOIN prev_week_users p ON e.user_id = p.user_id
        WHERE (v_eid IS NULL OR e.empresa_id = v_eid) AND e.date >= CURRENT_DATE - INTERVAL '7 days'
    ),
    session_stats AS (
        SELECT 
            COALESCE(AVG(session_count), 0) as avg_sessions,
            COALESCE(AVG(COALESCE(array_length(modules_used, 1), 0)), 0) as avg_modules
        FROM public.wp_user_engagement_daily
        WHERE (v_eid IS NULL OR empresa_id = v_eid) AND date >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT 
        COALESCE((SELECT cnt FROM daily_users), 0)::INT,
        COALESCE((SELECT cnt FROM weekly_users), 0)::INT,
        COALESCE((SELECT cnt FROM monthly_users), 0)::INT,
        CASE WHEN (SELECT COUNT(*) FROM prev_week_users) > 0 
             THEN ROUND(((SELECT cnt FROM curr_week_returning)::NUMERIC / (SELECT COUNT(*) FROM prev_week_users)::NUMERIC) * 100, 1)
             ELSE 0 END,
        ROUND((SELECT avg_sessions FROM session_stats), 1),
        ROUND((SELECT avg_modules FROM session_stats), 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpiar versiones anteriores
DROP FUNCTION IF EXISTS public.get_module_usage_stats(BIGINT, INT);
DROP FUNCTION IF EXISTS public.get_module_usage_stats(BIGINT, INT, BIGINT);

-- Función unificada: acepta AMBOS nombres de parámetro
-- ObservabilityDashboard usa: { p_days: 7 }
-- engagement-tracker usa:     { p_empresa_id: X, p_days: N }
CREATE OR REPLACE FUNCTION public.get_module_usage_stats(
    p_empresa_id BIGINT DEFAULT NULL,
    p_days INT DEFAULT 7,
    p_enterprise_id BIGINT DEFAULT NULL
)
RETURNS TABLE (module VARCHAR, unique_users BIGINT, total_views BIGINT, total_actions BIGINT, usage_percentage NUMERIC) 
AS $$
DECLARE
    v_eid BIGINT;
BEGIN
    v_eid := COALESCE(p_empresa_id, p_enterprise_id);

    RETURN QUERY
    WITH module_stats AS (
        SELECT 
            e.module::VARCHAR as mod_name,
            COUNT(DISTINCT e.user_id) as users,
            COUNT(*) FILTER (WHERE e.event_type = 'page_view') as views,
            COUNT(*) FILTER (WHERE e.event_type = 'action') as actions
        FROM public.wp_user_engagement e
        WHERE (v_eid IS NULL OR e.empresa_id = v_eid) AND e.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY e.module
    ),
    total_users AS (
        SELECT COUNT(DISTINCT user_id) as cnt FROM public.wp_user_engagement
        WHERE (v_eid IS NULL OR empresa_id = v_eid) AND created_at >= NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT 
        ms.mod_name, ms.users, ms.views, ms.actions,
        CASE WHEN (SELECT cnt FROM total_users) > 0 
             THEN ROUND((ms.users::NUMERIC / (SELECT cnt FROM total_users)::NUMERIC) * 100, 1)
             ELSE 0 END
    FROM module_stats ms ORDER BY ms.users DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_retention_metrics(BIGINT, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_module_usage_stats(BIGINT, INT, BIGINT) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'PASO 5: RPCs completados'; END $$;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

DO $$
DECLARE
    v_count INT;
    v_rpc_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables 
    WHERE table_name IN ('wp_actividades_log', 'wp_user_engagement', 'wp_user_engagement_daily', 'wp_error_logs', 'wp_system_alerts')
    AND table_schema = 'public';
    
    SELECT COUNT(*) INTO v_rpc_count FROM information_schema.routines
    WHERE routine_name IN ('get_retention_metrics', 'get_module_usage_stats')
    AND routine_schema = 'public';
    
    RAISE NOTICE 'Resumen: % de 5 tablas listas, % de 2 RPCs listas', v_count, v_rpc_count;
END $$;
