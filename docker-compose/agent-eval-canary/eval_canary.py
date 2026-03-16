from datetime import datetime, timedelta, timezone
"""Agent eval canary — periodically scores un-evaluated agent traces.

Polls OpenSearch for recent agent traces, skips any that already have
an evaluation span, and writes deterministic score spans back via the
genai-observability-sdk score() API.
"""

import logging
import os
import time

from opensearch_genai_observability_sdk_py.retrieval import OpenSearchTraceRetriever
from opensearch_genai_observability_sdk_py.score import score

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("agent-eval-canary")

# Config
OS_HOST = os.environ.get("OPENSEARCH_HOST", "https://opensearch:9200")
OS_USER = os.environ.get("OPENSEARCH_USER", "admin")
OS_PASS = os.environ.get("OPENSEARCH_PASSWORD", "admin")
OTEL_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317")
INTERVAL = int(os.environ.get("EVAL_CANARY_INTERVAL", "120"))
LOOKBACK_MINUTES = int(os.environ.get("EVAL_CANARY_LOOKBACK_MINUTES", "15"))

# Example/canary service names to evaluate
TARGET_SERVICES = [
    "example-weather-agent",
    "example-travel-planner",
    "travel-planner",
    "weather-agent",
    "events-agent",
]


def setup_otel() -> TracerProvider:
    resource = Resource.create({"service.name": "agent-eval-canary"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        SimpleSpanProcessor(OTLPSpanExporter(endpoint=OTEL_ENDPOINT, insecure=True))
    )
    trace.set_tracer_provider(provider)
    return provider


def deterministic_eval(retriever: OpenSearchTraceRetriever, trace_id: str, span_id: str) -> None:
    """Run a simple deterministic eval and write score via score()."""
    session = retriever.get_traces(trace_id)
    if not session.traces:
        return

    has_input = False
    has_output = False
    has_tools = False
    for tr in session.traces:
        for s in tr.spans:
            if s.input_messages:
                has_input = True
            if s.output_messages:
                has_output = True
            if s.tool_name:
                has_tools = True

    points = round(
        (0.33 if has_input else 0.0)
        + (0.34 if has_output else 0.0)
        + (0.33 if has_tools else 0.0),
        2,
    )
    label = "Complete" if points >= 0.67 else "Partial" if points >= 0.33 else "Incomplete"
    explanation = f"input={'yes' if has_input else 'no'}, output={'yes' if has_output else 'no'}, tools={'yes' if has_tools else 'no'}"

    score(
        name="completeness",
        value=points,
        trace_id=trace_id,
        span_id=span_id,
        label=label,
        explanation=explanation,
    )
    log.info("Scored trace %s: %.2f (%s) — %s", trace_id[:12], points, label, explanation)


def run() -> None:
    provider = setup_otel()
    retriever = OpenSearchTraceRetriever(
        host=OS_HOST,
        auth=(OS_USER, OS_PASS),
        verify_certs=False,
    )

    log.info("Agent eval canary started — polling every %ds, lookback %dm", INTERVAL, LOOKBACK_MINUTES)

    # Wait for OpenSearch to be ready
    for attempt in range(30):
        try:
            retriever.list_root_spans(max_results=1)
            log.info("OpenSearch is ready")
            break
        except Exception as e:
            log.info("Waiting for OpenSearch... (%d/30): %s", attempt + 1, e)
            time.sleep(10)

    # Track recently scored traces to avoid duplicates from batch flush delay
    recently_scored: dict[str, float] = {}  # trace_id -> timestamp

    while True:
        try:
            # Expire entries older than lookback window
            cutoff = time.time() - (LOOKBACK_MINUTES * 60)
            recently_scored = {k: v for k, v in recently_scored.items() if v > cutoff}

            roots = retriever.list_root_spans(
                services=TARGET_SERVICES,
                since=datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES),
            )
            if roots:
                trace_ids = [r.trace_id for r in roots]
                evaluated = retriever.find_evaluated_trace_ids(trace_ids)
                unevaluated = [
                    r for r in roots
                    if r.trace_id not in evaluated and r.trace_id not in recently_scored
                ]

                if unevaluated:
                    log.info("Found %d unevaluated traces", len(unevaluated))
                    for root in unevaluated:
                        try:
                            deterministic_eval(retriever, root.trace_id, root.span_id)
                            recently_scored[root.trace_id] = time.time()
                        except Exception:
                            log.exception("Failed to eval trace %s", root.trace_id[:12])
                    provider.force_flush()
        except Exception:
            log.exception("Poll cycle failed")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()
