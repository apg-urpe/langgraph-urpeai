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
from app.schemas.manychat import ManyChatInboundRequest, ManyChatInboundResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/manychat", tags=["manychat"])

_MANYCHAT_SEND_URL = "https://api.manychat.com/fb/sending/sendContent"
FUNNEL_TIMEOUT_SECONDS = 25
CONTACT_UPDATE_TIMEOUT_SECONDS = 20

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




# ── Envío de respuesta via ManyChat API ──────────────────────────────────────

async def _send_manychat_reply(
    api_key: str,
    subscriber_id: str,
    text: str,
    canal: str,
) -> None:
    """Envía el texto de respuesta al suscriptor via ManyChat API."""
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
        else:
            logger.error("ManyChat sendContent error %s: %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.error("ManyChat sendContent excepción: %s", exc)


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
    started_at = time.time()
    settings = get_settings()

    subscriber_id = request.contacto_identificador.subscriber_id

    slash_command = _extract_slash_command(request.mensaje)

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
        if not slash_command:
            contacto, contacto_creado = await db.upsert_contacto_manychat(
                subscriber_id=subscriber_id,
                empresa_id=empresa_id,
            )
            if contacto_creado:
                logger.info("ManyChat: nuevo contacto — subscriber=%s empresa=%s", subscriber_id, empresa_id)
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
        # Slash commands — ejecutar y retornar sin correr el agente
        # ═════════════════════════════════════════════════════════════════════
        if slash_command:
            add_kapso_debug_event(
                "fastapi", "slash_command_detected",
                {"command": slash_command, "subscriber_id": subscriber_id, "contacto_id": contacto_id},
                channel="manychat",
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
                channel="manychat",
            )

            await _send_manychat_reply(api_key=x_api_key, subscriber_id=subscriber_id,
                                       text=reply_text, canal=request.canal)
            return ManyChatInboundResponse.empty()

        # ── Guardar mensaje entrante ──────────────────────────────────────────
        if conversacion_db_id:
            await db.insertar_mensaje(
                conversacion_id=conversacion_db_id,
                contenido=request.mensaje,
                remitente="usuario",
                tipo="texto",
                status="procesando",
                metadata={
                    "canal": request.canal,
                    "subscriber_id": subscriber_id,
                    "telefono_receptor": request.telefono_receptor,
                },
                empresa_id=empresa_id,
            )

        # ── Debug event: mensaje recibido ─────────────────────────────────────
        add_kapso_debug_event(
            "fastapi", "message_received",
            {
                "subscriber_id": subscriber_id,
                "contacto_id": contacto_id,
                "empresa_id": empresa_id,
                "message": request.mensaje[:200],
                "canal": request.canal,
                "nuevo_contacto": contacto_creado,
            },
            channel="manychat",
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
        if contacto_id and _should_run_funnel_agent(request.mensaje):
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
                message=request.mensaje,
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
        add_kapso_debug_event(
            "fastapi", "message_sent",
            {
                "subscriber_id": subscriber_id,
                "contacto_id": contacto_id,
                "empresa_id": empresa_id,
                "agent_name": agent.get("nombre_agente"),
                "model_used": result.model_used,
                "reply_preview": reply_text[:200] if reply_text else "",
                "elapsed_s": elapsed,
            },
            channel="manychat",
        )

        logger.info("ManyChat inbound OK — empresa=%s subscriber=%s elapsed=%.2fs",
                    empresa_id, subscriber_id, elapsed)
        return ManyChatInboundResponse.empty()

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ManyChat inbound error: %s", exc)
        add_kapso_debug_event(
            "fastapi", "error",
            {"subscriber_id": subscriber_id, "error": str(exc)},
            channel="manychat",
        )
        await send_error_to_webhook(
            exc,
            context="manychat_inbound",
            severity="error",
            fallback=f"Error procesando mensaje ManyChat — subscriber_id={subscriber_id}",
        )
        raise


# ── Debug endpoints ───────────────────────────────────────────────────────────

@router.get("/debug/events")
async def manychat_debug_events(limit: int = 50):
    return {"events": get_channel_debug_events("manychat", limit=limit)}


@router.get("/debug/config")
async def manychat_debug_config():
    settings = get_settings()
    return {
        "canal": "manychat",
        "endpoint_inbound": "/api/v1/manychat/inbound",
        "send_url": _MANYCHAT_SEND_URL,
        "auth": "X-Api-Key header (ManyChat API key)",
        "agentes": ["conversational", "funnel (bg)", "contact_update (bg)"],
        "slash_commands": ["/borrar", "/borrar2"],
        "default_model": settings.DEFAULT_MODEL,
    }
