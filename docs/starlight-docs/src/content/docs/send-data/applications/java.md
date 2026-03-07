---
title: "Java"
description: "Instrument Java applications with OpenTelemetry to send traces, metrics, and logs to the observability stack"
---

This guide covers adding OpenTelemetry instrumentation to Java applications. Java offers a powerful auto-instrumentation agent that patches bytecode at runtime, covering hundreds of libraries with zero code changes.

## Prerequisites

- Java 8+ (Java 11+ recommended)
- OTel Collector running at `localhost:4317` (gRPC) or `localhost:4318` (HTTP)
- Maven or Gradle for dependency management

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [official OpenTelemetry Java documentation](https://opentelemetry.io/docs/languages/java/).
:::

## Install dependencies

### Auto-instrumentation agent

Download the latest Java agent JAR:

```bash
curl -L -o opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar
```

### Maven (manual instrumentation)

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>io.opentelemetry</groupId>
      <artifactId>opentelemetry-bom</artifactId>
      <version>1.43.0</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>

<dependencies>
  <dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-api</artifactId>
  </dependency>
  <dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-sdk</artifactId>
  </dependency>
  <dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-otlp</artifactId>
  </dependency>
  <dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-sdk-extension-autoconfigure</artifactId>
  </dependency>
</dependencies>
```

### Gradle (manual instrumentation)

```groovy
implementation platform("io.opentelemetry:opentelemetry-bom:1.43.0")
implementation "io.opentelemetry:opentelemetry-api"
implementation "io.opentelemetry:opentelemetry-sdk"
implementation "io.opentelemetry:opentelemetry-exporter-otlp"
implementation "io.opentelemetry:opentelemetry-sdk-extension-autoconfigure"
```

## Auto-instrumentation with the Java agent

Attach the agent at JVM startup:

```bash
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.service.name=my-java-service \
  -Dotel.exporter.otlp.endpoint=http://localhost:4317 \
  -jar my-application.jar
```

The agent automatically instruments:

- Servlet containers (Tomcat, Jetty, Undertow)
- Spring Boot, Spring MVC, Spring WebFlux
- JAX-RS (Jersey, RESTEasy)
- JDBC, Hibernate, JPA
- gRPC, Apache HttpClient, OkHttp
- Kafka, RabbitMQ, AWS SDK
- And 100+ more libraries

### Suppress specific instrumentations

```bash
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.instrumentation.jdbc.enabled=false \
  -jar my-application.jar
```

## Manual SDK setup

For programmatic configuration without the agent:

```java
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.metrics.SdkMeterProvider;
import io.opentelemetry.sdk.metrics.export.PeriodicMetricReader;
import io.opentelemetry.exporter.otlp.metrics.OtlpGrpcMetricExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.semconv.ResourceAttributes;

public class TelemetryConfig {

    public static OpenTelemetry setup() {
        Resource resource = Resource.getDefault()
            .merge(Resource.create(io.opentelemetry.api.common.Attributes.of(
                ResourceAttributes.SERVICE_NAME, "my-java-service",
                ResourceAttributes.SERVICE_VERSION, "1.0.0"
            )));

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
            .setResource(resource)
            .addSpanProcessor(BatchSpanProcessor.builder(
                OtlpGrpcSpanExporter.builder()
                    .setEndpoint("http://localhost:4317")
                    .build()
            ).build())
            .build();

        SdkMeterProvider meterProvider = SdkMeterProvider.builder()
            .setResource(resource)
            .registerMetricReader(PeriodicMetricReader.builder(
                OtlpGrpcMetricExporter.builder()
                    .setEndpoint("http://localhost:4317")
                    .build()
            ).build())
            .build();

        return OpenTelemetrySdk.builder()
            .setTracerProvider(tracerProvider)
            .setMeterProvider(meterProvider)
            .buildAndRegisterGlobal();
    }
}
```

## Manual instrumentation

### Creating spans

```java
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Scope;

Tracer tracer = openTelemetry.getTracer("com.example.orders");

public void processOrder(String orderId) {
    Span span = tracer.spanBuilder("process_order")
        .setAttribute("order.id", orderId)
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        validatePayment(orderId);
        span.addEvent("order_processed");
    } catch (Exception e) {
        span.recordException(e);
        span.setStatus(StatusCode.ERROR, e.getMessage());
        throw e;
    } finally {
        span.end();
    }
}
```

### Recording metrics

```java
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.DoubleHistogram;

Meter meter = openTelemetry.getMeter("com.example.orders");

LongCounter requestCounter = meter.counterBuilder("http.server.request_count")
    .setDescription("Number of HTTP requests")
    .setUnit("1")
    .build();

DoubleHistogram requestDuration = meter.histogramBuilder("http.server.duration")
    .setDescription("HTTP request duration")
    .setUnit("ms")
    .build();

public void handleRequest() {
    requestCounter.add(1, Attributes.of(
        AttributeKey.stringKey("http.method"), "GET",
        AttributeKey.stringKey("http.route"), "/api/orders"
    ));
}
```

## Framework integration

### Spring Boot

With the Java agent, Spring Boot is auto-instrumented. For programmatic setup, add the Spring Boot starter:

```xml
<dependency>
  <groupId>io.opentelemetry.instrumentation</groupId>
  <artifactId>opentelemetry-spring-boot-starter</artifactId>
</dependency>
```

Configure in `application.properties`:

```properties
otel.service.name=my-spring-service
otel.exporter.otlp.endpoint=http://localhost:4317
```

### Quarkus

Quarkus has built-in OTel support:

```properties
# application.properties
quarkus.otel.exporter.otlp.endpoint=http://localhost:4317
quarkus.otel.service.name=my-quarkus-service
quarkus.otel.enabled=true
```

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `my-java-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol | `grpc` |
| `OTEL_TRACES_SAMPLER` | Sampler type | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument | `0.1` |
| `OTEL_JAVAAGENT_ENABLED` | Enable/disable the agent | `true` |
| `OTEL_INSTRUMENTATION_[NAME]_ENABLED` | Toggle specific instrumentation | `false` |
| `JAVA_TOOL_OPTIONS` | Attach agent via env var | `-javaagent:opentelemetry-javaagent.jar` |

## Related links

- [Applications overview](/docs/send-data/applications/)
- [Auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [OpenTelemetry Java documentation](https://opentelemetry.io/docs/languages/java/) -- Official OTel Java SDK reference
- [Java instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=java&component=instrumentation) -- Available auto-instrumentation packages
