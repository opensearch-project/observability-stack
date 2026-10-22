"""OpenTelemetry setup shared by the Strands travel planner services.

Strands emits the GenAI spans (invoke_agent, chat, execute_tool) itself. This module adds
what a real service needs around them:

- an OTLP exporter for those spans and Strands' metrics
- FastAPI server spans and httpx client spans, so each turn is one trace across services
  and the APM service map shows the service-to-service calls
- OTLP logs from Python logging, each carrying the active trace and span ids, for
  trace-to-logs correlation
"""

import json
import logging
import os

from opentelemetry import trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from strands.telemetry import StrandsTelemetry


def setup_telemetry(app) -> None:
    """Export Strands spans and metrics over OTLP and instrument the FastAPI app."""
    # Message content as span attributes in the latest GenAI conventions
    # (gen_ai.input.messages / gen_ai.output.messages), which Agent Traces reads.
    os.environ.setdefault(
        "OTEL_SEMCONV_STABILITY_OPT_IN",
        "gen_ai_latest_experimental,gen_ai_tool_definitions,gen_ai_span_attributes_only",
    )
    telemetry = StrandsTelemetry()
    telemetry.setup_otlp_exporter()
    telemetry.setup_meter(enable_otlp_exporter=True)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
    HTTPXClientInstrumentor().instrument()
    setup_logs()


def setup_logs() -> None:
    """Send Python logging over OTLP gRPC (OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, OTEL_SERVICE_NAME).

    A log written inside a span carries its trace and span ids, so Agent Traces and Explore
    traces list it under the trace (trace-to-logs correlation).
    """
    provider = LoggerProvider(resource=Resource.create())
    provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter(insecure=True)))
    set_logger_provider(provider)
    handler = LoggingHandler(level=logging.INFO, logger_provider=provider)
    # The SDK's own warnings (e.g. export retries) stay local instead of being exported.
    handler.addFilter(lambda record: not record.name.startswith("opentelemetry"))
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def session_attributes(conversation_id: str | None, user_id: str | None = None) -> dict:
    """Trace attributes that Strands copies onto every span of an agent run.

    Strands applies an agent's trace_attributes to its invoke_agent, chat, execute_tool and
    event loop spans, so tool spans carry the session too (allowed on execute_tool by
    OTel GenAI semconv, semantic-conventions-genai#518). Per the conventions, nothing is
    set when the caller has no conversation id: no UUID, trace id or hash as a fallback.
    """
    attributes: dict = {}
    if conversation_id:
        attributes["gen_ai.conversation.id"] = conversation_id
        # Generic session key, as the Strands docs use; Data Prepper maps it too.
        attributes["session.id"] = conversation_id
    if user_id:
        attributes["user.id"] = user_id
    return attributes


def _messages(role: str, text: str) -> str:
    return json.dumps([{"role": role, "parts": [{"type": "text", "content": text}]}])


def describe_request_span(
    agent_name: str, user_text: str, conversation_id: str | None, user_id: str | None = None
) -> None:
    """Describe the incoming HTTP request span as the agent invocation it carries.

    The FastAPI server span is the trace root, and Strands' own invoke_agent span sits under
    it. Agent views list traces by their root span, so the root needs the GenAI attributes
    (operation, agent, session, user input), as the plain-agents example sets on its root.
    """
    span = trace.get_current_span()
    span.set_attribute("gen_ai.operation.name", "invoke_agent")
    span.set_attribute("gen_ai.agent.name", agent_name)
    span.set_attribute("gen_ai.input.messages", _messages("user", user_text))
    for key, value in session_attributes(conversation_id, user_id).items():
        span.set_attribute(key, value)


def finish_request_span(answer: str) -> None:
    """Record the agent's answer on the request span (see describe_request_span)."""
    trace.get_current_span().set_attribute("gen_ai.output.messages", _messages("assistant", answer))
