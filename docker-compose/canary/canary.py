#!/usr/bin/env python3
"""
Canary Service - Periodic Travel Planner Invocation with Fault Injection

Generates traces with varying depths and shapes:
- "normal": standard orchestrator call (37 spans, 4 services)
- "shallow": direct sub-agent call bypassing orchestrator (5-8 spans, 1-2 services)
- "deep": multi-destination comparison via sequential orchestrator calls (70+ spans)
"""

import json
import os
import random
import time
import requests
from datetime import datetime


TRAVEL_PLANNER_URL = os.getenv("TRAVEL_PLANNER_URL", "http://travel-planner:8000")
WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://weather-agent:8000")
EVENTS_AGENT_URL = os.getenv("EVENTS_AGENT_URL", "http://events-agent:8002")
CANARY_INTERVAL = int(os.getenv("CANARY_INTERVAL", "30"))

DESTINATIONS = ["Paris", "Tokyo", "London", "Berlin", "Sydney", "New York", "Mumbai", "Seattle"]

# Fault weights (applied to normal traces only)
DEFAULT_FAULT_WEIGHTS = {
    "none": 0.50,
    "weather_error": 0.10,
    "weather_rate_limited": 0.08,
    "weather_high_latency": 0.07,
    "events_error": 0.08,
    "events_rate_limited": 0.07,
    "partial_failure": 0.10,
}
FAULT_WEIGHTS = json.loads(os.getenv("FAULT_WEIGHTS", json.dumps(DEFAULT_FAULT_WEIGHTS)))

# Trace shape weights control the mix of shallow / normal / deep traces
DEFAULT_TRACE_SHAPE_WEIGHTS = {
    "normal": 0.60,
    "shallow": 0.25,
    "deep": 0.15,
}
TRACE_SHAPE_WEIGHTS = json.loads(os.getenv("TRACE_SHAPE_WEIGHTS", json.dumps(DEFAULT_TRACE_SHAPE_WEIGHTS)))

FAULT_CONFIGS = {
    "none": None,
    "weather_error": {"weather": {"type": "tool_error"}},
    "weather_rate_limited": {"weather": {"type": "rate_limited"}},
    "weather_high_latency": {"weather": {"type": "high_latency", "delay_ms": 3000}},
    "events_error": {"events": {"type": "error"}},
    "events_rate_limited": {"events": {"type": "rate_limited"}},
    "partial_failure": {"orchestrator": "partial_failure"},
}


def weighted_choice(weights_dict):
    keys = list(weights_dict.keys())
    weights = list(weights_dict.values())
    return random.choices(keys, weights=weights, k=1)[0]


def select_fault():
    selected = weighted_choice(FAULT_WEIGHTS)
    return selected, FAULT_CONFIGS.get(selected)


def check_health():
    try:
        response = requests.get(f"{TRAVEL_PLANNER_URL}/health", timeout=5)
        response.raise_for_status()
        print(f"✓ Travel planner is healthy")
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False


def invoke_normal(destination):
    """Standard orchestrator call — produces normal-depth traces."""
    fault_name, fault_config = select_fault()
    payload = {"destination": destination}
    if fault_config:
        payload["fault"] = fault_config

    print(f"  [normal] {destination} (fault: {fault_name})")
    response = requests.post(f"{TRAVEL_PLANNER_URL}/plan", json=payload, timeout=60)
    data = response.json()

    if response.status_code == 200:
        status = "partial" if data.get("partial") else "ok"
        print(f"           → {status}")
        return True
    print(f"           → error: {response.status_code}")
    return False


def invoke_shallow(destination):
    """Direct sub-agent call — produces shallow traces (no orchestrator)."""
    agent = random.choice(["weather", "events"])

    if agent == "weather":
        url = f"{WEATHER_AGENT_URL}/invoke"
        payload = {"message": f"What is the weather in {destination}?"}
    else:
        url = f"{EVENTS_AGENT_URL}/events"
        payload = {"destination": destination}

    print(f"  [shallow] {destination} → {agent}-agent")
    response = requests.post(url, json=payload, timeout=30)

    if response.status_code == 200:
        print(f"            → ok")
        return True
    print(f"            → error: {response.status_code}")
    return False


def invoke_deep(destinations):
    """Sequential multi-destination calls — produces deep traces."""
    print(f"  [deep] comparing {len(destinations)} destinations: {', '.join(destinations)}")
    results = 0
    for dest in destinations:
        payload = {"destination": dest}
        try:
            response = requests.post(f"{TRAVEL_PLANNER_URL}/plan", json=payload, timeout=60)
            if response.status_code == 200:
                results += 1
        except Exception:
            pass
    print(f"          → {results}/{len(destinations)} succeeded")
    return results > 0


def main():
    print("=" * 50)
    print("Canary - Travel Planner with Fault Injection")
    print(f"URL: {TRAVEL_PLANNER_URL}")
    print(f"Interval: {CANARY_INTERVAL}s")
    print(f"Trace shapes: {json.dumps(TRACE_SHAPE_WEIGHTS)}")
    print("=" * 50)

    # Wait for service
    for i in range(30):
        if check_health():
            break
        time.sleep(2)
    else:
        print("✗ Service not ready")
        return

    print("\nStarting invocations...\n")
    count, success = 0, 0

    while True:
        try:
            count += 1
            timestamp = datetime.now().strftime("%H:%M:%S")
            shape = weighted_choice(TRACE_SHAPE_WEIGHTS)
            destination = random.choice(DESTINATIONS)

            print(f"[{timestamp}] invocation #{count}")

            if shape == "shallow":
                ok = invoke_shallow(destination)
            elif shape == "deep":
                dests = random.sample(DESTINATIONS, k=random.randint(2, 4))
                ok = invoke_deep(dests)
            else:
                ok = invoke_normal(destination)

            if ok:
                success += 1

            print(f"         Success: {success}/{count} ({100*success/count:.0f}%)\n")

            # Sleep after first invocation (not before) so data appears immediately on startup
            time.sleep(CANARY_INTERVAL)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(CANARY_INTERVAL)


if __name__ == "__main__":
    main()
