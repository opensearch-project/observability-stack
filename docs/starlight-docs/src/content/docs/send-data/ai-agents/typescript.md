---
title: "TypeScript SDK"
description: "Instrument TypeScript AI agent applications with the GenAI Observability SDK"
sidebar:
  badge:
    text: Coming Soon
    variant: caution
---

The JavaScript / TypeScript GenAI Observability SDK is under active development. It will provide the same capabilities as the [Python SDK](/docs/send-data/ai-agents/python/): one-line OTEL setup, trace wrappers for agents and tools, GenAI semantic convention attributes, evaluation scoring, and auto-instrumentation for LLM providers.

## Status

The SDK is being developed at [github.com/opensearch-project/genai-observability-sdk-js](https://github.com/opensearch-project/genai-observability-sdk-js).

## In the meantime

For JavaScript/TypeScript applications, you can use standard OpenTelemetry instrumentation with GenAI semantic conventions:

- [Node.js OpenTelemetry guide](/docs/send-data/applications/nodejs/) - manual and auto-instrumentation setup
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/) - creating spans with `gen_ai.*` attributes
- [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) - the OTel spec for AI attributes
