---
title: "Connectors"
description: "Create custom connectors for Agent Health to support different AI agent protocols"
sidebar:
  order: 8
---

Connectors are protocol adapters that handle communication with different types of AI agents. Each connector implements a standard interface that converts between Agent Health's internal request/response format and the agent's native protocol.

## Built-in connectors

| Type | Protocol | Use Case |
|------|----------|----------|
| `agui-streaming` | AG-UI SSE | ML-Commons agents (default) |
| `rest` | HTTP POST | Non-streaming REST APIs |
| `subprocess` | CLI stdin/stdout | Command-line tools |
| `claude-code` | Claude Code CLI | Claude Code agent comparison |
| `mock` | In-memory | Demo and testing |

## Creating a custom connector

### 1. Extend BaseConnector

```typescript
import { BaseConnector } from '@/services/connectors';
import type {
  ConnectorAuth,
  ConnectorRequest,
  ConnectorResponse,
  ConnectorProgressCallback,
  ConnectorRawEventCallback,
} from '@/services/connectors/types';
import type { TrajectoryStep } from '@/types';

export class MyConnector extends BaseConnector {
  readonly type = 'my-connector' as const;
  readonly name = 'My Custom Connector';
  readonly supportsStreaming = true;

  buildPayload(request: ConnectorRequest): any {
    return {
      prompt: request.testCase.initialPrompt,
      context: request.testCase.context,
      model: request.modelId,
    };
  }

  async execute(
    endpoint: string,
    request: ConnectorRequest,
    auth: ConnectorAuth,
    onProgress?: ConnectorProgressCallback,
    onRawEvent?: ConnectorRawEventCallback
  ): Promise<ConnectorResponse> {
    const payload = this.buildPayload(request);
    const headers = this.buildAuthHeaders(auth);
    const trajectory: TrajectoryStep[] = [];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    onRawEvent?.(data);

    const steps = this.parseResponse(data);
    steps.forEach(step => {
      trajectory.push(step);
      onProgress?.(step);
    });

    return { trajectory, runId: data.runId || null, rawEvents: [data] };
  }

  parseResponse(data: any): TrajectoryStep[] {
    const steps: TrajectoryStep[] = [];

    if (data.thinking) {
      steps.push(this.createStep('thinking', data.thinking));
    }
    if (data.toolCalls) {
      for (const call of data.toolCalls) {
        steps.push(this.createStep('action', `Calling ${call.name}`, {
          toolName: call.name,
          toolArgs: call.args,
        }));
        if (call.result) {
          steps.push(this.createStep('tool_result', call.result, {
            status: 'SUCCESS',
          }));
        }
      }
    }
    if (data.response) {
      steps.push(this.createStep('response', data.response));
    }

    return steps;
  }
}
```

### 2. Register the connector

```typescript
import { connectorRegistry } from '@/services/connectors';
import { MyConnector } from './MyConnector';

connectorRegistry.register(new MyConnector());
```

### 3. Use in agent configuration

```typescript
// agent-health.config.ts
export default {
  agents: [
    {
      key: 'my-agent',
      name: 'My Agent',
      endpoint: 'https://api.example.com/agent',
      connectorType: 'my-connector',
      models: ['claude-sonnet-4'],
    },
  ],
};
```

## Authentication types

| Type | Description | Fields |
|------|-------------|--------|
| `none` | No authentication | `headers` (passthrough) |
| `basic` | HTTP Basic Auth | `username`, `password` or `token` |
| `bearer` | Bearer token | `token` |
| `api-key` | API key header | `token`, `headerName` |
| `aws-sigv4` | AWS Signature V4 | Uses environment credentials |

## Streaming support

For connectors that support streaming, emit progress updates as events arrive:

```typescript
async execute(endpoint, request, auth, onProgress, onRawEvent) {
  const eventSource = new EventSource(endpoint);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onRawEvent?.(data);

    if (data.type === 'thinking') {
      const step = this.createStep('thinking', data.content);
      onProgress?.(step);
    }
  };

  return new Promise((resolve) => {
    eventSource.addEventListener('done', () => {
      resolve({ trajectory, runId, rawEvents });
    });
  });
}
```

## Browser vs server connectors

Some connectors require Node.js APIs (like `child_process`) and cannot run in the browser:

**Browser-safe connectors** (`services/connectors/index.ts`):
- `agui-streaming`, `rest`, `mock`

**Server-only connectors** (`services/connectors/server.ts`):
- `subprocess`, `claude-code`

If your connector needs Node.js APIs, export it from `server.ts` only.
