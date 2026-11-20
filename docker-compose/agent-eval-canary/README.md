# Agent Eval Canary (deterministic)

Evaluates the example agents with code checks: no LLM and no cost. It uses the
[OpenSearch GenAI SDK](https://github.com/opensearch-project/genai-observability-sdk-py) (installed
0.3.0 or later from PyPI).

Runs with the example services when the local OpenSearch backend is used (`local-backends`
profile, see `COMPOSE_PROFILES` in `.env`).

On AWS (an OpenSearch Service domain or an OpenSearch Serverless collection) it runs under the
`aws-evals` profile and reads spans with SigV4, using the default AWS credential chain (the EC2
instance role on the demo instance). The CDK stack and the CLI installer set this up on the demo
instance. To run it yourself:

| Variable | Value |
|---|---|
| `COMPOSE_PROFILES` | `aws-evals` |
| `EVAL_CANARY_OPENSEARCH_URL` | `https://<domain or collection endpoint>` |
| `OPENSEARCH_AWS_SERVICE` | `es` (domain) or `aoss` (collection) |
| `AWS_REGION` | the domain or collection region |
| `OPENSEARCH_SPAN_INDEX` | optional, default `otel-v1-apm-span*` |

The credentials need read access to two index patterns only: `otel-v1-apm-span*` (the spans it
scores) and `otel-v1-genai-evaluation*` (to skip traces it already graded).

- Domain: `es:ESHttpGet` and `es:ESHttpPost` (`_search` is a POST) on
  `<domain ARN>/otel-v1-apm-span*` and `<domain ARN>/otel-v1-genai-evaluation*`, plus a mapping
  to the `readall` security role when fine-grained access control is on. A request needs both,
  so the IAM resources keep it to those indices.
- Collection: `aoss:APIAccessAll` on the collection ARN (the only IAM data-plane action for API
  calls) plus a data access policy with `aoss:DescribeIndex` and `aoss:ReadDocument` on
  `index/<collection>/otel-v1-apm-span*` and `index/<collection>/otel-v1-genai-evaluation*`. Results
go through the collector, so the pipeline writes them, not the canary.

Every result is a `gen_ai.evaluation.result` OTel log event. Data Prepper routes it to the
`otel-v1-genai-evaluation` write alias, where it joins the evaluated trace on `traceId` /
`spanId`. The canary's own logs are OTel logs too: a failed result is logged at WARN with the
evaluated span's trace and span ids, so Agent Traces shows it on that trace, next to the agents'
own WARN / ERROR logs.

## What it evaluates

### Online, span level (every `EVAL_CANARY_INTERVAL` seconds)

`OpenSearchTraceRetriever.list_root_spans()` lists recent agent roots of `travel-planner`,
`weather-agent` and `events-agent`; `find_evaluated_trace_ids(evaluator="trace_health_check")`
skips traces this canary already graded (other evaluators do not block it). Each agent root span
gets four results from evaluator `trace_health_check` (type `code`), with its agent name and
version:

| Evaluation | Measures | Pass rule |
|---|---|---|
| `span_coverage` | input, output and tool spans present | `>= 0.67` |
| `error_free` | no span of the trace has ERROR status | label `pass` / `fail` |
| `tool_call_success_rate` | tool calls that returned data | `>= 0.75` |
| `tool_diversity` | unique tools / tool calls (catches loops) | `>= 0.34` |

### Online, session level

Travel planner turns that share a `gen_ai.conversation.id` (the canary service sends a "deep"
comparison as one session) are graded once the session is idle for
`EVAL_CANARY_SESSION_IDLE_SECONDS`: `session_success_rate` (evaluator `session_health_check`,
`score(conversation_id=...)`, level `session`), the share of turns answered without a sub-agent
failure.

### Offline test suite (every `EVAL_CANARY_SUITE_INTERVAL_MINUTES`)

`evaluate()` runs the `travel_planner_smoke` suite against the running travel planner as a named
eval run (`run_name` "canary <time> UTC", `run_description`). The task is an `invoke_agent`
CLIENT span that calls the planner over HTTP; the planner continues the trace, so each case is one
trace with the planner's spans and logs below the case's root span.

| Case | Fault | Expected |
|---|---|---|
| `paris-ok`, `tokyo-ok` | none | pass |
| `london-weather-tool-error` | weather tool error | fail: `plan_complete`, `no_sub_agent_errors` |
| `berlin-wrong-city-events` | events agent answers for Tokyo | fail: `no_foreign_attractions` |
| `sydney-events-rate-limited` | events agent rate limited | fail: `plan_complete`, `no_sub_agent_errors` |

Scorers (each named scorer is its own evaluator):

- `plan_complete` (threshold 1.0), `no_sub_agent_errors` (bool), `latency_budget`
  (`direction="minimize"`, threshold 15 s), `answer_relevance` (threshold 1.0),
  `no_foreign_attractions` (bool): `@scorer` declarations with `evaluator_type` and a description.
- `keyword_overlap`: a library-style metric. Its `EvalScore` names its own evaluator
  (`lib.keyword_overlap`) and rule, so the scorer's declarations do not apply to it. It shares the
  evaluation name `answer_relevance` with the scorer above, so its local result key is
  `answer_relevance (lib.keyword_overlap)`.

The canary logs each case's result keys and, for a failed case, a WARN log on the case's root
span.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `EVAL_CANARY_INTERVAL` | `120` | Seconds between cycles |
| `EVAL_CANARY_LOOKBACK_MINUTES` | `15` | How far back to look for traces |
| `EVAL_CANARY_SUITE_INTERVAL_MINUTES` | `30` | Minutes between suite runs; `0` turns the suite off |
| `EVAL_CANARY_SESSION_IDLE_SECONDS` | `90` | Grade a session once its newest turn is this old |
| `TRAVEL_PLANNER_URL` | `http://travel-planner:8000` | Planner the suite calls |

## Running with the LLM canary

The [LLM canary](../agent-eval-canary-llm/README.md) grades the same traces with an LLM judge.
Each canary skips only the traces its own evaluators graded, so both can run together.

## Check the results

```bash
curl -sk -u 'admin:My_password_123!@#' 'https://localhost:9200/otel-v1-genai-evaluation/_search?size=0' \
  -H 'content-type: application/json' -d '{"aggs":{"evaluators":{"terms":{"field":"attributes.opensearch.gen_ai.evaluation.evaluator.name"}}}}'
```
