-- ============================================================================
-- SCRIPT DE DESPLIEGUE COMPLETO: TAREAS V2 (PROJECT MANAGEMENT LITE)
-- ============================================================================
-- Fecha: 2024-12-26
-- Versión: 2.1 (Final - Corregido)
-- Incluye: Schema, Migración de Datos y Triggers de Notificaciones
-- 
-- INSTRUCCIONES:
-- 1. Ejecutar todo este script en el Editor SQL de Supabase
-- 2. Si ocurre un error, el script se detendrá (transaccional donde aplique)
-- ============================================================================

-- ============================================================================
-- SECCIÓN 1: SCHEMA Y MIGRACIÓN
-- ============================================================================

-- Verificar que las tablas base existen
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wp_tareas') THEN
        RAISE EXCEPTION 'Tabla wp_tareas no existe. Abortando migración.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wp_team_humano') THEN
        RAISE EXCEPTION 'Tabla wp_team_humano no existe. Abortando migración.';
    END IF;
    RAISE NOTICE '✓ Verificación pre-migración completada';
END $$;

-- ----------------------------------------------------------------------------
-- 1.1 Funciones Helper
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_current_user_empresa_id()
RETURNS INTEGER AS $$
  SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1.2 Crear Nuevas Tablas
-- ----------------------------------------------------------------------------

-- Proyectos
CREATE TABLE IF NOT EXISTS wp_proyectos (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'archivado', 'completado')),
    color VARCHAR(20) DEFAULT 'blue',
    icono VARCHAR(50) DEFAULT 'folder',
    orden SMALLINT DEFAULT 0,
    config JSONB DEFAULT '{"vista_default": "lista", "columnas_kanban": ["pendiente", "en_progreso", "completada"]}',
    creado_por INTEGER NOT NULL REFERENCES wp_team_humano(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Etiquetas de equipo
CREATE TABLE IF NOT EXISTS wp_etiquetas_equipo (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES wp_empresa_perfil(id) ON DELETE CASCADE,
    nombre VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT 'gray',
    descripcion VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(empresa_id, nombre)
);

-- Asignaciones múltiples
CREATE TABLE IF NOT EXISTS wp_tareas_asignados (
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    team_humano_id INTEGER NOT NULL REFERENCES wp_team_humano(id) ON DELETE CASCADE,
    rol VARCHAR(30) DEFAULT 'responsable' CHECK (rol IN ('responsable', 'colaborador', 'revisor')),
    asignado_por INTEGER REFERENCES wp_team_humano(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tarea_id, team_humano_id)
);

-- Comentarios
CREATE TABLE IF NOT EXISTS wp_tareas_comentarios (
    id BIGSERIAL PRIMARY KEY,
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    autor_id INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    contenido TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'comentario' CHECK (tipo IN ('comentario', 'sistema', 'mencion')),
    metadata JSONB DEFAULT '{}',
    editado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 1.3 Índices
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_proyectos_empresa ON wp_proyectos(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_proyectos_orden ON wp_proyectos(empresa_id, orden);
CREATE INDEX IF NOT EXISTS idx_etiquetas_empresa ON wp_etiquetas_equipo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tareas_asignados_usuario ON wp_tareas_asignados(team_humano_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarea ON wp_tareas_comentarios(tarea_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_autor ON wp_tareas_comentarios(autor_id);

-- ----------------------------------------------------------------------------
-- 1.4 Triggers de Auditoría (updated_at)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trigger_proyectos_updated_at ON wp_proyectos;
CREATE TRIGGER trigger_proyectos_updated_at
    BEFORE UPDATE ON wp_proyectos
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trigger_comentarios_updated_at ON wp_tareas_comentarios;
CREATE TRIGGER trigger_comentarios_updated_at
    BEFORE UPDATE ON wp_tareas_comentarios
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ----------------------------------------------------------------------------
-- 1.5 Modificar Tablas Existentes
-- ----------------------------------------------------------------------------

-- Agregar proyecto_id a wp_tareas
ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS proyecto_id INTEGER REFERENCES wp_proyectos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tareas_proyecto ON wp_tareas(proyecto_id) WHERE proyecto_id IS NOT NULL;

-- Agregar campos a wp_tareas_items
ALTER TABLE wp_tareas_items 
ADD COLUMN IF NOT EXISTS asignado_a INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL;

ALTER TABLE wp_tareas_items 
ADD COLUMN IF NOT EXISTS etiqueta_id INTEGER REFERENCES wp_etiquetas_equipo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_asignado ON wp_tareas_items(asignado_a) WHERE asignado_a IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1.6 Row Level Security (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE wp_proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_etiquetas_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_tareas_asignados ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_tareas_comentarios ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes para evitar conflictos
DROP POLICY IF EXISTS proyectos_policy ON wp_proyectos;
DROP POLICY IF EXISTS etiquetas_policy ON wp_etiquetas_equipo;
DROP POLICY IF EXISTS tareas_asignados_policy ON wp_tareas_asignados;
DROP POLICY IF EXISTS tareas_comentarios_policy ON wp_tareas_comentarios;

-- Crear políticas
CREATE POLICY proyectos_policy ON wp_proyectos
    FOR ALL USING (empresa_id = get_current_user_empresa_id());

CREATE POLICY etiquetas_policy ON wp_etiquetas_equipo
    FOR ALL USING (empresa_id = get_current_user_empresa_id());

CREATE POLICY tareas_asignados_policy ON wp_tareas_asignados
    FOR ALL USING (
        EXISTS (SELECT 1 FROM wp_tareas t WHERE t.id = tarea_id AND t.empresa_id = get_current_user_empresa_id())
    );

CREATE POLICY tareas_comentarios_policy ON wp_tareas_comentarios
    FOR ALL USING (
        EXISTS (SELECT 1 FROM wp_tareas t WHERE t.id = tarea_id AND t.empresa_id = get_current_user_empresa_id())
    );

-- ----------------------------------------------------------------------------
-- 1.7 Migración de Datos (CORREGIDA)
-- ----------------------------------------------------------------------------

-- Crear proyecto "Inbox" por defecto para cada empresa
-- CORRECCIÓN: Usar rol IN ('dueño', 'admin') en lugar de rol = 1
INSERT INTO wp_proyectos (empresa_id, nombre, descripcion, icono, color, creado_por)
SELECT DISTINCT 
    t.empresa_id,
    'Inbox' as nombre,
    'Bandeja de entrada - Tareas sin proyecto asignado' as descripcion,
    'inbox' as icono,
    'zinc' as color,
    COALESCE(
        (SELECT id FROM wp_team_humano WHERE empresa_id = t.empresa_id AND rol IN ('dueño', 'admin') LIMIT 1),
        (SELECT id FROM wp_team_humano WHERE empresa_id = t.empresa_id LIMIT 1)
    ) as creado_por
FROM wp_tareas t
WHERE NOT EXISTS (
    SELECT 1 FROM wp_proyectos p 
    WHERE p.empresa_id = t.empresa_id AND p.nombre = 'Inbox'
)
ON CONFLICT DO NOTHING;

-- Migrar asignaciones existentes
INSERT INTO wp_tareas_asignados (tarea_id, team_humano_id, rol, asignado_por)
SELECT 
    id as tarea_id,
    asignado_a as team_humano_id,
    'responsable' as rol,
    creado_por as asignado_por
FROM wp_tareas
WHERE asignado_a IS NOT NULL
ON CONFLICT (tarea_id, team_humano_id) DO NOTHING;

-- Insertar etiquetas por defecto
INSERT INTO wp_etiquetas_equipo (empresa_id, nombre, color)
SELECT id, 'Desarrollo', 'blue' FROM wp_empresa_perfil
UNION ALL SELECT id, 'Diseño', 'purple' FROM wp_empresa_perfil
UNION ALL SELECT id, 'Ventas', 'green' FROM wp_empresa_perfil
UNION ALL SELECT id, 'Soporte', 'amber' FROM wp_empresa_perfil
UNION ALL SELECT id, 'Urgente', 'rose' FROM wp_empresa_perfil
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- ============================================================================
-- SECCIÓN 2: TRIGGERS DE NEGOCIO (NOTIFICACIONES)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 Trigger: Notificar asignación
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_task_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_tarea_titulo VARCHAR;
    v_empresa_id INTEGER;
    v_asignador_nombre VARCHAR;
BEGIN
    -- Obtener datos de la tarea
    SELECT titulo, empresa_id INTO v_tarea_titulo, v_empresa_id
    FROM wp_tareas WHERE id = NEW.tarea_id;
    
    -- Obtener nombre del asignador
    IF NEW.asignado_por IS NOT NULL THEN
        SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_asignador_nombre
        FROM wp_team_humano WHERE id = NEW.asignado_por;
    ELSE
        v_asignador_nombre := 'Sistema';
    END IF;
    
    -- Crear notificación
    IF NEW.team_humano_id != COALESCE(NEW.asignado_por, 0) THEN
        INSERT INTO wp_notificaciones_team (
            tipo, mensaje, empresa_id, asesor_id, visto, requiere_respuesta, fecha_envio, origen, metadata
        ) VALUES (
            'tarea_asignada',
            v_asignador_nombre || ' te asignó la tarea: "' || v_tarea_titulo || '"',
            v_empresa_id,
            NEW.team_humano_id,
            FALSE,
            FALSE,
            NOW(),
            'trigger_tareas_v2',
            jsonb_build_object('tarea_id', NEW.tarea_id, 'rol', NEW.rol)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_task_assignment ON wp_tareas_asignados;
CREATE TRIGGER trigger_notify_task_assignment
    AFTER INSERT ON wp_tareas_asignados
    FOR EACH ROW EXECUTE FUNCTION notify_task_assignment();

-- ----------------------------------------------------------------------------
-- 2.2 Trigger: Notificar menciones
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_task_comment_mention()
RETURNS TRIGGER AS $$
DECLARE
    v_tarea_titulo VARCHAR;
    v_empresa_id INTEGER;
    v_autor_nombre VARCHAR;
    v_mentioned_id INTEGER;
    v_mentions JSONB;
BEGIN
    IF NEW.metadata IS NULL OR NOT (NEW.metadata ? 'mentions') THEN RETURN NEW; END IF;
    v_mentions := NEW.metadata->'mentions';
    IF v_mentions IS NULL OR jsonb_array_length(v_mentions) = 0 THEN RETURN NEW; END IF;
    
    SELECT titulo, empresa_id INTO v_tarea_titulo, v_empresa_id FROM wp_tareas WHERE id = NEW.tarea_id;
    
    IF NEW.autor_id IS NOT NULL THEN
        SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_autor_nombre FROM wp_team_humano WHERE id = NEW.autor_id;
    ELSE
        v_autor_nombre := 'Sistema';
    END IF;
    
    FOR v_mentioned_id IN SELECT (jsonb_array_elements_text(v_mentions))::INTEGER LOOP
        IF v_mentioned_id != COALESCE(NEW.autor_id, 0) THEN
            INSERT INTO wp_notificaciones_team (
                tipo, mensaje, empresa_id, asesor_id, visto, requiere_respuesta, fecha_envio, origen, metadata
            ) VALUES (
                'tarea_asignada',
                v_autor_nombre || ' te mencionó en: "' || v_tarea_titulo || '"',
                v_empresa_id,
                v_mentioned_id,
                FALSE,
                FALSE,
                NOW(),
                'trigger_tareas_v2_mention',
                jsonb_build_object('tarea_id', NEW.tarea_id, 'comentario_id', NEW.id)
            );
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_comment_mention ON wp_tareas_comentarios;
CREATE TRIGGER trigger_notify_comment_mention
    AFTER INSERT ON wp_tareas_comentarios
    FOR EACH ROW EXECUTE FUNCTION notify_task_comment_mention();

-- ----------------------------------------------------------------------------
-- 2.3 Trigger: Log de cambios de estado
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_estado VARCHAR;
    v_new_estado VARCHAR;
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        v_old_estado := COALESCE(OLD.estado, 'sin estado');
        v_new_estado := COALESCE(NEW.estado, 'sin estado');
        
        INSERT INTO wp_tareas_comentarios (
            tarea_id, autor_id, contenido, tipo, metadata
        ) VALUES (
            NEW.id, NULL,
            'Estado cambiado: ' || v_old_estado || ' → ' || v_new_estado,
            'sistema',
            jsonb_build_object('action', 'status_change', 'from', v_old_estado, 'to', v_new_estado)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_status ON wp_tareas;
CREATE TRIGGER trigger_log_task_status
    AFTER UPDATE ON wp_tareas
    FOR EACH ROW
    WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
    EXECUTE FUNCTION log_task_status_change();

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================

DO $$
DECLARE
    v_proyectos INTEGER;
    v_asignados INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_proyectos FROM wp_proyectos;
    SELECT COUNT(*) INTO v_asignados FROM wp_tareas_asignados;
    
    RAISE NOTICE '============================================';
    RAISE NOTICE '✓ DESPLIEGUE COMPLETADO EXITOSAMENTE';
    RAISE NOTICE '  - Proyectos: %', v_proyectos;
    RAISE NOTICE '  - Asignaciones: %', v_asignados;
    RAISE NOTICE '  - Triggers activados: OK';
    RAISE NOTICE '============================================';
END $$;
