#!/usr/bin/env python3
"""
Weather Agent API Server

FastAPI server that exposes the weather agent through REST API endpoints.
Includes OpenTelemetry instrumentation for trace context propagation.
"""

import json
import os
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from opentelemetry import trace as trace_api
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware

from opensearch_genai_observability_sdk_py import enrich

from main import WeatherAgent, setup_telemetry, FaultConfig, AgentError, SYSTEMS


# Request/Response models
class FaultRequest(BaseModel):
    type: str
    delay_ms: int = 0
    probability: float = 1.0
    tool: Optional[str] = None


class InvokeRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    fault: Optional[FaultRequest] = None


class InvokeResponse(BaseModel):
    response: str
    conversation_id: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    agent_id: str
    agent_name: str


# Setup telemetry BEFORE creating app
otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
meter, logger = setup_telemetry(
    service_name="weather-agent",
    service_version="1.0.0",
    otlp_endpoint=otlp_endpoint,
)

# Create agent
agent = WeatherAgent(meter, logger)

# Create inner FastAPI app
# FastAPI >= 0.142 adds its own OpenTelemetry spans (e.g. fastapi.endpoint around each handler).
# This service instruments itself, and enrich()/get_current_span() must reach the request span,
# so turn FastAPI's built-in telemetry off. Older FastAPI versions ignore the argument.
inner_app = FastAPI(title="Weather Agent API", version="1.0.0", telemetry={"tracing": False, "metrics": False, "logs": False, "operation_spans": False})

logger.info("Weather Agent API server started", extra={"otlp_endpoint": otlp_endpoint})


@inner_app.get("/")
async def root():
    return {"name": "Weather Agent API", "version": "1.0.0"}


@inner_app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="healthy", agent_id=agent.agent_id, agent_name=agent.agent_name)


@inner_app.post("/invoke", response_model=InvokeResponse)
async def invoke(request: InvokeRequest):
    # Per OTel GenAI semconv, only set gen_ai.conversation.id when the caller provides one;
    # never fabricate a fallback (UUID, trace id, content hash).
    conversation_id = request.conversation_id

    fault_config = None
    if request.fault:
        fault_config = FaultConfig(
            type=request.fault.type,
            delay_ms=request.fault.delay_ms,
            probability=request.fault.probability,
            tool=request.fault.tool
        )

    # Promote gen_ai attributes to the root HTTP span so the UI can read them
    enrich(
        model=agent.model,
        provider=SYSTEMS.get(agent.model, "openai"),
        input_messages=[{"role": "user", "parts": [{"type": "text", "content": request.message}]}],
    )
    root_span = trace_api.get_current_span()
    root_span.set_attribute("gen_ai.agent.name", agent.agent_name)
    root_span.set_attribute("gen_ai.operation.name", "invoke_agent")

    try:
        response = agent.invoke(request.message, conversation_id, fault_config)
        # Set output on the parent HTTP request span. agent.invoke() runs inside
        # its own observe() block, so by the time we return here the current
        # span is the HTTP request span — enrich() intentionally targets it.
        enrich(
            output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": response}]}],
        )
        return InvokeResponse(response=response, conversation_id=conversation_id)
    except AgentError as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"response": None, "error": {"type": e.error_type, "message": str(e)}, "conversation_id": conversation_id}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent invocation failed: {str(e)}")


# Wrap with OpenTelemetry middleware for trace context propagation
app = OpenTelemetryMiddleware(inner_app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
