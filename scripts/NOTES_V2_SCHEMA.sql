-- Migration for Contact Notes V2
-- Adds support for Titles, Tags, and Pinning

-- 1. Add new columns
ALTER TABLE public.wp_contactos_nota
ADD COLUMN IF NOT EXISTS titulo TEXT,
ADD COLUMN IF NOT EXISTS etiquetas JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS es_fijado BOOLEAN DEFAULT false;

-- 2. Create index for pinned notes for faster retrieval
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nota_es_fijado 
ON public.wp_contactos_nota(es_fijado) 
WHERE es_fijado = true;

-- 3. Create index for tags (using GIN for JSONB)
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nota_etiquetas 
ON public.wp_contactos_nota USING GIN (etiquetas);

-- 4. Update RLS policies if necessary (existing ones should cover new columns)
-- Just ensuring the table is commented
COMMENT ON TABLE public.wp_contactos_nota IS 'Notas de contacto enriquecidas con títulos, etiquetas y pineo (V2)';
COMMENT ON COLUMN public.wp_contactos_nota.titulo IS 'Título opcional de la nota';
COMMENT ON COLUMN public.wp_contactos_nota.etiquetas IS 'Array JSON de strings para tags (ej: ["importante", "llamada"])';
COMMENT ON COLUMN public.wp_contactos_nota.es_fijado IS 'Si la nota debe aparecer al principio de la lista';
