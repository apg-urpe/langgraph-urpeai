"""Retry system driven by debug_events table.

Replaces the wp_mensajes-based retry_stuck with a richer approach:

1. Funnel retry — finds stage="funnel_error" events without a subsequent
   "funnel_completed" for the same contacto_id and relaunches the funnel agent.

2. Inbound retry — finds stage="inbound_received" events without a
   corresponding "run_agent_done" (same message_id, older than min_age_minutes)
   and replays the full kapso_inbound handler using the stored _raw_request.

Deduplication: before retrying, a "retry_started" event is inserted into
debug_events. On the next scan cycle, any error that already has a
"retry_started" or "funnel_completed" event AFTER it (for the same
contacto_id / message_id) is skipped.  Max retries = 3.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

_INBOUND_WINDOW_HOURS = 2      # look back 2 h for stuck inbound messages
_FUNNEL_WINDOW_HOURS = 24      # look back 24 h for funnel errors
_MIN_AGE_MINUTES = 5           # don't retry events younger than 5 min
_MAX_RETRIES = 3               # max retry attempts per message_id / contacto
_FETCH_LIMIT = 300             # rows fetched per query


# ── helpers ──────────────────────────────────────────────────────────────────

def _cutoff(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def _min_age_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=_MIN_AGE_MINUTES)).isoformat()


async def _fetch_events(
    window_hours: int,
    source_filter: str | None = None,
    stage_filter: str | None = None,
) -> list[dict]:
    """Return events newer than window_hours, ordered oldest-first."""
    from app.db.client import get_supabase
    db = await get_supabase()
    raw: dict[str, str] = {"created_at": f"gt.{_cutoff(window_hours)}"}
    if source_filter:
        raw["source"] = f"eq.{source_filter}"
    if stage_filter:
        raw["stage"] = f"eq.{stage_filter}"
    return await db.query(
        "debug_events",
        select="id,source,stage,payload,empresa_id,contacto_id,message_id,created_at",
        order="created_at",
        order_desc=False,
        limit=_FETCH_LIMIT,
        raw_filters=raw,
    ) or []


async def _record_retry_event(
    kind: str,          # "retry_started" | "retry_success" | "retry_failed"
    channel: str,
    message_id: str | None,
    contacto_id: int | None,
    empresa_id: int | None,
    extra: dict | None = None,
) -> None:
    """Persist a retry tracking event to debug_events (fire-and-forget)."""
    from app.core.kapso_debug import add_kapso_debug_event
    payload: dict[str, Any] = {
        "_channel": channel,
        "message_id": message_id,
        "contacto_id": contacto_id,
        "empresa_id": empresa_id,
        **(extra or {}),
    }
    add_kapso_debug_event("fastapi", kind, payload, channel=channel)


# ── FUNNEL RETRY ─────────────────────────────────────────────────────────────

def _funnel_conv_key(event: dict) -> tuple[int | None, str | None]:
    """(contacto_id, conversation_id) as a deduplification key."""
    cid = event.get("contacto_id")
    runs = (event.get("payload") or {}).get("agent_runs") or []
    conv = runs[0].get("conversation_id") if runs else None
    return (cid, str(conv) if conv else None)


async def _retry_single_funnel(error_event: dict) -> bool:
    """Re-run the funnel agent for one funnel_error event."""
    from app.agents.funnel import run_funnel_agent
    from app.db import queries as db
    from app.schemas.funnel import FunnelAgentRequest

    payload = error_event.get("payload") or {}
    contacto_id: int | None = error_event.get("contacto_id")
    empresa_id: int | None = error_event.get("empresa_id")
    runs = payload.get("agent_runs") or []
    run0 = runs[0] if runs else {}
    conv_id_str = run0.get("conversation_id")
    conversacion_id = int(conv_id_str) if conv_id_str else None
    memory_session_id = run0.get("memory_session_id")
    model = run0.get("model_used")

    if not contacto_id or not empresa_id:
        logger.warning("debug_retry funnel: missing contacto_id/empresa_id in event %s", error_event.get("id"))
        return False

    # Look up agente_id from the conversacion
    agente_id: int | None = None
    if conversacion_id:
        conv = await db.get_conversacion(conversacion_id)
        if conv:
            agente_id = conv.get("agente_id")

    if not agente_id:
        # Fall back to first agente of the empresa
        convs = await db.get_conversaciones_contacto(contacto_id)
        for c in convs:
            if c.get("agente_id"):
                agente_id = c["agente_id"]
                break

    if not agente_id:
        logger.warning("debug_retry funnel: cannot resolve agente_id for contacto=%s", contacto_id)
        return False

    # Record that we are about to retry (dedup guard)
    await _record_retry_event(
        "retry_funnel_started", "whatsapp",
        message_id=None,
        contacto_id=contacto_id,
        empresa_id=empresa_id,
        extra={"original_event_id": error_event.get("id"), "conversacion_id": conversacion_id},
    )

    try:
        result = await asyncio.wait_for(
            run_funnel_agent(
                FunnelAgentRequest(
                    contacto_id=contacto_id,
                    empresa_id=empresa_id,
                    agente_id=agente_id,
                    conversacion_id=conversacion_id,
                    memory_session_id=memory_session_id,
                    model=model,
                )
            ),
            timeout=30,
        )
        success = getattr(result, "success", True)
        await _record_retry_event(
            "retry_funnel_success" if success else "retry_funnel_failed",
            "whatsapp",
            message_id=None,
            contacto_id=contacto_id,
            empresa_id=empresa_id,
            extra={
                "original_event_id": error_event.get("id"),
                "conversacion_id": conversacion_id,
                "etapa_nueva": getattr(result, "etapa_nueva", None),
            },
        )
        logger.info(
            "debug_retry funnel: contacto=%s conv=%s success=%s",
            contacto_id, conversacion_id, success,
        )
        return bool(success)
    except Exception as exc:
        await _record_retry_event(
            "retry_funnel_failed", "whatsapp",
            message_id=None,
            contacto_id=contacto_id,
            empresa_id=empresa_id,
            extra={"original_event_id": error_event.get("id"), "error": str(exc)},
        )
        logger.error("debug_retry funnel: error contacto=%s: %s", contacto_id, exc)
        return False


async def retry_funnel_errors() -> dict:
    """Find unretried funnel_error events and rerun the funnel agent."""
    try:
        # Errors in the last 24h
        errors = await _fetch_events(_FUNNEL_WINDOW_HOURS, source_filter="funnel", stage_filter="funnel_error")
        # Completed / retry events in the same window (to skip already-handled ones)
        completed = await _fetch_events(
            _FUNNEL_WINDOW_HOURS,
            stage_filter=None,       # fetch several stages
        )
        # Build set of (contacto_id, conv_id) already resolved after their error
        resolved: set[tuple] = set()
        min_age_ts = _min_age_cutoff()
        for ev in completed:
            if ev.get("stage") in ("funnel_completed", "retry_funnel_started",
                                   "retry_funnel_success", "run_funnel_done"):
                resolved.add(_funnel_conv_key(ev))

        # Filter errors: older than min_age, not already resolved, max retries
        retry_counts: dict[tuple, int] = {}
        for ev in completed:
            if ev.get("stage") == "retry_funnel_started":
                k = _funnel_conv_key(ev)
                retry_counts[k] = retry_counts.get(k, 0) + 1

        to_retry = []
        seen_keys: set[tuple] = set()
        for ev in errors:
            if ev.get("created_at", "") >= min_age_ts:
                continue  # too recent
            key = _funnel_conv_key(ev)
            if key in resolved:
                continue
            if retry_counts.get(key, 0) >= _MAX_RETRIES:
                continue
            if key in seen_keys:
                continue
            seen_keys.add(key)
            to_retry.append(ev)

        if not to_retry:
            return {"checked": True, "found": 0, "retried": 0, "success": 0}

        logger.info("debug_retry: %d funnel errors to retry", len(to_retry))
        success_count = 0
        for ev in to_retry:
            try:
                ok = await _retry_single_funnel(ev)
                if ok:
                    success_count += 1
            except Exception as exc:
                logger.error("debug_retry funnel: unexpected error: %s", exc)

        return {"checked": True, "found": len(to_retry), "retried": len(to_retry), "success": success_count}
    except Exception as exc:
        logger.error("debug_retry retry_funnel_errors failed: %s", exc, exc_info=True)
        return {"checked": False, "error": str(exc)}


# ── INBOUND RETRY ─────────────────────────────────────────────────────────────

async def _retry_single_inbound(inbound_event: dict) -> bool:
    """Replay a stuck kapso inbound message using the stored _raw_request."""
    from app.api.kapso_routes import kapso_inbound
    from app.schemas.kapso import KapsoInboundRequest
    from app.core.config import get_settings

    payload = inbound_event.get("payload") or {}
    raw_request = payload.get("_raw_request")
    message_id = inbound_event.get("message_id") or payload.get("message_id")
    contacto_id = inbound_event.get("contacto_id")
    empresa_id = inbound_event.get("empresa_id")

    if not raw_request:
        logger.warning("debug_retry inbound: no _raw_request in event %s", inbound_event.get("id"))
        return False

    await _record_retry_event(
        "retry_inbound_started", "whatsapp",
        message_id=message_id,
        contacto_id=contacto_id,
        empresa_id=empresa_id,
        extra={"original_event_id": inbound_event.get("id")},
    )

    try:
        request = KapsoInboundRequest(**raw_request)
        settings = get_settings()
        await kapso_inbound(
            request=request,
            x_kapso_internal_token=settings.KAPSO_INTERNAL_TOKEN,
        )
        await _record_retry_event(
            "retry_inbound_success", "whatsapp",
            message_id=message_id,
            contacto_id=contacto_id,
            empresa_id=empresa_id,
        )
        logger.info("debug_retry inbound: message_id=%s retried OK", message_id)
        return True
    except Exception as exc:
        await _record_retry_event(
            "retry_inbound_failed", "whatsapp",
            message_id=message_id,
            contacto_id=contacto_id,
            empresa_id=empresa_id,
            extra={"error": str(exc)},
        )
        logger.error("debug_retry inbound: message_id=%s failed: %s", message_id, exc)
        return False


async def retry_stuck_inbound() -> dict:
    """Find inbound_received events without run_agent_done and replay them."""
    try:
        events = await _fetch_events(_INBOUND_WINDOW_HOURS, source_filter="fastapi")

        # Group by message_id
        by_msg: dict[str, list[dict]] = {}
        for ev in events:
            mid = ev.get("message_id") or (ev.get("payload") or {}).get("message_id")
            if mid:
                by_msg.setdefault(mid, []).append(ev)

        min_age_ts = _min_age_cutoff()
        to_retry: list[dict] = []

        for mid, evs in by_msg.items():
            stages = {e["stage"] for e in evs}
            if "run_agent_done" in stages:
                continue  # completed fine
            if not any(e["stage"] == "inbound_received" for e in evs):
                continue  # no inbound_received, skip
            # Find the inbound_received event
            inbound_ev = next(e for e in evs if e["stage"] == "inbound_received")
            if inbound_ev.get("created_at", "") >= min_age_ts:
                continue  # too recent
            # Check retry count
            retry_starts = sum(1 for e in evs if e["stage"] == "retry_inbound_started")
            if retry_starts >= _MAX_RETRIES:
                continue
            to_retry.append(inbound_ev)

        if not to_retry:
            return {"checked": True, "found": 0, "retried": 0, "success": 0}

        logger.info("debug_retry: %d stuck inbound messages to retry", len(to_retry))
        success_count = 0
        for ev in to_retry:
            try:
                ok = await _retry_single_inbound(ev)
                if ok:
                    success_count += 1
            except Exception as exc:
                logger.error("debug_retry inbound: unexpected error: %s", exc)

        return {"checked": True, "found": len(to_retry), "retried": len(to_retry), "success": success_count}
    except Exception as exc:
        logger.error("debug_retry retry_stuck_inbound failed: %s", exc, exc_info=True)
        return {"checked": False, "error": str(exc)}


# ── MAIN CYCLE ───────────────────────────────────────────────────────────────

async def run_debug_retry_cycle() -> dict:
    """Run one full retry cycle: funnel errors + stuck inbound messages."""
    funnel_result, inbound_result = await asyncio.gather(
        retry_funnel_errors(),
        retry_stuck_inbound(),
        return_exceptions=True,
    )
    if isinstance(funnel_result, Exception):
        logger.error("debug_retry cycle: funnel error: %s", funnel_result)
        funnel_result = {"error": str(funnel_result)}
    if isinstance(inbound_result, Exception):
        logger.error("debug_retry cycle: inbound error: %s", inbound_result)
        inbound_result = {"error": str(inbound_result)}
    return {"funnel": funnel_result, "inbound": inbound_result}
