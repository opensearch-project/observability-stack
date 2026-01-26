#!/usr/bin/env python3
"""
Weather Agent Example - OpenTelemetry Instrumentation

This example demonstrates how to instrument an AI agent application with OpenTelemetry
to send telemetry data to the AgentOps observability stack using OTLP protocol.

Key features demonstrated:
- OTLP exporter configuration for traces, metrics, and logs
- OTel Gen-AI semantic convention attributes (invoke_agent, execute_tool)
- Structured content capture (system instructions, messages, tool calls)
- Token usage metrics
- Structured logging with trace correlation

References:
- OpenTelemetry GenAI Semantic Conventions:
  https://github.com/open-telemetry/semantic-conventions/tree/e126ea9105b15912ccd80deab98929025189b696/docs/gen-ai
- Agent spans: gen-ai-agent-spans.md
- Tool execution: gen-ai-spans.md#execute-tool-span
- Input/output message schemas: gen-ai-input-messages.json, gen-ai-output-messages.json
- System instructions schema: gen-ai-system-instructions.json
"""

import json
import logging
import time
from typing import Dict, Any, List
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry._logs import set_logger_provider
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.trace import Status, StatusCode


# Configure OpenTelemetry with OTLP exporters
def setup_telemetry(
    service_name: str = "weather-agent",
    service_version: str = "1.0.0",
    otlp_endpoint: str = "http://localhost:4317"
) -> tuple:
    """
    Set up OpenTelemetry with OTLP exporters for traces, metrics, and logs.
    
    Args:
        service_name: Name of the service/agent
        service_version: Version of the service
        otlp_endpoint: OTLP collector endpoint (gRPC)
    
    Returns:
        Tuple of (tracer, meter, logger)
    """
    # Create resource with service information
    resource = Resource.create({
        "service.name": service_name,
        "service.version": service_version,
        "deployment.environment": "development"
    })
    
    # Set up tracing
    trace_provider = TracerProvider(resource=resource)
    otlp_trace_exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
    trace_provider.add_span_processor(BatchSpanProcessor(otlp_trace_exporter))
    trace.set_tracer_provider(trace_provider)
    tracer = trace.get_tracer(__name__)
    
    # Set up metrics
    otlp_metric_exporter = OTLPMetricExporter(endpoint=otlp_endpoint, insecure=True)
    # Export metrics every 2 seconds for faster demo feedback
    metric_reader = PeriodicExportingMetricReader(otlp_metric_exporter, export_interval_millis=2000)
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)
    meter = metrics.get_meter(__name__)
    
    # Set up logging
    logger_provider = LoggerProvider(resource=resource)
    otlp_log_exporter = OTLPLogExporter(endpoint=otlp_endpoint, insecure=True)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(otlp_log_exporter))
    set_logger_provider(logger_provider)
    
    # Configure Python logging to use OpenTelemetry
    handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.INFO)
    
    logger = logging.getLogger(__name__)
    
    return tracer, meter, logger


# Simulated weather tool
def get_weather(location: str) -> Dict[str, Any]:
    """
    Simulated weather API call.
    
    Args:
        location: Location to get weather for
    
    Returns:
        Weather data dictionary
    """
    # Simulate API latency
    time.sleep(0.5)
    
    # Return mock weather data
    return {
        "location": location,
        "temperature": "57°F",
        "condition": "rainy",
        "humidity": "85%",
        "wind_speed": "12 mph"
    }


# Simulated LLM call
def call_llm(
    model: str,
    messages: List[Dict[str, str]],
    tools: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Simulated LLM API call.
    
    Args:
        model: Model name to use
        messages: Chat messages
        tools: Available tools
    
    Returns:
        LLM response with tool call
    """
    # Simulate LLM latency
    time.sleep(1.0)
    
    # Return mock response with tool call
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
                        "name": "get_weather",
                        "arguments": json.dumps({"location": messages[-1]["content"].split()[-1].rstrip("?")})
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
    Example AI agent that answers weather questions using OpenTelemetry instrumentation.
    
    This agent demonstrates:
    - invoke_agent spans for agent invocations
    - execute_tool spans for tool executions
    - Gen-AI semantic convention attributes
    - Custom agent context attributes
    - Structured logging with trace correlation
    """
    
    def __init__(self, tracer, meter, logger):
        self.tracer = tracer
        self.meter = meter
        self.logger = logger
        
        # Agent metadata
        self.agent_id = "asst_weather_001"
        self.agent_name = "Weather Assistant"
        self.agent_description = "Helps users get weather information for any location"
        self.model = "gpt-4"
        
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
                    "name": "get_weather",
                    "description": "Get current weather for a location",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {
                                "type": "string",
                                "description": "City name or location"
                            }
                        },
                        "required": ["location"]
                    }
                }
            }
        ]
    
    def invoke(self, user_message: str, conversation_id: str) -> str:
        """
        Invoke the agent with a user message.
        
        This method creates an invoke_agent span following gen-ai semantic conventions.
        
        Args:
            user_message: User's question
            conversation_id: Conversation/session identifier
        
        Returns:
            Agent's response
        """
        start_time = time.time()
        
        # System instructions (separate from chat history per spec)
        system_instructions = [
            {"type": "text", "content": "You are a helpful weather assistant."}
        ]
        
        # Create invoke_agent span with gen-ai semantic conventions
        with self.tracer.start_as_current_span(
            f"invoke_agent {self.agent_name}",
            kind=trace.SpanKind.CLIENT
        ) as span:
            try:
                # Required attributes
                span.set_attribute("gen_ai.operation.name", "invoke_agent")
                span.set_attribute("gen_ai.provider.name", "openai")
                
                # Conditionally required attributes
                span.set_attribute("gen_ai.agent.id", self.agent_id)
                span.set_attribute("gen_ai.agent.name", self.agent_name)
                span.set_attribute("gen_ai.agent.description", self.agent_description)
                span.set_attribute("gen_ai.conversation.id", conversation_id)
                span.set_attribute("gen_ai.request.model", self.model)
                span.set_attribute("gen_ai.output.type", "text")
                
                # Recommended attributes
                span.set_attribute("gen_ai.request.temperature", 0.7)
                span.set_attribute("gen_ai.request.max_tokens", 1024)
                span.set_attribute("server.address", "api.openai.com")
                span.set_attribute("server.port", 443)
                
                # Opt-in attributes (content capture)
                # See schema definitions: https://github.com/open-telemetry/semantic-conventions/tree/e126ea9105b15912ccd80deab98929025189b696/docs/gen-ai
                span.set_attribute("gen_ai.system_instructions", json.dumps(system_instructions))
                span.set_attribute("gen_ai.tool.definitions", json.dumps(self.tools))
                
                # Structured logging with trace correlation
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
                
                # Prepare input messages following gen-ai-input-messages.json schema
                # See: https://github.com/open-telemetry/semantic-conventions/tree/e126ea9105b15912ccd80deab98929025189b696/docs/gen-ai
                input_messages = [
                    {
                        "role": "user",
                        "parts": [{"type": "text", "content": user_message}]
                    }
                ]
                
                # Opt-in: Record input messages as attribute
                span.set_attribute("gen_ai.input.messages", json.dumps(input_messages))
                
                # Prepare messages for LLM call (internal format)
                messages = [
                    {"role": "system", "content": system_instructions[0]["content"]},
                    {"role": "user", "content": user_message}
                ]
                
                # Call LLM
                llm_response = call_llm(self.model, messages, self.tools)
                
                # Recommended response attributes
                span.set_attribute("gen_ai.response.model", llm_response["model"])
                span.set_attribute("gen_ai.response.id", llm_response["id"])
                span.set_attribute("gen_ai.response.finish_reasons", [llm_response["choices"][0]["finish_reason"]])
                span.set_attribute("gen_ai.usage.input_tokens", llm_response["usage"]["prompt_tokens"])
                span.set_attribute("gen_ai.usage.output_tokens", llm_response["usage"]["completion_tokens"])
                
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
                    tool_result = self.execute_tool(
                        tool_call["function"]["name"],
                        json.loads(tool_call["function"]["arguments"]),
                        tool_call_id
                    )
                    
                    # Generate final response
                    final_response = f"The weather in {tool_result['location']} is {tool_result['condition']} with a temperature of {tool_result['temperature']}."
                else:
                    final_response = "I couldn't determine what you're asking about."
                
                # Opt-in: Record output messages following gen-ai-output-messages.json schema
                # See: https://github.com/open-telemetry/semantic-conventions/tree/e126ea9105b15912ccd80deab98929025189b696/docs/gen-ai
                output_messages = [
                    {
                        "role": "assistant",
                        "parts": [{"type": "text", "content": final_response}],
                        "finish_reason": "stop"
                    }
                ]
                span.set_attribute("gen_ai.output.messages", json.dumps(output_messages))
                
                # Log successful completion
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
                
                # Record operation duration
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
                # Log error
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
    
    def execute_tool(self, tool_name: str, arguments: Dict[str, Any], tool_call_id: str = None) -> Dict[str, Any]:
        """
        Execute a tool with proper instrumentation.
        
        This method creates an execute_tool span following gen-ai semantic conventions.
        
        Args:
            tool_name: Name of the tool to execute
            arguments: Tool arguments
            tool_call_id: The tool call identifier from the LLM response
        
        Returns:
            Tool execution result
        """
        # Create execute_tool span with gen-ai semantic conventions
        with self.tracer.start_as_current_span(
            f"execute_tool {tool_name}",
            kind=trace.SpanKind.INTERNAL
        ) as span:
            try:
                # Required attribute
                span.set_attribute("gen_ai.operation.name", "execute_tool")
                
                # Recommended attributes
                span.set_attribute("gen_ai.tool.name", tool_name)
                span.set_attribute("gen_ai.tool.type", "function")
                if tool_call_id:
                    span.set_attribute("gen_ai.tool.call.id", tool_call_id)
                
                # Find tool description
                tool_def = next((t for t in self.tools if t["function"]["name"] == tool_name), None)
                if tool_def:
                    span.set_attribute("gen_ai.tool.description", tool_def["function"]["description"])
                
                # Opt-in: Record tool call arguments
                span.set_attribute("gen_ai.tool.call.arguments", json.dumps(arguments))
                
                # Log tool execution start
                self.logger.info(
                    f"Executing tool: {tool_name}",
                    extra={
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.tool.name": tool_name,
                        "gen_ai.tool.call.id": tool_call_id,
                        "gen_ai.tool.call.arguments": json.dumps(arguments)
                    }
                )
                
                # Execute the actual tool
                if tool_name == "get_weather":
                    result = get_weather(arguments["location"])
                else:
                    raise ValueError(f"Unknown tool: {tool_name}")
                
                # Opt-in: Record tool call result
                span.set_attribute("gen_ai.tool.call.result", json.dumps(result))
                
                # Log tool execution completion
                self.logger.info(
                    f"Tool execution completed: {tool_name}",
                    extra={
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.tool.name": tool_name,
                        "gen_ai.tool.call.id": tool_call_id,
                        "gen_ai.tool.call.result": json.dumps(result)
                    }
                )
                
                span.set_status(Status(StatusCode.OK))
                return result
                
            except Exception as e:
                # Log error
                self.logger.error(
                    f"Tool execution failed: {tool_name} - {str(e)}",
                    extra={
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.tool.name": tool_name,
                        "error": str(e)
                    }
                )
                span.set_attribute("error.type", type(e).__name__)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                span.record_exception(e)
                raise


def main():
    """
    Main function demonstrating agent usage with OpenTelemetry instrumentation.
    """
    print("Weather Agent Example - OpenTelemetry Instrumentation")
    print("=" * 60)
    print()
    
    # Set up OpenTelemetry
    print("Setting up OpenTelemetry with OTLP exporters...")
    tracer, meter, logger = setup_telemetry(
        service_name="weather-agent",
        service_version="1.0.0",
        otlp_endpoint="http://localhost:4317"
    )
    print("✓ OpenTelemetry configured")
    print()
    
    # Create agent
    print("Creating Weather Agent...")
    agent = WeatherAgent(tracer, meter, logger)
    print(f"✓ Agent created: {agent.agent_name} (ID: {agent.agent_id})")
    print()
    
    # Example conversation
    conversation_id = "conv_example_001"
    user_message = "What's the weather in Paris?"
    
    print(f"User: {user_message}")
    print()
    
    # Invoke agent
    print("Invoking agent...")
    response = agent.invoke(user_message, conversation_id)
    print(f"Agent: {response}")
    print()
    
    # Give time for telemetry to be exported
    # Metrics export every 2 seconds, so wait at least 3 seconds
    print("Waiting for telemetry export...")
    time.sleep(3)
    print("✓ Telemetry exported to AgentOps stack")
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
