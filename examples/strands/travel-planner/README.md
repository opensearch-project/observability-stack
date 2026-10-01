# Strands Travel Planner

The multi-agent travel planner from [`plain-agents/multi-agent-planner`](../../plain-agents/multi-agent-planner/), rebuilt on the [Strands Agents SDK](https://strandsagents.com). It runs next to the plain-agents version: separate service names and ports, the same MCP server, fault panel and canary shapes. Use it to demo the stack's APM and agent views on a real agent framework.

## Architecture

```
canary ──► strands-travel-planner (Strands Agent: "Strands Travel Planner")
             ├── get_weather ──────► strands-weather-agent (Strands Agent) ──► mcp-server: fetch_weather_api
             ├── get_events ───────► strands-events-agent  (Strands Agent) ──► mcp-server: fetch_events_api
             ├── search_flights ───► mcp-server: fetch_flights_api
             └── convert_currency ─► mcp-server: convert_currency
```

- Each agent is a Strands `Agent` with `@tool` functions, served by FastAPI.
- Strands emits the GenAI spans: `invoke_agent`, `execute_event_loop_cycle`, `chat`, `execute_tool`.
- FastAPI and httpx instrumentation add server and client spans. Each turn is one trace across all services, and the APM service map shows the calls between them.
- One image runs all three services; the `SERVICE` env var picks `planner`, `weather` or `events`.

## What it shows

| Feature | What to look for |
|---|---|
| APM topology map | `strands-travel-planner` calling `strands-weather-agent`, `strands-events-agent` and `mcp-server`. Faults turn edges red. |
| APM Services | The three `strands-*` services with latency, throughput and failure ratio |
| Agent Traces: Traces / Spans | Strands agent, LLM and tool spans, with input/output messages and token usage |
| Agent Traces: Sessions | Multi-turn conversations (canary session shape). Every span of a turn, tool spans included, carries `gen_ai.conversation.id`, so filters such as `status.code = 2` find sessions with failing tools. |

## Sessions

Requests to `POST /plan` that share a `conversation_id` form one session:

- **History:** the planner keeps each conversation's history, so a real model sees earlier turns.
- **Attributes on every span:** each agent sets `trace_attributes` with `gen_ai.conversation.id` (plus `session.id`, and `user.id` when the request has `user_id`). Strands copies `trace_attributes` onto every span of the agent run, including `execute_tool` spans. OTel GenAI semantic conventions allow the conversation id on tool spans ([semantic-conventions-genai#518](https://github.com/open-telemetry/semantic-conventions-genai/pull/518)).
- **No invented ids:** a request without a `conversation_id` gets no session attributes at all (no UUID, trace id or hash as a fallback), as the conventions require.
- **Root span:** the HTTP request span (the trace root) is also described as the agent invocation (operation, agent name, session, input and output messages). Agent views list traces by their root span.

## Models

- **Bedrock** is used when the fault panel's **Use real LLM** toggle is on and AWS credentials are set (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`; model from `BEDROCK_MODEL_ID`).
- **A scripted fallback model** is used otherwise, or when a Bedrock call fails. It drives the same Strands loop: the first turn requests the agent's tools, the second answers from the tool results. You still get real `chat` and `execute_tool` spans with token counts, without AWS credentials. Its spans report `gen_ai.request.model = scripted-fallback`.

## Run it

The services are part of `docker-compose.examples.yml` and start with the stack:

```bash
docker compose up -d
```

To start only these services in an already running stack:

```bash
docker compose up -d --build example-strands-travel-planner example-strands-weather-agent \
  example-strands-events-agent example-strands-canary
```

| Service | Host port | Endpoint |
|---|---|---|
| strands-travel-planner | 8010 (`STRANDS_TRAVEL_PLANNER_PORT`) | `POST /plan`, `GET /health` |
| strands-weather-agent | 8011 (`STRANDS_WEATHER_AGENT_PORT`) | `POST /invoke`, `GET /health` |
| strands-events-agent | 8012 (`STRANDS_EVENTS_AGENT_PORT`) | `POST /events`, `GET /health` |

## Try it

```bash
# One trip plan
curl -s localhost:8010/plan -H 'Content-Type: application/json' \
  -d '{"destination": "Paris", "origin": "Seattle"}'

# A two-turn session
curl -s localhost:8010/plan -H 'Content-Type: application/json' \
  -d '{"destination": "Tokyo", "origin": "Boston", "conversation_id": "demo-1", "user_id": "alice", "message": "Plan a trip to Tokyo from Boston"}'
curl -s localhost:8010/plan -H 'Content-Type: application/json' \
  -d '{"destination": "Tokyo", "conversation_id": "demo-1", "user_id": "alice", "message": "What should I pack for Tokyo?"}'

# A failing weather tool (shows as an error session and a red edge in the service map)
curl -s localhost:8010/plan -H 'Content-Type: application/json' \
  -d '{"destination": "Rome", "conversation_id": "demo-2", "fault": {"weather": {"type": "error"}}}'
```

Faults use the same shape as the plain-agents planner: `fault.orchestrator` (`partial_failure`, `fan_out_timeout`), plus `fault.weather` and `fault.events` (`error`, `rate_limited`, `timeout`, `high_latency`, `wrong_city`, `empty`). The fault panel (port 8085) drives them for the canary.

## Demo script

1. **Topology Map:** find `strands-travel-planner`, then open the `strands-weather-agent` edge.
2. **Services:** open `strands-travel-planner` and point at its latency and failure ratio.
3. **Agent Traces > Traces:** filter with `| where serviceName = 'strands-travel-planner'`. Open a trace and walk the Trace Tree (agent, LLM and tool spans), the Trace Map and the Timeline.
4. **Agent Traces > Sessions:** open a session from the canary and step through its turns.
5. **Sessions with errors:** filter Sessions with ``| where `status.code` = 2`` to find sessions where a tool failed.
