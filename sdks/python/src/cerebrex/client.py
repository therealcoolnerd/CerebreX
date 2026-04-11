"""CerebreX top-level async client."""

from __future__ import annotations

import httpx

from ._http import HttpClient
from ._types import HealthResponse
from .auth import get_api_key, get_kairos_url, get_memex_url, get_registry_url
from .kairos import KairosClient
from .memex import MemexClient
from .registry import RegistryClient
from .trace import TraceClient
from .ultraplan import UltraplanClient


class CerebreXClient:
    """Async client for the full CerebreX Agent Infrastructure OS.

    Exposes sub-clients for each module:
    - ``memex``      — three-layer persistent agent memory
    - ``registry``   — MCP package registry
    - ``kairos``     — autonomous daemon management + task queue
    - ``ultraplan``  — Opus-powered long-range planning
    - ``trace``      — agent observability

    All sub-clients share a single httpx.AsyncClient per worker so
    connections are pooled and keep-alive is reused.

    Args:
        api_key: CerebreX API key. Falls back to ``CEREBREX_API_KEY`` env var.
        memex_url: MEMEX worker base URL. Falls back to ``CEREBREX_MEMEX_URL``
            env var, then the production default.
        kairos_url: KAIROS worker base URL. Falls back to ``CEREBREX_KAIROS_URL``
            env var, then the production default.
        registry_url: Registry base URL. Falls back to ``CEREBREX_REGISTRY_URL``
            env var, then ``https://registry.therealcool.site``.
        trace_url: Trace server base URL. Defaults to ``http://localhost:7432``.
        timeout: Request timeout in seconds (default 30).

    Example:
        async with CerebreXClient(api_key="cx-...") as client:
            await client.memex.write_index("my-agent", "# Memory")
            pkg_list = await client.registry.search("web-search")
    """

    def __init__(
        self,
        api_key: str | None = None,
        memex_url: str | None = None,
        kairos_url: str | None = None,
        registry_url: str | None = None,
        trace_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        resolved_key = get_api_key(api_key)
        resolved_memex = get_memex_url(memex_url)
        resolved_kairos = get_kairos_url(kairos_url)
        resolved_registry = get_registry_url(registry_url)
        resolved_trace = (trace_url or "http://localhost:7432").rstrip("/")

        ua = "cerebrex-python/0.9.2"

        self._memex_http = HttpClient(
            resolved_memex, resolved_key, timeout,
            httpx.AsyncClient(base_url=resolved_memex, headers={"x-api-key": resolved_key, "User-Agent": ua}, timeout=timeout),
        )
        self._kairos_http = HttpClient(
            resolved_kairos, resolved_key, timeout,
            httpx.AsyncClient(base_url=resolved_kairos, headers={"x-api-key": resolved_key, "User-Agent": ua}, timeout=timeout),
        )
        self._registry_http = HttpClient(
            resolved_registry, resolved_key, timeout,
            httpx.AsyncClient(base_url=resolved_registry, headers={"User-Agent": ua}, timeout=timeout),
        )
        self._trace_http = HttpClient(
            resolved_trace, resolved_key, timeout,
            httpx.AsyncClient(base_url=resolved_trace, headers={"x-api-key": resolved_key, "User-Agent": ua}, timeout=timeout),
        )

        self.memex = MemexClient(self._memex_http)
        self.registry = RegistryClient(self._registry_http)
        self.kairos = KairosClient(self._kairos_http)
        self.ultraplan = UltraplanClient(self._kairos_http)  # same worker as KAIROS
        self.trace = TraceClient(self._trace_http)

    async def memex_health(self) -> HealthResponse:
        """Check the MEMEX worker health endpoint."""
        r = await self._memex_http.get("/health")
        return HealthResponse.model_validate(r.json())

    async def kairos_health(self) -> HealthResponse:
        """Check the KAIROS worker health endpoint."""
        r = await self._kairos_http.get("/health")
        return HealthResponse.model_validate(r.json())

    async def registry_health(self) -> HealthResponse:
        """Check the registry worker health endpoint."""
        r = await self._registry_http.get("/health")
        return HealthResponse.model_validate(r.json())

    async def close(self) -> None:
        """Close all underlying httpx clients and release connections."""
        await self._memex_http.close()
        await self._kairos_http.close()
        await self._registry_http.close()
        await self._trace_http.close()

    async def __aenter__(self) -> CerebreXClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()
