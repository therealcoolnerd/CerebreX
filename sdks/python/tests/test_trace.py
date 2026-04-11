"""Tests for TraceClient."""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from cerebrex._http import HttpClient
from cerebrex.trace import TraceClient

from .conftest import TRACE_BASE


@pytest.fixture
def client(trace_http: HttpClient) -> TraceClient:
    return TraceClient(trace_http)


async def test_health(client: TraceClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{TRACE_BASE}/health",
        method="GET",
        json={"status": "ok", "service": "cerebrex-trace"},
    )
    resp = await client.health()
    assert resp["status"] == "ok"


async def test_create_session(client: TraceClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{TRACE_BASE}/sessions",
        method="POST",
        json={"sessionId": "sess-xyz", "agentId": "agent-01"},
    )
    session_id = await client.create_session("agent-01")
    assert session_id == "sess-xyz"


async def test_record_step(client: TraceClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{TRACE_BASE}/steps",
        method="POST",
        json={"success": True},
    )
    resp = await client.record_step(
        "sess-xyz", "tool_call",
        input={"tool": "search"}, output={"results": []}, duration_ms=42,
    )
    assert resp.success is True


async def test_get_session(client: TraceClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{TRACE_BASE}/sessions/sess-xyz",
        method="GET",
        json={"sessionId": "sess-xyz", "agentId": "agent-01", "steps": []},
    )
    session = await client.get_session("sess-xyz")
    assert session["sessionId"] == "sess-xyz"


async def test_list_sessions(client: TraceClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{TRACE_BASE}/sessions?agentId=agent-01",
        method="GET",
        json={"sessions": [{"sessionId": "sess-1"}, {"sessionId": "sess-2"}]},
    )
    sessions = await client.list_sessions("agent-01")
    assert len(sessions) == 2


async def test_auth_header(client: TraceClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{TRACE_BASE}/health",
        method="GET",
        json={"status": "ok", "service": "cerebrex-trace"},
    )
    await client.health()
    requests = httpx_mock.get_requests()
    assert any("x-api-key" in r.headers for r in requests)
