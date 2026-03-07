---
title: "Browser / Frontend"
description: "Add real user monitoring to web applications with OpenTelemetry for browser-side traces and metrics"
---

This guide covers adding OpenTelemetry instrumentation to browser and frontend applications for real user monitoring (RUM). Browser instrumentation captures page loads, user interactions, fetch/XHR requests, and web vitals from end-user browsers.

## Prerequisites

- Modern browser environment (Chrome, Firefox, Safari, Edge)
- OTel Collector running at `localhost:4318` (HTTP) -- browsers cannot use gRPC
- npm, yarn, or pnpm for package management
- CORS configured on the Collector to accept requests from your application origin

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [OpenTelemetry JavaScript browser libraries documentation](https://opentelemetry.io/docs/languages/js/libraries/#browser).
:::

## Install dependencies

```bash
npm install @opentelemetry/api \
  @opentelemetry/sdk-trace-web \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/context-zone \
  @opentelemetry/instrumentation-document-load \
  @opentelemetry/instrumentation-fetch \
  @opentelemetry/instrumentation-xml-http-request
```

## SDK setup

Initialize the OTel SDK early in your application entry point:

```javascript
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: "my-frontend",
  "deployment.environment": "production",
  "browser.language": navigator.language,
});

const provider = new WebTracerProvider({
  resource,
});

provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: "http://localhost:4318/v1/traces",
    })
  )
);

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [/localhost/, /api\.example\.com/],
    }),
    new XMLHttpRequestInstrumentation({
      propagateTraceHeaderCorsUrls: [/localhost/, /api\.example\.com/],
    }),
  ],
});
```

## What gets captured

### Document load instrumentation

Automatically creates spans for the page load lifecycle:

| Span | Description |
|------|-------------|
| `documentFetch` | Initial HTML document fetch |
| `documentLoad` | Full page load including subresources |
| `resourceFetch` | Individual resource loads (scripts, stylesheets, images) |

Captured attributes include Navigation Timing API metrics: `domContentLoadedEventEnd`, `loadEventEnd`, `responseEnd`, etc.

### Fetch / XHR instrumentation

Captures outbound HTTP requests from the browser:

- Request method, URL, status code
- Request and response content length
- Distributed trace context propagation to backends

## Manual instrumentation

### Creating spans for user interactions

```javascript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("my-frontend");

function handleCheckout(cartId) {
  const span = tracer.startSpan("checkout.click", {
    attributes: {
      "cart.id": cartId,
      "cart.item_count": getCartItemCount(),
    },
  });

  submitOrder(cartId)
    .then((result) => {
      span.setAttribute("order.id", result.orderId);
      span.end();
    })
    .catch((err) => {
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
      span.end();
    });
}
```

### Tracking web vitals

```javascript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("web-vitals");

// Using the web-vitals library
import { onLCP, onFID, onCLS } from "web-vitals";

function reportVital(metric) {
  const span = tracer.startSpan(`web_vital.${metric.name}`, {
    attributes: {
      "web_vital.name": metric.name,
      "web_vital.value": metric.value,
      "web_vital.rating": metric.rating,
      "web_vital.id": metric.id,
    },
  });
  span.end();
}

onLCP(reportVital);
onFID(reportVital);
onCLS(reportVital);
```

## CORS configuration

Browsers enforce CORS on requests to the Collector. Configure your OTel Collector to accept browser requests:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: "0.0.0.0:4318"
        cors:
          allowed_origins:
            - "http://localhost:*"
            - "https://myapp.example.com"
          allowed_headers:
            - "Content-Type"
            - "X-Requested-With"
          max_age: 7200
```

### Trace context propagation

To connect browser traces with backend traces, configure `propagateTraceHeaderCorsUrls` in the fetch/XHR instrumentations to match your API origins. This injects `traceparent` and `tracestate` headers into outbound requests.

Your backend services must also have CORS configured to accept these headers:

```
Access-Control-Allow-Headers: traceparent, tracestate
```

## Framework-specific setup

### React

Initialize telemetry before rendering:

```javascript
// index.js
import "./telemetry"; // import the setup file first
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(<App />);
```

### Next.js (client-side)

Use a client component to initialize:

```typescript
// components/TelemetryProvider.tsx
"use client";

import { useEffect } from "react";

export function TelemetryProvider({ children }) {
  useEffect(() => {
    import("./telemetry"); // dynamic import on client only
  }, []);

  return <>{children}</>;
}
```

## Environment variables

Browser applications cannot read environment variables at runtime. Configure these at build time or pass them through your bundler:

| Build-time variable | Description | Example |
|---------------------|-------------|---------|
| `VITE_OTEL_ENDPOINT` | Collector HTTP endpoint | `http://localhost:4318` |
| `VITE_OTEL_SERVICE_NAME` | Service name | `my-frontend` |
| `NEXT_PUBLIC_OTEL_ENDPOINT` | Collector endpoint (Next.js) | `http://localhost:4318` |

Example with Vite:

```javascript
const exporter = new OTLPTraceExporter({
  url: `${import.meta.env.VITE_OTEL_ENDPOINT}/v1/traces`,
});
```

## Limitations

- **gRPC not available**: Browsers can only use HTTP/protobuf or HTTP/JSON. Export to port `4318`, not `4317`.
- **No metrics SDK**: The `@opentelemetry/sdk-metrics` package does not yet have full browser support. Use trace-based metrics or custom span attributes.
- **Bundle size**: The full OTel SDK adds ~50-80KB gzipped. Use tree-shaking and only import instrumentations you need.
- **Sampling**: For high-traffic sites, configure client-side sampling to reduce Collector load.

## Related links

- [Applications overview](/docs/send-data/applications/)
- [OTel Collector configuration](/docs/send-data/opentelemetry/collector/)
- [Sampling](/docs/send-data/opentelemetry/sampling/)
- [OpenTelemetry JavaScript documentation](https://opentelemetry.io/docs/languages/js/) -- Official OTel JS SDK reference
- [Browser instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=js&component=instrumentation) -- Available browser instrumentation packages
