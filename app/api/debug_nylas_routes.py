"""Endpoints debug para inspeccionar calendarios Nylas crudos.

Sirve para la vista `/debug/calendarios` del bridge: deja al usuario seleccionar
asesores activos y ver sus eventos directamente desde Nylas, sin pasar por la
lógica de cálculo de disponibilidad. Útil para auditar visualmente que el bot
está leyendo los huecos correctos.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from app.db.client import get_supabase
from app.nylas_client.client import get_nylas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/debug/nylas", tags=["debug-nylas"])


# ─── Helpers ────────────────────────────────────────────────────────────────

def _name(asesor: dict[str, Any]) -> str:
    nombre = (asesor.get("nombre") or "").strip()
    apellido = (asesor.get("apellido") or "").strip()
    full = f"{nombre} {apellido}".strip()
    return full or (asesor.get("email") or "")


def _normalize_event(ev: dict[str, Any]) -> dict[str, Any] | None:
    """Convierte un evento Nylas v3 a un shape uniforme:
        { id, title, start_time, end_time, status, all_day }
    Devuelve None si el evento no tiene un rango temporal válido.
    """
    when = ev.get("when") or {}
    obj = when.get("object")
    title = ev.get("title") or "(sin título)"
    status = ev.get("status")
    ev_id = ev.get("id")

    if obj == "timespan":
        s, e = when.get("start_time"), when.get("end_time")
        if not s or not e:
            return None
        return {"id": ev_id, "title": title, "start_time": int(s), "end_time": int(e),
                "status": status, "all_day": False}

    if obj == "date":
        date_str = when.get("date")
        if not date_str:
            return None
        try:
            d = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
        except Exception:
            return None
        start = int(d.timestamp())
        return {"id": ev_id, "title": title, "start_time": start, "end_time": start + 86400,
                "status": status, "all_day": True}

    if obj == "datespan":
        sd, ed = when.get("start_date"), when.get("end_date")
        if not sd or not ed:
            return None
        try:
            ds = datetime.fromisoformat(sd).replace(tzinfo=timezone.utc)
            de = datetime.fromisoformat(ed).replace(tzinfo=timezone.utc) + timedelta(days=1)
        except Exception:
            return None
        return {"id": ev_id, "title": title, "start_time": int(ds.timestamp()),
                "end_time": int(de.timestamp()), "status": status, "all_day": True}

    return None


def _grant_valido(asesor: dict[str, Any]) -> bool:
    grant = (asesor.get("grant_id") or "").strip()
    return bool(grant) and grant.lower() != "solicitud enviada"


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/asesores")
async def debug_list_asesores():
    """Lista asesores con is_active=true y acepta_citas=true (para el dropdown)."""
    db = await get_supabase()
    rows = await db.query(
        "wp_team_humano",
        select="id,nombre,apellido,email,grant_id,timezone,empresa_id",
        filters={"is_active": True, "acepta_citas": True},
        order="empresa_id",
    )
    if not isinstance(rows, list):
        return {"asesores": []}

    out = []
    for a in rows:
        email = (a.get("email") or "").strip()
        if not email or not _grant_valido(a):
            continue
        out.append({
            "id": a.get("id"),
            "nombre": a.get("nombre"),
            "apellido": a.get("apellido"),
            "email": email,
            "empresa_id": a.get("empresa_id"),
            "timezone": a.get("timezone"),
        })
    return {"asesores": out}


@router.get("/events")
async def debug_nylas_events(
    emails: str = "",
    days: int = 14,
    tz: str = "America/Mexico_City",
):
    """Devuelve eventos crudos de Nylas para los emails dados.

    Rango: [hoy 00:00 en `tz`, hoy+`days` 00:00 en `tz`).
    """
    email_list = [e.strip().lower() for e in emails.split(",") if e.strip()]
    if not email_list:
        return {"advisorsRaw": [], "error": "missing emails"}

    # Cargar asesores activos
    db = await get_supabase()
    rows = await db.query(
        "wp_team_humano",
        select="id,nombre,apellido,email,grant_id,timezone,empresa_id",
        filters={"is_active": True, "acepta_citas": True},
    )
    by_email: dict[str, dict[str, Any]] = {}
    if isinstance(rows, list):
        for a in rows:
            em = (a.get("email") or "").strip().lower()
            if em:
                by_email[em] = a

    # Calcular rango [hoy 00:00 TZ, hoy+days 00:00 TZ)
    try:
        zone = ZoneInfo(tz)
    except Exception:
        zone = ZoneInfo("America/Mexico_City")
        tz = "America/Mexico_City"
    now_local = datetime.now(zone)
    today_start = datetime(now_local.year, now_local.month, now_local.day, 0, 0, 0, tzinfo=zone)
    end_local = today_start + timedelta(days=max(1, min(days, 60)))
    start_unix = int(today_start.timestamp())
    end_unix = int(end_local.timestamp())

    nylas = await get_nylas()
    advisors_raw: list[dict[str, Any]] = []

    for email in email_list:
        asesor = by_email.get(email)
        if not asesor:
            advisors_raw.append({"email": email, "events": [], "error": "asesor no encontrado en wp_team_humano"})
            continue
        if not _grant_valido(asesor):
            advisors_raw.append({"email": email, "name": _name(asesor), "events": [],
                                 "error": "grant_id inválido o pendiente"})
            continue

        try:
            events_raw = await nylas.list_events(
                asesor["grant_id"], email, start_unix, end_unix, limit=200
            )
        except Exception as exc:
            logger.warning("list_events error %s: %s", email, exc)
            advisors_raw.append({"email": email, "name": _name(asesor), "events": [], "error": str(exc)})
            continue

        normalized = [n for n in (_normalize_event(e) for e in (events_raw or [])) if n]
        advisors_raw.append({
            "email": email,
            "name": _name(asesor),
            "asesor_id": asesor.get("id"),
            "empresa_id": asesor.get("empresa_id"),
            "timezone": asesor.get("timezone"),
            "events": normalized,
        })

    return {
        "advisorsRaw": advisors_raw,
        "rangeDays": days,
        "tz": tz,
        "start_unix": start_unix,
        "end_unix": end_unix,
    }
