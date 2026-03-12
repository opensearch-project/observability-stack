---
title: "Getting Started"
description: "Install Agent Health and run your first AI agent evaluation"
sidebar:
  order: 2
---

This guide walks you through using Agent Health to evaluate AI agents. The application includes a Travel Planner multi-agent demo so you can explore all features without configuring external services.

## Prerequisites

**Required:**
- **Node.js 18+** — [download here](https://nodejs.org/)
- **npm** (comes with Node.js)

**Optional (for production use):**
- AWS credentials (for Bedrock LLM Judge)
- OpenSearch cluster (for persistence and traces)

```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be v8.0.0 or higher
```

## Install and start

Run Agent Health with npx (no installation needed):

```bash
npx @opensearch-project/agent-health@latest
```

What happens:
1. Downloads Agent Health (if first run)
2. Starts the server on port 4001
3. Opens your browser to http://localhost:4001
4. Loads sample data automatically

For frequent use, install globally:

```bash
npm install -g @opensearch-project/agent-health
agent-health
```

## Demo Agent and Judge

Agent Health includes a built-in Travel Planner multi-agent demo, along with a Demo Judge, for testing without external services.

### Demo Agent (Travel Planner)

- Simulates a multi-agent Travel Planner system with realistic trajectories
- Agent types: Travel Coordinator, Weather Agent, Events Agent, Booking Agent, Budget Agent
- No external endpoint required — select "Demo Agent" in the agent dropdown

### Demo Judge

- Provides mock evaluation scores without AWS Bedrock
- Automatically selected when using Demo Agent
- No AWS credentials required

### Sample data

The Travel Planner demo includes pre-loaded sample data:

| Data Type | Count | Description |
|-----------|-------|-------------|
| Test Cases | 5 | Travel Planner multi-agent scenarios |
| Experiments | 2 | Demo experiments with completed runs |
| Runs | 6 | Completed evaluation results across experiments |
| Traces | 5 | OpenTelemetry trace trees for visualization |

Sample data IDs start with `demo-` prefix and are read-only.

## Explore the dashboard

![Agent Health Dashboard](/docs/images/agent-health/dashboard.png)

The main dashboard displays:
- Active experiments and their status
- Recent evaluation runs
- Quick statistics on pass/fail rates

## Run your first evaluation

### Option A: Run from UI

1. Click **Evals** in the sidebar
2. Click **New Evaluation**
3. Configure:
   - **Agent:** Select "Demo Agent"
   - **Model:** Select "Demo Model"
   - **Test Case:** Select any Travel Planner scenario
4. Click **Run Evaluation**

The agent streams its execution in real-time. You'll see thinking steps, tool calls, and responses, followed by an LLM judge evaluation with pass/fail status and accuracy score.

### Option B: Run from CLI

```bash
# List available test cases
npx @opensearch-project/agent-health list test-cases

# Run a specific test case
npx @opensearch-project/agent-health run -t demo-otel-001 -a demo

# View the results in the UI
open http://localhost:4001/runs
```

## Understand trajectory steps

Click on any evaluation result to view the detailed trajectory:

| Step Type | Description | Example |
|-----------|-------------|---------|
| **thinking** | Agent's internal reasoning | "I need to check the weather forecast..." |
| **action** | Tool invocation | `searchFlights({ destination: "Paris", dates: "Mar 15-18" })` |
| **tool_result** | Tool response | `{ flights: [...], cheapest: "$450" }` |
| **response** | Final conclusion | "Here's your optimized 3-day Paris itinerary..." |

Each step shows timestamp, duration, tool arguments (for actions), full tool output (for tool_results), and the judge's evaluation reasoning.

![Experiment Detail](/docs/images/agent-health/experiment-detail-full.png)

## Next steps

- [Connect your own agent](/docs/agent-health/configuration/) — configure Agent Health for your agent
- [Create custom test cases](/docs/agent-health/evaluations/test-cases/) — build test cases for your domain
- [Run experiments](/docs/agent-health/evaluations/experiments/) — batch evaluate across agents and models
- [View traces](/docs/agent-health/traces/) — visualize OpenTelemetry traces from your agent
