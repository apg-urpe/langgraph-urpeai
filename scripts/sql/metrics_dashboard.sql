-- ============================================================================
-- metrics_dashboard.sql
--
-- Supabase RPC function for the URPE Events metrics dashboard.
-- Aggregates stats across wp_mensajes, wp_citas, debug_events, wp_contactos
-- and returns a SINGLE JSON payload.
--
-- Why: fetching millions of rows over REST is slow + hammers Supabase.
-- This function runs the aggregation server-side in Postgres (fast, indexed)
-- and transfers only the final small JSON result.
--
-- HOW TO INSTALL:
--   1. Open Supabase dashboard → SQL Editor
--   2. Paste this entire file
--   3. Run it (creates or replaces the function)
--
-- After install, GET /api/v1/debug/metrics?days=30 will call this via RPC.
--
-- RECOMMENDED INDEXES (run in SQL editor if not already present):
--   CREATE INDEX IF NOT EXISTS idx_wp_mensajes_ts_empresa
--     ON wp_mensajes(timestamp DESC, empresa_id);
--   CREATE INDEX IF NOT EXISTS idx_wp_citas_created_empresa
--     ON wp_citas(created_at DESC, empresa_id);
--   CREATE INDEX IF NOT EXISTS idx_debug_events_stage_created
--     ON debug_events(stage, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_wp_contactos_created_empresa
--     ON wp_contactos(created_at DESC, empresa_id);
-- ============================================================================

CREATE OR REPLACE FUNCTION metrics_dashboard(
  p_days INT DEFAULT 30,
  p_empresa_id INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_result JSONB;
BEGIN
  WITH
  -- ── Messages base set ───────────────────────────────────────────────────
  msg_base AS (
    SELECT
      remitente,
      timestamp,
      modelo_llm,
      CASE
        WHEN lower(remitente) = 'usuario' THEN 'inbound'
        WHEN lower(remitente) IN (
          'agente', 'asistente', 'agente_link',
          'agente_recontacto', 'agente_seguimiento'
        ) THEN 'ia'
        WHEN lower(remitente) IN (
          'asesor', 'humano', 'human in the loop',
          'asesor / human in the loop'
        ) THEN 'humano'
        WHEN lower(remitente) IN ('sistema', '/comando')
             OR lower(remitente) LIKE 'follow_up_%'
        THEN 'sistema'
        ELSE 'otro'
      END AS grp,
      date_trunc('day', timestamp)::DATE AS day,
      EXTRACT(HOUR FROM timestamp)::INT AS hr
    FROM wp_mensajes
    WHERE timestamp >= v_cutoff
      AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id)
  ),
  -- ── Debug events base sets ──────────────────────────────────────────────
  done_base AS (
    SELECT
      created_at,
      payload,
      payload->>'agent_name' AS agent_name,
      NULLIF(payload->>'model_used', '') AS model_used,
      NULLIF(payload->'timing'->>'total_ms', '')::NUMERIC AS total_ms,
      EXTRACT(HOUR FROM created_at)::INT AS hr,
      COALESCE(payload->'tools_used', '[]'::jsonb) AS tools_used
    FROM debug_events
    WHERE stage = 'run_agent_done'
      AND created_at >= v_cutoff
      AND (
        p_empresa_id IS NULL
        OR empresa_id = p_empresa_id
        OR NULLIF(payload->>'empresa_id', '')::INT = p_empresa_id
      )
  ),
  err_base AS (
    SELECT DISTINCT
      COALESCE(payload->>'message_id', payload->>'interaction_id') AS mid
    FROM debug_events
    WHERE stage IN ('inbound_error', 'error', 'exception', 'http_error')
      AND created_at >= v_cutoff
      AND (
        p_empresa_id IS NULL
        OR empresa_id = p_empresa_id
        OR NULLIF(payload->>'empresa_id', '')::INT = p_empresa_id
      )
  ),
  tool_flat AS (
    SELECT
      COALESCE(t->>'tool_name', 'unknown') AS tname,
      NULLIF(t->>'duration_ms', '')::NUMERIC AS dur_ms,
      COALESCE(t->>'status', 'ok') AS tstatus,
      d.agent_name,
      d.hr
    FROM done_base d,
         jsonb_array_elements(d.tools_used) AS t
    WHERE jsonb_typeof(d.tools_used) = 'array'
  ),
  -- ── Citas base ──────────────────────────────────────────────────────────
  cita_base AS (
    SELECT
      created_at,
      CASE
        WHEN lower(estado) IN ('cancelada', 'canceled') THEN 'cancelada'
        WHEN lower(estado) IN ('realizada', 'completada') THEN 'realizada'
        WHEN lower(estado) IN ('reagendada', 'reprogramada') THEN 'reagendada'
        WHEN lower(estado) IN ('no_asistio', 'no realizada') THEN 'no_asistio'
        ELSE lower(COALESCE(estado, 'desconocido'))
      END AS estado_norm,
      date_trunc('day', created_at)::DATE AS day
    FROM wp_citas
    WHERE created_at >= v_cutoff
      AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id)
  ),
  contact_base AS (
    SELECT created_at, date_trunc('day', created_at)::DATE AS day
    FROM wp_contactos
    WHERE created_at >= v_cutoff
      AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id)
  ),
  -- ── Scalars ─────────────────────────────────────────────────────────────
  msg_counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE grp = 'inbound') AS inbound,
      COUNT(*) FILTER (WHERE grp = 'ia')      AS ia,
      COUNT(*) FILTER (WHERE grp = 'humano')  AS humano,
      COUNT(*) FILTER (WHERE grp = 'sistema') AS sistema,
      COUNT(*) FILTER (WHERE grp = 'otro')    AS otro
    FROM msg_base
  ),
  perf_scalars AS (
    SELECT
      COUNT(*) AS total_interactions,
      ROUND(AVG(total_ms))::INT AS avg_ms,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY total_ms))::INT AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_ms))::INT AS p95_ms,
      ROUND(MIN(total_ms))::INT AS min_ms,
      ROUND(MAX(total_ms))::INT AS max_ms
    FROM done_base
    WHERE total_ms IS NOT NULL
  ),
  err_count AS (
    SELECT COUNT(*) AS errors FROM err_base WHERE mid IS NOT NULL
  )
  -- ── Final JSON assembly ─────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'period_days',  p_days,
    'empresa_id',   COALESCE(p_empresa_id, 0),
    'generated_at', NOW(),
    'truncated',    false,
    'diag',         jsonb_build_object('source', 'rpc'),

    'messages', jsonb_build_object(
      'total',   (SELECT total   FROM msg_counts),
      'inbound', (SELECT inbound FROM msg_counts),
      'ia',      (SELECT ia      FROM msg_counts),
      'humano',  (SELECT humano  FROM msg_counts),
      'sistema', (SELECT sistema FROM msg_counts),
      'otro',    (SELECT otro    FROM msg_counts),
      'by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'date',    to_char(d.day, 'YYYY-MM-DD'),
          'total',   COALESCE(sub.total,   0),
          'inbound', COALESCE(sub.inbound, 0),
          'ia',      COALESCE(sub.ia,      0),
          'humano',  COALESCE(sub.humano,  0),
          'sistema', COALESCE(sub.sistema, 0)
        ) ORDER BY d.day)
        FROM generate_series(
          (NOW() - (p_days || ' days')::INTERVAL)::DATE,
          NOW()::DATE,
          '1 day'::INTERVAL
        ) d(day)
        LEFT JOIN (
          SELECT
            day,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE grp = 'inbound') AS inbound,
            COUNT(*) FILTER (WHERE grp = 'ia')      AS ia,
            COUNT(*) FILTER (WHERE grp = 'humano')  AS humano,
            COUNT(*) FILTER (WHERE grp = 'sistema') AS sistema
          FROM msg_base GROUP BY day
        ) sub ON sub.day = d.day
      ), '[]'::jsonb),
      'by_model', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('model', modelo_llm, 'count', cnt) ORDER BY cnt DESC)
        FROM (
          SELECT modelo_llm, COUNT(*) AS cnt
          FROM msg_base
          WHERE modelo_llm IS NOT NULL AND modelo_llm <> ''
          GROUP BY modelo_llm
          ORDER BY cnt DESC
          LIMIT 20
        ) m
      ), '[]'::jsonb),
      'by_hour', COALESCE((
        SELECT jsonb_agg(COALESCE(sub.cnt, 0) ORDER BY h.n)
        FROM generate_series(0, 23) h(n)
        LEFT JOIN (SELECT hr, COUNT(*) AS cnt FROM msg_base GROUP BY hr) sub ON sub.hr = h.n
      ), '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb)
    ),

    'appointments', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM cita_base),
      'by_status', COALESCE((
        SELECT jsonb_object_agg(estado_norm, cnt)
        FROM (
          SELECT estado_norm, COUNT(*) AS cnt FROM cita_base GROUP BY estado_norm
        ) s
      ), '{}'::jsonb),
      'by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'date', to_char(d.day, 'YYYY-MM-DD'),
          'count', COALESCE(sub.cnt, 0)
        ) ORDER BY d.day)
        FROM generate_series(
          (NOW() - (p_days || ' days')::INTERVAL)::DATE,
          NOW()::DATE,
          '1 day'::INTERVAL
        ) d(day)
        LEFT JOIN (SELECT day, COUNT(*) AS cnt FROM cita_base GROUP BY day) sub ON sub.day = d.day
      ), '[]'::jsonb)
    ),

    'performance', jsonb_build_object(
      'total_interactions', COALESCE((SELECT total_interactions FROM perf_scalars), 0),
      'avg_ms',  (SELECT avg_ms  FROM perf_scalars),
      'p50_ms',  (SELECT p50_ms  FROM perf_scalars),
      'p95_ms',  (SELECT p95_ms  FROM perf_scalars),
      'min_ms',  (SELECT min_ms  FROM perf_scalars),
      'max_ms',  (SELECT max_ms  FROM perf_scalars),
      'errors',  (SELECT errors  FROM err_count),
      'error_rate', (
        SELECT CASE
          WHEN (SELECT inbound FROM msg_counts) > 0 THEN
            ROUND((SELECT errors FROM err_count)::NUMERIC
                  / (SELECT inbound FROM msg_counts)::NUMERIC * 100, 1)
          WHEN (SELECT total_interactions FROM perf_scalars) > 0 THEN
            ROUND((SELECT errors FROM err_count)::NUMERIC
                  / (SELECT total_interactions FROM perf_scalars)::NUMERIC * 100, 1)
          ELSE 0
        END
      ),
      'by_agent', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'agent', agent_name, 'count', cnt, 'avg_ms', ROUND(avg_dur)::INT
        ) ORDER BY cnt DESC)
        FROM (
          SELECT agent_name, COUNT(*) AS cnt, AVG(total_ms) AS avg_dur
          FROM done_base
          WHERE agent_name IS NOT NULL AND total_ms IS NOT NULL
          GROUP BY agent_name
          ORDER BY cnt DESC
          LIMIT 20
        ) a
      ), '[]'::jsonb),
      'by_model', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'model', model_used, 'count', cnt, 'avg_ms', ROUND(avg_dur)::INT
        ) ORDER BY cnt DESC)
        FROM (
          SELECT model_used, COUNT(*) AS cnt, AVG(total_ms) AS avg_dur
          FROM done_base
          WHERE model_used IS NOT NULL AND total_ms IS NOT NULL
          GROUP BY model_used
          ORDER BY cnt DESC
          LIMIT 20
        ) m
      ), '[]'::jsonb),
      'by_hour', COALESCE((
        SELECT jsonb_agg(COALESCE(sub.cnt, 0) ORDER BY h.n)
        FROM generate_series(0, 23) h(n)
        LEFT JOIN (SELECT hr, COUNT(*) AS cnt FROM done_base GROUP BY hr) sub ON sub.hr = h.n
      ), '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb)
    ),

    'tools', jsonb_build_object(
      'total_executions', (SELECT COUNT(*) FROM tool_flat),
      'unique_tools',     (SELECT COUNT(DISTINCT tname) FROM tool_flat),
      'by_tool', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'tool',   tname,
          'count',  cnt,
          'errors', err_cnt,
          'avg_ms', ROUND(avg_dur)::INT
        ) ORDER BY cnt DESC)
        FROM (
          SELECT tname,
                 COUNT(*) AS cnt,
                 COUNT(*) FILTER (WHERE tstatus = 'error') AS err_cnt,
                 AVG(dur_ms) AS avg_dur
          FROM tool_flat
          GROUP BY tname
          ORDER BY cnt DESC
          LIMIT 30
        ) t
      ), '[]'::jsonb),
      'by_hour', COALESCE((
        SELECT jsonb_agg(COALESCE(sub.cnt, 0) ORDER BY h.n)
        FROM generate_series(0, 23) h(n)
        LEFT JOIN (SELECT hr, COUNT(*) AS cnt FROM tool_flat GROUP BY hr) sub ON sub.hr = h.n
      ), '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb),
      'by_agent', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'agent', agent_name,
          'total', total_cnt,
          'tools', tools_arr
        ) ORDER BY total_cnt DESC)
        FROM (
          SELECT
            agent_name,
            SUM(tc) AS total_cnt,
            jsonb_agg(jsonb_build_object('name', tname, 'count', tc) ORDER BY tc DESC) AS tools_arr
          FROM (
            SELECT agent_name, tname, COUNT(*) AS tc
            FROM tool_flat
            WHERE agent_name IS NOT NULL
            GROUP BY agent_name, tname
          ) inner_q
          GROUP BY agent_name
          ORDER BY total_cnt DESC
          LIMIT 10
        ) a
      ), '[]'::jsonb)
    ),

    'contacts', jsonb_build_object(
      'new_total', (SELECT COUNT(*) FROM contact_base),
      'by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'date', to_char(d.day, 'YYYY-MM-DD'),
          'count', COALESCE(sub.cnt, 0)
        ) ORDER BY d.day)
        FROM generate_series(
          (NOW() - (p_days || ' days')::INTERVAL)::DATE,
          NOW()::DATE,
          '1 day'::INTERVAL
        ) d(day)
        LEFT JOIN (SELECT day, COUNT(*) AS cnt FROM contact_base GROUP BY day) sub ON sub.day = d.day
      ), '[]'::jsonb)
    ),

    'empresas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'nombre', COALESCE(NULLIF(nombre, ''), 'Empresa ' || id)
      ) ORDER BY COALESCE(nombre, ''))
      FROM (SELECT id, nombre FROM wp_empresa_perfil ORDER BY COALESCE(nombre, '') LIMIT 200) e
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute to the role Supabase uses for API requests.
-- (service_role is what we call from the backend with SUPABASE_SERVICE_KEY.)
GRANT EXECUTE ON FUNCTION metrics_dashboard(INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION metrics_dashboard(INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION metrics_dashboard(INT, INT) TO authenticated;
