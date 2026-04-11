"""
CerebreX + LangChain Integration

CerebreXMemory: a LangChain BaseMemory subclass that stores conversation
history in MEMEX (KV index + D1 transcripts) instead of in-process RAM.

Install extras:
    pip install cerebrex[langchain]

Usage:
    from examples.langchain_integration import CerebreXMemory
    memory = CerebreXMemory(agent_id="my-agent", api_key="cx-...")
    chain = ConversationChain(llm=llm, memory=memory)
"""

from __future__ import annotations

import asyncio
from typing import Any

from cerebrex import CerebreXClient

try:
    from langchain_core.memory import BaseMemory
    from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
    from pydantic import Field as LCField
    _LANGCHAIN_AVAILABLE = True
except ImportError:
    _LANGCHAIN_AVAILABLE = False
    # Stub for environments without langchain installed
    class BaseMemory:  # type: ignore[no-redef]
        pass


class CerebreXMemory(BaseMemory):  # type: ignore[misc]
    """LangChain BaseMemory backed by CerebreX MEMEX.

    Stores the conversation buffer in the agent's KV index and appends
    full sessions to D1 transcripts for long-term recall.

    Args:
        agent_id: Agent identifier used as the MEMEX namespace.
        api_key: CerebreX API key. Falls back to CEREBREX_API_KEY env var.
        memex_url: MEMEX worker URL override.
        memory_key: Key name injected into the chain input dict (default "history").
        max_token_limit: Approximate token budget for the buffer (default 2000).

    Example:
        memory = CerebreXMemory(agent_id="research-agent", api_key="cx-...")
        chain = ConversationChain(llm=llm, memory=memory)
        chain.predict(input="What is CerebreX?")
    """

    agent_id: str
    api_key: str = ""
    memex_url: str = ""
    memory_key: str = "history"
    max_token_limit: int = 2000
    _buffer: list[BaseMessage] = []  # type: ignore[assignment]

    if _LANGCHAIN_AVAILABLE:
        agent_id: str = LCField(...)  # type: ignore[no-redef,assignment]
        api_key: str = LCField(default="")
        memex_url: str = LCField(default="")
        memory_key: str = LCField(default="history")
        max_token_limit: int = LCField(default=2000)

    @property
    def memory_variables(self) -> list[str]:
        return [self.memory_key]

    def _get_client(self) -> CerebreXClient:
        return CerebreXClient(
            api_key=self.api_key or None,
            memex_url=self.memex_url or None,
        )

    def load_memory_variables(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Load the current memory index as the conversation history string."""
        async def _load() -> str:
            async with self._get_client() as c:
                resp = await c.memex.read_index(self.agent_id)
                return resp.index

        index = asyncio.run(_load())
        return {self.memory_key: index}

    def save_context(self, inputs: dict[str, Any], outputs: dict[str, Any]) -> None:
        """Append the latest exchange to the buffer and persist to MEMEX."""
        human_input = str(inputs.get("input", ""))
        ai_output = str(outputs.get("response", outputs.get("output", "")))

        if _LANGCHAIN_AVAILABLE:
            self._buffer.append(HumanMessage(content=human_input))
            self._buffer.append(AIMessage(content=ai_output))

        # Build updated index from buffer (pruned to max_token_limit)
        lines = []
        for msg in self._buffer[-40:]:  # keep last 40 messages
            if _LANGCHAIN_AVAILABLE:
                role = "human" if isinstance(msg, HumanMessage) else "ai"
                lines.append(f"[{role}] {msg.content}")
            else:
                lines.append(str(msg))

        new_index = "\n".join(lines)[-25_000:]  # hard cap at 25KB

        async def _save() -> None:
            async with self._get_client() as c:
                await c.memex.write_index(self.agent_id, new_index)
                # Also append to D1 transcript
                transcript = f"human: {human_input}\nai: {ai_output}"
                await c.memex.append_transcript(self.agent_id, transcript)

        asyncio.run(_save())

    def clear(self) -> None:
        """Clear in-memory buffer and delete the MEMEX index."""
        self._buffer = []

        async def _clear() -> None:
            async with self._get_client() as c:
                await c.memex.delete_index(self.agent_id)

        asyncio.run(_clear())


# ── Demo usage (run directly) ─────────────────────────────────────────────────

if __name__ == "__main__":
    if not _LANGCHAIN_AVAILABLE:
        print("langchain not installed. Run: pip install cerebrex[langchain]")
    else:
        print("CerebreXMemory ready. Wire into ConversationChain:")
        print("""
    from langchain.chains import ConversationChain
    from langchain_anthropic import ChatAnthropic

    memory = CerebreXMemory(agent_id="my-agent", api_key="cx-your-key")  # or use CEREBREX_API_KEY env var
    llm = ChatAnthropic(model="claude-sonnet-4-6")
    chain = ConversationChain(llm=llm, memory=memory, verbose=True)
    print(chain.predict(input="Hello, what can you do?"))
        """)
