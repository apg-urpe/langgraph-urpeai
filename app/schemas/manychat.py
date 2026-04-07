from __future__ import annotations

from pydantic import BaseModel


class ManyChatInboundRequest(BaseModel):
    subscriber_id: str
    first_name: str | None = None
    last_name: str | None = None
    message: str
    phone: str | None = None
    page_id: str | None = None


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
