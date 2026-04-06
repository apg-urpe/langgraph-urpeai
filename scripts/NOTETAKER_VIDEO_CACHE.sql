-- ============================================================================
-- NOTETAKER VIDEO CACHE — Almacenar videos localmente en Supabase Storage
-- Fecha: 2026-03-06
-- ============================================================================
-- Problema: Nylas solo retiene media de Notetaker por 14 días.
-- Después de eso, los videos se eliminan permanentemente.
-- Solución: Descargar y almacenar videos en Supabase Storage cuando estén 
-- disponibles, y guardar la URL permanente en la transcripción.
-- ============================================================================

-- 1. Agregar columna video_url a transcripciones
ALTER TABLE public.transcripciones 
  ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN public.transcripciones.video_url IS 
  'URL permanente del video en Supabase Storage. Se cachea desde Nylas antes de que expire (14 días).';

-- 2. Agregar columna video_cached_at para saber cuándo se descargó
ALTER TABLE public.transcripciones 
  ADD COLUMN IF NOT EXISTS video_cached_at TIMESTAMPTZ;

COMMENT ON COLUMN public.transcripciones.video_cached_at IS 
  'Fecha en que el video fue descargado de Nylas y almacenado en Supabase Storage.';

-- 3. Crear bucket de storage para videos de notetaker (si no existe)
-- NOTA: Ejecutar esto manualmente en el dashboard de Supabase > Storage:
--   Bucket name: notetaker-recordings
--   Public: false (private, acceso via signed URLs)
--   File size limit: 500MB
--   Allowed MIME types: video/mp4, video/webm, audio/mpeg, audio/mp3, image/png

-- 4. Política de Storage: solo service_role puede insertar/leer
-- (el webhook usa supabaseAdmin con service_role key)
-- Los usuarios acceden via signed URLs generados por el backend

-- 5. Índice para buscar transcripciones por notetaker_id (para el webhook)
CREATE INDEX IF NOT EXISTS idx_transcripciones_notetaker_id 
  ON public.transcripciones USING btree (notetaker_id) 
  WHERE notetaker_id IS NOT NULL;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transcripciones' 
  AND column_name IN ('video_url', 'video_cached_at', 'notetaker_id', 'grant_id')
ORDER BY column_name;
