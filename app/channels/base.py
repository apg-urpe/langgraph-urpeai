"""Base classes for the multi-channel adapter pattern.

Every messaging platform (WhatsApp, Instagram, GoHighLevel, ManyChat, …)
implements AbstractChannel.  The conversational agent is channel-agnostic:
it asks the channel for its tools and fast-paths, then delegates back to the
channel to interpret the resulting tool calls.

Flow:
    inbound route
        → channel.get_fast_path()  → shortcut (no LLM)
        → channel.get_tools()      → injected into agent
        → run_agent()
        → channel.extract_actions() → ChannelActions (reaction, media, …)
        → outbound route dispatches ChannelActions to the platform API
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Shared types ──────────────────────────────────────────────────────────────

@dataclass
class ChannelContext:
    """Contextual data available when the channel resolves tools / fast-paths."""
    channel: str
    contacto_id: int | None = None
    empresa_id: int | None = None
    message_id: str | None = None


@dataclass
class FastPathResult:
    """A fast-path skips the LLM entirely and returns an immediate response.

    Examples: reaction-only messages, short farewells (closing followup).
    """
    response_text: str          # Text the agent returns (may be a marker constant)
    tool_name: str              # Tool that was "called" (for tracing)
    tool_input: dict            # Input passed to that tool
    tool_output: str            # Output of that tool
    source: str = "fastpath"    # Trace label (e.g. "kapso", "closing_followup")
    description: str = ""       # Human-readable description for tracing


@dataclass
class ChannelActions:
    """Normalized actions extracted from the agent's tool calls.

    Each channel knows which tool names map to which actions.
    The outbound route reads this object and dispatches to the platform API.
    """
    reaction_emoji: str | None = None
    media_type: str | None = None       # "image" | "audio" | "video"
    media_url: str | None = None
    media_caption: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)  # raw / channel-specific data


# ── Abstract base ─────────────────────────────────────────────────────────────

class AbstractChannel:
    """Contract for all channel adapters.

    Default implementations are no-ops so that subclasses only override what
    they need.  A ``_GenericChannel`` instance is returned by the registry
    when the channel name is unknown.
    """

    name: str = "generic"

    def get_tools(self, context: ChannelContext) -> list:
        """Return channel-specific LangChain tools to inject into the agent.

        Called once per request, before the agent graph is built.
        Generic (CRM) tools are added separately by the agent runner.
        """
        return []

    def get_fast_path(
        self, message: str | None, context: ChannelContext
    ) -> FastPathResult | None:
        """Check whether this message can be answered without invoking the LLM.

        Returns a ``FastPathResult`` to short-circuit, or ``None`` to proceed
        with normal LLM processing.
        """
        return None

    def extract_actions(self, tool_calls: list) -> ChannelActions:
        """Convert the agent's raw tool_calls into a normalised ``ChannelActions``.

        Each channel knows which tool names it owns and how to parse their
        outputs into platform-specific actions (reactions, media sends, etc.).
        """
        return ChannelActions()
