---
title: Example Agents
description: The travel planner, its sub-agents and the two eval canaries that run with the local stack, with sessions, trace-correlated application logs and online and offline evaluations
---

The local stack ships a multi-agent travel planner and two eval canaries. Together they produce agent traces, multi-turn sessions, application logs on the same spans, and evaluation results that point at those traces. Use them to try [Agent Traces](/docs/ai-observability/agent-tracing/) and [Agent Evals](/docs/agent-evals/) without writing an agent.

The agents and canaries use the [Python GenAI SDK](/docs/send-data/ai-agents/python/), installed from git `main` until 0.3.0 is on PyPI.

## Run them

The examples are on by default (`INCLUDE_COMPOSE_EXAMPLES=docker-compose.examples.yml` in `.env`):

```bash
git clone https://github.com/opensearch-project/observability-stack.git
cd observability-stack
docker compose up -d
```

- The travel planner and the deterministic eval canary start with the stack. The canary needs the local OpenSearch (the `local-backends` profile in `COMPOSE_PROFILES`).
- The agents run in mock LLM mode by default and need no AWS credentials. To use Amazon Bedrock, export AWS credentials and switch **Real LLM** on in the control panel at [http://localhost:8085](http://localhost:8085).
- The LLM eval canary is opt-in. It needs AWS credentials with Bedrock access. Uncomment `INCLUDE_COMPOSE_AGENT_EVAL_LLM=docker-compose.agent-eval-llm.yml` in `.env`, then run `docker compose up -d` again.

Follow a service's logs with `docker compose logs -f example-travel-planner` or `docker compose logs -f example-agent-eval-canary`.

## Travel planner

[`examples/plain-agents/multi-agent-planner`](https://github.com/opensearch-project/observability-stack/tree/main/examples/plain-agents/multi-agent-planner) is an orchestrator that fans out to two sub-agents and calls MCP tools:

| Service | Port | What it does |
|---|---|---|
| `travel-planner` | 8003 | Orchestrator. Calls the weather and events agents, then flights and currency through MCP |
| `weather-agent` | 8000 | Weather lookup with a tool loop |
| `events-agent` | 8002 | Attractions lookup through MCP (Wikipedia) |
| `mcp-server` | 8004 | Four MCP tools backed by free APIs (Open-Meteo, Wikipedia, Frankfurter) and simulated flights |
| `fault-panel` | 8085 | Control panel: fault presets, real LLM on or off, traffic interval |
| `canary` | | Sends planning requests on a schedule, with faults from the control panel |

Send a request yourself:

```bash
curl -s localhost:8003/plan -H 'content-type: application/json' \
  -d '{"destination": "Paris", "origin": "Seattle", "session_id": "demo-session-1"}'
```

### Agent roots

The planner's `invoke_agent Travel Planner` span sits below the HTTP span `POST /plan`. It calls `mark_agent_root()`, so Agent Traces lists each trace by the agent span. Only the agent span carries `gen_ai.agent.name`; the HTTP spans do not. The weather and events agents mark their own agent span only when they are called directly, without a caller trace.

### Sessions

`POST /plan` takes an optional `session_id`. The planner generates one when it is missing, sets it as `gen_ai.conversation.id` on its agent span, passes it to the sub-agents, and returns it. The canary sends each "deep" multi-destination comparison as one session, so the **Sessions** tab in Agent Traces shows multi-turn sessions.

### Application logs

Each service sends its Python logs as OTel logs: a `LoggingHandler` on the `LoggerProvider` that `register()` installs. Every record carries the trace and span ids of the active span, so the trace flyout shows it under **Related logs**, and on the span under **Logs**. See [Application logs](/docs/send-data/ai-agents/python/#application-logs) for the setup.

| Level | When |
|---|---|
| INFO | Normal steps: planning, sub-agent answers, MCP tool calls, plan ready |
| WARN | Fallbacks (Bedrock unavailable, fallback tool data, unknown currency), injected faults, and degraded or wrong answers (partial plan, events for another city, no events, an ungrounded weather answer, a truncated response) |
| ERROR | Tool and sub-agent failures: tool errors, timeouts, HTTP errors |

The logs land in `logs-otel-v1-*`. Count them per service and level:

```
source = logs-otel-v1*
| where isnotnull(traceId)
| stats count() by `resource.attributes.service.name`, severityText
```

The **Related logs** tab needs a trace-to-logs correlation for the traces dataset. See [Creating a trace-to-logs correlation](/docs/investigate/correlations/#creating-a-trace-to-logs-correlation).

## Eval canaries

Both canaries write `gen_ai.evaluation.result` events, which Data Prepper routes to the `otel-v1-genai-evaluation` write alias. When a result fails, the canary also logs it at WARN with the evaluated span's trace and span ids. A failing evaluation and the agent's own WARN and ERROR logs then sit on the same trace.

Each canary skips only the traces its own evaluators already graded (`find_evaluated_trace_ids(evaluator=...)`), so both run together without duplicates.

### Agent eval canary (deterministic)

[`docker-compose/agent-eval-canary`](https://github.com/opensearch-project/observability-stack/tree/main/docker-compose/agent-eval-canary) grades the example agents with code checks. No LLM, no AWS credentials, no cost.

- **Online, span level**, every `EVAL_CANARY_INTERVAL` seconds (120): `list_root_spans()` finds recent agent roots of the three agents. Each gets four results from the `trace_health_check` evaluator: `span_coverage`, `error_free`, `tool_call_success_rate` and `tool_diversity`.
- **Online, session level**: once a travel planner session has been idle for `EVAL_CANARY_SESSION_IDLE_SECONDS` (90), it gets `session_success_rate` from `session_health_check`, with `score(conversation_id=...)` at level `session`.
- **Offline test suite**, every `EVAL_CANARY_SUITE_INTERVAL_MINUTES` (30; `0` turns it off): `evaluate()` runs the `travel_planner_smoke` suite against the running planner, with a run name and a description. The cases `paris-ok` and `tokyo-ok` should pass. `london-weather-tool-error`, `berlin-wrong-city-events` and `sydney-events-rate-limited` inject faults and fail on purpose.

The suite shows two evaluation features:

- **Scorer ownership.** Each `@scorer` declares its evaluator, type, pass rule and description. The `keyword_overlap` scorer returns a library-style `EvalScore` that names its own evaluator (`lib.keyword_overlap`) and rule, so the scorer's declaration does not apply to it.
- **Result keys.** `keyword_overlap` shares the evaluation name `answer_relevance` with another scorer. Its local result key is `answer_relevance (lib.keyword_overlap)`, so neither result hides the other.

### LLM eval canary

[`docker-compose/agent-eval-canary-llm`](https://github.com/opensearch-project/observability-stack/tree/main/docker-compose/agent-eval-canary-llm) grades the same agents with an LLM judge on Amazon Bedrock (`EVAL_JUDGE_MODEL`, default `global.anthropic.claude-haiku-4-5-20251001-v1:0`). It uses [Strands Evals](https://github.com/strands-agents/evals) for one metric.

- **Online**, every `EVAL_CANARY_LLM_INTERVAL` seconds (60), up to `EVAL_CANARY_LLM_MAX_PER_CYCLE` (20) evaluations per cycle:
  - `answer_quality` (1 to 5, pass at 4) from the canary's own `answer_quality_judge`. It records the judge context: evaluator description, judge model, prompt name `answer-quality` and prompt version. The judge call is its own traced `chat` span with the judge prompt as `gen_ai.system_instructions`, linked from the result by `judge_trace_id`. A judge failure is an error result (`error.type`, no score).
  - `helpfulness` (0 to 1, pass at 0.5) from the library evaluator `strands_evals.helpfulness`. The library's category ("Very helpful", ...) is kept as the judge label, and the result names the library's evaluator, not the canary.
- **Offline test suite**, `EVAL_CANARY_LLM_SUITE_FIRST_RUN_MINUTES` (5) after start, then every `EVAL_CANARY_LLM_SUITE_INTERVAL_MINUTES` (60): `travel_planner_judged` runs against the planner. `rome-ok` and `barcelona-ok` should pass; `amsterdam-wrong-city-events` should fail. The judge `@scorer` declares its evaluator, pass rule and judge context, and the declaration goes only on its own results. A `complete_plan` code check names another evaluator (`plan_sections_check`), so it gets none of the judge's fields.

### Check the results

Results per evaluator:

```bash
curl -sk -u "admin:$OPENSEARCH_PASSWORD" 'https://localhost:9200/otel-v1-genai-evaluation/_search?size=0' \
  -H 'content-type: application/json' \
  -d '{"aggs":{"evaluators":{"terms":{"field":"attributes.opensearch.gen_ai.evaluation.evaluator.name"}}}}'
```

Verdicts of the smoke suite, per run and evaluation:

```
source = otel-v1-genai-evaluation*
| where `attributes.test.suite.name` = 'travel_planner_smoke'
| stats count() by `attributes.test.suite.run.id`, `attributes.gen_ai.evaluation.name`, `attributes.gen_ai.evaluation.score.label`
```

To see a failing case with its logs, take the `traceId` of a `fail` result and open that trace in Agent Traces.

## Related

- [Agent Evals Quickstart](/docs/agent-evals/quickstart/): send your own results.
- [Data Model & Ingestion](/docs/agent-evals/data-model/): how the local stack creates the evaluation index.
- [Agent Tracing](/docs/ai-observability/agent-tracing/): the Traces, Spans and Sessions tabs.
