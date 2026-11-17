---
title: "Agent Traces"
description: "Explore, debug, and monitor AI agent execution traces in OpenSearch Dashboards"
---

The **Agent Traces** plugin for OpenSearch Dashboards provides a purpose-built interface for exploring, debugging, and monitoring LLM agent execution traces. It gives developers and platform operators full observability into agentic AI applications, including hierarchical trace views, multi-turn sessions, detail flyouts, flow visualizations, correlated logs, and aggregate metrics.

Agent trace data is ingested through OpenTelemetry (OTel) using the [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) and stored natively in OpenSearch indices.

## Architecture

The following diagram shows the data flow from instrumented applications to the Agent Traces UI:

```text
LLM Application (with OTel SDK + GenAI instrumentation)
    │
    │  OTLP (gRPC/HTTP)
    ▼
OTel Collector (batch, transform)
    │
    ├──── OTLP ────► Data Prepper ──► OpenSearch (otel-v1-apm-span-*)
    │
    └──── Prometheus Remote Write ──► Prometheus (metrics)
                                          │
                                          ▼
                              OpenSearch Dashboards
                              └── Agent Traces Plugin
```

Key architectural principles:

- **OTel GenAI conventions as the canonical schema**: Spans are indexed as-is with `gen_ai.*` attributes. No custom schema translation is needed.
- **OpenSearch as the sole data store**: All trace data lives in OpenSearch indices. No external databases are required.
- **PPL for querying**: Trace browsing, filtering, and aggregation use OpenSearch PPL (Piped Processing Language).
- **On-demand tree loading**: The initial table shows root spans. Full trace trees are fetched lazily when you expand or view a trace's details.

## Prerequisites

Before using Agent Traces, ensure that you have the following:

- An OpenSearch cluster with trace data indexed in `otel-v1-apm-span-*` indices.
- OpenTelemetry instrumentation with GenAI semantic conventions enabled in your LLM application.
- Data Prepper configured with the `otel_trace_raw` processor to ingest spans into OpenSearch.
- PPL query support enabled in OpenSearch Dashboards.

### Required span attributes

Trace data must include the following core fields:

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | keyword | Unique trace identifier |
| `spanId` | keyword | Unique span identifier |
| `parentSpanId` | keyword | Parent span ID (empty for root spans) |
| `startTime` | date_nanos | Span start timestamp |
| `endTime` | date_nanos | Span end timestamp |
| `durationInNanos` | long | Span duration in nanoseconds |
| `status.code` | keyword | Status code (0 = OK, 1 = UNSET, 2 = ERROR) |

For AI agent observability, spans should also include `gen_ai.*` attributes:

| Field | Type | Description |
|-------|------|-------------|
| `attributes.gen_ai.operation.name` | keyword | Span type (`chat`, `execute_tool`, `invoke_agent`, `embeddings`) |
| `attributes.gen_ai.request.model` | keyword | Requested LLM model |
| `attributes.gen_ai.provider.name` | keyword | LLM provider (`openai`, `aws.bedrock`, `anthropic`) |
| `attributes.gen_ai.usage.input_tokens` | long | Input token count |
| `attributes.gen_ai.usage.output_tokens` | long | Output token count |
| `attributes.gen_ai.input.messages` | object | Input payload (prompts, messages) |
| `attributes.gen_ai.output.messages` | object | Output payload (completions, responses) |
| `attributes.gen_ai.tool.name` | keyword | Tool identifier |
| `attributes.gen_ai.conversation.id` | keyword | Session or conversation grouping |
| `attributes.gen_ai.agent.name` | keyword | Human-readable agent name |

The following optional attributes enable additional features:

| Field | Type | Description |
|-------|------|-------------|
| `attributes.derived.gen_ai.is_root` | boolean | Marks the span that represents an agent run when the trace root is not a GenAI span. See [Agents behind an HTTP handler](#agents-behind-an-http-handler). |
| `attributes.user.id` | keyword | User identifier, shown in the **User ID** column of the [Sessions tab](#sessions-tab) |

## Page layout

The Agent Traces page is organized into the following areas:

- **Top navigation bar**: Contains options to save, load, share, and create new queries.
- **Query panel**: An editor for writing and executing PPL queries, with dataset selection and language toggle.
- **Results area**: A resizable layout containing a fields selector on the left and trace results on the right.

## Metrics bar

At the top of the results area, a metrics bar displays aggregate statistics for the current query:

- **Total Traces**: The number of distinct traces returned. A trace with several agent runs counts once.
- **Total Spans**: The total number of spans across all traces.
- **Total Sessions**: The number of distinct `gen_ai.conversation.id` values.
- **Total Tokens**: Aggregated token usage (input + output).
- **Latency P50**: The 50th percentile latency.
- **Latency P99**: The 99th percentile latency.

## Traces tab

The **Traces** tab displays agent runs in a paginated table, as shown in the following image. Each row is a trace's AI root: either a root span (`parentSpanId` is empty) that has a `gen_ai.operation.name` attribute, or a span marked with `derived.gen_ai.is_root`, as described in [Agents behind an HTTP handler](#agents-behind-an-http-handler).

![Traces tab showing root-level agent traces](/docs/images/agent-traces/traces-table.png)

The table includes the following columns:

| Column | Description |
|--------|-------------|
| **Time** | Clickable timestamp of the span start time |
| **Kind** | Color-coded badge showing the span category (Agent, LLM, Tool, and others) |
| **Name** | The span operation name |
| **Status** | Success or error indicator |
| **Latency** | Duration of the span |
| **Tokens** | Total tokens used |
| **Input** | Truncated user input or prompt |
| **Output** | Truncated LLM response |

### Expanding traces

Select the expand arrow on a trace row to load and display its child spans inline. The full trace tree is fetched on demand and cached for subsequent views. Child spans are displayed with indentation to show the hierarchical parent-child relationship. A row for a marked agent span shows only that span's descendants.

### Agents behind an HTTP handler

When an agent is served behind an HTTP handler, the trace root is an HTTP span (for example, `POST /runs`) and the agent span sits below it. To list these agents, the `otel_trace_raw` processor in Data Prepper 2.17 and later marks the outermost GenAI span of each trace with `derived.gen_ai.is_root: true`. This is either the root itself, when it is a GenAI span, or the agent span below a non-GenAI root. You can also set the marker yourself, for example with `mark_agent_root()` in the GenAI observability SDK for Python or `markAgentRoot()` in TypeScript.

When the marker is present in the index mapping, the Traces tab, Sessions tab, and metrics bar list the marked agent span instead of the HTTP root, so the row shows the agent's own name, kind, input, output, and latency. Root spans that are GenAI spans are still listed, so data indexed before the marker existed continues to appear. The **Spans** tab is unchanged and does not list HTTP spans.

If a trace has more than one agent run, such as parallel agents under one HTTP root, each run is listed as a separate row, and the count above the table reads **N of M agent runs**. **Total Traces** in the metrics bar still counts the trace once. A run is not listed separately when another listed run is its ancestor.

### Span categories

Spans are categorized based on the `gen_ai.operation.name` attribute:

| Operation name | Category | Description |
|---------------|----------|-------------|
| `invoke_agent`, `create_agent` | Agent | Agent orchestration step |
| `chat` | LLM | LLM chat completion call |
| `text_completion`, `generate_content` | Content | Text generation operation |
| `execute_tool` | Tool | Tool invocation |
| `embeddings` | Embeddings | Embedding generation |
| `retrieval` | Retrieval | Data retrieval operation |

Each category is displayed with a unique color and icon in the UI.

## Spans tab

The **Spans** tab shows all `gen_ai` spans (not only root traces) in a paginated table, as shown in the following image. This view is useful for examining individual operations across multiple traces. The table structure is similar to the Traces tab.

![Spans tab showing all gen_ai spans](/docs/images/agent-traces/spans-table.png)

## Sessions tab

The **Sessions** tab groups traces into multi-turn conversations, as shown in the following image. A session is the set of traces that share a `gen_ai.conversation.id` attribute. If no sessions appear, set `gen_ai.conversation.id` on your agent spans (for example, with the GenAI SDK's `session_id`).

![Sessions tab showing sessions grouped by conversation ID](/docs/images/agent-traces/agent-traces-sessions-tab.png)

The table includes the following columns:

| Column | Description |
|--------|-------------|
| **Time** | Clickable session start time. Opens the [session details flyout](#session-details-flyout). |
| **Session ID** | The `gen_ai.conversation.id` value. An alert icon shows when any of the session's traces has an error; hover over it to see how many traces have errors. |
| **First Message** | The first message in the session |
| **Last Message** | The last message in the session |
| **Duration** | Time from the session's earliest span start to its latest span end |
| **User ID** | The `user.id` attribute. Shown only when at least one session has it. |
| **Total Traces** | The number of traces in the session |
| **Total Tokens** | Total tokens used across the session |

The query and time range select which sessions appear. The totals in each row (traces, duration, tokens, and first and last message) always cover the whole session, including traces outside the time range. The tab loads up to 100 sessions; when more match, the count above the table reads **100 of N sessions**.

To list only sessions that contain errors, turn on **Only sessions with errors**. A session counts as having errors when any span in one of its traces has an error status.

The Sessions tab applies only row filters from your query, such as `where`, `eval`, and `parse`. Commands that reshape rows, such as `stats`, `head`, `fields`, or `dedup`, are not applied, and a notice lists the ignored commands. Use the **Traces** or **Visualization** tab for those queries.

On this tab, the fields panel counts distinct sessions for each value of service name, agent name, and status. Filtering on a value narrows the list to sessions in which any span has that value. Session columns are fixed, so you cannot add or remove columns.

## Session details flyout

Selecting a session opens the session details flyout, as shown in the following image. The header shows the session ID with a copy button, along with the session's **DURATION**, **TOKENS**, and **TRACES**.

![Session details flyout showing the trace list and session conversation](/docs/images/agent-traces/agent-traces-session-flyout.png)

The flyout contains the following areas:

- **Trace list**: Lists the session's traces with their latency and tokens. Each entry is labeled with the agent name from `gen_ai.agent.name` (for example, **#1 Travel Planner**), or **Trace #n** when the agent name is not set. When a trace has parallel agents, each agent run gets its own entry and the title reads **Agent runs (n)**. Select an entry to focus it in the conversation, or select its arrow icon to open the trace in the [trace details flyout](#trace-details-flyout).
- **Session Conversation**: Shows one turn per trace, with messages labeled by role (**User**, **Assistant**, and **System** or **Tool** when present). Use the **Next trace** and **Previous trace** arrows to move between turns, and select a turn's trace link to open it in the trace details flyout. You can switch messages between **Formatted** and **JSON** views and copy each message.
- **View All Traces**: Opens **Traces** and **Spans** tables scoped to the session.

## Trace details flyout

Selecting a trace row opens a resizable flyout panel on the right side of the screen. The flyout header displays the trace name, status badge, start time, trace ID (with a copy button), duration, span count, and token count. When the trace belongs to a session, the header also shows a **SESSION ID** link that opens the session.

### Navigating between sessions and traces

Sessions and traces share one flyout, so flyouts never stack. When you open a trace from a session, the flyout header shows **Back to session**, as shown in the following image. When you open a session from a trace's **SESSION ID** link, the header shows **Back to trace**, and the session's trace list focuses the trace you came from. Select the back link to return to the previous flyout.

![Trace details flyout opened from a session, showing Back to session, the Agent badge on an HTTP handler root span, and the Related logs tab](/docs/images/agent-traces/agent-traces-trace-flyout-related-logs.png)

The flyout is divided into two resizable panels:

### Left panel

The left panel provides the following tabs:

- **Trace Tree**: A hierarchical tree view of all spans in the trace. Each node shows the span name, category badge, and status indicator. You can expand and collapse nodes to explore the hierarchy and select a node to view its details. The toolbar above the tree provides the following controls:
  - **Search spans**: Highlights matching spans. Use the next and previous arrows to move between matches.
  - **N errors**: Jumps to the next span with an error.
  - **Expand all** and **Collapse all**: Expands or collapses every node in the tree.

- **Trace Map**: A graph visualization of the spans in the trace and their execution dependencies. Selecting a node synchronizes with the detail panel. For more information, see [Agent Graph & Path](/docs/ai-observability/agent-tracing/graph/).

- **Timeline**: A Gantt-style timeline showing all spans arranged chronologically. Bar widths are proportional to span duration and color-coded by category. You can select a span in the timeline to synchronize with the tree view.

- **Related logs**: Logs correlated with the trace, grouped by logs dataset, with a badge showing the log count. Select **View in Discover Logs** to open a dataset's logs in Discover. Select a log's span ID to select that span in the flyout. Agent Traces shows up to 100 of the most recent logs per logs dataset.

The **Related logs** tab requires a trace-to-logs correlation for the traces dataset. For setup steps, see [Creating a trace-to-logs correlation](/docs/investigate/correlations/#creating-a-trace-to-logs-correlation). Without a correlation, the tab shows **Correlation not configured** with a **Create from traces dataset** button.

### Right panel

The right panel shows details for the selected span in the following collapsible sections:

- **Metadata**: The span's operation, duration, span ID, parent span, and start and end times.
- **Input / Output**: The span's input and output messages. You can switch between **Formatted** and **JSON** views and copy each message.
- **GenAI attributes**: The span's `gen_ai.*` attributes, grouped as **Agent**, **Model**, **Tool**, **Usage**, and **Context**. Only attributes present on the span are listed.
- **Logs**: The correlated logs for the selected span, with a count. This section appears only when the traces dataset has a trace-to-logs correlation.
- **Raw Span**: The raw span document as a JSON code block.

## Adding agent tables to dashboards

When you add a saved search from the **Traces**, **Spans**, or **Sessions** tab to a dashboard, the panel shows the same agent table as the tab. Selecting a row opens the trace or session in Agent Traces with the dashboard's time range.

## Querying traces

Agent Traces uses PPL (Piped Processing Language) for all data fetching. You can write queries in the query panel at the top of the page.

### Listing root traces

To list root agent traces:

```text
source = otel-v1-apm-span-*
| where parentSpanId = "" AND isnotnull(`attributes.gen_ai.operation.name`)
| sort - startTime
| head 100
```

To also list agents behind an HTTP handler, include spans marked with `derived.gen_ai.is_root`. PPL rejects queries that reference an unmapped field, so use this form only when the marker is present in your index mapping:

```text
source = otel-v1-apm-span-*
| where (parentSpanId = "" AND isnotnull(`attributes.gen_ai.operation.name`))
    OR `attributes.derived.gen_ai.is_root` = true
| sort - startTime
| head 100
```

### Listing sessions

To list sessions with their trace counts:

```text
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.conversation.id`)
| stats distinct_count(traceId) as total_traces,
        min(startTime) as start_time,
        max(endTime) as end_time
        by `attributes.gen_ai.conversation.id`
| sort - start_time
```

### Fetching all spans for a trace

To fetch the complete span tree for a specific trace:

```text
source = otel-v1-apm-span-*
| where traceId = "<trace-id>"
| head 1000
```

### Computing aggregate metrics

To compute aggregate statistics across traces:

```text
source = otel-v1-apm-span-*
| where parentSpanId = "" AND isnotnull(`attributes.gen_ai.operation.name`)
| stats count() as total_traces,
        percentile(durationInNanos, 50) as p50_latency,
        percentile(durationInNanos, 99) as p99_latency,
        sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens
```

## Related links

- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Data Prepper Trace Analytics](https://docs.opensearch.org/latest/data-prepper/common-use-cases/trace-analytics/)
- [Agent Traces RFC](https://github.com/opensearch-project/OpenSearch-Dashboards/issues/11345)
