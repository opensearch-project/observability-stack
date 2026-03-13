"""
Agent Evals with GenAI Observability SDK — Full E2E Loop

  1. Retrieve agent traces from OpenSearch
  2. Run evaluation (LLM-as-judge or mock)
  3. Write evaluation scores back to OpenSearch as OTel spans

Prerequisites:
  - observability-stack running (docker compose up)
  - Agent traces indexed in OpenSearch (run any example agent first)
  - For LLM mode: AWS credentials + pip install strands-agents strands-agents-evals
  - For mock mode (--mock): no AWS credentials needed

Usage:
  python main.py <session_id>           # LLM-as-judge (Bedrock Claude)
  python main.py --mock <session_id>    # Mock evaluator (no AWS needed)
"""

import argparse
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

# Enable strands evaluator agent telemetry to see eval LLM call spans
os.environ["STRANDS_OTEL_ENABLE"] = "true"
os.environ.setdefault("OTEL_SERVICE_NAME", "genai-evals")

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

from opensearch_genai_observability_sdk_py.retrieval import (
    OpenSearchTraceRetriever,
    SessionRecord,
    SpanRecord,
)
from opensearch_genai_observability_sdk_py.score import score


# ---------------------------------------------------------------------------
# Mock evaluator (no AWS/LLM dependency)
# ---------------------------------------------------------------------------

@dataclass
class EvalResult:
    score: float
    label: str
    test_pass: bool
    reason: str


# Canned results for known canary sessions
_MOCK_RESULTS: dict[str, EvalResult] = {
    "conv_c5d2": EvalResult(
        score=0.833,
        label="Very helpful",
        test_pass=True,
        reason="The assistant was transparent about not having weather access "
        "and provided practical alternatives.",
    ),
}

# Default for unknown sessions
_MOCK_DEFAULT = EvalResult(
    score=0.5,
    label="Somewhat helpful",
    test_pass=True,
    reason="Mock evaluation — no LLM judge was used.",
)


def mock_evaluate(session_id: str) -> EvalResult:
    """Return canned eval result matching session_id prefix."""
    for prefix, result in _MOCK_RESULTS.items():
        if session_id.startswith(prefix):
            return result
    return _MOCK_DEFAULT


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OPENSEARCH_HOST = os.environ.get("OPENSEARCH_HOST", "https://localhost:9200")
OPENSEARCH_USER = os.environ.get("OPENSEARCH_USER", "admin")
OPENSEARCH_PASS = os.environ.get("OPENSEARCH_PASS", "My_password_123!@#")
OTEL_COLLECTOR_GRPC = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317")


# ---------------------------------------------------------------------------
# Bridge: genai-sdk SessionRecord → strands Session (lazy, LLM mode only)
# ---------------------------------------------------------------------------

def to_strands_session(rec: SessionRecord):
    """Convert framework-agnostic SessionRecord to strands-evals Session."""
    from strands_evals.types.trace import (
        AgentInvocationSpan,
        InferenceSpan,
        Role,
        Session,
        SpanInfo,
        TextContent,
        Trace,
        UserMessage,
        AssistantMessage,
    )

    traces = []
    for tr in rec.traces:
        spans = []
        for sp in tr.spans:
            span_info = SpanInfo(
                trace_id=sp.trace_id,
                span_id=sp.span_id,
                session_id=rec.session_id,
                parent_span_id=sp.parent_span_id or None,
                start_time=_parse_time(sp.start_time),
                end_time=_parse_time(sp.end_time),
            )

            if sp.operation_name == "invoke_agent":
                user_prompt = sp.input_messages[0].content if sp.input_messages else ""
                agent_response = sp.output_messages[0].content if sp.output_messages else ""
                spans.append(AgentInvocationSpan(
                    span_info=span_info,
                    user_prompt=user_prompt,
                    agent_response=agent_response,
                    available_tools=[],
                ))
            elif sp.operation_name == "chat" and sp.input_messages:
                messages = []
                for m in sp.input_messages:
                    messages.append(UserMessage(role=Role.USER, content=[TextContent(text=m.content)]))
                for m in sp.output_messages:
                    messages.append(AssistantMessage(role=Role.ASSISTANT, content=[TextContent(text=m.content)]))
                spans.append(InferenceSpan(span_info=span_info, messages=messages))

        if spans:
            traces.append(Trace(spans=spans, trace_id=tr.trace_id, session_id=rec.session_id))

    return Session(traces=traces, session_id=rec.session_id)


def _parse_time(ts: str) -> datetime:
    if not ts:
        return datetime.now(tz=timezone.utc)
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(tz=timezone.utc)


def _find_root_agent_span(rec: SessionRecord) -> SpanRecord | None:
    """Find the top-level invoke_agent span."""
    for tr in rec.traces:
        for s in tr.spans:
            if s.operation_name == "invoke_agent" and s.input_messages and s.output_messages:
                return s
    # Fallback: any invoke_agent
    for tr in rec.traces:
        for s in tr.spans:
            if s.operation_name == "invoke_agent":
                return s
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Run agent evals on stored traces")
    parser.add_argument("session_id", help="Conversation ID or trace ID")
    parser.add_argument("--mock", action="store_true", help="Use mock evaluator (no AWS needed)")
    args = parser.parse_args()

    session_id = args.session_id

    # --- Step 0: Setup OTel export for score write-back ---
    run_id = str(uuid.uuid4())
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(
        OTLPSpanExporter(endpoint=OTEL_COLLECTOR_GRPC, insecure=True)
    ))
    trace.set_tracer_provider(provider)

    # --- Step 1: Retrieve traces ---
    print(f"\n🔍 Retrieving session: {session_id}")
    retriever = OpenSearchTraceRetriever(
        host=OPENSEARCH_HOST,
        auth=(OPENSEARCH_USER, OPENSEARCH_PASS),
        verify_certs=False,
    )
    session_rec = retriever.get_traces(session_id)

    if not session_rec.traces:
        print("❌ No traces found.")
        sys.exit(1)

    root = _find_root_agent_span(session_rec)
    if not root:
        print("❌ No invoke_agent span found.")
        sys.exit(1)

    user_input = root.input_messages[0].content if root.input_messages else "N/A"
    agent_output = root.output_messages[0].content if root.output_messages else "N/A"
    print(f"✅ Found root agent span: {root.name}")
    print(f"   📥 Input:  {user_input[:120]}")
    print(f"   📤 Output: {agent_output[:120]}")

    # --- Step 2: Evaluate ---
    eval_name = f"eval-{session_id[:16]}"

    if args.mock:
        print("\n🧠 Running MockEvaluator...")
        r = mock_evaluate(session_id)
        results = [r]
    else:
        # Lazy import — strands only needed for LLM mode
        from strands_evals.evaluators import HelpfulnessEvaluator
        from strands_evals.types.evaluation import EvaluationData

        print("\n🧠 Running HelpfulnessEvaluator (Bedrock Claude)...")
        strands_session = to_strands_session(session_rec)
        eval_data = EvaluationData(
            input=user_input,
            actual_output=agent_output,
            actual_trajectory=strands_session,
            name=eval_name,
        )
        evaluator = HelpfulnessEvaluator(model="us.anthropic.claude-sonnet-4-20250514-v1:0")
        results = evaluator.evaluate(eval_data)

    for r in results:
        print(f"   📊 Score: {r.score:.3f} ({r.label})")
        print(f"   ✅ Pass:  {r.test_pass}")
        print(f"   💬 Reason: {r.reason[:200] if r.reason else 'N/A'}")

        # --- Step 3: Write score back to OpenSearch ---
        print("\n📝 Writing score span to OpenSearch...")
        score(
            name="helpfulness",
            value=r.score,
            trace_id=root.trace_id,
            span_id=root.span_id,
            label=str(r.label),
            explanation=r.reason[:500] if r.reason else None,
            attributes={
                "test.suite.run.id": run_id,
                "test.suite.name": "helpfulness_eval",
                "test.case.id": eval_name,
                "test.case.result.status": "pass" if r.test_pass else "fail",
            },
        )
        provider.force_flush()
        print("   ✅ Score span emitted — check OpenSearch Dashboards!")

    print()


if __name__ == "__main__":
    main()
