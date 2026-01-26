#!/usr/bin/env python3
"""
Canary Service - Periodic Weather Agent Invocation with Fault Injection

This service periodically invokes the weather-agent API to generate
telemetry data for testing and demonstration purposes, including
fault injection scenarios for debugging observability.
"""

import json
import os
import random
import time
import requests
from datetime import datetime


# Configuration from environment variables
WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://weather-agent:8000")
CANARY_INTERVAL = int(os.getenv("CANARY_INTERVAL", "30"))

# Fault weights - configurable via environment variable
# Format: {"none": 0.6, "tool_timeout": 0.1, ...}
DEFAULT_FAULT_WEIGHTS = {
    "none": 0.55,
    "high_latency": 0.1,
    "tool_timeout": 0.07,
    "tool_error": 0.07,
    "token_limit_exceeded": 0.05,
    "rate_limited": 0.04,
    "hallucination": 0.04,
    "wrong_tool": 0.08,
}
FAULT_WEIGHTS = json.loads(os.getenv("FAULT_WEIGHTS", json.dumps(DEFAULT_FAULT_WEIGHTS)))

# Fault configurations
FAULT_CONFIGS = {
    "none": None,
    "high_latency": {"type": "high_latency", "delay_ms": 3000},
    "tool_timeout": {"type": "tool_timeout"},
    "tool_error": {"type": "tool_error"},
    "token_limit_exceeded": {"type": "token_limit_exceeded"},
    "rate_limited": {"type": "rate_limited"},
    "hallucination": {"type": "hallucination"},
    "wrong_tool": {"type": "wrong_tool"},
}

# Sample weather queries - mix of current, forecast, and historical
SAMPLE_QUERIES = [
    # Current weather queries
    "What's the weather in Paris?",
    "How's the weather in Tokyo?",
    "What's the weather like in London?",
    "What's the temperature in Berlin?",
    # Forecast queries
    "What's the forecast for Seattle?",
    "What will the weather be like tomorrow in NYC?",
    "What's the weather forecast for the next few days in Sydney?",
    # Historical queries
    "What was the weather yesterday in Mumbai?",
    "How was the weather last week in Chicago?",
]


def select_fault():
    """Select a fault type based on configured weights."""
    fault_types = list(FAULT_WEIGHTS.keys())
    weights = list(FAULT_WEIGHTS.values())
    selected = random.choices(fault_types, weights=weights, k=1)[0]
    return FAULT_CONFIGS.get(selected)


def check_health():
    """Check if the weather-agent is healthy"""
    try:
        response = requests.get(f"{WEATHER_AGENT_URL}/health", timeout=5)
        response.raise_for_status()
        data = response.json()
        print(f"✓ Weather agent is healthy: {data['agent_name']}")
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False


def invoke_agent(message: str, fault: dict = None):
    """Invoke the weather agent with a message and optional fault injection"""
    try:
        timestamp = datetime.now().isoformat()
        fault_type = fault["type"] if fault else "none"
        print(f"[{timestamp}] Invoking agent: {message} (fault: {fault_type})")

        payload = {"message": message}
        if fault:
            payload["fault"] = fault

        response = requests.post(
            f"{WEATHER_AGENT_URL}/invoke",
            json=payload,
            timeout=60  # Increased for latency faults
        )

        data = response.json()
        
        if response.status_code == 200:
            print(f"[{timestamp}] Response: {data['response']}")
            print(f"[{timestamp}] Conversation ID: {data['conversation_id']}")
            return True, None
        else:
            error = data.get("error", {})
            print(f"[{timestamp}] Error ({response.status_code}): {error.get('type')} - {error.get('message')}")
            return False, error.get("type")

    except requests.exceptions.Timeout:
        print(f"✗ Request timed out")
        return False, "request_timeout"
    except Exception as e:
        print(f"✗ Invocation failed: {e}")
        return False, "unknown"


def main():
    """Main canary loop"""
    print("=" * 60)
    print("Canary Service - Weather Agent Testing with Fault Injection")
    print("=" * 60)
    print(f"Weather Agent URL: {WEATHER_AGENT_URL}")
    print(f"Invocation Interval: {CANARY_INTERVAL} seconds")
    print(f"Fault Weights: {json.dumps(FAULT_WEIGHTS, indent=2)}")
    print("=" * 60)
    print()

    # Wait for weather-agent to be ready
    print("Waiting for weather-agent to be ready...")
    max_retries = 30
    retry_count = 0

    while retry_count < max_retries:
        if check_health():
            print("✓ Weather agent is ready")
            break
        retry_count += 1
        print(f"Retrying in 2 seconds... ({retry_count}/{max_retries})")
        time.sleep(2)
    else:
        print("✗ Weather agent failed to become ready. Exiting.")
        return

    print()
    print("Starting periodic invocations...")
    print()

    # Counters
    invocation_count = 0
    success_count = 0
    fault_counts = {k: 0 for k in FAULT_CONFIGS.keys()}
    error_counts = {}

    while True:
        try:
            invocation_count += 1
            message = random.choice(SAMPLE_QUERIES)
            fault = select_fault()
            fault_type = fault["type"] if fault else "none"
            fault_counts[fault_type] = fault_counts.get(fault_type, 0) + 1

            print(f"--- Invocation #{invocation_count} ---")
            success, error_type = invoke_agent(message, fault)
            
            if success:
                success_count += 1
            elif error_type:
                error_counts[error_type] = error_counts.get(error_type, 0) + 1

            success_rate = (success_count / invocation_count) * 100
            print(f"Success rate: {success_rate:.1f}% ({success_count}/{invocation_count})")
            print(f"Fault distribution: {dict(fault_counts)}")
            if error_counts:
                print(f"Error distribution: {error_counts}")
            print()

            # Wait for next invocation
            time.sleep(CANARY_INTERVAL)

        except KeyboardInterrupt:
            print()
            print("Canary service stopped by user")
            break
        except Exception as e:
            print(f"Unexpected error: {e}")
            time.sleep(CANARY_INTERVAL)


if __name__ == "__main__":
    main()
