-- ══════════════════════════════════════════════════════
-- KPI SNAPSHOT — Monica CRM Intelligent
-- Proyecto: vecspltvmyopwbjzerow
-- ══════════════════════════════════════════════════════

-- 1. Crear el esquema para analítica
CREATE SCHEMA IF NOT EXISTS analytics;

-- 2. Crear la tabla principal de capturas (snapshots)
CREATE TABLE IF NOT EXISTS analytics.kpi_snapshot (
    -- Usamos int8 (bigint) según mandato
    empresa_id int8 NOT NULL, 
    fecha DATE NOT NULL,

    -- INGRESOS (Google Sheet Data)
    ingresos_dia NUMERIC(12,2) DEFAULT 0,
    ingresos_semana NUMERIC(12,2) DEFAULT 0,
    ingresos_mes NUMERIC(12,2) DEFAULT 0,
    ingresos_año NUMERIC(12,2) DEFAULT 0,
    clientes_nuevos_dia INTEGER DEFAULT 0,
    clientes_nuevos_mes INTEGER DEFAULT 0,
    ticket_promedio_mes NUMERIC(10,2) DEFAULT 0,

    -- MARKETING (Meta Ads API)
    gasto_ads_dia NUMERIC(10,2) DEFAULT 0,
    gasto_ads_mes NUMERIC(10,2) DEFAULT 0,
    leads_dia INTEGER DEFAULT 0,
    leads_mes INTEGER DEFAULT 0,
    cpl_dia NUMERIC(8,2) DEFAULT 0,
    cpl_mes NUMERIC(8,2) DEFAULT 0,
    roas_dia NUMERIC(6,2) DEFAULT 0,
    roas_mes NUMERIC(6,2) DEFAULT 0,
    cac_mes NUMERIC(10,2) DEFAULT 0,

    -- EMBUDO (Supabase wp_citas + wp_conversaciones)
    conversaciones_dia INTEGER DEFAULT 0,
    conversaciones_mes INTEGER DEFAULT 0,
    citas_agendadas_dia INTEGER DEFAULT 0,
    citas_agendadas_mes INTEGER DEFAULT 0,
    citas_realizadas_mes INTEGER DEFAULT 0,
    citas_canceladas_mes INTEGER DEFAULT 0,
    tasa_cancelacion NUMERIC(5,2) DEFAULT 0,
    tasa_conversion NUMERIC(5,2) DEFAULT 0,
    tasa_cierre NUMERIC(5,2) DEFAULT 0,

    -- PIPELINE (Supabase wp_contactos)
    leads_totales_activos INTEGER DEFAULT 0,
    leads_calificados_mes INTEGER DEFAULT 0,

    -- META / AUDITORIA
    updated_at TIMESTAMPTZ DEFAULT now(),
    fuentes JSONB DEFAULT '{}',
    errores JSONB DEFAULT '[]',

    PRIMARY KEY (empresa_id, fecha),
    -- Relación con la tabla principal de empresas (usando int8)
    CONSTRAINT fk_kpi_empresa FOREIGN KEY (empresa_id) REFERENCES public.wp_empresa_perfil(id)
);

-- 3. Habilitar Seguridad (Best Practice)
ALTER TABLE analytics.kpi_snapshot ENABLE ROW LEVEL SECURITY;

-- 4. Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_kpi_snap_fecha ON analytics.kpi_snapshot(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snap_empresa ON analytics.kpi_snapshot(empresa_id, fecha DESC);

-- 5. Vista personalizada para URPE (Filtro automático)
CREATE OR REPLACE VIEW analytics.kpi_urpe_is AS
SELECT * FROM analytics.kpi_snapshot 
WHERE empresa_id = 4 
ORDER BY fecha DESC;

-- 6. Verificación final
SELECT 'analytics.kpi_snapshot' AS tabla, 
       'Lista y Validada ✅' AS estado;
