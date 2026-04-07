"""Cliente Supabase REST directo con httpx.AsyncClient + connection pooling HTTP/2."""
import asyncio
import logging
from typing import Any
import json as _json

import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: "SupabaseClient | None" = None

# Reintentos automáticos cuando Supabase devuelve HTML (error transitorio de CDN)
_RETRY_ATTEMPTS = 3
_RETRY_DELAY_S = 0.8   # espera entre intentos


class SupabaseClient:
    """Cliente ligero sobre PostgREST con httpx pooled."""

    def __init__(self, url: str, service_key: str):
        self.base_url = f"{url}/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=15,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        logger.info("SupabaseClient inicializado (httpx pooled, HTTP/2)")

    # ── JSON helpers ──────────────────────────────────────────

    @staticmethod
    def _is_json_response(r: httpx.Response) -> bool:
        ct = r.headers.get("content-type", "")
        return "json" in ct or "javascript" in ct

    @staticmethod
    def _parse_json(r: httpx.Response) -> Any:
        """Parsea JSON de la respuesta; lanza ValueError descriptivo si el body no es JSON."""
        try:
            return r.json()
        except (_json.JSONDecodeError, Exception) as exc:
            raise ValueError(
                f"Supabase devolvió respuesta no-JSON "
                f"(status={r.status_code}, "
                f"content_type={r.headers.get('content-type', '?')!r}): "
                f"{r.text[:300]!r}"
            ) from exc

    async def _request_with_retry(self, method: str, path: str, **kwargs) -> httpx.Response:
        """Ejecuta una petición HTTP reintentando hasta _RETRY_ATTEMPTS veces si Supabase
        devuelve una respuesta no-JSON (error transitorio de CDN/infraestructura)."""
        last_exc: Exception | None = None
        for attempt in range(1, _RETRY_ATTEMPTS + 1):
            try:
                r: httpx.Response = await getattr(self._http, method)(path, **kwargs)
                # Si la respuesta es claramente HTML con status 2xx, reintentamos
                if r.is_success and not self._is_json_response(r) and r.content:
                    raise ValueError(
                        f"Supabase devolvió HTML en intento {attempt}/{_RETRY_ATTEMPTS} "
                        f"(status={r.status_code}): {r.text[:200]!r}"
                    )
                return r
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_exc = exc
                logger.warning(
                    "Supabase %s %s — error de red en intento %d/%d: %s",
                    method.upper(), path, attempt, _RETRY_ATTEMPTS, exc,
                )
            except ValueError as exc:
                last_exc = exc
                logger.warning(
                    "Supabase %s %s — respuesta no-JSON en intento %d/%d: %s",
                    method.upper(), path, attempt, _RETRY_ATTEMPTS, exc,
                )

            if attempt < _RETRY_ATTEMPTS:
                await asyncio.sleep(_RETRY_DELAY_S * attempt)

        raise last_exc  # type: ignore[misc]

    # ── CRUD ─────────────────────────────────────────────────

    async def query(
        self,
        table: str,
        select: str = "*",
        filters: dict[str, Any] | None = None,
        order: str | None = None,
        order_desc: bool = False,
        limit: int | None = None,
        single: bool = False,
        count: bool = False,
        raw_filters: dict[str, str] | None = None,
    ) -> dict | list[dict] | None:
        """Ejecuta un SELECT contra PostgREST.

        raw_filters allows PostgREST operators directly, e.g.
        {"status": "in.(buffer,procesando)", "timestamp": "lt.2024-01-01T00:00:00"}
        """
        params: dict[str, str] = {"select": select}
        if filters:
            for key, val in filters.items():
                if isinstance(val, bool):
                    params[key] = f"eq.{str(val).lower()}"
                else:
                    params[key] = f"eq.{val}"
        if raw_filters:
            for key, val in raw_filters.items():
                params[key] = val
        if order:
            params["order"] = f"{order}.{'desc' if order_desc else 'asc'}"
        if limit:
            params["limit"] = str(limit)

        headers: dict[str, str] = {}
        if single:
            headers["Accept"] = "application/vnd.pgrst.object+json"
        if count:
            headers["Prefer"] = "count=exact"

        r = await self._request_with_retry("get", f"/{table}", params=params, headers=headers)

        if r.status_code == 406 and single:
            return None
        r.raise_for_status()

        if count:
            content_range = r.headers.get("content-range", "")
            total = content_range.split("/")[1] if "/" in content_range else "0"
            return {"data": self._parse_json(r), "count": int(total) if total != "*" else 0}

        return self._parse_json(r)

    async def insert(self, table: str, data: dict[str, Any]) -> dict:
        """Inserta un registro."""
        r = await self._request_with_retry("post", f"/{table}", json=data)
        r.raise_for_status()
        result = self._parse_json(r)
        return result[0] if isinstance(result, list) and result else result

    async def update(self, table: str, filters: dict[str, Any], data: dict[str, Any]) -> list[dict]:
        """Actualiza registros que cumplan los filtros."""
        params = {k: f"eq.{v}" for k, v in filters.items()}
        r = await self._request_with_retry("patch", f"/{table}", params=params, json=data)
        r.raise_for_status()
        return self._parse_json(r)

    async def delete(self, table: str, filters: dict[str, Any]) -> list[dict]:
        """Elimina registros que cumplan los filtros."""
        params = {k: f"eq.{v}" for k, v in filters.items()}
        r = await self._request_with_retry("delete", f"/{table}", params=params)
        r.raise_for_status()
        return self._parse_json(r) if r.content else []

    async def rpc(self, function_name: str, params: dict[str, Any] | None = None) -> Any:
        """Llama a una función RPC de Supabase."""
        r = await self._request_with_retry("post", f"/rpc/{function_name}", json=params or {})
        r.raise_for_status()
        return self._parse_json(r)

    async def close(self):
        """Cierra el cliente HTTP."""
        await self._http.aclose()


async def get_supabase() -> SupabaseClient:
    """Retorna el cliente Supabase singleton."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = SupabaseClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client
