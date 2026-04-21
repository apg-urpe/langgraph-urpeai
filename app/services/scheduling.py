"""Lógica core de agendamiento — consumida por scheduling_routes.py (HTTP) y tools/scheduling.py (LangGraph).

Extraído de scheduling_routes.py para evitar duplicar lógica de negocio.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.db.client import get_supabase
from app.nylas_client.client import get_nylas
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

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════
# Constantes
# ════════════════════════════════════════════════════════════

DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
_SLOT_WINDOW_DEFAULT = [{"inicio": "07:00", "fin": "20:00"}]

# ════════════════════════════════════════════════════════════
# Grant management (in-memory state)
# ════════════════════════════════════════════════════════════

NYLAS_GRANT_DISABLE_TTL = timedelta(hours=1)
DISABLED_NYLAS_GRANTS: dict[str, dict[str, Any]] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _prune_disabled_nylas_grants() -> None:
    now = _utc_now()
    expired = [grant_id for grant_id, meta in DISABLED_NYLAS_GRANTS.items() if meta["until"] <= now]
    for grant_id in expired:
        DISABLED_NYLAS_GRANTS.pop(grant_id, None)


def _get_disabled_nylas_grant(grant_id: str | None) -> dict[str, Any] | None:
    if not grant_id:
        return None
    _prune_disabled_nylas_grants()
    return DISABLED_NYLAS_GRANTS.get(grant_id)


def should_disable_nylas_grant(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {401, 403, 404}
    return False


def disable_nylas_grant(asesor: dict[str, Any], reason: Exception | str) -> None:
    grant_id = asesor.get("grant_id")
    if not grant_id:
        return

    until = _utc_now() + NYLAS_GRANT_DISABLE_TTL
    DISABLED_NYLAS_GRANTS[grant_id] = {
        "until": until,
        "asesor_id": asesor.get("id"),
        "reason": str(reason),
    }
    logger.warning(
        "Grant Nylas inhabilitado temporalmente asesor_id=%s grant_id=%s until=%s reason=%s",
        asesor.get("id"),
        grant_id,
        until.isoformat(),
        str(reason),
    )


def asesor_grant_habilitado(asesor: dict[str, Any] | None) -> bool:
    if not asesor:
        return False

    grant_id = asesor.get("grant_id")
    if not grant_id or grant_id == "Solicitud enviada":
        return False

    disabled = _get_disabled_nylas_grant(grant_id)
    if disabled:
        logger.info(
            "Asesor %s omitido por grant Nylas inhabilitado hasta %s",
            asesor.get("id"),
            disabled["until"].isoformat(),
        )
        return False

    return True


def nylas_grant_disabled_message() -> str:
    return "El calendario del asesor está temporalmente inhabilitado. Intenta nuevamente más tarde."


# ════════════════════════════════════════════════════════════
# Normalización de timezones
# ════════════════════════════════════════════════════════════

def normalizar_tz(tz_name: str | None) -> str | None:
    """Normaliza el nombre de timezone. Retorna None si no está definido."""
    if not tz_name or tz_name.strip().lower() in ("por definir", "none", "null", ""):
        return None
    if tz_name == "America/Argentina":
        return "America/Argentina/Buenos_Aires"
    return tz_name.strip()


# ════════════════════════════════════════════════════════════
# Helpers puros
# ════════════════════════════════════════════════════════════

def ahora_en_tz(tz_name: str) -> datetime:
    return datetime.now(ZoneInfo(tz_name))


def periodo_dia(hora: int) -> str:
    if hora < 12:
        return "Mañana"
    if hora < 18:
        return "Tarde"
    return "Noche"


def describir_horarios(disponibilidad: dict | None) -> str:
    if not disponibilidad:
        return "no configurado"
    horarios = disponibilidad.get("horarios_normales") or {}
    dias_con_horario = []
    for dia in DIAS_SEMANA:
        franjas = horarios.get(dia, [])
        if franjas:
            rangos = ", ".join(f"{f['inicio']}-{f['fin']}" for f in franjas if "inicio" in f and "fin" in f)
            if rangos:
                dias_con_horario.append(f"{dia} {rangos}")
    return ", ".join(dias_con_horario) if dias_con_horario else "no configurado"


def rangos_solapan(start1: int, end1: int, start2: int, end2: int) -> bool:
    return start1 < end2 and end1 > start2


def calcular_slots(
    fecha: datetime,
    busy_periods: list[dict[str, int]],
    duracion_min: int,
    tz_name: str,
    ventanas: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Calcula slots disponibles para un día filtrando por eventos de Nylas.

    Args:
        ventanas: Lista de franjas horarias [{inicio: "HH:MM", fin: "HH:MM"}].
                  Si es None, usa _SLOT_WINDOW_DEFAULT (7am-8pm).
    """
    slots: list[dict[str, Any]] = []
    tz = ZoneInfo(tz_name)
    ahora_unix = int(time.time())

    franjas = ventanas if ventanas else _SLOT_WINDOW_DEFAULT

    for horario in franjas:
        try:
            inicio_h, inicio_m = map(int, horario["inicio"].split(":"))
            fin_h, fin_m = map(int, horario["fin"].split(":"))
        except Exception:
            continue

        current_h, current_m = inicio_h, inicio_m

        while current_h < fin_h or (current_h == fin_h and current_m < fin_m):
            local_dt = datetime(
                fecha.year, fecha.month, fecha.day,
                current_h, current_m, 0,
                tzinfo=tz,
            )
            slot_start_utc = local_dt.astimezone(timezone.utc)
            slot_end_utc = slot_start_utc + timedelta(minutes=duracion_min)

            start_unix = int(slot_start_utc.timestamp())
            end_unix = int(slot_end_utc.timestamp())

            esta_ocupado = any(
                rangos_solapan(start_unix, end_unix, bp["start"], bp["end"])
                for bp in busy_periods
            )

            if not esta_ocupado and start_unix > ahora_unix:
                hora_local = local_dt.strftime("%I:%M %p").lower().lstrip("0")
                slots.append({
                    "inicio": slot_start_utc.isoformat(),
                    "fin": slot_end_utc.isoformat(),
                    "hora": hora_local,
                    "startUnix": start_unix,
                    "endUnix": end_unix,
                })

            current_m += duracion_min
            while current_m >= 60:
                current_m -= 60
                current_h += 1

    return slots


def hora_dentro_de_horarios_normales(dt_utc: datetime, disponibilidad: dict | None, tz_name: str, duracion_min: int) -> bool:
    if not disponibilidad:
        return True

    horarios_normales = disponibilidad.get("horarios_normales") or {}
    if not horarios_normales:
        return True

    tz = ZoneInfo(tz_name)
    dt_local = dt_utc.astimezone(tz)
    dt_fin_local = (dt_utc + timedelta(minutes=duracion_min)).astimezone(tz)

    dia_nombre = DIAS_SEMANA[dt_local.weekday()]
    franjas = horarios_normales.get(dia_nombre, [])
    if not franjas:
        return False

    slot_inicio_min = dt_local.hour * 60 + dt_local.minute
    slot_fin_min = dt_fin_local.hour * 60 + dt_fin_local.minute

    for franja in franjas:
        try:
            ini_h, ini_m = map(int, franja["inicio"].split(":"))
            fin_h, fin_m = map(int, franja["fin"].split(":"))
            franja_inicio_min = ini_h * 60 + ini_m
            franja_fin_min = fin_h * 60 + fin_m
            if slot_inicio_min >= franja_inicio_min and slot_fin_min <= franja_fin_min:
                return True
        except Exception:
            continue

    return False


def parse_iso_to_unix(iso_str: str, tz_name: str | None = None) -> tuple[int, datetime]:
    """Parsea un ISO datetime a (unix_timestamp, datetime).

    Si el string no incluye información de zona horaria, se usa tz_name
    (zona del contacto). Si tz_name tampoco está disponible, se asume UTC.
    """
    parts = iso_str.split("T")
    y, m, d = map(int, parts[0].split("-"))
    time_parts = (parts[1] if len(parts) > 1 else "00:00:00").split(":")
    h = int(time_parts[0]) if len(time_parts) > 0 else 0
    mi = int(time_parts[1]) if len(time_parts) > 1 else 0
    s = int(float(time_parts[2])) if len(time_parts) > 2 else 0

    # Intentar parsear timezone embebida en el string (ej: +05:00 o Z)
    try:
        dt_parsed = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt_parsed.tzinfo is not None:
            return int(dt_parsed.timestamp()), dt_parsed
    except Exception:
        pass

    # Sin timezone en el string — usar zona del contacto, no UTC
    if tz_name:
        try:
            dt = datetime(y, m, d, h, mi, s, tzinfo=ZoneInfo(tz_name))
            return int(dt.timestamp()), dt
        except Exception:
            pass

    dt = datetime(y, m, d, h, mi, s, tzinfo=timezone.utc)
    return int(dt.timestamp()), dt


# ════════════════════════════════════════════════════════════
# Queries Supabase
# ════════════════════════════════════════════════════════════


async def get_asesores_by_empresa(empresa_id: int) -> list[dict[str, Any]]:
    db = await get_supabase()
    asesores = await db.query(
        "wp_team_humano",
        select="id,nombre,apellido,email,grant_id,timezone,duracion_cita_minutos",
        filters={"empresa_id": empresa_id, "is_active": True, "acepta_citas": True},
    )
    if not asesores or not isinstance(asesores, list):
        return []
    return [a for a in asesores if asesor_grant_habilitado(a)]


async def get_asesor_by_id(asesor_id: int) -> dict[str, Any] | None:
    db = await get_supabase()
    return await db.query(
        "wp_team_humano",
        select="id,nombre,apellido,email,grant_id,timezone,duracion_cita_minutos",
        filters={"id": asesor_id, "is_active": True, "acepta_citas": True},
        single=True,
    )


async def get_asesor_fijo_de_contacto(contacto_id: int) -> dict[str, Any] | None:
    db = await get_supabase()
    cita = await db.query(
        "wp_citas",
        select="team_humano_id",
        filters={"contacto_id": contacto_id},
        order="fecha_hora",
        order_desc=True,
        limit=20,
    )
    cita_realizada = None
    if isinstance(cita, list):
        citas_all = await db.query(
            "wp_citas",
            select="team_humano_id,estado",
            filters={"contacto_id": contacto_id},
            order="fecha_hora",
            order_desc=True,
            limit=20,
        )
        if isinstance(citas_all, list):
            for c in citas_all:
                if c.get("estado") and "realizada" in c["estado"].lower():
                    cita_realizada = c
                    break

    if not cita_realizada or not cita_realizada.get("team_humano_id"):
        return None

    asesor = await get_asesor_by_id(cita_realizada["team_humano_id"])
    if not asesor_grant_habilitado(asesor):
        return None

    logger.info("🔒 Contacto %s tiene asesor fijo: %s %s", contacto_id, asesor["nombre"], asesor.get("apellido", ""))
    return asesor


async def get_conteo_citas_por_asesor(empresa_id: int, tz_name: str = "America/New_York") -> dict[int, int]:
    db = await get_supabase()
    tz = ZoneInfo(tz_name)
    ahora = datetime.now(tz)
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    fin_dia = (ahora.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()

    params = [
        ("select", "team_humano_id"),
        ("empresa_id", f"eq.{empresa_id}"),
        ("estado", "eq.confirmada"),
        ("fecha_hora", f"gte.{inicio_dia}"),
        ("fecha_hora", f"lt.{fin_dia}"),
    ]
    r = await db._http.get("/wp_citas", params=params)
    r.raise_for_status()
    try:
        citas = r.json()
    except Exception:
        logger.warning("get_conteo_citas_por_asesor: respuesta no-JSON de Supabase (status=%s), asumiendo sin citas", r.status_code)
        citas = []

    conteo: dict[int, int] = {}
    if isinstance(citas, list):
        for c in citas:
            tid = c.get("team_humano_id")
            if tid:
                conteo[tid] = conteo.get(tid, 0) + 1
    return conteo


async def get_cita_contacto(contacto_id: int) -> dict[str, Any]:
    db = await get_supabase()
    citas = await db.query(
        "wp_citas",
        select="id,fecha_hora,titulo,ubicacion,estado,team_humano_id,empresa_id,event_id",
        filters={"contacto_id": contacto_id},
        order="fecha_hora",
        order_desc=True,
        limit=5,
    )
    if not isinstance(citas, list) or not citas:
        return {"tiene_cita": False, "texto": None, "link": None, "fecha": None, "estado": "(Sin cita registrada)"}

    cita = next((c for c in citas if c.get("estado") == "confirmada"), None)
    if not cita:
        cita = next((c for c in citas if c.get("estado") != "cancelada"), None)
    if not cita:
        cita = citas[0]

    empresa_nombre = ""
    if cita.get("empresa_id"):
        emp = await db.query("wp_empresa_perfil", select="nombre", filters={"id": cita["empresa_id"]}, single=True)
        empresa_nombre = (emp or {}).get("nombre", "")

    asesor_nombre = ""
    if cita.get("team_humano_id"):
        ase = await db.query("wp_team_humano", select="nombre,apellido", filters={"id": cita["team_humano_id"]}, single=True)
        if ase:
            asesor_nombre = f"{ase['nombre']} {(ase.get('apellido') or '')[:1]}"

    ubicacion = cita.get("ubicacion") or ""
    es_virtual = any(x in ubicacion.lower() for x in ["meet.google.com", "zoom", "virtual"])
    modalidad = "Virtual" if es_virtual else "Presencial"

    return {
        "tiene_cita": True,
        "texto": f"🗓️ | {asesor_nombre} | {empresa_nombre} | {modalidad}",
        "link": ubicacion if es_virtual else None,
        "fecha": cita.get("fecha_hora"),
        "estado": cita.get("estado") or "confirmada",
        "event_id": cita.get("event_id"),
    }


async def guardar_cita_en_supabase(params: dict[str, Any]) -> int | None:
    db = await get_supabase()
    ahora = datetime.now(timezone.utc).isoformat()
    event_id = params["eventId"]

    existente = await db.query("wp_citas", select="id", filters={"event_id": event_id}, single=True)

    if existente:
        await db.update("wp_citas", {"id": existente["id"]}, {
            "team_humano_id": params["asesorId"],
            "fecha_hora": params["fechaHora"],
            "duracion": params["duracion"],
            "titulo": params["titulo"],
            "ubicacion": params.get("ubicacion"),
            "estado": params.get("estado", "confirmada"),
            "updated_at": ahora,
            "sincronizacion": "sincronizado",
        })
        logger.info("✅ wp_citas actualizado (id: %s)", existente["id"])
        return existente["id"]
    else:
        nueva = await db.insert("wp_citas", {
            "contacto_id": params["contactoId"],
            "empresa_id": params["empresaId"],
            "team_humano_id": params["asesorId"],
            "event_id": event_id,
            "fecha_hora": params["fechaHora"],
            "duracion": params["duracion"],
            "titulo": params["titulo"],
            "ubicacion": params.get("ubicacion"),
            "estado": params.get("estado", "confirmada"),
            "created_at": ahora,
            "updated_at": ahora,
            "sincronizacion": "sincronizado",
        })
        logger.info("✅ wp_citas insertado (id: %s)", nueva.get("id"))
        return nueva.get("id")


async def actualizar_estado_cita(event_id: str, nuevo_estado: str) -> bool:
    db = await get_supabase()
    ahora = datetime.now(timezone.utc).isoformat()
    await db.update("wp_citas", {"event_id": event_id}, {"estado": nuevo_estado, "updated_at": ahora})
    logger.info("✅ Estado de cita actualizado a: %s", nuevo_estado)
    return True


async def actualizar_asesor_en_contacto(contacto_id: int, asesor_id: int):
    db = await get_supabase()
    ahora = datetime.now(timezone.utc).isoformat()
    await db.update("wp_contactos", {"id": contacto_id}, {"team_humano_id": asesor_id, "updated_at": ahora})
    logger.info("✅ wp_contactos actualizado — asesor %s asignado a contacto %s", asesor_id, contacto_id)


# ════════════════════════════════════════════════════════════
# Nylas interaction
# ════════════════════════════════════════════════════════════


async def asesor_ocupado(nylas, asesor: dict, start_unix: int, end_unix: int,
                        exclude_event_id: str | None = None) -> bool:
    if not asesor_grant_habilitado(asesor):
        return True

    grant_id = asesor["grant_id"]
    email = asesor["email"]

    if not exclude_event_id:
        try:
            fb_data = await nylas.get_free_busy(grant_id, email, start_unix, end_unix)
            if isinstance(fb_data, list):
                for fb in fb_data:
                    # Nylas puede devolver objeto de error en lugar de time_slots
                    if fb.get("error") or fb.get("object") == "error":
                        logger.warning(
                            "Free/busy Nylas error para asesor %s (grant=%s): %s — fallback a list_events",
                            asesor["id"], grant_id, fb.get("error", "unknown"),
                        )
                        break  # salir del loop de fb, caer en list_events
                    for slot in fb.get("time_slots") or []:
                        if slot.get("status") == "busy":
                            bp_start = slot.get("start_time", 0)
                            bp_end = slot.get("end_time", 0)
                            if rangos_solapan(start_unix, end_unix, bp_start, bp_end):
                                logger.info("🚫 Asesor %s ocupado (free/busy): %s-%s solapa con %s-%s",
                                            asesor["id"], start_unix, end_unix, bp_start, bp_end)
                                return True
        except Exception as e:
            if should_disable_nylas_grant(e):
                disable_nylas_grant(asesor, e)
                return True
            logger.warning("Error free/busy asesor %s: %s — fallback a list_events", asesor["id"], e)

    try:
        events = await nylas.list_events(grant_id, email, start_unix, end_unix)
        for ev in events:
            if exclude_event_id and ev.get("id") == exclude_event_id:
                continue
            when = ev.get("when") or {}
            ev_start = when.get("start_time") or when.get("start_date")
            ev_end = when.get("end_time") or when.get("end_date")
            if isinstance(ev_start, int) and isinstance(ev_end, int):
                if rangos_solapan(start_unix, end_unix, ev_start, ev_end):
                    ev_status = ev.get("status", "confirmed")
                    if ev_status != "cancelled":
                        logger.info("🚫 Asesor %s ocupado (list_events): evento '%s' en %s-%s",
                                    asesor["id"], ev.get("title", "?"), ev_start, ev_end)
                        return True
    except Exception as e:
        if should_disable_nylas_grant(e):
            disable_nylas_grant(asesor, e)
        logger.warning("Error list_events asesor %s: %s — asumiendo ocupado por seguridad", asesor["id"], e)
        return True

    return False


# ════════════════════════════════════════════════════════════
# Selección inteligente de asesor
# ════════════════════════════════════════════════════════════


async def seleccionar_mejor_asesor(
    empresa_id: int, fecha_hora_iso: str, tz_name: str, contacto_id: int | None = None,
    duracion_min: int | None = None, exclude_event_id: str | None = None,
) -> dict[str, Any] | None:
    nylas = await get_nylas()

    # Parsear usando la zona del contacto cuando el ISO no incluye tz explícita
    _start_unix, dt = parse_iso_to_unix(fecha_hora_iso, tz_name)
    start_unix = _start_unix

    if contacto_id:
        asesor_fijo = await get_asesor_fijo_de_contacto(contacto_id)
        if asesor_fijo:
            dur = duracion_min or asesor_fijo.get("duracion_cita_minutos") or 30
            end_unix = start_unix + (dur * 60)

            ocupado = await asesor_ocupado(nylas, asesor_fijo, start_unix, end_unix, exclude_event_id)
            if ocupado:
                return {
                    "error": f"El asesor asignado ({asesor_fijo['nombre']} {asesor_fijo.get('apellido', '')}) no está disponible en ese horario."
                }

            return {"asesor": asesor_fijo, "citas_pendientes": 0, "total_disponibles": 1, "es_asesor_fijo": True}

    asesores = await get_asesores_by_empresa(empresa_id)
    if not asesores:
        return None

    async def _check(asesor: dict) -> dict:
        dur = duracion_min or asesor.get("duracion_cita_minutos") or 30
        end_unix = start_unix + (dur * 60)

        try:
            ocupado = await asesor_ocupado(nylas, asesor, start_unix, end_unix, exclude_event_id)
            return {"asesor": asesor, "ok": True, "ocupado": ocupado}
        except Exception:
            return {"asesor": asesor, "ok": False, "ocupado": True}

    results = await asyncio.gather(*[_check(a) for a in asesores])
    disponibles = [r["asesor"] for r in results if r["ok"] and not r["ocupado"]]

    if not disponibles:
        return None

    conteo = await get_conteo_citas_por_asesor(empresa_id, tz_name)
    disponibles.sort(key=lambda a: conteo.get(a["id"], 0))

    return {
        "asesor": disponibles[0],
        "citas_pendientes": conteo.get(disponibles[0]["id"], 0),
        "total_disponibles": len(disponibles),
        "es_asesor_fijo": False,
    }


# ════════════════════════════════════════════════════════════
# Core: Disponibilidad
# ════════════════════════════════════════════════════════════


async def disponibilidad_agenda_core(req: DisponibilidadRequest) -> DisponibilidadResponse:
    """Obtiene el calendario completo de cada asesor (eventos reales de Nylas + wp_citas)
    y lo normaliza como texto para el agente. No usa la columna `disponibilidad`."""
    start_time = time.time()
    tz_name = normalizar_tz(req.time_zone_contacto)
    if not tz_name:
        return DisponibilidadResponse(
            contacto_id=req.contacto_id,
            empresa_id=req.empresa_id,
            time_zone="",
            hora_actual="",
            total_asesores=0,
            asesores_consultados=0,
            tiempo_consulta_ms=0,
            hay_disponibilidad=False,
            error="ZONA_HORARIA_NO_DEFINIDA: El contacto no tiene zona horaria configurada. Pregúntale en qué ciudad o país se encuentra.",
        )

    from fastapi import HTTPException
    try:
        nylas = await get_nylas()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    asesor_fijo, cita_info = await asyncio.gather(
        get_asesor_fijo_de_contacto(req.contacto_id),
        get_cita_contacto(req.contacto_id),
    )

    if asesor_fijo:
        asesores = [asesor_fijo]
    else:
        asesores = await get_asesores_by_empresa(req.empresa_id)

    if not asesores:
        return DisponibilidadResponse(
            contacto_id=req.contacto_id,
            empresa_id=req.empresa_id,
            time_zone=tz_name,
            hora_actual=ahora_en_tz(tz_name).isoformat(),
            total_asesores=0,
            asesores_consultados=0,
            tiempo_consulta_ms=int((time.time() - start_time) * 1000),
            hay_disponibilidad=False,
            error="No se encontraron asesores con calendario configurado",
        )

    ahora = ahora_en_tz(tz_name)
    # Consultar desde el inicio del día de hoy para ver TODOS los eventos de hoy,
    # incluyendo los que ya pasaron (importante para mostrar el calendario completo)
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    ahora_unix = int(inicio_hoy.timestamp())
    now_unix_real = int(ahora.timestamp())  # unix timestamp REAL (para filtrar huecos pasados)
    fin_rango = inicio_hoy + timedelta(days=7)
    fin_unix = int(fin_rango.timestamp())
    tz = ZoneInfo(tz_name)

    # ── 1. Traer todos los eventos reales del calendario Nylas ──
    async def _get_events(asesor: dict):
        if not asesor_grant_habilitado(asesor):
            return {"asesor": asesor, "events": [], "ok": False}
        try:
            # Obtener todos los calendarios del asesor para no perder eventos
            # en calendarios secundarios (compartidos, de equipo, etc.)
            try:
                calendars = await asyncio.wait_for(
                    nylas.list_calendars(asesor["grant_id"]),
                    timeout=8.0,
                )
                calendar_ids = [c["id"] for c in (calendars or []) if c.get("id")]
            except Exception:
                calendar_ids = [asesor["email"]]

            if not calendar_ids:
                calendar_ids = [asesor["email"]]

            # Traer eventos de cada calendario en paralelo
            async def _fetch_cal(cal_id: str):
                try:
                    return await nylas.list_events(asesor["grant_id"], cal_id, ahora_unix, fin_unix, limit=200)
                except Exception:
                    return []

            all_cal_events = await asyncio.gather(*[_fetch_cal(cid) for cid in calendar_ids])
            events = [ev for evs in all_cal_events for ev in (evs or [])]
            logger.info("Calendario asesor %s (%s): %d eventos en próximos 7d",
                        asesor["id"], asesor.get("email", "?"), len(events or []))
            return {"asesor": asesor, "events": events or [], "ok": True}
        except asyncio.TimeoutError:
            logger.warning("Timeout list_events asesor %s (>12s)", asesor["id"])
            return {"asesor": asesor, "events": [], "ok": False}
        except Exception as e:
            if should_disable_nylas_grant(e):
                disable_nylas_grant(asesor, e)
            logger.warning("Error list_events asesor %s: %s", asesor["id"], e)
            return {"asesor": asesor, "events": [], "ok": False}

    resultados = await asyncio.gather(*[_get_events(a) for a in asesores])
    asesores_ok = [r for r in resultados if r["ok"]]

    # ── 2. Formatear calendario como texto ──
    _DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    _MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    def _fmt_hora(unix_ts: int) -> str:
        return datetime.fromtimestamp(unix_ts, tz=tz).strftime("%H:%M")

    def _fecha_es(dt: datetime) -> str:
        return f"{_DIAS_ES[dt.weekday()]} {dt.day} de {_MESES_ES[dt.month - 1]}"

    def _huecos_libres(eventos: list[dict], dia_dt: datetime) -> list[str]:
        """Devuelve huecos libres del día como rangos exactos en hora militar.
        Incluye: antes del primer evento, entre eventos y después del último.
        Filtra huecos menores a 15 minutos.
        Si el día es HOY, solo muestra huecos futuros (no horas ya pasadas)."""
        MIN_HUECO_SEG = 15 * 60

        _w_inicio_h, _w_inicio_m = map(int, _SLOT_WINDOW_DEFAULT[0]["inicio"].split(":"))
        _w_fin_h, _w_fin_m = map(int, _SLOT_WINDOW_DEFAULT[0]["fin"].split(":"))
        dia_inicio = int(dia_dt.replace(hour=_w_inicio_h, minute=_w_inicio_m, second=0, microsecond=0).timestamp())
        dia_fin    = int(dia_dt.replace(hour=_w_fin_h,    minute=_w_fin_m,    second=0, microsecond=0).timestamp())

        # Si el día es HOY, el hueco arranca desde la hora actual (redondeada a múltiplo de 15 min)
        # para no ofrecer horarios ya pasados.
        if dia_inicio <= now_unix_real < dia_fin:
            # Redondear now_unix_real al próximo múltiplo de 15 min (en TZ local)
            ahora_local = datetime.fromtimestamp(now_unix_real, tz=tz)
            minuto_redondeado = ((ahora_local.minute // 15) + 1) * 15
            if minuto_redondeado >= 60:
                ahora_redondeado = ahora_local.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            else:
                ahora_redondeado = ahora_local.replace(minute=minuto_redondeado, second=0, microsecond=0)
            dia_inicio = max(dia_inicio, int(ahora_redondeado.timestamp()))
        elif now_unix_real >= dia_fin:
            # Día ya terminó laboralmente — no hay huecos
            return []

        if dia_inicio >= dia_fin:
            return []

        if not eventos:
            # Sin eventos pero con ventana válida (p.ej. "hoy de 15:00 a 17:00")
            if dia_fin - dia_inicio >= MIN_HUECO_SEG:
                return [f"{_fmt_hora(dia_inicio)} - {_fmt_hora(dia_fin)}"]
            return []

        # Fusionar eventos solapados
        ocupados = sorted(eventos, key=lambda e: e["start"])
        merged: list[tuple[int, int]] = []
        for ev in ocupados:
            s, e = ev["start"], ev["end"]
            if s >= e:
                continue
            if merged and s <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], e))
            else:
                merged.append((s, e))

        if not merged:
            if dia_fin - dia_inicio >= MIN_HUECO_SEG:
                return [f"{_fmt_hora(dia_inicio)} - {_fmt_hora(dia_fin)}"]
            return []

        huecos: list[str] = []
        cursor = dia_inicio

        for (s, e) in merged:
            if e <= cursor:
                continue  # evento ya pasado (antes del cursor)
            if s - cursor >= MIN_HUECO_SEG:
                huecos.append(f"{_fmt_hora(cursor)} - {_fmt_hora(s)}")
            cursor = max(cursor, e)

        # Hueco después del último evento
        if dia_fin - cursor >= MIN_HUECO_SEG:
            huecos.append(f"{_fmt_hora(cursor)} - {_fmt_hora(dia_fin)}")

        return huecos

    lines = []

    # Encabezado
    hora_local = ahora.strftime("%H:%M")
    fecha_local = _fecha_es(ahora) + f" de {ahora.year}"
    lines.append(f"CALENDARIO DE ASESORES — próximos 7 días")
    lines.append(f"Hora actual: {hora_local}, {fecha_local}")
    lines.append(f"⚠️ TODOS LOS HORARIOS ESTÁN EN LA ZONA HORARIA DEL CONTACTO: {tz_name}")

    if cita_info and cita_info.get("tiene_cita"):
        lines.append("")
        lines.append(f"CITA EXISTENTE DEL CONTACTO: {cita_info.get('texto', '')}")
        lines.append(f"  Estado: {cita_info.get('estado', '')} | Fecha: {cita_info.get('fecha', '')}")
        if cita_info.get("event_id"):
            lines.append(f"  Event ID: {cita_info['event_id']}  ← usar este ID para reagendar o cancelar")

    if asesor_fijo:
        lines.append(f"\nASESOR ASIGNADO: {asesor_fijo['nombre']} {asesor_fijo.get('apellido', '').strip()}")

    if not asesores_ok:
        lines.append("\nNo se pudo obtener el calendario de ningún asesor.")
        cal_texto = "\n".join(lines)
        return DisponibilidadResponse(
            cita_actual=cita_info,
            contacto_id=req.contacto_id,
            empresa_id=req.empresa_id,
            time_zone=tz_name,
            hora_actual=ahora.isoformat(),
            total_asesores=len(asesores),
            asesores_consultados=0,
            tiempo_consulta_ms=int((time.time() - start_time) * 1000),
            hay_disponibilidad=False,
            calendario_texto=cal_texto,
            error="No se pudo obtener el calendario de ningún asesor",
        )

    lines.append("")

    for result in resultados:
        asesor = result["asesor"]
        nombre = f"{asesor['nombre']} {asesor.get('apellido', '')}".strip()
        events_nylas = result.get("events", [])

        eventos_unif: list[dict] = []

        for ev in events_nylas:
            when = ev.get("when") or {}
            ev_start = when.get("start_time")
            ev_end = when.get("end_time")
            if not isinstance(ev_start, int) or not isinstance(ev_end, int):
                continue
            if ev.get("status") == "cancelled":
                continue
            eventos_unif.append({
                "start": ev_start,
                "end": ev_end,
                "title": ev.get("title") or "Evento",
            })

        eventos_unif.sort(key=lambda e: e["start"])

        # Agrupar por día
        dias: dict[str, list] = {}
        for i in range(7):
            dia_dt = ahora + timedelta(days=i)
            dias[dia_dt.strftime("%Y-%m-%d")] = []
        for ev in eventos_unif:
            dia_key = datetime.fromtimestamp(ev["start"], tz=tz).strftime("%Y-%m-%d")
            if dia_key in dias:
                dias[dia_key].append(ev)

        lines.append(f"━━━ {nombre.upper()} ━━━")
        if not result["ok"]:
            lines.append("  ⚠️  No se pudo obtener el calendario (error de conexión Nylas)")
            lines.append("")
            continue

        for dia_key in sorted(dias.keys()):
            dia_dt = datetime.fromisoformat(dia_key).replace(tzinfo=tz)
            fecha_texto = _fecha_es(dia_dt)
            eventos_dia = dias[dia_key]

            lines.append(f"\n  📅 {fecha_texto.upper()}:")
            huecos = _huecos_libres(eventos_dia, dia_dt)
            if huecos:
                for h in huecos:
                    lines.append(f"    ✅ {h}")
            elif not eventos_dia:
                # día sin eventos pero sin ventana futura (ej: hoy ya pasó el horario laboral)
                lines.append("    ❌ Fuera de horario laboral")
            else:
                lines.append("    ❌ Sin huecos entre eventos")

        lines.append("")

    asesor_fijo_info = None
    if asesor_fijo:
        asesor_fijo_info = {
            "id": asesor_fijo["id"],
            "nombre": f"{asesor_fijo['nombre']} {asesor_fijo.get('apellido', '')}".strip(),
            "email": asesor_fijo["email"],
            "mensaje": "Este contacto tiene una cita Realizada. Solo se muestra disponibilidad de su asesor asignado.",
        }

    # Instrucción al agente: priorizar horario más cercano y aclarar zona horaria
    lines.append("─── INSTRUCCIÓN PARA EL AGENTE ───")
    lines.append("SIEMPRE ofrece primero el horario disponible más cercano a la hora actual.")
    lines.append("Si hay disponibilidad HOY, ofrécela antes que días futuros.")
    lines.append("Presenta máximo 2-3 opciones empezando por la más próxima.")
    lines.append(f"OBLIGATORIO: Al presentar horarios al contacto, SIEMPRE aclara que son en su zona horaria ({tz_name}). Ejemplo: 'el lunes a las 10:00 AM (hora {tz_name})'.")

    cal_texto = "\n".join(lines)

    return DisponibilidadResponse(
        cita_actual=cita_info,
        asesor_fijo=asesor_fijo_info,
        contacto_id=req.contacto_id,
        empresa_id=req.empresa_id,
        time_zone=tz_name,
        hora_actual=ahora.isoformat(),
        total_asesores=len(asesores),
        asesores_consultados=len(asesores_ok),
        tiempo_consulta_ms=int((time.time() - start_time) * 1000),
        hay_disponibilidad=len(asesores_ok) > 0,
        calendario_texto=cal_texto,
    )


# ════════════════════════════════════════════════════════════
# Core: Crear evento
# ════════════════════════════════════════════════════════════


async def crear_evento_core(req: CrearEventoRequest) -> CrearEventoResponse:
    tz_name = normalizar_tz(req.time_zone_contacto)
    if not tz_name:
        return CrearEventoResponse(error="ZONA_HORARIA_NO_DEFINIDA: El contacto no tiene zona horaria configurada. Pregúntale en qué ciudad o país se encuentra.")
    nylas = await get_nylas()
    db = await get_supabase()

    logger.info("📅 Crear evento — Contacto: %s, Empresa: %s, Horario: %s", req.contacto_id, req.empresa_id, req.start)

    empresa_id = req.empresa_id
    if not empresa_id:
        contacto = await db.query("wp_contactos", select="empresa_id", filters={"id": req.contacto_id}, single=True)
        empresa_id = (contacto or {}).get("empresa_id")
    if not empresa_id:
        return CrearEventoResponse(error="No se pudo determinar la empresa del contacto")

    # ── Idempotency guard: evitar duplicados si el contacto ya tiene cita en este horario ──
    # Esto protege contra casos donde un timeout previo creó la cita pero la respuesta no llegó,
    # y el agente reintenta. Buscamos wp_citas confirmadas/reagendadas del mismo contacto que
    # solapen con el slot solicitado.
    try:
        start_unix_check, fecha_inicio_check = parse_iso_to_unix(req.start, tz_name)
        # ventana de solape: ±60 min respecto al start solicitado
        citas_existentes = await db.query(
            "wp_citas",
            select="id,event_id,fecha_hora,duracion,team_humano_id,titulo,ubicacion",
            filters={"contacto_id": req.contacto_id},
            order="fecha_hora",
            order_desc=True,
            limit=20,
        )
        if isinstance(citas_existentes, list):
            for c in citas_existentes:
                if (c.get("estado") or "").lower() == "cancelada":
                    continue
                fh = c.get("fecha_hora")
                if not fh:
                    continue
                try:
                    c_start, _ = parse_iso_to_unix(fh)
                except Exception:
                    continue
                dur = c.get("duracion") or 30
                c_end = c_start + dur * 60
                # Si hay solape con el nuevo slot (usando duración genérica 30min para el check), asumir duplicado
                new_end = start_unix_check + 30 * 60
                if rangos_solapan(start_unix_check, new_end, c_start, c_end):
                    logger.warning(
                        "⚠️ Duplicado detectado — contacto %s ya tiene cita event_id=%s en horario solapado (%s). Retornando existente.",
                        req.contacto_id, c.get("event_id"), fh,
                    )
                    ubicacion = c.get("ubicacion") or ""
                    meet_link = ubicacion if ubicacion.startswith("http") else None
                    asesor_existente = None
                    if c.get("team_humano_id"):
                        asesor_existente = await get_asesor_by_id(c["team_humano_id"])
                    inicio_local_existente = fecha_inicio_check.astimezone(ZoneInfo(tz_name)).strftime("%d/%m/%Y %I:%M %p")
                    return CrearEventoResponse(
                        success=True,
                        event_id=c.get("event_id") or "",
                        contacto_id=req.contacto_id,
                        asesor_id=(asesor_existente or {}).get("id"),
                        asesor=f"{(asesor_existente or {}).get('nombre','')} {(asesor_existente or {}).get('apellido','')}".strip() or "Asesor",
                        asesor_email=(asesor_existente or {}).get("email", ""),
                        asesor_citas_pendientes=0,
                        asesores_disponibles=1,
                        participante=req.attendeeEmail,
                        inicio=inicio_local_existente,
                        duracion_minutos=c.get("duracion") or 30,
                        modalidad=req.Virtual_presencial,
                        summary=c.get("titulo") or req.summary,
                        meet_link=meet_link,
                    )
    except Exception as exc:
        logger.warning("Idempotency check falló (no bloqueante): %s", exc)

    seleccion = await seleccionar_mejor_asesor(empresa_id, req.start, tz_name, req.contacto_id)
    if not seleccion:
        return CrearEventoResponse(error="No hay asesores disponibles en ese horario")
    if seleccion.get("error"):
        return CrearEventoResponse(error=seleccion["error"])

    asesor = seleccion["asesor"]
    if not asesor_grant_habilitado(asesor):
        return CrearEventoResponse(error=nylas_grant_disabled_message())
    calendar_id = asesor["email"]

    start_unix, fecha_inicio = parse_iso_to_unix(req.start, tz_name)
    duracion_min = asesor.get("duracion_cita_minutos") or 30
    end_unix = start_unix + (duracion_min * 60)

    es_virtual = (req.Virtual_presencial == "Virtual")
    nombre_contacto = (req.summary.split("|")[1].strip() if "|" in req.summary else "Invitado")

    hora_local = fecha_inicio.astimezone(ZoneInfo(tz_name)).strftime("%I:%M %p")
    desc_final = req.description or ""
    if "Hora:" not in desc_final:
        desc_final += f"\n- Hora: {hora_local} ({tz_name})"

    event_data: dict[str, Any] = {
        "title": req.summary,
        "description": desc_final,
        "when": {
            "start_time": start_unix,
            "end_time": end_unix,
            "start_timezone": tz_name,
            "end_timezone": tz_name,
        },
        "participants": [
            {"name": nombre_contacto, "email": req.attendeeEmail, "status": "yes"},
            {"name": f"{asesor['nombre']} {asesor.get('apellido', '')}".strip(), "email": asesor["email"], "status": "yes"},
        ],
        "reminders": {
            "use_default": False,
            "overrides": [
                {"reminder_minutes": 1440, "reminder_method": "email"},
                {"reminder_minutes": 120, "reminder_method": "email"},
                {"reminder_minutes": 30, "reminder_method": "popup"},
                {"reminder_minutes": 10, "reminder_method": "popup"},
            ],
        },
    }

    if es_virtual:
        event_data["conferencing"] = {"provider": "Google Meet", "autocreate": {}}
    else:
        event_data["location"] = "Presencial"

    logger.info("📤 Creando evento en Nylas...")
    try:
        evento = await nylas.create_event(asesor["grant_id"], calendar_id, event_data)
    except httpx.TimeoutException as e:
        # POST create_event timeout — el evento PUDO haberse creado en Nylas.
        # Verificamos listando eventos en la ventana antes de reportar error,
        # así evitamos duplicados si el agente reintenta.
        logger.warning("crear_evento_core: timeout en create_event — verificando si se creó igual: %s", e)
        evento_detectado: dict[str, Any] | None = None
        try:
            await asyncio.sleep(1.5)  # pequeña espera para consistencia en Nylas
            eventos_rango = await nylas.list_events(
                asesor["grant_id"], calendar_id, start_unix - 60, end_unix + 60, limit=50
            )
            for ev in eventos_rango or []:
                if ev.get("status") == "cancelled":
                    continue
                when = ev.get("when") or {}
                ev_start = when.get("start_time")
                # Coincidencia por horario de inicio + título (o participante)
                if ev_start == start_unix and (
                    ev.get("title") == req.summary
                    or any(
                        (p.get("email") or "").lower() == req.attendeeEmail.lower()
                        for p in (ev.get("participants") or [])
                    )
                ):
                    evento_detectado = ev
                    break
        except Exception as verify_exc:
            logger.warning("No se pudo verificar evento tras timeout: %s", verify_exc)

        if evento_detectado:
            logger.info("✅ Evento sí se creó a pesar del timeout: %s — usando existente", evento_detectado.get("id"))
            evento = evento_detectado
        else:
            logger.error("crear_evento_core: timeout confirmado, evento no creado")
            return CrearEventoResponse(error="Error al crear el evento en Nylas: timeout. Por favor intenta de nuevo.")
    except Exception as e:
        if should_disable_nylas_grant(e):
            disable_nylas_grant(asesor, e)
            return CrearEventoResponse(error=nylas_grant_disabled_message())
        logger.error("crear_evento_core: Nylas create_event falló: %s", e, exc_info=True)
        return CrearEventoResponse(error=f"Error al crear el evento en Nylas: {type(e).__name__}: {e}")
    logger.info("✅ Evento creado: %s", evento.get("id"))

    meet_link = (evento.get("conferencing") or {}).get("details", {}).get("url")

    await guardar_cita_en_supabase({
        "contactoId": req.contacto_id,
        "empresaId": empresa_id,
        "asesorId": asesor["id"],
        "eventId": evento["id"],
        "fechaHora": fecha_inicio.isoformat(),
        "duracion": duracion_min,
        "titulo": req.summary,
        "ubicacion": meet_link or ("Virtual" if es_virtual else "Presencial"),
        "estado": "confirmada",
    })
    await actualizar_asesor_en_contacto(req.contacto_id, asesor["id"])

    inicio_local = fecha_inicio.astimezone(ZoneInfo(tz_name)).strftime("%d/%m/%Y %I:%M %p")

    return CrearEventoResponse(
        success=True,
        event_id=evento["id"],
        contacto_id=req.contacto_id,
        asesor_id=asesor["id"],
        asesor=f"{asesor['nombre']} {asesor.get('apellido', '')}".strip(),
        asesor_email=asesor["email"],
        asesor_citas_pendientes=seleccion["citas_pendientes"],
        asesores_disponibles=seleccion["total_disponibles"],
        participante=req.attendeeEmail,
        inicio=inicio_local,
        duracion_minutos=duracion_min,
        modalidad=req.Virtual_presencial,
        summary=req.summary,
        meet_link=meet_link,
    )


# ════════════════════════════════════════════════════════════
# Core: Reagendar evento
# ════════════════════════════════════════════════════════════


async def reagendar_evento_core(req: ReagendarEventoRequest) -> ReagendarEventoResponse:
    tz_name = normalizar_tz(req.time_zone_contacto)
    if not tz_name:
        return ReagendarEventoResponse(error="ZONA_HORARIA_NO_DEFINIDA: El contacto no tiene zona horaria configurada. Pregúntale en qué ciudad o país se encuentra.")
    nylas = await get_nylas()
    db = await get_supabase()

    logger.info("📅 Reagendar evento: %s → %s", req.event_id, req.start)

    cita = await db.query("wp_citas", select="team_humano_id,empresa_id,contacto_id", filters={"event_id": req.event_id}, single=True)
    if not cita:
        return ReagendarEventoResponse(error="No se encontró la cita con ese event_id")

    empresa_id = req.empresa_id or cita.get("empresa_id")
    contacto_id = req.contacto_id or cita.get("contacto_id")

    asesor_actual = await get_asesor_by_id(cita["team_humano_id"]) if cita.get("team_humano_id") else None

    seleccion = await seleccionar_mejor_asesor(empresa_id, req.start, tz_name, contacto_id,
                                                exclude_event_id=req.event_id)
    if not seleccion:
        return ReagendarEventoResponse(error="No hay asesores disponibles en ese horario")
    if seleccion.get("error"):
        return ReagendarEventoResponse(error=seleccion["error"])

    asesor_nuevo = seleccion["asesor"]
    if not asesor_grant_habilitado(asesor_nuevo):
        return ReagendarEventoResponse(error=nylas_grant_disabled_message())
    cambio_asesor = not seleccion.get("es_asesor_fijo") and (asesor_actual is None or asesor_actual["id"] != asesor_nuevo["id"])

    start_unix, fecha_inicio = parse_iso_to_unix(req.start, tz_name)
    duracion_min = req.Duracion_minutos or asesor_nuevo.get("duracion_cita_minutos") or 30
    end_unix = start_unix + (duracion_min * 60)

    nombre_contacto = (req.summary.split("|")[1].strip() if req.summary and "|" in req.summary else "Invitado")
    hora_local = fecha_inicio.astimezone(ZoneInfo(tz_name)).strftime("%I:%M %p")
    desc_final = req.description or ""
    if "Hora:" not in desc_final:
        desc_final += f"\n- Hora: {hora_local} ({tz_name})"

    calendar_id = asesor_nuevo["email"]
    modalidad = req.Virtual_presencial
    es_virtual = modalidad == "Virtual"

    if cambio_asesor:
        await actualizar_estado_cita(req.event_id, "reagendada")

        if asesor_grant_habilitado(asesor_actual):
            try:
                await nylas.delete_event(asesor_actual["grant_id"], asesor_actual["email"], req.event_id)
            except Exception as e:
                if should_disable_nylas_grant(e):
                    disable_nylas_grant(asesor_actual, e)
                logger.warning("No se pudo eliminar evento anterior: %s", e)

        event_data: dict[str, Any] = {
            "title": req.summary or "Cita reagendada",
            "description": desc_final,
            "when": {"start_time": start_unix, "end_time": end_unix, "start_timezone": tz_name, "end_timezone": tz_name},
            "participants": [
                {"name": nombre_contacto, "email": req.attendeeEmail or "", "status": "yes"},
                {"name": f"{asesor_nuevo['nombre']} {asesor_nuevo.get('apellido', '')}".strip(), "email": asesor_nuevo["email"], "status": "yes"},
            ],
            "reminders": {
                "use_default": False,
                "overrides": [
                    {"reminder_minutes": 1440, "reminder_method": "email"},
                    {"reminder_minutes": 120, "reminder_method": "email"},
                    {"reminder_minutes": 30, "reminder_method": "popup"},
                    {"reminder_minutes": 10, "reminder_method": "popup"},
                ],
            },
        }
        if es_virtual:
            event_data["conferencing"] = {"provider": "Google Meet", "autocreate": {}}
        else:
            event_data["location"] = "Presencial"

        try:
            evento = await nylas.create_event(asesor_nuevo["grant_id"], calendar_id, event_data)
        except Exception as e:
            if should_disable_nylas_grant(e):
                disable_nylas_grant(asesor_nuevo, e)
                return ReagendarEventoResponse(error=nylas_grant_disabled_message())
            raise
    else:
        update_data: dict[str, Any] = {
            "when": {"start_time": start_unix, "end_time": end_unix, "start_timezone": tz_name, "end_timezone": tz_name},
            "reminders": {
                "use_default": False,
                "overrides": [
                    {"reminder_minutes": 1440, "reminder_method": "email"},
                    {"reminder_minutes": 120, "reminder_method": "email"},
                    {"reminder_minutes": 30, "reminder_method": "popup"},
                    {"reminder_minutes": 10, "reminder_method": "popup"},
                ],
            },
        }
        if req.summary:
            update_data["title"] = req.summary
        if desc_final:
            update_data["description"] = desc_final
        if req.attendeeEmail:
            update_data["participants"] = [
                {"name": nombre_contacto, "email": req.attendeeEmail, "status": "yes"},
                {"name": f"{asesor_nuevo['nombre']} {asesor_nuevo.get('apellido', '')}".strip(), "email": asesor_nuevo["email"], "status": "yes"},
            ]
        if es_virtual:
            update_data["conferencing"] = {"provider": "Google Meet", "autocreate": {}}
        elif modalidad == "Presencial":
            update_data["location"] = "Presencial"

        try:
            evento = await nylas.update_event(asesor_nuevo["grant_id"], calendar_id, req.event_id, update_data)
        except Exception as e:
            if should_disable_nylas_grant(e):
                disable_nylas_grant(asesor_nuevo, e)
                return ReagendarEventoResponse(error=nylas_grant_disabled_message())
            raise

    meet_link = (evento.get("conferencing") or {}).get("details", {}).get("url")

    await guardar_cita_en_supabase({
        "contactoId": contacto_id,
        "empresaId": empresa_id,
        "asesorId": asesor_nuevo["id"],
        "eventId": evento["id"],
        "fechaHora": fecha_inicio.isoformat(),
        "duracion": duracion_min,
        "titulo": req.summary or "Cita reagendada",
        "ubicacion": meet_link or ("Virtual" if es_virtual else "Presencial"),
        "estado": "confirmada",
    })

    if cambio_asesor and contacto_id:
        await actualizar_asesor_en_contacto(contacto_id, asesor_nuevo["id"])

    inicio_local = fecha_inicio.astimezone(ZoneInfo(tz_name)).strftime("%d/%m/%Y %I:%M %p")

    return ReagendarEventoResponse(
        success=True,
        event_id=evento["id"],
        event_id_anterior=req.event_id if cambio_asesor else None,
        contacto_id=contacto_id,
        asesor_anterior=f"{asesor_actual['nombre']} {asesor_actual.get('apellido', '')}".strip() if cambio_asesor and asesor_actual else None,
        asesor_id=asesor_nuevo["id"],
        asesor=f"{asesor_nuevo['nombre']} {asesor_nuevo.get('apellido', '')}".strip(),
        asesor_email=asesor_nuevo["email"],
        asesor_citas_pendientes=seleccion["citas_pendientes"],
        cambio_asesor=cambio_asesor,
        nuevo_inicio=inicio_local,
        duracion_minutos=duracion_min,
        modalidad=modalidad,
        meet_link=meet_link,
        mensaje=(
            f"Evento reagendado con nuevo asesor: {asesor_nuevo['nombre']} {asesor_nuevo.get('apellido', '')}".strip()
            if cambio_asesor
            else "Evento reagendado correctamente"
        ),
    )


# ════════════════════════════════════════════════════════════
# Core: Eliminar evento
# ════════════════════════════════════════════════════════════


async def eliminar_evento_core(req: EliminarEventoRequest) -> EliminarEventoResponse:
    nylas = await get_nylas()
    db = await get_supabase()

    logger.info("🗑️ Eliminar evento: %s", req.event_id)

    cita = await db.query("wp_citas", select="team_humano_id,empresa_id,contacto_id", filters={"event_id": req.event_id}, single=True)
    if not cita:
        return EliminarEventoResponse(error="No se encontró la cita con ese event_id")

    asesor = await db.query(
        "wp_team_humano",
        select="id,nombre,apellido,email,grant_id",
        filters={"id": cita["team_humano_id"]},
        single=True,
    )
    if not asesor:
        return EliminarEventoResponse(error="No se encontró el asesor de la cita")
    if not asesor_grant_habilitado(asesor):
        logger.warning("⚠️ Se omitió eliminación en Nylas para asesor %s por grant temporalmente inhabilitado", asesor.get("id"))
        await actualizar_estado_cita(req.event_id, "cancelada")
        return EliminarEventoResponse(
            success=True,
            event_id=req.event_id,
            contacto_id=req.contacto_id or cita.get("contacto_id"),
            asesor=f"{asesor['nombre']} {asesor.get('apellido', '')}".strip(),
            asesor_email=asesor["email"],
            eliminado_en_nylas=False,
            mensaje="Cita cancelada en Supabase (el evento ya no existía en el calendario)",
        )

    calendar_id = asesor["email"]
    eliminado_en_nylas = False
    nylas_error: str | None = None

    try:
        await nylas.delete_event(asesor["grant_id"], calendar_id, req.event_id)
        eliminado_en_nylas = True
        logger.info("✅ Evento eliminado de Nylas: event_id=%s grant=%s calendar=%s",
                    req.event_id, asesor["grant_id"], calendar_id)
    except Exception as e:
        nylas_error = str(e)
        if should_disable_nylas_grant(e):
            disable_nylas_grant(asesor, e)
        logger.error("❌ Error al eliminar en Nylas: event_id=%s grant=%s calendar=%s error=%s",
                     req.event_id, asesor["grant_id"], calendar_id, e)

    # Siempre actualizar estado en Supabase
    await actualizar_estado_cita(req.event_id, "cancelada")

    if not eliminado_en_nylas:
        # El evento NO se borró del calendario real — reportar como fallo
        return EliminarEventoResponse(
            success=False,
            event_id=req.event_id,
            contacto_id=req.contacto_id or cita.get("contacto_id"),
            asesor=f"{asesor['nombre']} {asesor.get('apellido', '')}".strip(),
            asesor_email=asesor["email"],
            eliminado_en_nylas=False,
            error=f"No se pudo eliminar el evento del calendario: {nylas_error}",
            mensaje="La cita fue marcada como cancelada en el sistema, pero el evento sigue en el calendario del asesor.",
        )

    return EliminarEventoResponse(
        success=True,
        event_id=req.event_id,
        contacto_id=req.contacto_id or cita.get("contacto_id"),
        asesor=f"{asesor['nombre']} {asesor.get('apellido', '')}".strip(),
        asesor_email=asesor["email"],
        eliminado_en_nylas=True,
        mensaje="Evento eliminado correctamente del calendario.",
    )
