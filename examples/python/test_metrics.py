#!/usr/bin/env python3
"""
Simple metrics test to verify OTLP metrics export is working.
"""

import time
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter

print("Setting up OpenTelemetry metrics...")

# Create resource
resource = Resource.create({
    "service.name": "test-metrics",
    "service.version": "1.0.0"
})

# Create OTLP exporter
otlp_exporter = OTLPMetricExporter(
    endpoint="http://localhost:4317",
    insecure=True
)

# Create metric reader that exports every 5 seconds
metric_reader = PeriodicExportingMetricReader(
    otlp_exporter,
    export_interval_millis=5000
)

# Create meter provider
meter_provider = MeterProvider(
    resource=resource,
    metric_readers=[metric_reader]
)

metrics.set_meter_provider(meter_provider)
meter = metrics.get_meter(__name__)

print("✓ Metrics configured")

# Create a simple counter
counter = meter.create_counter(
    name="test.counter",
    description="A test counter",
    unit="1"
)

print("Sending test metrics...")

# Add some values
for i in range(5):
    counter.add(1, {"test.label": "value1"})
    counter.add(2, {"test.label": "value2"})
    print(f"  Sent batch {i+1}")
    time.sleep(1)

print("Waiting for export...")
time.sleep(10)

print("✓ Test complete!")
print("\nCheck Prometheus for: test_counter_total")
