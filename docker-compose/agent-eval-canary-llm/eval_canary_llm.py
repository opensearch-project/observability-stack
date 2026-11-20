"""LLM eval canary: LLM-as-judge online and offline evaluations of the example agents (Bedrock).

Complements the deterministic agent-eval-canary. Every cycle (EVAL_CANARY_LLM_INTERVAL seconds):

1. Online: lists recent agent roots in OpenSearch (OpenSearchTraceRetriever), skips the traces
   each evaluator already graded (find_evaluated_trace_ids by evaluator), and grades up to
   MAX_PER_CYCLE of them:
   - answer_quality, by this canary's own judge (answer_quality_judge, a Bedrock Converse call).
     The judge call is traced as its own chat span with the judge prompt as
     gen_ai.system_instructions; the result carries the judge context (evaluator description,
     judge model, judge prompt name and version) and links the judge's trace (judge_trace_id).
   - helpfulness, by the Strands Evals HelpfulnessEvaluator: a library result that names the
     library's evaluator (strands_evals.helpfulness), not this canary.
2. Offline, EVAL_CANARY_LLM_SUITE_FIRST_RUN_MINUTES after start and then every
   EVAL_CANARY_LLM_SUITE_INTERVAL_MINUTES: runs the travel_planner_judged suite
   with evaluate() against the running travel planner, as a named run. The judge is a @scorer that
   declares its judge context, so only its own results get it. One case injects a fault and is
   expected to fail.

Results are gen_ai.evaluation.result log events, routed by Data Prepper to the
otel-v1-genai-evaluation write alias. A failed result is also logged at WARN with the evaluated
span's trace and span ids, so Agent Traces shows it on that trace.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import boto3
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

OS_HOST = os.environ.get("OPENSEARCH_HOST", "https://opensearch:9200")
OS_USER = os.environ.get("OPENSEARCH_USER", "admin")
OS_PASS = os.environ.get("OPENSEARCH_PASSWORD", "admin")
OTEL_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317")
INTERVAL = int(os.environ.get("EVAL_CANARY_LLM_INTERVAL", "60"))
LOOKBACK_MINUTES = int(os.environ.get("EVAL_CANARY_LLM_LOOKBACK_MINUTES", "10"))
MAX_PER_CYCLE = int(os.environ.get("EVAL_CANARY_LLM_MAX_PER_CYCLE", "20"))
CONCURRENCY = int(os.environ.get("EVAL_CANARY_LLM_CONCURRENCY", "8"))
SUITE_INTERVAL_MINUTES = int(os.environ.get("EVAL_CANARY_LLM_SUITE_INTERVAL_MINUTES", "360"))
# The first suite run waits for the stack and the agents to warm up
SUITE_FIRST_RUN_MINUTES = float(os.environ.get("EVAL_CANARY_LLM_SUITE_FIRST_RUN_MINUTES", "5"))
JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")
TRAVEL_PLANNER_URL = os.environ.get("TRAVEL_PLANNER_URL", "http://travel-planner:8000")
PLANNER_AGENT_NAME = "Travel Planner"
PLANNER_AGENT_VERSION = os.environ.get("PLANNER_AGENT_VERSION", "1.3.0")

JUDGE_EVALUATOR = "answer_quality_judge"
JUDGE_PROMPT_NAME = "answer-quality"
JUDGE_PROMPT_VERSION = "v2"
JUDGE_DESCRIPTION = "Answer covers what the agent was asked for and is grounded in its tool results"
JUDGE_PROMPT = (
    "You grade the final answer of an AI travel agent. Its job is a short trip summary for one "
    "destination: current weather, a few attractions, a flight option and the currency rate. "
    "Do not expect hotels, itineraries or other details it was not asked for. Score from 1 "
    "(wrong or useless) to 5 (covers its job, consistent and specific). Score 2 or lower when "
    "the answer recommends attractions of another city than the destination, or says weather or "
    "attractions are unavailable. "
    'Reply with JSON only: {"score": <1-5>, "reason": "<one sentence>"}'
)
HELPFULNESS_EVALUATOR = "strands_evals.helpfulness"

TARGET_SERVICES = ["travel-planner", "weather-agent", "events-agent"]

register(
    endpoint=f"grpc://{OTEL_ENDPOINT.replace('http://', '').replace('grpc://', '')}",
    service_name="agent-eval-canary-llm",
    service_version="0.3.0",
)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=get_logger_provider()))
for noisy in ("urllib3", "opensearch", "botocore", "strands", "httpx"):
    logging.getLogger(noisy).setLevel(logging.ERROR)
log = logging.getLogger("agent-eval-canary-llm")

_bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)


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
# The judge
# ---------------------------------------------------------------------------

@observe(name=JUDGE_EVALUATOR, op=Op.CHAT)
def judge(question: str, answer: str) -> tuple[float, str, str]:
    """One Bedrock call; returns (score 1-5, reason, judge trace id).

    A chat span (no agent name), so Agent Traces and list_root_spans() never treat the judge as
    an agent. The full judge prompt goes here, on the judge's own span, never on a result.
    """
    judge_trace_id = format(trace.get_current_span().get_span_context().trace_id, "032x")
    user = f"Request:\n{question}\n\nAnswer:\n{answer}"
    enrich(
        model=JUDGE_MODEL,
        provider="aws.bedrock",
        system_instructions=JUDGE_PROMPT,
        input_messages=[{"role": "user", "parts": [{"type": "text", "content": user}]}],
    )
    resp = _bedrock.converse(
        modelId=JUDGE_MODEL,
        system=[{"text": JUDGE_PROMPT}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        inferenceConfig={"maxTokens": 300, "temperature": 0},
    )
    text = "".join(c.get("text", "") for c in resp["output"]["message"]["content"])
    usage = resp.get("usage", {})
    enrich(
        input_tokens=usage.get("inputTokens"),
        output_tokens=usage.get("outputTokens"),
        finish_reason=resp.get("stopReason"),
        output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": text}]}],
    )
    match = re.search(r"\{.*\}", text, re.S)
    verdict = json.loads(match.group(0) if match else text)
    return float(verdict["score"]), str(verdict.get("reason", ""))[:1000], judge_trace_id


JUDGE_CONTEXT = dict(
    evaluator=JUDGE_EVALUATOR,
    evaluator_type="llm_judge",
    evaluator_description=JUDGE_DESCRIPTION,
    judge_model=JUDGE_MODEL,
    judge_prompt_name=JUDGE_PROMPT_NAME,
    judge_prompt_version=JUDGE_PROMPT_VERSION,
)


# ---------------------------------------------------------------------------
# Online
# ---------------------------------------------------------------------------

def _text(messages) -> str:
    return "\n".join(m.content for m in messages if getattr(m, "content", None))


def judge_trace(root) -> str:
    question = _text(root.input_messages[:1])
    answer = _text(root.output_messages[-1:])
    if not answer:
        return "skip:no_output"
    common = dict(trace_id=root.trace_id, span_id=root.span_id,
                  agent_name=root.agent_name or None, agent_version=root.agent_version or None)
    try:
        value, reason, judge_trace_id = judge(question, answer)
    except Exception as e:  # noqa: BLE001 - an evaluator failure is an error result
        score("answer_quality", error_type=type(e).__name__, **common, **JUDGE_CONTEXT)
        log_on_span(logging.ERROR, root.trace_id, root.span_id, "Judge %s failed: %s",
                    JUDGE_EVALUATOR, type(e).__name__)
        return f"judge_err:{type(e).__name__}"
    score(
        "answer_quality", value,
        explanation=reason, threshold=4, score_min=1, score_max=5,
        judge_trace_id=judge_trace_id, **common, **JUDGE_CONTEXT,
    )
    if value < 4:
        log_on_span(logging.WARNING, root.trace_id, root.span_id,
                    "Evaluation failed for %s: answer_quality=%.0f (%s)", root.agent_name, value, reason[:200],
                    **{"gen_ai.evaluation.evaluator": JUDGE_EVALUATOR})
    return f"ok answer_quality={value:.0f}"


def helpfulness_trace(provider, evaluator, root) -> str:
    """Grade one trace with the Strands Evals HelpfulnessEvaluator (a library evaluator)."""
    from strands_evals.providers import SessionNotFoundError
    from strands_evals.types.evaluation import EvaluationData
    from strands_evals.types.trace import AgentInvocationSpan

    try:
        data = provider.get_evaluation_data(session_id=root.trace_id)
    except SessionNotFoundError:
        return "skip:no_session"
    session = data["trajectory"]
    anchor = next((s for tr in reversed(session.traces) for s in reversed(tr.spans)
                   if isinstance(s, AgentInvocationSpan)), None)
    if anchor is None:
        return "skip:no_anchor"
    # The library runs its own judge agent. Run it below a chat span, so its spans form one judge
    # trace (linked from the result with judge_trace_id) instead of an agent trace of their own.
    with observe(HELPFULNESS_EVALUATOR, op=Op.CHAT):
        enrich(model=JUDGE_MODEL, provider="aws.bedrock")
        judge_trace_id = format(trace.get_current_span().get_span_context().trace_id, "032x")
        results = evaluator.evaluate(EvaluationData(
            input=anchor.user_prompt, actual_output=data["output"], actual_trajectory=session,
            name=f"canary-{root.trace_id[:12]}",
        ))
    r = results[0]
    score(
        "helpfulness", float(r.score),
        trace_id=root.trace_id, span_id=root.span_id,
        # The library's category ("Very helpful", ...) with a pass rule: the SDK stores the
        # verdict as the label and keeps the category as opensearch.gen_ai.evaluation.judge_label
        label=str(r.label) if r.label else None,
        threshold=0.5,
        explanation=(r.reason or "")[:1000] or None,
        score_min=0, score_max=1,
        evaluator=HELPFULNESS_EVALUATOR, evaluator_type="llm_judge", judge_model=JUDGE_MODEL,
        judge_trace_id=judge_trace_id,
        agent_name=root.agent_name or None, agent_version=root.agent_version or None,
    )
    return f"ok helpfulness={r.score:.2f} {r.label}"


def strands_evaluator():
    """The Strands Evals reader and evaluator, or (None, None) if the library is unavailable."""
    try:
        from strands_evals.evaluators import HelpfulnessEvaluator
        from strands_evals.providers import OpenSearchProvider
    except ImportError as e:
        log.warning("strands-agents-evals not available, helpfulness is skipped: %s", e)
        return None, None
    return (OpenSearchProvider(host=OS_HOST, auth=(OS_USER, OS_PASS), verify_certs=False),
            HelpfulnessEvaluator(model=JUDGE_MODEL))


# ---------------------------------------------------------------------------
# Offline: the travel_planner_judged suite
# ---------------------------------------------------------------------------

SUITE = [
    {"case_id": "rome-ok", "case_name": "Rome from Chicago",
     "input": {"destination": "Rome", "origin": "Chicago"}},
    {"case_id": "barcelona-ok", "case_name": "Barcelona from Austin",
     "input": {"destination": "Barcelona", "origin": "Austin"}},
    # Deliberately failing: the events agent answers for another city
    {"case_id": "amsterdam-wrong-city-events", "case_name": "Amsterdam, events for Mumbai",
     "input": {"destination": "Amsterdam", "origin": "Boston",
               "fault": {"events": {"type": "wrong_city", "wrong_city": "mumbai"}}}},
]


@observe(name=PLANNER_AGENT_NAME, op=Op.INVOKE_AGENT, kind=SpanKind.CLIENT)
def plan_trip(case_input: dict) -> dict:
    """The task: call the running travel planner; this CLIENT agent span is the trace's root."""
    question = f"Plan a trip to {case_input['destination']} from {case_input['origin']}"
    enrich(input_messages=[{"role": "user", "parts": [{"type": "text", "content": question}]}])
    headers: dict[str, str] = {}
    inject(headers)
    resp = requests.post(f"{TRAVEL_PLANNER_URL}/plan", json=case_input, headers=headers, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    enrich(output_messages=[{"role": "assistant", "parts": [{"type": "text", "content": data.get("recommendation", "")}]}])
    if data.get("partial"):
        trace.get_current_span().set_status(Status(StatusCode.ERROR, "partial plan"))
        log.warning("Travel planner returned a partial plan for %s", case_input["destination"])
    data["question"] = question
    return data


@scorer(
    name="answer_quality",
    evaluator=JUDGE_EVALUATOR,
    threshold=4, score_min=1, score_max=5,
    evaluator_type="llm_judge",
    description=JUDGE_DESCRIPTION,
    judge_model=JUDGE_MODEL,
    judge_prompt_name=JUDGE_PROMPT_NAME,
    judge_prompt_version=JUDGE_PROMPT_VERSION,
)
def answer_quality(input, output, expected):
    """The judge as a scorer: the declaration (rule, judge context) goes on its own results only."""
    events = ", ".join(e.get("name", "") for e in output.get("events", []))
    answer = f"{output.get('recommendation', '')}\nAttractions returned: {events}"
    value, reason, judge_trace_id = judge(output["question"], answer)
    return EvalScore(name="answer_quality", value=value, explanation=reason, judge_trace_id=judge_trace_id)


def complete_plan(input, output, expected):
    """A code check next to the judge: names its own evaluator, so it gets none of the judge's fields."""
    missing = [k for k in ("weather", "events", "flights", "currency") if not output.get(k)]
    return EvalScore(name="plan_complete", value=0.0 if missing else 1.0, label="fail" if missing else "pass",
                     evaluator="plan_sections_check", evaluator_type="code",
                     explanation=f"missing: {', '.join(missing)}" if missing else "all sections present")


def run_suite() -> None:
    started = datetime.now(timezone.utc)
    result = evaluate(
        name="travel_planner_judged",
        task=plan_trip,
        data=SUITE,
        scores=[answer_quality, complete_plan],
        agent_name=PLANNER_AGENT_NAME,
        agent_version=PLANNER_AGENT_VERSION,
        run_name=f"llm judge {started:%Y-%m-%d %H:%M} UTC",
        run_description=f"LLM-judged suite ({JUDGE_PROMPT_NAME}@{JUDGE_PROMPT_VERSION}); the Amsterdam case should fail",
    )
    for case in result.cases:
        log.info("Suite case %s: %s scores=%s", case.case_id, case.status, case.scores)
        if case.status != "pass" and case.trace_id:
            failed = sorted(k for k, v in (case.verdicts or {}).items() if v == "fail")
            log_on_span(logging.WARNING if case.status == "fail" else logging.ERROR, case.trace_id, case.span_id,
                        "Test case %s %s: %s", case.case_id, case.status,
                        ", ".join(failed) or case.error_type or "error",
                        **{"test.case.id": case.case_id, "test.suite.name": "travel_planner_judged"})
    s = result.summary
    log.info("Suite run %s done: %d pass, %d fail, %d error", s.run_id, s.pass_count, s.fail_count, s.error_count)


def run() -> None:
    retriever = OpenSearchTraceRetriever(host=OS_HOST, auth=(OS_USER, OS_PASS), verify_certs=False)
    provider, helpfulness = strands_evaluator()
    log.info("LLM eval canary started: interval=%ds lookback=%dm max/cycle=%d model=%s",
             INTERVAL, LOOKBACK_MINUTES, MAX_PER_CYCLE, JUDGE_MODEL)

    for attempt in range(30):
        try:
            retriever.list_root_spans(max_results=1)
            log.info("OpenSearch is ready")
            break
        except Exception as e:  # noqa: BLE001
            log.info("Waiting for OpenSearch... (%d/30): %s", attempt + 1, e)
            time.sleep(10)

    recently: dict[str, float] = {}
    next_suite = time.time() + SUITE_FIRST_RUN_MINUTES * 60
    tracer_provider = trace.get_tracer_provider()

    while True:
        cycle_start = time.time()
        try:
            recently = {k: v for k, v in recently.items() if v > time.time() - LOOKBACK_MINUTES * 60}
            roots = retriever.list_root_spans(
                services=TARGET_SERVICES,
                since=datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES),
            )
            ids = [r.trace_id for r in roots]
            judged = retriever.find_evaluated_trace_ids(ids, evaluator=JUDGE_EVALUATOR) if ids else set()
            helped = (retriever.find_evaluated_trace_ids(ids, evaluator=HELPFULNESS_EVALUATOR)
                      if ids and helpfulness else set(ids))
            jobs = []
            for r in roots:
                if r.trace_id not in judged and ("j", r.trace_id) not in recently:
                    jobs.append(("j", r))
                if r.trace_id not in helped and ("h", r.trace_id) not in recently:
                    jobs.append(("h", r))
            jobs = jobs[:MAX_PER_CYCLE]
            log.info("Online: %d recent agent traces, %d evaluations to run", len(roots), len(jobs))
            if jobs:
                with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
                    futures = {
                        pool.submit(judge_trace if kind == "j" else (lambda root: helpfulness_trace(provider, helpfulness, root)), r): (kind, r)
                        for kind, r in jobs
                    }
                    for fut in as_completed(futures):
                        kind, r = futures[fut]
                        try:
                            res = fut.result()
                        except Exception as e:  # noqa: BLE001
                            res = f"err:{type(e).__name__}"
                        recently[(kind, r.trace_id)] = time.time()
                        log.info("Trace %s %s -> %s", r.trace_id[:12], kind, res)

            if SUITE_INTERVAL_MINUTES > 0 and time.time() >= next_suite:
                try:
                    requests.get(f"{TRAVEL_PLANNER_URL}/health", timeout=5).raise_for_status()
                    run_suite()
                    next_suite = time.time() + SUITE_INTERVAL_MINUTES * 60
                except requests.RequestException:
                    log.info("Travel planner not reachable, suite postponed")
            tracer_provider.force_flush()
            log.info("Cycle done in %.1fs", time.time() - cycle_start)
        except Exception:  # noqa: BLE001
            log.exception("Cycle failed")
        time.sleep(max(0, INTERVAL - (time.time() - cycle_start)))


if __name__ == "__main__":
    run()
