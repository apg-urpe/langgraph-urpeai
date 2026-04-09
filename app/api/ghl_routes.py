"""Go High Level (GHL) webhook integration — Instagram (y futuro Facebook).

Flujo idéntico al de ManyChat:
  Phase 1 — Funnel agent + Contact Update agent en paralelo
  Phase 2 — System prompt enriquecido con resultado del funnel
  Phase 3 — Agente conversacional
  Respuesta — GHL Conversations API
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from dataclasses import dataclass

# Separador de burbujas: igual que el bridge de WhatsApp
_MSG_SEPARATOR = re.compile(r"\n*---\n*")

import httpx
from collections import deque

from fastapi import APIRouter, Header, HTTPException, Request

from app.agents.contact_update import run_contact_update_agent
from app.agents.conversational import CLOSING_FOLLOWUP_MARKER, run_agent
from app.agents.funnel import run_funnel_agent
from app.core.config import get_settings
from app.core.error_webhook import send_error_to_webhook
from app.core.kapso_debug import add_kapso_debug_event, get_channel_debug_events
from app.core.kapso_prompt import build_kapso_context_payload, build_kapso_system_prompt
from app.db import queries as db
from app.schemas.chat import ChatRequest
from app.schemas.contact_update import ContactUpdateAgentRequest
from app.schemas.funnel import FunnelAgentRequest
from app.schemas.ghl import GHLInboundRequest, GHLInboundResponse, GHLSendManualRequest, GHLSendManualResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ghl", tags=["ghl"])
settings = get_settings()

FUNNEL_TIMEOUT_SECONDS = 25
CONTACT_UPDATE_TIMEOUT_SECONDS = 20

# GHL Conversations API
_GHL_API_BASE = "https://services.leadconnectorhq.com"
_GHL_API_VERSION = "2021-04-15"


def _require_send_key(x_send_key: str | None) -> None:
    """Verifica la clave de autenticación para endpoints de envío manual."""
    required = settings.SEND_API_KEY
    if not required:
        return  # Si no está configurada, no se requiere auth
    if not x_send_key or x_send_key != required:
        raise HTTPException(status_code=401, detail="X-Send-Key inválida o ausente")


# ── GHL API — Envío de respuesta ─────────────────────────────────────────────

async def _send_ghl_reply(
    api_key: str,
    contact_id: str,
    conversation_id: str | None,
    text: str,
    canal: str = "instagram",
    location_id: str | None = None,
) -> tuple[bool, str | None]:
    """Envía respuesta via GHL Conversations API."""
    if not api_key:
        return False, "GHL_API_KEY no configurado"

    message_type = "IG" if canal.lower() == "instagram" else "FB"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Version": _GHL_API_VERSION,
        "Content-Type": "application/json",
        "accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if conversation_id:
                # Preferimos usar conversation_id (más preciso)
                url = f"{_GHL_API_BASE}/conversations/{conversation_id}/messages"
                payload: dict = {"type": message_type, "message": text}
                if location_id:
                    payload["locationId"] = location_id
            else:
                # Usar contactId + locationId (requerido por GHL para IG/FB)
                url = f"{_GHL_API_BASE}/conversations/messages"
                payload = {"type": message_type, "contactId": contact_id, "message": text}
                if location_id:
                    payload["locationId"] = location_id

            logger.info(
                "GHL send → url=%s payload_keys=%s location_id=%s",
                url, list(payload.keys()), location_id,
            )
            resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code in (200, 201):
            return True, None
        return False, f"GHL error {resp.status_code}: {resp.text[:300]}"
    except Exception as exc:
        return False, str(exc)


# ── Background tasks ──────────────────────────────────────────────────────────

async def _bg_funnel(
    *, contacto_id: int, empresa_id: int, agente_id: int,
    conversacion_id: int | None, memory_session_id: str, model: str | None,
) -> None:
    try:
        await asyncio.wait_for(
            run_funnel_agent(FunnelAgentRequest(
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                agente_id=agente_id,
                conversacion_id=conversacion_id,
                memory_session_id=memory_session_id,
                memory_window=20,
                model=model,
            )),
            timeout=FUNNEL_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("GHL bg_funnel falló: %s", exc)


async def _bg_contact_update(
    *, contacto_id: int, empresa_id: int, agente_id: int,
    conversacion_id: int | None, model: str | None,
) -> None:
    try:
        await asyncio.wait_for(
            run_contact_update_agent(ContactUpdateAgentRequest(
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                agente_id=agente_id,
                conversacion_id=conversacion_id,
                model=model,
            )),
            timeout=CONTACT_UPDATE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("GHL bg_contact_update falló: %s", exc)


# ── Proxy object para build_kapso_context_payload ────────────────────────────

@dataclass
class _InboundProxy:
    from_phone: str
    contact_name: str | None = None
    message_type: str = "text"
    has_media: bool = False


# ── Endpoint principal ────────────────────────────────────────────────────────

@router.post("/inbound", response_model=GHLInboundResponse)
async def ghl_inbound(
    request: GHLInboundRequest,
    x_ghl_key: str | None = Header(default=None),
):
    """Recibe webhook de GHL y procesa con agentes IA de forma asíncrona."""
    # X-Ghl-Key puede llegar como header HTTP o como campo en customData
    _custom_key = (request.customData.model_extra.get("X-Ghl-Key") if request.customData else None)
    api_key = x_ghl_key or _custom_key or settings.GHL_API_KEY or ""
    asyncio.create_task(_procesar_ghl_core(request, api_key))
    return GHLInboundResponse()


# ── Core processing ───────────────────────────────────────────────────────────

async def _procesar_ghl_core(request: GHLInboundRequest, api_key: str) -> None:
    """Pipeline completo: lookup → upsert contacto → agentes → enviar respuesta."""
    t_start = time.perf_counter()
    try:
        mensaje = request.message_text.strip()
        contact_id = request.ghl_contact_id
        nombre_usuario = request.contact_name
        canal = request.canal          # "instagram" | "facebook"
        _channel = f"ghl_{canal}"     # "ghl_instagram" | "ghl_facebook"
        multimedia = request.customData.multimedia if request.customData else None
        location_id = (request.location.id if request.location else None) or None

        # Ignorar si está vacío y sin media
        if not mensaje and not multimedia:
            logger.info("GHL inbound: payload vacío ignorado")
            return

        # Validar contact_id
        if not contact_id:
            logger.warning("GHL inbound: sin contact_id — payload: %s", request.model_dump())
            add_kapso_debug_event(
                "fastapi", "ghl_sin_contact_id",
                {
                    "telefono_receptor": request.telefono_receptor,
                    "mensaje": mensaje[:100],
                },
                channel=_channel,
            )
            return

        # 1. Lookup número → empresa + agente
        numero = await db.get_numero_por_telefono(request.telefono_receptor)
        if not numero:
            add_kapso_debug_event(
                "fastapi", "ghl_numero_no_encontrado",
                {
                    "telefono_receptor": request.telefono_receptor,
                    "contact_id": contact_id,
                    "error": f"telefono_receptor={request.telefono_receptor} no existe en wp_numeros",
                    "dropped": True,
                },
                channel=_channel,
            )
            logger.error(
                "GHL: telefono_receptor=%s no existe en wp_numeros — mensaje descartado",
                request.telefono_receptor,
            )
            return

        empresa_id: int = numero.get("empresa_id")
        agente_id: int = numero.get("agente_id")
        numero_id: int = numero.get("id")

        # 2. Upsert contacto GHL
        contacto, contacto_creado = await db.upsert_contacto_ghl(
            contact_id=contact_id,
            empresa_id=empresa_id,
            nombre=nombre_usuario,
            telefono=request.phone,
        )
        contacto_id: int | None = contacto.get("id") if contacto else None

        # 3. Conversación activa o nueva
        conversacion_db = (
            await db.get_conversacion_activa(contacto_id, numero_id)
            if contacto_id else None
        )
        if conversacion_db is None and contacto_id:
            conversacion_db = await db.insertar_conversacion(
                contacto_id=contacto_id,
                agente_id=agente_id,
                empresa_id=empresa_id,
                numero_id=numero_id,
                canal=f"ghl_{canal}",
            )

        conversacion_db_id: int | None = conversacion_db.get("id") if conversacion_db else None
        memory_session_id = f"ghl_{contact_id}"

        # 4. Debug — mensaje recibido
        add_kapso_debug_event(
            "fastapi", "ghl_message_received",
            {
                "contact_id": contact_id,
                "contacto_id": contacto_id,
                "empresa_id": empresa_id,
                "message": mensaje[:200],
                "canal": canal,
                "nuevo_contacto": contacto_creado,
            },
            channel=_channel,
        )

        # 5. Persistir mensaje entrante
        if conversacion_db_id:
            await db.insertar_mensaje(
                conversacion_id=conversacion_db_id,
                contenido=mensaje or f"[{canal} media]",
                remitente="usuario",
                tipo="texto",
                status="procesando",
                metadata={
                    "canal": canal,
                    "ghl_contact_id": contact_id,
                    "telefono_receptor": request.telefono_receptor,
                    "ghl_api_key": api_key,
                    "location_id": location_id,
                },
                empresa_id=empresa_id,
            )

        # 6. Cargar agente
        agent = await db.get_agente(agente_id) if agente_id else None
        model = (agent.get("model") if agent else None) or settings.DEFAULT_MODEL

        # 7. System prompt
        prompt_context_data = None
        if contacto_id:
            prompt_context_data = await db.load_kapso_prompt_context(
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                conversacion_id=conversacion_db_id,
                team_id=(
                    int(contacto["team_humano_id"])
                    if contacto and contacto.get("team_humano_id")
                    else None
                ),
                agente_id=agente_id,
                agente_rol_id=int(agent.get("id_rol") or 0) if agent else 0,
                limite_mensajes=8,
            )

        inbound_proxy = _InboundProxy(
            from_phone=contact_id,
            contact_name=nombre_usuario or (contacto.get("nombre") if contacto else None),
            message_type="text" if not multimedia else "image",
            has_media=bool(multimedia),
        )
        _pcd = prompt_context_data or {}
        context_payload, prompt_extras = build_kapso_context_payload(
            contacto=contacto,
            agent=agent or {},
            empresa=_pcd.get("empresa"),
            rol_agente=_pcd.get("rol_agente"),
            team_humano=_pcd.get("team_humano"),
            contextos=_pcd.get("contextos") or [],
            citas=_pcd.get("citas") or [],
            notificaciones=_pcd.get("notificaciones") or [],
            mensajes_recientes=_pcd.get("mensajes_recientes") or [],
            etapas_embudo=_pcd.get("etapas_embudo") or [],
            notas=_pcd.get("notas") or [],
            contexto_embudo_snapshot=_pcd.get("contexto_embudo_snapshot"),
            etapas_embudo_snapshot=_pcd.get("etapas_embudo_snapshot"),
            conversacion_memoria_snapshot=_pcd.get("conversacion_memoria_snapshot"),
            inbound=inbound_proxy,
        )
        system_prompt = build_kapso_system_prompt(
            agent=agent or {},
            inbound=inbound_proxy,
            contacto=contacto,
            context_payload=context_payload,
            extras=prompt_extras,
            rol_agente=_pcd.get("rol_agente"),
        )

        # 8. Funnel + contact_update en background (paralelo)
        if contacto_id and len(mensaje.strip()) > 2:
            asyncio.create_task(_bg_funnel(
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                agente_id=agente_id,
                conversacion_id=conversacion_db_id,
                memory_session_id=memory_session_id,
                model=model,
            ))
        if contacto_id:
            asyncio.create_task(_bg_contact_update(
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                agente_id=agente_id,
                conversacion_id=conversacion_db_id,
                model=model,
            ))

        # 9. Agente conversacional
        result = await run_agent(
            ChatRequest(
                system_prompt=system_prompt,
                message=mensaje or f"[{canal} media]",
                model=model,
                mcp_servers=[],
                conversation_id=str(conversacion_db_id) if conversacion_db_id else str(uuid.uuid4()),
                memory_session_id=memory_session_id,
                memory_window=8,
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                channel=_channel,
            )
        )

        reply_text = (result.response or "").strip()
        if reply_text == CLOSING_FOLLOWUP_MARKER:
            reply_text = ""

        elapsed = time.perf_counter() - t_start

        # 10. Enviar respuesta via GHL API — con split de burbujas
        send_ok, send_error = False, None
        if reply_text:
            # Dividir en burbujas separadas por "---" (igual que WhatsApp)
            bubbles = [b.strip() for b in _MSG_SEPARATOR.split(reply_text) if b.strip()]
            if not bubbles:
                bubbles = [reply_text]

            last_ok, last_error = False, None
            for bubble in bubbles:
                ok, err = await _send_ghl_reply(
                    api_key=api_key,
                    contact_id=contact_id,
                    conversation_id=None,   # GHL no envía conversation_id en el webhook
                    text=bubble,
                    canal=canal,
                    location_id=location_id,
                )
                last_ok, last_error = ok, err
                if ok and conversacion_db_id:
                    await db.insertar_mensaje(
                        conversacion_id=conversacion_db_id,
                        contenido=bubble,
                        remitente="agente",
                        tipo="texto",
                        status="enviado",
                        modelo_llm=result.model_used,
                        metadata={"canal": canal, "ghl_contact_id": contact_id},
                        empresa_id=empresa_id,
                    )
                elif not ok:
                    logger.warning("GHL burbuja no enviada: %s | error: %s", bubble[:80], err)
                    break  # detenemos en el primer error
            send_ok, send_error = last_ok, last_error

        # 11. Debug — respuesta enviada
        add_kapso_debug_event(
            "fastapi", "ghl_message_sent",
            {
                "contact_id": contact_id,
                "contacto_id": contacto_id,
                "empresa_id": empresa_id,
                "agent_name": agent.get("nombre_agente") if agent else None,
                "model_used": result.model_used,
                "reply_preview": reply_text[:200] if reply_text else "",
                "bubbles_sent": len(bubbles) if reply_text else 0,
                "elapsed_s": round(elapsed, 2),
                "canal": canal,
                "ghl_send_ok": send_ok,
                "ghl_send_error": send_error,
                "location_id": location_id,
            },
            channel=_channel,
        )

    except Exception as exc:
        logger.error("GHL inbound error: %s", exc, exc_info=True)
        await send_error_to_webhook(
            exc,
            context="ghl_inbound",
            severity="error",
            fallback="El procesamiento del mensaje de GHL falló. No se envió respuesta al contacto. El sistema sigue activo.",
        )


# ── Endpoint: envío manual de mensaje (sin agente IA) ────────────────────────

@router.post("/send", response_model=GHLSendManualResponse)
async def ghl_send_manual(req: GHLSendManualRequest, x_send_key: str | None = Header(default=None)):
    """Envía un mensaje directo a un contacto de GHL sin pasar por el agente IA.

    Usa el contacto_id integer de Supabase — recupera automáticamente el GHL contact_id,
    api_key y location_id desde la conversación en DB.

    Ejemplo curl:
        curl -X POST https://TU_DOMINIO/api/v1/ghl/send \\
          -H "Content-Type: application/json" \\
          -d '{
            "contacto_id": 285318,
            "mensaje": "Hola, ¿en qué te puedo ayudar?"
          }'
    """
    _require_send_key(x_send_key)

    guardado_en_db = False
    ghl_api_key: str | None = None
    location_id: str | None = req.location_id
    conversacion_id_db: int | None = None
    empresa_id_db: int | None = None
    ghl_contact_id: str | None = None
    canal: str = "instagram"

    # ── Lookup contacto → GHL contact_id + conversación ──────────────────────
    try:
        contacto = await db.get_contacto(req.contacto_id)
        if not contacto:
            raise HTTPException(status_code=404, detail=f"Contacto {req.contacto_id} no encontrado en Supabase")

        ghl_contact_id = contacto.get("subscriber_id")
        if not ghl_contact_id:
            raise HTTPException(status_code=400, detail="El contacto no tiene subscriber_id (GHL contact_id) registrado")

        empresa_id_db = int(contacto["empresa_id"])

        # Buscar conversación GHL más reciente del contacto
        conversacion = await db.get_conversacion_ghl_reciente(req.contacto_id)
        if conversacion:
            conversacion_id_db = int(conversacion["id"])
            creds = await db.get_ghl_credentials_de_conversacion(conversacion_id_db)
            ghl_api_key = creds.get("api_key")
            if not location_id:
                location_id = creds.get("location_id")
            # Canal desde el metadata del mensaje ("instagram" / "facebook")
            canal = creds.get("canal") or conversacion.get("canal", "ghl_instagram").replace("ghl_", "") or "instagram"
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("ghl_send_manual: error buscando datos en DB: %s", exc)

    # Fallback al settings global si no se encontró en DB
    if not ghl_api_key:
        ghl_api_key = settings.GHL_API_KEY or ""

    if not ghl_api_key:
        raise HTTPException(
            status_code=400,
            detail="No se encontró el api_key de GHL. "
                   "Asegúrate de que el contacto haya enviado al menos un mensaje primero "
                   "o configura GHL_API_KEY en settings.",
        )

    # ── Enviar mensaje via GHL API (con split de burbujas) ────────────────────
    bubbles = [b.strip() for b in _MSG_SEPARATOR.split(req.mensaje) if b.strip()] or [req.mensaje]
    last_ok, last_error = False, None
    for bubble in bubbles:
        ok, err = await _send_ghl_reply(
            api_key=ghl_api_key,
            contact_id=ghl_contact_id,
            conversation_id=None,
            text=bubble,
            canal=canal,
            location_id=location_id,
        )
        last_ok, last_error = ok, err
        if not ok:
            break

    if not last_ok:
        return GHLSendManualResponse(ok=False, contacto_id=req.contacto_id, contact_id=ghl_contact_id, error=last_error)

    # ── Guardar en DB ─────────────────────────────────────────────────────────
    if conversacion_id_db:
        try:
            await db.insertar_mensaje(
                conversacion_id=conversacion_id_db,
                contenido=req.mensaje,
                remitente="agente",
                tipo="texto",
                status="enviado",
                metadata={
                    "canal": canal,
                    "ghl_contact_id": ghl_contact_id,
                    "envio_manual": True,
                },
                empresa_id=empresa_id_db,
            )
            guardado_en_db = True
        except Exception as exc:
            logger.warning("ghl_send_manual: error guardando en DB (mensaje ya enviado): %s", exc)

    # ── Inyectar en memoria del agente ────────────────────────────────────────
    # El agente verá este mensaje en su historial la próxima vez que procese
    # un mensaje del contacto, evitando confusión por contexto perdido.
    memory_session_id = f"ghl_{ghl_contact_id}"
    try:
        await db.insert_agent_memory(
            memory_session_id,
            {
                "role": "assistant",
                "content": f"[Asesor humano]: {req.mensaje}",
                "conversation_id": str(conversacion_id_db) if conversacion_id_db else None,
                "model": "asesor_humano",
            },
        )
    except Exception as exc:
        logger.warning("ghl_send_manual: error inyectando en agent_memory: %s", exc)

    return GHLSendManualResponse(
        ok=True,
        contacto_id=req.contacto_id,
        contact_id=ghl_contact_id,
        guardado_en_db=guardado_en_db,
    )


# ── Inspect storage (últimos 10 payloads crudos recibidos) ───────────────────
_inspect_log: deque[dict] = deque(maxlen=10)


# ── Debug endpoints ───────────────────────────────────────────────────────────

@router.post("/inspect")
async def ghl_inspect(req: Request):
    """Endpoint temporal de inspección.
    Apunta tu webhook de GHL aquí, envía un mensaje y verás el payload completo
    (headers + body) en GET /api/v1/ghl/inspect/last
    """
    import datetime
    body_bytes = await req.body()
    try:
        import json
        body_json = json.loads(body_bytes)
    except Exception:
        body_json = body_bytes.decode(errors="replace")

    entry = {
        "received_at": datetime.datetime.utcnow().isoformat() + "Z",
        "headers": dict(req.headers),
        "body": body_json,
    }
    _inspect_log.appendleft(entry)
    logger.info("GHL inspect payload recibido: %s", body_json)
    return {"ok": True, "received": entry}


@router.get("/inspect/last")
async def ghl_inspect_last():
    """Devuelve los últimos 10 payloads recibidos en /inspect."""
    return {"count": len(_inspect_log), "payloads": list(_inspect_log)}


@router.delete("/inspect/clear")
async def ghl_inspect_clear():
    """Limpia el log de inspección."""
    _inspect_log.clear()
    return {"cleared": True}


@router.get("/debug/events")
async def ghl_debug_events(limit: int = 50):
    ig = get_channel_debug_events("ghl_instagram", limit=limit)
    fb = get_channel_debug_events("ghl_facebook", limit=limit)
    combined = sorted(ig + fb, key=lambda e: e.get("timestamp", ""), reverse=True)[:limit]
    return {"events": combined}


@router.get("/debug/config")
async def ghl_debug_config():
    return {
        "canales": ["ghl_instagram", "ghl_facebook"],
        "endpoint_inbound": "/api/v1/ghl/inbound",
        "ghl_api_base": _GHL_API_BASE,
        "ghl_api_configured": bool(settings.GHL_API_KEY),
        "auth_header": "X-Ghl-Key",
    }
