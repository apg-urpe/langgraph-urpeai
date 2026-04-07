"""WhatsApp / Kapso channel adapter.

Contains everything that is specific to the WhatsApp channel:
  - Tool definitions  (send_reaction, ejecutar_comando)
  - Fast-path detection  (reaction-only requests, closing farewells)
  - Tool-output parsing  (extract reaction emoji and multimedia commands)

Nothing in this file should know about the LangGraph agent internals or the
FastAPI request/response cycle.  It only implements the AbstractChannel
contract from app.channels.base.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata

from langchain_core.tools import tool

from app.channels.base import (
    AbstractChannel,
    ChannelActions,
    ChannelContext,
    FastPathResult,
)

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

SEND_REACTION_TOOL_NAME = "send_reaction"
EJECUTAR_COMANDO_TOOL_NAME = "ejecutar_comando"
CLOSING_FOLLOWUP_MARKER = "__closing_followup__"
_VALID_COMMANDS = {"image", "audio", "video", "monica"}


# ── Tool definitions ──────────────────────────────────────────────────────────

@tool
def send_reaction(emoji: str) -> str:
    """Envía una reacción de emoji al mensaje del usuario en WhatsApp.
    Úsala cuando sientas que el mensaje merece una reacción emocional
    (ej: mensajes de amor, gratitud, buenas noticias, logros, humor).
    Ejemplos de emojis: ❤️ 🙏 😂 🎉 👍 🔥 😍 💪
    """
    return f"reaction:{emoji}"


def _create_comandos_tool(contacto_id: int):
    """Crea un tool ejecutar_comando con el contacto_id capturado por closure."""

    @tool
    async def ejecutar_comando(comando: str, solicitud: str, extra: str = "") -> str:
        """Ejecuta un comando especial del sistema para enviar multimedia o ejecutar análisis.

## Campos Requeridos

### 1. `comando`
Especifica el tipo de multimedia a enviar. **Selecciona solo una opción:**
- `image` - Para imágenes
- `audio` - Para archivos de audio
- `video` - Para videos

### 2. `solicitud`
Proporciona la URL del archivo multimedia.
- **Formato:** URL limpia, sin caracteres o elementos adicionales.
- **Ejemplo:** `https://ejemplo.com/imagen.jpg`

### 3. `extra`
Información sintetizada y concreta que se envía en el caption según el tipo de contenido:
- **Para imágenes:** Texto del caption (descripción)
- **Para audios:** Texto del caption (descripción)
- **Para videos:** Texto del caption (descripción concreta, que complementa el video pero no repite palabras del contenido)

IMPORTANTE:
• Para multimedia (image/audio/video), solicitud DEBE ser una URL pública válida.
• Revisa la sección de "Manejo de herramientas" y "Multimedia" en tus instrucciones del sistema
  para saber cuándo y cómo enviar multimedia, qué URLs usar y qué contenido asignar.
• No inventes URLs. Usa exclusivamente las URLs proporcionadas en tus instrucciones.

Args:
    comando: Tipo de comando a ejecutar ("image", "audio", "video")
    solicitud: URL pública del archivo multimedia
    extra: Texto del caption que acompaña al multimedia
"""
        import json as _json

        cmd = comando.strip().lower()
        if cmd not in _VALID_COMMANDS:
            return f"❌ Comando inválido: '{comando}'. Comandos válidos: {', '.join(sorted(_VALID_COMMANDS))}"

        result = {
            "__comando__": True,
            "comando": cmd,
            "solicitud": solicitud.strip(),
            "extra": extra.strip() if extra else "",
            "contacto_id": contacto_id,
        }
        logger.info(
            "ejecutar_comando: cmd=%s contacto_id=%s solicitud=%s",
            cmd, contacto_id, solicitud[:80],
        )
        return _json.dumps(result, ensure_ascii=False)

    return ejecutar_comando


# ── Text normalisation ────────────────────────────────────────────────────────

def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", str(value))
    without_accents = "".join(c for c in normalized if not unicodedata.combining(c))
    return " ".join(without_accents.lower().split())


# ── Fast-path detection ───────────────────────────────────────────────────────

_REACTION_MARKERS = (
    "reacciona",
    "reaccion",
    "reaction",
    "emoji",
    "react to my message",
)

_REACTION_BUSINESS_BLOCKERS = (
    "visa", "cita", "agendar", "oferta", "puesto", "trabajo",
    "empleo", "precio", "asesor", "vacante", "asilo",
)

_CLOSING_PHRASES = {
    # Solo despedidas reales — NO confirmaciones como "si", "ok", "dale", "listo"
    "bye", "chao", "adios", "nos vemos", "hasta luego", "hasta pronto",
    "cuídate", "cuidate", "buenas noches", "que descanses", "descansa",
    "un abrazo", "saludos", "bendiciones",
}

_CLOSING_BUSINESS_BLOCKERS = {
    "visa", "cita", "agendar", "agenda", "oferta", "puesto", "trabajo",
    "empleo", "precio", "costo", "cuanto", "cuánto", "asesor", "vacante",
    "asilo", "pregunta", "duda", "consulta", "como", "cómo", "cuando",
    "cuándo", "donde", "dónde", "porque", "por que", "necesito", "quiero",
    "ayuda", "problema", "urgente", "llamar", "llama", "informacion",
    "información", "detalles", "explica", "pero", "pago", "cobro",
    "proceso", "proseso",
}


def _is_reaction_only_request(message: str | None) -> bool:
    normalized = _normalize_text(message)
    if not normalized:
        return False
    if not any(marker in normalized for marker in _REACTION_MARKERS):
        return False
    if any(marker in normalized for marker in _REACTION_BUSINESS_BLOCKERS):
        return False
    return len(normalized.split()) <= 24


def _is_closing_followup(message: str | None) -> bool:
    """Detect short farewell/goodbye messages that don't need a text reply.

    ONLY true despedidas (bye, chao, adios, buenas noches, etc.).
    Confirmaciones (si, ok, dale, listo, gracias) are NOT closing — the user
    may be responding to a question from the agent.
    """
    if not message:
        return False
    raw = str(message).strip()
    normalized = _normalize_text(raw)
    if not normalized:
        return False
    words = normalized.split()
    if len(words) > 4:
        return False
    if any(blocker in normalized for blocker in _CLOSING_BUSINESS_BLOCKERS):
        return False
    if "?" in raw:
        return False
    if normalized in _CLOSING_PHRASES:
        return True
    if any(normalized.startswith(phrase) for phrase in _CLOSING_PHRASES if len(phrase.split()) <= 2):
        if len(words) <= 3:
            return True
    return False


# ── Emoji inference ───────────────────────────────────────────────────────────

def _infer_reaction_emoji(message: str | None) -> str:
    normalized = _normalize_text(message)
    if any(m in normalized for m in ("amor", "te amo", "love", "corazon", "corazón", "carino", "cariño")):
        return "❤️"
    if any(m in normalized for m in ("gracias", "thanks", "agrade", "bendicion", "bendición")):
        return "🙏"
    if any(m in normalized for m in ("felicidades", "logro", "buenas noticias", "celebra", "gané", "gane")):
        return "🎉"
    if any(m in normalized for m in ("jaja", "jajaja", "gracioso", "chiste", "haha")):
        return "😂"
    if any(m in normalized for m in ("hola", "buenos dias", "buenas tardes", "saludos", "hello", "hi")):
        return "👋"
    return "👍"


def _infer_closing_emoji(message: str | None) -> str:
    normalized = _normalize_text(message)
    if any(w in normalized for w in ("gracias", "thanks", "bendicion", "bendiciones")):
        return "🙏"
    if any(w in normalized for w in ("abrazo", "carino", "cariño", "love", "te quiero")):
        return "❤️"
    if any(w in normalized for w in ("bye", "chao", "adios", "nos vemos", "hasta luego", "cuídate", "cuidate", "noches", "descanses")):
        return "👋"
    if any(w in normalized for w in ("perfecto", "excelente", "genial")):
        return "🔥"
    return "👍"


def _build_reaction_ack(_message: str | None, _emoji: str | None = None) -> str:
    return "Ya reaccioné."


# ── WhatsApp Channel Adapter ──────────────────────────────────────────────────

class WhatsAppChannel(AbstractChannel):
    """Channel adapter for WhatsApp via the Kapso bridge.

    Responsibilities:
      - Provides send_reaction + ejecutar_comando as channel-specific tools.
      - Implements two fast-paths (reaction-only, closing followup) that
        bypass the LLM entirely for latency-sensitive trivial responses.
      - Parses tool_calls to extract reaction emoji and multimedia commands.
    """

    name = "whatsapp"

    # ── Tools ─────────────────────────────────────────────────────────────────

    def get_tools(self, context: ChannelContext) -> list:
        """Returns [send_reaction, ejecutar_comando] when a contacto_id is available."""
        tools = [send_reaction]
        if context.contacto_id:
            tools.append(_create_comandos_tool(context.contacto_id))
        return tools

    # ── Fast-paths ────────────────────────────────────────────────────────────

    def get_fast_path(
        self, message: str | None, context: ChannelContext
    ) -> FastPathResult | None:
        """Check for reaction-only or closing-followup patterns."""
        if _is_reaction_only_request(message):
            emoji = _infer_reaction_emoji(message)
            return FastPathResult(
                response_text=_build_reaction_ack(message, emoji),
                tool_name=SEND_REACTION_TOOL_NAME,
                tool_input={"emoji": emoji},
                tool_output=f"reaction:{emoji}",
                source="kapso",
                description=str(send_reaction.description or ""),
            )
        if _is_closing_followup(message):
            emoji = _infer_closing_emoji(message)
            return FastPathResult(
                response_text=CLOSING_FOLLOWUP_MARKER,
                tool_name=SEND_REACTION_TOOL_NAME,
                tool_input={"emoji": emoji},
                tool_output=f"reaction:{emoji}",
                source="closing_followup",
                description="Reacción de cierre — mensaje no requiere respuesta de texto",
            )
        return None

    # ── Action extraction ──────────────────────────────────────────────────────

    def extract_actions(self, tool_calls: list) -> ChannelActions:
        """Parse agent tool_calls into a ChannelActions for the Kapso bridge."""
        actions = ChannelActions()
        for tc in tool_calls:
            # Reaction emoji
            if tc.tool_name == SEND_REACTION_TOOL_NAME:
                emoji = (tc.tool_input or {}).get("emoji")
                if emoji:
                    actions.reaction_emoji = str(emoji)

            # Multimedia command (image / audio / video / monica)
            elif tc.tool_name == EJECUTAR_COMANDO_TOOL_NAME and tc.tool_output:
                try:
                    parsed = json.loads(tc.tool_output)
                    if isinstance(parsed, dict) and parsed.get("__comando__"):
                        cmd = parsed.get("comando", "")
                        url = parsed.get("solicitud", "")
                        caption = parsed.get("extra") or None
                        if cmd in ("image", "audio", "video") and url:
                            actions.media_type = cmd
                            actions.media_url = url
                            actions.media_caption = caption
                        # Always store raw dict (needed for "monica" and logging)
                        actions.extra["comando_data"] = parsed
                except (json.JSONDecodeError, TypeError):
                    pass
        return actions
