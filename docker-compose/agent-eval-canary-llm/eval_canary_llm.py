"""LLM-as-judge eval canary — periodically runs HelpfulnessEvaluator on recent traces.

Complements the deterministic agent-eval-canary. Every cycle:
  1. Lists recent agent root spans from OpenSearch
  2. Dedupes against traces that already have a helpfulness score
  3. Evaluates up to MAX_PER_CYCLE traces in parallel via Bedrock Claude
  4. Writes score spans back via genai-observability-sdk score()

Score spans are OTel GenAI semconv compliant (gen_ai.operation.name=evaluation,
gen_ai.evaluation.name=helpfulness) and attach to the evaluated trace so they
render in the same waterfall as the agent spans.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from opensearch_genai_observability_sdk_py.retrieval import OpenSearchTraceRetriever
from opensearch_genai_observability_sdk_py.score import score
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from strands_evals.evaluators import HelpfulnessEvaluator
from strands_evals.providers import OpenSearchProvider, SessionNotFoundError
from strands_evals.types.evaluation import EvaluationData
from strands_evals.types.trace import AgentInvocationSpan

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("agent-eval-canary-llm")

OS_HOST = os.environ.get("OPENSEARCH_HOST", "https://opensearch:9200")
OS_USER = os.environ.get("OPENSEARCH_USER", "admin")
OS_PASS = os.environ.get("OPENSEARCH_PASSWORD", "admin")
OTEL_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317")
INTERVAL = int(os.environ.get("EVAL_CANARY_LLM_INTERVAL", "60"))
LOOKBACK_MINUTES = int(os.environ.get("EVAL_CANARY_LLM_LOOKBACK_MINUTES", "10"))
MAX_PER_CYCLE = int(os.environ.get("EVAL_CANARY_LLM_MAX_PER_CYCLE", "20"))
CONCURRENCY = int(os.environ.get("EVAL_CANARY_LLM_CONCURRENCY", "8"))
JUDGE_MODEL = os.environ.get(
    "EVAL_JUDGE_MODEL", "us.anthropic.claude-sonnet-4-20250514-v1:0"
)
EVAL_NAME = "helpfulness"

TARGET_SERVICES = [
    "example-weather-agent",
    "example-travel-planner",
    "example-events-agent",
    "travel-planner",
    "weather-agent",
    "events-agent",
]


def setup_otel() -> TracerProvider:
    resource = Resource.create({"service.name": "agent-eval-canary-llm"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=OTEL_ENDPOINT, insecure=True))
    )
    trace.set_tracer_provider(provider)
    return provider


def _last_agent_invocation(session) -> AgentInvocationSpan | None:
    for tr in reversed(session.traces):
        for s in reversed(tr.spans):
            if isinstance(s, AgentInvocationSpan):
                return s
    return None


def _find_scored_by_name(
    retriever: OpenSearchTraceRetriever, trace_ids: list[str], eval_name: str
) -> set[str]:
    """Return subset of trace_ids that already have a score span for eval_name.

    Extends retriever.find_evaluated_trace_ids by filtering on gen_ai.evaluation.name.
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
        "aggs": {
            "scored": {"terms": {"field": "traceId", "size": len(trace_ids)}}
        },
    }
    resp = retriever._client.search(index=retriever._index, body=body)
    return {
        b["key"]
        for b in resp.get("aggregations", {}).get("scored", {}).get("buckets", [])
    }


def judge_one(
    provider: OpenSearchProvider,
    evaluator: HelpfulnessEvaluator,
    trace_id: str,
    run_id: str,
) -> str:
    try:
        data = provider.get_evaluation_data(session_id=trace_id)
    except SessionNotFoundError:
        return "no_session"
    except Exception as e:  # noqa: BLE001
        return f"fetch_err:{type(e).__name__}"

    session = data["trajectory"]
    output = data["output"]
    anchor = _last_agent_invocation(session)
    if not anchor:
        return "no_anchor"

    try:
        results = evaluator.evaluate(
            EvaluationData(
                input=anchor.user_prompt,
                actual_output=output,
                actual_trajectory=session,
                name=f"canary-{trace_id[:12]}",
            )
        )
    except Exception as e:  # noqa: BLE001
        return f"eval_err:{type(e).__name__}"

    r = results[0]
    try:
        score(
            name=EVAL_NAME,
            value=float(r.score),
            trace_id=anchor.span_info.trace_id,
            span_id=anchor.span_info.span_id,
            label=str(r.label),
            explanation=r.reason[:500] if r.reason else None,
            attributes={
                "test.suite.run.id": run_id,
                "test.suite.name": "eval_canary_llm",
                "test.case.id": f"canary-{trace_id[:12]}",
                "test.case.result.status": "pass" if r.test_pass else "fail",
            },
        )
    except Exception as e:  # noqa: BLE001
        return f"score_err:{type(e).__name__}"

    return f"ok {r.score:.3f} {r.label}"


def run() -> None:
    tp = setup_otel()
    retriever = OpenSearchTraceRetriever(
        host=OS_HOST, auth=(OS_USER, OS_PASS), verify_certs=False
    )
    provider = OpenSearchProvider(
        host=OS_HOST, auth=(OS_USER, OS_PASS), verify_certs=False
    )
    evaluator = HelpfulnessEvaluator(model=JUDGE_MODEL)

    log.info(
        "LLM eval canary started — interval=%ds lookback=%dm max/cycle=%d model=%s",
        INTERVAL, LOOKBACK_MINUTES, MAX_PER_CYCLE, JUDGE_MODEL,
    )

    # Wait for OpenSearch
    for attempt in range(30):
        try:
            retriever.list_root_spans(max_results=1)
            log.info("OpenSearch is ready")
            break
        except Exception as e:  # noqa: BLE001
            log.info("Waiting for OpenSearch... (%d/30): %s", attempt + 1, e)
            time.sleep(10)

    # Track recently scored traces to avoid duplicates from batch flush delay
    recently_scored: dict[str, float] = {}  # trace_id -> timestamp

    while True:
        cycle_start = time.time()
        try:
            # Expire entries older than lookback window
            cutoff = time.time() - (LOOKBACK_MINUTES * 60)
            recently_scored = {k: v for k, v in recently_scored.items() if v > cutoff}

            roots = retriever.list_root_spans(
                services=TARGET_SERVICES,
                since=datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES),
            )
            if not roots:
                log.info("No recent traces; sleeping")
            else:
                trace_ids = [r.trace_id for r in roots]
                scored = _find_scored_by_name(retriever, trace_ids, EVAL_NAME)
                pending = [
                    tid for tid in trace_ids
                    if tid not in scored and tid not in recently_scored
                ][:MAX_PER_CYCLE]
                log.info(
                    "Found %d recent, %d already scored, %d in-mem dedup, %d pending",
                    len(trace_ids), len(scored), len(recently_scored), len(pending),
                )
                if pending:
                    run_id = str(uuid.uuid4())
                    ok = 0
                    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
                        futs = {
                            pool.submit(judge_one, provider, evaluator, tid, run_id): tid
                            for tid in pending
                        }
                        for fut in as_completed(futs):
                            tid = futs[fut]
                            res = fut.result()
                            if res.startswith("ok"):
                                ok += 1
                                recently_scored[tid] = time.time()
                                log.info("Scored %s → %s", tid[:12], res[3:])
                            else:
                                log.warning("Failed %s → %s", tid[:12], res)
                    tp.force_flush(timeout_millis=10000)
                    log.info("Cycle done in %.1fs, ok=%d/%d", time.time() - cycle_start, ok, len(pending))
        except Exception:
            log.exception("Cycle failed")

        elapsed = time.time() - cycle_start
        sleep_for = max(0, INTERVAL - elapsed)
        if sleep_for:
            time.sleep(sleep_for)


if __name__ == "__main__":
    run()
