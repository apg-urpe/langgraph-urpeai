from __future__ import annotations

from pydantic import BaseModel


class ManyChatContactoIdentificador(BaseModel):
    subscriber_id: str


class ManyChatInboundRequest(BaseModel):
    mensaje: str
    contacto_identificador: ManyChatContactoIdentificador
    telefono_receptor: str          # número registrado en wp_numeros
    canal: str = "instagram"


# ── ManyChat Dynamic Message response format ─────────────────────────────────

class _ManyChatTextMessage(BaseModel):
    type: str = "text"
    text: str


class _ManyChatContent(BaseModel):
    messages: list[_ManyChatTextMessage]
    actions: list = []
    quick_replies: list = []


class ManyChatInboundResponse(BaseModel):
    version: str = "v2"
    content: _ManyChatContent

    @classmethod
    def text(cls, text: str) -> "ManyChatInboundResponse":
        return cls(
            content=_ManyChatContent(
                messages=[_ManyChatTextMessage(text=text or "")]
            )
        )
