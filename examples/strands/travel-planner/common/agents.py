"""Helpers shared by the Strands travel planner agents: MCP tool calls, faults, agent runs."""

import json
import logging
import os
import random
import time
import uuid
from collections.abc import Callable
from typing import Optional

import httpx
from opentelemetry import trace
from pydantic import BaseModel, Field
from strands import Agent
from strands.models import Model

from .models import ScriptedModel, bedrock_model, use_bedrock

logger = logging.getLogger(__name__)

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://mcp-server:8003")
MCP_PROTOCOL_VERSION = "2025-06-18"


class SubAgentFault(BaseModel):
    """Same fault shape as the plain-agents example, so the canary and fault panel drive both."""

    type: str = Field(..., description="timeout, error, rate_limited, high_latency, wrong_city, empty")
    delay_ms: int = 0
    probability: float = 1.0
    wrong_city: Optional[str] = None


class FaultError(Exception):
    """A fault injected into a tool. `status` is the HTTP status the agent responds with."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


def apply_fault(fault: Optional[SubAgentFault]) -> Optional[str]:
    """Apply latency and error faults inside a tool, so its execute_tool span records them.

    Raises FaultError for error faults. Returns the fault type for data faults
    (wrong_city, empty) for the caller to handle, or None when no fault fires.
    """
    if not fault or random.random() > fault.probability:
        return None
    logger.warning("Fault injected: %s", fault.type, extra={"fault.type": fault.type})
    span = trace.get_current_span()
    span.set_attribute("fault.type", fault.type)
    if fault.type == "high_latency":
        delay = fault.delay_ms or 3000
        span.set_attribute("fault.delay_ms", delay)
        time.sleep(delay / 1000)
        return None
    if fault.type == "timeout":
        raise FaultError("Upstream API timed out after 30000ms", status=504)
    if fault.type == "error":
        raise FaultError("Upstream API returned 503 Service Unavailable", status=503)
    if fault.type == "rate_limited":
        raise FaultError("Upstream API rate limit exceeded (429)", status=429)
    return fault.type


def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """Call a tool on the stack's MCP server (JSON-RPC over HTTP; httpx propagates the trace)."""
    logger.info("Calling MCP tool %s", tool_name, extra={"gen_ai.tool.name": tool_name})
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "id": uuid.uuid4().hex[:8],
        "params": {"name": tool_name, "arguments": arguments},
    }
    headers = {"mcp-session-id": uuid.uuid4().hex, "mcp-protocol-version": MCP_PROTOCOL_VERSION}
    resp = httpx.post(f"{MCP_SERVER_URL}/mcp", json=payload, headers=headers, timeout=30)
    data = resp.json()
    if "error" in data:
        message = data["error"].get("message", f"MCP tool {tool_name} failed")
        logger.error("MCP tool %s failed: %s", tool_name, message, extra={"gen_ai.tool.name": tool_name})
        raise RuntimeError(message)
    return data.get("result", {})


def to_text(value) -> str:
    return value if isinstance(value, str) else json.dumps(value, default=str)


async def run_agent(
    make_agent: Callable[[Model], Agent], prompt: str, scripted: ScriptedModel
) -> tuple[str, Agent]:
    """Run an agent on Bedrock when enabled, otherwise (or if Bedrock fails) on the scripted model.

    Returns the answer and the agent, whose `messages` hold the conversation so far.
    """
    if use_bedrock():
        logger.info("Running the agent on Bedrock")
        agent = make_agent(bedrock_model())
        try:
            return str(await agent.invoke_async(prompt)), agent
        except Exception as e:  # noqa: BLE001 - fall back so demos keep producing traces
            logger.warning("Bedrock call failed, falling back to the scripted model: %s", e)
            trace.get_current_span().set_attribute("gen_ai.bedrock.fallback.reason", str(e)[:200])
    logger.info("Running the agent on the scripted model")
    agent = make_agent(scripted)
    answer = str(await agent.invoke_async(prompt))
    logger.info("Agent answered (%d characters)", len(answer))
    return answer, agent
