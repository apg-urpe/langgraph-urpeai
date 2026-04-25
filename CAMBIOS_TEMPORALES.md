# Cambios temporales — Webhooks n8n para herramientas de Nylas

> **Estado:** en progreso. Plan iniciado el 2026-04-24.
> **Objetivo:** mover las 4 herramientas de agenda (`consultar_disponibilidad`, `agendar_cita`, `reagendar_cita`, `cancelar_cita`) a webhooks de n8n en lugar de llamar a Nylas directo desde la app.

## Reglas generales

- La **lógica vieja** (Nylas directo en `app/services/scheduling.py` y `app/nylas_client/client.py`) **NO se borra**. Solo se deja como código no-llamado.
- Los wrappers en `app/tools/scheduling.py` apuntan al webhook de n8n. Si rollback es necesario, basta con restaurar el `try` original.
- Webhooks **sin auth** por ahora.
- Si el contacto **no tiene `timezone`** en `wp_contactos`, **no** se llama al webhook. Se le devuelve al agente la instrucción de preguntarle la ubicación al contacto (constante `_MSG_SIN_TIMEZONE`).
- Errores del webhook → mensaje genérico `"Error al consultar disponibilidad: <detalle>"` (mismo formato que antes).

## Estado de cada herramienta

| # | Herramienta | Webhook | Estado |
|---|-------------|---------|--------|
| 1 | `consultar_disponibilidad` | `GET https://marketia.app.n8n.cloud/webhook/disponibilidad-nylas` | ✅ Migrada |
| 2 | `agendar_cita` | _pendiente_ | ⏳ Pendiente |
| 3 | `reagendar_cita` | _pendiente_ | ⏳ Pendiente |
| 4 | `cancelar_cita` | _pendiente_ | ⏳ Pendiente |

---

## 1. `consultar_disponibilidad` ✅

**Ubicación:** [`app/tools/scheduling.py`](app/tools/scheduling.py) — función `consultar_disponibilidad` dentro de `_create_consultar_disponibilidad_tool`.

**Endpoint:**
```
GET https://marketia.app.n8n.cloud/webhook/disponibilidad-nylas
?contacto_id=<int>
&time_zone_contacto=<IANA tz, ej. America/Mexico_City>
```

**Parámetros enviados:**
- `contacto_id` — ID interno de `wp_contactos`.
- `time_zone_contacto` — leído de `wp_contactos.timezone` vía `_get_timezone_contacto`.

**Respuesta esperada (200):**
```json
{
  "availabilityText": "string ya formateado en markdown listo para el LLM…",
  "Citas actuales del contacto": "string con citas (no se usa por ahora)"
}
```

**Lógica de la tool:**
1. Resolver `tz` (param de la tool > `wp_contactos.timezone`). Si no hay → devolver `_MSG_SIN_TIMEZONE` (sin llamar al webhook).
2. `GET` al webhook con `contacto_id` y `time_zone_contacto`. Timeout 30s.
3. Si status != 200 o respuesta no-JSON → `"Error al consultar disponibilidad: …"`.
4. Si JSON sin `availabilityText` (o vacío) → `"No se pudo obtener el calendario de los asesores."`.
5. Si OK → devolver el `availabilityText` tal cual al agente.

**Decisiones tomadas:**
- Solo se devuelve `availabilityText`. `Citas actuales del contacto` se ignora (el webhook por ahora repite `(Sin cita registrada)` 4 veces — bug menor del lado n8n, no bloquea).
- El webhook no requiere auth.

**Cómo revertir esta tool:**
1. En `app/tools/scheduling.py`, dentro de `consultar_disponibilidad`, reemplazar el bloque "CAMBIO TEMPORAL — Disponibilidad vía webhook n8n" por la llamada original:
   ```python
   req = DisponibilidadRequest(
       contacto_id=contacto_id,
       empresa_id=empresa_id,
       time_zone_contacto=tz,
   )
   resp = await disponibilidad_agenda_core(req)
   if resp.error and not resp.calendario_texto:
       return f"Error al consultar disponibilidad: {resp.error}"
   if resp.calendario_texto:
       return resp.calendario_texto
   return "No se pudo obtener el calendario de los asesores."
   ```
2. Borrar la constante `_DISPONIBILIDAD_WEBHOOK_URL` y los imports `httpx` / `get_shared_http_client` si ninguna otra tool las usa.
3. Borrar los `# noqa: F401` de `DisponibilidadRequest` y `disponibilidad_agenda_core` (vuelven a usarse).

---

## 2. `agendar_cita` ⏳

_Pendiente. Se decidirá el endpoint y formato de body cuando se aborde._

## 3. `reagendar_cita` ⏳

_Pendiente._

## 4. `cancelar_cita` ⏳

_Pendiente._

---

## Histórico

- **2026-04-24** — Migrada `consultar_disponibilidad` a webhook n8n. Resto pendiente.
