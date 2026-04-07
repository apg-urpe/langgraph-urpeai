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
from app.core.kapso_prompt import build_kapso_context_payload, build_kapso_system_prompt
from app.db import queries as db
from app.schemas.chat import ChatRequest
from app.schemas.contact_update import ContactUpdateAgentRequest
from app.schemas.funnel import FunnelAgentRequest
from app.schemas.manychat import ManyChatInboundRequest, ManyChatInboundResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/manychat", tags=["manychat"])

_EDGE_FUNCTION = "validate-channel-key"
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


# ── Proxy que imita los campos de KapsoInboundRequest usados en kapso_prompt ─

@dataclass
class _InboundProxy:
    from_phone: str
    contact_name: str | None
    message_type: str = "text"
    has_media: bool = False


# ── Edge Function auth ────────────────────────────────────────────────────────

async def _validate_api_key(api_key: str) -> dict:
    """Valida el API key contra el Vault via Edge Function.
    Retorna {empresa_id, agente_id, numero_id, canal}.
    """
    settings = get_settings()
    url = f"{settings.SUPABASE_EDGE_FUNCTION_URL}/{_EDGE_FUNCTION}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            url,
            json={"api_key": api_key},
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="API key inválida")
    if resp.status_code != 200:
        logger.error("Edge Function error %s: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=502, detail="Error validando credenciales")

    data = resp.json()
    if not data or not data.get("empresa_id"):
        raise HTTPException(status_code=401, detail="API key inválida")

    return data


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

    try:
        # ── Auth via Edge Function → Vault ────────────────────────────────────
        # Valida que el X-Api-Key corresponde a un bot autorizado y obtiene
        # el empresa_id esperado para cruzarlo con el lookup de telefono_receptor.
        canal_info         = await _validate_api_key(x_api_key)
        empresa_id_auth    = int(canal_info["empresa_id"])

        # ── Lookup por telefono_receptor en wp_numeros ────────────────────────
        # Igual que Kapso resuelve por phone_number_id.
        numero = await db.get_numero_por_telefono(request.telefono_receptor)
        if not numero:
            raise HTTPException(status_code=404, detail=f"Número {request.telefono_receptor} no configurado")

        empresa_id = int(numero["empresa_id"])
        agente_id  = int(numero["agente_id"])
        numero_id  = int(numero["id"])

        # Verificar que el api_key pertenece a la misma empresa que el número
        if empresa_id != empresa_id_auth:
            raise HTTPException(status_code=401, detail="API key no autorizada para este número")

        # ── Agente config ─────────────────────────────────────────────────────
        agentes = await db.get_agentes_por_empresa(empresa_id)
        agent = next((a for a in agentes if a["id"] == agente_id), None)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agente {agente_id} no encontrado")

        model = agent.get("llm") or settings.DEFAULT_MODEL

        # ── Upsert contacto por subscriber_id ────────────────────────────────
        contacto, contacto_creado = await db.upsert_contacto_manychat(
            subscriber_id=subscriber_id,
            empresa_id=empresa_id,
        )
        contacto_id = int(contacto["id"]) if contacto else None

        if contacto_creado:
            logger.info("ManyChat: nuevo contacto creado — subscriber=%s empresa=%s", subscriber_id, empresa_id)

        # ── Conversación ──────────────────────────────────────────────────────
        conversacion_db = None
        if contacto_id:
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

        conversacion_db_id = int(conversacion_db["id"]) if conversacion_db else None
        conversation_id    = str(conversacion_db_id) if conversacion_db_id else str(uuid.uuid4())
        memory_session_id  = f"mc_{subscriber_id}"

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

        # ═════════════════════════════════════════════════════════════════════
        # Phase 1 — Agente conversacional (responde dentro del timeout de ManyChat)
        # Funnel + Contact Update corren en background para no bloquear.
        # ═════════════════════════════════════════════════════════════════════
        if contacto_id and _should_run_funnel_agent(request.mensaje):
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

        # ── Guardar respuesta del agente ──────────────────────────────────────
        if conversacion_db_id and reply_text:
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
        logger.info(
            "ManyChat inbound OK — empresa=%s subscriber=%s nuevo=%s elapsed=%.2fs",
            empresa_id, subscriber_id, contacto_creado, elapsed,
        )

        return ManyChatInboundResponse.text(reply_text)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ManyChat inbound error: %s", exc)
        await send_error_to_webhook(
            exc,
            context="manychat_inbound",
            severity="error",
            fallback=f"Error procesando mensaje ManyChat — subscriber_id={subscriber_id}",
        )
        raise


# ── Debug ─────────────────────────────────────────────────────────────────────

@router.get("/debug")
async def manychat_debug():
    settings = get_settings()
    return {
        "canal": "manychat",
        "edge_function_url": f"{settings.SUPABASE_EDGE_FUNCTION_URL}/{_EDGE_FUNCTION}",
        "endpoint_inbound": "/api/v1/manychat/inbound",
        "auth_header": "X-Api-Key",
        "agentes": ["funnel", "contact_update", "conversational"],
        "response_format": "ManyChat Dynamic Message v2",
        "docs": "/docs#/manychat",
    }
