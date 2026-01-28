# Multi-Agent Planner

A multi-agent example demonstrating distributed agent orchestration with OpenTelemetry instrumentation.

## Architecture

```
┌─────────────────┐
│  Orchestrator   │ :8000
└────────┬────────┘
         │
    ┌────┴────┐     [fan-out] - parallel data gathering
    ▼         ▼
┌───────┐ ┌───────┐
│Weather│ │Events │ :8001, :8002
│ Agent │ │ Agent │
└───────┘ └───────┘
```

**Pattern**: Hybrid fan-out/chain
- Orchestrator parses intent, fans out to specialist agents in parallel, then synthesizes response
- Demonstrates W3C trace context propagation over HTTP
- Creates rich service map with 3+ nodes

## Services

| Service | Port | Description |
|---------|------|-------------|
| orchestrator | 8000 | Entry point - routes requests, synthesizes responses |
| weather-agent | 8001 | Existing weather agent (reused) |
| events-agent | 8002 | Local events lookup using free API |

## Running

From repository root:

```bash
# Start core stack + multi-agent example
docker compose -f docker-compose.yml -f docker-compose.examples.yml up -d
```

## API

### POST /plan

Request a trip plan:

```bash
curl -X POST http://localhost:8000/plan \
  -H "Content-Type: application/json" \
  -d '{"destination": "Paris", "date": "2024-03-15"}'
```

Response:
```json
{
  "destination": "Paris",
  "weather": { "temperature": 12, "conditions": "Partly cloudy" },
  "events": [{ "name": "Louvre Night", "date": "2024-03-15" }],
  "recommendation": "Great day for sightseeing with mild weather..."
}
```

## Telemetry

This example demonstrates:
- Cross-service trace propagation (W3C TraceContext)
- Parallel span execution (fan-out pattern)
- Service map with multiple nodes and edges
- `gen_ai.agent.name` per specialist agent
