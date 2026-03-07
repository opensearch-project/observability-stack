---
title: "Ruby"
description: "Instrument Ruby applications with OpenTelemetry to send traces, metrics, and logs to the observability stack"
---

This guide covers adding OpenTelemetry instrumentation to Ruby applications. Ruby has auto-instrumentation support for Rails, Sinatra, Rack, and popular database and HTTP client libraries.

## Prerequisites

- Ruby 3.0+
- OTel Collector running at `localhost:4317` (gRPC) or `localhost:4318` (HTTP)
- Bundler for dependency management

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [official OpenTelemetry Ruby documentation](https://opentelemetry.io/docs/languages/ruby/).
:::

## Install dependencies

Add to your `Gemfile`:

```ruby
gem "opentelemetry-sdk"
gem "opentelemetry-exporter-otlp"
gem "opentelemetry-instrumentation-all"
```

Then install:

```bash
bundle install
```

The `opentelemetry-instrumentation-all` meta-gem includes instrumentation for Rails, Sinatra, Rack, Faraday, Net::HTTP, pg, mysql2, redis, sidekiq, and more.

For a minimal install, pick individual instrumentation gems:

```ruby
gem "opentelemetry-sdk"
gem "opentelemetry-exporter-otlp"
gem "opentelemetry-instrumentation-rack"
gem "opentelemetry-instrumentation-rails"
```

## SDK setup

Initialize OpenTelemetry early in your application startup:

```ruby
require "opentelemetry/sdk"
require "opentelemetry/exporter/otlp"
require "opentelemetry/instrumentation/all"

OpenTelemetry::SDK.configure do |c|
  c.service_name = "my-ruby-service"
  c.service_version = "1.0.0"

  c.resource = OpenTelemetry::SDK::Resources::Resource.create(
    "deployment.environment" => "development"
  )

  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new(
        endpoint: "http://localhost:4317"
      )
    )
  )

  c.use_all # Auto-instrument all installed libraries
end
```

## Auto-instrumentation

The `use_all` method shown above enables auto-instrumentation for all installed instrumentation gems. To selectively enable instrumentations:

```ruby
OpenTelemetry::SDK.configure do |c|
  c.use "OpenTelemetry::Instrumentation::Rack"
  c.use "OpenTelemetry::Instrumentation::Rails"
  c.use "OpenTelemetry::Instrumentation::Net::HTTP"
  c.use "OpenTelemetry::Instrumentation::PG"
end
```

To configure individual instrumentations:

```ruby
OpenTelemetry::SDK.configure do |c|
  c.use "OpenTelemetry::Instrumentation::Rails", {
    enable_recognize_route: true
  }
  c.use "OpenTelemetry::Instrumentation::Sidekiq", {
    span_naming: :job_class
  }
end
```

## Manual instrumentation

### Creating spans

```ruby
tracer = OpenTelemetry.tracer_provider.tracer("my-module")

def process_order(order_id)
  tracer = OpenTelemetry.tracer_provider.tracer("my-module")

  tracer.in_span("process_order", attributes: { "order.id" => order_id }) do |span|
    validate_payment(order_id)

    span.add_event("order_processed", attributes: { "order.id" => order_id })
  end
end
```

### Recording errors

```ruby
tracer.in_span("risky_operation") do |span|
  begin
    perform_operation
  rescue StandardError => e
    span.record_exception(e)
    span.status = OpenTelemetry::Trace::Status.error(e.message)
    raise
  end
end
```

### Recording metrics

```ruby
meter = OpenTelemetry.meter_provider.meter("my-module")

request_counter = meter.create_counter(
  "http.server.request_count",
  description: "Number of HTTP requests",
  unit: "1"
)

request_duration = meter.create_histogram(
  "http.server.duration",
  description: "HTTP request duration",
  unit: "ms"
)

def handle_request(method, route, duration_ms)
  attributes = { "http.method" => method, "http.route" => route }
  request_counter.add(1, attributes: attributes)
  request_duration.record(duration_ms, attributes: attributes)
end
```

## Framework integration

### Rails

Create an initializer at `config/initializers/opentelemetry.rb`:

```ruby
require "opentelemetry/sdk"
require "opentelemetry/exporter/otlp"
require "opentelemetry/instrumentation/rails"
require "opentelemetry/instrumentation/active_record"

OpenTelemetry::SDK.configure do |c|
  c.service_name = "my-rails-app"

  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new(
        endpoint: "http://localhost:4317"
      )
    )
  )

  c.use "OpenTelemetry::Instrumentation::Rails"
  c.use "OpenTelemetry::Instrumentation::ActiveRecord"
  c.use "OpenTelemetry::Instrumentation::ActionPack"
  c.use "OpenTelemetry::Instrumentation::ActionView"
end
```

### Sinatra

```ruby
require "sinatra"
require "opentelemetry/sdk"
require "opentelemetry/exporter/otlp"
require "opentelemetry/instrumentation/sinatra"

OpenTelemetry::SDK.configure do |c|
  c.service_name = "my-sinatra-app"

  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new(
        endpoint: "http://localhost:4317"
      )
    )
  )

  c.use "OpenTelemetry::Instrumentation::Sinatra"
end

get "/orders/:id" do
  { order_id: params[:id] }.to_json
end
```

### Sidekiq

```ruby
require "opentelemetry/instrumentation/sidekiq"

OpenTelemetry::SDK.configure do |c|
  c.use "OpenTelemetry::Instrumentation::Sidekiq", {
    span_naming: :job_class,
    propagation_style: :link
  }
end
```

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `my-ruby-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol | `grpc` |
| `OTEL_TRACES_SAMPLER` | Sampler type | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument | `0.1` |
| `OTEL_RESOURCE_ATTRIBUTES` | Additional resource attributes | `deployment.environment=prod` |
| `OTEL_RUBY_DISABLED_INSTRUMENTATIONS` | Disabled instrumentations | `sidekiq,redis` |

## Related links

- [Applications overview](/docs/send-data/applications/)
- [Auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [OpenTelemetry Ruby documentation](https://opentelemetry.io/docs/languages/ruby/) -- Official OTel Ruby SDK reference
- [Ruby instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=ruby&component=instrumentation) -- Available auto-instrumentation packages
