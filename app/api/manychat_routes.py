"""ManyChat inbound endpoint.

Flujo:
  POST /api/v1/manychat/inbound  (X-Api-Key header)
      └─ Edge Function validate-channel-key  (Vault lookup)
          └─ empresa_id / agente_id / numero_id
              └─ run_agent()
                  └─ respuesta en formato Dynamic Message de ManyChat
"""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import APIRouter, Header, HTTPException

from app.agents.conversational import CLOSING_FOLLOWUP_MARKER, run_agent
from app.core.config import get_settings
from app.core.error_webhook import send_error_to_webhook
from app.core.kapso_prompt import build_kapso_context_payload, build_kapso_system_prompt
from app.db import queries as db
from app.schemas.chat import ChatRequest
from app.schemas.manychat import ManyChatInboundRequest, ManyChatInboundResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/manychat", tags=["manychat"])

_EDGE_FUNCTION = "validate-channel-key"


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


# ── Endpoint principal ────────────────────────────────────────────────────────

@router.post("/inbound", response_model=ManyChatInboundResponse)
async def manychat_inbound(
    request: ManyChatInboundRequest,
    x_api_key: str = Header(alias="X-Api-Key"),
):
    started_at = time.time()
    settings = get_settings()

    try:
        # 1. Autenticar via Edge Function → Vault
        canal_info = await _validate_api_key(x_api_key)
        empresa_id = int(canal_info["empresa_id"])
        agente_id = int(canal_info["agente_id"])
        numero_id = int(canal_info["numero_id"])

        # 2. Obtener configuración del agente
        agentes = await db.get_agentes_por_empresa(empresa_id)
        agent = next((a for a in agentes if a["id"] == agente_id), None)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agente {agente_id} no encontrado")

        model = agent.get("llm") or settings.DEFAULT_MODEL

        # 3. Upsert contacto por subscriber_id
        contacto, _ = await db.upsert_contacto_manychat(
            subscriber_id=request.subscriber_id,
            empresa_id=empresa_id,
            nombre=request.first_name,
            apellido=request.last_name,
            telefono=request.phone,
        )
        contacto_id = int(contacto["id"]) if contacto else None

        # 4. Obtener o crear conversación
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
        conversation_id = str(conversacion_db_id) if conversacion_db_id else str(uuid.uuid4())
        memory_session_id = f"mc_{request.subscriber_id}"

        # 5. Guardar mensaje entrante
        if conversacion_db_id:
            await db.insertar_mensaje(
                conversacion_id=conversacion_db_id,
                contenido=request.message,
                remitente="usuario",
                tipo="texto",
                status="procesando",
                metadata={
                    "canal": "manychat",
                    "subscriber_id": request.subscriber_id,
                    "page_id": request.page_id,
                },
                empresa_id=empresa_id,
            )

        # 6. Construir system prompt (reutiliza el mismo contexto que Kapso)
        prompt_context_data = await db.load_kapso_prompt_context(
            contacto_id=contacto_id,
            empresa_id=empresa_id,
            conversacion_id=conversacion_db_id,
            team_id=int(contacto["team_humano_id"]) if contacto and contacto.get("team_humano_id") else None,
            agente_id=agente_id,
            agente_rol_id=int(agent.get("id_rol") or 0),
            limite_mensajes=8,
        )

        nombre_completo = " ".join(filter(None, [request.first_name, request.last_name])) or None
        inbound_proxy = _InboundProxy(
            from_phone=request.phone or request.subscriber_id,
            contact_name=nombre_completo,
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

        # 7. Ejecutar agente conversacional
        result = await run_agent(
            ChatRequest(
                system_prompt=system_prompt,
                message=request.message,
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

        # 8. Guardar respuesta del agente
        if conversacion_db_id and reply_text:
            await db.insertar_mensaje(
                conversacion_id=conversacion_db_id,
                contenido=reply_text,
                remitente="agente",
                tipo="texto",
                status="enviado",
                modelo_llm=result.model_used,
                metadata={"canal": "manychat", "subscriber_id": request.subscriber_id},
                empresa_id=empresa_id,
            )

        elapsed = round(time.time() - started_at, 2)
        logger.info(
            "ManyChat inbound OK — empresa=%s subscriber=%s elapsed=%.2fs",
            empresa_id, request.subscriber_id, elapsed,
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
            fallback=f"Error procesando mensaje ManyChat — subscriber_id={request.subscriber_id}",
        )
        raise


# ── Debug ─────────────────────────────────────────────────────────────────────

@router.get("/debug")
async def manychat_debug(x_api_key: str = Header(alias="X-Api-Key", default="")):
    """Info de configuración del canal ManyChat."""
    settings = get_settings()
    return {
        "canal": "manychat",
        "edge_function_url": f"{settings.SUPABASE_EDGE_FUNCTION_URL}/{_EDGE_FUNCTION}",
        "endpoint_inbound": "/api/v1/manychat/inbound",
        "auth_header": "X-Api-Key",
        "response_format": "ManyChat Dynamic Message v2",
        "docs": "/docs#/manychat",
    }
