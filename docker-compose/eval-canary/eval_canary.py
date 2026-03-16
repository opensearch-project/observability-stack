"""Eval canary — periodically scores un-evaluated agent traces.

Polls OpenSearch for recent agent traces, skips any that already have
an evaluation span, and writes deterministic score spans back via the
genai-observability-sdk score() API.
"""

import logging
import os
import time

from opensearchpy import OpenSearch

from opensearch_genai_observability_sdk_py.retrieval import OpenSearchTraceRetriever
from opensearch_genai_observability_sdk_py.score import score

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("eval-canary")

# Config
OS_HOST = os.environ.get("OPENSEARCH_HOST", "https://opensearch:9200")
OS_USER = os.environ.get("OPENSEARCH_USER", "admin")
OS_PASS = os.environ.get("OPENSEARCH_PASSWORD", "admin")
OTEL_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317")
INTERVAL = int(os.environ.get("EVAL_CANARY_INTERVAL", "60"))
LOOKBACK_MINUTES = int(os.environ.get("EVAL_CANARY_LOOKBACK_MINUTES", "15"))
INDEX = "otel-v1-apm-span-*"

# Example/canary service names to evaluate
TARGET_SERVICES = {
    "example-weather-agent",
    "example-travel-planner",
    "travel-planner",
    "weather-agent",
    "events-agent",
}


def setup_otel() -> TracerProvider:
    resource = Resource.create({"service.name": "eval-canary"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=OTEL_ENDPOINT, insecure=True))
    )
    trace.set_tracer_provider(provider)
    return provider


def get_os_client() -> OpenSearch:
    return OpenSearch(
        hosts=[OS_HOST],
        http_auth=(OS_USER, OS_PASS),
        verify_certs=False,
        ssl_show_warn=False,
    )


def find_unevaluated_traces(client: OpenSearch) -> list[dict]:
    """Find recent agent root spans that don't yet have an evaluation span."""
    # Step 1: recent root agent spans from target services
    agent_query = {
        "size": 50,
        "sort": [{"startTime": "desc"}],
        "_source": ["traceId", "spanId", "name", "serviceName", "startTime"],
        "query": {
            "bool": {
                "must": [
                    {"terms": {"serviceName": list(TARGET_SERVICES)}},
                    {"term": {"parentSpanId": ""}},
                    {"range": {"startTime": {"gte": f"now-{LOOKBACK_MINUTES}m"}}},
                ],
            }
        },
    }
    resp = client.search(index=INDEX, body=agent_query)
    candidates = resp["hits"]["hits"]
    if not candidates:
        return []

    trace_ids = [h["_source"]["traceId"] for h in candidates]

    # Step 2: find which of those already have eval spans
    eval_query = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"terms": {"traceId": trace_ids}},
                    {"term": {"attributes.gen_ai.operation.name": "evaluation"}},
                ],
            }
        },
        "aggs": {"evaluated": {"terms": {"field": "traceId", "size": 100}}},
    }
    eval_resp = client.search(index=INDEX, body=eval_query)
    evaluated = {
        b["key"] for b in eval_resp["aggregations"]["evaluated"]["buckets"]
    }

    # Step 3: return only unevaluated
    return [
        h["_source"] for h in candidates if h["_source"]["traceId"] not in evaluated
    ]


def deterministic_eval(retriever: OpenSearchTraceRetriever, span: dict) -> None:
    """Run a simple deterministic eval and write score via score()."""
    trace_id = span["traceId"]
    span_id = span["spanId"]

    session = retriever.get_traces(trace_id)
    if not session.traces:
        return

    # Find root agent span with messages
    root = None
    for tr in session.traces:
        for s in tr.spans:
            if s.operation_name == "invoke_agent" and s.input_messages:
                root = s
                break

    if not root:
        # Fallback: use the span we found
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
    else:
        has_input = bool(root.input_messages)
        has_output = bool(root.output_messages)
        has_tools = any(
            s.tool_name for tr in session.traces for s in tr.spans
        )

    # Deterministic scoring: input + output + tools
    points = 0.0
    if has_input:
        points += 0.33
    if has_output:
        points += 0.34
    if has_tools:
        points += 0.33
    points = round(points, 2)

    if points >= 0.67:
        label = "Complete"
    elif points >= 0.33:
        label = "Partial"
    else:
        label = "Incomplete"

    explanation = (
        f"input={'yes' if has_input else 'no'}, "
        f"output={'yes' if has_output else 'no'}, "
        f"tools={'yes' if has_tools else 'no'}"
    )

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
    client = get_os_client()
    retriever = OpenSearchTraceRetriever(
        host=OS_HOST,
        auth=(OS_USER, OS_PASS),
        verify_certs=False,
    )

    log.info(
        "Eval canary started — polling every %ds, lookback %dm",
        INTERVAL,
        LOOKBACK_MINUTES,
    )

    # Wait for OpenSearch to be ready
    for attempt in range(30):
        try:
            client.cluster.health(wait_for_status="yellow", timeout=5)
            log.info("OpenSearch is ready")
            break
        except Exception:
            log.info("Waiting for OpenSearch... (%d/30)", attempt + 1)
            time.sleep(10)

    while True:
        try:
            unevaluated = find_unevaluated_traces(client)
            if unevaluated:
                log.info("Found %d unevaluated traces", len(unevaluated))
                for span in unevaluated:
                    try:
                        deterministic_eval(retriever, span)
                    except Exception:
                        log.exception("Failed to eval trace %s", span["traceId"][:12])
                provider.force_flush()
            else:
                log.debug("No unevaluated traces")
        except Exception:
            log.exception("Poll cycle failed")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()
