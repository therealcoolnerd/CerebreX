"""
CerebreX + CrewAI Integration

CerebreXTracer: wraps CrewAI agent callbacks to record every tool call
and LLM response into the CerebreX TRACE server for observability.

Install extras:
    pip install cerebrex[crewai]

Usage:
    from examples.crewai_integration import CerebreXTracer
    tracer = CerebreXTracer(agent_id="research-crew", api_key="cx-...")
    crew = Crew(agents=[...], tasks=[...], callbacks=[tracer.as_callback()])
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from cerebrex import CerebreXClient

try:
    import crewai  # noqa: F401
    _CREWAI_AVAILABLE = True
except ImportError:
    _CREWAI_AVAILABLE = False


class CerebreXTracer:
    """Records CrewAI agent execution steps into CerebreX TRACE.

    Each tool call, LLM inference, and task completion is recorded as a
    trace step under a session keyed to the crew run.

    Args:
        agent_id: Identifier used to namespace trace sessions.
        api_key: CerebreX API key.
        trace_url: TRACE server base URL (default http://localhost:7432).

    Example:
        tracer = CerebreXTracer(agent_id="my-crew", api_key="cx-...")
        crew = Crew(agents=[agent], tasks=[task])
        tracer.start_session()
        result = crew.kickoff()
        tracer.end_session()
    """

    def __init__(
        self,
        agent_id: str,
        api_key: str = "",
        trace_url: str = "http://localhost:7432",
    ) -> None:
        self.agent_id = agent_id
        self.api_key = api_key
        self.trace_url = trace_url
        self._session_id: str = ""
        self._step_times: dict[str, float] = {}

    def _get_client(self) -> CerebreXClient:
        return CerebreXClient(api_key=self.api_key or None, trace_url=self.trace_url)

    def start_session(self) -> str:
        """Create a new trace session. Call before crew.kickoff()."""
        async def _start() -> str:
            async with self._get_client() as c:
                return await c.trace.create_session(self.agent_id)

        self._session_id = asyncio.run(_start())
        print(f"[CerebreXTracer] Session started: {self._session_id}")
        return self._session_id

    def end_session(self) -> None:
        """Mark the session complete (no-op — TRACE is append-only)."""
        print(f"[CerebreXTracer] Session complete: {self._session_id}")

    def record_tool_call(self, tool_name: str, input: Any, output: Any) -> None:  # noqa: A002
        """Record a single tool invocation."""
        if not self._session_id:
            return

        async def _record() -> None:
            async with self._get_client() as c:
                await c.trace.record_step(
                    self._session_id,
                    step_type="tool_call",
                    input={"tool": tool_name, "input": input},
                    output=output,
                    duration_ms=0,
                )

        asyncio.run(_record())

    def record_llm(self, prompt: str, response: str, duration_ms: int = 0) -> None:
        """Record an LLM inference step."""
        if not self._session_id:
            return

        async def _record() -> None:
            async with self._get_client() as c:
                await c.trace.record_step(
                    self._session_id,
                    step_type="llm_call",
                    input={"prompt_preview": prompt[:200]},
                    output={"response_preview": response[:200]},
                    duration_ms=duration_ms,
                )

        asyncio.run(_record())

    def as_callback(self) -> dict[str, Any]:
        """Return a CrewAI-compatible callbacks dict.

        Wire into Crew(..., callbacks=[tracer.as_callback()]).
        Requires crewai>=0.28.0 callback support.
        """
        tracer = self

        class _Callbacks:
            def on_tool_start(self, tool: Any, input_str: str) -> None:  # noqa: ANN401
                tool_name = getattr(tool, "name", str(tool))
                tracer._step_times[tool_name] = time.time()
                tracer.record_tool_call(tool_name, input_str, None)

            def on_tool_end(self, output: str, tool: Any) -> None:  # noqa: ANN401
                tool_name = getattr(tool, "name", str(tool))
                elapsed = int((time.time() - tracer._step_times.pop(tool_name, time.time())) * 1000)
                tracer.record_tool_call(tool_name, None, output)
                _ = elapsed  # already captured in on_tool_start

            def on_agent_finish(self, output: Any) -> None:  # noqa: ANN401
                tracer.record_llm("(crew task)", str(output))

        return {"callbacks": _Callbacks()}


# ── Demo usage (run directly) ─────────────────────────────────────────────────

if __name__ == "__main__":
    if not _CREWAI_AVAILABLE:
        print("crewai not installed. Run: pip install cerebrex[crewai]")
    else:
        print("CerebreXTracer ready. Wire into your Crew:")
        print("""
    from crewai import Agent, Task, Crew
    from examples.crewai_integration import CerebreXTracer

    tracer = CerebreXTracer(agent_id="my-crew", api_key="cx-...")
    tracer.start_session()

    researcher = Agent(role="Researcher", goal="Find information", backstory="Expert researcher")
    task = Task(description="Research CerebreX features", agent=researcher)
    crew = Crew(agents=[researcher], tasks=[task])
    result = crew.kickoff()

    tracer.end_session()
    print("Trace session:", tracer._session_id)
        """)
