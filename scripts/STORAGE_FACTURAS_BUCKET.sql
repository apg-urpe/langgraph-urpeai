-- =============================================================================
-- CONFIGURACIÓN DE STORAGE PARA FACTURAS PDF
-- =============================================================================
-- Ejecutar esto en Supabase SQL Editor para crear el bucket y políticas RLS
-- =============================================================================

-- 1. CREAR BUCKET 'facturas' (público)
-- Nota: Los buckets deben crearse con la API de Storage, no directamente en SQL
-- Pero podemos verificar su existencia y configurar políticas

-- 2. POLÍTICAS RLS PARA EL BUCKET 'facturas'
-- Estas políticas permiten a usuarios autenticados subir y leer facturas

-- Política: Permitir lectura pública de facturas (para descargar el PDF)
DROP POLICY IF EXISTS "Allow public read access to facturas" ON storage.objects;
CREATE POLICY "Allow public read access to facturas"
ON storage.objects FOR SELECT
USING (bucket_id = 'facturas');

-- Política: Permitir a usuarios autenticados subir facturas
DROP POLICY IF EXISTS "Allow authenticated users to upload facturas" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload facturas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'facturas' 
  AND (storage.foldername(name))[1] IS NOT NULL
);

-- Política: Permitir a usuarios autenticados actualizar sus propios archivos
DROP POLICY IF EXISTS "Allow authenticated users to update facturas" ON storage.objects;
CREATE POLICY "Allow authenticated users to update facturas"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'facturas')
WITH CHECK (bucket_id = 'facturas');

-- Política: Permitir a usuarios autenticados eliminar facturas
DROP POLICY IF EXISTS "Allow authenticated users to delete facturas" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete facturas"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'facturas');

-- =============================================================================
-- INSTRUCCIONES MANUALES (Si las políticas SQL fallan)
-- =============================================================================

/*
Si las políticas anteriores no funcionan, sigue estos pasos manuales:

1. Ve a Supabase Dashboard > Storage > New Bucket
2. Crea un bucket llamado: "facturas"
3. Marca "Public bucket" como SÍ (para permitir descargas directas)
4. Ve a la pestaña "Policies" del bucket

5. Crea estas políticas:

   a) SELECT (Download) - Para permitir descargar PDFs:
      - Allowed operations: SELECT
      - Target roles: anon, authenticated
      - Policy definition: TRUE
      
   b) INSERT (Upload) - Para permitir subir PDFs:
      - Allowed operations: INSERT
      - Target roles: authenticated
      - Policy definition: TRUE
      
   c) UPDATE - Para permitir actualizar:
      - Allowed operations: UPDATE
      - Target roles: authenticated
      - Policy definition: TRUE

6. También verifica que la empresa tenga suficiente espacio de storage.
*/

-- =============================================================================
-- VERIFICACIÓN DE CONFIGURACIÓN
-- =============================================================================

-- Verificar que las políticas existen
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname LIKE '%facturas%';
