"""Strands Events Agent: finds attractions for a destination using the MCP events tool."""

import json
import random
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

AGENT_NAME = "Strands Events Agent"
SYSTEM_PROMPT = (
    "You find things to do. Use find_attractions for the destination and list the top three "
    "in one sentence."
)
OTHER_CITIES = ["Tokyo", "Sydney", "Mumbai", "Toronto", "Berlin"]

app = FastAPI(title=AGENT_NAME)
setup_telemetry(app)


class EventsRequest(BaseModel):
    destination: str
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None
    fault: Optional[SubAgentFault] = None


def scripted_plan(prompt: str):
    return [("find_attractions", {"destination": prompt.split("in ", 1)[-1].rstrip(".?")})]


def scripted_answer(prompt: str, results: dict) -> str:
    raw = results.get("find_attractions", "")
    if raw.startswith("ERROR"):
        return "Attractions are unavailable right now."
    try:
        names = [e["name"] for e in json.loads(raw).get("events", [])][:3]
    except (ValueError, KeyError, TypeError):
        names = []
    return f"Top picks: {', '.join(names)}." if names else "No attractions found."


@app.get("/health")
async def health():
    return {"status": "healthy", "agent_name": AGENT_NAME}


@app.post("/events")
async def events(request: EventsRequest):
    failures: list[FaultError] = []
    found: dict = {"events": []}

    @tool
    def find_attractions(destination: str) -> str:
        """Find attractions and points of interest for a destination (Wikipedia via the MCP server)."""
        try:
            data_fault = apply_fault(request.fault)
        except FaultError as e:
            failures.append(e)
            raise
        if data_fault == "empty":
            found["events"] = []
            return json.dumps(found)
        if data_fault == "wrong_city":
            destination = request.fault.wrong_city or random.choice(OTHER_CITIES)
        result = call_mcp_tool("fetch_events_api", {"destination": destination})
        found["events"] = result.get("events", [])
        return json.dumps(result)

    def make_agent(model):
        return Agent(
            name=AGENT_NAME,
            model=model,
            tools=[find_attractions],
            system_prompt=SYSTEM_PROMPT,
            trace_attributes=session_attributes(request.conversation_id, request.user_id),
            callback_handler=None,
        )

    prompt = f"What should I see in {request.destination}?"
    describe_request_span(AGENT_NAME, prompt, request.conversation_id, request.user_id)
    text, _ = await run_agent(make_agent, prompt, ScriptedModel(scripted_plan, scripted_answer))
    finish_request_span(text)
    body = {"destination": request.destination, "events": found["events"], "summary": text}
    if failures:
        return JSONResponse(status_code=failures[0].status, content={**body, "error": str(failures[0])})
    return body
