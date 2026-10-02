"""Strands Travel Planner: plans trips by calling the weather and events agents and MCP tools.

Same API as the plain-agents travel planner (POST /plan), so the canary and fault panel
drive both. Multi-turn: requests with the same conversation_id continue one conversation
(the agent keeps that conversation's history), and every span of the turn carries
gen_ai.conversation.id.
"""

import logging
import json
import os
import random
from collections import OrderedDict
from typing import Optional

import httpx
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from pydantic import BaseModel, Field
from strands import Agent, tool

from common.agents import SubAgentFault, call_mcp_tool, run_agent, to_text
from common.models import ScriptedModel
from common.telemetry import (
    describe_request_span,
    finish_request_span,
    session_attributes,
    setup_telemetry,
)

logger = logging.getLogger(__name__)

AGENT_NAME = "Strands Travel Planner"
SYSTEM_PROMPT = (
    "You are a travel planner. For each request, check the weather and attractions for the "
    "destination, search flights from the origin, and convert 100 USD into the local "
    "currency when it is not USD. Then give a short, friendly recommendation."
)
WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://strands-weather-agent:8000")
EVENTS_AGENT_URL = os.getenv("EVENTS_AGENT_URL", "http://strands-events-agent:8000")
DESTINATION_CURRENCIES = {
    "paris": "EUR", "london": "GBP", "tokyo": "JPY", "berlin": "EUR", "sydney": "AUD",
    "mumbai": "INR", "toronto": "CAD", "vancouver": "CAD", "rome": "EUR", "barcelona": "EUR",
    "amsterdam": "EUR", "lisbon": "EUR", "bangkok": "THB",
}
MAX_CONVERSATIONS = 500

# FastAPI >= 0.142 adds its own OpenTelemetry spans (e.g. fastapi.endpoint around each handler).
# This service instruments itself, and enrich()/get_current_span() must reach the request span,
# so turn FastAPI's built-in telemetry off. Older FastAPI versions ignore the argument.
app = FastAPI(title=AGENT_NAME, telemetry={"tracing": False, "metrics": False, "logs": False, "operation_spans": False})
setup_telemetry(app)

# conversation_id -> Strands message history (bounded, oldest evicted first)
_histories: "OrderedDict[str, list]" = OrderedDict()


class FaultConfig(BaseModel):
    orchestrator: Optional[str] = Field(None, description="partial_failure or fan_out_timeout")
    weather: Optional[SubAgentFault] = None
    events: Optional[SubAgentFault] = None


class PlanRequest(BaseModel):
    destination: str
    origin: Optional[str] = None
    fault: Optional[FaultConfig] = None
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None
    message: Optional[str] = None


class PlanResponse(BaseModel):
    destination: str
    recommendation: str
    weather: Optional[dict] = None
    events: list = []
    flights: Optional[dict] = None
    currency: Optional[dict] = None
    partial: bool = False
    errors: list = []
    conversation_id: Optional[str] = None


def scripted_answer_for(destination: str):
    def answer(prompt: str, results: dict) -> str:
        parts = [f"Great choice! {destination} looks wonderful."]
        weather = results.get("get_weather", "")
        parts.append(
            "Weather info is temporarily unavailable."
            if weather.startswith("ERROR") or not weather
            else json.loads(weather).get("response", "")
        )
        events = results.get("get_events", "")
        if events and not events.startswith("ERROR"):
            names = [e["name"] for e in json.loads(events).get("events", [])][:3]
            if names:
                parts.append(f"Don't miss: {', '.join(names)}.")
        else:
            parts.append("Attractions are temporarily unavailable.")
        flights = results.get("search_flights", "")
        if flights and not flights.startswith("ERROR"):
            options = json.loads(flights).get("flights", [])
            if options:
                parts.append(f"Flights from ${options[0]['price_usd']} ({options[0]['airline']}).")
        currency = results.get("convert_currency", "")
        if currency and not currency.startswith("ERROR"):
            c = json.loads(currency)
            parts.append(f"$100 USD is about {c['converted']} {c['to_currency']}.")
        return " ".join(p for p in parts if p)

    return answer


@app.get("/health")
async def health():
    return {"status": "healthy", "agent_name": AGENT_NAME}


@app.post("/plan", response_model=PlanResponse)
async def plan(request: PlanRequest):
    destination = request.destination
    origin = request.origin or "Portland"
    currency_code = DESTINATION_CURRENCIES.get(destination.lower(), "EUR")
    fault = request.fault
    timeout = 0.001 if fault and fault.orchestrator == "fan_out_timeout" else 60.0
    errors: list[dict] = []
    gathered: dict = {"events": []}

    def sub_agent_payload(base: dict, sub_fault: Optional[SubAgentFault]) -> dict:
        payload = dict(base)
        if request.conversation_id:
            payload["conversation_id"] = request.conversation_id
        if request.user_id:
            payload["user_id"] = request.user_id
        if sub_fault:
            payload["fault"] = sub_fault.model_dump()
        return payload

    def call_agent(name: str, url: str, payload: dict) -> dict:
        if fault and fault.orchestrator == "partial_failure" and random.random() < 0.5:
            errors.append({"agent": name, "error": "Simulated partial failure"})
            raise RuntimeError(f"Simulated partial failure: skipped the {name} agent")
        logger.info("Asking the %s agent", name)
        try:
            resp = httpx.post(url, json=payload, timeout=timeout)
        except httpx.HTTPError as e:
            logger.error("The %s agent is unreachable: %s", name, e)
            errors.append({"agent": name, "error": str(e) or type(e).__name__})
            raise RuntimeError(f"{name} agent unreachable: {e}") from e
        body = resp.json()
        if resp.status_code != 200:
            logger.error("The %s agent returned %s", name, resp.status_code)
            errors.append({"agent": name, "error": body.get("error", resp.text)})
            raise RuntimeError(f"{name} agent returned {resp.status_code}: {body.get('error', resp.text)}")
        return body

    @tool
    def get_weather(destination: str) -> str:
        """Ask the weather agent for the current weather at the destination."""
        body = call_agent(
            "weather",
            f"{WEATHER_AGENT_URL}/invoke",
            sub_agent_payload({"message": f"What's the weather in {destination}?"}, fault and fault.weather),
        )
        gathered["weather"] = body
        return to_text(body)

    @tool
    def get_events(destination: str) -> str:
        """Ask the events agent for attractions and things to do at the destination."""
        body = call_agent(
            "events",
            f"{EVENTS_AGENT_URL}/events",
            sub_agent_payload({"destination": destination}, fault and fault.events),
        )
        gathered["events"] = body.get("events", [])
        return to_text(body)

    @tool
    def search_flights(origin: str, destination: str) -> str:
        """Search flights between two cities."""
        result = call_mcp_tool("fetch_flights_api", {"origin": origin, "destination": destination})
        gathered["flights"] = result
        return to_text(result)

    @tool
    def convert_currency(amount: float, from_currency: str, to_currency: str) -> str:
        """Convert an amount between currencies using live ECB rates."""
        result = call_mcp_tool(
            "convert_currency", {"amount": amount, "from_currency": from_currency, "to_currency": to_currency}
        )
        gathered["currency"] = result
        return to_text(result)

    def scripted_plan(_prompt: str):
        steps = [
            ("get_weather", {"destination": destination}),
            ("get_events", {"destination": destination}),
            ("search_flights", {"origin": origin, "destination": destination}),
        ]
        if currency_code != "USD":
            steps.append(("convert_currency", {"amount": 100, "from_currency": "USD", "to_currency": currency_code}))
        return steps

    history = list(_histories.get(request.conversation_id, [])) if request.conversation_id else []

    def make_agent(model):
        return Agent(
            name=AGENT_NAME,
            model=model,
            tools=[get_weather, get_events, search_flights, convert_currency],
            system_prompt=SYSTEM_PROMPT,
            messages=list(history),
            trace_attributes=session_attributes(request.conversation_id, request.user_id),
            callback_handler=None,
        )

    prompt = request.message or f"Plan a trip to {destination} from {origin}"
    describe_request_span(AGENT_NAME, prompt, request.conversation_id, request.user_id)
    logger.info("Trip plan requested for %s", destination, extra={"destination": destination})
    text, agent = await run_agent(make_agent, prompt, ScriptedModel(scripted_plan, scripted_answer_for(destination)))

    finish_request_span(text)
    if request.conversation_id:
        _histories[request.conversation_id] = agent.messages
        _histories.move_to_end(request.conversation_id)
        while len(_histories) > MAX_CONVERSATIONS:
            _histories.popitem(last=False)

    if errors:
        logger.warning("Trip plan for %s completed with %d failed sub-agent(s)", destination, len(errors))
    else:
        logger.info("Trip plan for %s completed", destination)
    if errors:
        # Mark the request span, so partial failures show as errors on the root and service map.
        trace.get_current_span().set_status(
            Status(StatusCode.ERROR, f"Partial failure: {len(errors)} sub-agent(s) failed")
        )

    return PlanResponse(
        destination=destination,
        recommendation=text,
        weather=gathered.get("weather"),
        events=gathered["events"],
        flights=gathered.get("flights"),
        currency=gathered.get("currency"),
        partial=bool(errors),
        errors=errors,
        conversation_id=request.conversation_id,
    )
