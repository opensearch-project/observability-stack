#!/usr/bin/env python3
"""
Travel Planner Orchestrator — instrumented with opensearch-genai-observability-sdk-py.

This is the SDK-instrumented version of plain-agents/multi-agent-planner/orchestrator/main.py.
It replaces ~30 lines of manual OTel setup and dozens of span.set_attribute() calls with
register() + @observe + enrich().

Requires: pip install opensearch-genai-observability-sdk-py fastapi uvicorn httpx
"""

import json
import os
import random
import time
from typing import Optional

import httpx
from fastapi import FastAPI
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.trace import SpanKind
from pydantic import BaseModel, Field

from opensearch_genai_observability_sdk_py import Op, enrich, observe, register

# --- SDK setup: replaces ~30 lines of manual TracerProvider/Resource/Exporter config ---
register(
    endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces"),
    service_name="travel-planner",
)
HTTPXClientInstrumentor().instrument()

AGENT_ID = "travel-planner-001"
AGENT_NAME = "Travel Planner"

WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://weather-agent:8000")
EVENTS_AGENT_URL = os.getenv("EVENTS_AGENT_URL", "http://events-agent:8002")

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather information for a destination by calling the weather agent",
            "parameters": {"type": "object", "properties": {"destination": {"type": "string"}}, "required": ["destination"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_events",
            "description": "Get local events for a destination by calling the events agent",
            "parameters": {"type": "object", "properties": {"destination": {"type": "string"}}, "required": ["destination"]},
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
    fault: Optional[FaultConfig] = None


class PlanResponse(BaseModel):
    destination: str
    weather: Optional[dict] = None
    events: list = []
    recommendation: str
    partial: bool = False
    errors: list = []


inner_app = FastAPI(title="Travel Planner", version="1.0.0")


@inner_app.get("/health")
async def health():
    return {"status": "healthy", "agent_id": AGENT_ID, "agent_name": AGENT_NAME}


@inner_app.post("/plan")
async def plan_trip(request: PlanRequest):
    model = random.choice(MODELS)
    provider = SYSTEMS[model]

    # Enrich the root HTTP span (created by ASGI middleware)
    enrich(
        provider=provider,
        model=model,
        agent_id=AGENT_ID,
        input_messages=[{"role": "user", "parts": [{"type": "text", "content": f"Plan a trip to {request.destination}"}]}],
    )

    # @observe replaces: tracer.start_as_current_span("invoke_agent", kind=..., attributes={...})
    # + 7 manual span.set_attribute() calls
    with observe("orchestrate", op=Op.INVOKE_AGENT):
        enrich(
            provider=provider,
            model=model,
            agent_id=AGENT_ID,
            tool_definitions=TOOL_DEFINITIONS,
        )

        fault = request.fault
        errors = []
        weather_data = None
        events_data = []

        # Synthetic "thinking" LLM call
        # @observe replaces: tracer.start_as_current_span("chat", ...) + 6 manual set_attribute() calls
        with observe("planning", op=Op.CHAT):
            enrich(
                provider=provider,
                model=model,
                input_tokens=random.randint(500, 2000),
                output_tokens=random.randint(100, 500),
                finish_reason="tool_calls",
            )
            time.sleep(random.uniform(0.1, 0.3))

        # Build sub-agent payloads
        weather_payload = {"message": f"What's the weather in {request.destination}?"}
        events_payload = {"destination": request.destination}

        if fault:
            if fault.weather:
                weather_payload["fault"] = fault.weather.model_dump()
            if fault.events:
                events_payload["fault"] = fault.events.model_dump()

        timeout = 30.0
        if fault and fault.orchestrator == "fan_out_timeout":
            timeout = 0.001

        # Fan out to sub-agents
        async with httpx.AsyncClient(timeout=timeout) as client:
            with observe("weather-agent", op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT):
                try:
                    if fault and fault.orchestrator == "partial_failure" and random.random() < 0.5:
                        raise Exception("Simulated partial failure - skipping weather")
                    resp = await client.post(f"{WEATHER_AGENT_URL}/invoke", json=weather_payload)
                    if resp.status_code == 200:
                        weather_data = resp.json()
                    else:
                        errors.append({"agent": "weather", "error": resp.text})
                except Exception as e:
                    errors.append({"agent": "weather", "error": str(e)})

            with observe("events-agent", op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT):
                try:
                    if fault and fault.orchestrator == "partial_failure" and random.random() < 0.5:
                        raise Exception("Simulated partial failure - skipping events")
                    resp = await client.post(f"{EVENTS_AGENT_URL}/events", json=events_payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        if "error" not in data:
                            events_data = data.get("events", [])
                        else:
                            errors.append({"agent": "events", "error": data["error"]})
                    else:
                        errors.append({"agent": "events", "error": resp.text})
                except Exception as e:
                    errors.append({"agent": "events", "error": str(e)})

        # Final response "chat" span
        with observe("summarize", op=Op.CHAT):
            enrich(
                provider=provider,
                model=model,
                input_tokens=random.randint(200, 800),
                output_tokens=random.randint(50, 200),
                finish_reason="stop",
            )
            time.sleep(random.uniform(0.05, 0.15))

        partial = len(errors) > 0
        recommendation = build_recommendation(request.destination, weather_data, events_data, partial)

        enrich(
            output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": recommendation}]}],
        )

        return PlanResponse(
            destination=request.destination,
            weather=weather_data,
            events=events_data,
            recommendation=recommendation,
            partial=partial,
            errors=errors,
        )


def build_recommendation(destination: str, weather: Optional[dict], events: list, partial: bool) -> str:
    parts = [f"Great choice! {destination} looks wonderful."]
    if weather and "response" in weather:
        parts.append(weather["response"])
    elif partial:
        parts.append("Weather info temporarily unavailable.")
    if events:
        event_names = [e["name"] for e in events[:2]]
        parts.append(f"Check out {', '.join(event_names)}.")
    elif partial:
        parts.append("Events info temporarily unavailable.")
    return " ".join(parts)


app = OpenTelemetryMiddleware(inner_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
