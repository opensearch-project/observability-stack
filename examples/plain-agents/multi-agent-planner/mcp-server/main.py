#!/usr/bin/env python3
"""
MCP Server - Provides low-level tools via MCP protocol.
Sub-agents call this server to execute actual tool logic.

Uses real free APIs (no API keys required):
- Open-Meteo for weather (geocoding + forecast)
- Wikipedia for attractions/points of interest
- Frankfurter for currency conversion
- Mock data for flights (no free flight API exists)
"""

import os
import random
import time
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.propagate import extract
from pydantic import BaseModel
from typing import Optional

MCP_PROTOCOL_VERSION = "2025-06-18"

TOOLS = {
    "fetch_weather_api": {
        "description": "Fetch current weather from Open-Meteo API (real data)",
        "parameters": {"type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"]}
    },
    "fetch_events_api": {
        "description": "Fetch attractions and points of interest from Wikipedia (real data)",
        "parameters": {"type": "object", "properties": {"destination": {"type": "string"}}, "required": ["destination"]}
    },
    "fetch_flights_api": {
        "description": "Search for flights between two cities (simulated realistic data)",
        "parameters": {
            "type": "object",
            "properties": {
                "origin": {"type": "string"},
                "destination": {"type": "string"},
                "date": {"type": "string", "description": "Travel date YYYY-MM-DD"}
            },
            "required": ["origin", "destination"]
        }
    },
    "convert_currency": {
        "description": "Convert amount between currencies using live ECB exchange rates via Frankfurter API",
        "parameters": {
            "type": "object",
            "properties": {
                "amount": {"type": "number"},
                "from_currency": {"type": "string", "description": "ISO 4217 code e.g. USD"},
                "to_currency": {"type": "string", "description": "ISO 4217 code e.g. EUR"}
            },
            "required": ["amount", "from_currency", "to_currency"]
        }
    }
}

WMO_WEATHER_CODES = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "foggy", 48: "depositing rime fog",
    51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
    61: "slight rain", 63: "moderate rain", 65: "heavy rain",
    71: "slight snow", 73: "moderate snow", 75: "heavy snow",
    80: "slight rain showers", 81: "moderate rain showers", 82: "violent rain showers",
    85: "slight snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with slight hail", 99: "thunderstorm with heavy hail",
}

AIRLINES = ["United", "Delta", "Alaska", "Southwest", "JetBlue", "American", "Spirit", "Frontier"]

_geocode_cache: dict[str, tuple[float, float, str]] = {}


def setup_telemetry():
    resource = Resource.create({"service.name": "mcp-server", "service.version": "1.0.0"})
    provider = TracerProvider(resource=resource)
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True)))
    trace.set_tracer_provider(provider)
    return trace.get_tracer("mcp-server")


tracer = setup_telemetry()
inner_app = FastAPI(title="MCP Server", version="1.0.0")


class ToolCallRequest(BaseModel):
    jsonrpc: str = "2.0"
    method: str = "tools/call"
    id: Optional[str] = None
    params: dict


@inner_app.get("/health")
async def health():
    return {"status": "healthy", "protocol_version": MCP_PROTOCOL_VERSION, "tools": list(TOOLS.keys())}


@inner_app.post("/mcp")
async def handle_mcp(request: Request, body: ToolCallRequest):
    """Handle MCP JSON-RPC requests."""
    ctx = extract(request.headers)
    session_id = request.headers.get("mcp-session-id", uuid4().hex)
    request_id = body.id or str(uuid4().hex[:8])
    tool_name = body.params.get("name", "unknown")
    arguments = body.params.get("arguments", {})

    with tracer.start_as_current_span(
        f"tools/call {tool_name}",
        context=ctx,
        kind=SpanKind.SERVER,
        attributes={
            "mcp.method.name": "tools/call",
            "mcp.session.id": session_id,
            "mcp.protocol.version": MCP_PROTOCOL_VERSION,
            "jsonrpc.request.id": request_id,
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": tool_name,
            "network.transport": "tcp",
            "network.protocol.name": "http",
        },
    ) as mcp_span:
        with tracer.start_as_current_span(
            f"tool_call {tool_name}",
            kind=SpanKind.INTERNAL,
            attributes={
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.tool.name": tool_name,
                "gen_ai.tool.call.id": f"call_{uuid4().hex[:8]}",
            },
        ) as tool_span:
            try:
                result = await execute_tool(tool_name, arguments, tool_span)
                return {"jsonrpc": "2.0", "id": request_id, "result": result}
            except Exception as e:
                tool_span.set_status(Status(StatusCode.ERROR, str(e)))
                mcp_span.set_status(Status(StatusCode.ERROR, str(e)))
                return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": str(e)}}


async def geocode_city(city: str) -> tuple[float, float, str]:
    """Resolve city name to lat/lon using Open-Meteo geocoding API."""
    cache_key = city.lower().strip()
    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]

    with tracer.start_as_current_span(
        "geocode",
        kind=SpanKind.CLIENT,
        attributes={"geocode.query": city},
    ) as span:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": "en", "format": "json"},
            )
            data = resp.json()
            results = data.get("results", [])
            if not results:
                raise ValueError(f"Could not geocode city: {city}")
            lat = results[0]["latitude"]
            lon = results[0]["longitude"]
            resolved_name = results[0].get("name", city)
            span.set_attribute("geocode.lat", lat)
            span.set_attribute("geocode.lon", lon)
            span.set_attribute("geocode.resolved_name", resolved_name)
            _geocode_cache[cache_key] = (lat, lon, resolved_name)
            return lat, lon, resolved_name


async def fetch_weather(location: str) -> dict:
    """Fetch real weather from Open-Meteo API."""
    lat, lon, resolved_name = await geocode_city(location)

    with tracer.start_as_current_span(
        "open-meteo forecast",
        kind=SpanKind.CLIENT,
        attributes={"http.url.path": "/v1/forecast", "weather.location": resolved_name},
    ):
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current_weather": "true",
                    "temperature_unit": "fahrenheit",
                    "windspeed_unit": "mph",
                },
            )
            data = resp.json()
            current = data.get("current_weather", {})
            weather_code = current.get("weathercode", 0)
            condition = WMO_WEATHER_CODES.get(weather_code, "unknown")

            return {
                "location": resolved_name,
                "temperature": f"{current.get('temperature', 'N/A')}°F",
                "condition": condition,
                "wind_speed": f"{current.get('windspeed', 'N/A')} mph",
                "wind_direction": f"{current.get('winddirection', 'N/A')}°",
                "source": "open-meteo",
            }


async def fetch_attractions(destination: str) -> dict:
    """Fetch real attractions from Wikipedia API."""
    with tracer.start_as_current_span(
        "wikipedia search",
        kind=SpanKind.CLIENT,
        attributes={"wikipedia.query": destination},
    ):
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            # Get city summary
            resp = await client.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{destination}",
                headers={"User-Agent": "ObservabilityStackDemo/1.0"},
            )
            summary = ""
            if resp.status_code == 200:
                summary = resp.json().get("extract", "")

            # Search for attractions
            search_resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": f"{destination} tourist attractions landmarks",
                    "srlimit": 5,
                    "format": "json",
                },
                headers={"User-Agent": "ObservabilityStackDemo/1.0"},
            )
            events = []
            if search_resp.status_code == 200:
                search_data = search_resp.json()
                results = search_data.get("query", {}).get("search", [])
                for r in results:
                    title = r.get("title", "")
                    snippet = r.get("snippet", "").replace('<span class="searchmatch">', "").replace("</span>", "")
                    events.append({
                        "name": title,
                        "type": "attraction",
                        "venue": destination,
                        "description": snippet[:150],
                    })

            return {
                "destination": destination,
                "summary": summary[:300] if summary else f"Explore {destination}",
                "events": events if events else [{"name": f"{destination} City Tour", "type": "tour", "venue": destination}],
                "source": "wikipedia",
            }


async def fetch_flights(origin: str, destination: str, date: str = None) -> dict:
    """Generate realistic mock flight data (no free flight API exists)."""
    num_flights = random.randint(2, 4)
    flights = []
    for i in range(num_flights):
        dep_hour = random.randint(6, 20)
        duration_min = random.randint(45, 320)
        arr_hour = dep_hour + duration_min // 60
        price = random.randint(89, 650)
        flights.append({
            "airline": random.choice(AIRLINES),
            "departure": f"{dep_hour:02d}:{random.randint(0,59):02d}",
            "arrival": f"{arr_hour % 24:02d}:{random.randint(0,59):02d}",
            "duration_minutes": duration_min,
            "price_usd": price,
            "stops": random.choice([0, 0, 0, 1, 1, 2]),
        })
    flights.sort(key=lambda f: f["price_usd"])

    return {
        "origin": origin,
        "destination": destination,
        "date": date or "flexible",
        "flights": flights,
        "source": "simulated",
    }


async def convert_currency_api(amount: float, from_currency: str, to_currency: str) -> dict:
    """Convert currency using Frankfurter API (real ECB exchange rates)."""
    with tracer.start_as_current_span(
        "frankfurter exchange",
        kind=SpanKind.CLIENT,
        attributes={
            "currency.from": from_currency,
            "currency.to": to_currency,
            "currency.amount": amount,
        },
    ):
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://api.frankfurter.app/latest",
                params={"from": from_currency.upper(), "to": to_currency.upper(), "amount": amount},
            )
            data = resp.json()
            converted = data.get("rates", {}).get(to_currency.upper(), 0)
            return {
                "amount": amount,
                "from_currency": from_currency.upper(),
                "to_currency": to_currency.upper(),
                "converted": converted,
                "rate": converted / amount if amount else 0,
                "date": data.get("date", "unknown"),
                "source": "frankfurter",
            }


def _fallback_weather(location: str) -> dict:
    """Fallback mock weather when API is unreachable."""
    temp = random.randint(50, 90)
    condition = random.choice(["sunny", "cloudy", "rainy", "partly cloudy"])
    return {
        "location": location,
        "temperature": f"{temp}°F",
        "condition": condition,
        "wind_speed": f"{random.randint(0, 25)} mph",
        "source": "fallback",
    }


def _fallback_attractions(destination: str) -> dict:
    """Fallback mock attractions when Wikipedia is unreachable."""
    events = [
        {"name": f"{destination} City Tour", "type": "tour", "venue": destination},
        {"name": f"{destination} Food Festival", "type": "food", "venue": destination},
        {"name": f"Live Music in {destination}", "type": "music", "venue": destination},
    ]
    return {"destination": destination, "events": random.sample(events, k=random.randint(1, 3)), "source": "fallback"}


def _fallback_currency(amount: float, from_currency: str, to_currency: str) -> dict:
    """Fallback with approximate rates when Frankfurter is unreachable."""
    approx_rates = {"EUR": 0.92, "GBP": 0.79, "JPY": 155.0, "CAD": 1.36, "AUD": 1.53, "INR": 83.5}
    rate = approx_rates.get(to_currency.upper(), 1.0)
    if from_currency.upper() != "USD":
        from_rate = approx_rates.get(from_currency.upper(), 1.0)
        rate = rate / from_rate
    return {
        "amount": amount,
        "from_currency": from_currency.upper(),
        "to_currency": to_currency.upper(),
        "converted": round(amount * rate, 2),
        "rate": rate,
        "date": "approximate",
        "source": "fallback",
    }


async def execute_tool(name: str, args: dict, span) -> dict:
    """Execute tool with real API, falling back to mock on failure."""
    if name == "fetch_weather_api":
        location = args.get("location", "Unknown")
        try:
            result = await fetch_weather(location)
        except Exception as e:
            span.set_attribute("tool.fallback", True)
            span.set_attribute("tool.fallback.reason", str(e)[:200])
            result = _fallback_weather(location)
        return result

    elif name == "fetch_events_api":
        destination = args.get("destination", "Unknown")
        try:
            result = await fetch_attractions(destination)
        except Exception as e:
            span.set_attribute("tool.fallback", True)
            span.set_attribute("tool.fallback.reason", str(e)[:200])
            result = _fallback_attractions(destination)
        return result

    elif name == "fetch_flights_api":
        origin = args.get("origin", "Unknown")
        destination = args.get("destination", "Unknown")
        date = args.get("date")
        result = await fetch_flights(origin, destination, date)
        return result

    elif name == "convert_currency":
        amount = args.get("amount", 100)
        from_currency = args.get("from_currency", "USD")
        to_currency = args.get("to_currency", "EUR")
        try:
            result = await convert_currency_api(amount, from_currency, to_currency)
        except Exception as e:
            span.set_attribute("tool.fallback", True)
            span.set_attribute("tool.fallback.reason", str(e)[:200])
            result = _fallback_currency(amount, from_currency, to_currency)
        return result

    else:
        raise ValueError(f"Unknown tool: {name}")


app = OpenTelemetryMiddleware(inner_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
