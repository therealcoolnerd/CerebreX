"""Tests for RegistryClient."""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from cerebrex._http import HttpClient
from cerebrex.registry import RegistryClient
from .conftest import REGISTRY_BASE


@pytest.fixture
def client(registry_http: HttpClient) -> RegistryClient:
    return RegistryClient(registry_http)


async def test_list_packages(client: RegistryClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{REGISTRY_BASE}/v1/packages?limit=20&offset=0",
        method="GET",
        json={
            "packages": [
                {"name": "mcp-web-search", "version": "1.0.0", "description": "Web search MCP", "createdAt": "2026-01-01T00:00:00Z"},
                {"name": "mcp-code-runner", "version": "2.1.0", "description": "Code runner MCP", "createdAt": "2026-01-02T00:00:00Z"},
            ],
            "total": 2,
        },
    )
    resp = await client.list()
    assert len(resp.packages) == 2
    assert resp.packages[0].name == "mcp-web-search"


async def test_search_packages(client: RegistryClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{REGISTRY_BASE}/v1/packages?limit=20&offset=0&q=web-search",
        method="GET",
        json={
            "packages": [{"name": "mcp-web-search", "version": "1.0.0", "description": "Web search", "createdAt": ""}],
            "total": 1,
        },
    )
    resp = await client.search("web-search")
    assert resp.query == "web-search"
    assert resp.packages[0].name == "mcp-web-search"


async def test_get_package_versions(client: RegistryClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{REGISTRY_BASE}/v1/packages/mcp-web-search",
        method="GET",
        json={
            "versions": [
                {"name": "mcp-web-search", "version": "1.0.0", "description": "v1", "createdAt": ""},
                {"name": "mcp-web-search", "version": "1.1.0", "description": "v1.1", "createdAt": ""},
            ]
        },
    )
    versions = await client.get("mcp-web-search")
    assert len(versions) == 2
    assert versions[1].version == "1.1.0"


async def test_get_specific_version(client: RegistryClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{REGISTRY_BASE}/v1/packages/mcp-web-search/1.0.0",
        method="GET",
        json={"name": "mcp-web-search", "version": "1.0.0", "description": "Web search", "createdAt": ""},
    )
    pkg = await client.get_version("mcp-web-search", "1.0.0")
    assert pkg.version == "1.0.0"


async def test_download_url(client: RegistryClient, httpx_mock: HTTPXMock) -> None:
    url = await client.download_url("mcp-web-search", "1.0.0")
    assert "mcp-web-search" in url
    assert "1.0.0" in url
    assert "download" in url


async def test_delete_package(client: RegistryClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{REGISTRY_BASE}/v1/packages/mcp-web-search/1.0.0",
        method="DELETE",
        json={"success": True},
    )
    resp = await client.delete("mcp-web-search", "1.0.0")
    assert resp.success is True
