-- =============================================================================
-- NOTES ARCHIVOS SCHEMA - Archivos adjuntos para notas de contacto
-- =============================================================================
-- Añade soporte para archivos adjuntos (imágenes, PDFs) en las notas de contacto
-- Se almacenan como array de URLs en Supabase Storage bucket 'notas'

-- 1. Añadir campo archivos_urls a wp_contactos_nota
ALTER TABLE public.wp_contactos_nota
ADD COLUMN IF NOT EXISTS archivos_urls TEXT[] DEFAULT '{}';

-- 2. Comentario descriptivo
COMMENT ON COLUMN public.wp_contactos_nota.archivos_urls IS 'Array de URLs de archivos adjuntos (imágenes, PDFs) almacenados en Supabase Storage bucket notas';

-- 3. Actualizar comentario de la tabla
COMMENT ON TABLE public.wp_contactos_nota IS 'Notas de contacto enriquecidas con títulos, etiquetas, pineo y archivos adjuntos (V3)';

-- =============================================================================
-- STORAGE BUCKET
-- =============================================================================
-- El bucket 'notas' debe crearse manualmente en Supabase Dashboard:
-- 1. Ir a Storage -> Create a new bucket
-- 2. Nombre: notas
-- 3. Public bucket: true (para URLs públicas)
-- 4. Allowed MIME types: image/jpeg, image/png, image/webp, image/gif, application/pdf
-- 5. Max file size: 5MB

-- Políticas RLS para el bucket (ejecutar en SQL Editor después de crear el bucket):
/*
-- Permitir upload a usuarios autenticados
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'notas');

-- Permitir lectura pública
CREATE POLICY "Allow public read" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'notas');

-- Permitir delete a usuarios autenticados
CREATE POLICY "Allow authenticated delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'notas');
*/
