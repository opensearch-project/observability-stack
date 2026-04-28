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
    "example-events-agent",
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
    """Run deterministic evaluators and write a score() span for each.

    Emits four OTel GenAI evaluation spans attached to the agent invocation:
      - span_coverage:         instrumentation health (input/output/tools present)
      - error_free:            no span in the trace has status.code=ERROR
      - tool_call_success_rate: fraction of tool calls that returned non-empty
      - tool_diversity:        unique tools / total tool calls (catches looping)
    """
    session = retriever.get_traces(trace_id)
    if not session.traces:
        return

    has_input = False
    has_output = False
    tool_calls = 0
    tool_calls_non_empty = 0
    tool_names: set[str] = set()
    has_error = False
    for tr in session.traces:
        for s in tr.spans:
            if s.input_messages:
                has_input = True
            if s.output_messages:
                has_output = True
            if s.tool_name:
                tool_calls += 1
                tool_names.add(s.tool_name)
                if (s.tool_call_result or "").strip() not in ("", "[]", "{}", "null"):
                    tool_calls_non_empty += 1
            # OTel span status: raw doc stores status.code as string, e.g. "STATUS_CODE_ERROR"
            status = (s.raw or {}).get("status") or {}
            code = str(status.get("code") or "").upper()
            if "ERROR" in code or code == "2":
                has_error = True

    has_tools = tool_calls > 0

    # 1) span_coverage — structural instrumentation health (0.0/0.33/0.67/1.0)
    coverage = round(
        (0.33 if has_input else 0.0)
        + (0.34 if has_output else 0.0)
        + (0.33 if has_tools else 0.0),
        2,
    )
    coverage_label = (
        "Full" if coverage >= 0.67 else "Partial" if coverage >= 0.33 else "Missing"
    )
    score(
        name="span_coverage",
        value=coverage,
        trace_id=trace_id,
        span_id=span_id,
        label=coverage_label,
        explanation=(
            f"input={'yes' if has_input else 'no'}, "
            f"output={'yes' if has_output else 'no'}, "
            f"tools={'yes' if has_tools else 'no'}"
        ),
    )

    # 2) error_free — did any span report an error status
    error_free = 0.0 if has_error else 1.0
    score(
        name="error_free",
        value=error_free,
        trace_id=trace_id,
        span_id=span_id,
        label="No errors" if not has_error else "Has errors",
        explanation="at least one span has status.code=ERROR" if has_error else "all spans OK",
    )

    # 3) tool_call_success_rate — fraction of tool calls with non-empty results
    if tool_calls == 0:
        tcsr = 1.0
        tcsr_label = "No tool calls"
        tcsr_expl = "no tool calls on this trace"
    else:
        tcsr = round(tool_calls_non_empty / tool_calls, 2)
        tcsr_label = (
            "All tools returned data"
            if tcsr == 1.0
            else "Some tools empty"
            if tcsr >= 0.5
            else "Most tools empty"
        )
        tcsr_expl = f"{tool_calls_non_empty}/{tool_calls} tool calls returned non-empty results"
    score(
        name="tool_call_success_rate",
        value=tcsr,
        trace_id=trace_id,
        span_id=span_id,
        label=tcsr_label,
        explanation=tcsr_expl,
    )

    # 4) tool_diversity — unique tools / total tool calls (catches tool-loop patterns)
    if tool_calls == 0:
        td = 1.0
        td_label = "No tool calls"
        td_expl = "no tool calls on this trace"
    else:
        td = round(len(tool_names) / tool_calls, 2)
        td_label = (
            "Diverse tool use"
            if td >= 0.67
            else "Repeated tools"
            if td >= 0.34
            else "Looping on one tool"
        )
        td_expl = f"{len(tool_names)} unique tool(s) across {tool_calls} call(s)"
    score(
        name="tool_diversity",
        value=td,
        trace_id=trace_id,
        span_id=span_id,
        label=td_label,
        explanation=td_expl,
    )

    log.info(
        "Scored %s: coverage=%.2f error_free=%.0f tool_success=%.2f tool_diversity=%.2f",
        trace_id[:12], coverage, error_free, tcsr, td,
    )


def _find_scored_by_name(
    retriever: OpenSearchTraceRetriever, trace_ids: list[str], eval_name: str
) -> set[str]:
    """Return subset of trace_ids that already have a score span for eval_name.

    Needed because find_evaluated_trace_ids matches any evaluation span, which
    would cause this deterministic canary to skip traces already scored by
    other canaries (e.g. LLM-as-judge).
    """
    if not trace_ids:
        return set()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"terms": {"traceId": trace_ids}},
                    {"term": {"attributes.gen_ai.operation.name": "evaluation"}},
                    {"term": {"attributes.gen_ai.evaluation.name": eval_name}},
                ]
            }
        },
        "aggs": {"scored": {"terms": {"field": "traceId", "size": len(trace_ids)}}},
    }
    resp = retriever._client.search(index=retriever._index, body=body)
    return {
        b["key"]
        for b in resp.get("aggregations", {}).get("scored", {}).get("buckets", [])
    }


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
                # Scope dedup to this canary's anchor eval name so other canaries
                # (LLM-as-judge etc) don't cause us to skip traces.
                evaluated = _find_scored_by_name(retriever, trace_ids, "span_coverage")
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
