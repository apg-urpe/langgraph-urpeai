"""Shared async HTTP client with connection pooling.

Provides a single httpx.AsyncClient instance reused across the process.
Import ``get_shared_http_client`` wherever you need an outbound HTTP call
that is not handled by a dedicated client (Supabase, Nylas, etc.).
"""
import httpx

_shared_http_client: "httpx.AsyncClient | None" = None


def get_shared_http_client() -> httpx.AsyncClient:
    """Return the process-wide shared httpx.AsyncClient (lazy-initialised)."""
    global _shared_http_client
    if _shared_http_client is None or _shared_http_client.is_closed:
        _shared_http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _shared_http_client
