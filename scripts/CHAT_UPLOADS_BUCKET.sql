-- ============================================================================
-- CHAT UPLOADS BUCKET CONFIGURATION
-- Bucket para archivos multimedia del chat (imágenes, PDFs, audio, video)
-- ============================================================================

-- Crear el bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-uploads',
  'chat-uploads',
  true, -- Público para que Gemini pueda acceder a las URLs
  52428800, -- 50MB max file size
  ARRAY[
    -- Imágenes (soportadas por Gemini)
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    -- Documentos
    'application/pdf',
    -- Audio (soportados por Gemini)
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
    'audio/webm',
    -- Video (soportados por Gemini)
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm'
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
DROP POLICY IF EXISTS "Users can upload chat files" ON storage.objects;
CREATE POLICY "Users can upload chat files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-uploads' AND
  auth.uid() IS NOT NULL
);

-- Policy: Cualquiera puede leer archivos públicos (necesario para Gemini)
DROP POLICY IF EXISTS "Public can read chat files" ON storage.objects;
CREATE POLICY "Public can read chat files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-uploads');

-- Policy: Usuarios pueden actualizar sus propios archivos
DROP POLICY IF EXISTS "Users can update own chat files" ON storage.objects;
CREATE POLICY "Users can update own chat files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chat-uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Usuarios pueden eliminar sus propios archivos
DROP POLICY IF EXISTS "Users can delete own chat files" ON storage.objects;
CREATE POLICY "Users can delete own chat files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================================
-- ÍNDICES Y OPTIMIZACIÓN
-- ============================================================================

-- Índice para búsqueda por usuario (primera carpeta del path es el user_id)
-- Nota: El path sigue el formato: {user_id}/{session_id}/{timestamp}_{random}_{filename}

-- ============================================================================
-- NOTAS DE USO
-- ============================================================================
-- 
-- Estructura de archivos en el bucket:
--   chat-uploads/
--     {user_id}/
--       {session_id}/
--         {timestamp}_{random}_{filename}.{ext}
--
-- Tipos de archivo soportados por Gemini 3:
--   - Imágenes: JPEG, PNG, GIF, WebP
--   - Documentos: PDF
--   - Audio: MP3, WAV, AAC, OGG, FLAC, WebM
--   - Video: MP4, MPEG, QuickTime (.mov), AVI, WebM
--
-- Límites:
--   - Máximo 50MB por archivo
--   - Máximo 5 archivos por mensaje (controlado en frontend)
--
-- El bucket es PÚBLICO para que Gemini pueda acceder a las URLs.
-- Los archivos se organizan por usuario para mantener el aislamiento.
