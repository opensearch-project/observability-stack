"""
Agent Evals — End-to-end loop using strands-evals + OpenSearchProvider

  1. Fetch agent traces from OpenSearch via strands-evals OpenSearchProvider
     (which wraps genai-observability-sdk-py under the hood)
  2. Run an LLM-as-judge evaluator (HelpfulnessEvaluator, Bedrock Claude)
  3. Write score spans back to OpenSearch as OTel GenAI spans

Prerequisites:
  - observability-stack running (docker compose up)
  - Agent traces indexed in OpenSearch (run any example agent first)
  - AWS credentials with Bedrock access for LLM-as-judge
  - pip install strands-agents-evals[opensearch] opensearch-genai-observability-sdk-py

Usage:
  python main.py <session_id>
  python main.py --trace-id <trace_id>
"""

import argparse
import os
import sys
import uuid

os.environ.setdefault("OTEL_SERVICE_NAME", "genai-evals")
# Surface strands evaluator LLM call spans in the trace waterfall
os.environ.setdefault("STRANDS_OTEL_ENABLE", "true")

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

from opensearch_genai_observability_sdk_py.score import score
from strands_evals.evaluators import HelpfulnessEvaluator
from strands_evals.providers import OpenSearchProvider, SessionNotFoundError
from strands_evals.types.evaluation import EvaluationData
from strands_evals.types.trace import AgentInvocationSpan


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OPENSEARCH_HOST = os.environ.get("OPENSEARCH_HOST", "https://localhost:9200")
OPENSEARCH_USER = os.environ.get("OPENSEARCH_USER", "admin")
OPENSEARCH_PASS = os.environ.get("OPENSEARCH_PASS", "My_password_123!@#")
OTEL_COLLECTOR_GRPC = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317")
JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "us.anthropic.claude-sonnet-4-20250514-v1:0")


def _setup_otel() -> TracerProvider:
    tp = TracerProvider()
    tp.add_span_processor(
        SimpleSpanProcessor(OTLPSpanExporter(endpoint=OTEL_COLLECTOR_GRPC, insecure=True))
    )
    trace.set_tracer_provider(tp)
    return tp


def _last_agent_invocation(session) -> AgentInvocationSpan | None:
    """Return the last AgentInvocationSpan in the session, or None.

    Mirrors OpenSearchProvider._extract_output so score/input anchor on the
    same span as the evaluated output.
    """
    for trace in reversed(session.traces):
        for span in reversed(trace.spans):
            if isinstance(span, AgentInvocationSpan):
                return span
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Run agent evals on stored traces")
    parser.add_argument("session_id", nargs="?", help="Conversation ID")
    parser.add_argument("--trace-id", help="Target a specific trace ID")
    args = parser.parse_args()

    identifier = args.trace_id or args.session_id
    if not identifier:
        parser.error("provide session_id or --trace-id")

    run_id = str(uuid.uuid4())
    tp = _setup_otel()

    # --- Retrieve traces + build EvaluationData via OpenSearchProvider ---
    provider = OpenSearchProvider(
        host=OPENSEARCH_HOST,
        auth=(OPENSEARCH_USER, OPENSEARCH_PASS),
        verify_certs=False,
    )

    print(f"\n🔍 Fetching evaluation data for: {identifier}")
    try:
        data = provider.get_evaluation_data(session_id=identifier)
    except SessionNotFoundError:
        print(f"❌ No traces found for {identifier}.")
        sys.exit(1)

    output = data["output"]
    session = data["trajectory"]
    anchor = _last_agent_invocation(session)
    if not anchor:
        print("❌ No invoke_agent span found to anchor score.")
        sys.exit(1)
    trace_id = anchor.span_info.trace_id
    span_id = anchor.span_info.span_id
    user_input = anchor.user_prompt

    print(f"✅ Session loaded — output: {output[:120]!r}")

    # --- Evaluate (LLM-as-judge via Bedrock) ---
    print(f"\n🧠 Running HelpfulnessEvaluator ({JUDGE_MODEL})…")
    eval_name = f"eval-{identifier[:16]}"
    evaluator = HelpfulnessEvaluator(model=JUDGE_MODEL)
    results = evaluator.evaluate(
        EvaluationData(
            input=user_input,
            actual_output=output,
            actual_trajectory=session,
            name=eval_name,
        )
    )

    # --- Write score spans back ---
    for r in results:
        print(f"   📊 {r.score:.3f} ({r.label})  pass={r.test_pass}")
        if r.reason:
            print(f"   💬 {r.reason[:200]}")

        score(
            name="helpfulness",
            value=r.score,
            trace_id=trace_id,
            span_id=span_id,
            label=str(r.label),
            explanation=r.reason[:500] if r.reason else None,
            attributes={
                "test.suite.run.id": run_id,
                "test.suite.name": "helpfulness_eval",
                "test.case.id": eval_name,
                "test.case.result.status": "pass" if r.test_pass else "fail",
            },
        )

    tp.force_flush()
    print("\n✅ Score spans emitted — check OpenSearch Dashboards.\n")


if __name__ == "__main__":
    main()
