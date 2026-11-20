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

The demo runs two releases of the Travel Planner side by side: **1.3.0**, the released version, and
**1.4.0**, a candidate that serves about 20% of conversations. 1.4.0 calls the weather and events
agents in parallel and estimates the trip cost against the user's budget, but it skips the weather
forecast when the request has no travel dates. The evaluations below surface both the gains and
the regression.

### Online: production checks (every `EVAL_CANARY_INTERVAL` seconds)

`OpenSearchTraceRetriever.list_root_spans()` lists recent agent traces of `travel-planner`,
`weather-agent` and `events-agent`; `find_evaluated_trace_ids(evaluator="Production checks")`
skips traces already graded. Each trace gets these results from evaluator **Production checks**
(type `code`), with its agent name and version. There is no ground truth in production, so every
check reads only the trace:

| Evaluation | Applies to | Measures | Pass rule |
|---|---|---|---|
| Task completion | Travel Planner | the plan has a weather forecast, attractions and flights | pass / fail |
| Stays on destination | Travel Planner | no attraction of another city is recommended | pass / fail |
| Tool call success | every agent | tool and sub-agent calls that returned data (an MCP call counts once) | `>= 0.75` |
| No repeated tool calls | every agent | no tool is called twice with the same arguments | pass / fail |
| Response time | every agent | agent span duration, in seconds | `<= 15` |

Every result has a one-sentence explanation from the trace, for example "The plan for Berlin is
missing: weather forecast." A failed check also logs a WARN on the graded span.

### Online: conversation checks

Travel Planner turns that share a `gen_ai.conversation.id` are graded once the conversation is
idle for `EVAL_CANARY_SESSION_IDLE_SECONDS`, by evaluator **Conversation checks**
(`score(conversation_id=...)`, level `session`):

| Evaluation | Measures | Pass rule |
|---|---|---|
| Goal achieved | the last turn returned a complete plan | pass / fail |
| Turns answered fully | share of turns without a degraded answer | `>= 0.8` |

### Offline: "Trip planning regression" (every `EVAL_CANARY_SUITE_INTERVAL_MINUTES`)

`evaluate()` runs the suite against the released planner and the candidate, as two runs:
"1.3.0 release" and "1.4.0 candidate". Each run description says what
it checks. The task is an `invoke_agent` CLIENT span that sends the case's request to the planner
over HTTP; the planner continues the trace, so each case is one trace with the planner's spans and
logs below the case's root span.

The 24 cases are written as user requests, for example "Plan 5 days in Rome in May under $2,500,
flying from New York.", in these groups: single city, budget, no dates, family, follow-up,
ambiguous or unknown city, and resilience (a weather outage, a rate-limited events agent, an
events agent that answers for the wrong city).

| Scorer | Measures | Pass rule |
|---|---|---|
| Plan is complete | weather forecast, attractions and flights present | pass / fail |
| Stays on destination | every attraction is in the requested city | pass / fail |
| Respects budget | the plan estimates the cost and stays within the budget (budget cases only) | pass / fail |
| Correct local currency | prices converted to the destination's currency | pass / fail |
| Response time | end-to-end answer time, in seconds | `<= 15` |

What to expect: 1.4.0 passes the budget cases that 1.3.0 fails (1.3.0 gives no estimate) and
answers faster, but fails "Plan is complete" on the no-dates cases. Both fail the resilience cases
and the unknown city (the planner falls back to EUR for Cusco).

## Configuration

| Env var | Default | Description |
|---|---|---|
| `EVAL_CANARY_INTERVAL` | `120` | Seconds between cycles |
| `EVAL_CANARY_LOOKBACK_MINUTES` | `15` | How far back to look for traces |
| `EVAL_CANARY_SUITE_INTERVAL_MINUTES` | `30` | Minutes between suite runs; `0` turns the suite off |
| `EVAL_CANARY_SESSION_IDLE_SECONDS` | `90` | Grade a session once its newest turn is this old |
| `TRAVEL_PLANNER_URL` | `http://travel-planner:8000` | Released planner the suite calls |
| `EVAL_CANARY_ONLINE` | `true` | `false` runs only the offline suite, with no reads: for backends without the `_search` API (OpenSearch Optimized Engine domains) |
| `TRAVEL_PLANNER_CANDIDATE_URL` | (none) | Candidate release; when set, the suite also runs against it |

## Running with the LLM canary

The [LLM canary](../agent-eval-canary-llm/README.md) grades the same traces with an LLM judge.
Each canary skips only the traces its own evaluators graded, so both can run together.

## Check the results

```bash
curl -sk -u 'admin:My_password_123!@#' 'https://localhost:9200/otel-v1-genai-evaluation/_search?size=0' \
  -H 'content-type: application/json' -d '{"aggs":{"evaluators":{"terms":{"field":"attributes.opensearch.gen_ai.evaluation.evaluator.name"}}}}'
```
