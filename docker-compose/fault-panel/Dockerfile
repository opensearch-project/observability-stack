FROM python:3.12-slim

WORKDIR /app
COPY main.py .

RUN pip install --no-cache-dir fastapi uvicorn

EXPOSE 8085
CMD ["python", "main.py"]
