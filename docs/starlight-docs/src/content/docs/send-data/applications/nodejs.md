---
title: "Node.js"
description: "Instrument Node.js applications with OpenTelemetry to send traces, metrics, and logs to the observability stack"
---

This guide covers adding OpenTelemetry instrumentation to Node.js applications. The Node.js OTel SDK supports auto-instrumentation for Express, Fastify, HTTP, gRPC, database clients, and many other libraries.

## Prerequisites

- Node.js 16+
- OTel Collector running at `localhost:4317` (gRPC) or `localhost:4318` (HTTP)
- npm, yarn, or pnpm for package management

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [official OpenTelemetry JavaScript documentation](https://opentelemetry.io/docs/languages/js/).
:::

## Install dependencies

Install the core SDK and OTLP exporter:

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/exporter-logs-otlp-grpc \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

For auto-instrumentation of common libraries:

```bash
npm install @opentelemetry/auto-instrumentations-node
```

## SDK setup

Create a `tracing.js` (or `tracing.ts`) file that initializes the SDK:

```javascript
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-grpc");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-grpc");
const {
  OTLPLogExporter,
} = require("@opentelemetry/exporter-logs-otlp-grpc");
const {
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const { Resource } = require("@opentelemetry/resources");
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require("@opentelemetry/semantic-conventions");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

const resource = new Resource({
  [ATTR_SERVICE_NAME]: "my-node-service",
  [ATTR_SERVICE_VERSION]: "1.0.0",
  "deployment.environment": "development",
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: "grpc://localhost:4317",
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: "grpc://localhost:4317",
    }),
    exportIntervalMillis: 2000,
  }),
  logRecordExporter: new OTLPLogExporter({
    url: "grpc://localhost:4317",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

## Auto-instrumentation

The simplest approach uses `--require` to load the tracing setup before your application:

```bash
node --require ./tracing.js app.js
```

The `@opentelemetry/auto-instrumentations-node` package automatically instruments:

- HTTP/HTTPS clients and servers
- Express, Fastify, Koa, Hapi
- gRPC clients and servers
- MySQL, PostgreSQL, MongoDB, Redis
- AWS SDK, GraphQL, and more

To disable specific instrumentations:

```javascript
const { getNodeAutoInstrumentations } = require(
  "@opentelemetry/auto-instrumentations-node"
);

const instrumentations = getNodeAutoInstrumentations({
  "@opentelemetry/instrumentation-fs": { enabled: false },
  "@opentelemetry/instrumentation-dns": { enabled: false },
});
```

## Manual instrumentation

### Creating spans

```javascript
const { trace } = require("@opentelemetry/api");

const tracer = trace.getTracer("my-module");

async function processOrder(orderId) {
  return tracer.startActiveSpan("process_order", async (span) => {
    try {
      span.setAttribute("order.id", orderId);

      // Child span
      await tracer.startActiveSpan("validate_payment", async (child) => {
        await validatePayment(orderId);
        child.end();
      });

      span.addEvent("order_processed", { "order.id": orderId });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message }); // ERROR
      throw err;
    } finally {
      span.end();
    }
  });
}
```

### Recording metrics

```javascript
const { metrics } = require("@opentelemetry/api");

const meter = metrics.getMeter("my-module");

const requestCounter = meter.createCounter("http.server.request_count", {
  description: "Number of HTTP requests",
  unit: "1",
});

const requestDuration = meter.createHistogram("http.server.duration", {
  description: "HTTP request duration",
  unit: "ms",
});

function handleRequest(req, res) {
  requestCounter.add(1, { "http.method": req.method, "http.route": req.path });
  const start = Date.now();
  // ... handle request
  requestDuration.record(Date.now() - start, {
    "http.method": req.method,
    "http.route": req.path,
  });
}
```

## Framework integration

### Express

```javascript
const express = require("express");
const {
  ExpressInstrumentation,
} = require("@opentelemetry/instrumentation-express");
const {
  HttpInstrumentation,
} = require("@opentelemetry/instrumentation-http");

// If using NodeSDK, add these to the instrumentations array:
const sdk = new NodeSDK({
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
  // ... other config
});

const app = express();

app.get("/orders/:id", (req, res) => {
  res.json({ orderId: req.params.id });
});

app.listen(3000);
```

### Fastify

```javascript
const {
  FastifyInstrumentation,
} = require("@opentelemetry/instrumentation-fastify");

const sdk = new NodeSDK({
  instrumentations: [new FastifyInstrumentation()],
  // ... other config
});
```

### Next.js

For Next.js applications, initialize the SDK in an `instrumentation.ts` file:

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./tracing");
  }
}
```

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `my-node-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol | `grpc` |
| `OTEL_TRACES_SAMPLER` | Sampler type | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument | `0.1` |
| `OTEL_NODE_ENABLED_INSTRUMENTATIONS` | Comma-separated list of instrumentations to enable | `http,express` |
| `OTEL_NODE_DISABLED_INSTRUMENTATIONS` | Comma-separated list of instrumentations to disable | `fs,dns` |
| `NODE_OPTIONS` | Load tracing at startup | `--require ./tracing.js` |

## Related links

- [TypeScript SDK](/docs/send-data/ai-agents/typescript/) - purpose-built instrumentation for AI agent applications
- [Applications overview](/docs/send-data/applications/)
- [Auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [OpenTelemetry JavaScript documentation](https://opentelemetry.io/docs/languages/js/) -- Official OTel JS/Node.js SDK reference
- [Node.js instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=js&component=instrumentation) -- Available auto-instrumentation packages
