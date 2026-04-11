"""Low-level httpx transport layer for the CerebreX SDK."""

from __future__ import annotations

from typing import Any

import httpx

from .exceptions import (
    AuthenticationError,
    NotFoundError,
    PayloadTooLargeError,
    RateLimitError,
    ServerError,
    ValidationError,
)


def _raise_for_status(response: httpx.Response) -> None:
    """Map HTTP error codes to typed CerebreX exceptions."""
    if response.is_success:
        return
    try:
        body: dict[str, Any] = response.json()
        message: str = body.get("error", response.text)
    except Exception:
        message = response.text or f"HTTP {response.status_code}"

    code = response.status_code
    if code == 400:
        raise ValidationError(message)
    if code == 401:
        raise AuthenticationError(message)
    if code == 404:
        raise NotFoundError(message)
    if code == 413:
        raise PayloadTooLargeError(message)
    if code == 429:
        raise RateLimitError(message)
    if code >= 500:
        raise ServerError(message, code)
    raise CerebreXHttpError(message, code)


class CerebreXHttpError(Exception):
    """Catch-all for unexpected HTTP status codes."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class HttpClient:
    """Thin async wrapper around httpx.AsyncClient.

    All requests include the x-api-key header and raise typed exceptions
    for non-2xx responses.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._client = client or httpx.AsyncClient(
            base_url=self._base_url,
            headers={"x-api-key": api_key, "User-Agent": "cerebrex-python/0.9.2"},
            timeout=timeout,
        )
        self._owned = client is None

    async def get(self, path: str, **kwargs: Any) -> httpx.Response:
        """Send a GET request and raise on non-2xx."""
        response = await self._client.get(path, **kwargs)
        _raise_for_status(response)
        return response

    async def post(self, path: str, **kwargs: Any) -> httpx.Response:
        """Send a POST request and raise on non-2xx."""
        response = await self._client.post(path, **kwargs)
        _raise_for_status(response)
        return response

    async def put(self, path: str, **kwargs: Any) -> httpx.Response:
        """Send a PUT request and raise on non-2xx."""
        response = await self._client.put(path, **kwargs)
        _raise_for_status(response)
        return response

    async def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        """Send a DELETE request and raise on non-2xx."""
        response = await self._client.delete(path, **kwargs)
        _raise_for_status(response)
        return response

    async def patch(self, path: str, **kwargs: Any) -> httpx.Response:
        """Send a PATCH request and raise on non-2xx."""
        response = await self._client.patch(path, **kwargs)
        _raise_for_status(response)
        return response

    async def close(self) -> None:
        """Close the underlying httpx client if we own it."""
        if self._owned:
            await self._client.aclose()

    async def __aenter__(self) -> HttpClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()
