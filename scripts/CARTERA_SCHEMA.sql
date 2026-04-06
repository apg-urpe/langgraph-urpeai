-- ==============================================================================
-- ESQUEMA DE GESTIÓN DE CARTERA Y SERVICIOS (CRM FINANCIERO)
-- ==============================================================================

-- 1. TABLA DE SERVICIOS CONTRATADOS
-- Representa una venta, contrato o servicio adquirido por un contacto.
CREATE TABLE IF NOT EXISTS wp_crm_servicios (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL,
    contacto_id BIGINT NOT NULL,
    
    -- Detalles del Servicio
    nombre_servicio TEXT NOT NULL,
    tipo_servicio TEXT DEFAULT 'general', -- 'consultoria', 'suscripcion', 'implementacion', etc.
    descripcion TEXT,
    
    -- Valores Financieros
    moneda VARCHAR(10) DEFAULT 'USD',
    valor_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    saldo_pagado DECIMAL(15, 2) NOT NULL DEFAULT 0,
    -- saldo_pendiente se puede calcular, pero persistirlo ayuda en queries rápidas
    saldo_pendiente DECIMAL(15, 2) GENERATED ALWAYS AS (valor_total - saldo_pagado) STORED,
    cuota_mensual DECIMAL(15, 2),
    
    -- Estado y Fechas
    estado VARCHAR(20) DEFAULT 'activo', -- 'activo', 'finalizado', 'cancelado', 'pendiente_pago'
    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_fin TIMESTAMP WITH TIME ZONE,
    dia_compromiso_pago SMALLINT,
    
    -- Documentación
    contrato_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT, -- Link a wp_team_humano
    
    -- Constraints
    CONSTRAINT chk_servicios_cuota_mensual CHECK (cuota_mensual IS NULL OR cuota_mensual >= 0),
    CONSTRAINT chk_servicios_dia_compromiso_pago CHECK (dia_compromiso_pago IS NULL OR dia_compromiso_pago BETWEEN 1 AND 31),
    CONSTRAINT fk_servicios_empresa FOREIGN KEY (empresa_id) REFERENCES wp_empresa_perfil(id),
    CONSTRAINT fk_servicios_contacto FOREIGN KEY (contacto_id) REFERENCES wp_contactos(id) ON DELETE CASCADE
);

-- Indices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_servicios_contacto ON wp_crm_servicios(contacto_id);
CREATE INDEX IF NOT EXISTS idx_servicios_empresa ON wp_crm_servicios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_servicios_estado ON wp_crm_servicios(estado);

-- 2. TABLA DE PAGOS / TRANSACCIONES
-- Registra los abonos realizados a un servicio específico.
CREATE TABLE IF NOT EXISTS wp_crm_pagos (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL,
    servicio_id BIGINT NOT NULL,
    contacto_id BIGINT NOT NULL, -- Redundante pero útil para queries directas de "pagos del cliente"
    
    -- Detalles del Pago
    monto DECIMAL(15, 2) NOT NULL,
    moneda VARCHAR(10) DEFAULT 'USD',
    fecha_pago TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metodo_pago VARCHAR(50), -- 'transferencia', 'tarjeta', 'efectivo', 'yape', 'plin', etc.
    referencia TEXT, -- Nro de operación, código de transacción
    
    -- Estado del Pago
    estado VARCHAR(20) DEFAULT 'confirmado', -- 'confirmado', 'pendiente', 'rechazado', 'anulado'
    nota TEXT,
    
    -- Comprobante
    comprobante_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    registrado_por BIGINT, -- Link a wp_team_humano
    
    -- Constraints
    CONSTRAINT fk_pagos_empresa FOREIGN KEY (empresa_id) REFERENCES wp_empresa_perfil(id),
    CONSTRAINT fk_pagos_servicio FOREIGN KEY (servicio_id) REFERENCES wp_crm_servicios(id) ON DELETE CASCADE,
    CONSTRAINT fk_pagos_contacto FOREIGN KEY (contacto_id) REFERENCES wp_contactos(id)
);

CREATE INDEX IF NOT EXISTS idx_pagos_servicio ON wp_crm_pagos(servicio_id);
CREATE INDEX IF NOT EXISTS idx_pagos_contacto ON wp_crm_pagos(contacto_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON wp_crm_pagos(fecha_pago);

-- 3. TRIGGER PARA ACTUALIZAR SALDOS
-- Actualiza automáticamente el saldo_pagado en el servicio cuando se registra un pago confirmado.

CREATE OR REPLACE FUNCTION update_servicio_saldo()
RETURNS TRIGGER AS $$
DECLARE
    v_servicio_id BIGINT;
BEGIN
    v_servicio_id := COALESCE(NEW.servicio_id, OLD.servicio_id);

    -- Recalcular el total pagado para el servicio afectado
    -- Se consideran solo pagos 'confirmado'
    WITH total_pagos AS (
        SELECT COALESCE(SUM(monto), 0) as total
        FROM wp_crm_pagos
        WHERE servicio_id = v_servicio_id
        AND estado = 'confirmado'
    )
    UPDATE wp_crm_servicios
    SET saldo_pagado = (SELECT total FROM total_pagos),
        updated_at = NOW()
    WHERE id = v_servicio_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on Insert/Update/Delete
DROP TRIGGER IF EXISTS trg_update_saldo_pagos ON wp_crm_pagos;

CREATE TRIGGER trg_update_saldo_pagos
AFTER INSERT OR UPDATE OR DELETE ON wp_crm_pagos
FOR EACH ROW
EXECUTE FUNCTION update_servicio_saldo();

-- 4. POLÍTICAS DE SEGURIDAD (RLS)
-- Asegurar aislamiento multi-tenant

ALTER TABLE wp_crm_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_crm_pagos ENABLE ROW LEVEL SECURITY;

-- Policy Servicios: Ver solo de mi empresa
DROP POLICY IF EXISTS "Servicios visibles por empresa" ON wp_crm_servicios;

CREATE POLICY "Servicios visibles por empresa" ON wp_crm_servicios
    FOR ALL
    USING (empresa_id = (SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1));

-- Policy Pagos: Ver solo de mi empresa
DROP POLICY IF EXISTS "Pagos visibles por empresa" ON wp_crm_pagos;

CREATE POLICY "Pagos visibles por empresa" ON wp_crm_pagos
    FOR ALL
    USING (empresa_id = (SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1));

-- 5. BUCKETS DE STORAGE (Comandos referenciales, ejecutar en Supabase Dashboard o via API)
-- insert into storage.buckets (id, name, public) values ('contratos', 'contratos', false);
-- insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false);

ALTER TABLE public.wp_crm_servicios
ADD COLUMN IF NOT EXISTS dia_compromiso_pago SMALLINT;

ALTER TABLE public.wp_crm_servicios
ADD COLUMN IF NOT EXISTS cuota_mensual DECIMAL(15, 2);

ALTER TABLE public.wp_crm_servicios
DROP CONSTRAINT IF EXISTS chk_servicios_cuota_mensual;

ALTER TABLE public.wp_crm_servicios
DROP CONSTRAINT IF EXISTS chk_servicios_dia_compromiso_pago;

ALTER TABLE public.wp_crm_servicios
ADD CONSTRAINT chk_servicios_cuota_mensual
CHECK (cuota_mensual IS NULL OR cuota_mensual >= 0);

ALTER TABLE public.wp_crm_servicios
ADD CONSTRAINT chk_servicios_dia_compromiso_pago
CHECK (dia_compromiso_pago IS NULL OR dia_compromiso_pago BETWEEN 1 AND 31);
