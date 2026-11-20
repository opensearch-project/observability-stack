"""Agent eval canary: deterministic online and offline evaluations of the example agents.

No LLM. Locally it reads traces from the stack's OpenSearch with basic auth; on AWS
(OPENSEARCH_AWS_SERVICE=aoss or es) it signs those reads with SigV4 using the instance's
credentials. Every cycle (EVAL_CANARY_INTERVAL seconds) it:

1. Production checks: lists recent agent traces in OpenSearch (OpenSearchTraceRetriever), skips
   traces already graded (find_evaluated_trace_ids by evaluator), and posts code checks on each
   agent root span with score(), each with an explanation drawn from the trace.
2. Conversation checks: grades each finished Travel Planner conversation (gen_ai.conversation.id)
   as a whole (score(conversation_id=...), level "session").
3. Every EVAL_CANARY_SUITE_INTERVAL_MINUTES: runs the "Trip planning regression" suite with
   evaluate() against the released planner and the release candidate, one named run each.

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
# The release candidate; when set, the offline suite runs against it too
TRAVEL_PLANNER_CANDIDATE_URL = os.environ.get("TRAVEL_PLANNER_CANDIDATE_URL", "")
PLANNER_AGENT_NAME = "Travel Planner"
PLANNER_AGENT_VERSION = os.environ.get("PLANNER_AGENT_VERSION", "1.3.0")

PRODUCTION_EVALUATOR = "Production checks"
PRODUCTION_DESCRIPTION = ("Code checks on every production trace: task completion, destination, tool calls, "
                          "repeated calls and response time")
SESSION_EVALUATOR = "Conversation checks"
SESSION_DESCRIPTION = "Code checks on finished conversations: whether the user got a complete plan"
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
# Shared checks (online and offline use the same rules)
# ---------------------------------------------------------------------------

# Attractions the events agent knows per city (its built-in data). A plan for one city that
# recommends another city's attractions is off destination.
CITY_ATTRACTIONS = {
    "paris": ["Louvre Late Night", "Seine River Cruise", "Jazz at Le Caveau"],
    "london": ["West End Show", "Borough Market Food Tour", "British Museum Exhibition"],
    "tokyo": ["Shibuya Night Walk", "Tsukiji Outer Market", "Robot Restaurant Show"],
    "berlin": ["Berlin Wall Tour", "Techno Night", "Museum Island Visit"],
    "new york": ["Broadway Show", "Central Park Walk", "Jazz at Blue Note"],
    "sydney": ["Opera House Tour", "Bondi Beach Day", "Harbour Bridge Climb"],
    "mumbai": ["Bollywood Studio Tour", "Street Food Walk", "Gateway of India Visit"],
    "seattle": ["Pike Place Market Tour", "Space Needle Visit", "Coffee Crawl"],
}
RESPONSE_TIME_BUDGET_S = 15


def foreign_attractions(destination: str, text: str) -> list[str]:
    """Attractions of other cities named in a plan for destination."""
    dest = (destination or "").lower()
    low = (text or "").lower()
    return [a for city, names in CITY_ATTRACTIONS.items() if city != dest for a in names if a.lower() in low]


def _parse_time(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def _seconds(span) -> float | None:
    start, end = _parse_time(span.start_time), _parse_time(span.end_time)
    return round((end - start).total_seconds(), 2) if start and end else None


def _status_is_error(span) -> bool:
    status = (span.raw or {}).get("status") or {}
    code = str(status.get("code") or "").upper()
    return "ERROR" in code or code == "2"


def _text(messages) -> str:
    return " ".join(m.content or "" for m in messages)


# ---------------------------------------------------------------------------
# Online: production checks on each agent trace (no ground truth)
# ---------------------------------------------------------------------------

def production_checks(retriever: OpenSearchTraceRetriever, root) -> None:
    """Grade one production trace of an agent with the production checks."""
    spans = [s for tr in retriever.get_traces(root.trace_id).traces for s in tr.spans]
    if not spans:
        return
    agent = root.agent_name or root.name
    planner = agent == PLANNER_AGENT_NAME
    # The agent root's own span carries the answer; for the planner it is the invoke_agent span
    me = next((s for s in spans if s.span_id == root.span_id), root)
    answer = _text(me.output_messages)
    attrs = (me.raw or {}).get("attributes") or {}
    destination = str(attrs.get("destination") or "")

    # One logical call per tool: an MCP call also has server-side spans for the same tool below the
    # caller's span, without the result. Count only the topmost span of each call.
    by_id = {s.span_id: s for s in spans}

    def top_level_tool(s) -> bool:
        parent, hops = by_id.get(s.parent_span_id), 0
        while parent is not None and hops < 50:  # HTTP spans sit between the client and server spans
            if parent.operation_name == "execute_tool" and parent.tool_name == s.tool_name:
                return False
            parent, hops = by_id.get(parent.parent_span_id), hops + 1
        return True

    calls = [s for s in spans if (s.operation_name == "execute_tool" and top_level_tool(s))
             or (s.operation_name == "invoke_agent" and s.span_id != me.span_id and s.name.endswith("-agent"))]

    def returned_data(s) -> bool:
        if _status_is_error(s):
            return False
        if s.operation_name == "invoke_agent":
            return True
        result = (s.tool_call_result or "").strip() or _text(s.output_messages).strip()
        return result not in ("", "[]", "{}", "null")

    def label(s) -> str:
        return s.tool_name or s.name.replace("tools/call ", "")

    results = []
    if planner:
        missing = []
        if not any(s.name.endswith("weather-agent") and s.operation_name == "invoke_agent" and returned_data(s) for s in spans):
            missing.append("weather forecast")
        if not any(s.name.endswith("events-agent") and s.operation_name == "invoke_agent" and returned_data(s) for s in spans):
            missing.append("attractions")
        if not any(label(s) == "fetch_flights_api" and returned_data(s) for s in spans):
            missing.append("flights")
        results.append(("Task completion", dict(
            value=0.0 if missing else 1.0, label="fail" if missing else "pass",
            explanation=(f"The plan for {destination} is missing: {', '.join(missing)}." if missing
                         else f"The plan for {destination} covers weather, attractions and flights."),
        )))
        off = foreign_attractions(destination, answer)
        results.append(("Stays on destination", dict(
            value=0.0 if off else 1.0, label="fail" if off else "pass",
            explanation=(f"Recommends {', '.join(off)}, which are not in {destination}." if off
                         else f"Every recommendation is in {destination}."),
        )))

    if calls:
        ok = [s for s in calls if returned_data(s)]
        failed = sorted({label(s) for s in calls if not returned_data(s)})
        results.append(("Tool call success", dict(
            value=round(len(ok) / len(calls), 2), threshold=0.75, score_min=0, score_max=1,
            explanation=f"{len(ok)} of {len(calls)} calls returned data" + (f"; failed: {', '.join(failed)}." if failed else "."),
        )))
        seen: dict[tuple, int] = {}
        for s in calls:
            key = (label(s), s.tool_call_arguments or _text(s.input_messages))
            seen[key] = seen.get(key, 0) + 1
        repeats = [f"{k[0]} ({n} times)" for k, n in seen.items() if n > 1]
        results.append(("No repeated tool calls", dict(
            value=0.0 if repeats else 1.0, label="fail" if repeats else "pass",
            explanation=(f"Called with the same arguments more than once: {', '.join(repeats)}." if repeats
                         else f"{len(calls)} calls, none repeated."),
        )))

    took = _seconds(me)
    if took is not None:
        results.append(("Response time", dict(
            value=took, threshold=RESPONSE_TIME_BUDGET_S, direction="minimize", score_min=0,
            explanation=f"Answered in {took:.1f} s (budget {RESPONSE_TIME_BUDGET_S} s).",
        )))

    failed_checks = []
    for name, kwargs in results:
        value = kwargs.pop("value")
        score(name, value, trace_id=root.trace_id, span_id=root.span_id,
              evaluator=PRODUCTION_EVALUATOR, evaluator_version="3", evaluator_type="code",
              evaluator_description=PRODUCTION_DESCRIPTION,
              agent_name=root.agent_name or None, agent_version=root.agent_version or None, **kwargs)
        if "label" in kwargs:
            passed = kwargs["label"] == "pass"
        elif kwargs.get("direction") == "minimize":
            passed = value <= kwargs["threshold"]
        else:
            passed = value >= kwargs["threshold"]
        if not passed:
            failed_checks.append(name)
    if failed_checks:
        log_on_span(logging.WARNING, root.trace_id, root.span_id,
                    "%s failed production checks: %s", agent, ", ".join(failed_checks),
                    **{"gen_ai.evaluation.evaluator": PRODUCTION_EVALUATOR})
    log.info("Scored trace %s (%s %s): %d checks, %d failed", root.trace_id[:12], agent,
             root.agent_version or "", len(results), len(failed_checks))


# ---------------------------------------------------------------------------
# Online: conversation checks on finished Travel Planner sessions
# ---------------------------------------------------------------------------

def _conversation_id(span) -> str:
    return str(((span.raw or {}).get("attributes") or {}).get("gen_ai.conversation.id") or "")


def _graded_sessions(retriever: OpenSearchTraceRetriever, session_ids: list[str]) -> set[str]:
    """Sessions that already have a result of the conversation checks."""
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
    """Grade finished Travel Planner conversations as a whole (session-level results)."""
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
        turns = sorted((s for tr in session.traces for s in tr.spans
                        if s.agent_name == PLANNER_AGENT_NAME and s.operation_name == "invoke_agent"),
                       key=lambda s: s.start_time)
        if not turns:
            continue
        degraded = [t for t in turns if _status_is_error(t)]
        agent_name, agent_version = agents[sid]
        common = dict(conversation_id=sid, evaluator=SESSION_EVALUATOR, evaluator_type="code",
                      evaluator_description=SESSION_DESCRIPTION,
                      agent_name=agent_name, agent_version=agent_version or None)
        last_ok = not _status_is_error(turns[-1])
        score("Goal achieved", 1.0 if last_ok else 0.0, label="pass" if last_ok else "fail",
              explanation=(f"The last of {len(turns)} turns returned a complete plan." if last_ok
                           else f"The conversation ended on a degraded answer (turn {len(turns)} of {len(turns)})."),
              **common)
        rate = round(1 - len(degraded) / len(turns), 2)
        score("Turns answered fully", rate, threshold=0.8, score_min=0, score_max=1,
              explanation=f"{len(turns) - len(degraded)} of {len(turns)} turns got a full answer.",
              **common)
        graded_locally.add(sid)
        if degraded:
            last = degraded[-1]
            log_on_span(logging.WARNING, last.trace_id, last.span_id,
                        "Conversation %s: %d of %d turns degraded", sid, len(degraded), len(turns),
                        **{"gen_ai.conversation.id": sid})
        log.info("Scored conversation %s: %d turn(s), goal %s", sid, len(turns), "met" if last_ok else "missed")


# ---------------------------------------------------------------------------
# Offline: the "Trip planning regression" test suite, run against each release
# ---------------------------------------------------------------------------

def _case(case_id, request, destination, origin, currency, *, budget=None, fault=None, category):
    data = {"case_id": case_id, "case_name": request,
            "input": {"destination": destination, "origin": origin, "message": request},
            "expected": {"currency": currency, "budget_usd": budget},
            "metadata": {"category": category}}
    if fault:
        data["input"]["fault"] = fault
    return data


SUITE_NAME = "Trip planning regression"
SUITE = [
    # Single city, dates given
    _case("lisbon-march", "Plan a 4-day trip to Lisbon from Chicago in March.", "Lisbon", "Chicago", "EUR", category="Single city"),
    _case("kyoto-april", "Plan 5 days in Kyoto in April, flying from San Francisco.", "Kyoto", "San Francisco", "JPY", category="Single city"),
    _case("paris-june", "I'm going to Paris in June for a week. What should I see? I fly from Boston.", "Paris", "Boston", "EUR", category="Single city"),
    _case("seoul-october", "Plan a 3-day trip to Seoul in October from Seattle.", "Seoul", "Seattle", "KRW", category="Single city"),
    _case("reykjavik-feb", "What should I do on a 4-day trip to Reykjavik in February? Leaving from Denver.", "Reykjavik", "Denver", "ISK", category="Single city"),
    _case("sydney-december", "Plan 10 days in Sydney in December from Los Angeles.", "Sydney", "Los Angeles", "AUD", category="Single city"),
    # Budget limits
    _case("rome-budget", "Plan 5 days in Rome in May under $2,500, flying from New York.", "Rome", "New York", "EUR", budget=2500, category="Budget"),
    _case("tokyo-budget", "A week in Tokyo in November with a budget of $3,500, from Portland.", "Tokyo", "Portland", "JPY", budget=3500, category="Budget"),
    _case("barcelona-tight", "Weekend in Barcelona this weekend from Chicago, under $1,200 total.", "Barcelona", "Chicago", "EUR", budget=1200, category="Budget"),
    _case("mexico-city-budget", "4 days in Mexico City in January for under $1,500, from Austin.", "Mexico City", "Austin", "MXN", budget=1500, category="Budget"),
    _case("singapore-budget", "Plan 6 days in Singapore in August, budget of $4,000, flying from Seattle.", "Singapore", "Seattle", "SGD", budget=4000, category="Budget"),
    # No travel dates
    _case("berlin-no-dates", "Plan a trip to Berlin from Denver.", "Berlin", "Denver", "EUR", category="No dates"),
    _case("london-no-dates", "Put together a 4-day itinerary for London. We're coming from Boston.", "London", "Boston", "GBP", category="No dates"),
    _case("mumbai-no-dates", "What should I do on a work trip to Mumbai? I fly in from San Francisco.", "Mumbai", "San Francisco", "INR", category="No dates"),
    _case("seattle-no-dates", "Plan 3 days in Seattle from Chicago, around $1,800.", "Seattle", "Chicago", None, budget=1800, category="No dates"),
    # Families and groups
    _case("tokyo-family", "Family trip to Tokyo next week with two kids, flying from Los Angeles. What's worth seeing?", "Tokyo", "Los Angeles", "JPY", category="Family"),
    _case("new-york-family", "Plan 4 days in New York in July for a family of four from Atlanta.", "New York", "Atlanta", None, category="Family"),
    # Multi-turn style follow-ups as single requests
    _case("paris-cheaper", "Can you find cheaper flights to Paris from Seattle for 5 days in September?", "Paris", "Seattle", "EUR", category="Follow-up"),
    _case("sydney-instead", "Actually, plan 7 days in Sydney in March instead, from Dallas.", "Sydney", "Dallas", "AUD", category="Follow-up"),
    # Unknown or ambiguous destinations
    _case("portland-ambiguous", "Plan a weekend in Portland in October from Boston.", "Portland", "Boston", None, category="Ambiguous"),
    _case("cusco-unknown", "Plan 5 days in Cusco in May from Miami.", "Cusco", "Miami", "PEN", category="Unknown city"),
    # Sub-agent incidents the planner should survive
    _case("london-weather-outage", "Plan 4 days in London in April from New York.", "London", "New York", "GBP",
          fault={"weather": {"type": "tool_error"}}, category="Resilience"),
    _case("sydney-events-rate-limited", "Plan 5 days in Sydney in February from Austin.", "Sydney", "Austin", "AUD",
          fault={"events": {"type": "rate_limited"}}, category="Resilience"),
    _case("berlin-events-wrong-city", "Plan 3 days in Berlin in June from Denver.", "Berlin", "Denver", "EUR",
          fault={"events": {"type": "wrong_city", "wrong_city": "tokyo"}}, category="Resilience"),
]

_planner_url = {"value": TRAVEL_PLANNER_URL}


@observe(name=PLANNER_AGENT_NAME, op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT)
def plan_trip(case_input: dict) -> dict:
    """The task: send the case's request to the running travel planner over HTTP.

    This invoke_agent CLIENT span is the trace's agent root: evaluate() stamps the test.* ids on it
    and parents the results to it. The planner continues the trace (traceparent header), so its
    spans and its WARN / ERROR logs are in the same trace.
    """
    enrich(input_messages=[{"role": "user", "parts": [{"type": "text", "content": case_input["message"]}]}])
    headers: dict[str, str] = {}
    inject(headers)
    started = time.time()
    resp = requests.post(f"{_planner_url['value']}/plan", json=case_input, headers=headers, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    data["elapsed_s"] = round(time.time() - started, 2)
    enrich(output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": data.get("recommendation", "")}]}])
    if data.get("partial"):
        trace.get_current_span().set_status(Status(StatusCode.ERROR, "partial plan"))
        log.warning("Travel planner returned a partial plan for %s: %s", case_input["destination"],
                    ", ".join(e.get("agent", "?") for e in data.get("errors", [])))
    return data


@scorer(name="Plan is complete", evaluator_type="code",
        description="The plan covers the weather forecast, attractions and flights for the destination")
def plan_is_complete(input, output, expected):
    missing = [name for key, name in (("weather", "weather forecast"), ("events", "attractions"), ("flights", "flights"))
               if not output.get(key)]
    return EvalScore(name="Plan is complete", value=0.0 if missing else 1.0, label="fail" if missing else "pass",
                     explanation=f"Missing: {', '.join(missing)}." if missing else "Weather, attractions and flights are all included.")


@scorer(name="Stays on destination", evaluator_type="code",
        description="Every recommended attraction is in the requested city")
def stays_on_destination(input, output, expected):
    text = output.get("recommendation", "") + " " + " ".join(e.get("name", "") for e in output.get("events", []))
    off = foreign_attractions(input["destination"], text)
    return EvalScore(name="Stays on destination", value=0.0 if off else 1.0, label="fail" if off else "pass",
                     explanation=(f"Recommends {', '.join(off)}, which are not in {input['destination']}." if off
                                  else f"Every recommendation is in {input['destination']}."))


@scorer(name="Respects budget", evaluator_type="code",
        description="When the request has a budget, the plan estimates the cost and stays within it")
def respects_budget(input, output, expected):
    budget = expected.get("budget_usd")
    if not budget:
        return []  # not applicable: the request has no budget
    est = output.get("estimate")
    if not est:
        return EvalScore(name="Respects budget", value=0.0, label="fail",
                         explanation=f"The request has a ${budget:,} budget, but the plan gives no cost estimate.")
    ok = est["total_usd"] <= budget
    return EvalScore(name="Respects budget", value=1.0 if ok else 0.0, label="pass" if ok else "fail",
                     explanation=f"Estimated ${est['total_usd']:,} against a ${budget:,} budget.")


@scorer(name="Correct local currency", evaluator_type="code",
        description="Prices are converted to the destination's currency")
def correct_local_currency(input, output, expected):
    want = expected.get("currency")
    got = (output.get("currency") or {}).get("to_currency")
    if want is None:
        ok = got is None
        return EvalScore(name="Correct local currency", value=1.0 if ok else 0.0, label="pass" if ok else "fail",
                         explanation="No conversion needed for a US destination." if ok
                         else f"Converted to {got} for a US destination.")
    ok = got == want
    return EvalScore(name="Correct local currency", value=1.0 if ok else 0.0, label="pass" if ok else "fail",
                     explanation=f"Converted to {got}." if ok else f"Expected {want}, got {got or 'no conversion'}.")


@scorer(name="Response time", threshold=RESPONSE_TIME_BUDGET_S, direction="minimize", score_min=0,
        evaluator_type="code", description=f"End-to-end answer time in seconds, budget {RESPONSE_TIME_BUDGET_S} s")
def response_time(input, output, expected):
    took = output["elapsed_s"]
    return EvalScore(name="Response time", value=took, explanation=f"Answered in {took:.1f} s.")


SUITE_SCORERS = [plan_is_complete, stays_on_destination, respects_budget, correct_local_currency, response_time]


def _planner_version(url: str) -> str | None:
    try:
        return requests.get(f"{url}/health", timeout=5).json().get("agent_version")
    except (requests.RequestException, ValueError):
        return None


def run_suite() -> None:
    """Run the suite against the released planner and, when present, the candidate release."""
    targets = [("release", TRAVEL_PLANNER_URL)]
    if TRAVEL_PLANNER_CANDIDATE_URL:
        targets.append(("candidate", TRAVEL_PLANNER_CANDIDATE_URL))
    started = datetime.now(timezone.utc)
    for role, url in targets:
        version = _planner_version(url) or PLANNER_AGENT_VERSION
        _planner_url["value"] = url
        if role == "candidate":
            description = (f"Release check of the {version} candidate on {len(SUITE)} trip requests "
                           "(single city, budgets, no dates, families, unknown cities, sub-agent outages) "
                           "before it is promoted.")
        else:
            description = f"Baseline: the released {version} planner on the same {len(SUITE)} trip requests."
        result = evaluate(
            name=SUITE_NAME,
            task=plan_trip,
            data=SUITE,
            scores=SUITE_SCORERS,
            agent_name=PLANNER_AGENT_NAME,
            agent_version=version,
            run_name=f"{version} {role}, {started:%b %d %H:%M} UTC",
            run_description=description,
            metadata={"app.canary": "agent-eval-canary", "release.role": role},
        )
        for case in result.cases:
            failed = sorted(k for k, v in (case.verdicts or {}).items() if v == "fail")
            if case.status != "pass" and case.trace_id:
                log_on_span(logging.WARNING if case.status == "fail" else logging.ERROR, case.trace_id, case.span_id,
                            "Test case %s %s: %s", case.case_id, case.status,
                            ", ".join(failed) or case.error_type or "error",
                            **{"test.case.id": case.case_id, "test.suite.name": SUITE_NAME})
        summary = result.summary
        log.info("Suite run %s (%s %s): %d pass, %d fail, %d error", summary.run_id, role, version,
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
                done = retriever.find_evaluated_trace_ids([r.trace_id for r in roots], evaluator=PRODUCTION_EVALUATOR)
                pending = [r for r in roots if r.trace_id not in done and r.trace_id not in recently_scored]
                log.info("Online: %d recent agent traces, %d to evaluate", len(roots), len(pending))
                for root in pending:
                    try:
                        production_checks(retriever, root)
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
