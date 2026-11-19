# LLM Eval Canary (LLM-as-judge)

Evaluates the example agents with an LLM judge on Amazon Bedrock. Opt-in: it needs AWS
credentials with Bedrock access. It uses the
[OpenSearch GenAI SDK](https://github.com/opensearch-project/genai-observability-sdk-py) (installed
from git `main` until 0.3.0 is on PyPI) and [Strands Evals](https://github.com/strands-agents/evals).

Enable it by uncommenting `INCLUDE_COMPOSE_AGENT_EVAL_LLM` in `.env`.

Results are `gen_ai.evaluation.result` OTel log events, routed by Data Prepper to the
`otel-v1-genai-evaluation` write alias. A failed result is also logged at WARN with the evaluated
span's trace and span ids, so Agent Traces shows it on that trace.

## What it evaluates

### Online (every `EVAL_CANARY_LLM_INTERVAL` seconds)

Recent agent roots of `travel-planner`, `weather-agent` and `events-agent`
(`OpenSearchTraceRetriever.list_root_spans()`). Each evaluator skips the traces it already graded
(`find_evaluated_trace_ids(evaluator=...)`); up to `EVAL_CANARY_LLM_MAX_PER_CYCLE` evaluations
per cycle.

| Evaluation | Evaluator | What it records |
|---|---|---|
| `answer_quality` (1 to 5, pass at 4) | `answer_quality_judge` (this canary) | Judge context: `evaluator_description`, `judge_model`, `judge_prompt_name` `answer-quality`, `judge_prompt_version`. The judge call is its own traced `chat` span with the judge prompt as `gen_ai.system_instructions`; the result links it with `judge_trace_id`. A judge failure is an error result (`error.type`, no score) |
| `helpfulness` (0 to 1, pass at 0.5) | `strands_evals.helpfulness` (library) | Strands Evals `HelpfulnessEvaluator` score; its category ("Very helpful", ...) is kept as the judge label; the result names the library's evaluator, not this canary. The library's judge agent runs below a `chat` span, linked with `judge_trace_id` |

### Offline test suite (first after `EVAL_CANARY_LLM_SUITE_FIRST_RUN_MINUTES`, then every `EVAL_CANARY_LLM_SUITE_INTERVAL_MINUTES`)

`evaluate()` runs `travel_planner_judged` against the running travel planner as a named run
(`run_name` "llm judge <time> UTC"). Cases `rome-ok` and `barcelona-ok` should pass;
`amsterdam-wrong-city-events` makes the events agent answer for Mumbai and should fail.

- `answer_quality`: the judge as a `@scorer` that declares its evaluator, pass rule and judge
  context. The declaration goes only on its own results.
- `complete_plan`: a code check whose `EvalScore` names another evaluator
  (`plan_sections_check`), so it gets none of the judge's fields.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `EVAL_CANARY_LLM_INTERVAL` | `60` | Seconds between cycles |
| `EVAL_CANARY_LLM_LOOKBACK_MINUTES` | `10` | How far back to look for traces |
| `EVAL_CANARY_LLM_MAX_PER_CYCLE` | `20` | Max online evaluations per cycle |
| `EVAL_CANARY_LLM_CONCURRENCY` | `8` | Parallel Bedrock calls |
| `EVAL_CANARY_LLM_SUITE_FIRST_RUN_MINUTES` | `5` | Minutes after start before the first suite run |
| `EVAL_CANARY_LLM_SUITE_INTERVAL_MINUTES` | `360` | Minutes between suite runs (6 hours); `0` turns the suite off |
| `EVAL_JUDGE_MODEL` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock model or inference profile of the judge |

AWS credentials must be in the environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_SESSION_TOKEN`, `AWS_REGION`).

## Running with the deterministic canary

Both canaries grade the same traces with different evaluators and skip only what their own
evaluators already graded, so they run together without duplicates.
