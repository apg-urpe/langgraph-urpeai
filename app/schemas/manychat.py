from __future__ import annotations

from pydantic import BaseModel


class ManyChatContactoIdentificador(BaseModel):
    subscriber_id: str
    telefono: str | None = None
    ultima_interaccion: str | None = None


class _ManyChatBody(BaseModel):
    mensaje: str
    nombre_usuario: str | None = None
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

    @property
    def nombre_usuario(self) -> str | None:
        return self.body.nombre_usuario


# ── ManyChat Dynamic Message response format ─────────────────────────────────

class _ManyChatTextMessage(BaseModel):
    type: str = "text"
    text: str


class _ManyChatContent(BaseModel):
    messages: list[_ManyChatTextMessage]
    actions: list = []
    quick_replies: list = []


class ManyChatSendManualRequest(BaseModel):
    """Envía un mensaje manual a un suscriptor de ManyChat (sin pasar por el agente IA).

    Usa contacto_id (integer de Supabase) — el sistema recupera el subscriber_id
    y el api_key automáticamente desde la conversación en DB.
    """
    contacto_id: int                # ID integer de wp_contactos (Supabase)
    mensaje: str
    canal: str = "instagram"        # "instagram" | "facebook" | "whatsapp"


class ManyChatSendManualResponse(BaseModel):
    ok: bool
    contacto_id: int
    subscriber_id: str | None = None    # ManyChat subscriber_id recuperado
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
