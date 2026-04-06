-- =============================================================================
-- NOTES VISIBLE IA SCHEMA - Control de visibilidad para agentes IA
-- =============================================================================
-- Añade campo para controlar si una nota es visible para el agente de IA/WhatsApp
-- Por defecto es TRUE para mantener compatibilidad con notas existentes

-- 1. Añadir campo visible_ia a wp_contactos_nota
ALTER TABLE public.wp_contactos_nota
ADD COLUMN IF NOT EXISTS visible_ia BOOLEAN DEFAULT true;

-- 2. Crear índice para filtrado eficiente
CREATE INDEX IF NOT EXISTS idx_wp_contactos_nota_visible_ia 
ON public.wp_contactos_nota(visible_ia) 
WHERE visible_ia = true;

-- 3. Comentarios descriptivos
COMMENT ON COLUMN public.wp_contactos_nota.visible_ia IS 
'Si es TRUE, la nota es visible para el agente de IA (Monica/WhatsApp). Si es FALSE, solo la ven los humanos del equipo.';

-- 4. Actualizar comentario de la tabla
COMMENT ON TABLE public.wp_contactos_nota IS 
'Notas de contacto enriquecidas con títulos, etiquetas, pineo, archivos adjuntos y control de visibilidad IA (V4)';

-- =============================================================================
-- NOTAS DE IMPLEMENTACIÓN
-- =============================================================================
-- 
-- visible_ia = true  → La nota es visible para Monica y el agente de WhatsApp
-- visible_ia = false → Solo visible para el equipo humano en el panel admin
--
-- Casos de uso para notas PRIVADAS (visible_ia = false):
-- - Notas internas sobre negociaciones sensibles
-- - Comentarios del equipo que no deben influir en las respuestas del agente
-- - Información confidencial sobre el cliente
-- - Recordatorios internos del equipo
--
-- Casos de uso para notas PÚBLICAS (visible_ia = true):
-- - Contexto que el agente debe conocer para responder mejor
-- - Preferencias del cliente
-- - Historial de problemas o soluciones
-- - Instrucciones especiales para el agente
-- =============================================================================
