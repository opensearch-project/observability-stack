FROM python:3.12-slim

# git: the GenAI SDK is installed from its main branch until 0.3.0 is on PyPI
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application files
COPY . .

# Install dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx \
    requests \
    boto3 \
    "opensearch-genai-observability-sdk-py @ git+https://github.com/opensearch-project/genai-observability-sdk-py@main" \
    opentelemetry-exporter-otlp-proto-grpc \
    opentelemetry-instrumentation-asgi

# Expose port
EXPOSE 8000

# Run the server
CMD ["python", "server.py"]
