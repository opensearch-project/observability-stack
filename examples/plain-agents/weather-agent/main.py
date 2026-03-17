#!/usr/bin/env python3
"""
Weather Agent Example - OpenTelemetry Instrumentation

Instrumented with opensearch-genai-observability-sdk-py:
- register() replaces ~30 lines of manual TracerProvider/exporter setup
- @observe decorator + enrich() replace manual span creation + set_attribute() calls

Key features demonstrated:
- OTLP exporter configuration for traces, metrics, and logs
- OTel Gen-AI semantic convention attributes (invoke_agent, execute_tool)
- Structured content capture (system instructions, messages, tool calls)
- Token usage metrics
- Structured logging with trace correlation
"""

from dataclasses import dataclass
import json
import logging
import os
import random
import time
from typing import Dict, Any, List, Optional
from uuid import uuid4

import httpx
from opentelemetry import trace, metrics
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.propagate import inject
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

from opensearch_genai_observability_sdk_py import Op, enrich, observe, register


# Fault injection exceptions
class AgentError(Exception):
    """Base exception for agent errors."""
    def __init__(self, message: str, error_type: str, status_code: int = 500):
        super().__init__(message)
        self.error_type = error_type
        self.status_code = status_code


class ToolTimeoutError(AgentError):
    def __init__(self, message: str):
        super().__init__(message, "timeout", 504)


class ToolExecutionError(AgentError):
    def __init__(self, message: str):
        super().__init__(message, "tool_error", 502)


class RateLimitError(AgentError):
    def __init__(self, message: str):
        super().__init__(message, "rate_limit_exceeded", 429)


@dataclass
class FaultConfig:
    """Configuration for fault injection."""
    type: str
    delay_ms: int = 0
    probability: float = 1.0
    tool: Optional[str] = None


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


def setup_telemetry(
    service_name: str = "weather-agent",
    service_version: str = "1.0.0",
    otlp_endpoint: str = "http://localhost:4317"
) -> tuple:
    """
    Set up telemetry using the SDK for tracing, plus manual setup for metrics and logs.

    The SDK's register() replaces ~30 lines of TracerProvider/exporter config.
    Metrics and logs still use manual OTel setup (SDK handles tracing only).
    """
    # Tracing — one line via SDK
    register(
        endpoint=f"grpc://{otlp_endpoint.replace('http://', '').replace('https://', '')}",
        service_name=service_name,
        service_version=service_version,
    )

    # Metrics — manual setup (SDK handles tracing only)
    # TODO: unify Resource with register() when SDK supports metrics
    resource = Resource.create({
        "service.name": service_name,
        "service.version": service_version,
        "deployment.environment": "development"
    })
    otlp_metric_exporter = OTLPMetricExporter(endpoint=otlp_endpoint, insecure=True)
    metric_reader = PeriodicExportingMetricReader(otlp_metric_exporter, export_interval_millis=2000)
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)
    meter = metrics.get_meter(__name__)

    # Logging — manual setup
    logger_provider = LoggerProvider(resource=resource)
    otlp_log_exporter = OTLPLogExporter(endpoint=otlp_endpoint, insecure=True)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(otlp_log_exporter))
    set_logger_provider(logger_provider)

    handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.INFO)

    logger = logging.getLogger(__name__)

    return meter, logger


# MCP Server configuration
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://mcp-server:8003")
MCP_PROTOCOL_VERSION = "2025-06-18"


# Simulated weather tool
def get_weather(location: str) -> Dict[str, Any]:
    """Simulated weather API call."""
    time.sleep(0.5)
    return {
        "location": location,
        "temperature": "57°F",
        "condition": "rainy",
        "humidity": "85%",
        "wind_speed": "12 mph"
    }


def get_forecast(location: str, days: int = 3) -> Dict[str, Any]:
    """Get weather forecast for a location."""
    time.sleep(0.5)
    forecasts = []
    conditions = ["sunny", "cloudy", "rainy", "partly cloudy"]
    for i in range(days):
        forecasts.append({
            "day": i + 1,
            "high": f"{65 + i * 3}°F",
            "low": f"{45 + i * 2}°F",
            "condition": conditions[i % len(conditions)]
        })
    return {"location": location, "forecast": forecasts}


def get_historical_weather(location: str, date: str) -> Dict[str, Any]:
    """Get historical weather for a location and date."""
    time.sleep(0.5)
    return {
        "location": location,
        "date": date,
        "high": "62°F",
        "low": "48°F",
        "condition": "partly cloudy",
        "precipitation": "0.1 in"
    }


# Simulated LLM call
def call_llm(
    model: str,
    messages: List[Dict[str, str]],
    tools: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Simulated LLM API call that selects appropriate tool based on query."""
    time.sleep(1.0)

    user_message = messages[-1]["content"].lower()
    location = messages[-1]["content"].split()[-1].rstrip("?")

    if any(word in user_message for word in ["forecast", "next", "tomorrow", "week", "upcoming"]):
        tool_name = "get_forecast"
        arguments = {"location": location, "days": 3}
    elif any(word in user_message for word in ["yesterday", "last", "historical", "was", "were", "past"]):
        tool_name = "get_historical_weather"
        arguments = {"location": location, "date": "2026-01-25"}
    else:
        tool_name = "get_current_weather"
        arguments = {"location": location}

    return {
        "id": "chatcmpl-123456",
        "model": "gpt-4-0613",
        "choices": [{
            "message": {
                "role": "assistant",
                "tool_calls": [{
                    "id": "call_abc123",
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": json.dumps(arguments)
                    }
                }]
            },
            "finish_reason": "tool_calls"
        }],
        "usage": {
            "prompt_tokens": 150,
            "completion_tokens": 25,
            "total_tokens": 175
        }
    }


class WeatherAgent:
    """
    AI agent that answers weather questions, instrumented with the GenAI observability SDK.

    Uses @observe decorator and enrich() instead of manual span creation and set_attribute() calls.
    """

    def __init__(self, meter, logger):
        self.meter = meter
        self.logger = logger

        # Agent metadata
        self.agent_id = "asst_weather_001"
        self.agent_name = "Weather Assistant"
        self.agent_description = "Helps users get weather information for any location"
        self.model = random.choice(MODELS)

        # Create metrics
        self.token_counter = meter.create_counter(
            name="gen_ai.client.token.usage",
            description="Number of tokens used in LLM operations",
            unit="token"
        )

        self.operation_duration = meter.create_histogram(
            name="gen_ai.client.operation.duration",
            description="Duration of agent operations",
            unit="s"
        )

        # Available tools
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_current_weather",
                    "description": "Get current weather conditions for a location",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "City name or location"}
                        },
                        "required": ["location"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_forecast",
                    "description": "Get weather forecast for the next several days",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "City name or location"},
                            "days": {"type": "integer", "description": "Number of days (1-7)", "default": 3}
                        },
                        "required": ["location"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_historical_weather",
                    "description": "Get historical weather data for a past date",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "City name or location"},
                            "date": {"type": "string", "description": "Date in YYYY-MM-DD format"}
                        },
                        "required": ["location", "date"]
                    }
                }
            }
        ]

    def _should_inject_fault(self, fault: Optional[FaultConfig]) -> bool:
        if fault is None:
            return False
        return random.random() < fault.probability

    def invoke(self, user_message: str, conversation_id: str, fault: Optional[FaultConfig] = None) -> str:
        """
        Invoke the agent with a user message.

        Uses observe() context manager + enrich() instead of manual span creation.
        """
        start_time = time.time()
        provider = SYSTEMS.get(self.model, "openai")

        system_instructions = [
            {"type": "text", "content": "You are a helpful weather assistant."}
        ]

        input_messages = [
            {"role": "user", "parts": [{"type": "text", "content": user_message}]}
        ]

        # Create invoke_agent span with observe() + enrich()
        with observe(self.agent_name, op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT) as span:
            try:
                # enrich() sets all gen_ai.* attributes in one call
                enrich(
                    model=self.model,
                    provider=provider,
                    agent_id=self.agent_id,
                    agent_description=self.agent_description,
                    session_id=conversation_id,
                    temperature=0.7,
                    max_tokens=1024,
                    system_instructions=json.dumps(system_instructions),
                    tool_definitions=self.tools,
                    input_messages=input_messages,
                )
                # Extra attributes not covered by enrich()
                span.set_attribute("gen_ai.output.type", "text")
                span.set_attribute("server.address", "api.openai.com")
                span.set_attribute("server.port", 443)

                self.logger.info(
                    "Agent invoked",
                    extra={
                        "gen_ai.operation.name": "invoke_agent",
                        "gen_ai.agent.id": self.agent_id,
                        "gen_ai.agent.name": self.agent_name,
                        "gen_ai.conversation.id": conversation_id,
                        "user_message": user_message
                    }
                )

                # Check for pre-LLM faults
                if self._should_inject_fault(fault):
                    if fault.delay_ms:
                        time.sleep(fault.delay_ms / 1000)

                    if fault.type == "rate_limited":
                        span.set_status(Status(StatusCode.ERROR, "Rate limit exceeded"))
                        span.set_attribute("error.type", "rate_limit_exceeded")
                        raise RateLimitError("Rate limit exceeded. Retry after 60 seconds.")

                    if fault.type == "hallucination":
                        hallucinated_response = "The weather is 22°C and sunny with light winds."
                        enrich(
                            response_id=f"chatcmpl-hallucinated-{conversation_id[:8]}",
                            finish_reason="stop",
                            input_tokens=50,
                            output_tokens=20,
                            output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": hallucinated_response}], "finish_reason": "stop"}],
                        )
                        span.set_attribute("gen_ai.response.model", self.model)
                        span.set_status(Status(StatusCode.OK))
                        return hallucinated_response

                # Prepare messages for LLM call
                messages = [
                    {"role": "system", "content": system_instructions[0]["content"]},
                    {"role": "user", "content": user_message}
                ]

                llm_response = call_llm(self.model, messages, self.tools)

                # Check for token_limit_exceeded fault
                if self._should_inject_fault(fault) and fault.type == "token_limit_exceeded":
                    enrich(
                        response_id=llm_response["id"],
                        finish_reason="length",
                        input_tokens=llm_response["usage"]["prompt_tokens"],
                        output_tokens=1024,
                    )
                    span.set_attribute("gen_ai.response.model", llm_response["model"])
                    truncated_response = "The weather in the requested location is currently showing temperatures around—"
                    enrich(output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": truncated_response}], "finish_reason": "length"}])
                    span.set_status(Status(StatusCode.OK))
                    return truncated_response

                # Set response attributes via enrich()
                enrich(
                    response_id=llm_response["id"],
                    finish_reason=llm_response["choices"][0]["finish_reason"],
                    input_tokens=llm_response["usage"]["prompt_tokens"],
                    output_tokens=llm_response["usage"]["completion_tokens"],
                )
                span.set_attribute("gen_ai.response.model", llm_response["model"])

                # Record token usage metrics
                self.token_counter.add(
                    llm_response["usage"]["prompt_tokens"],
                    attributes={
                        "gen_ai.operation.name": "invoke_agent",
                        "gen_ai.provider.name": "openai",
                        "gen_ai.request.model": self.model,
                        "gen_ai.response.model": llm_response["model"],
                        "gen_ai.token.type": "input",
                        "server.address": "api.openai.com"
                    }
                )
                self.token_counter.add(
                    llm_response["usage"]["completion_tokens"],
                    attributes={
                        "gen_ai.operation.name": "invoke_agent",
                        "gen_ai.provider.name": "openai",
                        "gen_ai.request.model": self.model,
                        "gen_ai.response.model": llm_response["model"],
                        "gen_ai.token.type": "output",
                        "server.address": "api.openai.com"
                    }
                )

                # Execute tool if requested
                tool_call = llm_response["choices"][0]["message"].get("tool_calls", [None])[0]
                tool_call_id = tool_call["id"] if tool_call else None

                if tool_call:
                    tool_name = tool_call["function"]["name"]
                    tool_args = json.loads(tool_call["function"]["arguments"])

                    # wrong_tool fault: swap the tool being called
                    if self._should_inject_fault(fault) and fault.type == "wrong_tool":
                        wrong_tools = {"get_current_weather": "get_forecast", "get_forecast": "get_historical_weather", "get_historical_weather": "get_current_weather"}
                        tool_name = wrong_tools.get(tool_name, tool_name)
                        if tool_name == "get_historical_weather":
                            tool_args["date"] = "2026-01-25"

                    tool_result = self.execute_tool(tool_name, tool_args, tool_call_id, fault)

                    # Generate final response based on tool result
                    if "temperature" in tool_result:
                        final_response = f"The weather in {tool_result['location']} is {tool_result['condition']} with a temperature of {tool_result['temperature']}."
                    elif "forecast" in tool_result:
                        days = tool_result["forecast"]
                        final_response = f"Forecast for {tool_result['location']}: Day 1: {days[0]['condition']}, high {days[0]['high']}."
                    elif "date" in tool_result:
                        final_response = f"On {tool_result['date']} in {tool_result['location']}: {tool_result['condition']}, high {tool_result['high']}."
                    else:
                        final_response = f"Weather data for {tool_result.get('location', 'unknown')}: {tool_result}"
                else:
                    final_response = "I couldn't determine what you're asking about."

                # Record output messages via enrich()
                enrich(output_messages=[
                    {"role": "assistant", "parts": [{"type": "text", "content": final_response}], "finish_reason": "stop"}
                ])

                self.logger.info(
                    "Agent invocation completed",
                    extra={
                        "gen_ai.operation.name": "invoke_agent",
                        "gen_ai.agent.id": self.agent_id,
                        "gen_ai.response.id": llm_response["id"],
                        "gen_ai.conversation.id": conversation_id,
                        "response": final_response
                    }
                )

                duration = time.time() - start_time
                self.operation_duration.record(
                    duration,
                    attributes={
                        "gen_ai.operation.name": "invoke_agent",
                        "gen_ai.provider.name": "openai",
                        "gen_ai.request.model": self.model,
                        "gen_ai.response.model": llm_response["model"],
                        "server.address": "api.openai.com"
                    }
                )

                span.set_status(Status(StatusCode.OK))
                return final_response

            except Exception as e:
                self.logger.error(
                    f"Agent invocation failed: {str(e)}",
                    extra={
                        "gen_ai.operation.name": "invoke_agent",
                        "gen_ai.agent.id": self.agent_id,
                        "gen_ai.conversation.id": conversation_id,
                        "error": str(e)
                    }
                )
                span.set_attribute("error.type", type(e).__name__)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                span.record_exception(e)
                raise

    def _call_mcp_tool(self, tool_name: str, arguments: dict, session_id: str) -> dict:
        """Call MCP server with proper CLIENT span and trace propagation."""
        request_id = uuid4().hex[:8]

        # Use observe() for the MCP span, with MCP-specific attributes set manually
        with observe(f"tools/call {tool_name}", kind=SpanKind.CLIENT) as span:
            span.set_attribute("mcp.method.name", "tools/call")
            span.set_attribute("mcp.session.id", session_id)
            span.set_attribute("mcp.protocol.version", MCP_PROTOCOL_VERSION)
            span.set_attribute("jsonrpc.request.id", request_id)
            span.set_attribute("gen_ai.operation.name", "execute_tool")
            span.set_attribute("gen_ai.tool.name", tool_name)
            span.set_attribute("network.transport", "tcp")
            span.set_attribute("network.protocol.name", "http")

            headers = {"mcp-session-id": session_id}
            inject(headers)
            payload = {
                "jsonrpc": "2.0", "method": "tools/call", "id": request_id,
                "params": {"name": tool_name, "arguments": arguments}
            }
            resp = httpx.post(f"{MCP_SERVER_URL}/mcp", json=payload, headers=headers, timeout=30)
            data = resp.json()
            if "error" in data:
                raise ToolExecutionError(data["error"].get("message", "MCP tool error"))
            return data.get("result", {})

    def execute_tool(self, tool_name: str, arguments: Dict[str, Any], tool_call_id: str = None, fault: Optional[FaultConfig] = None) -> Dict[str, Any]:
        """
        Execute a tool with proper instrumentation.

        Uses observe() context manager + enrich() for the execute_tool span.
        """
        with observe(tool_name, op=Op.EXECUTE_TOOL) as span:
            try:
                # Set tool-specific attributes
                span.set_attribute("gen_ai.tool.type", "function")
                if tool_call_id:
                    span.set_attribute("gen_ai.tool.call.id", tool_call_id)

                tool_def = next((t for t in self.tools if t["function"]["name"] == tool_name), None)
                if tool_def:
                    span.set_attribute("gen_ai.tool.description", tool_def["function"]["description"])
                span.set_attribute("gen_ai.tool.call.arguments", json.dumps(arguments))

                # Check for fault injection
                if self._should_inject_fault(fault) and fault.type in ("tool_timeout", "tool_error", "high_latency"):
                    target_tool = fault.tool or tool_name
                    if target_tool == tool_name:
                        if fault.delay_ms:
                            time.sleep(fault.delay_ms / 1000)
                        if fault.type == "tool_timeout":
                            span.set_status(Status(StatusCode.ERROR, "Tool execution timed out"))
                            raise ToolTimeoutError(f"Tool '{tool_name}' timed out after 30000ms")
                        if fault.type == "tool_error":
                            span.set_status(Status(StatusCode.ERROR, "Tool execution failed"))
                            raise ToolExecutionError(f"Tool '{tool_name}' failed: External API returned 503")

                self.logger.info(f"Executing tool: {tool_name}")

                # Route to MCP server for weather API calls, local for others
                session_id = uuid4().hex
                if tool_name in ("get_current_weather", "get_weather"):
                    result = self._call_mcp_tool("fetch_weather_api", {"location": arguments["location"]}, session_id)
                elif tool_name == "get_forecast":
                    with observe(f"local_tool {tool_name}") as local_span:
                        local_span.set_attribute("gen_ai.tool.name", tool_name)
                        local_span.set_attribute("tool.source", "local")
                        result = get_forecast(arguments["location"], arguments.get("days", 3))
                elif tool_name == "get_historical_weather":
                    with observe(f"local_tool {tool_name}") as local_span:
                        local_span.set_attribute("gen_ai.tool.name", tool_name)
                        local_span.set_attribute("tool.source", "local")
                        result = get_historical_weather(arguments["location"], arguments.get("date", "2026-01-01"))
                else:
                    raise ValueError(f"Unknown tool: {tool_name}")

                span.set_attribute("gen_ai.tool.call.result", json.dumps(result))
                span.set_status(Status(StatusCode.OK))
                return result

            except Exception as e:
                self.logger.error(f"Tool execution failed: {tool_name} - {str(e)}")
                span.set_attribute("error.type", type(e).__name__)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                span.record_exception(e)
                raise


def main():
    """Main function demonstrating agent usage with SDK instrumentation."""
    print("Weather Agent Example - SDK Instrumentation")
    print("=" * 60)
    print()

    print("Setting up telemetry (SDK + metrics + logs)...")
    meter, logger = setup_telemetry(
        service_name="weather-agent",
        service_version="1.0.0",
        otlp_endpoint="http://localhost:4317"
    )
    print("Telemetry configured")
    print()

    print("Creating Weather Agent...")
    agent = WeatherAgent(meter, logger)
    print(f"Agent created: {agent.agent_name} (ID: {agent.agent_id})")
    print()

    conversation_id = "conv_example_001"
    user_message = "What's the weather in Paris?"

    print(f"User: {user_message}")
    print()

    print("Invoking agent...")
    response = agent.invoke(user_message, conversation_id)
    print(f"Agent: {response}")
    print()

    print("Waiting for telemetry export...")
    time.sleep(3)
    print("Telemetry exported to Observability Stack")
    print()

    print("=" * 60)
    print("Example complete!")
    print()
    print("View telemetry data:")
    print("  - OpenSearch Dashboards: http://localhost:5601")
    print("  - Prometheus: http://localhost:9090")
    print()


if __name__ == "__main__":
    main()
