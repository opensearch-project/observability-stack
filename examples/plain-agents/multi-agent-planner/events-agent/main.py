#!/usr/bin/env python3
"""
Events Agent - Fetches attractions and points of interest for a destination.
Uses Wikipedia via MCP server for real data. Supports fault injection for testing observability.

Instrumented with opensearch-genai-observability-sdk-py:
- register() sets up the OTLP traces and logs pipelines in one call
- observe() + enrich() replace manual span creation + set_attribute() calls
- mark_agent_root() marks the agent span when the agent is called directly (no caller trace)
- Python logging goes through the SDK's logger provider, with trace and span ids on every record
"""

import json
import logging
import os
import random
import threading
import time
from datetime import datetime
from typing import Optional
from uuid import uuid4

import httpx
import requests as req_lib
from fastapi import FastAPI
from opentelemetry import trace, metrics
from opentelemetry._logs import get_logger_provider
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk._logs import LoggingHandler
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.propagate import inject
from pydantic import BaseModel, Field

from opensearch_genai_observability_sdk_py import Op, enrich, mark_agent_root, observe, register
from bedrock_client import (
    get_bedrock_client, converse, extract_text, get_usage,
    BedrockUnavailableError, BEDROCK_MODEL_ID,
)


# MCP Server configuration
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://mcp-server:8003")
MCP_PROTOCOL_VERSION = "2025-06-18"
FAULT_PANEL_URL = os.getenv("FAULT_PANEL_URL", "http://fault-panel:8085")

_config_cache = {"use_real_llm": False}


def _poll_config():
    while True:
        try:
            resp = req_lib.get(f"{FAULT_PANEL_URL}/config", timeout=2)
            if resp.status_code == 200:
                _config_cache["use_real_llm"] = resp.json().get("use_real_llm", False)
        except Exception:
            pass
        time.sleep(30)


threading.Thread(target=_poll_config, daemon=True).start()

_bedrock_client = get_bedrock_client()


AGENT_ID = "events-agent-001"
AGENT_NAME = "Events Agent"
AGENT_VERSION = os.getenv("AGENT_VERSION", "1.2.0")

# Tool definitions for this agent
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_events_api",
            "description": "Fetch attractions and points of interest from Wikipedia for a destination",
            "parameters": {"type": "object", "properties": {"destination": {"type": "string"}, "date": {"type": "string"}}, "required": ["destination"]}
        }
    }
]

# Model rotation for realistic traces
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
    "berlin": [
        {"name": "Berlin Wall Tour", "type": "tour", "venue": "East Side Gallery"},
        {"name": "Techno Night", "type": "music", "venue": "Berghain"},
        {"name": "Museum Island Visit", "type": "museum", "venue": "Museum Island"},
    ],
    "new york": [
        {"name": "Broadway Show", "type": "theater", "venue": "Times Square"},
        {"name": "Central Park Walk", "type": "tour", "venue": "Central Park"},
        {"name": "Jazz at Blue Note", "type": "music", "venue": "Blue Note"},
    ],
    "sydney": [
        {"name": "Opera House Tour", "type": "tour", "venue": "Sydney Opera House"},
        {"name": "Bondi Beach Day", "type": "outdoor", "venue": "Bondi Beach"},
        {"name": "Harbour Bridge Climb", "type": "adventure", "venue": "Sydney Harbour"},
    ],
    "mumbai": [
        {"name": "Bollywood Studio Tour", "type": "tour", "venue": "Film City"},
        {"name": "Street Food Walk", "type": "food", "venue": "Chowpatty Beach"},
        {"name": "Gateway of India Visit", "type": "landmark", "venue": "Gateway of India"},
    ],
    "seattle": [
        {"name": "Pike Place Market Tour", "type": "food", "venue": "Pike Place"},
        {"name": "Space Needle Visit", "type": "landmark", "venue": "Space Needle"},
        {"name": "Coffee Crawl", "type": "food", "venue": "Capitol Hill"},
    ],
}


class FaultConfig(BaseModel):
    type: str = Field(..., description="Fault type: timeout, error, rate_limited, high_latency, wrong_city, empty")
    delay_ms: int = Field(0, description="Delay in milliseconds")
    probability: float = Field(1.0, description="Probability of fault (0.0-1.0)")
    wrong_city: Optional[str] = Field(None, description="Return events from this city instead")


class EventsRequest(BaseModel):
    destination: str
    date: Optional[str] = None
    session_id: Optional[str] = None
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


# --- Telemetry setup ---
otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")

# One line replaces ~20 lines of TracerProvider + exporter setup
register(
    endpoint=f"grpc://{otlp_endpoint.replace('http://', '').replace('https://', '')}",
    service_name="events-agent",
    service_version="1.0.0",
)

# Application logs through the LoggerProvider register() installed: each record carries the
# trace and span ids of the active span.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=get_logger_provider()))
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("events_agent")

# Metrics (SDK handles tracing only)
# TODO: unify Resource with register() when SDK supports metrics
resource = Resource.create({"service.name": "events-agent"})
metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(endpoint=otlp_endpoint, insecure=True),
    export_interval_millis=10000,
)
meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(meter_provider)

# FastAPI >= 0.142 adds its own OpenTelemetry spans (e.g. fastapi.endpoint around each handler).
# This service instruments itself, and enrich()/get_current_span() must reach the request span,
# so turn FastAPI's built-in telemetry off. Older FastAPI versions ignore the argument.
inner_app = FastAPI(title="Events Agent", version="1.0.0", telemetry={"tracing": False, "metrics": False, "logs": False, "operation_spans": False})


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

    parent = getattr(trace.get_current_span(), "parent", None)
    called_by_agent = bool(parent is not None and parent.is_remote)

    # The HTTP server span stays a plain HTTP span: only the invoke_agent span names the agent.
    with observe(AGENT_NAME, op=Op.INVOKE_AGENT) as span:
        # Called directly (no caller trace), this agent span below the HTTP handler is the
        # trace's agent root. Called by the travel planner, the planner's span is.
        if not called_by_agent:
            mark_agent_root()
        enrich(
            model=model,
            provider=provider,
            agent_id=AGENT_ID,
            session_id=request.session_id,
            **{"gen_ai.agent.version": AGENT_VERSION},
            tool_definitions=TOOL_DEFINITIONS,
            input_messages=[{"role": "user", "parts": [{"type": "text", "content": f"Find events in {request.destination}"}]}],
        )
        logger.info("Looking up events in %s", request.destination, extra={"travel.destination": request.destination})

        destination = request.destination.lower()
        date = request.date or datetime.now().strftime("%Y-%m-%d")
        fault = request.fault

        # LLM reasoning call
        with observe("events-reasoning", op=Op.CHAT) as reasoning_span:
            if _config_cache["use_real_llm"] and _bedrock_client:
                try:
                    reasoning_messages = [{"role": "user", "content": [{"text": f"What are the top attractions and things to do in {request.destination}? List briefly."}]}]
                    reasoning_response = converse(
                        _bedrock_client, reasoning_messages,
                        system="You are a travel events assistant. Briefly suggest what to look for.",
                    )
                    usage = get_usage(reasoning_response)
                    enrich(
                        model=BEDROCK_MODEL_ID,
                        provider="aws_bedrock",
                        input_tokens=usage["input_tokens"],
                        output_tokens=usage["output_tokens"],
                        finish_reason=reasoning_response.get("stopReason", "end_turn"),
                        input_messages=[{"role": "user", "parts": [{"type": "text", "content": f"What to do in {request.destination}?"}]}],
                        output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": extract_text(reasoning_response)}]}],
                    )
                except BedrockUnavailableError as e:
                    reasoning_span.set_attribute("gen_ai.bedrock.fallback", True)
                    reasoning_span.set_attribute("gen_ai.bedrock.fallback.reason", str(e)[:200])
                    logger.warning("Bedrock unavailable, using the simulated model: %s", str(e)[:200])
                    enrich(model=model, provider=provider, input_tokens=random.randint(100, 500), output_tokens=random.randint(50, 200), finish_reason="tool_calls")
                    time.sleep(random.uniform(0.05, 0.15))
            else:
                enrich(model=model, provider=provider, input_tokens=random.randint(100, 500), output_tokens=random.randint(50, 200), finish_reason="tool_calls")
                time.sleep(random.uniform(0.05, 0.15))

        # Check for fault injection
        if should_inject_fault(fault):
            span.set_attribute("fault.injected", fault.type)

            if fault.type == "high_latency":
                delay = fault.delay_ms / 1000.0
                span.set_attribute("fault.delay_ms", fault.delay_ms)
                logger.warning("Fault injection: delaying the events lookup by %d ms", fault.delay_ms)
                time.sleep(delay)

            elif fault.type == "timeout":
                span.set_status(Status(StatusCode.ERROR, "Tool execution timed out"))
                logger.error("Events lookup timed out", extra={"error.type": "timeout"})
                time.sleep(30)
                return ErrorResponse(
                    error={"type": "timeout", "message": "Events lookup timed out"},
                    destination=request.destination,
                    agent_id=AGENT_ID,
                )

            elif fault.type == "error":
                span.set_status(Status(StatusCode.ERROR, "Events API error"))
                logger.error("Events API returned an error", extra={"error.type": "tool_error"})
                return ErrorResponse(
                    error={"type": "tool_error", "message": "Events API returned an error"},
                    destination=request.destination,
                    agent_id=AGENT_ID,
                )

            elif fault.type == "rate_limited":
                span.set_status(Status(StatusCode.ERROR, "Rate limited"))
                logger.warning("Events API rate limit exceeded", extra={"error.type": "rate_limited"})
                return ErrorResponse(
                    error={"type": "rate_limited", "message": "Events API rate limit exceeded"},
                    destination=request.destination,
                    agent_id=AGENT_ID,
                )

            elif fault.type == "wrong_city":
                wrong = fault.wrong_city or random.choice([c for c in SAMPLE_EVENTS.keys() if c != destination])
                span.set_attribute("fault.wrong_city", wrong)
                # A bad answer: the events are for another city
                logger.warning("Returning events for %s instead of %s", wrong, request.destination,
                               extra={"fault.wrong_city": wrong, "travel.destination": request.destination})
                events_data = SAMPLE_EVENTS.get(wrong, SAMPLE_EVENTS["paris"])
                selected = random.sample(events_data, min(len(events_data), 2))
                events = [Event(name=e["name"], type=e["type"], venue=e["venue"], date=date) for e in selected]
                enrich(output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": json.dumps([e.model_dump() for e in events])}]}])
                return EventsResponse(destination=request.destination, events=events, agent_id=AGENT_ID)

            elif fault.type == "empty":
                logger.warning("Returning no events for %s", request.destination)
                return EventsResponse(destination=request.destination, events=[], agent_id=AGENT_ID)

        # Tool execution via MCP server
        session_id = uuid4().hex
        request_id = uuid4().hex[:8]

        # MCP tool call — uses observe() for the span, with MCP-specific attributes set manually
        with observe("fetch_events_api", op=Op.EXECUTE_TOOL, kind=SpanKind.CLIENT) as tool_span:
            tool_span.set_attribute("mcp.method.name", "tools/call")
            tool_span.set_attribute("mcp.session.id", session_id)
            tool_span.set_attribute("mcp.protocol.version", MCP_PROTOCOL_VERSION)
            tool_span.set_attribute("jsonrpc.request.id", request_id)
            tool_span.set_attribute("network.transport", "tcp")
            tool_span.set_attribute("network.protocol.name", "http")

            enrich(
                input_messages=[{"role": "tool_call", "parts": [{"type": "text", "content": json.dumps({"destination": destination})}]}],
            )

            headers = {"mcp-session-id": session_id}
            inject(headers)
            payload = {
                "jsonrpc": "2.0", "method": "tools/call", "id": request_id,
                "params": {"name": "fetch_events_api", "arguments": {"destination": destination}}
            }
            try:
                resp = httpx.post(f"{MCP_SERVER_URL}/mcp", json=payload, headers=headers, timeout=30)
                body = resp.json()
            except Exception as e:
                logger.error("fetch_events_api failed: %s", e, extra={"error.type": type(e).__name__})
                tool_span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
            if "error" in body:
                logger.error("fetch_events_api returned an error: %s", body["error"].get("message"), extra={"error.type": "tool_error"})
                tool_span.set_status(Status(StatusCode.ERROR, str(body["error"].get("message"))))
            mcp_result = body.get("result", {})
            if mcp_result.get("source") == "fallback":
                logger.warning("fetch_events_api answered from fallback data for %s", request.destination)
            events_list = mcp_result.get("events", [])
            events = [Event(name=e["name"], type=e.get("type", "attraction"), venue=e.get("venue", destination.title()), date=e.get("date", date)) for e in events_list]

            enrich(
                output_messages=[{"role": "tool_result", "parts": [{"type": "text", "content": json.dumps(mcp_result)}]}],
            )

        span.set_attribute("events.count", len(events))
        enrich(
            output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": json.dumps([e.model_dump() for e in events])}]}],
        )
        logger.info("Found %d events in %s", len(events), request.destination)

    return EventsResponse(destination=request.destination, events=events, agent_id=AGENT_ID)


# One server span per request: the per-message "http receive" / "http send" spans add nothing
# to a trace but sit between the agent spans in every view.
app = OpenTelemetryMiddleware(inner_app, exclude_spans=["receive", "send"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
