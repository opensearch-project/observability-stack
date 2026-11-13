---
title: Agent Evals
description: Measure the quality of your AI agents with online and offline evaluations, stored as OpenTelemetry events next to their traces and reviewed in Agent Evaluations
---

**Agent Evals** measure whether your AI agents do a good job: not just whether they ran, but whether their answers are correct, grounded, safe and on-task. Where [Agent Observability](/docs/ai-observability/) shows *what an agent did* (traces, spans, the execution graph), Agent Evals put a verdict on that behavior so you can track it per agent version, compare test runs, and catch regressions before and after a release.

Each score is one OpenTelemetry `gen_ai.evaluation.result` log event, linked to the agent trace it judged. Results travel the same OTLP pipeline as your traces, Data Prepper routes them to their own index (`otel-v1-genai-evaluation`), and **Agent monitoring > Evaluations** in OpenSearch Dashboards shows them next to the traces.

## Two ways to evaluate

- **Offline**: run a **test suite** on purpose, before a release or in CI. Each execution is a **run** with one result per case per evaluator, and two runs of a suite can be compared case by case. SDK: `evaluate()` and `Benchmark`.
- **Online**: sample real traffic, score it, and attach the results to those traces. SDK: `score()`.

## The data model

```text
Test suite  "travel-planner-golden"                 test.suite.name
 └─ Run      run_20261105_215438_5df57445           test.suite.run.id  (one execution of the suite)
     └─ Case  "Plan a trip to Lisbon"               test.case.id / test.case.name
         ├─ Input      "Plan 3 days in Lisbon under $1,000"   → the agent's trace
         ├─ Expected   "Itinerary with flights + hotel ≤ $1,000"  → opensearch.test.case.expected
         ├─ Output     the agent's actual answer                  → the agent's trace
         └─ Evaluators run on (input, output, expected, trace):
              ├─ answer_quality   score 4/5, pass   → 1 result event
              ├─ budget_respected pass               → 1 result event
              └─ safety           pass               → 1 result event
```

Online results have no suite, run or case. See [Data Model & Ingestion](/docs/agent-evals/data-model/) for every attribute.

## Core concepts

| Term | Meaning |
|---|---|
| **Evaluation** | What is measured, for example `answer_quality` (`gen_ai.evaluation.name`). Results are grouped by it. |
| **Evaluator** | What produces the result: a code check, an LLM judge, a human, or an external tool. |
| **Result** | One `gen_ai.evaluation.result` event: a score, a label, an explanation, and the trace, span or session it judged. |
| **Verdict** | `pass` or `fail` in `gen_ai.evaluation.score.label`, decided by your evaluator or its threshold. Results without one are "Scored". |
| **Test suite, run, case** | The offline structure above. Cases are matched across runs by `test.suite.name` + `test.case.id`. |

## In this section

- **[Quickstart](/docs/agent-evals/quickstart/)**: install the SDK, send offline and online results, set up Agent Evaluations, and open your first run.
- **[Evaluation & Scoring](/docs/agent-evals/evaluation/)**: `score()`, `evaluate()` and `Benchmark` in Python and TypeScript, pass rules, LLM judges, and reading traces back.
- **[Run evaluations in CI](/docs/agent-evals/ci/)**: the SDK GitHub Action, threshold gates, `cicd.pipeline.*`, comparing runs, and sharding.
- **[Data Model & Ingestion](/docs/agent-evals/data-model/)**: the event, the attribute table, case identity, the index template and ISM policy, and Data Prepper routing.
- **[Evaluation Integrations](/docs/agent-evals/evaluation-integrations/)**: keep DeepEval, RAGAS, MLflow or pytest and send their results.

## Related

- [Agent Observability](/docs/ai-observability/): trace and visualize agent execution, the data your evals judge.
- [Send Data: AI Agents](/docs/send-data/ai-agents/): instrument an agent so its traces, and its evals, reach the stack.
