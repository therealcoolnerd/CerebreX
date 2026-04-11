"""Tests for MemexClient."""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from cerebrex._http import HttpClient
from cerebrex.exceptions import AuthenticationError, NotFoundError
from cerebrex.memex import MemexClient
from .conftest import FAKE_API_KEY, MEMEX_BASE


@pytest.fixture
def client(memex_http: HttpClient) -> MemexClient:
    return MemexClient(memex_http)


# ── read_index ────────────────────────────────────────────────────────────────


async def test_read_index_success(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/index",
        method="GET",
        json={"agentId": "agent-01", "index": "# Memory\n- fact 1", "exists": True},
    )
    resp = await client.read_index("agent-01")
    assert resp.agent_id == "agent-01"
    assert resp.index == "# Memory\n- fact 1"
    assert resp.exists is True


async def test_read_index_empty(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/new-agent/memory/index",
        method="GET",
        json={"agentId": "new-agent", "index": "", "exists": False},
    )
    resp = await client.read_index("new-agent")
    assert resp.index == ""
    assert resp.exists is False


async def test_read_index_unauthorized(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/index",
        method="GET",
        status_code=401,
        json={"success": False, "error": "Unauthorized"},
    )
    with pytest.raises(AuthenticationError):
        await client.read_index("agent-01")


# ── write_index ───────────────────────────────────────────────────────────────


async def test_write_index_success(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/index",
        method="POST",
        json={"success": True, "agentId": "agent-01", "lines": 3},
    )
    resp = await client.write_index("agent-01", "# Memory\n- a\n- b")
    assert resp.success is True
    assert resp.lines == 3


async def test_write_index_too_large(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/index",
        method="POST",
        status_code=413,
        json={"success": False, "error": "content exceeds 25600 byte limit"},
    )
    from cerebrex.exceptions import PayloadTooLargeError
    with pytest.raises(PayloadTooLargeError):
        await client.write_index("agent-01", "x" * 30000)


# ── list_topics ───────────────────────────────────────────────────────────────


async def test_list_topics(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/topics",
        method="GET",
        json={"agentId": "agent-01", "topics": ["context", "tools"]},
    )
    resp = await client.list_topics("agent-01")
    assert resp.topics == ["context", "tools"]


# ── read_topic ────────────────────────────────────────────────────────────────


async def test_read_topic_success(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/topics/context",
        method="GET",
        json={"agentId": "agent-01", "topic": "context", "content": "# Context\n- item"},
    )
    resp = await client.read_topic("agent-01", "context")
    assert resp.topic == "context"
    assert "Context" in resp.content


async def test_read_topic_not_found(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/topics/missing",
        method="GET",
        status_code=404,
        json={"success": False, "error": "Topic not found"},
    )
    with pytest.raises(NotFoundError):
        await client.read_topic("agent-01", "missing")


# ── append_transcript ─────────────────────────────────────────────────────────


async def test_append_transcript(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/transcripts",
        method="POST",
        json={"success": True, "agentId": "agent-01", "sessionId": "sess-42"},
    )
    resp = await client.append_transcript("agent-01", "user: hello", session_id="sess-42")
    assert resp.success is True
    assert resp.session_id == "sess-42"


# ── assemble_context ──────────────────────────────────────────────────────────


async def test_assemble_context(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory/context",
        method="POST",
        json={
            "agentId": "agent-01",
            "systemPrompt": "## Agent Memory\n\n- fact 1",
            "layers": {"index": 12, "topics": 1, "transcripts": 5},
        },
    )
    resp = await client.assemble_context("agent-01", topics=["context"])
    assert "Agent Memory" in resp.system_prompt
    assert resp.layers["topics"] == 1


# ── status ────────────────────────────────────────────────────────────────────


async def test_status(client: MemexClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{MEMEX_BASE}/v1/agents/agent-01/memory",
        method="GET",
        json={
            "agentId": "agent-01",
            "exists": True,
            "session_count": 7,
            "index_lines": 15,
            "topic_count": 3,
        },
    )
    resp = await client.status("agent-01")
    assert resp.exists is True
    assert resp.session_count == 7
    assert resp.topic_count == 3
