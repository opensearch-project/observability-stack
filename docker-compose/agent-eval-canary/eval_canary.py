"""Agent eval canary: deterministic online and offline evaluations of the example agents.

No LLM. Locally it reads traces from the stack's OpenSearch with basic auth; on AWS
(OPENSEARCH_AWS_SERVICE=aoss or es) it signs those reads with SigV4 using the instance's
credentials. Every cycle (EVAL_CANARY_INTERVAL seconds) it:

1. Online, span level: lists recent agent roots in OpenSearch (OpenSearchTraceRetriever),
   skips traces this canary already evaluated (find_evaluated_trace_ids by evaluator), and posts
   four code checks on each agent root span with score().
2. Online, session level: grades each finished conversation (gen_ai.conversation.id) of the
   travel planner as a whole (score(conversation_id=...), level "session").
3. Offline, every EVAL_CANARY_SUITE_INTERVAL_MINUTES: runs the travel_planner_smoke test suite with
   evaluate() against the running travel planner, as a named eval run. Three of its five cases
   inject faults and are expected to fail.

Results are gen_ai.evaluation.result log events. Data Prepper routes them to the
otel-v1-genai-evaluation write alias. The canary's own logs go through OTel logs too: a failed
result is logged at WARN with the evaluated span's trace and span ids, so Agent Traces shows it
next to the agent's own WARN / ERROR logs on that trace.
"""

import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone

import requests
from opentelemetry import context, trace
from opentelemetry._logs import get_logger_provider
from opentelemetry.propagate import inject
from opentelemetry.sdk._logs import LoggingHandler
from opentelemetry.trace import NonRecordingSpan, SpanContext, SpanKind, Status, StatusCode, TraceFlags

from opensearch_genai_observability_sdk_py import (
    EvalScore,
    OpenSearchTraceRetriever,
    Op,
    enrich,
    evaluate,
    observe,
    register,
    score,
    scorer,
)

# Config
OS_HOST = os.environ.get("OPENSEARCH_HOST", "https://opensearch:9200")
OS_USER = os.environ.get("OPENSEARCH_USER", "admin")
OS_PASS = os.environ.get("OPENSEARCH_PASSWORD", "admin")
# AWS backends: "aoss" (OpenSearch Serverless) or "es" (managed domain) signs the reads with
# SigV4 instead of basic auth. AWS_REGION picks the signing region.
OS_AWS_SERVICE = os.environ.get("OPENSEARCH_AWS_SERVICE", "").strip().lower()
AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "")
# Matches the local rollover indices (otel-v1-apm-span-000001) and the single serverless
# index (otel-v1-apm-span) alike; the SDK's default otel-v1-apm-span-* misses the latter.
SPAN_INDEX = os.environ.get("OPENSEARCH_SPAN_INDEX", "otel-v1-apm-span*")
OTEL_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317")
INTERVAL = int(os.environ.get("EVAL_CANARY_INTERVAL", "120"))
LOOKBACK_MINUTES = int(os.environ.get("EVAL_CANARY_LOOKBACK_MINUTES", "15"))
SUITE_INTERVAL_MINUTES = int(os.environ.get("EVAL_CANARY_SUITE_INTERVAL_MINUTES", "30"))
# A session is graded once its newest turn is this old (the conversation is over)
SESSION_IDLE_SECONDS = int(os.environ.get("EVAL_CANARY_SESSION_IDLE_SECONDS", "90"))
TRAVEL_PLANNER_URL = os.environ.get("TRAVEL_PLANNER_URL", "http://travel-planner:8000")
PLANNER_AGENT_NAME = "Travel Planner"
PLANNER_AGENT_VERSION = os.environ.get("PLANNER_AGENT_VERSION", "1.1.0")

TRACE_EVALUATOR = "trace_health_check"
SESSION_EVALUATOR = "session_health_check"
EVALUATION_INDEX = "otel-v1-genai-evaluation*"

# Services whose agent traces are evaluated online
TARGET_SERVICES = ["travel-planner", "weather-agent", "events-agent"]

# Traces and evaluation events (OTLP gRPC); register() also installs the global LoggerProvider
register(
    endpoint=f"grpc://{OTEL_ENDPOINT.replace('http://', '').replace('grpc://', '')}",
    service_name="agent-eval-canary",
    service_version="0.3.0",
)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=get_logger_provider()))
for noisy in ("urllib3", "opensearch"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
log = logging.getLogger("agent-eval-canary")


def log_on_span(level: int, trace_id: str, span_id: str | None, message: str, *args, **attributes) -> None:
    """Log with the evaluated span's trace context, so the record joins that trace."""
    if not span_id:
        log.log(level, message, *args, extra=attributes)
        return
    span_context = SpanContext(int(trace_id, 16), int(span_id, 16), is_remote=True, trace_flags=TraceFlags(1))
    token = context.attach(trace.set_span_in_context(NonRecordingSpan(span_context)))
    try:
        log.log(level, message, *args, extra=attributes)
    finally:
        context.detach(token)


# ---------------------------------------------------------------------------
# Online, span level
# ---------------------------------------------------------------------------

def _status_is_error(span) -> bool:
    status = (span.raw or {}).get("status") or {}
    code = str(status.get("code") or "").upper()
    return "ERROR" in code or code == "2"


def trace_health(retriever: OpenSearchTraceRetriever, root) -> None:
    """Post four code checks on the agent root span of one trace."""
    session = retriever.get_traces(root.trace_id)
    spans = [s for tr in session.traces for s in tr.spans]
    if not spans:
        return

    has_input = any(s.input_messages for s in spans)
    has_output = any(s.output_messages for s in spans)
    tools = [s for s in spans if s.operation_name == "execute_tool"]

    def returned_data(s) -> bool:
        result = (s.tool_call_result or "").strip() or "".join(m.content or "" for m in s.output_messages).strip()
        return result not in ("", "[]", "{}", "null")

    tools_with_data = [s for s in tools if returned_data(s)]
    errored = [s.name for s in spans if _status_is_error(s)]

    common = dict(
        trace_id=root.trace_id,
        span_id=root.span_id,
        evaluator=TRACE_EVALUATOR,
        evaluator_version="2",
        evaluator_type="code",
        agent_name=root.agent_name or None,
        agent_version=root.agent_version or None,
    )
    results = []

    coverage = round((0.33 if has_input else 0) + (0.34 if has_output else 0) + (0.33 if tools else 0), 2)
    results.append(("span_coverage", coverage, dict(
        threshold=0.67, score_min=0, score_max=1,
        explanation=f"input={'yes' if has_input else 'no'}, output={'yes' if has_output else 'no'}, tools={'yes' if tools else 'no'}",
    )))
    results.append(("error_free", 0.0 if errored else 1.0, dict(
        label="fail" if errored else "pass",
        explanation=f"spans with ERROR status: {', '.join(sorted(set(errored))[:5])}" if errored else "all spans OK",
    )))
    rate = round(len(tools_with_data) / len(tools), 2) if tools else 1.0
    results.append(("tool_call_success_rate", rate, dict(
        threshold=0.75, score_min=0, score_max=1,
        explanation=f"{len(tools_with_data)}/{len(tools)} tool calls returned data" if tools else "no tool calls",
    )))
    diversity = round(len({s.tool_name for s in tools}) / len(tools), 2) if tools else 1.0
    results.append(("tool_diversity", diversity, dict(
        threshold=0.34, score_min=0, score_max=1,
        explanation=f"{len({s.tool_name for s in tools})} unique tool(s) across {len(tools)} call(s)",
    )))

    failed = []
    for name, value, kwargs in results:
        score(name, value, **common, **kwargs)
        passed = (kwargs.get("label") == "pass") if "label" in kwargs else value >= kwargs["threshold"]
        if not passed:
            failed.append(f"{name}={value}")
    if failed:
        log_on_span(logging.WARNING, root.trace_id, root.span_id,
                    "Evaluation failed for %s: %s", root.agent_name or root.name, ", ".join(failed),
                    **{"gen_ai.evaluation.evaluator": TRACE_EVALUATOR})
    log.info("Scored trace %s (%s): %s", root.trace_id[:12], root.agent_name,
             " ".join(f"{n}={v}" for n, v, _ in results))


# ---------------------------------------------------------------------------
# Online, session level
# ---------------------------------------------------------------------------

def _conversation_id(span) -> str:
    return str(((span.raw or {}).get("attributes") or {}).get("gen_ai.conversation.id") or "")


def _parse_time(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def _graded_sessions(retriever: OpenSearchTraceRetriever, session_ids: list[str]) -> set[str]:
    """Sessions that already have a result of this canary's session evaluator."""
    if not session_ids:
        return set()
    body = {
        "size": 0,
        "query": {"bool": {"filter": [
            {"terms": {"attributes.gen_ai.conversation.id": session_ids}},
            {"term": {"attributes.opensearch.gen_ai.evaluation.evaluator.name": SESSION_EVALUATOR}},
        ]}},
        "aggs": {"sessions": {"terms": {"field": "attributes.gen_ai.conversation.id", "size": len(session_ids)}}},
    }
    try:
        resp = retriever._client.search(index=EVALUATION_INDEX, body=body)
    except Exception as e:  # noqa: BLE001 - a missing index means nothing is graded yet
        log.info("Session lookup skipped: %s", type(e).__name__)
        return set()
    return {b["key"] for b in resp.get("aggregations", {}).get("sessions", {}).get("buckets", [])}


def grade_sessions(retriever: OpenSearchTraceRetriever, roots, graded_locally: set[str]) -> None:
    """Grade finished travel-planner conversations as a whole (session-level results)."""
    newest: dict[str, datetime] = {}
    agents: dict[str, tuple[str, str]] = {}
    for root in roots:
        sid = _conversation_id(root)
        started = _parse_time(root.start_time)
        if not sid or started is None or root.agent_name != PLANNER_AGENT_NAME:
            continue
        newest[sid] = max(newest.get(sid, started), started)
        agents[sid] = (root.agent_name, root.agent_version)
    idle_before = datetime.now(timezone.utc) - timedelta(seconds=SESSION_IDLE_SECONDS)
    candidates = [sid for sid, t in newest.items() if t < idle_before and sid not in graded_locally]
    done = _graded_sessions(retriever, candidates)
    for sid in candidates:
        if sid in done:
            graded_locally.add(sid)
            continue
        session = retriever.get_traces(sid)
        turns = [s for tr in session.traces for s in tr.spans
                 if s.agent_name == PLANNER_AGENT_NAME and s.operation_name == "invoke_agent"]
        if not turns:
            continue
        failed_turns = [t for t in turns if _status_is_error(t)]
        rate = round(1 - len(failed_turns) / len(turns), 2)
        agent_name, agent_version = agents[sid]
        score(
            "session_success_rate", rate,
            conversation_id=sid,
            threshold=1.0, score_min=0, score_max=1,
            explanation=f"{len(turns) - len(failed_turns)}/{len(turns)} turns answered without a sub-agent failure",
            evaluator=SESSION_EVALUATOR, evaluator_type="code",
            evaluator_description="Every turn of the conversation produced a complete plan",
            agent_name=agent_name, agent_version=agent_version or None,
        )
        graded_locally.add(sid)
        if failed_turns:
            last = failed_turns[-1]
            log_on_span(logging.WARNING, last.trace_id, last.span_id,
                        "Session %s failed its evaluation: %d of %d turns degraded", sid,
                        len(failed_turns), len(turns), **{"gen_ai.conversation.id": sid})
        log.info("Scored session %s: %d turn(s), session_success_rate=%.2f", sid, len(turns), rate)


# ---------------------------------------------------------------------------
# Offline: the travel_planner_smoke test suite
# ---------------------------------------------------------------------------

SUITE = [
    {"case_id": "paris-ok", "case_name": "Paris from Seattle",
     "input": {"destination": "Paris", "origin": "Seattle"},
     "expected": {"keywords": ["Paris", "EUR"]}},
    {"case_id": "tokyo-ok", "case_name": "Tokyo from Portland",
     "input": {"destination": "Tokyo", "origin": "Portland"},
     "expected": {"keywords": ["Tokyo", "JPY"]}},
    # Deliberately failing cases: each injects a fault, the agents log it at WARN / ERROR
    {"case_id": "london-weather-tool-error", "case_name": "London, weather tool fails",
     "input": {"destination": "London", "origin": "Boston", "fault": {"weather": {"type": "tool_error"}}},
     "expected": {"keywords": ["London", "GBP"]}},
    {"case_id": "berlin-wrong-city-events", "case_name": "Berlin, events agent answers for Tokyo",
     "input": {"destination": "Berlin", "origin": "Denver",
               "fault": {"events": {"type": "wrong_city", "wrong_city": "tokyo"}}},
     "expected": {"keywords": ["Berlin", "EUR"],
                  "forbidden": ["Shibuya", "Tsukiji", "Robot Restaurant"]}},
    {"case_id": "sydney-events-rate-limited", "case_name": "Sydney, events agent rate limited",
     "input": {"destination": "Sydney", "origin": "Austin", "fault": {"events": {"type": "rate_limited"}}},
     "expected": {"keywords": ["Sydney", "AUD"]}},
]


@observe(name=PLANNER_AGENT_NAME, op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT)
def plan_trip(case_input: dict) -> dict:
    """The task: call the running travel planner over HTTP.

    This invoke_agent CLIENT span is the trace's agent root: evaluate() stamps the test.* ids on it
    and parents the results to it. The planner continues the trace (traceparent header), so its
    spans and its WARN / ERROR logs are in the same trace.
    """
    enrich(input_messages=[{"role": "user", "parts": [{"type": "text", "content": f"Plan a trip to {case_input['destination']}"}]}])
    headers: dict[str, str] = {}
    inject(headers)
    started = time.time()
    resp = requests.post(f"{TRAVEL_PLANNER_URL}/plan", json=case_input, headers=headers, timeout=90)
    resp.raise_for_status()
    data = resp.json()
    data["elapsed_s"] = round(time.time() - started, 2)
    enrich(output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": data.get("recommendation", "")}]}])
    if data.get("partial"):
        trace.get_current_span().set_status(Status(StatusCode.ERROR, "partial plan"))
        log.warning("Travel planner returned a partial plan for %s: %s", case_input["destination"],
                    ", ".join(e.get("agent", "?") for e in data.get("errors", [])))
    return data


@scorer(name="plan_complete", threshold=1.0, score_min=0, score_max=1, evaluator_type="code",
        description="The plan has weather, events, flights and currency")
def plan_complete(input, output, expected):
    sections = [bool(output.get("weather")), bool(output.get("events")), bool(output.get("flights")),
                bool(output.get("currency"))]
    return round(sum(sections) / len(sections), 2)


@scorer(name="no_sub_agent_errors", evaluator_type="code", description="No sub-agent or tool call failed")
def no_sub_agent_errors(input, output, expected):
    return not output.get("errors")


@scorer(name="latency_budget", threshold=15, direction="minimize", score_min=0, evaluator_type="code",
        description="End-to-end plan latency in seconds")
def latency_budget(input, output, expected):
    return output["elapsed_s"]


@scorer(name="answer_relevance", threshold=1.0, score_min=0, score_max=1, evaluator_type="code",
        description="The recommendation names the destination")
def answer_relevance(input, output, expected):
    return 1.0 if input["destination"].lower() in output.get("recommendation", "").lower() else 0.0


def keyword_overlap(input, output, expected):
    """A library-style metric: the result names its own evaluator (lib.keyword_overlap).

    Checks that the plan (recommendation, flights, currency) names the expected keywords.

    It is not this scorer's own result, so it keeps its own threshold and type. It shares the
    evaluation name answer_relevance with the scorer above, so the local result key is
    "answer_relevance (lib.keyword_overlap)".
    """
    text = " ".join([output.get("recommendation", ""), json.dumps(output.get("flights") or {}),
                     json.dumps(output.get("currency") or {})]).lower()
    keywords = expected.get("keywords", [])
    hits = [k for k in keywords if k.lower() in text]
    return EvalScore(
        name="answer_relevance",
        value=round(len(hits) / len(keywords), 2) if keywords else 1.0,
        evaluator="lib.keyword_overlap",
        evaluator_type="code",
        threshold=0.67,
        score_min=0,
        score_max=1,
        explanation=f"found {', '.join(hits) or 'none'} of {', '.join(keywords)}",
    )


@scorer(name="no_foreign_attractions", evaluator_type="code",
        description="No attraction of another city is recommended")
def no_foreign_attractions(input, output, expected):
    text = output.get("recommendation", "") + " " + " ".join(e.get("name", "") for e in output.get("events", []))
    return not any(term.lower() in text.lower() for term in expected.get("forbidden", []))


def run_suite() -> None:
    started = datetime.now(timezone.utc)
    result = evaluate(
        name="travel_planner_smoke",
        task=plan_trip,
        data=SUITE,
        scores=[plan_complete, no_sub_agent_errors, latency_budget, answer_relevance, keyword_overlap,
                no_foreign_attractions],
        agent_name=PLANNER_AGENT_NAME,
        agent_version=PLANNER_AGENT_VERSION,
        run_name=f"canary {started:%Y-%m-%d %H:%M} UTC",
        run_description="Scheduled smoke suite: two healthy trips and three cases with injected faults that should fail",
        metadata={"app.canary": "agent-eval-canary"},
    )
    for case in result.cases:
        failed = sorted(k for k, v in (case.verdicts or {}).items() if v == "fail")
        log.info("Suite case %s: %s scores=%s", case.case_id, case.status, case.scores)
        if case.status != "pass" and case.trace_id:
            log_on_span(logging.WARNING if case.status == "fail" else logging.ERROR, case.trace_id, case.span_id,
                        "Test case %s %s: %s", case.case_id, case.status,
                        ", ".join(failed) or case.error_type or "error",
                        **{"test.case.id": case.case_id, "test.suite.name": "travel_planner_smoke"})
    summary = result.summary
    log.info("Suite run %s done: %d pass, %d fail, %d error", summary.run_id,
             summary.pass_count, summary.fail_count, summary.error_count)


def planner_ready() -> bool:
    try:
        return requests.get(f"{TRAVEL_PLANNER_URL}/health", timeout=5).status_code == 200
    except requests.RequestException:
        return False


def make_retriever() -> OpenSearchTraceRetriever:
    """Basic auth for the local stack; SigV4 (instance credentials) for AWS backends."""
    if OS_AWS_SERVICE:
        if OS_AWS_SERVICE not in ("aoss", "es"):
            raise ValueError(f"OPENSEARCH_AWS_SERVICE must be aoss or es, not {OS_AWS_SERVICE!r}")
        if not AWS_REGION:
            raise ValueError("AWS_REGION is required with OPENSEARCH_AWS_SERVICE")
        import botocore.session
        from opensearchpy import RequestsAWSV4SignerAuth

        credentials = botocore.session.get_session().get_credentials()
        auth = RequestsAWSV4SignerAuth(credentials, AWS_REGION, OS_AWS_SERVICE)
        return OpenSearchTraceRetriever(host=OS_HOST, index=SPAN_INDEX, auth=auth, verify_certs=True)
    # The local stack's OpenSearch has a self-signed certificate
    return OpenSearchTraceRetriever(
        host=OS_HOST, index=SPAN_INDEX, auth=(OS_USER, OS_PASS), verify_certs=False
    )


def run() -> None:
    retriever = make_retriever()
    log.info("Agent eval canary started: every %ds, lookback %dm, suite every %dm",
             INTERVAL, LOOKBACK_MINUTES, SUITE_INTERVAL_MINUTES)

    for attempt in range(30):
        try:
            retriever.list_root_spans(max_results=1)
            log.info("OpenSearch is ready")
            break
        except Exception as e:  # noqa: BLE001
            log.info("Waiting for OpenSearch... (%d/30): %s", attempt + 1, e)
            time.sleep(10)

    recently_scored: dict[str, float] = {}  # results take a few seconds to be searchable
    graded_sessions: set[str] = set()
    next_suite = time.time() + 60  # first run once the agents are up
    provider = trace.get_tracer_provider()

    while True:
        try:
            cutoff = time.time() - LOOKBACK_MINUTES * 60
            recently_scored = {k: v for k, v in recently_scored.items() if v > cutoff}
            roots = retriever.list_root_spans(
                services=TARGET_SERVICES,
                since=datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES),
            )
            if roots:
                done = retriever.find_evaluated_trace_ids([r.trace_id for r in roots], evaluator=TRACE_EVALUATOR)
                pending = [r for r in roots if r.trace_id not in done and r.trace_id not in recently_scored]
                log.info("Online: %d recent agent traces, %d to evaluate", len(roots), len(pending))
                for root in pending:
                    try:
                        trace_health(retriever, root)
                        recently_scored[root.trace_id] = time.time()
                    except Exception:  # noqa: BLE001
                        log.exception("Failed to evaluate trace %s", root.trace_id[:12])
                grade_sessions(retriever, roots, graded_sessions)

            if SUITE_INTERVAL_MINUTES > 0 and time.time() >= next_suite:
                if planner_ready():
                    run_suite()
                    next_suite = time.time() + SUITE_INTERVAL_MINUTES * 60
                else:
                    log.info("Travel planner not reachable, suite postponed")
            provider.force_flush()
        except Exception:  # noqa: BLE001
            log.exception("Cycle failed")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()
