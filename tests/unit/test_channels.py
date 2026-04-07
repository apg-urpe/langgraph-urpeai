"""
Tests del Channel Adapter Pattern.

Cubre:
  - WhatsAppChannel: fast-paths (closing followup + reaction-only)
  - WhatsAppChannel: extract_actions (reacción + multimedia)
  - Channel registry: resolución por nombre
  - Generic channel: comportamiento no-op por defecto

Estos tests son 100% unitarios — no tocan BD, Nylas ni el LLM.
"""
import json

import pytest

from app.channels.base import ChannelActions, ChannelContext
from app.channels.registry import get_channel
from app.channels.whatsapp import (
    CLOSING_FOLLOWUP_MARKER,
    WhatsAppChannel,
    _infer_closing_emoji,
    _infer_reaction_emoji,
    _is_closing_followup,
    _is_reaction_only_request,
)
from app.schemas.chat import ToolCall


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def wa():
    return get_channel("whatsapp")


@pytest.fixture
def ctx():
    return ChannelContext(channel="whatsapp", contacto_id=1, empresa_id=1)


def _tool_call(name: str, input_data: dict, output: str) -> ToolCall:
    return ToolCall(
        tool_name=name,
        tool_input=input_data,
        tool_output=output,
        duration_ms=1.0,
        status="ok",
    )


# ══════════════════════════════════════════════════════════════════════════════
# Fast-paths: closing followup
# ══════════════════════════════════════════════════════════════════════════════

class TestClosingFollowup:
    def test_chao_detectado(self, wa, ctx):
        fp = wa.get_fast_path("chao", ctx)
        assert fp is not None
        assert fp.response_text == CLOSING_FOLLOWUP_MARKER
        assert fp.tool_name == "send_reaction"
        assert fp.source == "closing_followup"

    def test_adios_detectado(self, wa, ctx):
        assert wa.get_fast_path("adios", ctx) is not None

    def test_buenas_noches_detectado(self, wa, ctx):
        assert wa.get_fast_path("buenas noches", ctx) is not None

    def test_nos_vemos_detectado(self, wa, ctx):
        assert wa.get_fast_path("nos vemos", ctx) is not None

    def test_message_con_pregunta_no_es_closing(self, wa, ctx):
        # Tiene signo de pregunta → no es despedida
        fp = wa.get_fast_path("adios cuando es la cita?", ctx)
        assert fp is None

    def test_message_largo_no_es_closing(self, wa, ctx):
        # Más de 4 palabras → no es despedida corta
        fp = wa.get_fast_path("chao hasta luego que pases bien", ctx)
        assert fp is None

    def test_message_con_business_marker_no_es_closing(self, wa, ctx):
        fp = wa.get_fast_path("adios cuando tengo cita", ctx)
        assert fp is None

    def test_saludo_normal_no_es_closing(self, wa, ctx):
        fp = wa.get_fast_path("hola buenas tardes", ctx)
        assert fp is None

    def test_emoji_cierre_correcto_chao(self):
        assert _infer_closing_emoji("chao") == "👋"

    def test_emoji_cierre_correcto_gracias(self):
        assert _infer_closing_emoji("gracias") == "🙏"


# ══════════════════════════════════════════════════════════════════════════════
# Fast-paths: reaction only
# ══════════════════════════════════════════════════════════════════════════════

class TestReactionOnlyFastPath:
    def test_reacciona_detectado(self, wa, ctx):
        fp = wa.get_fast_path("reacciona a mi mensaje", ctx)
        assert fp is not None
        assert fp.source == "kapso"
        assert fp.response_text == "Ya reaccioné."
        assert fp.tool_name == "send_reaction"

    def test_emoji_en_mensaje_detectado(self, wa, ctx):
        fp = wa.get_fast_path("manda un emoji", ctx)
        assert fp is not None

    def test_reaction_bloqueada_por_business_marker(self, wa, ctx):
        # "cita" está en los blockers
        fp = wa.get_fast_path("reacciona cuando tengamos la cita", ctx)
        assert fp is None

    def test_reaction_bloqueada_por_longitud(self, wa, ctx):
        # Más de 24 palabras
        long_msg = "reacciona a este mensaje " + " ".join(["palabra"] * 25)
        fp = wa.get_fast_path(long_msg, ctx)
        assert fp is None

    def test_emoji_reaccion_amor(self):
        assert _infer_reaction_emoji("te amo") == "❤️"

    def test_emoji_reaccion_gracias(self):
        assert _infer_reaction_emoji("muchas gracias") == "🙏"

    def test_emoji_reaccion_default(self):
        assert _infer_reaction_emoji("mensaje neutro") == "👍"


# ══════════════════════════════════════════════════════════════════════════════
# Fast-paths: mensajes normales no deben triggear fast-path
# ══════════════════════════════════════════════════════════════════════════════

class TestNoFastPath:
    def test_consulta_normal(self, wa, ctx):
        assert wa.get_fast_path("hola necesito informacion sobre visas", ctx) is None

    def test_pregunta_de_cita(self, wa, ctx):
        assert wa.get_fast_path("cuando es mi cita?", ctx) is None

    def test_mensaje_vacio(self, wa, ctx):
        assert wa.get_fast_path("", ctx) is None

    def test_mensaje_none(self, wa, ctx):
        assert wa.get_fast_path(None, ctx) is None

    def test_canal_generico_nunca_fast_path(self, ctx):
        generic = get_channel("generic")
        # El canal genérico no tiene fast-paths definidos
        assert generic.get_fast_path("chao", ctx) is None
        assert generic.get_fast_path("reacciona", ctx) is None


# ══════════════════════════════════════════════════════════════════════════════
# extract_actions: parseo de tool_calls
# ══════════════════════════════════════════════════════════════════════════════

class TestExtractActions:
    def test_extrae_reaction_emoji(self, wa):
        tc = _tool_call("send_reaction", {"emoji": "❤️"}, "reaction:❤️")
        actions = wa.extract_actions([tc])
        assert actions.reaction_emoji == "❤️"

    def test_sin_tool_calls_no_acciones(self, wa):
        actions = wa.extract_actions([])
        assert actions.reaction_emoji is None
        assert actions.media_type is None

    def test_extrae_image_command(self, wa):
        payload = json.dumps({
            "__comando__": True, "comando": "image",
            "solicitud": "https://example.com/img.jpg",
            "extra": "descripcion foto", "contacto_id": 1,
        })
        tc = _tool_call("ejecutar_comando", {"comando": "image"}, payload)
        actions = wa.extract_actions([tc])
        assert actions.media_type == "image"
        assert actions.media_url == "https://example.com/img.jpg"
        assert actions.media_caption == "descripcion foto"
        assert actions.extra.get("comando_data") is not None

    def test_extrae_audio_command(self, wa):
        payload = json.dumps({
            "__comando__": True, "comando": "audio",
            "solicitud": "https://example.com/audio.mp3",
            "extra": "", "contacto_id": 1,
        })
        tc = _tool_call("ejecutar_comando", {"comando": "audio"}, payload)
        actions = wa.extract_actions([tc])
        assert actions.media_type == "audio"
        assert actions.media_caption is None  # string vacío → None

    def test_extrae_video_command(self, wa):
        payload = json.dumps({
            "__comando__": True, "comando": "video",
            "solicitud": "https://example.com/video.mp4",
            "extra": "caption video", "contacto_id": 1,
        })
        tc = _tool_call("ejecutar_comando", {"comando": "video"}, payload)
        actions = wa.extract_actions([tc])
        assert actions.media_type == "video"

    def test_monica_no_sets_media_type(self, wa):
        # "monica" es análisis de texto — no es multimedia
        payload = json.dumps({
            "__comando__": True, "comando": "monica",
            "solicitud": "analiza esto", "extra": "", "contacto_id": 1,
        })
        tc = _tool_call("ejecutar_comando", {"comando": "monica"}, payload)
        actions = wa.extract_actions([tc])
        assert actions.media_type is None
        assert "comando_data" in actions.extra  # raw data sigue disponible

    def test_json_invalido_ignorado_silenciosamente(self, wa):
        tc = _tool_call("ejecutar_comando", {}, "esto no es json")
        actions = wa.extract_actions([tc])
        assert actions.media_type is None
        assert actions.reaction_emoji is None

    def test_reaction_y_media_juntos(self, wa):
        tc_reaction = _tool_call("send_reaction", {"emoji": "🎉"}, "reaction:🎉")
        payload = json.dumps({
            "__comando__": True, "comando": "image",
            "solicitud": "https://example.com/img.jpg",
            "extra": "caption", "contacto_id": 1,
        })
        tc_media = _tool_call("ejecutar_comando", {"comando": "image"}, payload)
        actions = wa.extract_actions([tc_reaction, tc_media])
        assert actions.reaction_emoji == "🎉"
        assert actions.media_type == "image"


# ══════════════════════════════════════════════════════════════════════════════
# Channel registry
# ══════════════════════════════════════════════════════════════════════════════

class TestChannelRegistry:
    def test_whatsapp_retorna_instancia_correcta(self):
        ch = get_channel("whatsapp")
        assert isinstance(ch, WhatsAppChannel)
        assert ch.name == "whatsapp"

    def test_canal_desconocido_retorna_generic(self):
        ch = get_channel("canal_que_no_existe")
        assert ch.name == "generic"

    def test_none_retorna_generic(self):
        ch = get_channel(None)
        assert ch.name == "generic"

    def test_generic_channel_sin_tools(self):
        ch = get_channel("generic")
        ctx = ChannelContext(channel="generic", contacto_id=1)
        assert ch.get_tools(ctx) == []

    def test_generic_channel_extract_actions_vacio(self):
        ch = get_channel("generic")
        actions = ch.extract_actions([])
        assert isinstance(actions, ChannelActions)
        assert actions.reaction_emoji is None

    def test_whatsapp_tools_incluye_send_reaction(self):
        ch = get_channel("whatsapp")
        ctx = ChannelContext(channel="whatsapp", contacto_id=1)
        tools = ch.get_tools(ctx)
        names = [getattr(t, "name", "") for t in tools]
        assert "send_reaction" in names
        assert "ejecutar_comando" in names

    def test_whatsapp_tools_sin_contacto_id_solo_reaction(self):
        ch = get_channel("whatsapp")
        ctx = ChannelContext(channel="whatsapp", contacto_id=None)
        tools = ch.get_tools(ctx)
        names = [getattr(t, "name", "") for t in tools]
        # Sin contacto_id no se crea ejecutar_comando (necesita closure)
        assert "send_reaction" in names
        assert "ejecutar_comando" not in names
