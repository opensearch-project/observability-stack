"""Strands Weather Assistant: answers weather questions using the MCP weather tool."""

import json
import logging
import re
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from strands import Agent, tool

from common.agents import FaultError, SubAgentFault, apply_fault, call_mcp_tool, run_agent
from common.models import ScriptedModel
from common.telemetry import (
    describe_request_span,
    finish_request_span,
    session_attributes,
    setup_telemetry,
)

logger = logging.getLogger(__name__)

AGENT_NAME = "Strands Weather Assistant"
SYSTEM_PROMPT = (
    "You are a weather assistant. Use get_current_weather for the location the user asks "
    "about and answer in one or two sentences."
)

app = FastAPI(title=AGENT_NAME)
setup_telemetry(app)


class InvokeRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None
    fault: Optional[SubAgentFault] = None


def location_of(message: str) -> str:
    match = re.search(r"\bin ([A-Z][\w .'-]+?)(?:\?|$| this| next| on| for)", message)
    return match.group(1).strip() if match else message.strip().rstrip("?")


def scripted_plan(prompt: str):
    return [("get_current_weather", {"location": location_of(prompt)})]


def scripted_answer(prompt: str, results: dict) -> str:
    raw = results.get("get_current_weather", "")
    if raw.startswith("ERROR"):
        return f"Weather data for {location_of(prompt)} is unavailable right now."
    try:
        w = json.loads(raw)
        return f"The weather in {w['location']} is {w['condition']} with a temperature of {w['temperature']}."
    except (ValueError, KeyError):
        return raw or f"No weather data for {location_of(prompt)}."


@app.get("/health")
async def health():
    return {"status": "healthy", "agent_name": AGENT_NAME}


@app.post("/invoke")
async def invoke(request: InvokeRequest):
    failures: list[FaultError] = []

    @tool
    def get_current_weather(location: str) -> str:
        """Get the current weather for a location (live Open-Meteo data via the MCP server)."""
        try:
            apply_fault(request.fault)
        except FaultError as e:
            failures.append(e)
            raise
        return json.dumps(call_mcp_tool("fetch_weather_api", {"location": location}))

    def make_agent(model):
        return Agent(
            name=AGENT_NAME,
            model=model,
            tools=[get_current_weather],
            system_prompt=SYSTEM_PROMPT,
            trace_attributes=session_attributes(request.conversation_id, request.user_id),
            callback_handler=None,
        )

    describe_request_span(AGENT_NAME, request.message, request.conversation_id, request.user_id)
    logger.info("Weather requested: %s", request.message)
    text, _ = await run_agent(make_agent, request.message, ScriptedModel(scripted_plan, scripted_answer))
    finish_request_span(text)
    if failures:
        # Surface the tool failure to the caller, so the planner's tool span fails too.
        return JSONResponse(
            status_code=failures[0].status,
            content={"response": text, "error": str(failures[0]), "conversation_id": request.conversation_id},
        )
    return {"response": text, "conversation_id": request.conversation_id}
