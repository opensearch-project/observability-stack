---
title: MCP Server
description: Query OpenSearch using the built-in Model Context Protocol server
---

OpenSearch includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI agents and LLM applications to interact with OpenSearch directly through a standardized tool interface.

## What is MCP?

MCP is an open protocol that enables AI agents to connect to external tools and data sources through a standardized interface. Instead of writing custom integration code, agents use MCP to discover and call tools exposed by MCP servers.

## OpenSearch built-in MCP server

OpenSearch provides a built-in MCP server that exposes OpenSearch capabilities as MCP tools. This means AI agents can search indices, run PPL queries, and interact with observability data without custom API integrations.

The MCP server supports:

- **Index operations**: List indices, get mappings, search documents
- **PPL queries**: Run Piped Processing Language queries against logs, traces, and other data
- **SQL queries**: Execute SQL queries against OpenSearch indices
- **Cluster information**: Get cluster health and stats

## Enabling the MCP server

The MCP server is available in OpenSearch 2.19+. Enable it in your `opensearch.yml` configuration:

```yaml
plugins.mcp.enabled: true
```

In the Observability Stack's Docker Compose setup, this is pre-configured.

## Connecting an AI agent

AI agents that support MCP can connect to the OpenSearch MCP server endpoint. The server uses the standard MCP transport protocol (stdio or SSE) depending on your deployment.

### Example: using with an MCP-compatible agent

Once the MCP server is enabled, point your MCP client to the OpenSearch endpoint. The agent will automatically discover available tools and can use them to query your observability data.

For example, an agent could:
1. List available indices to find trace data
2. Run a PPL query to find error traces
3. Search for related logs using trace IDs
4. Retrieve service map data to understand dependencies

## Use cases for observability

The MCP server is particularly useful for AI-assisted investigation workflows:

- **Natural language querying**: Ask an AI agent to "find all error traces from the last hour" and it translates to PPL queries via MCP
- **Automated root cause analysis**: Agents can correlate logs, traces, and metrics by calling multiple MCP tools in sequence
- **Report generation**: Agents can pull observability data and summarize system health

## Learn more

- [Introducing MCP in OpenSearch](https://opensearch.org/blog/introducing-mcp-in-opensearch/) - announcement blog post with architecture details
- [Model Context Protocol specification](https://modelcontextprotocol.io/) - the MCP standard
