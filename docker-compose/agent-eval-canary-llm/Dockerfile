FROM python:3.12-slim
# git: the GenAI SDK is installed from its main branch until 0.3.0 is on PyPI
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY eval_canary_llm.py .
CMD ["uv", "run", "eval_canary_llm.py"]
