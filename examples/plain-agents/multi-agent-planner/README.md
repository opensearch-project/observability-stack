# Multi-Agent Travel Planner

A multi-agent example demonstrating distributed agent orchestration with OpenTelemetry instrumentation, real free APIs, Amazon Bedrock LLM integration, and a live control panel for fault injection.

## Architecture

```
                         ┌──────────────────┐
          Canary ──────▶ │  travel-planner  │ :8003
                         └────────┬─────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
              [fan-out]      [sequential]   [sequential]
                   │              │              │
            ┌──────┴──────┐      │              │
            ▼             ▼      ▼              ▼
       ┌─────────┐  ┌─────────┐ │              │
       │ weather │  │ events  │ │              │
       │  agent  │  │  agent  │ │              │
       └────┬────┘  └────┬────┘ │              │
          :8000         :8002   │              │
            │             │     │              │
            └──────┬──────┘     │              │
                   ▼            ▼              ▼
              ┌──────────────────────────────────┐
              │           mcp-server             │
              │  fetch_weather  fetch_events     │
              │  fetch_flights  convert_currency │
              └──────────────────────────────────┘
                            :8004
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
           Open-Meteo    Wikipedia    Frankfurter
           (weather)    (attractions)  (currency)


       ┌───────────────────┐
       │  Control Panel    │ :8085   ◄── Toggle faults, LLM mode, interval
       └───────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| travel-planner | 8003 | Orchestrator — fans out to sub-agents, calls flights/currency directly via MCP |
| weather-agent | 8000 | Weather lookup with full agentic tool_use loop |
| events-agent | 8002 | Attractions/POI lookup via MCP (Wikipedia) |
| mcp-server | 8004 | MCP tool provider — 4 tools backed by real APIs |
| fault-panel | 8085 | Travel Agent Control Panel — live UI for toggling scenarios |
| canary | - | Periodic test client with configurable fault injection |

## Real APIs (No Keys Required)

The MCP server uses real free APIs that require zero setup:

| Tool | API | Data |
|------|-----|------|
| `fetch_weather_api` | [Open-Meteo](https://open-meteo.com/) | Real temperature, conditions, wind (geocoding → forecast) |
| `fetch_events_api` | [Wikipedia](https://www.mediawiki.org/wiki/API:Main_page) | Real landmarks and points of interest |
| `convert_currency` | [Frankfurter](https://www.frankfurter.app/) | Live ECB exchange rates |
| `fetch_flights_api` | Simulated | Realistic mock data (no free flight API exists) |

All real API calls have **graceful fallback** — if an API is unreachable (network issues, rate limits), the MCP server falls back to mock data and sets `tool.fallback=true` on the span.

## Real LLM (Amazon Bedrock)

The agents support real LLM calls via Amazon Bedrock Converse API, toggled live from the control panel.

### How It Works

| Agent | Mock Mode | Real LLM Mode |
|-------|-----------|---------------|
| travel-planner | `time.sleep()` + random tokens | Bedrock plans the trip, then summarizes gathered results |
| weather-agent | Keyword heuristics select tools | Bedrock uses `tool_use` to select and call weather tools |
| events-agent | No reasoning, always calls tool | Bedrock reasons about what attractions to look for |

### Setup

1. Configure AWS credentials with Bedrock access:
   ```bash
   # Option A: Export from a named profile
   eval $(aws configure export-credentials --profile bedrock --format env)

   # Option B: Set in .env file
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_SESSION_TOKEN=...
   AWS_REGION=us-west-2
   ```

2. Start the stack:
   ```bash
   docker compose up -d
   ```

3. Toggle "Real LLM" in the control panel at http://localhost:8085

### Model Configuration

Default model: `us.anthropic.claude-opus-4-8` (Claude Opus 4.8 via Bedrock cross-region inference)

Override via environment variable:
```bash
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514  # cheaper alternative
```

### Fallback Behavior

If Bedrock is unavailable (no credentials, throttled, wrong model):
- Agents fall back to mock mode automatically
- Span attribute `gen_ai.bedrock.fallback=true` is set
- `gen_ai.bedrock.fallback.reason` explains why
- No user-facing errors — the demo continues working

## Travel Agent Control Panel

A web UI at **http://localhost:8085** for controlling the demo in real time.

### Presets

| Preset | Faults | Interval | What to look for in dashboards |
|--------|--------|----------|-------------------------------|
| All Clean | None | 30s | All traces green, no errors in service map |
| Default | 50% mixed | 30s | Mix of green and red traces, partial failures |
| Latency Spike | 70% weather delay | 15s | P95 latency spike on weather-agent |
| Chaos | 100% faults | 10s | High error rate, red edges in service map |
| Cascading Failure | Both agents fail | 10s | Orchestrator partial=true, multiple error spans |
| Deep Traces | No faults | 60s | 100+ span trace waterfalls |
| Custom | Adjustable | Adjustable | Editable sliders for fine-tuning |

### Controls

- **Enable/Disable** — pause/resume canary traffic
- **Real LLM** — toggle between mock and Bedrock (agents poll every 30s)
- **Interval** — how often the canary fires
- **Fault sliders** — (Custom mode) adjust individual fault probabilities

### Persistence

State persists across container restarts via a Docker volume (`fault-panel-data`). Only `docker compose down -v` resets to defaults.

## Running

From repository root:

```bash
# Start full stack (mock LLM mode, no AWS creds needed)
docker compose up -d

# With Bedrock support
eval $(aws configure export-credentials --profile bedrock --format env)
docker compose up -d
```

## API

### POST /plan

```bash
curl -X POST http://localhost:8003/plan \
  -H "Content-Type: application/json" \
  -d '{"destination": "Paris", "origin": "New York"}'
```

Response:
```json
{
  "destination": "Paris",
  "weather": {"response": "The weather in Paris is mainly clear with a temperature of 64.9°F."},
  "events": [{"name": "Landmarks in Paris", "type": "attraction", "venue": "paris"}],
  "flights": {"flights": [{"airline": "JetBlue", "price_usd": 151, "stops": 0}]},
  "currency": {"converted": 85.91, "to_currency": "EUR", "source": "frankfurter"},
  "recommendation": "Paris is calling! Enjoy clear skies and a comfortable 65°F...",
  "partial": false,
  "errors": []
}
```

### Fault Injection

```bash
# Weather agent rate-limited
curl -X POST http://localhost:8003/plan \
  -H "Content-Type: application/json" \
  -d '{"destination": "Tokyo", "fault": {"weather": {"type": "rate_limited"}}}'

# Both sub-agents fail
curl -X POST http://localhost:8003/plan \
  -H "Content-Type: application/json" \
  -d '{"destination": "Berlin", "fault": {"weather": {"type": "tool_error"}, "events": {"type": "error"}}}'

# Orchestrator fan-out timeout
curl -X POST http://localhost:8003/plan \
  -H "Content-Type: application/json" \
  -d '{"destination": "Sydney", "fault": {"orchestrator": "fan_out_timeout"}}'

# High latency (5s delay)
curl -X POST http://localhost:8003/plan \
  -H "Content-Type: application/json" \
  -d '{"destination": "London", "fault": {"weather": {"type": "high_latency", "delay_ms": 5000}}}'
```

#### Available Fault Types

**Sub-agent faults** (weather/events):
- `error` / `tool_error` — returns error response
- `rate_limited` — simulates 429 rate limiting
- `high_latency` — adds configurable delay (`delay_ms`)
- `timeout` — 30s hang then timeout
- `wrong_city` — returns data for wrong destination
- `empty` — returns empty results

**Weather-agent specific:**
- `hallucination` — skips tool, fabricates answer
- `token_limit_exceeded` — truncates response
- `wrong_tool` — calls wrong tool

**Orchestrator faults:**
- `partial_failure` — randomly skip sub-agent calls
- `fan_out_timeout` — 1ms timeout on all HTTP calls

## Telemetry

View in OpenSearch Dashboards (http://localhost:5601):

- **Traces**: See full request flow across all services
- **Service Map**: travel-planner → weather/events agents → mcp-server
- **Span attributes**:
  - `gen_ai.agent.name` — agent name (Travel Planner, Weather Assistant, Events Agent)
  - `gen_ai.provider.name` — `aws_bedrock` (real) or `openai`/`anthropic`/etc. (mock)
  - `gen_ai.request.model` — model used (e.g. `us.anthropic.claude-opus-4-8`)
  - `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` — real token counts
  - `gen_ai.input.messages` / `gen_ai.output.messages` — tool I/O content
  - `gen_ai.tool.name` — tool being executed
  - `gen_ai.bedrock.fallback` — true if Bedrock failed and agent used mock
  - `tool.fallback` — true if external API failed and MCP used mock data
  - `response.partial` — true if any sub-agent failed

## Trace Structure

A typical trace (Real LLM mode) shows:

```
travel-planner | POST /plan (3200ms)
├── invoke_agent Travel Planner (3180ms)
│   ├── chat planning (1200ms)                         # Bedrock: plan the trip
│   ├── invoke_agent weather-agent (800ms)             # Fan-out
│   │   └── weather-agent | invoke_agent (780ms)
│   │       ├── chat (600ms)                           # Bedrock: tool_use selection
│   │       └── execute_tool get_current_weather (150ms)
│   │           └── tools/call fetch_weather_api [CLIENT]
│   │               └── mcp-server | tools/call [SERVER]
│   │                   ├── geocode (80ms)             # Open-Meteo geocoding
│   │                   └── open-meteo forecast (90ms) # Real weather API
│   ├── invoke_agent events-agent (900ms)              # Fan-out
│   │   └── events-agent | invoke_agent (880ms)
│   │       ├── chat events-reasoning (700ms)          # Bedrock: what to look for
│   │       └── execute_tool fetch_events_api [CLIENT]
│   │           └── mcp-server | tools/call [SERVER]
│   │               └── wikipedia search (200ms)       # Real Wikipedia API
│   ├── execute_tool fetch_flights_api (100ms)         # Direct MCP call
│   │   └── mcp-server | tools/call [SERVER]
│   │       └── tool_call fetch_flights_api (5ms)      # Simulated
│   ├── execute_tool convert_currency (150ms)          # Direct MCP call
│   │   └── mcp-server | tools/call [SERVER]
│   │       └── frankfurter exchange (140ms)           # Real ECB rates
│   └── chat summarize (1000ms)                        # Bedrock: synthesize recommendation
```

## Canary

The canary service generates continuous traffic:

- **Destinations**: Paris, Tokyo, London, Berlin, Sydney, New York, Mumbai, Seattle
- **Origins**: Portland, Seattle, San Francisco, New York, Chicago, Denver, Austin, Boston
- **Trace shapes**: normal (60%), shallow (25%), deep (15%)
- **Faults**: configurable via control panel

```bash
# View canary logs
docker compose logs -f example-canary

# Stop canary (useful when Real LLM is on to save costs)
docker compose stop example-canary
```

## Cost Awareness

With **Real LLM ON** and canary running at default 30s interval:
- ~4-5 Bedrock calls per normal invocation
- ~8-20 calls per deep invocation
- Opus 4.8 pricing applies

To minimize cost during demos:
- Increase interval to 120s+ in the control panel
- Use `BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514` (cheaper)
- Pause canary and test manually
- Toggle Real LLM OFF when not actively demoing
