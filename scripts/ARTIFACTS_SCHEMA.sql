-- ============================================================================
-- ARTIFACTS SCHEMA - Sistema de Artefactos con Versionado
-- ============================================================================
-- Fecha: 2024-12-29
-- Descripción: Schema para persistir artefactos generados por Monica AI
-- con soporte para múltiples versiones, tipos y compartir
-- ============================================================================

-- Tabla principal de artefactos
CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relaciones
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES adaptive_interface.chat_sessions(id) ON DELETE SET NULL,
    message_id UUID REFERENCES adaptive_interface.chat_messages(id) ON DELETE SET NULL,
    
    -- Contenido
    title TEXT NOT NULL DEFAULT 'Untitled Artifact',
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'html' CHECK (type IN ('html', 'markdown', 'svg', 'mermaid', 'react', 'code', 'research')),
    language TEXT, -- Para type='code': 'javascript', 'python', 'sql', etc.
    
    -- Metadata
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    is_pinned BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE, -- Para compartir
    public_slug TEXT UNIQUE, -- URL slug para compartir: /artifacts/{slug}
    
    -- Stats
    view_count INTEGER DEFAULT 0,
    fork_count INTEGER DEFAULT 0,
    forked_from UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de versiones de artefactos
CREATE TABLE IF NOT EXISTS artifact_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    
    -- Contenido de la versión
    content TEXT NOT NULL,
    title TEXT,
    description TEXT,
    
    -- Metadata
    version_number INTEGER NOT NULL,
    change_description TEXT, -- Descripción del cambio
    is_auto_save BOOLEAN DEFAULT FALSE, -- Auto-guardado vs guardado manual
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: version_number único por artifact
    UNIQUE(artifact_id, version_number)
);

-- Tabla de favoritos/starred artifacts (para biblioteca personal)
CREATE TABLE IF NOT EXISTS artifact_stars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, artifact_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Índice para búsqueda por usuario
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts(user_id);

-- Índice para búsqueda por sesión
CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts(session_id);

-- Índice para artefactos públicos
CREATE INDEX IF NOT EXISTS idx_artifacts_public ON artifacts(is_public) WHERE is_public = TRUE;

-- Índice para slug público
CREATE INDEX IF NOT EXISTS idx_artifacts_public_slug ON artifacts(public_slug) WHERE public_slug IS NOT NULL;

-- Índice para versiones por artifact
CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(artifact_id);

-- Índice para favoritos por usuario
CREATE INDEX IF NOT EXISTS idx_artifact_stars_user_id ON artifact_stars(user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_artifact_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_artifact_updated_at
    BEFORE UPDATE ON artifacts
    FOR EACH ROW
    EXECUTE FUNCTION update_artifact_updated_at();

-- Trigger para auto-incrementar version_number
CREATE OR REPLACE FUNCTION set_artifact_version_number()
RETURNS TRIGGER AS $$
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO NEW.version_number
    FROM artifact_versions
    WHERE artifact_id = NEW.artifact_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_artifact_version_number
    BEFORE INSERT ON artifact_versions
    FOR EACH ROW
    EXECUTE FUNCTION set_artifact_version_number();

-- Trigger para crear versión inicial al crear artifact
CREATE OR REPLACE FUNCTION create_initial_artifact_version()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO artifact_versions (artifact_id, content, title, description, is_auto_save)
    VALUES (NEW.id, NEW.content, NEW.title, NEW.description, FALSE);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_artifact_initial_version
    AFTER INSERT ON artifacts
    FOR EACH ROW
    EXECUTE FUNCTION create_initial_artifact_version();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_stars ENABLE ROW LEVEL SECURITY;

-- Artifacts: usuarios pueden ver sus propios artefactos + públicos
CREATE POLICY artifacts_select_policy ON artifacts
    FOR SELECT USING (
        user_id = auth.uid() 
        OR is_public = TRUE
    );

-- Artifacts: usuarios solo pueden insertar sus propios artefactos
CREATE POLICY artifacts_insert_policy ON artifacts
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Artifacts: usuarios solo pueden actualizar sus propios artefactos
CREATE POLICY artifacts_update_policy ON artifacts
    FOR UPDATE USING (user_id = auth.uid());

-- Artifacts: usuarios solo pueden eliminar sus propios artefactos
CREATE POLICY artifacts_delete_policy ON artifacts
    FOR DELETE USING (user_id = auth.uid());

-- Versions: acceso basado en artifact padre
CREATE POLICY artifact_versions_select_policy ON artifact_versions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM artifacts 
            WHERE artifacts.id = artifact_versions.artifact_id
            AND (artifacts.user_id = auth.uid() OR artifacts.is_public = TRUE)
        )
    );

CREATE POLICY artifact_versions_insert_policy ON artifact_versions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM artifacts 
            WHERE artifacts.id = artifact_versions.artifact_id
            AND artifacts.user_id = auth.uid()
        )
    );

-- Stars: usuarios manejan sus propios favoritos
CREATE POLICY artifact_stars_all_policy ON artifact_stars
    FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- FUNCIONES HELPER
-- ============================================================================

-- Función para generar slug único
CREATE OR REPLACE FUNCTION generate_artifact_slug(artifact_title TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Generar slug base desde título
    base_slug := lower(regexp_replace(artifact_title, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    
    -- Si está vacío, usar random
    IF base_slug = '' THEN
        base_slug := 'artifact';
    END IF;
    
    -- Añadir sufijo aleatorio
    base_slug := base_slug || '-' || substr(md5(random()::text), 1, 6);
    final_slug := base_slug;
    
    -- Verificar unicidad (aunque con random debería ser único)
    WHILE EXISTS (SELECT 1 FROM artifacts WHERE public_slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Función para hacer un artifact público
CREATE OR REPLACE FUNCTION make_artifact_public(artifact_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    artifact_title TEXT;
    new_slug TEXT;
BEGIN
    -- Obtener título
    SELECT title INTO artifact_title FROM artifacts WHERE id = artifact_uuid AND user_id = auth.uid();
    
    IF artifact_title IS NULL THEN
        RAISE EXCEPTION 'Artifact not found or access denied';
    END IF;
    
    -- Generar slug
    new_slug := generate_artifact_slug(artifact_title);
    
    -- Actualizar artifact
    UPDATE artifacts 
    SET is_public = TRUE, public_slug = new_slug
    WHERE id = artifact_uuid;
    
    RETURN new_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para fork de artifact
CREATE OR REPLACE FUNCTION fork_artifact(source_artifact_id UUID)
RETURNS UUID AS $$
DECLARE
    new_artifact_id UUID;
    source_artifact RECORD;
BEGIN
    -- Obtener artifact fuente
    SELECT * INTO source_artifact 
    FROM artifacts 
    WHERE id = source_artifact_id 
    AND (user_id = auth.uid() OR is_public = TRUE);
    
    IF source_artifact IS NULL THEN
        RAISE EXCEPTION 'Artifact not found or access denied';
    END IF;
    
    -- Crear nuevo artifact
    INSERT INTO artifacts (user_id, title, content, type, language, description, tags, forked_from)
    VALUES (
        auth.uid(),
        source_artifact.title || ' (Fork)',
        source_artifact.content,
        source_artifact.type,
        source_artifact.language,
        source_artifact.description,
        source_artifact.tags,
        source_artifact_id
    )
    RETURNING id INTO new_artifact_id;
    
    -- Incrementar fork_count del original
    UPDATE artifacts SET fork_count = fork_count + 1 WHERE id = source_artifact_id;
    
    RETURN new_artifact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON TABLE artifacts IS 'Artefactos generados por Monica AI (HTML, SVG, Markdown, React, etc.)';
COMMENT ON TABLE artifact_versions IS 'Historial de versiones de cada artefacto';
COMMENT ON TABLE artifact_stars IS 'Artefactos marcados como favoritos por usuarios';
COMMENT ON COLUMN artifacts.type IS 'Tipo de artefacto: html, markdown, svg, mermaid, react, code';
COMMENT ON COLUMN artifacts.public_slug IS 'URL slug para compartir públicamente';
COMMENT ON COLUMN artifact_versions.is_auto_save IS 'TRUE si fue guardado automáticamente, FALSE si fue guardado manualmente';
