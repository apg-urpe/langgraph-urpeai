"""Schemas para Go High Level (GHL) webhook — basados en payload real recibido."""
from pydantic import BaseModel, ConfigDict


class _GHLCustomData(BaseModel):
    model_config = ConfigDict(extra="allow")
    message_body: str = ""
    multimedia: str | None = None
    telefono_receptor: str = ""   # número en wp_numeros → identifica empresa/agente


class _GHLMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: int | str | None = None
    body: str = ""


class _GHLLocation(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str | None = None         # GHL location ID
    name: str | None = None


class GHLInboundRequest(BaseModel):
    """Payload real del webhook de GHL (Contact's details + custom data).

    Estructura observada:
    {
      contact_id, first_name, full_name, phone,
      message: { body },
      location: { id, name },
      customData: { message_body, multimedia, telefono_receptor },
      contact: { attributionSource: { medium, igSid } }
    }
    """
    model_config = ConfigDict(extra="allow")

    # ── Campos raíz (standard GHL) ────────────────────────────────────────
    contact_id: str | None = None       # ID único del contacto en GHL
    first_name: str | None = None
    full_name: str | None = None
    phone: str | None = None            # Teléfono del remitente

    # ── Campos anidados ───────────────────────────────────────────────────
    message: _GHLMessage | None = None
    location: _GHLLocation | None = None
    customData: _GHLCustomData | None = None

    # ── Propiedades de conveniencia ───────────────────────────────────────

    @property
    def ghl_contact_id(self) -> str:
        return self.contact_id or ""

    @property
    def contact_name(self) -> str | None:
        return self.full_name or self.first_name or None

    @property
    def message_text(self) -> str:
        """Texto del mensaje — viene en customData.message_body y en message.body."""
        if self.customData and self.customData.message_body:
            return self.customData.message_body
        if self.message and self.message.body:
            return self.message.body
        return ""

    @property
    def telefono_receptor(self) -> str:
        return (self.customData.telefono_receptor if self.customData else "") or ""

    @property
    def canal(self) -> str:
        """Canal detectado desde attributionSource.medium (instagram / facebook)."""
        try:
            medium = self.model_extra.get("contact", {}).get("attributionSource", {}).get("medium", "")
            if isinstance(medium, str) and medium.lower() == "facebook":
                return "facebook"
        except Exception:
            pass
        return "instagram"


class GHLInboundResponse(BaseModel):
    received: bool = True
    message: str = "ok"
