---
title: "Go"
description: "Instrument Go applications with OpenTelemetry to send traces, metrics, and logs to the observability stack"
---

This guide covers adding OpenTelemetry instrumentation to Go applications. Go does not have an auto-instrumentation agent, so you instrument explicitly using the OTel SDK and middleware packages for common frameworks.

## Prerequisites

- Go 1.21+
- OTel Collector running at `localhost:4317` (gRPC) or `localhost:4318` (HTTP)
- Go modules enabled

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [official OpenTelemetry Go documentation](https://opentelemetry.io/docs/languages/go/).
:::

## Install dependencies

```bash
go get go.opentelemetry.io/otel \
  go.opentelemetry.io/otel/sdk \
  go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc \
  go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc \
  go.opentelemetry.io/otel/sdk/metric \
  go.opentelemetry.io/otel/semconv/v1.26.0
```

## SDK setup

Create a setup function that initializes trace and metric providers:

```go
package telemetry

import (
	"context"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func Setup(ctx context.Context, serviceName string) (func(), error) {
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion("1.0.0"),
			semconv.DeploymentEnvironment("development"),
		),
	)
	if err != nil {
		return nil, err
	}

	// Traces
	traceExporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint("localhost:4317"),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		sdktrace.WithBatcher(traceExporter),
	)
	otel.SetTracerProvider(tp)

	// Metrics
	metricExporter, err := otlpmetricgrpc.New(ctx,
		otlpmetricgrpc.WithEndpoint("localhost:4317"),
		otlpmetricgrpc.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	mp := metric.NewMeterProvider(
		metric.WithResource(res),
		metric.WithReader(metric.NewPeriodicReader(metricExporter,
			metric.WithInterval(2*time.Second),
		)),
	)
	otel.SetMeterProvider(mp)

	// Return shutdown function
	shutdown := func() {
		tp.Shutdown(ctx)
		mp.Shutdown(ctx)
	}
	return shutdown, nil
}
```

Call `Setup` in your `main()`:

```go
func main() {
	ctx := context.Background()
	shutdown, err := telemetry.Setup(ctx, "my-go-service")
	if err != nil {
		log.Fatal(err)
	}
	defer shutdown()

	// ... start application
}
```

## Manual instrumentation

### Creating spans

```go
import "go.opentelemetry.io/otel"

var tracer = otel.Tracer("my-module")

func ProcessOrder(ctx context.Context, orderID string) error {
	ctx, span := tracer.Start(ctx, "process_order")
	defer span.End()

	span.SetAttributes(attribute.String("order.id", orderID))

	// Child span
	if err := validatePayment(ctx, orderID); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.AddEvent("order_processed", trace.WithAttributes(
		attribute.String("order.id", orderID),
	))
	return nil
}
```

### Recording metrics

```go
import "go.opentelemetry.io/otel"

var meter = otel.Meter("my-module")

func initMetrics() {
	requestCounter, _ := meter.Int64Counter("http.server.request_count",
		metric.WithDescription("Number of HTTP requests"),
		metric.WithUnit("1"),
	)

	requestDuration, _ := meter.Float64Histogram("http.server.duration",
		metric.WithDescription("HTTP request duration"),
		metric.WithUnit("ms"),
	)

	// Use in handlers
	requestCounter.Add(ctx, 1,
		metric.WithAttributes(
			attribute.String("http.method", "GET"),
			attribute.String("http.route", "/api/orders"),
		),
	)

	requestDuration.Record(ctx, 45.2,
		metric.WithAttributes(
			attribute.String("http.method", "GET"),
			attribute.String("http.route", "/api/orders"),
		),
	)
}
```

## Framework integration

### net/http

Use the `otelhttp` middleware:

```bash
go get go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp
```

```go
import "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

mux := http.NewServeMux()
mux.HandleFunc("/orders", handleOrders)

// Wrap the handler with OTel middleware
handler := otelhttp.NewHandler(mux, "server")
http.ListenAndServe(":8080", handler)
```

For outbound HTTP calls:

```go
client := &http.Client{
	Transport: otelhttp.NewTransport(http.DefaultTransport),
}
resp, err := client.Get("https://api.example.com/data")
```

### gRPC

```bash
go get go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc
```

Server-side:

```go
import "go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"

server := grpc.NewServer(
	grpc.StatsHandler(otelgrpc.NewServerHandler()),
)
```

Client-side:

```go
conn, err := grpc.Dial(addr,
	grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
)
```

### Gin

```bash
go get go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin
```

```go
import "go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

r := gin.Default()
r.Use(otelgin.Middleware("my-service"))
```

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `my-go-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol | `grpc` |
| `OTEL_TRACES_SAMPLER` | Sampler type | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument | `0.1` |
| `OTEL_RESOURCE_ATTRIBUTES` | Additional resource attributes | `deployment.environment=prod` |

## Related links

- [Applications overview](/docs/send-data/applications/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [Sampling](/docs/send-data/opentelemetry/sampling/)
- [OpenTelemetry Go documentation](https://opentelemetry.io/docs/languages/go/) -- Official OTel Go SDK reference
- [Go instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=go&component=instrumentation) -- Available instrumentation packages
