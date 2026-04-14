"""Rutas de agendamiento — thin HTTP wrapper sobre app.services.scheduling.

Endpoints:
  POST /api/v1/scheduling/disponibilidad
  POST /api/v1/scheduling/crear-evento
  POST /api/v1/scheduling/reagendar-evento
  POST /api/v1/scheduling/eliminar-evento
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.core.error_webhook import send_error_to_webhook
from app.schemas.scheduling import (
    CrearEventoRequest,
    CrearEventoResponse,
    DisponibilidadRequest,
    DisponibilidadResponse,
    EliminarEventoRequest,
    EliminarEventoResponse,
    ReagendarEventoRequest,
    ReagendarEventoResponse,
)
from app.services.scheduling import (
    crear_evento_core,
    disponibilidad_agenda_core,
    eliminar_evento_core,
    reagendar_evento_core,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scheduling", tags=["scheduling"])


# ════════════════════════════════════════════════════════════
# ENDPOINT 1: POST /disponibilidad
# ════════════════════════════════════════════════════════════


@router.post("/disponibilidad", response_model=DisponibilidadResponse)
async def disponibilidad_agenda(req: DisponibilidadRequest):
    """Consulta la disponibilidad de asesores para los próximos 7 días."""
    try:
        return await disponibilidad_agenda_core(req)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("disponibilidad_agenda error inesperado: %s", exc, exc_info=True)
        await send_error_to_webhook(
            exc,
            context="scheduling_disponibilidad",
            severity="error",
            fallback=(
                f"Se devolvió DisponibilidadResponse con error al agente — "
                f"contacto_id={req.contacto_id} empresa_id={req.empresa_id}"
            ),
        )
        return DisponibilidadResponse(
            error=f"Error interno al consultar disponibilidad: {type(exc).__name__}: {exc}",
            contacto_id=req.contacto_id,
            empresa_id=req.empresa_id or 0,
            time_zone=req.time_zone_contacto or "America/Bogota",
            hora_actual=datetime.now(timezone.utc).isoformat(),
            total_asesores=0,
            asesores_consultados=0,
            tiempo_consulta_ms=0,
            disponibilidad=[],
            hay_disponibilidad=False,
        )


# ════════════════════════════════════════════════════════════
# ENDPOINT 2: POST /crear-evento
# ════════════════════════════════════════════════════════════


@router.post("/crear-evento", response_model=CrearEventoResponse)
async def crear_evento_calendario(req: CrearEventoRequest):
    """Crea un evento/cita en el calendario del asesor."""
    try:
        return await crear_evento_core(req)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("crear_evento_calendario error inesperado: %s", exc, exc_info=True)
        await send_error_to_webhook(
            exc,
            context="scheduling_crear_evento",
            severity="error",
            fallback=(
                f"Se devolvió CrearEventoResponse con error al agente — "
                f"contacto_id={req.contacto_id} empresa_id={req.empresa_id} start={req.start}"
            ),
        )
        return CrearEventoResponse(error=f"Error interno al crear el evento: {type(exc).__name__}: {exc}")


# ════════════════════════════════════════════════════════════
# ENDPOINT 3: POST /reagendar-evento
# ════════════════════════════════════════════════════════════


@router.post("/reagendar-evento", response_model=ReagendarEventoResponse)
async def reagendar_evento(req: ReagendarEventoRequest):
    """Reagenda un evento existente a nueva fecha/hora."""
    try:
        return await reagendar_evento_core(req)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("reagendar_evento error inesperado: %s", exc, exc_info=True)
        await send_error_to_webhook(
            exc,
            context="scheduling_reagendar_evento",
            severity="error",
            fallback=(
                f"Se devolvió ReagendarEventoResponse con error al agente — "
                f"event_id={req.event_id} contacto_id={req.contacto_id} start={req.start}"
            ),
        )
        return ReagendarEventoResponse(error=f"Error interno al reagendar el evento: {type(exc).__name__}: {exc}")


# ════════════════════════════════════════════════════════════
# ENDPOINT 4: POST /eliminar-evento
# ════════════════════════════════════════════════════════════


@router.post("/eliminar-evento", response_model=EliminarEventoResponse)
async def eliminar_evento(req: EliminarEventoRequest):
    """Cancela un evento — elimina de Nylas y marca como 'cancelada' en Supabase."""
    try:
        return await eliminar_evento_core(req)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("eliminar_evento error inesperado: %s", exc, exc_info=True)
        await send_error_to_webhook(
            exc,
            context="scheduling_eliminar_evento",
            severity="error",
            fallback=(
                f"Se devolvió EliminarEventoResponse con error al agente — "
                f"event_id={req.event_id} contacto_id={req.contacto_id}"
            ),
        )
        return EliminarEventoResponse(error=f"Error interno al eliminar el evento: {type(exc).__name__}: {exc}")
