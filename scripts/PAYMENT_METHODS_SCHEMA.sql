-- ==============================================================================
-- ESQUEMA DE MÉTODOS DE PAGO PERSONALIZADOS
-- ==============================================================================
-- Permite a cada empresa definir sus propios métodos de pago además de los
-- métodos base del sistema.

-- 1. TABLA DE MÉTODOS DE PAGO
CREATE TABLE IF NOT EXISTS wp_metodos_pago (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL,
    
    -- Identificador único por empresa (ej: 'crypto', 'mercadopago', 'nequi')
    codigo VARCHAR(50) NOT NULL,
    
    -- Nombre para mostrar en UI
    nombre VARCHAR(100) NOT NULL,
    
    -- Descripción opcional
    descripcion TEXT,
    
    -- Icono (nombre de Lucide icon o URL)
    icono VARCHAR(100) DEFAULT 'wallet',
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    
    -- Orden de aparición en el dropdown
    orden INT DEFAULT 0,
    
    -- Metadata adicional (ej: configuraciones específicas)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT,
    
    -- Constraints
    CONSTRAINT fk_metodos_pago_empresa FOREIGN KEY (empresa_id) REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
    CONSTRAINT uq_metodos_pago_empresa_codigo UNIQUE (empresa_id, codigo)
);

-- Índices
CREATE INDEX idx_metodos_pago_empresa ON wp_metodos_pago(empresa_id);
CREATE INDEX idx_metodos_pago_activo ON wp_metodos_pago(empresa_id, is_active);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_metodos_pago_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_metodos_pago_updated_at
BEFORE UPDATE ON wp_metodos_pago
FOR EACH ROW
EXECUTE FUNCTION update_metodos_pago_updated_at();

-- 2. RLS (Row Level Security)
ALTER TABLE wp_metodos_pago ENABLE ROW LEVEL SECURITY;

-- Policy: Solo ver métodos de mi empresa
CREATE POLICY "Metodos pago visibles por empresa" ON wp_metodos_pago
    FOR ALL
    USING (empresa_id = (SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1));

-- 3. INSERTAR MÉTODOS BASE COMO EJEMPLO (Opcional - comentado)
-- Estos son los métodos "del sistema" que vienen por defecto.
-- Si quieres que cada empresa tenga sus propios métodos base, descomenta y ajusta.
/*
-- Ejemplo: Insertar métodos base para empresa 13 (Urpe Lab)
INSERT INTO wp_metodos_pago (empresa_id, codigo, nombre, icono, orden) VALUES
(13, 'transferencia', 'Transferencia Bancaria', 'building-2', 1),
(13, 'tarjeta', 'Tarjeta de Crédito/Débito', 'credit-card', 2),
(13, 'efectivo', 'Efectivo', 'banknote', 3),
(13, 'yape', 'Yape', 'smartphone', 4),
(13, 'plin', 'Plin', 'smartphone', 5),
(13, 'paypal', 'PayPal', 'globe', 6)
ON CONFLICT (empresa_id, codigo) DO NOTHING;
*/

-- ==============================================================================
-- NOTAS DE IMPLEMENTACIÓN
-- ==============================================================================
-- 
-- El sistema mantiene métodos "base" hardcodeados en types/finance.ts como fallback.
-- Los métodos de esta tabla se combinan con los base en el frontend.
-- 
-- Flujo:
-- 1. Cargar PAYMENT_METHOD_OPTIONS (base) desde types/finance.ts
-- 2. Cargar métodos personalizados de wp_metodos_pago para la empresa
-- 3. Combinar ambos, priorizando los personalizados si hay conflicto de código
--
-- Esto permite:
-- - Empresas nuevas funcionan sin configuración adicional
-- - Cada empresa puede agregar sus propios métodos
-- - Posibilidad de "sobrescribir" nombres de métodos base
--
