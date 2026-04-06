-- ============================================================================
-- CONTACT MULTIMEDIA BUCKET CONFIGURATION
-- Bucket para archivos multimedia de contactos (imágenes, PDFs, audio, video)
-- ============================================================================

-- Crear el bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guardado_multimedia',
  'guardado_multimedia',
  true, -- Público para URLs accesibles
  52428800, -- 50MB max file size
  ARRAY[
    -- Imágenes
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    -- Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    -- Video
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    -- Documentos
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

-- Policy: Usuarios autenticados pueden subir archivos
DROP POLICY IF EXISTS "Users can upload contact multimedia" ON storage.objects;
CREATE POLICY "Users can upload contact multimedia"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'guardado_multimedia' AND
  auth.uid() IS NOT NULL
);

-- Policy: Cualquiera puede leer archivos públicos
DROP POLICY IF EXISTS "Public can read contact multimedia" ON storage.objects;
CREATE POLICY "Public can read contact multimedia"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'guardado_multimedia');

-- Policy: Usuarios autenticados pueden actualizar archivos
DROP POLICY IF EXISTS "Users can update contact multimedia" ON storage.objects;
CREATE POLICY "Users can update contact multimedia"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'guardado_multimedia')
WITH CHECK (bucket_id = 'guardado_multimedia');

-- Policy: Usuarios autenticados pueden eliminar archivos
DROP POLICY IF EXISTS "Users can delete contact multimedia" ON storage.objects;
CREATE POLICY "Users can delete contact multimedia"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'guardado_multimedia');

-- ============================================================================
-- NOTAS DE USO
-- ============================================================================
-- 
-- Estructura de archivos en el bucket:
--   guardado_multimedia/
--     empresa_{empresaId}/
--       contacto_{contactoId}/
--         {tipo}_{timestamp}_{random}.{ext}
--
-- Tipos de archivo soportados:
--   - Imágenes: JPEG, PNG, GIF, WebP, SVG
--   - Audio: MP3, WAV, OGG, WebM
--   - Video: MP4, WebM, QuickTime (.mov), AVI
--   - Documentos: PDF, Word, Excel, PowerPoint, TXT, RTF
--
-- Límites:
--   - Máximo 50MB por archivo
--
-- El bucket es PÚBLICO para URLs accesibles directamente.
-- Los archivos se organizan por empresa y contacto para aislamiento.
