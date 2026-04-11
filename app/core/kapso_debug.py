"""
Kapso Debug — Eventos en memoria + persistencia Supabase (realtime)

Mantiene una lista circular en memoria para respuesta instantánea,
y persiste cada evento a la tabla ``debug_events`` de Supabase de forma
asíncrona (fire-and-forget) para historial permanente y suscripción realtime.

También mantiene un mecanismo de SSE (Server-Sent Events) para streaming
en tiempo real hacia dashboards conectados.
"""
import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# ─── Eventos en memoria ──────────────────────────────────────────────────

_MAX_KAPSO_DEBUG_EVENTS = 200
_events: deque[dict[str, Any]] = deque(maxlen=_MAX_KAPSO_DEBUG_EVENTS)
_lock = Lock()

# ─── SSE subscribers ─────────────────────────────────────────────────────
_sse_subscribers: set[asyncio.Queue] = set()
_sse_lock = Lock()


async def _persist_debug_event(entry: dict[str, Any]) -> None:
    """Inserta el evento en Supabase de forma silenciosa (fire-and-forget).

    El canal se guarda dentro de payload['_channel'] para no depender de
    que exista la columna 'channel' en debug_events (evita inserts silenciosos
    que fallaban si la columna no existe en el schema).
    """
    try:
        from app.db.client import get_supabase

        db = await get_supabase()
        channel = entry.get("channel") or "whatsapp"
        payload = dict(entry.get("payload") or {})
        payload["_channel"] = channel  # schema-safe: always inside payload
        await db.insert(
            "debug_events",
            {
                "source": entry.get("source", "fastapi"),
                "stage": entry["stage"],
                "payload": payload,
                "empresa_id": payload.get("empresa_id"),
                "contacto_id": payload.get("contacto_id"),
                "message_id": payload.get("message_id"),
            },
        )
    except Exception as exc:
        logger.warning("debug_events persist failed: %s", exc)


def _row_to_event(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza una fila de debug_events de Supabase al formato in-memory."""
    payload = row.get("payload") or {}
    source = row.get("source") or "fastapi"
    # Channel stored in payload._channel (new) or legacy column 'channel'.
    # For rows without explicit channel, infer from source so that funnel/internal
    # events don't pollute the whatsapp channel filter.
    explicit = payload.get("_channel") or row.get("channel")
    if explicit:
        channel = explicit
    elif source in ("fastapi", "kapso"):
        channel = "whatsapp"  # legacy kapso events before _channel was introduced
    else:
        channel = source  # e.g. "funnel" stays as "funnel"
    return {
        "timestamp": row.get("created_at") or "",
        "source": source,
        "stage": row.get("stage") or "",
        "channel": channel,
        "payload": payload,
    }


async def hydrate_from_supabase() -> None:
    """Carga los últimos eventos desde Supabase al arrancar el servidor.

    Evita que el panel de debug aparezca vacío tras un reinicio.
    """
    try:
        from app.db.client import get_supabase

        db = await get_supabase()
        rows = await db.query(
            "debug_events",
            select="source,stage,payload,created_at",
            order="created_at",
            order_desc=True,
            limit=_MAX_KAPSO_DEBUG_EVENTS,
            raw_filters={"source": "neq.funnel"},
        ) or []
        if not rows:
            logger.info("kapso_debug hydrate: tabla debug_events vacía o sin datos")
            return
        rows.reverse()  # cronológico: más antiguo primero → appendleft deja newest al frente
        with _lock:
            for row in rows:
                _events.appendleft(_row_to_event(row))
        logger.info("kapso_debug hydrated: %d eventos cargados desde Supabase", len(rows))
    except Exception as exc:
        logger.warning("kapso_debug hydrate failed (non-fatal): %s", exc)


async def load_channel_events_from_supabase(channel: str, limit: int = 100) -> list[dict[str, Any]]:
    """Consulta Supabase directamente para obtener eventos de un canal.

    Usado como fallback en los endpoints de debug cuando la memoria está vacía.
    Filtra por payload->>'_channel' para compatibilidad con ambos schemas.
    """
    try:
        from app.db.client import get_supabase

        db = await get_supabase()
        rows = await db.query(
            "debug_events",
            select="source,stage,payload,created_at",
            order="created_at",
            order_desc=True,
            limit=limit * 3,  # fetch extra to filter by channel
            raw_filters={"source": "neq.funnel"},
        ) or []
        result = []
        for row in rows:
            ev = _row_to_event(row)
            if ev["channel"] == channel:
                result.append(ev)
                if len(result) >= limit:
                    break
        return result
    except Exception as exc:
        logger.warning("load_channel_events_from_supabase(%s) failed: %s", channel, exc)
        return []


def add_kapso_debug_event(
    source: str,
    stage: str,
    payload: dict[str, Any] | None = None,
    channel: str = "whatsapp",
) -> None:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "stage": stage,
        "channel": channel,
        "payload": payload or {},
    }
    with _lock:
        _events.appendleft(entry)

    # Notificar a subscribers SSE en tiempo real
    _broadcast_sse(entry)

    # Persistir a Supabase async fire-and-forget
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_persist_debug_event(entry))
    except RuntimeError:
        pass  # No event loop running — skip persistence


def get_kapso_debug_events(limit: int = 100) -> list[dict[str, Any]]:
    normalized_limit = max(1, min(limit, _MAX_KAPSO_DEBUG_EVENTS))
    with _lock:
        return list(_events)[:normalized_limit]


def get_channel_debug_events(channel: str, limit: int = 100) -> list[dict[str, Any]]:
    """Retorna eventos filtrados por canal (whatsapp, manychat, etc.)."""
    normalized_limit = max(1, min(limit, _MAX_KAPSO_DEBUG_EVENTS))
    with _lock:
        return [e for e in _events if e.get("channel") == channel][:normalized_limit]


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"


# ─── SSE helpers ─────────────────────────────────────────────────────────

def _broadcast_sse(entry: dict[str, Any]) -> None:
    """Push event to all SSE subscriber queues (non-blocking)."""
    with _sse_lock:
        dead: list[asyncio.Queue] = []
        for q in _sse_subscribers:
            try:
                q.put_nowait(entry)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            _sse_subscribers.discard(q)


def subscribe_sse() -> asyncio.Queue:
    """Register a new SSE subscriber. Returns a Queue to await events from."""
    q: asyncio.Queue = asyncio.Queue(maxsize=256)
    with _sse_lock:
        _sse_subscribers.add(q)
    return q


def unsubscribe_sse(q: asyncio.Queue) -> None:
    """Remove an SSE subscriber."""
    with _sse_lock:
        _sse_subscribers.discard(q)
