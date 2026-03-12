#!/usr/bin/env python3
"""
Events Agent — instrumented with opensearch-genai-observability-sdk-py.

SDK-instrumented version of plain-agents/multi-agent-planner/events-agent/main.py.

Requires: pip install opensearch-genai-observability-sdk-py fastapi uvicorn httpx
"""

import json
import os
import random
import time
from datetime import datetime
from typing import Optional
from uuid import uuid4

import httpx
from fastapi import FastAPI
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.propagate import inject
from opentelemetry.trace import SpanKind
from pydantic import BaseModel, Field

from opensearch_genai_observability_sdk_py import Op, enrich, observe, register

# --- SDK setup ---
register(
    endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces"),
    service_name="events-agent",
)

AGENT_ID = "events-agent-001"
AGENT_NAME = "Events Agent"
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://mcp-server:8003")
MCP_PROTOCOL_VERSION = "2025-06-18"

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_events_api",
            "description": "Fetch local events from the events database for a destination",
            "parameters": {"type": "object", "properties": {"destination": {"type": "string"}, "date": {"type": "string"}}, "required": ["destination"]},
        },
    },
]

MODELS = [
    "claude-opus-4.5", "claude-sonnet-4.5", "claude-haiku-4.5", "claude-sonnet-4", "claude-haiku",
    "gpt-5", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini",
    "gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash",
    "nova-2-pro", "nova-2-lite", "nova-premier", "nova-pro", "nova-lite",
]
SYSTEMS = {
    "claude-opus-4.5": "anthropic", "claude-sonnet-4.5": "anthropic", "claude-haiku-4.5": "anthropic",
    "claude-sonnet-4": "anthropic", "claude-haiku": "anthropic",
    "gpt-5": "openai", "gpt-4.1": "openai", "gpt-4.1-mini": "openai",
    "gpt-4o": "openai", "gpt-4o-mini": "openai", "o4-mini": "openai",
    "gemini-3-flash": "google", "gemini-2.5-pro": "google", "gemini-2.5-flash": "google",
    "nova-2-pro": "amazon", "nova-2-lite": "amazon", "nova-premier": "amazon",
    "nova-pro": "amazon", "nova-lite": "amazon",
}

SAMPLE_EVENTS = {
    "paris": [
        {"name": "Louvre Late Night", "type": "museum", "venue": "Louvre Museum"},
        {"name": "Seine River Cruise", "type": "tour", "venue": "Port de la Bourdonnais"},
        {"name": "Jazz at Le Caveau", "type": "music", "venue": "Le Caveau de la Huchette"},
    ],
    "london": [
        {"name": "West End Show", "type": "theater", "venue": "Various"},
        {"name": "Borough Market Food Tour", "type": "food", "venue": "Borough Market"},
        {"name": "British Museum Exhibition", "type": "museum", "venue": "British Museum"},
    ],
    "tokyo": [
        {"name": "Shibuya Night Walk", "type": "tour", "venue": "Shibuya"},
        {"name": "Tsukiji Outer Market", "type": "food", "venue": "Tsukiji"},
        {"name": "Robot Restaurant Show", "type": "entertainment", "venue": "Shinjuku"},
    ],
}


class FaultConfig(BaseModel):
    type: str = Field(...)
    delay_ms: int = Field(0)
    probability: float = Field(1.0)
    wrong_city: Optional[str] = Field(None)


class EventsRequest(BaseModel):
    destination: str
    date: Optional[str] = None
    fault: Optional[FaultConfig] = None


class Event(BaseModel):
    name: str
    type: str
    venue: str
    date: str


class EventsResponse(BaseModel):
    destination: str
    events: list[Event]
    agent_id: str


class ErrorResponse(BaseModel):
    error: dict
    destination: str
    agent_id: str


inner_app = FastAPI(title="Events Agent", version="1.0.0")


def should_inject_fault(fault: Optional[FaultConfig]) -> bool:
    if not fault:
        return False
    return random.random() < fault.probability


@inner_app.get("/health")
async def health():
    return {"status": "healthy", "agent_id": AGENT_ID, "agent_name": AGENT_NAME}


@inner_app.post("/events")
async def get_events(request: EventsRequest):
    model = random.choice(MODELS)
    provider = SYSTEMS[model]

    # Enrich root HTTP span
    enrich(
        provider=provider,
        model=model,
        agent_id=AGENT_ID,
        input_messages=[{"role": "user", "parts": [{"type": "text", "content": f"Find events in {request.destination}"}]}],
    )

    with observe("events-agent", op=Op.INVOKE_AGENT):
        enrich(
            provider=provider,
            model=model,
            agent_id=AGENT_ID,
            tool_definitions=TOOL_DEFINITIONS,
        )

        destination = request.destination.lower()
        date = request.date or datetime.now().strftime("%Y-%m-%d")
        fault = request.fault

        # Synthetic "thinking" LLM call
        with observe("reasoning", op=Op.CHAT):
            enrich(
                provider=provider,
                model=model,
                input_tokens=random.randint(100, 500),
                output_tokens=random.randint(50, 200),
                finish_reason="tool_calls",
            )
            time.sleep(random.uniform(0.05, 0.15))

        # Fault injection
        if should_inject_fault(fault):
            if fault.type == "error":
                return ErrorResponse(error={"type": "tool_error", "message": "Events API returned an error"}, destination=request.destination, agent_id=AGENT_ID)
            elif fault.type == "rate_limited":
                return ErrorResponse(error={"type": "rate_limited", "message": "Events API rate limit exceeded"}, destination=request.destination, agent_id=AGENT_ID)
            elif fault.type == "empty":
                return EventsResponse(destination=request.destination, events=[], agent_id=AGENT_ID)

        # MCP tool call
        session_id = uuid4().hex
        request_id = uuid4().hex[:8]
        with observe("fetch_events_api", op=Op.EXECUTE_TOOL, kind=SpanKind.CLIENT):
            enrich(**{
                "mcp.method.name": "tools/call",
                "mcp.session.id": session_id,
                "mcp.protocol.version": MCP_PROTOCOL_VERSION,
            })
            headers = {"mcp-session-id": session_id}
            inject(headers)
            payload = {
                "jsonrpc": "2.0", "method": "tools/call", "id": request_id,
                "params": {"name": "fetch_events_api", "arguments": {"destination": destination}},
            }
            resp = httpx.post(f"{MCP_SERVER_URL}/mcp", json=payload, headers=headers, timeout=30)
            mcp_result = resp.json().get("result", {})
            events_list = mcp_result.get("events", [])
            events = [Event(name=e["name"], type=e["type"], venue=e.get("venue", "TBD"), date=e.get("date", date)) for e in events_list]

        enrich(
            output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": json.dumps([e.model_dump() for e in events])}]}],
        )

        return EventsResponse(destination=request.destination, events=events, agent_id=AGENT_ID)


app = OpenTelemetryMiddleware(inner_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
