---
title: ".NET"
description: "Instrument .NET applications with OpenTelemetry to send traces, metrics, and logs to the observability stack"
---

This guide covers adding OpenTelemetry instrumentation to .NET applications. The .NET OTel SDK integrates with the standard `ILogger`, `Activity`, and `Meter` APIs, making it straightforward to add observability to ASP.NET Core and other .NET workloads.

## Prerequisites

- .NET 6.0+ (or .NET Framework 4.6.2+ with limited support)
- OTel Collector running at `localhost:4317` (gRPC) or `localhost:4318` (HTTP)
- NuGet for package management

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [official OpenTelemetry .NET documentation](https://opentelemetry.io/docs/languages/dotnet/).
:::

## Install dependencies

```bash
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
dotnet add package OpenTelemetry.Instrumentation.AspNetCore
dotnet add package OpenTelemetry.Instrumentation.Http
```

## SDK setup

Configure OpenTelemetry in your `Program.cs`:

```csharp
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using OpenTelemetry.Logs;

var builder = WebApplication.CreateBuilder(args);

var resourceBuilder = ResourceBuilder.CreateDefault()
    .AddService(
        serviceName: "my-dotnet-service",
        serviceVersion: "1.0.0")
    .AddAttributes(new Dictionary<string, object>
    {
        ["deployment.environment"] = "development"
    });

// Traces
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("my-dotnet-service", "1.0.0"))
    .WithTracing(tracing => tracing
        .SetResourceBuilder(resourceBuilder)
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter(opts =>
        {
            opts.Endpoint = new Uri("http://localhost:4317");
        }))
    .WithMetrics(metrics => metrics
        .SetResourceBuilder(resourceBuilder)
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter(opts =>
        {
            opts.Endpoint = new Uri("http://localhost:4317");
        }));

// Logs
builder.Logging.AddOpenTelemetry(logging =>
{
    logging.SetResourceBuilder(resourceBuilder);
    logging.AddOtlpExporter(opts =>
    {
        opts.Endpoint = new Uri("http://localhost:4317");
    });
});

var app = builder.Build();
app.Run();
```

## Auto-instrumentation

.NET supports zero-code instrumentation using the `DOTNET_STARTUP_HOOKS` environment variable:

```bash
# Download the auto-instrumentation package
curl -L -o otel-dotnet-install.sh \
  https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/latest/download/otel-dotnet-auto-install.sh
chmod +x otel-dotnet-install.sh
./otel-dotnet-install.sh

# Set environment variables
export CORECLR_ENABLE_PROFILING=1
export CORECLR_PROFILER="{918728DD-259F-4A6A-AC2B-B85E1B658318}"
export CORECLR_PROFILER_PATH="$HOME/.otel-dotnet-auto/linux-x64/OpenTelemetry.AutoInstrumentation.Native.so"
export DOTNET_ADDITIONAL_DEPS="$HOME/.otel-dotnet-auto/AdditionalDeps"
export DOTNET_SHARED_STORE="$HOME/.otel-dotnet-auto/store"
export DOTNET_STARTUP_HOOKS="$HOME/.otel-dotnet-auto/net/OpenTelemetry.AutoInstrumentation.StartupHook.dll"
export OTEL_SERVICE_NAME="my-dotnet-service"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"

dotnet run
```

Auto-instrumentation covers ASP.NET Core, HttpClient, SqlClient, Entity Framework Core, gRPC, and more.

## Manual instrumentation

### Creating spans

.NET uses the `System.Diagnostics.Activity` API, which OTel maps to spans:

```csharp
using System.Diagnostics;

public class OrderService
{
    private static readonly ActivitySource Source = new("MyApp.Orders");

    public async Task ProcessOrder(string orderId)
    {
        using var activity = Source.StartActivity("process_order");
        activity?.SetTag("order.id", orderId);

        await ValidatePayment(orderId);

        activity?.AddEvent(new ActivityEvent("order_processed",
            tags: new ActivityTagsCollection
            {
                { "order.id", orderId }
            }));
    }
}
```

Register the `ActivitySource` with the tracer provider:

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddSource("MyApp.Orders")
        // ... exporters
    );
```

### Recording metrics

```csharp
using System.Diagnostics.Metrics;

public class OrderMetrics
{
    private static readonly Meter Meter = new("MyApp.Orders");
    private static readonly Counter<long> RequestCounter =
        Meter.CreateCounter<long>("http.server.request_count", "1", "Number of HTTP requests");
    private static readonly Histogram<double> RequestDuration =
        Meter.CreateHistogram<double>("http.server.duration", "ms", "HTTP request duration");

    public void RecordRequest(string method, string route, double durationMs)
    {
        var tags = new TagList
        {
            { "http.method", method },
            { "http.route", route }
        };
        RequestCounter.Add(1, tags);
        RequestDuration.Record(durationMs, tags);
    }
}
```

Register the `Meter` with the meter provider:

```csharp
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics => metrics
        .AddMeter("MyApp.Orders")
        // ... exporters
    );
```

## Framework integration

### ASP.NET Core

The `AddAspNetCoreInstrumentation()` call shown in the SDK setup section automatically captures:

- Inbound HTTP request spans
- Request/response attributes (method, status code, route)
- Exception recording

### gRPC

```bash
dotnet add package OpenTelemetry.Instrumentation.GrpcNetClient
```

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddGrpcClientInstrumentation()
    );
```

### Entity Framework Core

```bash
dotnet add package OpenTelemetry.Instrumentation.EntityFrameworkCore
```

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddEntityFrameworkCoreInstrumentation()
    );
```

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `my-dotnet-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol | `grpc` |
| `OTEL_TRACES_SAMPLER` | Sampler type | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument | `0.1` |
| `CORECLR_ENABLE_PROFILING` | Enable CLR profiler (auto-instrumentation) | `1` |
| `DOTNET_STARTUP_HOOKS` | Startup hook DLL path (auto-instrumentation) | Path to `.dll` |
| `OTEL_DOTNET_AUTO_TRACES_ENABLED_INSTRUMENTATIONS` | Enabled auto-instrumentations | `AspNet,HttpClient` |

## Related links

- [Applications overview](/docs/send-data/applications/)
- [Auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [OpenTelemetry .NET documentation](https://opentelemetry.io/docs/languages/dotnet/) -- Official OTel .NET SDK reference
- [.NET instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=dotnet&component=instrumentation) -- Available auto-instrumentation packages
