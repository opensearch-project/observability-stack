# Agent Eval Canary (Deterministic)

Periodically scores un-evaluated agent traces with deterministic signals. No LLM, no AWS credentials, zero cost.

Included by default with the example services (`docker-compose.examples.yml`).

## Evaluation Signals

Emits **4 evaluation spans** per trace:

| Eval Name | What it measures | Value |
|---|---|---|
| `span_coverage` | Instrumentation health — input, output, and tool spans present | 0.0 / 0.33 / 0.67 / 1.0 |
| `error_free` | No span in the trace has `status.code=ERROR` | 0 or 1 |
| `tool_call_success_rate` | Fraction of tool calls that returned non-empty results | 0.0–1.0 |
| `tool_diversity` | Unique tools / total tool calls (catches looping) | 0.0–1.0 |

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `EVAL_CANARY_INTERVAL` | `120` | Seconds between poll cycles |
| `EVAL_CANARY_LOOKBACK_MINUTES` | `15` | How far back to search for traces |

## Running with the LLM Canary

Both canaries can run simultaneously without duplicating scores. Each deduplicates by its own evaluation name — this canary checks for existing `span_coverage` scores, the LLM canary checks for `helpfulness`. Neither blocks the other.

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
- `gen_ai.evaluation.name` — the eval name
- `gen_ai.evaluation.score.value` — numeric score
- `gen_ai.evaluation.score.label` — human-readable label
- `gen_ai.evaluation.explanation` — reasoning or details
- `gen_ai.evaluation.result` event emitted per span

Score spans attach as children of the evaluated agent's `invoke_agent` span, so they appear in the same trace waterfall in OpenSearch Dashboards.
