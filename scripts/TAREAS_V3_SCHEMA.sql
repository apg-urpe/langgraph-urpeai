-- ============================================================================
-- SCRIPT DE DESPLIEGUE: TAREAS V3 (TASK MANAGEMENT ADVANCED)
-- ============================================================================
-- Fecha: 2024-12-26
-- Versión: 3.0
-- Incluye: Schema, RLS, Triggers de Notificaciones, Historial de Actividad
-- 
-- INSTRUCCIONES:
-- 1. Ejecutar todo este script en el Editor SQL de Supabase
-- 2. El script es idempotente (puede ejecutarse múltiples veces)
-- 3. Crear bucket 'task-attachments' en Supabase Storage manualmente
-- ============================================================================

-- ============================================================================
-- SECCIÓN 1: FUNCIONES HELPER
-- ============================================================================

-- Función para obtener empresa_id del usuario actual
CREATE OR REPLACE FUNCTION get_current_user_empresa_id()
RETURNS INTEGER AS $$
  SELECT empresa_id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Función para obtener team_humano_id del usuario actual
CREATE OR REPLACE FUNCTION get_current_user_team_id()
RETURNS INTEGER AS $$
  SELECT id FROM wp_team_humano WHERE auth_uid = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Trigger genérico para updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECCIÓN 2: MODIFICAR TABLAS EXISTENTES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 Modificar wp_tareas
-- ----------------------------------------------------------------------------

-- Descripción en Markdown
ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS descripcion_md TEXT;

-- Imagen de portada
ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS portada_url TEXT;

-- Tiempo estimado y real (en minutos)
ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS tiempo_estimado_min INTEGER;

ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS tiempo_real_min INTEGER DEFAULT 0;

-- Costos
ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS costo_estimado DECIMAL(12,2);

ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS costo_real DECIMAL(12,2) DEFAULT 0;

ALTER TABLE wp_tareas 
ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'USD';

-- Índices para nuevos campos
CREATE INDEX IF NOT EXISTS idx_tareas_tiempo_estimado ON wp_tareas(tiempo_estimado_min) WHERE tiempo_estimado_min IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2.2 Modificar wp_proyectos
-- ----------------------------------------------------------------------------

-- Relación con contacto
ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS contacto_id INTEGER REFERENCES wp_contactos(id) ON DELETE SET NULL;

-- Relación con servicio
ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS servicio_id INTEGER REFERENCES wp_crm_servicios(id) ON DELETE SET NULL;

-- Presupuesto y gastos
ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS presupuesto DECIMAL(12,2);

ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS gasto_actual DECIMAL(12,2) DEFAULT 0;

ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'USD';

-- Fechas del proyecto
ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS fecha_inicio DATE;

ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS fecha_fin_estimada DATE;

ALTER TABLE wp_proyectos 
ADD COLUMN IF NOT EXISTS fecha_fin_real DATE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_proyectos_contacto ON wp_proyectos(contacto_id) WHERE contacto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proyectos_servicio ON wp_proyectos(servicio_id) WHERE servicio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proyectos_fechas ON wp_proyectos(fecha_inicio, fecha_fin_estimada);

-- ============================================================================
-- SECCIÓN 3: NUEVAS TABLAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 wp_tareas_media (Archivos adjuntos)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_tareas_media (
    id BIGSERIAL PRIMARY KEY,
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    
    -- Información del archivo
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo_mime VARCHAR(100) NOT NULL,
    tamaño_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    url_publica TEXT,
    
    -- Metadatos
    descripcion VARCHAR(500),
    es_portada BOOLEAN DEFAULT FALSE,
    
    -- Auditoría
    subido_por INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tareas_media_tarea ON wp_tareas_media(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tareas_media_tipo ON wp_tareas_media(tipo_mime);
CREATE INDEX IF NOT EXISTS idx_tareas_media_portada ON wp_tareas_media(tarea_id) WHERE es_portada = TRUE;

-- ----------------------------------------------------------------------------
-- 3.2 wp_tareas_etiquetas (Relación muchos a muchos)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_tareas_etiquetas (
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    etiqueta_id INTEGER NOT NULL REFERENCES wp_etiquetas_equipo(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tarea_id, etiqueta_id)
);

CREATE INDEX IF NOT EXISTS idx_tareas_etiquetas_etiqueta ON wp_tareas_etiquetas(etiqueta_id);

-- ----------------------------------------------------------------------------
-- 3.3 wp_tareas_historial (Activity Log)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_tareas_historial (
    id BIGSERIAL PRIMARY KEY,
    tarea_id INTEGER NOT NULL REFERENCES wp_tareas(id) ON DELETE CASCADE,
    
    -- Acción realizada
    accion VARCHAR(50) NOT NULL,
    campo_modificado VARCHAR(50),
    valor_anterior TEXT,
    valor_nuevo TEXT,
    
    -- Contexto
    autor_id INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tareas_historial_tarea ON wp_tareas_historial(tarea_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tareas_historial_autor ON wp_tareas_historial(autor_id);
CREATE INDEX IF NOT EXISTS idx_tareas_historial_accion ON wp_tareas_historial(accion);

-- ----------------------------------------------------------------------------
-- 3.4 wp_tareas_reacciones (Reacciones a comentarios)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_tareas_reacciones (
    comentario_id INTEGER NOT NULL REFERENCES wp_tareas_comentarios(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES wp_team_humano(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (comentario_id, usuario_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_tareas_reacciones_comentario ON wp_tareas_reacciones(comentario_id);

-- ----------------------------------------------------------------------------
-- 3.5 wp_proyectos_costos (Registro de costos)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_proyectos_costos (
    id BIGSERIAL PRIMARY KEY,
    proyecto_id INTEGER NOT NULL REFERENCES wp_proyectos(id) ON DELETE CASCADE,
    
    -- Detalle del costo
    concepto VARCHAR(255) NOT NULL,
    categoria VARCHAR(50) DEFAULT 'general' CHECK (categoria IN ('personal', 'licencias', 'infraestructura', 'servicios', 'general')),
    monto DECIMAL(12,2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'USD',
    
    -- Vinculación opcional
    tarea_id INTEGER REFERENCES wp_tareas(id) ON DELETE SET NULL,
    
    -- Fechas
    fecha_costo DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Auditoría
    registrado_por INTEGER REFERENCES wp_team_humano(id) ON DELETE SET NULL,
    comprobante_url TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proyectos_costos_proyecto ON wp_proyectos_costos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_costos_fecha ON wp_proyectos_costos(fecha_costo);
CREATE INDEX IF NOT EXISTS idx_proyectos_costos_categoria ON wp_proyectos_costos(categoria);
CREATE INDEX IF NOT EXISTS idx_proyectos_costos_tarea ON wp_proyectos_costos(tarea_id) WHERE tarea_id IS NOT NULL;

-- ============================================================================
-- SECCIÓN 4: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 Habilitar RLS en nuevas tablas
-- ----------------------------------------------------------------------------

ALTER TABLE wp_tareas_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_tareas_etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_tareas_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_tareas_reacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_proyectos_costos ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4.2 Policies para wp_tareas_media
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tareas_media_select ON wp_tareas_media;
CREATE POLICY tareas_media_select ON wp_tareas_media
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_media_insert ON wp_tareas_media;
CREATE POLICY tareas_media_insert ON wp_tareas_media
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_media_delete ON wp_tareas_media;
CREATE POLICY tareas_media_delete ON wp_tareas_media
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

-- ----------------------------------------------------------------------------
-- 4.3 Policies para wp_tareas_etiquetas
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tareas_etiquetas_select ON wp_tareas_etiquetas;
CREATE POLICY tareas_etiquetas_select ON wp_tareas_etiquetas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_etiquetas_insert ON wp_tareas_etiquetas;
CREATE POLICY tareas_etiquetas_insert ON wp_tareas_etiquetas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_etiquetas_delete ON wp_tareas_etiquetas;
CREATE POLICY tareas_etiquetas_delete ON wp_tareas_etiquetas
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

-- ----------------------------------------------------------------------------
-- 4.4 Policies para wp_tareas_historial
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tareas_historial_select ON wp_tareas_historial;
CREATE POLICY tareas_historial_select ON wp_tareas_historial
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_historial_insert ON wp_tareas_historial;
CREATE POLICY tareas_historial_insert ON wp_tareas_historial
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM wp_tareas t 
            WHERE t.id = tarea_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

-- ----------------------------------------------------------------------------
-- 4.5 Policies para wp_tareas_reacciones
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tareas_reacciones_select ON wp_tareas_reacciones;
CREATE POLICY tareas_reacciones_select ON wp_tareas_reacciones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wp_tareas_comentarios c 
            JOIN wp_tareas t ON t.id = c.tarea_id 
            WHERE c.id = comentario_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_reacciones_insert ON wp_tareas_reacciones;
CREATE POLICY tareas_reacciones_insert ON wp_tareas_reacciones
    FOR INSERT WITH CHECK (
        usuario_id = get_current_user_team_id()
        AND EXISTS (
            SELECT 1 FROM wp_tareas_comentarios c 
            JOIN wp_tareas t ON t.id = c.tarea_id 
            WHERE c.id = comentario_id 
            AND t.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS tareas_reacciones_delete ON wp_tareas_reacciones;
CREATE POLICY tareas_reacciones_delete ON wp_tareas_reacciones
    FOR DELETE USING (
        usuario_id = get_current_user_team_id()
    );

-- ----------------------------------------------------------------------------
-- 4.6 Policies para wp_proyectos_costos
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS proyectos_costos_select ON wp_proyectos_costos;
CREATE POLICY proyectos_costos_select ON wp_proyectos_costos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM wp_proyectos p 
            WHERE p.id = proyecto_id 
            AND p.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS proyectos_costos_insert ON wp_proyectos_costos;
CREATE POLICY proyectos_costos_insert ON wp_proyectos_costos
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM wp_proyectos p 
            WHERE p.id = proyecto_id 
            AND p.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS proyectos_costos_update ON wp_proyectos_costos;
CREATE POLICY proyectos_costos_update ON wp_proyectos_costos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM wp_proyectos p 
            WHERE p.id = proyecto_id 
            AND p.empresa_id = get_current_user_empresa_id()
        )
    );

DROP POLICY IF EXISTS proyectos_costos_delete ON wp_proyectos_costos;
CREATE POLICY proyectos_costos_delete ON wp_proyectos_costos
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM wp_proyectos p 
            WHERE p.id = proyecto_id 
            AND p.empresa_id = get_current_user_empresa_id()
        )
    );

-- ============================================================================
-- SECCIÓN 5: TRIGGERS DE HISTORIAL AUTOMÁTICO
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 Trigger: Registrar creación de tarea
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wp_tareas_historial (tarea_id, accion, autor_id, metadata)
    VALUES (
        NEW.id,
        'created',
        NEW.creado_por,
        jsonb_build_object(
            'titulo', NEW.titulo,
            'prioridad', NEW.prioridad,
            'estado', NEW.estado
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_created ON wp_tareas;
CREATE TRIGGER trigger_log_task_created
    AFTER INSERT ON wp_tareas
    FOR EACH ROW EXECUTE FUNCTION log_task_created();

-- ----------------------------------------------------------------------------
-- 5.2 Trigger: Registrar cambio de estado
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO wp_tareas_historial (tarea_id, accion, campo_modificado, valor_anterior, valor_nuevo, autor_id)
        VALUES (
            NEW.id,
            'status_changed',
            'estado',
            OLD.estado,
            NEW.estado,
            get_current_user_team_id()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_status ON wp_tareas;
CREATE TRIGGER trigger_log_task_status
    AFTER UPDATE OF estado ON wp_tareas
    FOR EACH ROW EXECUTE FUNCTION log_task_status_change();

-- ----------------------------------------------------------------------------
-- 5.3 Trigger: Registrar cambio de prioridad
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_priority_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.prioridad IS DISTINCT FROM NEW.prioridad THEN
        INSERT INTO wp_tareas_historial (tarea_id, accion, campo_modificado, valor_anterior, valor_nuevo, autor_id)
        VALUES (
            NEW.id,
            'priority_changed',
            'prioridad',
            OLD.prioridad::text,
            NEW.prioridad::text,
            get_current_user_team_id()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_priority ON wp_tareas;
CREATE TRIGGER trigger_log_task_priority
    AFTER UPDATE OF prioridad ON wp_tareas
    FOR EACH ROW EXECUTE FUNCTION log_task_priority_change();

-- ----------------------------------------------------------------------------
-- 5.4 Trigger: Registrar cambio de fecha de vencimiento
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_due_date_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.fecha_vencimiento IS DISTINCT FROM NEW.fecha_vencimiento THEN
        INSERT INTO wp_tareas_historial (tarea_id, accion, campo_modificado, valor_anterior, valor_nuevo, autor_id)
        VALUES (
            NEW.id,
            'due_date_changed',
            'fecha_vencimiento',
            OLD.fecha_vencimiento::text,
            NEW.fecha_vencimiento::text,
            get_current_user_team_id()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_due_date ON wp_tareas;
CREATE TRIGGER trigger_log_task_due_date
    AFTER UPDATE OF fecha_vencimiento ON wp_tareas
    FOR EACH ROW EXECUTE FUNCTION log_task_due_date_change();

-- ----------------------------------------------------------------------------
-- 5.5 Trigger: Registrar asignación de miembro
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre VARCHAR;
BEGIN
    SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_nombre
    FROM wp_team_humano WHERE id = NEW.team_humano_id;
    
    INSERT INTO wp_tareas_historial (tarea_id, accion, valor_nuevo, autor_id, metadata)
    VALUES (
        NEW.tarea_id,
        'assigned',
        v_nombre,
        NEW.asignado_por,
        jsonb_build_object('team_humano_id', NEW.team_humano_id, 'rol', NEW.rol)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_assignment ON wp_tareas_asignados;
CREATE TRIGGER trigger_log_task_assignment
    AFTER INSERT ON wp_tareas_asignados
    FOR EACH ROW EXECUTE FUNCTION log_task_assignment();

-- ----------------------------------------------------------------------------
-- 5.6 Trigger: Registrar desasignación de miembro
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_unassignment()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre VARCHAR;
BEGIN
    -- Verificar si la tarea aún existe antes de intentar insertar en el historial
    -- Si la tarea está siendo eliminada (ON DELETE CASCADE), este trigger puede fallar si es AFTER DELETE
    IF NOT EXISTS (SELECT 1 FROM wp_tareas WHERE id = OLD.tarea_id) THEN
        RETURN OLD;
    END IF;

    SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_nombre
    FROM wp_team_humano WHERE id = OLD.team_humano_id;
    
    INSERT INTO wp_tareas_historial (tarea_id, accion, valor_anterior, autor_id, metadata)
    VALUES (
        OLD.tarea_id,
        'unassigned',
        v_nombre,
        get_current_user_team_id(),
        jsonb_build_object('team_humano_id', OLD.team_humano_id)
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_unassignment ON wp_tareas_asignados;
CREATE TRIGGER trigger_log_task_unassignment
    AFTER DELETE ON wp_tareas_asignados
    FOR EACH ROW EXECUTE FUNCTION log_task_unassignment();

-- ----------------------------------------------------------------------------
-- 5.7 Trigger: Registrar comentario añadido
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_comment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo = 'comentario' THEN
        INSERT INTO wp_tareas_historial (tarea_id, accion, autor_id, metadata)
        VALUES (
            NEW.tarea_id,
            'comment_added',
            NEW.autor_id,
            jsonb_build_object('comentario_id', NEW.id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_comment ON wp_tareas_comentarios;
CREATE TRIGGER trigger_log_task_comment
    AFTER INSERT ON wp_tareas_comentarios
    FOR EACH ROW EXECUTE FUNCTION log_task_comment();

-- ----------------------------------------------------------------------------
-- 5.8 Trigger: Registrar item completado/descompletado
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_item_toggle()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.completado IS DISTINCT FROM NEW.completado THEN
        INSERT INTO wp_tareas_historial (tarea_id, accion, valor_nuevo, autor_id, metadata)
        VALUES (
            NEW.tarea_id,
            CASE WHEN NEW.completado THEN 'item_completed' ELSE 'item_uncompleted' END,
            NEW.texto,
            NEW.completado_por,
            jsonb_build_object('item_id', NEW.id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_item ON wp_tareas_items;
CREATE TRIGGER trigger_log_task_item
    AFTER UPDATE OF completado ON wp_tareas_items
    FOR EACH ROW EXECUTE FUNCTION log_task_item_toggle();

-- ----------------------------------------------------------------------------
-- 5.9 Trigger: Registrar etiqueta añadida
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_label_added()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre VARCHAR;
BEGIN
    SELECT nombre INTO v_nombre FROM wp_etiquetas_equipo WHERE id = NEW.etiqueta_id;
    
    INSERT INTO wp_tareas_historial (tarea_id, accion, valor_nuevo, autor_id, metadata)
    VALUES (
        NEW.tarea_id,
        'label_added',
        v_nombre,
        get_current_user_team_id(),
        jsonb_build_object('etiqueta_id', NEW.etiqueta_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_label_added ON wp_tareas_etiquetas;
CREATE TRIGGER trigger_log_task_label_added
    AFTER INSERT ON wp_tareas_etiquetas
    FOR EACH ROW EXECUTE FUNCTION log_task_label_added();

-- ----------------------------------------------------------------------------
-- 5.10 Trigger: Registrar etiqueta removida
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_label_removed()
RETURNS TRIGGER AS $$
DECLARE
    v_nombre VARCHAR;
BEGIN
    -- Verificar si la tarea aún existe
    IF NOT EXISTS (SELECT 1 FROM wp_tareas WHERE id = OLD.tarea_id) THEN
        RETURN OLD;
    END IF;

    SELECT nombre INTO v_nombre FROM wp_etiquetas_equipo WHERE id = OLD.etiqueta_id;
    
    INSERT INTO wp_tareas_historial (tarea_id, accion, valor_anterior, autor_id, metadata)
    VALUES (
        OLD.tarea_id,
        'label_removed',
        v_nombre,
        get_current_user_team_id(),
        jsonb_build_object('etiqueta_id', OLD.etiqueta_id)
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_label_removed ON wp_tareas_etiquetas;
CREATE TRIGGER trigger_log_task_label_removed
    AFTER DELETE ON wp_tareas_etiquetas
    FOR EACH ROW EXECUTE FUNCTION log_task_label_removed();

-- ----------------------------------------------------------------------------
-- 5.11 Trigger: Registrar media subido
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_media_uploaded()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wp_tareas_historial (tarea_id, accion, valor_nuevo, autor_id, metadata)
    VALUES (
        NEW.tarea_id,
        'media_uploaded',
        NEW.nombre_archivo,
        NEW.subido_por,
        jsonb_build_object('media_id', NEW.id, 'tipo_mime', NEW.tipo_mime)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_media ON wp_tareas_media;
CREATE TRIGGER trigger_log_task_media
    AFTER INSERT ON wp_tareas_media
    FOR EACH ROW EXECUTE FUNCTION log_task_media_uploaded();

-- ============================================================================
-- SECCIÓN 6: TRIGGERS DE NOTIFICACIONES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.1 Trigger: Notificar cambio de estado a asignados
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_task_status_to_assignees()
RETURNS TRIGGER AS $$
DECLARE
    v_tarea_titulo VARCHAR;
    v_empresa_id INTEGER;
    v_asignado_id INTEGER;
    v_autor_id INTEGER;
    v_autor_nombre VARCHAR;
BEGIN
    IF OLD.estado = NEW.estado THEN RETURN NEW; END IF;
    
    SELECT titulo, empresa_id INTO v_tarea_titulo, v_empresa_id
    FROM wp_tareas WHERE id = NEW.id;
    
    v_autor_id := get_current_user_team_id();
    
    IF v_autor_id IS NOT NULL THEN
        SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_autor_nombre
        FROM wp_team_humano WHERE id = v_autor_id;
    ELSE
        v_autor_nombre := 'Sistema';
    END IF;
    
    -- Notificar a todos los asignados excepto al autor
    FOR v_asignado_id IN 
        SELECT team_humano_id FROM wp_tareas_asignados WHERE tarea_id = NEW.id
    LOOP
        IF v_asignado_id != COALESCE(v_autor_id, 0) THEN
            INSERT INTO wp_notificaciones_team (
                tipo, mensaje, empresa_id, asesor_id, visto, fecha_envio, origen, metadata
            ) VALUES (
                'tarea_estado',
                v_autor_nombre || ' cambió "' || v_tarea_titulo || '" a ' || NEW.estado,
                v_empresa_id,
                v_asignado_id,
                FALSE,
                NOW(),
                'trigger_tareas_v3',
                jsonb_build_object('tarea_id', NEW.id, 'estado_anterior', OLD.estado, 'estado_nuevo', NEW.estado)
            );
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_task_status ON wp_tareas;
CREATE TRIGGER trigger_notify_task_status
    AFTER UPDATE OF estado ON wp_tareas
    FOR EACH ROW EXECUTE FUNCTION notify_task_status_to_assignees();

-- ----------------------------------------------------------------------------
-- 6.2 Trigger: Notificar comentario nuevo a asignados
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_task_comment_to_assignees()
RETURNS TRIGGER AS $$
DECLARE
    v_tarea_titulo VARCHAR;
    v_empresa_id INTEGER;
    v_asignado_id INTEGER;
    v_autor_nombre VARCHAR;
BEGIN
    IF NEW.tipo != 'comentario' THEN RETURN NEW; END IF;
    
    SELECT t.titulo, t.empresa_id INTO v_tarea_titulo, v_empresa_id
    FROM wp_tareas t WHERE t.id = NEW.tarea_id;
    
    IF NEW.autor_id IS NOT NULL THEN
        SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_autor_nombre
        FROM wp_team_humano WHERE id = NEW.autor_id;
    ELSE
        v_autor_nombre := 'Sistema';
    END IF;
    
    -- Notificar a todos los asignados excepto al autor
    FOR v_asignado_id IN 
        SELECT team_humano_id FROM wp_tareas_asignados WHERE tarea_id = NEW.tarea_id
    LOOP
        IF v_asignado_id != COALESCE(NEW.autor_id, 0) THEN
            INSERT INTO wp_notificaciones_team (
                tipo, mensaje, empresa_id, asesor_id, visto, fecha_envio, origen, metadata
            ) VALUES (
                'tarea_comentario',
                v_autor_nombre || ' comentó en "' || v_tarea_titulo || '"',
                v_empresa_id,
                v_asignado_id,
                FALSE,
                NOW(),
                'trigger_tareas_v3',
                jsonb_build_object('tarea_id', NEW.tarea_id, 'comentario_id', NEW.id)
            );
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_task_comment ON wp_tareas_comentarios;
CREATE TRIGGER trigger_notify_task_comment
    AFTER INSERT ON wp_tareas_comentarios
    FOR EACH ROW EXECUTE FUNCTION notify_task_comment_to_assignees();

-- ----------------------------------------------------------------------------
-- 6.3 Trigger: Notificar tarea próxima a vencer (ejecutar con cron)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_tasks_due_soon()
RETURNS void AS $$
DECLARE
    v_task RECORD;
    v_asignado_id INTEGER;
BEGIN
    -- Tareas que vencen mañana y no han sido notificadas
    FOR v_task IN 
        SELECT t.id, t.titulo, t.empresa_id, t.fecha_vencimiento
        FROM wp_tareas t
        WHERE t.estado NOT IN ('completada', 'cancelada')
        AND t.fecha_vencimiento::date = (CURRENT_DATE + INTERVAL '1 day')::date
        AND NOT EXISTS (
            SELECT 1 FROM wp_notificaciones_team n 
            WHERE n.metadata->>'tarea_id' = t.id::text 
            AND n.tipo = 'tarea_vencimiento_proximo'
            AND n.fecha_envio > CURRENT_DATE
        )
    LOOP
        FOR v_asignado_id IN 
            SELECT team_humano_id FROM wp_tareas_asignados 
            WHERE tarea_id = v_task.id AND rol = 'responsable'
        LOOP
            INSERT INTO wp_notificaciones_team (
                tipo, mensaje, empresa_id, asesor_id, visto, fecha_envio, origen, metadata
            ) VALUES (
                'tarea_vencimiento_proximo',
                'La tarea "' || v_task.titulo || '" vence mañana',
                v_task.empresa_id,
                v_asignado_id,
                FALSE,
                NOW(),
                'cron_tareas_v3',
                jsonb_build_object('tarea_id', v_task.id, 'fecha_vencimiento', v_task.fecha_vencimiento)
            );
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 6.4 Trigger: Notificar costo registrado al creador del proyecto
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_project_cost_registered()
RETURNS TRIGGER AS $$
DECLARE
    v_proyecto_nombre VARCHAR;
    v_empresa_id INTEGER;
    v_creador_id INTEGER;
    v_registrador_nombre VARCHAR;
BEGIN
    SELECT p.nombre, p.empresa_id, p.creado_por INTO v_proyecto_nombre, v_empresa_id, v_creador_id
    FROM wp_proyectos p WHERE p.id = NEW.proyecto_id;
    
    -- No notificar si el creador es quien registró el costo
    IF v_creador_id = NEW.registrado_por THEN RETURN NEW; END IF;
    
    IF NEW.registrado_por IS NOT NULL THEN
        SELECT CONCAT(nombre, ' ', LEFT(apellido, 1), '.') INTO v_registrador_nombre
        FROM wp_team_humano WHERE id = NEW.registrado_por;
    ELSE
        v_registrador_nombre := 'Sistema';
    END IF;
    
    INSERT INTO wp_notificaciones_team (
        tipo, mensaje, empresa_id, asesor_id, visto, fecha_envio, origen, metadata
    ) VALUES (
        'proyecto_costo',
        v_registrador_nombre || ' registró un costo de ' || NEW.moneda || ' ' || NEW.monto || ' en "' || v_proyecto_nombre || '"',
        v_empresa_id,
        v_creador_id,
        FALSE,
        NOW(),
        'trigger_tareas_v3',
        jsonb_build_object('proyecto_id', NEW.proyecto_id, 'costo_id', NEW.id, 'monto', NEW.monto)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_project_cost ON wp_proyectos_costos;
CREATE TRIGGER trigger_notify_project_cost
    AFTER INSERT ON wp_proyectos_costos
    FOR EACH ROW EXECUTE FUNCTION notify_project_cost_registered();

-- ============================================================================
-- SECCIÓN 7: FUNCIONES DE ACTUALIZACIÓN AUTOMÁTICA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7.1 Función: Actualizar gasto_actual del proyecto
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_project_total_cost()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE wp_proyectos 
        SET gasto_actual = COALESCE((
            SELECT SUM(monto) FROM wp_proyectos_costos WHERE proyecto_id = OLD.proyecto_id
        ), 0)
        WHERE id = OLD.proyecto_id;
        RETURN OLD;
    ELSE
        UPDATE wp_proyectos 
        SET gasto_actual = COALESCE((
            SELECT SUM(monto) FROM wp_proyectos_costos WHERE proyecto_id = NEW.proyecto_id
        ), 0)
        WHERE id = NEW.proyecto_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_project_cost ON wp_proyectos_costos;
CREATE TRIGGER trigger_update_project_cost
    AFTER INSERT OR UPDATE OR DELETE ON wp_proyectos_costos
    FOR EACH ROW EXECUTE FUNCTION update_project_total_cost();

-- ----------------------------------------------------------------------------
-- 7.2 Función: Actualizar costo_real de la tarea desde costos del proyecto
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_task_cost_from_project()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tarea_id IS NOT NULL THEN
        UPDATE wp_tareas 
        SET costo_real = COALESCE((
            SELECT SUM(monto) FROM wp_proyectos_costos WHERE tarea_id = NEW.tarea_id
        ), 0)
        WHERE id = NEW.tarea_id;
    END IF;
    
    IF TG_OP = 'UPDATE' AND OLD.tarea_id IS NOT NULL AND OLD.tarea_id != COALESCE(NEW.tarea_id, 0) THEN
        UPDATE wp_tareas 
        SET costo_real = COALESCE((
            SELECT SUM(monto) FROM wp_proyectos_costos WHERE tarea_id = OLD.tarea_id
        ), 0)
        WHERE id = OLD.tarea_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_task_cost ON wp_proyectos_costos;
CREATE TRIGGER trigger_update_task_cost
    AFTER INSERT OR UPDATE ON wp_proyectos_costos
    FOR EACH ROW EXECUTE FUNCTION update_task_cost_from_project();

-- ============================================================================
-- SECCIÓN 8: VISTAS ÚTILES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 8.1 Vista: Tareas con contexto completo
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_tareas_completas AS
SELECT 
    t.*,
    p.nombre AS proyecto_nombre,
    p.color AS proyecto_color,
    c.nombre AS contacto_nombre,
    c.apellido AS contacto_apellido,
    (SELECT COUNT(*) FROM wp_tareas_items ti WHERE ti.tarea_id = t.id) AS total_items,
    (SELECT COUNT(*) FROM wp_tareas_items ti WHERE ti.tarea_id = t.id AND ti.completado = TRUE) AS items_completados,
    (SELECT COUNT(*) FROM wp_tareas_comentarios tc WHERE tc.tarea_id = t.id AND tc.tipo = 'comentario') AS total_comentarios,
    (SELECT COUNT(*) FROM wp_tareas_media tm WHERE tm.tarea_id = t.id) AS total_media,
    (SELECT array_agg(e.nombre) FROM wp_tareas_etiquetas te JOIN wp_etiquetas_equipo e ON e.id = te.etiqueta_id WHERE te.tarea_id = t.id) AS etiquetas
FROM wp_tareas t
LEFT JOIN wp_proyectos p ON p.id = t.proyecto_id
LEFT JOIN wp_contactos c ON c.id = t.contacto_id;

-- ----------------------------------------------------------------------------
-- 8.2 Vista: Proyectos con métricas
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_proyectos_metricas AS
SELECT 
    p.*,
    c.nombre AS contacto_nombre,
    c.apellido AS contacto_apellido,
    s.nombre_servicio,
    s.valor_total AS servicio_valor,
    (SELECT COUNT(*) FROM wp_tareas t WHERE t.proyecto_id = p.id) AS total_tareas,
    (SELECT COUNT(*) FROM wp_tareas t WHERE t.proyecto_id = p.id AND t.estado = 'completada') AS tareas_completadas,
    (SELECT COUNT(*) FROM wp_tareas t WHERE t.proyecto_id = p.id AND t.estado NOT IN ('completada', 'cancelada') AND t.fecha_vencimiento < NOW()) AS tareas_vencidas,
    CASE 
        WHEN (SELECT COUNT(*) FROM wp_tareas t WHERE t.proyecto_id = p.id) = 0 THEN 0
        ELSE ROUND(
            (SELECT COUNT(*) FROM wp_tareas t WHERE t.proyecto_id = p.id AND t.estado = 'completada')::numeric / 
            (SELECT COUNT(*) FROM wp_tareas t WHERE t.proyecto_id = p.id)::numeric * 100, 
            1
        )
    END AS porcentaje_completado,
    CASE 
        WHEN p.presupuesto IS NULL OR p.presupuesto = 0 THEN 0
        ELSE ROUND((p.gasto_actual / p.presupuesto) * 100, 1)
    END AS porcentaje_gastado
FROM wp_proyectos p
LEFT JOIN wp_contactos c ON c.id = p.contacto_id
LEFT JOIN wp_crm_servicios s ON s.id = p.servicio_id;

-- ============================================================================
-- SECCIÓN 9: DATOS INICIALES
-- ============================================================================

-- Agregar más etiquetas por defecto si no existen
INSERT INTO wp_etiquetas_equipo (empresa_id, nombre, color, descripcion)
SELECT id, 'Bug', 'rose', 'Errores y problemas técnicos' FROM wp_empresa_perfil
WHERE NOT EXISTS (SELECT 1 FROM wp_etiquetas_equipo WHERE nombre = 'Bug' AND empresa_id = wp_empresa_perfil.id)
UNION ALL
SELECT id, 'Mejora', 'blue', 'Mejoras y optimizaciones' FROM wp_empresa_perfil
WHERE NOT EXISTS (SELECT 1 FROM wp_etiquetas_equipo WHERE nombre = 'Mejora' AND empresa_id = wp_empresa_perfil.id)
UNION ALL
SELECT id, 'Documentación', 'purple', 'Tareas de documentación' FROM wp_empresa_perfil
WHERE NOT EXISTS (SELECT 1 FROM wp_etiquetas_equipo WHERE nombre = 'Documentación' AND empresa_id = wp_empresa_perfil.id)
UNION ALL
SELECT id, 'Revisión', 'amber', 'Pendiente de revisión' FROM wp_empresa_perfil
WHERE NOT EXISTS (SELECT 1 FROM wp_etiquetas_equipo WHERE nombre = 'Revisión' AND empresa_id = wp_empresa_perfil.id)
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ TAREAS V3 SCHEMA - Instalación completada';
    RAISE NOTICE '📋 Tablas nuevas: wp_tareas_media, wp_tareas_etiquetas, wp_tareas_historial, wp_tareas_reacciones, wp_proyectos_costos';
    RAISE NOTICE '🔐 RLS: Habilitado en todas las tablas nuevas';
    RAISE NOTICE '🔔 Triggers: 11 triggers de historial + 4 triggers de notificación';
    RAISE NOTICE '📊 Vistas: vw_tareas_completas, vw_proyectos_metricas';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  PENDIENTE: Crear bucket "task-attachments" en Supabase Storage';
    RAISE NOTICE '⚠️  PENDIENTE: Configurar cron job para notify_tasks_due_soon()';
END $$;
