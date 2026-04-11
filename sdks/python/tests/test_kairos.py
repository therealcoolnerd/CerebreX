"""Tests for KairosClient."""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from cerebrex._http import HttpClient
from cerebrex.kairos import KairosClient

from .conftest import KAIROS_BASE


@pytest.fixture
def client(kairos_http: HttpClient) -> KairosClient:
    return KairosClient(kairos_http)


async def test_start_daemon(client: KairosClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{KAIROS_BASE}/v1/agents/agent-01/daemon/start",
        method="POST",
        json={"success": True, "message": "KAIROS daemon started", "agentId": "agent-01", "intervalMs": 300000},
    )
    resp = await client.start_daemon("agent-01")
    assert resp.success is True


async def test_stop_daemon(client: KairosClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{KAIROS_BASE}/v1/agents/agent-01/daemon/stop",
        method="POST",
        json={"success": True, "message": "KAIROS daemon stopped"},
    )
    resp = await client.stop_daemon("agent-01")
    assert resp.success is True


async def test_daemon_status_running(client: KairosClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{KAIROS_BASE}/v1/agents/agent-01/daemon/status",
        method="GET",
        json={"running": True, "agentId": "agent-01", "tickCount": 12, "lastTick": "2026-04-11T12:00:00Z"},
    )
    resp = await client.daemon_status("agent-01")
    assert resp.running is True
    assert resp.tick_count == 12


async def test_daemon_log(client: KairosClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{KAIROS_BASE}/v1/agents/agent-01/daemon/log?limit=1",
        method="GET",
        json={
            "agentId": "agent-01",
            "log": [
                {
                    "agent_id": "agent-01",
                    "tick_at": "2026-04-11T12:00:00Z",
                    "decided": 1,
                    "reasoning": "pending tasks found",
                    "action": "process queue",
                    "result": "Queued task abc",
                    "latency_ms": 350,
                }
            ],
        },
    )
    entries = await client.daemon_log("agent-01", limit=1)
    assert len(entries) == 1
    assert entries[0].decided == 1


async def test_submit_task(client: KairosClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{KAIROS_BASE}/v1/agents/agent-01/tasks",
        method="POST",
        json={"success": True, "taskId": "t-abc123", "agentId": "agent-01", "type": "echo", "status": "queued"},
    )
    resp = await client.submit_task("agent-01", "echo", payload={"hello": "world"})
    assert resp.task_id == "t-abc123"
    assert resp.status == "queued"


async def test_list_tasks(client: KairosClient, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=f"{KAIROS_BASE}/v1/agents/agent-01/tasks?limit=50",
        method="GET",
        json={
            "agentId": "agent-01",
            "tasks": [
                {"id": "t-1", "type": "echo", "status": "queued", "priority": 5},
                {"id": "t-2", "type": "noop", "status": "completed", "priority": 3},
            ],
        },
    )
    tasks = await client.list_tasks("agent-01")
    assert len(tasks) == 2
    assert tasks[0]["id"] == "t-1"
