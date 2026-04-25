"""LangGraph tools de agendamiento — wrappers sobre app.services.scheduling.

Expone 4 herramientas al agente conversacional:
  - consultar_disponibilidad
  - agendar_cita
  - reagendar_cita
  - cancelar_cita
"""

import logging

import httpx
from langchain_core.tools import tool

from app.core.http_client import get_shared_http_client
from app.db import queries as db
from app.schemas.scheduling import (
    CrearEventoRequest,
    DisponibilidadRequest,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    EliminarEventoRequest,
    ReagendarEventoRequest,
)
from app.services.scheduling import (
    crear_evento_core,
    disponibilidad_agenda_core,  # noqa: F401 — se conserva como respaldo (CAMBIO TEMPORAL: webhook n8n)
    eliminar_evento_core,
    reagendar_evento_core,
)

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════
# CAMBIO TEMPORAL — Webhooks n8n (ver CAMBIOS_TEMPORALES.md)
# ════════════════════════════════════════════════════════════
_DISPONIBILIDAD_WEBHOOK_URL = "https://marketia.app.n8n.cloud/webhook/disponibilidad-nylas"
_WEBHOOK_TIMEOUT_S = 30.0

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
        event_id: str,
        nuevo_inicio: str,
        duracion_minutos: int = 0,
        modalidad: str = "Virtual",
    ) -> str:
        """📅 Reagendar cita — Cambia la fecha/hora de una cita existente.

        CUÁNDO USARLA:
        - El contacto quiere cambiar la fecha u hora de su cita
        - Se necesita mover la cita a otro horario

        El sistema selecciona automáticamente al mejor asesor disponible.
        Si el asesor original no está disponible, asigna uno nuevo.

        Args:
            event_id: ID del evento a reagendar (obtenido de consultar_disponibilidad o agendar_cita)
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

            req = ReagendarEventoRequest(
                event_id=event_id,
                start=nuevo_inicio,
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                Virtual_presencial=modalidad,
                Duracion_minutos=duracion_minutos if duracion_minutos > 0 else None,
                time_zone_contacto=tz,
            )
            resp = await reagendar_evento_core(req)

            if resp.error:
                return f"Error al reagendar: {resp.error}"

            msg = (
                f"Cita reagendada exitosamente.\n"
                f"  Asesor: {resp.asesor}\n"
                f"  Nuevo horario: {resp.nuevo_inicio}\n"
                f"  Duración: {resp.duracion_minutos} minutos\n"
                f"  Modalidad: {resp.modalidad}\n"
                f"  Event ID: {resp.event_id}"
            )
            if resp.cambio_asesor:
                msg += f"\n  NOTA: El asesor cambió de {resp.asesor_anterior} a {resp.asesor}"
            if resp.meet_link:
                msg += f"\n  Link de reunión: {resp.meet_link}"
            return msg
        except Exception as exc:
            logger.error("reagendar_cita tool error: %s", exc, exc_info=True)
            return f"Error al reagendar cita: {exc}"

    return reagendar_cita


# ════════════════════════════════════════════════════════════
# Tool 4: Cancelar cita
# ════════════════════════════════════════════════════════════


def _create_cancelar_cita_tool(contacto_id: int):

    @tool
    async def cancelar_cita(event_id: str) -> str:
        """🗑️ Cancelar cita — Elimina una cita del calendario y la marca como cancelada.

        CUÁNDO USARLA:
        - El contacto quiere cancelar su cita
        - Se necesita eliminar una cita existente

        Args:
            event_id: ID del evento a cancelar (obtenido de consultar_disponibilidad o agendar_cita)
        """
        try:
            req = EliminarEventoRequest(
                event_id=event_id,
                contacto_id=contacto_id,
            )
            resp = await eliminar_evento_core(req)

            if not resp.success:
                # Incluir el error completo para que el agente lo comunique al contacto
                detalle = resp.error or resp.mensaje or "Error desconocido"
                return (
                    f"No se pudo cancelar la cita en el calendario.\n"
                    f"  Detalle: {detalle}\n"
                    f"  Comunica al contacto que la cancelación falló y que debe intentarlo de nuevo."
                )

            return (
                f"Cita cancelada exitosamente y eliminada del calendario.\n"
                f"  Asesor: {resp.asesor}\n"
                f"  Event ID: {resp.event_id}\n"
                f"  {resp.mensaje}"
            )
        except Exception as exc:
            logger.error("cancelar_cita tool error: %s", exc, exc_info=True)
            return f"Error al cancelar cita: {exc}"

    return cancelar_cita
