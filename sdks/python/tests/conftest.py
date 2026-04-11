"""Shared pytest fixtures for the CerebreX Python SDK test suite."""

from __future__ import annotations

import httpx
import pytest
from pytest_httpx import HTTPXMock

from cerebrex._http import HttpClient


FAKE_API_KEY = "cx-test-key-abc123"
MEMEX_BASE   = "https://memex.test.cerebrex.dev"
KAIROS_BASE  = "https://kairos.test.cerebrex.dev"
REGISTRY_BASE = "https://registry.test.cerebrex.dev"
TRACE_BASE   = "http://localhost:7432"


@pytest.fixture
def memex_http(httpx_mock: HTTPXMock) -> HttpClient:
    """HttpClient pointed at the fake MEMEX base URL."""
    client = httpx.AsyncClient(base_url=MEMEX_BASE, headers={"x-api-key": FAKE_API_KEY})
    return HttpClient(MEMEX_BASE, FAKE_API_KEY, client=client)


@pytest.fixture
def kairos_http(httpx_mock: HTTPXMock) -> HttpClient:
    """HttpClient pointed at the fake KAIROS base URL."""
    client = httpx.AsyncClient(base_url=KAIROS_BASE, headers={"x-api-key": FAKE_API_KEY})
    return HttpClient(KAIROS_BASE, FAKE_API_KEY, client=client)


@pytest.fixture
def registry_http(httpx_mock: HTTPXMock) -> HttpClient:
    """HttpClient pointed at the fake Registry base URL."""
    client = httpx.AsyncClient(base_url=REGISTRY_BASE, headers={"User-Agent": "test"})
    return HttpClient(REGISTRY_BASE, FAKE_API_KEY, client=client)


@pytest.fixture
def trace_http(httpx_mock: HTTPXMock) -> HttpClient:
    """HttpClient pointed at the fake Trace base URL."""
    client = httpx.AsyncClient(base_url=TRACE_BASE, headers={"x-api-key": FAKE_API_KEY})
    return HttpClient(TRACE_BASE, FAKE_API_KEY, client=client)
