"""Schemas para Go High Level (GHL) webhook — Instagram y Facebook."""
from pydantic import BaseModel, ConfigDict


class GHLInboundRequest(BaseModel):
    """Payload del webhook de GHL.

    Acepta campos planos (standard data de GHL = Contact's details) +
    los custom fields que configuramos explícitamente en el webhook.
    extra='allow' captura cualquier campo extra que GHL envíe.
    """
    model_config = ConfigDict(extra="allow")

    # ── Custom fields (configurados en el webhook de GHL) ─────────────────
    message_body: str = ""          # {{message.body}}
    multimedia: str | None = None   # {{message.attachments}}
    telefono_recept: str = ""       # número en wp_numeros → identifica empresa/agente
    contact_id: str | None = None   # {{contact.id}}
    nombre: str | None = None       # {{contact.name}}
    conversation_id: str | None = None  # {{conversation.id}} → para enviar reply
    canal: str = "instagram"        # "instagram" | "facebook"

    # ── Standard GHL contact data (enviado automáticamente) ───────────────
    id: str | None = None           # GHL contact ID (a veces viene como 'id')
    firstName: str | None = None
    lastName: str | None = None
    name: str | None = None
    phone: str | None = None        # Teléfono del remitente
    email: str | None = None
    locationId: str | None = None   # GHL location ID

    @property
    def ghl_contact_id(self) -> str:
        """ID único del contacto en GHL (equivalente a subscriber_id de ManyChat)."""
        return self.contact_id or self.id or ""

    @property
    def contact_name(self) -> str | None:
        return (
            self.nombre
            or self.name
            or (" ".join(p for p in [self.firstName, self.lastName] if p) or None)
        )

    @property
    def ghl_conversation_id(self) -> str | None:
        return self.conversation_id


class GHLInboundResponse(BaseModel):
    received: bool = True
    message: str = "ok"
