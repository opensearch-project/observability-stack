FROM python:3.12-slim

WORKDIR /app

# Copy application files
COPY . .

# Install dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx \
    opensearch-genai-observability-sdk-py>=0.2.7 \
    opentelemetry-exporter-otlp-proto-grpc \
    opentelemetry-instrumentation-asgi

# Expose port
EXPOSE 8000

# Run the server
CMD ["python", "server.py"]
