FROM python:3.12-slim

WORKDIR /app
COPY . .

RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx \
    opensearch-genai-observability-sdk-py>=0.2.7 \
    opentelemetry-exporter-otlp-proto-grpc \
    opentelemetry-instrumentation-httpx \
    opentelemetry-instrumentation-asgi

EXPOSE 8000
CMD ["python", "main.py"]
