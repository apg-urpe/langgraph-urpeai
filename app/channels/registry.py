"""Channel registry — maps channel name strings to adapter instances.

Usage:
    from app.channels.registry import get_channel

    channel = get_channel("whatsapp")   # → WhatsAppChannel instance
    channel = get_channel("ghl")        # → GHLChannel instance (future)
    channel = get_channel(None)         # → _GenericChannel (no-op)

To add a new channel:
    1. Create app/channels/<name>.py  implementing AbstractChannel
    2. Import it here and add it to _REGISTRY
"""
from __future__ import annotations

from app.channels.base import AbstractChannel
from app.channels.whatsapp import WhatsAppChannel


class _GenericChannel(AbstractChannel):
    """No-op channel returned when no specific adapter is registered."""
    name = "generic"


_REGISTRY: dict[str, AbstractChannel] = {
    "whatsapp": WhatsAppChannel(),
    # "instagram":    InstagramChannel(),   # future
    # "gohighlevel":  GHLChannel(),         # future
    # "manychat":     ManyChatChannel(),    # future
}

_GENERIC = _GenericChannel()


def get_channel(name: str | None) -> AbstractChannel:
    """Return the adapter for *name*, falling back to the generic no-op."""
    return _REGISTRY.get(name or "generic", _GENERIC)


def register_channel(channel: AbstractChannel) -> None:
    """Register (or replace) a channel adapter at runtime."""
    _REGISTRY[channel.name] = channel
