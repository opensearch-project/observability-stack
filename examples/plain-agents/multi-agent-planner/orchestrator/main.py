#!/usr/bin/env python3
"""
Travel Planner - Orchestrates weather, events, flights, and currency agents.
Supports fault injection at orchestrator level and pass-through to sub-agents.

Instrumented with opensearch-genai-observability-sdk-py:
- register() sets up the OTLP traces and logs pipelines in one call
- observe() + enrich() replace manual span creation + set_attribute() calls
- mark_agent_root() marks the agent span below the HTTP handler as the trace's agent root
- Python logging goes through the SDK's logger provider, so every log line carries the trace
  and span ids of the span that was active when it was logged (Agent Traces shows them)
"""

import asyncio
import json
import logging
import os
import random
import re
import threading
import time
from typing import Optional
from uuid import uuid4

import httpx
import requests
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
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.propagate import inject
from pydantic import BaseModel, Field

from opensearch_genai_observability_sdk_py import Op, enrich, mark_agent_root, observe, register
from bedrock_client import (
    get_bedrock_client, converse, extract_text, get_usage,
    openai_tools_to_bedrock, BedrockUnavailableError, BEDROCK_MODEL_ID,
)


AGENT_ID = "travel-planner-001"
AGENT_NAME = "Travel Planner"
AGENT_VERSION = os.getenv("AGENT_VERSION", "1.3.0")


def _version_tuple(v: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3]) or (0,)


# 1.4.0 is the candidate release: it calls the weather and events agents in parallel and adds a
# trip cost estimate when the user gives a budget. It also has a regression a release review
# should catch: without travel dates it skips the weather forecast.
CANDIDATE_BEHAVIOR = _version_tuple(AGENT_VERSION) >= (1, 4)

WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://weather-agent:8000")
EVENTS_AGENT_URL = os.getenv("EVENTS_AGENT_URL", "http://events-agent:8002")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://mcp-server:8003")
FAULT_PANEL_URL = os.getenv("FAULT_PANEL_URL", "http://fault-panel:8085")

# Config cache — polled from fault panel
_config_cache = {"use_real_llm": False}


def _poll_config():
    while True:
        try:
            resp = requests.get(f"{FAULT_PANEL_URL}/config", timeout=2)
            if resp.status_code == 200:
                _config_cache["use_real_llm"] = resp.json().get("use_real_llm", False)
        except Exception:
            pass
        time.sleep(30)


threading.Thread(target=_poll_config, daemon=True).start()

# Bedrock client (None if no creds available)
_bedrock_client = get_bedrock_client()

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a destination (real Open-Meteo data)",
            "parameters": {"type": "object", "properties": {"destination": {"type": "string"}}, "required": ["destination"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_events",
            "description": "Get attractions and points of interest from Wikipedia",
            "parameters": {"type": "object", "properties": {"destination": {"type": "string"}}, "required": ["destination"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_flights",
            "description": "Search for flights between origin and destination",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "destination": {"type": "string"},
                    "date": {"type": "string", "description": "YYYY-MM-DD"}
                },
                "required": ["origin", "destination"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "convert_currency",
            "description": "Convert amount between currencies using live ECB rates",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number"},
                    "from_currency": {"type": "string"},
                    "to_currency": {"type": "string"}
                },
                "required": ["amount", "from_currency", "to_currency"]
            }
        }
    }
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

DESTINATION_CURRENCIES = {
    "paris": "EUR", "london": "GBP", "tokyo": "JPY", "berlin": "EUR",
    "sydney": "AUD", "mumbai": "INR", "toronto": "CAD", "seattle": "USD",
    "new york": "USD", "portland": "USD", "vancouver": "CAD", "rome": "EUR",
    "barcelona": "EUR", "amsterdam": "EUR", "bangkok": "THB",
    "lisbon": "EUR", "kyoto": "JPY", "mexico city": "MXN", "reykjavik": "ISK",
    "cape town": "ZAR", "singapore": "SGD", "seoul": "KRW", "istanbul": "TRY",
    "buenos aires": "ARS", "dubai": "AED", "prague": "CZK", "copenhagen": "DKK",
}

# Typical daily spend per traveler (lodging, food, local transport), USD. Used by the 1.4.0
# trip cost estimate.
DAILY_COST_USD = {
    "paris": 260, "london": 290, "tokyo": 230, "berlin": 190, "sydney": 240, "mumbai": 90,
    "toronto": 210, "seattle": 250, "new york": 330, "portland": 200, "vancouver": 220,
    "rome": 210, "barcelona": 190, "amsterdam": 240, "bangkok": 90, "lisbon": 160,
    "kyoto": 200, "mexico city": 110, "reykjavik": 300, "cape town": 130, "singapore": 230,
    "seoul": 170, "istanbul": 120, "buenos aires": 110, "dubai": 280, "prague": 140,
    "copenhagen": 280,
}

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]


def parse_trip(message: str) -> dict:
    """Trip length, travel month and budget the user gave in their request, if any."""
    text = (message or "").lower()
    days = re.search(r"(\d+)[- ]?(?:day|days)\b", text)
    nights = re.search(r"(\d+)[- ]?nights?\b", text)
    weekend = "weekend" in text
    week = re.search(r"\b(?:a|one) week\b", text)
    month = next((m for m in MONTHS if re.search(rf"\b{m}\b", text)), None)
    has_date = bool(month or re.search(r"\b\d{4}-\d{2}-\d{2}\b|next week|this weekend|tomorrow", text))
    budget = re.search(r"(?:under|budget of|max(?:imum)?|less than|up to)?\s*\$\s?([\d,]+)", text)
    n_days = (int(days.group(1)) if days else int(nights.group(1)) + 1 if nights
              else 7 if week else 3 if weekend else None)
    return {
        "days": n_days,
        "month": month.capitalize() if month else None,
        "has_dates": has_date,
        "budget_usd": int(budget.group(1).replace(",", "")) if budget else None,
    }

MCP_PROTOCOL_VERSION = "2025-06-18"


class SubAgentFault(BaseModel):
    type: str = Field(..., description="Fault type: timeout, error, rate_limited, high_latency, wrong_city, empty")
    delay_ms: int = Field(0, description="Delay in ms for high_latency")
    probability: float = Field(1.0, description="Probability of fault (0.0-1.0)")
    wrong_city: Optional[str] = Field(None, description="For wrong_city fault: return events from this city")


class FaultConfig(BaseModel):
    orchestrator: Optional[str] = Field(None, description="Orchestrator fault: partial_failure, fan_out_timeout")
    weather: Optional[SubAgentFault] = Field(None, description="Fault to inject in weather-agent")
    events: Optional[SubAgentFault] = Field(None, description="Fault to inject in events-agent")


class PlanRequest(BaseModel):
    destination: str
    origin: Optional[str] = None
    # Conversation the request belongs to (gen_ai.conversation.id). Turns that share it form one
    # session in Agent Traces and can be evaluated together (session-level evaluations).
    session_id: Optional[str] = None
    # The signed-in user (user.id on the agent span); Agent Traces shows it per session.
    user_id: Optional[str] = None
    # What the user typed this turn, for follow-ups in a conversation; defaults to
    # "Plan a trip to <destination>".
    message: Optional[str] = None
    fault: Optional[FaultConfig] = None


class PlanResponse(BaseModel):
    destination: str
    session_id: Optional[str] = None
    weather: Optional[dict] = None
    events: list = []
    flights: Optional[dict] = None
    currency: Optional[dict] = None
    estimate: Optional[dict] = None
    agent_version: str = AGENT_VERSION
    recommendation: str
    partial: bool = False
    errors: list = []


# --- Telemetry setup ---
otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")

register(
    endpoint=f"grpc://{otlp_endpoint.replace('http://', '').replace('https://', '')}",
    service_name="travel-planner",
    service_version="1.0.0",
)

# Application logs: register() installed the global LoggerProvider (OTLP logs, same resource as
# the traces). A LoggingHandler on the root logger sends every Python log record through it with
# the active span's trace and span ids, so Agent Traces can show a span's logs next to it.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=get_logger_provider()))
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("travel_planner")

resource = Resource.create({"service.name": "travel-planner"})
metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(endpoint=otlp_endpoint, insecure=True),
    export_interval_millis=10000,
)
meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(meter_provider)

HTTPXClientInstrumentor().instrument()

# FastAPI >= 0.142 adds its own OpenTelemetry spans (e.g. fastapi.endpoint around each handler).
# This service instruments itself, and enrich()/get_current_span() must reach the request span,
# so turn FastAPI's built-in telemetry off. Older FastAPI versions ignore the argument.
inner_app = FastAPI(title="Travel Planner", version="1.0.0", telemetry={"tracing": False, "metrics": False, "logs": False, "operation_spans": False})


@inner_app.get("/health")
async def health():
    return {"status": "healthy", "agent_id": AGENT_ID, "agent_name": AGENT_NAME, "agent_version": AGENT_VERSION}


async def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """Call MCP server directly for a tool execution."""
    session_id = uuid4().hex
    request_id = uuid4().hex[:8]

    with observe(f"tools/call {tool_name}", op=Op.EXECUTE_TOOL, kind=SpanKind.CLIENT) as span:
        span.set_attribute("mcp.method.name", "tools/call")
        span.set_attribute("mcp.session.id", session_id)
        span.set_attribute("mcp.protocol.version", MCP_PROTOCOL_VERSION)
        span.set_attribute("jsonrpc.request.id", request_id)
        span.set_attribute("gen_ai.tool.name", tool_name)

        enrich(
            input_messages=[{"role": "tool_call", "parts": [{"type": "text", "content": json.dumps(arguments)}]}],
        )
        logger.info("Calling MCP tool %s", tool_name, extra={"gen_ai.tool.name": tool_name})

        headers = {"mcp-session-id": session_id}
        inject(headers)
        payload = {
            "jsonrpc": "2.0", "method": "tools/call", "id": request_id,
            "params": {"name": tool_name, "arguments": arguments}
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(f"{MCP_SERVER_URL}/mcp", json=payload, headers=headers)
                result = resp.json()
        except Exception as e:
            # Logged inside the tool span, so the ERROR record carries this span's id
            logger.error("MCP tool %s failed: %s", tool_name, e, extra={"gen_ai.tool.name": tool_name, "error.type": type(e).__name__})
            span.set_attribute("error.type", type(e).__name__)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            raise
        if "error" in result:
            message = result["error"].get("message", "MCP tool call failed")
            logger.error("MCP tool %s returned an error: %s", tool_name, message, extra={"gen_ai.tool.name": tool_name, "error.type": "tool_error"})
            span.set_attribute("error.type", "tool_error")
            span.set_status(Status(StatusCode.ERROR, message))
            raise Exception(message)
        tool_result = result.get("result", {})
        if tool_result.get("source") == "fallback":
            logger.warning("MCP tool %s answered from fallback data", tool_name, extra={"gen_ai.tool.name": tool_name})
        enrich(
            output_messages=[{"role": "tool_result", "parts": [{"type": "text", "content": json.dumps(tool_result)}]}],
        )
        return tool_result


def _has_remote_parent() -> bool:
    """True when the HTTP request continued a trace started by another service (or a test run)."""
    parent = getattr(trace.get_current_span(), "parent", None)
    return bool(parent is not None and parent.is_remote)


@inner_app.post("/plan")
async def plan_trip(request: PlanRequest):
    model = random.choice(MODELS)
    provider = SYSTEMS[model]
    session_id = request.session_id or f"trip_{uuid4().hex[:12]}"
    user_message = request.message or (
        f"Plan a trip to {request.destination}" + (f" from {request.origin}" if request.origin else "")
    )
    user_attrs = {"user.id": request.user_id} if request.user_id else {}
    called_remotely = _has_remote_parent()

    # The HTTP server span stays a plain HTTP span: only the invoke_agent span below names the agent.
    with observe(AGENT_NAME, op=Op.INVOKE_AGENT) as span:
        # This agent span sits below the HTTP handler span. Mark it as the trace's agent root, so
        # Agent Traces lists the trace by it, unless a caller (an evaluation run or another agent)
        # already started the trace with its own agent span.
        if not called_remotely:
            mark_agent_root()
        enrich(
            model=model,
            provider=provider,
            agent_id=AGENT_ID,
            agent_description="Plans a trip: weather, attractions, flights and currency for a destination",
            session_id=session_id,
            tool_definitions=TOOL_DEFINITIONS,
            input_messages=[{"role": "user", "parts": [{"type": "text", "content": user_message}]}],
            destination=request.destination,
            **{"gen_ai.agent.version": AGENT_VERSION, **user_attrs},
        )
        logger.info(
            "Planning trip to %s", request.destination,
            extra={"gen_ai.conversation.id": session_id, "destination": request.destination, "origin": request.origin or "", **user_attrs},
        )

        fault = request.fault
        errors = []
        weather_data = None
        events_data = []
        flights_data = None
        currency_data = None

        # LLM planning call
        with observe("planning", op=Op.CHAT) as planning_span:
            if _config_cache["use_real_llm"] and _bedrock_client:
                try:
                    planning_messages = [{"role": "user", "content": [{"text": f"Plan a weekend trip to {request.destination}. What information should we gather about weather, attractions, flights, and currency?"}]}]
                    planning_response = converse(
                        _bedrock_client, planning_messages,
                        system="You are a travel planning assistant. Briefly outline what to research for this trip.",
                    )
                    usage = get_usage(planning_response)
                    enrich(
                        model=BEDROCK_MODEL_ID,
                        provider="aws_bedrock",
                        input_tokens=usage["input_tokens"],
                        output_tokens=usage["output_tokens"],
                        finish_reason=planning_response.get("stopReason", "end_turn"),
                        input_messages=[{"role": "user", "parts": [{"type": "text", "content": f"Plan a trip to {request.destination}"}]}],
                        output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": extract_text(planning_response)}]}],
                    )
                except BedrockUnavailableError as e:
                    planning_span.set_attribute("gen_ai.bedrock.fallback", True)
                    planning_span.set_attribute("gen_ai.bedrock.fallback.reason", str(e)[:200])
                    logger.warning("Bedrock unavailable for planning, using the simulated model: %s", str(e)[:200])
                    enrich(model=model, provider=provider, input_tokens=random.randint(500, 2000), output_tokens=random.randint(100, 500), finish_reason="tool_calls")
                    await asyncio.sleep(random.uniform(0.8, 1.8))
            else:
                enrich(model=model, provider=provider, input_tokens=random.randint(500, 2000), output_tokens=random.randint(100, 500), finish_reason="tool_calls")
                await asyncio.sleep(random.uniform(0.8, 1.8))

        # Build sub-agent payloads with fault pass-through
        weather_payload = {"message": f"What's the weather in {request.destination}?", "conversation_id": session_id}
        events_payload = {"destination": request.destination, "session_id": session_id}

        if fault:
            if fault.weather:
                weather_payload["fault"] = fault.weather.model_dump()
            if fault.events:
                events_payload["fault"] = fault.events.model_dump()

        # Orchestrator-level fault injection
        if fault and fault.orchestrator:
            span.set_attribute("fault.orchestrator", fault.orchestrator)
            logger.warning("Fault injection active: %s", fault.orchestrator, extra={"fault.orchestrator": fault.orchestrator})
            timeout = 0.001 if fault.orchestrator == "fan_out_timeout" else 30.0
        else:
            timeout = 30.0

        # 1.3.0 asks the weather agent, then the events agent. 1.4.0 asks both in parallel, but
        # skips the forecast when the user gave no travel dates (the regression it ships with).
        trip = parse_trip(user_message)
        skip_weather = CANDIDATE_BEHAVIOR and not trip["has_dates"]

        async def ask_weather(client):
            nonlocal weather_data
            with observe("weather-agent", op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT) as agent_span:
                try:
                    if fault and fault.orchestrator == "partial_failure" and random.random() < 0.5:
                        raise Exception("Simulated partial failure - skipping weather")
                    resp = await client.post(f"{WEATHER_AGENT_URL}/invoke", json=weather_payload)
                    if resp.status_code == 200:
                        weather_data = resp.json()
                        logger.info("weather-agent answered")
                    else:
                        errors.append({"agent": "weather", "error": resp.text})
                        agent_span.set_status(Status(StatusCode.ERROR, resp.text))
                        logger.error("weather-agent failed with HTTP %s, continuing without weather", resp.status_code,
                                     extra={"http.response.status_code": resp.status_code})
                except Exception as e:
                    errors.append({"agent": "weather", "error": str(e)})
                    agent_span.set_status(Status(StatusCode.ERROR, str(e)))
                    logger.error("weather-agent call failed, continuing without weather: %s", e, extra={"error.type": type(e).__name__})

        async def ask_events(client):
            nonlocal events_data
            with observe("events-agent", op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT) as agent_span:
                try:
                    if fault and fault.orchestrator == "partial_failure" and random.random() < 0.5:
                        raise Exception("Simulated partial failure - skipping events")
                    resp = await client.post(f"{EVENTS_AGENT_URL}/events", json=events_payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        if "error" not in data:
                            events_data = data.get("events", [])
                            if events_data:
                                logger.info("events-agent returned %d events", len(events_data))
                            else:
                                logger.warning("events-agent returned no events for %s", request.destination)
                        else:
                            errors.append({"agent": "events", "error": data["error"]})
                            agent_span.set_status(Status(StatusCode.ERROR, str(data["error"])))
                            logger.error("events-agent returned an error, continuing without events: %s",
                                         data["error"].get("message", data["error"]), extra={"error.type": data["error"].get("type", "error")})
                    else:
                        errors.append({"agent": "events", "error": resp.text})
                        agent_span.set_status(Status(StatusCode.ERROR, resp.text))
                        logger.error("events-agent failed with HTTP %s, continuing without events", resp.status_code,
                                     extra={"http.response.status_code": resp.status_code})
                except Exception as e:
                    errors.append({"agent": "events", "error": str(e)})
                    agent_span.set_status(Status(StatusCode.ERROR, str(e)))
                    logger.error("events-agent call failed, continuing without events: %s", e, extra={"error.type": type(e).__name__})

        async with httpx.AsyncClient(timeout=timeout) as client:
            if CANDIDATE_BEHAVIOR:
                await asyncio.gather(ask_events(client), *([] if skip_weather else [ask_weather(client)]))
            else:
                await ask_weather(client)
                await ask_events(client)
        if skip_weather:
            logger.info("No travel dates in the request, skipping the weather forecast")

        # Sequential MCP calls for flights and currency (produces deeper trace waterfall)
        origin = request.origin or "Portland"
        try:
            flights_data = await call_mcp_tool("fetch_flights_api", {
                "origin": origin,
                "destination": request.destination,
            })
        except Exception as e:
            errors.append({"agent": "flights", "error": str(e)})

        dest_lower = request.destination.lower()
        target_currency = DESTINATION_CURRENCIES.get(dest_lower)
        if target_currency is None:
            target_currency = "EUR"
            logger.warning("No currency known for %s, falling back to EUR", request.destination)
        if target_currency != "USD":
            try:
                currency_data = await call_mcp_tool("convert_currency", {
                    "amount": 100,
                    "from_currency": "USD",
                    "to_currency": target_currency,
                })
            except Exception as e:
                errors.append({"agent": "currency", "error": str(e)})

        # 1.4.0: estimate the trip cost against the user's budget (a local tool)
        estimate = None
        if CANDIDATE_BEHAVIOR and trip["budget_usd"]:
            with observe("estimate_trip_cost", op=Op.EXECUTE_TOOL):
                days = trip["days"] or 4
                flight = (flights_data or {}).get("flights") or [{}]
                flight_usd = min((f.get("price_usd") or 0 for f in flight), default=0) or 650
                daily = DAILY_COST_USD.get(dest_lower, 200)
                total = int(flight_usd + days * daily)
                estimate = {"days": days, "flight_usd": flight_usd, "daily_usd": daily,
                            "total_usd": total, "budget_usd": trip["budget_usd"],
                            "within_budget": total <= trip["budget_usd"]}
                enrich(input_messages=[{"role": "tool_call", "parts": [{"type": "text", "content": json.dumps(
                           {"destination": request.destination, "days": days, "budget_usd": trip["budget_usd"]})}]}],
                       output_messages=[{"role": "tool_result", "parts": [{"type": "text", "content": json.dumps(estimate)}]}])
                await asyncio.sleep(random.uniform(0.05, 0.2))

        # Final response "chat" span — summarize gathered data
        with observe("summarize", op=Op.CHAT) as summarize_span:
            gathered = {"destination": request.destination, "request": user_message, "weather": weather_data, "events": events_data,
                        "flights": flights_data, "currency": currency_data, "cost_estimate": estimate}
            if _config_cache["use_real_llm"] and _bedrock_client:
                try:
                    summary_messages = [{"role": "user", "content": [{"text": f"Summarize this trip data into a brief recommendation (2-3 sentences):\n{json.dumps(gathered, default=str)}"}]}]
                    summary_response = converse(
                        _bedrock_client, summary_messages,
                        system="You are a travel assistant. Give a concise, enthusiastic trip recommendation based on the gathered data.",
                    )
                    usage = get_usage(summary_response)
                    recommendation = extract_text(summary_response)
                    enrich(
                        model=BEDROCK_MODEL_ID,
                        provider="aws_bedrock",
                        input_tokens=usage["input_tokens"],
                        output_tokens=usage["output_tokens"],
                        finish_reason=summary_response.get("stopReason", "end_turn"),
                        input_messages=[{"role": "user", "parts": [{"type": "text", "content": json.dumps(gathered, default=str)}]}],
                        output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": recommendation}]}],
                    )
                except BedrockUnavailableError as e:
                    summarize_span.set_attribute("gen_ai.bedrock.fallback", True)
                    summarize_span.set_attribute("gen_ai.bedrock.fallback.reason", str(e)[:200])
                    logger.warning("Bedrock unavailable for the summary, using the template answer: %s", str(e)[:200])
                    recommendation = None
                    enrich(model=model, provider=provider, input_tokens=random.randint(200, 800), output_tokens=random.randint(50, 200), finish_reason="stop")
                    await asyncio.sleep(random.uniform(0.9, 2.2))
            else:
                recommendation = None
                enrich(model=model, provider=provider, input_tokens=random.randint(200, 800), output_tokens=random.randint(50, 200), finish_reason="stop")
                await asyncio.sleep(random.uniform(0.9, 2.2))

        partial = len(errors) > 0
        if partial:
            span.set_attribute("response.partial", True)
            span.set_attribute("response.errors_count", len(errors))
            for i, err in enumerate(errors):
                span.set_attribute(f"response.error_{i}_agent", err["agent"])
                span.set_attribute(f"response.error_{i}_message", str(err["error"])[:200])
            span.set_status(Status(StatusCode.ERROR, f"Partial failure: {len(errors)} sub-agent(s) failed"))

        if not recommendation:
            recommendation = build_recommendation(request.destination, weather_data, events_data, flights_data,
                                                  currency_data, partial, trip=trip, origin=origin, estimate=estimate)

        enrich(
            output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": recommendation}]}],
        )
        if partial:
            # A degraded answer: logged on the agent span, next to the evaluation results for it
            logger.warning(
                "Returning a partial plan for %s: %s unavailable", request.destination,
                ", ".join(e["agent"] for e in errors),
                extra={"gen_ai.conversation.id": session_id, "plan.errors_count": len(errors)},
            )
        else:
            logger.info("Plan ready for %s", request.destination, extra={"gen_ai.conversation.id": session_id})

    return PlanResponse(
        destination=request.destination,
        session_id=session_id,
        weather=weather_data,
        events=events_data,
        flights=flights_data,
        currency=currency_data,
        estimate=estimate,
        recommendation=recommendation,
        partial=partial,
        errors=errors,
    )


def build_recommendation(destination: str, weather: Optional[dict], events: list,
                         flights: Optional[dict], currency: Optional[dict], partial: bool,
                         trip: Optional[dict] = None, origin: Optional[str] = None,
                         estimate: Optional[dict] = None) -> str:
    """The template answer used when no LLM is configured."""
    trip = trip or {}
    length = f"{trip['days']}-day " if trip.get("days") else ""
    when = f" in {trip['month']}" if trip.get("month") else ""
    parts = [f"Here is a {length}plan for {destination}{when}."]

    if weather and "response" in weather:
        parts.append(f"Weather: {weather['response']}")
    elif partial:
        parts.append("The weather forecast is unavailable right now.")

    if events:
        event_names = [e["name"] if isinstance(e, dict) else str(e) for e in events[:3]]
        parts.append(f"Top picks: {', '.join(event_names)}.")
    elif partial:
        parts.append("Attraction suggestions are unavailable right now.")

    if flights and flights.get("flights"):
        cheapest = min(flights["flights"], key=lambda f: f.get("price_usd") or 1e9)
        parts.append(f"Flights from {origin or 'your city'} start at ${cheapest['price_usd']} ({cheapest['airline']}).")

    if estimate:
        verdict = "within" if estimate["within_budget"] else "over"
        parts.append(f"Estimated cost: about ${estimate['total_usd']:,} for {estimate['days']} days, "
                     f"{verdict} your ${estimate['budget_usd']:,} budget.")

    if currency:
        parts.append(f"$100 is about {currency['converted']} {currency['to_currency']}.")

    return " ".join(parts)


# One server span per request: the per-message "http receive" / "http send" spans add nothing
# to a trace but sit between the agent spans in every view.
app = OpenTelemetryMiddleware(inner_app, exclude_spans=["receive", "send"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
