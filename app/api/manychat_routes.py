"""ManyChat inbound endpoint.

Flujo (idéntico a Kapso/WhatsApp):
  Phase 1 — Funnel agent + Contact Update agent en paralelo
  Phase 2 — System prompt enriquecido con resultado del funnel
  Phase 3 — Agente conversacional
  Respuesta — ManyChat Dynamic Message v2
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import APIRouter, Header, HTTPException

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
from app.schemas.manychat import (
    ManyChatInboundRequest,
    ManyChatInboundResponse,
    ManyChatSendManualRequest,
    ManyChatSendManualResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/manychat", tags=["manychat"])

_MANYCHAT_SEND_URL = "https://api.manychat.com/fb/sending/sendContent"
FUNNEL_TIMEOUT_SECONDS = 25
CONTACT_UPDATE_TIMEOUT_SECONDS = 20
STUCK_MESSAGE_MINUTES = 5
BUFFER_SECONDS = 5.0  # ventana de agrupación de mensajes para canales no-Kapso

FUNNEL_SKIP_TEXTS = {
    "hola", "hola!", "hi", "hello",
    "buenos dias", "buen día", "buen dia",
    "buenas tardes", "buenas noches",
    "ok", "oki", "dale", "gracias", "muchas gracias",
}


def _should_run_funnel_agent(message: str | None) -> bool:
    normalized = re.sub(r"\s+", " ", str(message or "").strip().lower())
    return bool(normalized) and normalized not in FUNNEL_SKIP_TEXTS


def _extract_slash_command(message: str | None) -> str | None:
    if not message:
        return None
    normalized = str(message).strip()
    if not normalized.startswith("/"):
        return None
    return normalized.split()[0].lower()


# ── Proxy que imita los campos de KapsoInboundRequest usados en kapso_prompt ─

@dataclass
class _InboundProxy:
    from_phone: str
    contact_name: str | None
    message_type: str = "text"
    has_media: bool = False


# ── Buffer de mensajes (agrupa mensajes rápidos antes de llamar al agente) ────

@dataclass
class _McBufferEntry:
    mensajes: list[str]
    request: ManyChatInboundRequest   # primera request — contiene metadata del canal
    x_api_key: str
    timer_task: asyncio.Task | None = None

_mc_buffer: dict[str, _McBufferEntry] = {}


async def _flush_buffer(buffer_key: str) -> None:
    """Espera BUFFER_SECONDS y procesa todos los mensajes acumulados como uno solo."""
    await asyncio.sleep(BUFFER_SECONDS)
    entry = _mc_buffer.pop(buffer_key, None)
    if not entry:
        return
    mensaje_combinado = "\n".join(entry.mensajes)
    logger.info(
        "Buffer flush — key=%s mensajes=%d combinado=%r",
        buffer_key, len(entry.mensajes), mensaje_combinado[:120],
    )
    try:
        await _procesar_manychat_core(entry.request, mensaje_combinado, entry.x_api_key)
    except Exception as exc:
        logger.exception("Buffer flush error key=%s: %s", buffer_key, exc)


# ── Envío de respuesta via ManyChat API ──────────────────────────────────────

async def _send_manychat_reply(
    api_key: str,
    subscriber_id: str,
    text: str,
    canal: str,
    raise_on_error: bool = False,
) -> tuple[bool, str | None]:
    """Envía el texto de respuesta al suscriptor via ManyChat API.

    Returns:
        (ok, error_msg) — ok=True si ManyChat devolvió 200.
    """
    content_type = "instagram" if canal.lower() == "instagram" else "facebook"
    payload = {
        "subscriber_id": subscriber_id,
        "data": {
            "version": "v2",
            "content": {
                "type": content_type,
                "messages": [{"type": "text", "text": text}],
            },
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _MANYCHAT_SEND_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code == 200:
            logger.info("ManyChat sendContent OK — subscriber=%s", subscriber_id)
            return True, None
        else:
            msg = f"ManyChat error {resp.status_code}: {resp.text[:300]}"
            logger.error("ManyChat sendContent error %s: %s", resp.status_code, resp.text)
            if raise_on_error:
                raise HTTPException(status_code=502, detail=msg)
            return False, msg
    except HTTPException:
        raise
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.error("ManyChat sendContent excepción: %s", exc)
        if raise_on_error:
            raise HTTPException(status_code=502, detail=msg)
        return False, msg


# ── Endpoint: envío manual de mensaje (sin agente IA) ────────────────────────

@router.post("/send", response_model=ManyChatSendManualResponse)
async def manychat_send_manual(req: ManyChatSendManualRequest):
    """Envía un mensaje directo a un suscriptor de ManyChat sin pasar por el agente IA.

    El token de ManyChat se obtiene automáticamente de la conversación activa
    (guardado en los mensajes entrantes). No requiere header de autenticación adicional.
    """
    guardado_en_db = False
    manychat_api_key: str | None = None
    conversacion_id_db: int | None = None
    empresa_id_db: int | None = None

    # ── Buscar token y conversación desde la BD ───────────────────────────────
    if req.telefono_receptor:
        try:
            numero = await db.get_numero_por_telefono(req.telefono_receptor)
            if not numero:
                raise HTTPException(status_code=404, detail=f"Número {req.telefono_receptor} no configurado")

            empresa_id_db = int(numero["empresa_id"])
            numero_id     = int(numero["id"])

            contacto = await db.get_contacto_por_subscriber_id(req.subscriber_id, empresa_id_db)
            contacto_id = int(contacto["id"]) if contacto else None

            if contacto_id:
                conversacion = await db.get_conversacion_activa(contacto_id, numero_id)
                if conversacion:
                    conversacion_id_db = int(conversacion["id"])
                    manychat_api_key = await db.get_manychat_api_key_de_conversacion(conversacion_id_db)
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("manychat_send_manual: error buscando token en DB: %s", exc)

    if not manychat_api_key:
        raise HTTPException(
            status_code=400,
            detail="No se encontró el token de ManyChat en la conversación. "
                   "Asegúrate de que el contacto haya enviado al menos un mensaje primero.",
        )

    # ── Enviar mensaje via ManyChat API ───────────────────────────────────────
    ok, error_msg = await _send_manychat_reply(
        api_key=manychat_api_key,
        subscriber_id=req.subscriber_id,
        text=req.mensaje,
        canal=req.canal,
    )
    if not ok:
        return ManyChatSendManualResponse(
            ok=False,
            subscriber_id=req.subscriber_id,
            error=error_msg,
        )

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
                    "canal": req.canal,
                    "subscriber_id": req.subscriber_id,
                    "envio_manual": True,
                },
                empresa_id=empresa_id_db,
            )
            guardado_en_db = True
            logger.info(
                "manychat_send_manual guardado — subscriber=%s conversacion=%s",
                req.subscriber_id, conversacion_id_db,
            )
        except Exception as exc:
            logger.warning("manychat_send_manual: error guardando en DB (mensaje ya enviado): %s", exc)

    return ManyChatSendManualResponse(
        ok=True,
        subscriber_id=req.subscriber_id,
        guardado_en_db=guardado_en_db,
    )


# ── Tareas background (no bloquean la respuesta a ManyChat) ──────────────────

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
        logger.warning("ManyChat bg_funnel falló: %s", exc)


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
        logger.warning("ManyChat bg_contact_update falló: %s", exc)


# ── Endpoint principal ────────────────────────────────────────────────────────

@router.post("/inbound", response_model=ManyChatInboundResponse)
async def manychat_inbound(
    request: ManyChatInboundRequest,
    x_api_key: str = Header(alias="X-Api-Key"),
):
    subscriber_id = request.contacto_identificador.subscriber_id
    slash_command = _extract_slash_command(request.mensaje)

    # Slash commands → proceso inmediato, sin buffer
    if slash_command:
        asyncio.create_task(_procesar_manychat_core(request, request.mensaje, x_api_key))
        return ManyChatInboundResponse.empty()

    # Mensajes normales → buffer de 5 segundos
    buffer_key = f"{subscriber_id}:{request.telefono_receptor}"

    if buffer_key in _mc_buffer:
        entry = _mc_buffer[buffer_key]
        entry.mensajes.append(request.mensaje)
        if entry.timer_task and not entry.timer_task.done():
            entry.timer_task.cancel()
        logger.debug("Buffer: mensaje añadido key=%s total=%d", buffer_key, len(entry.mensajes))
    else:
        _mc_buffer[buffer_key] = _McBufferEntry(
            mensajes=[request.mensaje],
            request=request,
            x_api_key=x_api_key,
        )
        logger.debug("Buffer: nueva entrada key=%s", buffer_key)

    _mc_buffer[buffer_key].timer_task = asyncio.create_task(_flush_buffer(buffer_key))

    return ManyChatInboundResponse.empty()


# ── Lógica de procesamiento principal (usada por buffer y slash commands) ─────

async def _procesar_manychat_core(
    request: ManyChatInboundRequest,
    mensaje: str,
    x_api_key: str,
) -> None:
    started_at = time.time()
    settings = get_settings()

    subscriber_id = request.contacto_identificador.subscriber_id
    slash_command = _extract_slash_command(mensaje)
    _channel = request.canal.lower()  # "instagram" o "facebook" — usado en todos los debug events

    try:
        # ── Lookup por telefono_receptor en wp_numeros ────────────────────────
        numero = await db.get_numero_por_telefono(request.telefono_receptor)
        if not numero:
            raise HTTPException(status_code=404, detail=f"Número {request.telefono_receptor} no configurado")

        empresa_id = int(numero["empresa_id"])
        agente_id  = int(numero["agente_id"])
        numero_id  = int(numero["id"])

        # ── Agente config ─────────────────────────────────────────────────────
        agentes = await db.get_agentes_por_empresa(empresa_id)
        agent = next((a for a in agentes if a["id"] == agente_id), None)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agente {agente_id} no encontrado")

        model = agent.get("llm") or settings.DEFAULT_MODEL

        # ── Upsert contacto (solo si no es slash command) ─────────────────────
        contacto = None
        contacto_creado = False
        nombre_usuario = getattr(request, "nombre_usuario", None)
        if not slash_command:
            contacto, contacto_creado = await db.upsert_contacto_manychat(
                subscriber_id=subscriber_id,
                empresa_id=empresa_id,
                nombre=nombre_usuario,
                telefono=request.contacto_identificador.telefono or None,
            )
            if contacto_creado:
                logger.info("ManyChat: nuevo contacto — subscriber=%s empresa=%s canal=%s", subscriber_id, empresa_id, request.canal)
        else:
            contacto = await db.get_contacto_por_subscriber_id(subscriber_id, empresa_id)

        contacto_id = int(contacto["id"]) if contacto else None

        # ── Conversación ──────────────────────────────────────────────────────
        conversacion_db = None
        if contacto_id and not slash_command:
            conversacion_db = await db.get_conversacion_activa(contacto_id, numero_id)
            if conversacion_db is None:
                try:
                    conversacion_db = await db.insertar_conversacion(
                        contacto_id=contacto_id,
                        agente_id=agente_id,
                        empresa_id=empresa_id,
                        numero_id=numero_id,
                        canal="manychat",
                    )
                except Exception:
                    conversacion_db = await db.get_conversacion_activa(contacto_id, numero_id)
                    if conversacion_db is None:
                        raise
        elif contacto_id:
            conversacion_db = await db.get_conversacion_activa(contacto_id, numero_id)

        conversacion_db_id = int(conversacion_db["id"]) if conversacion_db else None
        conversation_id    = str(conversacion_db_id) if conversacion_db_id else str(uuid.uuid4())
        memory_session_id  = f"mc_{subscriber_id}"

        # ═════════════════════════════════════════════════════════════════════
        # Slash commands
        # ═════════════════════════════════════════════════════════════════════
        if slash_command:
            add_kapso_debug_event(
                "fastapi", "slash_command_detected",
                {"command": slash_command, "subscriber_id": subscriber_id, "contacto_id": contacto_id},
                channel=_channel,
            )

            session_ids = {subscriber_id, memory_session_id}
            if contacto_id:
                session_ids.add(str(contacto_id))

            if slash_command == "/borrar":
                deleted = await asyncio.gather(*[db.delete_agent_memory(s) for s in session_ids if s])
                reply_text = f"Memoria del agente borrada. Registros eliminados: {sum(deleted)}."

            elif slash_command == "/borrar2":
                await asyncio.gather(*[db.delete_agent_memory(s) for s in session_ids if s])
                if contacto_id:
                    await db.reset_contacto_data(contacto_id)
                    reply_text = "Usuario eliminado correctamente. La siguiente interacción se tratará como usuario nuevo."
                else:
                    reply_text = "No se encontró información del usuario para eliminar."
            else:
                reply_text = "Comando no reconocido. Usa /borrar o /borrar2."

            add_kapso_debug_event(
                "fastapi", "slash_command_done",
                {"command": slash_command, "subscriber_id": subscriber_id, "reply": reply_text},
                channel=_channel,
            )

            await _send_manychat_reply(api_key=x_api_key, subscriber_id=subscriber_id,
                                       text=reply_text, canal=request.canal)
            return

        # ── Guardar mensaje entrante ──────────────────────────────────────────
        if conversacion_db_id:
            await db.insertar_mensaje(
                conversacion_id=conversacion_db_id,
                contenido=mensaje,
                remitente="usuario",
                tipo="texto",
                status="procesando",
                metadata={
                    "canal": request.canal,
                    "subscriber_id": subscriber_id,
                    "telefono_receptor": request.telefono_receptor,
                    "manychat_api_key": x_api_key,
                },
                empresa_id=empresa_id,
            )

        # ── Debug event: mensaje recibido ─────────────────────────────────────
        _stage_recv = "fb_message_received" if request.canal.lower() == "facebook" else "message_received"
        add_kapso_debug_event(
            "fastapi", _stage_recv,
            {
                "subscriber_id": subscriber_id,
                "contacto_id": contacto_id,
                "empresa_id": empresa_id,
                "message": mensaje[:200],
                "canal": request.canal,
                "nuevo_contacto": contacto_creado,
            },
            channel=_channel,
        )

        # ── Construir system prompt ───────────────────────────────────────────
        prompt_context_data = await db.load_kapso_prompt_context(
            contacto_id=contacto_id,
            empresa_id=empresa_id,
            conversacion_id=conversacion_db_id,
            team_id=int(contacto["team_humano_id"]) if contacto and contacto.get("team_humano_id") else None,
            agente_id=agente_id,
            agente_rol_id=int(agent.get("id_rol") or 0),
            limite_mensajes=8,
        )

        inbound_proxy = _InboundProxy(
            from_phone=subscriber_id,
            contact_name=(contacto.get("nombre") if contacto else None) or nombre_usuario,
        )

        context_payload, prompt_extras = build_kapso_context_payload(
            contacto=contacto,
            agent=agent,
            empresa=prompt_context_data.get("empresa"),
            rol_agente=prompt_context_data.get("rol_agente"),
            team_humano=prompt_context_data.get("team_humano"),
            contextos=prompt_context_data.get("contextos") or [],
            citas=prompt_context_data.get("citas") or [],
            notificaciones=prompt_context_data.get("notificaciones") or [],
            mensajes_recientes=prompt_context_data.get("mensajes_recientes") or [],
            etapas_embudo=prompt_context_data.get("etapas_embudo") or [],
            notas=prompt_context_data.get("notas") or [],
            inbound=inbound_proxy,
        )

        system_prompt = build_kapso_system_prompt(
            agent=agent,
            inbound=inbound_proxy,
            contacto=contacto,
            context_payload=context_payload,
            extras=prompt_extras,
            rol_agente=prompt_context_data.get("rol_agente"),
        )

        # ── Funnel + Contact Update en background ─────────────────────────────
        if contacto_id and _should_run_funnel_agent(mensaje):
            asyncio.create_task(_bg_funnel(
                contacto_id=contacto_id, empresa_id=empresa_id, agente_id=agente_id,
                conversacion_id=conversacion_db_id, memory_session_id=memory_session_id, model=model,
            ))
        if contacto_id:
            asyncio.create_task(_bg_contact_update(
                contacto_id=contacto_id, empresa_id=empresa_id, agente_id=agente_id,
                conversacion_id=conversacion_db_id, model=model,
            ))

        # ── Agente conversacional ─────────────────────────────────────────────
        result = await run_agent(
            ChatRequest(
                system_prompt=system_prompt,
                message=mensaje,
                model=model,
                mcp_servers=[],
                conversation_id=conversation_id,
                memory_session_id=memory_session_id,
                memory_window=8,
                contacto_id=contacto_id,
                empresa_id=empresa_id,
                channel="manychat",
            )
        )

        reply_text = (result.response or "").strip()
        if reply_text == CLOSING_FOLLOWUP_MARKER:
            reply_text = ""

        # ── Enviar respuesta + guardar en DB ──────────────────────────────────
        if reply_text:
            await _send_manychat_reply(
                api_key=x_api_key, subscriber_id=subscriber_id,
                text=reply_text, canal=request.canal,
            )
            if conversacion_db_id:
                await db.insertar_mensaje(
                    conversacion_id=conversacion_db_id,
                    contenido=reply_text,
                    remitente="agente",
                    tipo="texto",
                    status="enviado",
                    modelo_llm=result.model_used,
                    metadata={"canal": request.canal, "subscriber_id": subscriber_id},
                    empresa_id=empresa_id,
                )

        elapsed = round(time.time() - started_at, 2)

        # ── Debug event: respuesta enviada ────────────────────────────────────
        _stage_sent = "fb_message_sent" if request.canal.lower() == "facebook" else "message_sent"
        add_kapso_debug_event(
            "fastapi", _stage_sent,
            {
                "subscriber_id": subscriber_id,
                "contacto_id": contacto_id,
                "empresa_id": empresa_id,
                "agent_name": agent.get("nombre_agente"),
                "model_used": result.model_used,
                "reply_preview": reply_text[:200] if reply_text else "",
                "elapsed_s": elapsed,
                "canal": request.canal,
            },
            channel=_channel,
        )

        logger.info("ManyChat inbound OK — empresa=%s subscriber=%s elapsed=%.2fs",
                    empresa_id, subscriber_id, elapsed)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ManyChat inbound error: %s", exc)
        add_kapso_debug_event(
            "fastapi", "error",
            {"subscriber_id": subscriber_id, "error": str(exc)},
            channel=_channel,
        )
        await send_error_to_webhook(
            exc,
            context="manychat_inbound",
            severity="error",
            fallback=f"Error procesando mensaje ManyChat — subscriber_id={subscriber_id}",
        )
        raise


# ── Retry stuck ManyChat messages ────────────────────────────────────────────

async def _retry_single_stuck_manychat_message(msg: dict) -> bool:
    """Re-process a single stuck ManyChat inbound message."""
    msg_id = msg.get("id")
    conversacion_id = msg.get("conversacion_id")
    contenido = msg.get("contenido") or ""
    metadata = msg.get("metadata") or {}
    timestamp = msg.get("timestamp") or ""

    subscriber_id = metadata.get("subscriber_id")
    canal = metadata.get("canal", "instagram")
    api_key = metadata.get("manychat_api_key")

    if not conversacion_id or not subscriber_id:
        logger.warning("retry_stuck_mc: msg %s missing conversacion_id or subscriber_id", msg_id)
        await db.actualizar_mensaje(int(msg_id), {"status": "error", "metadata": {**metadata, "retry_error": "missing conversacion_id or subscriber_id"}})
        return False

    if not api_key:
        logger.warning("retry_stuck_mc: msg %s missing manychat_api_key — cannot send reply", msg_id)
        await db.actualizar_mensaje(int(msg_id), {"status": "error", "metadata": {**metadata, "retry_error": "missing manychat_api_key"}})
        return False

    # Avoid duplicates: if a response already exists, just mark as enviado
    if timestamp and await db.has_agent_response_after(int(conversacion_id), timestamp):
        logger.info("retry_stuck_mc: msg %s already has agent response, marking enviado", msg_id)
        await db.actualizar_mensaje(int(msg_id), {"status": "enviado"})
        return True

    conversacion = await db.get_conversacion(int(conversacion_id))
    if not conversacion:
        logger.warning("retry_stuck_mc: conversacion %s not found for msg %s", conversacion_id, msg_id)
        await db.actualizar_mensaje(int(msg_id), {"status": "error", "metadata": {**metadata, "retry_error": "conversacion not found"}})
        return False

    contacto_id = conversacion.get("contacto_id")
    agente_id   = conversacion.get("agente_id")
    empresa_id  = conversacion.get("empresa_id")

    if not agente_id:
        await db.actualizar_mensaje(int(msg_id), {"status": "error", "metadata": {**metadata, "retry_error": "no agente_id"}})
        return False

    settings = get_settings()
    agentes = await db.get_agentes_por_empresa(int(empresa_id)) if empresa_id else []
    agent = next((a for a in agentes if a["id"] == agente_id), None)
    if not agent:
        await db.actualizar_mensaje(int(msg_id), {"status": "error", "metadata": {**metadata, "retry_error": "agent not found"}})
        return False

    contacto = await db.get_contacto(int(contacto_id)) if contacto_id else None
    model = agent.get("llm") or settings.DEFAULT_MODEL
    memory_session_id  = f"mc_{subscriber_id}"
    conversation_id_str = str(conversacion_id)

    try:
        prompt_context_data = await db.load_kapso_prompt_context(
            contacto_id=int(contacto_id) if contacto_id else None,
            empresa_id=int(empresa_id) if empresa_id else None,
            conversacion_id=int(conversacion_id),
            team_id=int(contacto["team_humano_id"]) if contacto and contacto.get("team_humano_id") else None,
            agente_id=int(agent["id"]) if agent.get("id") else None,
            agente_rol_id=int(agent["id_rol"]) if agent.get("id_rol") else None,
            limite_mensajes=8,
        )

        retry_inbound = _InboundProxy(
            from_phone=subscriber_id,
            contact_name=contacto.get("nombre") if contacto else None,
        )

        context_payload, prompt_extras = build_kapso_context_payload(
            contacto=contacto,
            agent=agent,
            empresa=prompt_context_data.get("empresa"),
            rol_agente=prompt_context_data.get("rol_agente"),
            team_humano=prompt_context_data.get("team_humano"),
            contextos=prompt_context_data.get("contextos") or [],
            citas=prompt_context_data.get("citas") or [],
            notificaciones=prompt_context_data.get("notificaciones") or [],
            mensajes_recientes=prompt_context_data.get("mensajes_recientes") or [],
            etapas_embudo=prompt_context_data.get("etapas_embudo") or [],
            notas=prompt_context_data.get("notas") or [],
            inbound=retry_inbound,
        )

        system_prompt = build_kapso_system_prompt(
            agent=agent,
            inbound=retry_inbound,
            contacto=contacto,
            context_payload=context_payload,
            extras=prompt_extras,
            rol_agente=prompt_context_data.get("rol_agente"),
        )

        await db.actualizar_mensaje(int(msg_id), {"status": "procesando"})

        result = await run_agent(
            ChatRequest(
                system_prompt=system_prompt,
                message=contenido.strip() or "El usuario envió un mensaje sin contenido legible.",
                model=model,
                mcp_servers=[],
                conversation_id=conversation_id_str,
                memory_session_id=memory_session_id,
                memory_window=8,
                contacto_id=int(contacto_id) if contacto_id else None,
                empresa_id=int(empresa_id) if empresa_id else None,
                channel="manychat",
            )
        )

        reply_text = (result.response or "").strip()
        if reply_text == CLOSING_FOLLOWUP_MARKER:
            reply_text = ""

        if reply_text:
            await _send_manychat_reply(
                api_key=api_key,
                subscriber_id=subscriber_id,
                text=reply_text,
                canal=canal,
            )
            await db.insertar_mensaje(
                conversacion_id=int(conversacion_id),
                contenido=reply_text,
                remitente="agente",
                tipo="texto",
                status="enviado",
                modelo_llm=result.model_used,
                metadata={
                    "canal": canal,
                    "subscriber_id": subscriber_id,
                    "source": "retry_stuck",
                    "original_message_id": msg_id,
                },
                empresa_id=int(empresa_id) if empresa_id else None,
            )

        await db.actualizar_mensaje(int(msg_id), {"status": "enviado"})

        add_kapso_debug_event(
            "fastapi", "retry_stuck_success",
            {
                "original_message_id": msg_id,
                "subscriber_id": subscriber_id,
                "empresa_id": empresa_id,
                "response_preview": reply_text[:200] if reply_text else "",
            },
            channel="manychat",
        )
        logger.info("retry_stuck_mc: msg %s processed successfully, response_chars=%s", msg_id, len(reply_text))
        return True

    except Exception as exc:
        logger.error("retry_stuck_mc: failed to process msg %s: %s", msg_id, exc, exc_info=True)
        await db.actualizar_mensaje(int(msg_id), {
            "status": "error",
            "metadata": {**metadata, "retry_error": str(exc), "retry_error_type": type(exc).__name__},
        })
        add_kapso_debug_event(
            "fastapi", "retry_stuck_error",
            {"original_message_id": msg_id, "subscriber_id": subscriber_id, "error": str(exc)},
            channel="manychat",
        )
        return False


async def retry_stuck_manychat_messages() -> dict:
    """Find and re-process stuck ManyChat messages. Called by the background task."""
    try:
        all_stuck = await db.get_stuck_messages(minutes_old=STUCK_MESSAGE_MINUTES, limit=20)
        stuck = [m for m in all_stuck if (m.get("metadata") or {}).get("subscriber_id")]
        if not stuck:
            return {"checked": True, "stuck_found": 0, "retried": 0, "success": 0}

        logger.info("retry_stuck_mc: found %d stuck ManyChat messages", len(stuck))
        add_kapso_debug_event(
            "fastapi", "retry_stuck_scan",
            {"stuck_count": len(stuck), "message_ids": [m.get("id") for m in stuck]},
            channel="manychat",
        )

        success_count = 0
        for msg in stuck:
            try:
                ok = await _retry_single_stuck_manychat_message(msg)
                if ok:
                    success_count += 1
            except Exception as exc:
                logger.error("retry_stuck_mc: unexpected error for msg %s: %s", msg.get("id"), exc)

        logger.info("retry_stuck_mc: processed %d/%d stuck messages", success_count, len(stuck))
        return {"checked": True, "stuck_found": len(stuck), "retried": len(stuck), "success": success_count}
    except Exception as exc:
        logger.error("retry_stuck_mc: scan failed: %s", exc, exc_info=True)
        return {"checked": True, "error": str(exc)}


# ── Debug endpoints ───────────────────────────────────────────────────────────

@router.get("/debug/events")
async def manychat_debug_events(limit: int = 50):
    """Todos los eventos ManyChat (Instagram + Facebook combinados)."""
    ig = get_channel_debug_events("instagram", limit=limit)
    fb = get_channel_debug_events("facebook", limit=limit)
    combined = sorted(ig + fb, key=lambda e: e.get("timestamp", ""), reverse=True)[:limit]
    return {"events": combined}


@router.get("/debug/instagram/events")
async def manychat_instagram_debug_events(limit: int = 50):
    """Eventos del canal Instagram solamente."""
    return {"events": get_channel_debug_events("instagram", limit=limit)}


@router.get("/debug/facebook/events")
async def manychat_facebook_debug_events(limit: int = 50):
    """Eventos del canal Facebook solamente."""
    return {"events": get_channel_debug_events("facebook", limit=limit)}


@router.get("/debug/config")
async def manychat_debug_config():
    settings = get_settings()
    return {
        "canales": ["instagram", "facebook"],
        "endpoint_inbound": "/api/v1/manychat/inbound",
        "send_url": _MANYCHAT_SEND_URL,
        "auth": "X-Api-Key header (ManyChat API key)",
        "agentes": ["conversational", "funnel (bg)", "contact_update (bg)"],
        "slash_commands": ["/borrar", "/borrar2"],
        "default_model": settings.DEFAULT_MODEL,
        "debug_endpoints": {
            "todos": "/api/v1/manychat/debug/events",
            "instagram": "/api/v1/manychat/debug/instagram/events",
            "facebook": "/api/v1/manychat/debug/facebook/events",
        },
    }
