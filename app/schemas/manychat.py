from __future__ import annotations

from pydantic import BaseModel


class ManyChatContactoIdentificador(BaseModel):
    subscriber_id: str


class _ManyChatBody(BaseModel):
    mensaje: str
    contacto_identificador: ManyChatContactoIdentificador
    telefono_receptor: str
    canal: str = "instagram"


class ManyChatInboundRequest(BaseModel):
    """ManyChat envuelve el payload en una clave 'body'."""
    body: _ManyChatBody

    # Shortcuts para no cambiar la lógica del endpoint
    @property
    def mensaje(self) -> str:
        return self.body.mensaje

    @property
    def contacto_identificador(self) -> ManyChatContactoIdentificador:
        return self.body.contacto_identificador

    @property
    def telefono_receptor(self) -> str:
        return self.body.telefono_receptor

    @property
    def canal(self) -> str:
        return self.body.canal


# ── ManyChat Dynamic Message response format ─────────────────────────────────

class _ManyChatTextMessage(BaseModel):
    type: str = "text"
    text: str


class _ManyChatContent(BaseModel):
    messages: list[_ManyChatTextMessage]
    actions: list = []
    quick_replies: list = []


class ManyChatSendManualRequest(BaseModel):
    """Envía un mensaje manual a un suscriptor de ManyChat (sin pasar por el agente IA)."""
    subscriber_id: str
    mensaje: str
    canal: str = "instagram"
    telefono_receptor: str  # necesario para recuperar el token de ManyChat de la conversación


class ManyChatSendManualResponse(BaseModel):
    ok: bool
    subscriber_id: str
    guardado_en_db: bool = False
    error: str | None = None


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

    @classmethod
    def empty(cls) -> "ManyChatInboundResponse":
        """Respuesta vacía — usado cuando el mensaje ya fue enviado via API."""
        return cls(content=_ManyChatContent(messages=[]))
