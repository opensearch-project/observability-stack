FROM python:3.12-slim

WORKDIR /app
COPY . .

RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx \
    requests \
    boto3 \
    opensearch-genai-observability-sdk-py>=0.2.7 \
    opentelemetry-exporter-otlp-proto-grpc \
    opentelemetry-instrumentation-asgi

EXPOSE 8002
CMD ["python", "main.py"]
