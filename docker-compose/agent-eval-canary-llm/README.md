# LLM Eval Canary (LLM-as-Judge)

Periodically evaluates agent traces using HelpfulnessEvaluator (Bedrock Claude). Opt-in — requires AWS credentials.

Enable by uncommenting `INCLUDE_COMPOSE_AGENT_EVAL_LLM` in `.env`.

## Evaluation Signals

Emits **1 evaluation span** per trace:

| Eval Name | What it measures | Value |
|---|---|---|
| `helpfulness` | LLM judges whether the agent's response addressed the user's request | 0.0–1.0 (7-point scale) |

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `EVAL_CANARY_LLM_INTERVAL` | `60` | Seconds between poll cycles |
| `EVAL_CANARY_LLM_LOOKBACK_MINUTES` | `10` | How far back to search for traces |
| `EVAL_CANARY_LLM_MAX_PER_CYCLE` | `20` | Max traces to evaluate per cycle |
| `EVAL_CANARY_LLM_CONCURRENCY` | `8` | Parallel Bedrock calls |
| `EVAL_JUDGE_MODEL` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | Bedrock model ID |

AWS credentials must be available in the environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).

## Running with the Deterministic Canary

Both canaries can run simultaneously without duplicating scores. Each deduplicates by its own evaluation name — this canary checks for existing `helpfulness` scores, the deterministic canary checks for `span_coverage`. Neither blocks the other.

A trace scored by both gets **5 evaluation spans**:

```
invoke_agent Events Agent
├── evaluation span_coverage            (deterministic)
├── evaluation error_free               (deterministic)
├── evaluation tool_call_success_rate   (deterministic)
├── evaluation tool_diversity           (deterministic)
└── evaluation helpfulness              (LLM-as-judge)
```

## OTel Compliance

All evaluation spans follow [OTel GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/):

- `gen_ai.operation.name = "evaluation"`
- `gen_ai.evaluation.name = "helpfulness"`
- `gen_ai.evaluation.score.value` — numeric score
- `gen_ai.evaluation.score.label` — human-readable label (e.g. "Very helpful", "Somewhat unhelpful")
- `gen_ai.evaluation.explanation` — LLM's reasoning
- `gen_ai.evaluation.result` event emitted per span

Score spans attach as children of the evaluated agent's `invoke_agent` span, so they appear in the same trace waterfall in OpenSearch Dashboards.
