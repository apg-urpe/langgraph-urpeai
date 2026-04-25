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
| 2 | `agendar_cita` | `POST https://marketia.app.n8n.cloud/webhook/crear-evento` | ✅ Migrada |
| 3 | `reagendar_cita` | `POST https://marketia.app.n8n.cloud/webhook/reagendar-dashboard` | ✅ Migrada |
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

## 2. `agendar_cita` ✅

**Ubicación:** [`app/tools/scheduling.py`](app/tools/scheduling.py) — función `agendar_cita` dentro de `_create_agendar_cita_tool`.

**Endpoint:**
```
POST https://marketia.app.n8n.cloud/webhook/crear-evento
Content-Type: application/json
```

**Body enviado:**
```json
{
  "contacto_id": <int>,
  "start": "YYYY-MM-DDTHH:MM:SS",      // hora local del contacto, sin offset
  "attendeeEmail": "<email contacto>",
  "summary": "<título evento>",
  "description": "<descripción>",
  "Virtual-presencial": "Virtual" | "Presencial",
  "time_zone_contacto": "<IANA tz>"
}
```

**Argumentos del agente** (params LangGraph):
- `hora_local_contacto` → `start`
- `email_contacto` → `attendeeEmail`
- `titulo` → `summary`
- `descripcion` → `description`
- `modalidad` → `Virtual-presencial`

**Resueltos automáticamente por la tool:**
- `contacto_id` (closure)
- `time_zone_contacto` (de `wp_contactos.timezone` vía `_get_timezone_contacto`)

**Respuesta esperada (200):** la tool busca el primer campo con valor de esta lista y lo devuelve tal cual al agente:

| Campo | Significado |
|---|---|
| `Respuesta` | Éxito (Edit Fields6) o error de email faltante (Edit Fields7) |
| `Diseponibilidad` (sic) | Horario no disponible (Edit Fields5) |
| `contexto` | Contacto ya tiene cita registrada hoy (`contexto1`) |
| `error` | Asesor reasignado por `grant_id` inválido (Edit Fields8) |
| `message` | Otros mensajes genéricos |

**Lógica de la tool:**
1. Resolver `tz` desde `wp_contactos.timezone`. Si está vacío → devolver `_MSG_SIN_TIMEZONE` (sin llamar al webhook).
2. POST al webhook con timeout 60s (más alto que disponibilidad porque incluye Nylas + DB writes).
3. Si status != 200 o respuesta no-JSON → `"Error al agendar cita: …"`.
4. Si respuesta vacía → `"Error al agendar cita: respuesta vacía del webhook"`.
5. Buscar el primer campo conocido (`Respuesta`, `Diseponibilidad`, `contexto`, `error`, `message`) y devolver su contenido.

**Cómo revertir esta tool:**
1. En `app/tools/scheduling.py`, dentro de `agendar_cita`, reemplazar el bloque "CAMBIO TEMPORAL — Agendamiento vía webhook n8n" por la llamada original:
   ```python
   req = CrearEventoRequest(
       start=hora_local_contacto,
       attendeeEmail=email_contacto,
       summary=titulo,
       description=descripcion or None,
       contacto_id=contacto_id,
       empresa_id=empresa_id,
       Virtual_presencial=modalidad,
       time_zone_contacto=tz,
   )
   resp = await crear_evento_core(req)
   if resp.error:
       return f"Error al agendar cita: {resp.error}"
   msg = (
       f"Cita agendada exitosamente.\n"
       f"  Asesor: {resp.asesor}\n"
       f"  Fecha/hora: {resp.inicio}\n"
       f"  Duración: {resp.duracion_minutos} minutos\n"
       f"  Modalidad: {resp.modalidad}\n"
       f"  Event ID: {resp.event_id}"
   )
   if resp.meet_link:
       msg += f"\n  Link de reunión: {resp.meet_link}"
   return msg
   ```
2. Borrar la constante `_AGENDAR_WEBHOOK_URL` si ninguna otra tool la usa.
3. Borrar los `# noqa: F401` de `CrearEventoRequest` y `crear_evento_core`.

## 3. `reagendar_cita` ✅

**Ubicación:** [`app/tools/scheduling.py`](app/tools/scheduling.py) — función `reagendar_cita` dentro de `_create_reagendar_cita_tool`.

**Endpoint:**
```
POST https://marketia.app.n8n.cloud/webhook/reagendar-dashboard
Content-Type: application/json
```

**Body enviado:**
```json
{
  "contacto_id": <int>,
  "event_id": "<de wp_citas>",
  "start": "YYYY-MM-DDTHH:MM:SS",
  "Virtual-presencial": "Virtual" | "Presencial",
  "time_zone_contacto": "<IANA tz>",
  "Duracion_minutos": <int, opcional>
}
```

**Cambio importante en la signature de la tool:**

Antes el agente debía pasar `event_id` como argumento. Ahora **el agente solo pasa**:
- `nuevo_inicio` → `start`
- `duracion_minutos` (opcional, 0 = mantener original)
- `modalidad` → `Virtual-presencial`

La tool resuelve internamente:
- `contacto_id` (closure)
- `time_zone_contacto` (de `wp_contactos.timezone`)
- `event_id` (de `wp_citas` — próxima cita pendiente/confirmada futura del contacto)

**Lógica para resolver `event_id`** (función helper `_get_event_id_pendiente`):
```sql
select event_id from wp_citas
where contacto_id = $1
  and estado in ('pendiente', 'confirmada')
  and fecha_hora >= now()
order by fecha_hora asc
limit 1;
```

Si no hay cita activa → la tool devuelve al agente:
> *"No se encontró una cita pendiente para reagendar. Verifica con el contacto si efectivamente tiene una cita activa o si ya fue cancelada."*

**Respuesta esperada:** mismo patrón que `agendar_cita` — la tool busca el primer campo con valor en orden: `Respuesta`, `Diseponibilidad`, `contexto`, `error`, `message`.

**Cómo revertir esta tool:**
1. En `app/tools/scheduling.py`, dentro de `reagendar_cita`:
   - Volver a agregar `event_id: str` como primer argumento de la signature.
   - Restaurar la llamada a `reagendar_evento_core(req)` con `ReagendarEventoRequest`.
2. Borrar `_REAGENDAR_WEBHOOK_URL`.
3. Borrar el helper `_get_event_id_pendiente` si no lo usa otra tool.
4. Borrar los `# noqa: F401` de `ReagendarEventoRequest` y `reagendar_evento_core`.

## 4. `cancelar_cita` ⏳

_Pendiente._

---

## Histórico

- **2026-04-24** — Migrada `consultar_disponibilidad` a webhook n8n. Resto pendiente.
- **2026-04-25** — Migrada `agendar_cita` a webhook n8n (`POST /webhook/crear-evento`). Restantes: `reagendar_cita`, `cancelar_cita`.
- **2026-04-25** — Migrada `reagendar_cita` a webhook n8n (`POST /webhook/reagendar-dashboard`). El agente ya no pasa `event_id`; la tool lo resuelve desde `wp_citas`. Restante: `cancelar_cita`.
