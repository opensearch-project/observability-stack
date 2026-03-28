---
title: "Configuration"
description: "Configure Agent Health to connect your AI agent, set up storage, and customize evaluation behavior"
sidebar:
  hidden: true
---

Agent Health works out of the box with demo data and file-based storage. Configure it when you're ready to connect your own agent or use production services.

## Zero-config defaults

Most users can start immediately with no configuration:

```bash
npx @opensearch-project/agent-health@latest
```

This works because:
- Travel Planner demo test cases are built-in
- File-based storage is used by default (no OpenSearch needed)
- Demo Judge provides mock evaluation (no AWS credentials needed)

## Configuration hierarchy

Settings are loaded in this order (later overrides earlier):

```text
1. Built-in defaults
      |
2. Environment variables (.env file)
      |
3. JSON config file (agent-health.config.json) - auto-created
      |
4. TypeScript config file (agent-health.config.ts) - optional, for custom agents/connectors
```

## JSON config file

On first startup, Agent Health creates `agent-health.config.json` in your working directory:

```json
{
  "storage": {
    "type": "file",
    "dataDir": ".agent-health-data"
  },
  "server": {
    "port": 4001
  },
  "debug": false
}
```

Settings saved through the UI are persisted to this file automatically.

## TypeScript config file

Create `agent-health.config.ts` for custom agents, models, or connectors. Generate one with:

```bash
npx @opensearch-project/agent-health init
```

Or create manually:

```typescript
// agent-health.config.ts
import { defineConfig } from '@opensearch-project/agent-health';

export default defineConfig({
  agents: [
    {
      key: 'my-agent',
      name: 'My Custom Agent',
      connectorType: 'rest',
      endpoint: 'http://localhost:8080/chat',
      models: ['claude-sonnet-4'],
      useTraces: true,
    },
  ],

  storage: {
    endpoint: process.env.OPENSEARCH_STORAGE_ENDPOINT,
    username: 'admin',
    password: process.env.OPENSEARCH_STORAGE_PASSWORD,
  },
});
```

### Agent config options

| Option | Type | Description |
|--------|------|-------------|
| `key` | `string` | Unique identifier |
| `name` | `string` | Display name |
| `endpoint` | `string` | URL or command name |
| `connectorType` | `string` | `'agui'`, `'rest'`, `'subprocess'`, `'claude-code'`, `'mock'` |
| `models` | `string[]` | Supported model keys |
| `headers` | `Record<string, string>` | HTTP headers |
| `useTraces` | `boolean` | Enable trace collection |
| `connectorConfig` | `any` | Connector-specific config |
| `description` | `string` | Description |
| `enabled` | `boolean` | Enable/disable agent |

### Config file options

| Option | Type | Description |
|--------|------|-------------|
| `agents` | `UserAgentConfig[]` | Custom agents (merged with defaults) |
| `models` | `UserModelConfig[]` | Custom models (merged with defaults) |
| `connectors` | `AgentConnector[]` | Custom connectors |
| `storage` | `StorageConfig` | OpenSearch storage config |
| `observability` | `ObservabilityConfig` | OpenSearch logs config |
| `testCases` | `string \| string[]` | Test case file patterns |
| `reporters` | `ReporterConfig[]` | Output reporters |
| `judge` | `JudgeConfig` | Judge model configuration |
| `extends` | `boolean` | Extend defaults (`true`) or replace (`false`) |

## Built-in agents

These agents work without configuration:

| Agent | Key | Connector | Notes |
|-------|-----|-----------|-------|
| Demo Agent | `demo` | `mock` | Simulated responses for testing |
| Claude Code | `claude-code` | `claude-code` | Requires `claude` CLI installed |
| Langgraph | `langgraph` | `agui-streaming` | AG-UI protocol |
| ML-Commons | `mlcommons-local` | `agui-streaming` | Local OpenSearch |
| HolmesGPT | `holmesgpt` | `agui-streaming` | AI investigation agent |

## Environment variables

### AWS credentials

Required for the Bedrock LLM judge and Claude Code agent.

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_PROFILE` | AWS profile to use | `default` |
| `AWS_REGION` | AWS region | `us-west-2` |
| `AWS_ACCESS_KEY_ID` | Explicit access key (alternative to profile) | - |
| `AWS_SECRET_ACCESS_KEY` | Explicit secret key | - |
| `AWS_SESSION_TOKEN` | Session token (for temporary credentials) | - |

### OpenSearch Storage (optional)

Override the default file-based storage with an OpenSearch cluster.

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENSEARCH_STORAGE_ENDPOINT` | Storage cluster URL | - |
| `OPENSEARCH_STORAGE_USERNAME` | Username | - |
| `OPENSEARCH_STORAGE_PASSWORD` | Password | - |
| `OPENSEARCH_STORAGE_TLS_SKIP_VERIFY` | Skip TLS verification | `false` |

### OpenSearch Observability (optional)

For viewing agent traces and logs.

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENSEARCH_LOGS_ENDPOINT` | Logs cluster URL | - |
| `OPENSEARCH_LOGS_USERNAME` | Username | - |
| `OPENSEARCH_LOGS_PASSWORD` | Password | - |
| `OPENSEARCH_LOGS_TRACES_INDEX` | Traces index pattern | `otel-v1-apm-span-*` |
| `OPENSEARCH_LOGS_INDEX` | Logs index pattern | `ml-commons-logs-*` |

### Debug

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG` | Enable verbose debug logging | `false` |

## Validation

Check your configuration with the `doctor` command:

```bash
npx @opensearch-project/agent-health doctor
```

```text
$ agent-health doctor

✓ Config File: Found: agent-health.config.ts
✓ AWS Credentials: Profile: Bedrock
✓ Agents: 3 agents configured
⚠ OpenSearch Storage: Not configured
⚠ OpenSearch Observability: Not configured
```

## Next steps

- [Connectors](/docs/agent-health/configuration/connectors/) - create custom connectors for your agent type
- [CLI Reference](/docs/agent-health/cli/) - all commands and options
