-- ==============================================================================
-- SISTEMA DE FACTURACIÓN PROFESIONAL - URPE AI LAB
-- ==============================================================================
-- Versión: 1.0
-- Fecha: Enero 2026
-- Descripción: Schema completo para generación de facturas PDF desde Cartera
-- ==============================================================================

-- 1. TABLA PRINCIPAL: wp_facturas
-- Almacena todas las facturas generadas por el sistema
CREATE TABLE IF NOT EXISTS wp_facturas (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL,
    contacto_id BIGINT NOT NULL,
    servicio_id BIGINT, -- Opcional: factura vinculada a servicio específico
    pago_id BIGINT, -- Opcional: factura vinculada a pago específico
    
    -- ========================================================================
    -- NUMERACIÓN AUTOMÁTICA
    -- ========================================================================
    numero_factura VARCHAR(50) NOT NULL, -- Ej: INV-001234
    prefijo VARCHAR(10) DEFAULT 'INV', -- Configurable por empresa
    secuencia INTEGER NOT NULL, -- Auto-incrementa por empresa
    
    -- ========================================================================
    -- FECHAS
    -- ========================================================================
    fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_vencimiento TIMESTAMP WITH TIME ZONE,
    
    -- ========================================================================
    -- DATOS DEL CLIENTE (Snapshot al momento de facturar)
    -- ========================================================================
    cliente_nombre TEXT NOT NULL,
    cliente_email TEXT,
    cliente_telefono TEXT,
    cliente_direccion TEXT,
    cliente_documento TEXT, -- NIT, RUT, DNI, Tax ID, etc.
    cliente_pais VARCHAR(50),
    
    -- ========================================================================
    -- DATOS DE LA EMPRESA (Snapshot al momento de facturar)
    -- ========================================================================
    empresa_nombre TEXT NOT NULL,
    empresa_direccion TEXT,
    empresa_telefono TEXT,
    empresa_email TEXT,
    empresa_sitio_web TEXT,
    empresa_logo_url TEXT,
    empresa_documento TEXT, -- Tax ID de la empresa
    
    -- ========================================================================
    -- LÍNEAS DE FACTURA (Items)
    -- ========================================================================
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Estructura esperada:
    -- [
    --   {
    --     "descripcion": "Servicio de Consultoría",
    --     "cantidad": 1,
    --     "precioUnitario": 1000.00,
    --     "subtotal": 1000.00
    --   }
    -- ]
    
    -- ========================================================================
    -- TOTALES FINANCIEROS
    -- ========================================================================
    moneda VARCHAR(10) DEFAULT 'USD',
    subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
    impuestos DECIMAL(15, 2) DEFAULT 0,
    descuentos DECIMAL(15, 2) DEFAULT 0,
    total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- ========================================================================
    -- ESTADO Y CONTROL DE PAGOS
    -- ========================================================================
    estado VARCHAR(20) DEFAULT 'emitida', 
    -- Valores: 'borrador', 'emitida', 'pagada', 'vencida', 'anulada'
    monto_pagado DECIMAL(15, 2) DEFAULT 0,
    saldo_pendiente DECIMAL(15, 2) GENERATED ALWAYS AS (total - monto_pagado) STORED,
    
    -- ========================================================================
    -- DOCUMENTOS GENERADOS
    -- ========================================================================
    pdf_url TEXT, -- URL del PDF generado en Supabase Storage
    
    -- ========================================================================
    -- NOTAS Y TÉRMINOS
    -- ========================================================================
    notas TEXT, -- Notas adicionales visibles en la factura
    terminos TEXT, -- Términos y condiciones
    metadata JSONB DEFAULT '{}'::jsonb, -- Datos adicionales flexibles
    
    -- ========================================================================
    -- AUDITORÍA
    -- ========================================================================
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT, -- team_humano_id del usuario que creó la factura
    
    -- ========================================================================
    -- CONSTRAINTS
    -- ========================================================================
    CONSTRAINT fk_facturas_empresa FOREIGN KEY (empresa_id) 
        REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
    CONSTRAINT fk_facturas_contacto FOREIGN KEY (contacto_id) 
        REFERENCES wp_contactos(id) ON DELETE CASCADE,
    CONSTRAINT fk_facturas_servicio FOREIGN KEY (servicio_id) 
        REFERENCES wp_crm_servicios(id) ON DELETE SET NULL,
    CONSTRAINT fk_facturas_pago FOREIGN KEY (pago_id) 
        REFERENCES wp_crm_pagos(id) ON DELETE SET NULL,
    CONSTRAINT unique_numero_factura_empresa UNIQUE (empresa_id, numero_factura),
    CONSTRAINT check_total_positivo CHECK (total >= 0),
    CONSTRAINT check_monto_pagado_valido CHECK (monto_pagado >= 0 AND monto_pagado <= total)
);

-- ========================================================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================================================
CREATE INDEX idx_facturas_empresa ON wp_facturas(empresa_id);
CREATE INDEX idx_facturas_contacto ON wp_facturas(contacto_id);
CREATE INDEX idx_facturas_servicio ON wp_facturas(servicio_id) WHERE servicio_id IS NOT NULL;
CREATE INDEX idx_facturas_pago ON wp_facturas(pago_id) WHERE pago_id IS NOT NULL;
CREATE INDEX idx_facturas_numero ON wp_facturas(numero_factura);
CREATE INDEX idx_facturas_estado ON wp_facturas(estado);
CREATE INDEX idx_facturas_fecha_emision ON wp_facturas(fecha_emision DESC);
CREATE INDEX idx_facturas_fecha_vencimiento ON wp_facturas(fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;

-- Índice compuesto para búsquedas comunes
CREATE INDEX idx_facturas_empresa_estado_fecha ON wp_facturas(empresa_id, estado, fecha_emision DESC);

-- ========================================================================
-- TRIGGER PARA UPDATED_AT
-- ========================================================================
CREATE OR REPLACE FUNCTION update_facturas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_facturas_updated_at
BEFORE UPDATE ON wp_facturas
FOR EACH ROW
EXECUTE FUNCTION update_facturas_updated_at();

-- ========================================================================
-- FUNCIÓN: GENERAR NÚMERO DE FACTURA AUTOMÁTICO
-- ========================================================================
-- Genera números secuenciales únicos por empresa
-- Formato: {PREFIJO}-{SECUENCIA_6_DIGITOS}
-- Ejemplo: INV-000001, INV-000002, etc.

CREATE OR REPLACE FUNCTION generate_invoice_number(
    p_empresa_id BIGINT, 
    p_prefijo VARCHAR DEFAULT 'INV'
)
RETURNS VARCHAR AS $$
DECLARE
    v_secuencia INTEGER;
    v_numero VARCHAR;
BEGIN
    -- Obtener la siguiente secuencia para esta empresa y prefijo
    SELECT COALESCE(MAX(secuencia), 0) + 1 INTO v_secuencia
    FROM wp_facturas
    WHERE empresa_id = p_empresa_id 
    AND prefijo = p_prefijo;
    
    -- Formatear número con padding de 6 dígitos
    -- Ejemplo: INV-000001, INV-000123, INV-012345
    v_numero := p_prefijo || '-' || LPAD(v_secuencia::TEXT, 6, '0');
    
    RETURN v_numero;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ejemplo de uso:
-- SELECT generate_invoice_number(13, 'INV'); -- Retorna: INV-000001
-- SELECT generate_invoice_number(13, 'REC'); -- Retorna: REC-000001

-- ========================================================================
-- FUNCIÓN: ACTUALIZAR ESTADO DE FACTURA SEGÚN PAGOS
-- ========================================================================
-- Actualiza automáticamente el estado de la factura cuando se registran pagos

CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_total DECIMAL(15, 2);
    v_monto_pagado DECIMAL(15, 2);
BEGIN
    -- Obtener datos de la factura
    SELECT total, monto_pagado INTO v_total, v_monto_pagado
    FROM wp_facturas
    WHERE id = NEW.id;
    
    -- Actualizar estado según monto pagado
    IF v_monto_pagado >= v_total THEN
        -- Factura completamente pagada
        UPDATE wp_facturas
        SET estado = 'pagada',
            updated_at = NOW()
        WHERE id = NEW.id;
    ELSIF v_monto_pagado > 0 AND v_monto_pagado < v_total THEN
        -- Factura parcialmente pagada (mantener como 'emitida')
        UPDATE wp_facturas
        SET estado = 'emitida',
            updated_at = NOW()
        WHERE id = NEW.id
        AND estado != 'emitida';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_status
AFTER UPDATE OF monto_pagado ON wp_facturas
FOR EACH ROW
WHEN (OLD.monto_pagado IS DISTINCT FROM NEW.monto_pagado)
EXECUTE FUNCTION update_invoice_status_on_payment();

-- ========================================================================
-- FUNCIÓN: MARCAR FACTURAS VENCIDAS
-- ========================================================================
-- Función para ejecutar periódicamente (cron job o scheduled function)
-- Marca facturas como 'vencida' si pasó la fecha de vencimiento

CREATE OR REPLACE FUNCTION mark_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE wp_facturas
    SET estado = 'vencida',
        updated_at = NOW()
    WHERE estado = 'emitida'
    AND fecha_vencimiento IS NOT NULL
    AND fecha_vencimiento < NOW()
    AND saldo_pendiente > 0;
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar manualmente o programar con pg_cron:
-- SELECT mark_overdue_invoices();

-- ========================================================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================================================
-- Asegurar aislamiento multi-tenant

ALTER TABLE wp_facturas ENABLE ROW LEVEL SECURITY;

-- Policy: Ver solo facturas de mi empresa
CREATE POLICY "Facturas visibles por empresa" ON wp_facturas
    FOR ALL
    USING (
        empresa_id = (
            SELECT empresa_id 
            FROM wp_team_humano 
            WHERE auth_uid = auth.uid() 
            LIMIT 1
        )
    );

-- ========================================================================
-- CAMPOS ADICIONALES EN TABLAS EXISTENTES (Opcional)
-- ========================================================================
-- Para tracking bidireccional Factura ↔ Pago

-- Agregar factura_id a wp_crm_pagos
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wp_crm_pagos' AND column_name = 'factura_id'
    ) THEN
        ALTER TABLE wp_crm_pagos ADD COLUMN factura_id BIGINT;
        ALTER TABLE wp_crm_pagos ADD CONSTRAINT fk_pagos_factura 
            FOREIGN KEY (factura_id) REFERENCES wp_facturas(id) ON DELETE SET NULL;
        CREATE INDEX idx_pagos_factura ON wp_crm_pagos(factura_id) WHERE factura_id IS NOT NULL;
    END IF;
END $$;

-- Agregar ultima_factura_id a wp_crm_servicios
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wp_crm_servicios' AND column_name = 'ultima_factura_id'
    ) THEN
        ALTER TABLE wp_crm_servicios ADD COLUMN ultima_factura_id BIGINT;
        ALTER TABLE wp_crm_servicios ADD CONSTRAINT fk_servicios_ultima_factura 
            FOREIGN KEY (ultima_factura_id) REFERENCES wp_facturas(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ========================================================================
-- VISTAS ÚTILES
-- ========================================================================

-- Vista: Facturas con información del contacto
CREATE OR REPLACE VIEW vw_facturas_contactos AS
SELECT 
    f.*,
    c.nombre || ' ' || COALESCE(c.apellido, '') as contacto_nombre_completo,
    c.email as contacto_email_actual,
    c.telefono as contacto_telefono_actual,
    c.team_humano_id as asesor_id
FROM wp_facturas f
LEFT JOIN wp_contactos c ON f.contacto_id = c.id;

-- Vista: Resumen de facturación por empresa
CREATE OR REPLACE VIEW vw_facturacion_resumen AS
SELECT 
    empresa_id,
    COUNT(*) as total_facturas,
    COUNT(*) FILTER (WHERE estado = 'emitida') as facturas_emitidas,
    COUNT(*) FILTER (WHERE estado = 'pagada') as facturas_pagadas,
    COUNT(*) FILTER (WHERE estado = 'vencida') as facturas_vencidas,
    SUM(total) as total_facturado,
    SUM(monto_pagado) as total_cobrado,
    SUM(saldo_pendiente) as total_pendiente,
    moneda
FROM wp_facturas
WHERE estado != 'anulada'
GROUP BY empresa_id, moneda;

-- ========================================================================
-- DATOS DE EJEMPLO (Opcional - Solo para testing)
-- ========================================================================

-- Comentar estas líneas en producción
/*
-- Ejemplo de factura de prueba
INSERT INTO wp_facturas (
    empresa_id, contacto_id, servicio_id,
    numero_factura, prefijo, secuencia,
    cliente_nombre, cliente_email, cliente_telefono,
    empresa_nombre, empresa_email,
    items, moneda, subtotal, total,
    estado, created_by
) VALUES (
    13, -- empresa_id (ajustar según tu BD)
    1, -- contacto_id (ajustar según tu BD)
    1, -- servicio_id (ajustar según tu BD)
    'INV-000001', 'INV', 1,
    'Cliente de Prueba', 'cliente@example.com', '+1234567890',
    'Urpe AI Lab', 'contact@urpeailab.com',
    '[{"descripcion": "Consultoría IA", "cantidad": 1, "precioUnitario": 1500.00, "subtotal": 1500.00}]'::jsonb,
    'USD', 1500.00, 1500.00,
    'emitida', 1
);
*/

-- ========================================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ========================================================================

COMMENT ON TABLE wp_facturas IS 'Facturas generadas por el sistema de Cartera. Incluye snapshot de datos de cliente y empresa al momento de emisión.';
COMMENT ON COLUMN wp_facturas.numero_factura IS 'Número único de factura por empresa. Formato: {PREFIJO}-{SECUENCIA}';
COMMENT ON COLUMN wp_facturas.items IS 'Array JSON con líneas de factura. Estructura: [{"descripcion", "cantidad", "precioUnitario", "subtotal"}]';
COMMENT ON COLUMN wp_facturas.estado IS 'Estado actual: borrador, emitida, pagada, vencida, anulada';
COMMENT ON COLUMN wp_facturas.pdf_url IS 'URL del PDF generado en Supabase Storage bucket "facturas"';
COMMENT ON FUNCTION generate_invoice_number IS 'Genera número secuencial único de factura por empresa y prefijo';
COMMENT ON FUNCTION mark_overdue_invoices IS 'Marca facturas como vencidas si pasó la fecha límite. Ejecutar periódicamente.';

-- ========================================================================
-- FIN DEL SCHEMA
-- ========================================================================
-- Para aplicar este schema:
-- 1. Ejecutar en Supabase SQL Editor
-- 2. Verificar que no hay errores
-- 3. Configurar bucket 'facturas' en Storage
-- 4. Instalar puppeteer en el proyecto: npm install puppeteer
-- ========================================================================
