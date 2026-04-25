"""LangGraph tools de agendamiento — wrappers sobre app.services.scheduling.

Expone 4 herramientas al agente conversacional:
  - consultar_disponibilidad
  - agendar_cita
  - reagendar_cita
  - cancelar_cita
"""

import logging
from datetime import datetime, timezone as _tz

import httpx
from langchain_core.tools import tool

from app.core.http_client import get_shared_http_client
from app.db import queries as db
from app.db.client import get_supabase
from app.schemas.scheduling import (
    CrearEventoRequest,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    DisponibilidadRequest,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    EliminarEventoRequest,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    ReagendarEventoRequest,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
)
from app.services.scheduling import (
    crear_evento_core,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    disponibilidad_agenda_core,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    eliminar_evento_core,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    reagendar_evento_core,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
)

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════
# CAMBIO TEMPORAL — Webhooks n8n (ver CAMBIOS_TEMPORALES.md)
# ════════════════════════════════════════════════════════════
_DISPONIBILIDAD_WEBHOOK_URL = "https://marketia.app.n8n.cloud/webhook/disponibilidad-nylas"
_AGENDAR_WEBHOOK_URL = "https://marketia.app.n8n.cloud/webhook/crear-evento"
_REAGENDAR_WEBHOOK_URL = "https://marketia.app.n8n.cloud/webhook/reagendar-dashboard"
_CANCELAR_WEBHOOK_URL = "https://marketia.app.n8n.cloud/webhook/cancelar-evento"
_WEBHOOK_TIMEOUT_S = 60.0  # crear-evento/reagendar pueden tardar más por validaciones + Nylas + DB

# Valores que indican timezone no configurado
_TIMEZONE_NO_DEFINIDO = {"por definir", "", "none", "null"}


async def _get_timezone_contacto(contacto_id: int) -> str | None:
    """Retorna el timezone del contacto, o None si no está definido."""
    try:
        contacto = await db.get_contacto(contacto_id)
        if not contacto:
            return None
        tz = (contacto.get("timezone") or "").strip()
        if tz.lower() in _TIMEZONE_NO_DEFINIDO:
            return None
        return tz
    except Exception as exc:
        logger.warning("No se pudo obtener timezone del contacto %s: %s", contacto_id, exc)
        return None


_MSG_SIN_TIMEZONE = (
    "ACCIÓN REQUERIDA — El contacto no tiene zona horaria configurada. "
    "Debes preguntarle en qué ciudad o país se encuentra ANTES de continuar con el agendamiento. "
    "Ejemplo: '¿En qué ciudad o país estás ubicado/a?'"
)


async def _get_event_id_pendiente(contacto_id: int) -> str | None:
    """Devuelve el event_id de la próxima cita pendiente/confirmada futura del contacto.

    Filtra:
      - estado in ('pendiente', 'confirmada')
      - fecha_hora >= ahora (UTC)
    Toma la más próxima en el tiempo (order asc, limit 1).
    """
    try:
        client = await get_supabase()
        now_iso = datetime.now(_tz.utc).isoformat()
        rows = await client.query(
            "wp_citas",
            select="event_id,fecha_hora,estado",
            filters={"contacto_id": contacto_id},
            raw_filters={
                "estado": "in.(pendiente,confirmada)",
                "fecha_hora": f"gte.{now_iso}",
            },
            order="fecha_hora",
            order_desc=False,
            limit=1,
        )
        if not isinstance(rows, list) or not rows:
            return None
        ev = (rows[0].get("event_id") or "").strip()
        return ev or None
    except Exception as exc:
        logger.warning("No se pudo obtener event_id pendiente del contacto %s: %s", contacto_id, exc)
        return None


# ════════════════════════════════════════════════════════════
# Tool 1: Consultar disponibilidad
# ════════════════════════════════════════════════════════════


def _create_consultar_disponibilidad_tool(contacto_id: int, empresa_id: int):

    @tool
    async def consultar_disponibilidad(time_zone: str = "") -> str:
        """📅 Consultar disponibilidad de agenda — Muestra los horarios disponibles para agendar una cita en los próximos 7 días.

        CUÁNDO USARLA:
        - El contacto pregunta por horarios disponibles
        - Antes de agendar una cita, para ofrecer opciones
        - Cuando quiere saber si hay disponibilidad en una fecha

        IMPORTANTE — Al presentar opciones al contacto:
        - SIEMPRE ofrece primero el horario más cercano a la hora actual.
        - Si hay disponibilidad HOY, ofrécela antes que días futuros.
        - Presenta máximo 2-3 opciones, empezando por la más próxima.

        Args:
            time_zone: Zona horaria del contacto (ej: America/Bogota, America/New_York). Dejar vacío para usar la zona del perfil.
        """
        try:
            # Verificar timezone — si no está definido, pedir al agente que lo pregunte
            tz = time_zone.strip() if time_zone else ""
            if not tz:
                tz = await _get_timezone_contacto(contacto_id) or ""
            if not tz or tz.lower() in _TIMEZONE_NO_DEFINIDO:
                return _MSG_SIN_TIMEZONE

            # ─────────────────────────────────────────────────────────────────
            # CAMBIO TEMPORAL — Disponibilidad vía webhook n8n.
            # La lógica original (disponibilidad_agenda_core con Nylas directo)
            # se conserva en app/services/scheduling.py como respaldo.
            # Ver CAMBIOS_TEMPORALES.md.
            # ─────────────────────────────────────────────────────────────────
            client = get_shared_http_client()
            try:
                r = await client.get(
                    _DISPONIBILIDAD_WEBHOOK_URL,
                    params={"contacto_id": contacto_id, "time_zone_contacto": tz},
                    timeout=_WEBHOOK_TIMEOUT_S,
                )
            except httpx.HTTPError as exc:
                logger.warning("Webhook disponibilidad-nylas error de red: %s", exc)
                return f"Error al consultar disponibilidad: {exc}"

            if r.status_code != 200:
                logger.warning(
                    "Webhook disponibilidad-nylas status=%s body=%s",
                    r.status_code, r.text[:300],
                )
                return f"Error al consultar disponibilidad: status {r.status_code}"

            try:
                data = r.json()
            except Exception:
                logger.warning("Webhook disponibilidad-nylas respuesta no-JSON: %s", r.text[:300])
                return "Error al consultar disponibilidad: respuesta no es JSON"

            texto = (data or {}).get("availabilityText", "").strip() if isinstance(data, dict) else ""
            if not texto:
                logger.warning("Webhook disponibilidad-nylas sin availabilityText: %s", str(data)[:300])
                return "No se pudo obtener el calendario de los asesores."

            return texto
        except Exception as exc:
            logger.error("consultar_disponibilidad tool error: %s", exc, exc_info=True)
            return f"Error al consultar disponibilidad: {exc}"

    return consultar_disponibilidad


# ════════════════════════════════════════════════════════════
# Tool 2: Agendar cita
# ════════════════════════════════════════════════════════════


def _create_agendar_cita_tool(contacto_id: int, empresa_id: int):

    @tool
    async def agendar_cita(
        hora_local_contacto: str,
        email_contacto: str,
        titulo: str,
        modalidad: str = "Virtual",
        descripcion: str = "",
    ) -> str:
        """📅 Agendar cita — Crea una cita con un asesor disponible en el horario indicado.

        CUÁNDO USARLA:
        - El contacto confirma que quiere agendar en un horario específico
        - Ya se consultó disponibilidad y el contacto eligió un horario

        IMPORTANTE: Primero usa consultar_disponibilidad para verificar horarios libres.

        Args:
            hora_local_contacto: Fecha y hora EXACTAMENTE como la dijo el contacto, en su hora local.
                Formato ISO sin timezone: YYYY-MM-DDTHH:MM:SS
                Ejemplo: si el contacto dice "a las 10 AM", enviar "2026-04-15T10:00:00".
                ⚠️ NUNCA convertir a UTC. NUNCA sumar ni restar horas de offset.
                Si envías T15:00:00 pensando que son las 10 AM en UTC, la cita quedará
                a las 3 PM hora local del contacto — 5 horas tarde.
                El sistema lee la zona horaria del contacto y hace la conversión a UTC internamente.
            email_contacto: Email del contacto para la invitación al calendario
            titulo: Título del evento (ej: "Consulta | Juan Pérez")
            modalidad: "Virtual" (genera link de Google Meet) o "Presencial"
            descripcion: Descripción opcional del evento
        """
        try:
            # Verificar timezone antes de agendar
            tz = await _get_timezone_contacto(contacto_id)
            if not tz:
                return _MSG_SIN_TIMEZONE

            # ─────────────────────────────────────────────────────────────────
            # CAMBIO TEMPORAL — Agendamiento vía webhook n8n.
            # La lógica original (crear_evento_core con Nylas directo) se
            # conserva en app/services/scheduling.py como respaldo.
            # Ver CAMBIOS_TEMPORALES.md.
            # ─────────────────────────────────────────────────────────────────
            payload = {
                "contacto_id": contacto_id,
                "start": hora_local_contacto,
                "attendeeEmail": email_contacto,
                "summary": titulo,
                "description": descripcion or "",
                "Virtual-presencial": modalidad,
                "time_zone_contacto": tz,
            }
            client = get_shared_http_client()
            try:
                r = await client.post(
                    _AGENDAR_WEBHOOK_URL,
                    json=payload,
                    timeout=_WEBHOOK_TIMEOUT_S,
                )
            except httpx.HTTPError as exc:
                logger.warning("Webhook crear-evento error de red: %s", exc)
                return f"Error al agendar cita: {exc}"

            if r.status_code != 200:
                logger.warning(
                    "Webhook crear-evento status=%s body=%s",
                    r.status_code, r.text[:300],
                )
                return f"Error al agendar cita: status {r.status_code}"

            try:
                data = r.json()
            except Exception:
                logger.warning("Webhook crear-evento respuesta no-JSON: %s", r.text[:300])
                return "Error al agendar cita: respuesta no es JSON"

            if not isinstance(data, dict) or not data:
                logger.warning("Webhook crear-evento respuesta vacía/inesperada: %s", str(data)[:300])
                return "Error al agendar cita: respuesta vacía del webhook"

            # El webhook devuelve la respuesta en distintos campos según la rama:
            #   - "Respuesta": éxito (Edit Fields6) o error de email (Edit Fields7)
            #   - "Diseponibilidad" (sic): horario no disponible (Edit Fields5)
            #   - "contexto": ya tiene cita registrada hoy (contexto1)
            #   - "error": asesor reasignado por grant_id inválido (Edit Fields8)
            for key in ("Respuesta", "Diseponibilidad", "contexto", "error", "message"):
                val = data.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()

            logger.warning("Webhook crear-evento sin campo conocido: %s", str(data)[:300])
            return "No se pudo procesar la respuesta del agendamiento."
        except Exception as exc:
            logger.error("agendar_cita tool error: %s", exc, exc_info=True)
            return f"Error al agendar cita: {exc}"

    return agendar_cita


# ════════════════════════════════════════════════════════════
# Tool 3: Reagendar cita
# ════════════════════════════════════════════════════════════


def _create_reagendar_cita_tool(contacto_id: int, empresa_id: int):

    @tool
    async def reagendar_cita(
        nuevo_inicio: str,
        duracion_minutos: int = 0,
        modalidad: str = "Virtual",
    ) -> str:
        """📅 Reagendar cita — Cambia la fecha/hora de la cita activa del contacto.

        CUÁNDO USARLA:
        - El contacto quiere cambiar la fecha u hora de su cita
        - Se necesita mover la cita a otro horario

        El sistema busca automáticamente la cita pendiente/confirmada futura del
        contacto y la reagenda al nuevo horario. NO necesitas pasarle el event_id;
        se resuelve internamente desde wp_citas.

        Args:
            nuevo_inicio: Nueva fecha/hora EXACTAMENTE como la dijo el contacto, en su hora local.
                Formato ISO sin timezone: YYYY-MM-DDTHH:MM:SS
                Ejemplo: si el contacto dice "a las 10 AM", enviar "2026-04-16T10:00:00".
                ⚠️ NUNCA convertir a UTC. NUNCA sumar ni restar horas de offset.
                El sistema lee la zona horaria del contacto y hace la conversión a UTC internamente.
            duracion_minutos: Duración en minutos (0 = mantener duración original)
            modalidad: "Virtual" o "Presencial"
        """
        try:
            # Verificar timezone antes de reagendar
            tz = await _get_timezone_contacto(contacto_id)
            if not tz:
                return _MSG_SIN_TIMEZONE

            # Resolver event_id desde wp_citas (próxima cita pendiente/confirmada)
            event_id = await _get_event_id_pendiente(contacto_id)
            if not event_id:
                return (
                    "No se encontró una cita pendiente para reagendar. "
                    "Verifica con el contacto si efectivamente tiene una cita activa "
                    "o si ya fue cancelada."
                )

            # ─────────────────────────────────────────────────────────────────
            # CAMBIO TEMPORAL — Reagendamiento vía webhook n8n.
            # La lógica original (reagendar_evento_core con Nylas directo) se
            # conserva en app/services/scheduling.py como respaldo.
            # Ver CAMBIOS_TEMPORALES.md.
            # ─────────────────────────────────────────────────────────────────
            payload: dict = {
                "contacto_id": contacto_id,
                "event_id": event_id,
                "start": nuevo_inicio,
                "Virtual-presencial": modalidad,
                "time_zone_contacto": tz,
            }
            if duracion_minutos and duracion_minutos > 0:
                payload["Duracion_minutos"] = duracion_minutos

            client = get_shared_http_client()
            try:
                r = await client.post(
                    _REAGENDAR_WEBHOOK_URL,
                    json=payload,
                    timeout=_WEBHOOK_TIMEOUT_S,
                )
            except httpx.HTTPError as exc:
                logger.warning("Webhook reagendar-dashboard error de red: %s", exc)
                return f"Error al reagendar: {exc}"

            if r.status_code != 200:
                logger.warning(
                    "Webhook reagendar-dashboard status=%s body=%s",
                    r.status_code, r.text[:300],
                )
                return f"Error al reagendar: status {r.status_code}"

            try:
                data = r.json()
            except Exception:
                logger.warning("Webhook reagendar-dashboard respuesta no-JSON: %s", r.text[:300])
                return "Error al reagendar: respuesta no es JSON"

            if not isinstance(data, dict) or not data:
                logger.warning("Webhook reagendar-dashboard respuesta vacía: %s", str(data)[:300])
                return "Error al reagendar: respuesta vacía del webhook"

            # Mismo patrón que agendar_cita: distintos campos según rama del workflow.
            for key in ("Respuesta", "Diseponibilidad", "contexto", "error", "message"):
                val = data.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()

            logger.warning("Webhook reagendar-dashboard sin campo conocido: %s", str(data)[:300])
            return "No se pudo procesar la respuesta del reagendamiento."
        except Exception as exc:
            logger.error("reagendar_cita tool error: %s", exc, exc_info=True)
            return f"Error al reagendar cita: {exc}"

    return reagendar_cita


# ════════════════════════════════════════════════════════════
# Tool 4: Cancelar cita
# ════════════════════════════════════════════════════════════


def _create_cancelar_cita_tool(contacto_id: int):

    @tool
    async def cancelar_cita() -> str:
        """🗑️ Cancelar cita — Elimina la cita activa del contacto del calendario.

        CUÁNDO USARLA (OBLIGATORIO antes de cualquier mensaje de confirmación):
        - El contacto dice que NO puede asistir o NO llegará
        - El contacto quiere cancelar / anular / dar de baja la cita
        - Le surgió un imprevisto o conflicto de horario
        - Pide reagendar (en ese caso: primero cancelar, después agendar la nueva)

        El sistema busca automáticamente la cita pendiente/confirmada futura del
        contacto y la cancela. NO necesitas pasarle el event_id; se resuelve
        internamente desde wp_citas.

        ⚠️ NUNCA confirmes al contacto que la cita "queda cancelada" sin antes
        haber invocado esta tool y recibido confirmación de éxito. Si la tool
        devuelve error, comunícale al contacto que hubo un problema y pídele
        que confirme nuevamente.
        """
        try:
            # Resolver event_id desde wp_citas (próxima cita pendiente/confirmada)
            event_id = await _get_event_id_pendiente(contacto_id)
            if not event_id:
                return (
                    "No se encontró una cita pendiente para cancelar. "
                    "El contacto no tiene citas activas en este momento."
                )

            # ─────────────────────────────────────────────────────────────────
            # CAMBIO TEMPORAL — Cancelación vía webhook n8n.
            # La lógica original (eliminar_evento_core con Nylas DELETE directo)
            # se conserva en app/services/scheduling.py como respaldo.
            # Ver CAMBIOS_TEMPORALES.md.
            # ─────────────────────────────────────────────────────────────────
            payload = {
                "contacto_id": contacto_id,
                "event_id": event_id,
            }

            client = get_shared_http_client()
            try:
                # OJO: el webhook usa PUT, no POST.
                r = await client.request(
                    "PUT",
                    _CANCELAR_WEBHOOK_URL,
                    json=payload,
                    timeout=_WEBHOOK_TIMEOUT_S,
                )
            except httpx.HTTPError as exc:
                logger.warning("Webhook cancelar-evento error de red: %s", exc)
                return f"Error al cancelar cita: {exc}"

            if r.status_code != 200:
                logger.warning(
                    "Webhook cancelar-evento status=%s body=%s",
                    r.status_code, r.text[:300],
                )
                return f"Error al cancelar cita: status {r.status_code}"

            try:
                data = r.json()
            except Exception:
                logger.warning("Webhook cancelar-evento respuesta no-JSON: %s", r.text[:300])
                # Si el body es vacío pero el status es 200, asumimos OK best-effort
                if not (r.text or "").strip():
                    return (
                        f"Cita cancelada (event_id: {event_id}). "
                        "Confirma al contacto que su cita queda cancelada."
                    )
                return "Error al cancelar cita: respuesta no es JSON"

            if not isinstance(data, dict) or not data:
                logger.warning("Webhook cancelar-evento respuesta vacía: %s", str(data)[:300])
                # Status 200 + JSON vacío → asumimos éxito best-effort
                return (
                    f"Cita cancelada (event_id: {event_id}). "
                    "Confirma al contacto que su cita queda cancelada."
                )

            # Mismo patrón que las otras tools.
            for key in ("Respuesta", "contexto", "error", "message"):
                val = data.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()

            logger.warning("Webhook cancelar-evento sin campo conocido: %s", str(data)[:300])
            return f"Cita cancelada (event_id: {event_id})."
        except Exception as exc:
            logger.error("cancelar_cita tool error: %s", exc, exc_info=True)
            return f"Error al cancelar cita: {exc}"

    return cancelar_cita
