-- DEDUPLICACIÓN: Servicios, Pagos y Notas — empresa_id = 4
-- Fecha: 2026-02-26
-- Conserva el registro con menor id. Pagos se borran por CASCADE al borrar servicio.
-- PASO 1: Ejecuta los SELECT de diagnóstico. PASO 2: Ejecuta BEGIN...COMMIT.

-- ============ DIAGNÓSTICO ============

-- Conteo de duplicados
SELECT 'Servicios duplicados' AS tipo, COUNT(*) AS a_borrar FROM wp_crm_servicios s
INNER JOIN (
  SELECT contacto_id, empresa_id, nombre_servicio, MIN(id) min_id
  FROM wp_crm_servicios WHERE empresa_id=4
  GROUP BY contacto_id, empresa_id, nombre_servicio HAVING COUNT(*)>1
) d ON s.contacto_id=d.contacto_id AND s.empresa_id=d.empresa_id
   AND s.nombre_servicio=d.nombre_servicio AND s.id>d.min_id
UNION ALL
SELECT 'Notas duplicadas', COUNT(*) FROM wp_contactos_nota n
INNER JOIN (
  SELECT contacto_id, COALESCE(titulo,'') t, COALESCE(descripcion,'') dc, MIN(id) min_id
  FROM wp_contactos_nota WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id=4)
  GROUP BY contacto_id, COALESCE(titulo,''), COALESCE(descripcion,'') HAVING COUNT(*)>1
) d ON n.contacto_id=d.contacto_id AND COALESCE(n.titulo,'')=d.t
   AND COALESCE(n.descripcion,'')=d.dc AND n.id>d.min_id;

-- ============ LIMPIEZA ============

BEGIN;

-- Borrar servicios duplicados (pagos se eliminan por CASCADE)
DELETE FROM wp_crm_servicios WHERE id IN (
  SELECT s.id FROM wp_crm_servicios s INNER JOIN (
    SELECT contacto_id, empresa_id, nombre_servicio, MIN(id) min_id
    FROM wp_crm_servicios WHERE empresa_id=4
    GROUP BY contacto_id, empresa_id, nombre_servicio HAVING COUNT(*)>1
  ) d ON s.contacto_id=d.contacto_id AND s.empresa_id=d.empresa_id
     AND s.nombre_servicio=d.nombre_servicio AND s.id>d.min_id
);

-- Borrar notas duplicadas
DELETE FROM wp_contactos_nota WHERE id IN (
  SELECT n.id FROM wp_contactos_nota n INNER JOIN (
    SELECT contacto_id, COALESCE(titulo,'') t, COALESCE(descripcion,'') dc, MIN(id) min_id
    FROM wp_contactos_nota WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id=4)
    GROUP BY contacto_id, COALESCE(titulo,''), COALESCE(descripcion,'') HAVING COUNT(*)>1
  ) d ON n.contacto_id=d.contacto_id AND COALESCE(n.titulo,'')=d.t
     AND COALESCE(n.descripcion,'')=d.dc AND n.id>d.min_id
);

COMMIT;

-- Verificación post-limpieza (ambos deben dar 0)
SELECT 'Servicios aún duplicados' AS check_tipo, COUNT(*) FROM (
  SELECT 1 FROM wp_crm_servicios WHERE empresa_id=4
  GROUP BY contacto_id, nombre_servicio HAVING COUNT(*)>1) x
UNION ALL
SELECT 'Notas aún duplicadas', COUNT(*) FROM (
  SELECT 1 FROM wp_contactos_nota
  WHERE contacto_id IN (SELECT id FROM wp_contactos WHERE empresa_id=4)
  GROUP BY contacto_id, COALESCE(titulo,''), COALESCE(descripcion,'') HAVING COUNT(*)>1) y;
