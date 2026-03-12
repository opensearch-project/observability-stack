---
title: "Experiments"
description: "Run batch evaluations and compare AI agent performance across configurations"
sidebar:
  order: 5
---

An experiment (called "Benchmark" in the CLI) is a batch of test cases evaluated together. Experiments can have multiple runs with different agent or model configurations, enabling side-by-side comparison of agent performance.

## What is an experiment

An experiment groups related test cases and tracks multiple evaluation runs. Each run captures:

- Which agent and model were used
- Pass/fail status and accuracy for each test case
- Full trajectories and judge reasoning
- Aggregate statistics (pass rate, average accuracy)

![Experiment Detail](/docs/images/agent-health/experiment-detail.png)

## Running experiments from the UI

1. Click **Experiments** in the sidebar
2. Click **New Experiment**
3. Select the test cases to include
4. Choose an agent and model
5. Click **Run**

To compare agents, run the same experiment multiple times with different agent/model configurations.

## Running experiments from the CLI

```bash
# Quick mode — auto-creates a benchmark from all stored test cases
npx @opensearch-project/agent-health benchmark

# Named mode — runs a specific existing benchmark
npx @opensearch-project/agent-health benchmark -n "Baseline" -a my-agent

# File mode — imports test cases from JSON and runs them
npx @opensearch-project/agent-health benchmark -f ./test-cases.json -a my-agent

# With export — save results to file
npx @opensearch-project/agent-health benchmark -f ./test-cases.json -n "My Run" -a my-agent --export results.json
```

## Comparing agents across runs

Create experiments with multiple runs using different agents or models. The UI provides side-by-side comparison of:

- Per-test-case pass/fail status
- Accuracy scores across runs
- Trajectory differences between agents

## Generating reports

Generate downloadable reports from experiment results:

```bash
# HTML report (default)
npx @opensearch-project/agent-health report -b "My Benchmark"

# PDF report
npx @opensearch-project/agent-health report -b "My Benchmark" -f pdf -o report.pdf

# JSON report
npx @opensearch-project/agent-health report -b "My Benchmark" -f json --stdout
```

Reports include judge reasoning, accuracy scores, and improvement suggestions for each test case.
