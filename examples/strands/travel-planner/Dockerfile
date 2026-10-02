# One image for the three Strands travel planner services; SERVICE picks which one runs
# (planner, weather or events).
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common ./common
COPY planner.py weather.py events.py ./

ENV SERVICE=planner \
    PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn ${SERVICE}:app --host 0.0.0.0 --port 8000"]
