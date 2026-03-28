---
title: "Test Cases"
description: "Create and manage test cases for AI agent evaluation in Agent Health"
sidebar:
  order: 4
---

A test case (displayed as "Use Case" in the UI) defines an evaluation scenario for your agent. Each test case includes a prompt, supporting context, and expected outcomes that the LLM judge uses for scoring.

## Test case structure

| Field | Description |
|-------|-------------|
| **Name** | Descriptive title for the scenario |
| **Initial Prompt** | The question or task sent to the agent |
| **Context** | Supporting data the agent needs (logs, metrics, architecture info) |
| **Expected Outcomes** | List of what the agent should discover or accomplish |
| **Labels** | Categorization tags (e.g., `category:RCA`, `difficulty:Medium`) |

## Creating test cases from the UI

1. Go to **Settings > Use Cases**
2. Click **New Use Case**
3. Fill in the form:
   - **Name:** A descriptive scenario title
   - **Initial Prompt:** The question for your agent
   - **Context:** Supporting data your agent needs
   - **Expected Outcomes:** What the agent should accomplish
   - **Labels:** Tags like `category:MyCategory`, `difficulty:Medium`
4. Click **Save**

![Create Test Case](/docs/images/agent-health/create-test-case.png)

![Test Cases List](/docs/images/agent-health/test-cases.png)

## Creating test cases from JSON

Test cases can be defined in a JSON file for import:

```json
[
  {
    "name": "My Test Case",
    "category": "RCA",
    "difficulty": "Medium",
    "initialPrompt": "Investigate the latency spike...",
    "expectedOutcomes": ["Identifies database as root cause"],
    "context": [
      { "description": "Error logs", "value": "..." }
    ]
  }
]
```

## Import and export

Import test cases from a file and run a benchmark in a single command:

```bash
# Import and benchmark
npx @opensearch-project/agent-health benchmark -f ./test-cases.json -a my-agent

# Export from an existing benchmark
npx @opensearch-project/agent-health export -b "My Benchmark" -o test-cases.json
```

The export format is compatible with import, so you can round-trip test cases between benchmarks:

```bash
# Export from one benchmark
npx @opensearch-project/agent-health export -b my-benchmark -o test-cases.json

# Import into a new benchmark run
npx @opensearch-project/agent-health benchmark -f test-cases.json -a another-agent
```

## Tips for good test cases

- **Make prompts specific and unambiguous** - avoid vague instructions
- **Include all necessary context data** - the agent shouldn't need to guess
- **Define clear, measurable expected outcomes** - the judge needs concrete criteria
- **Start with simple cases, add complexity gradually** - build confidence before testing edge cases
- **Use labels for organization** - filter and group test cases by category, difficulty, or domain
