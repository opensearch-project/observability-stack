#!/usr/bin/env python3
"""
Canary Service - Periodic Travel Planner Invocation with Fault Injection

Polls the Fault Control Panel for live configuration (fault weights, trace shapes,
interval). Falls back to env-var defaults if the panel is unreachable.

Generates traces with varying depths and shapes:
- "normal": standard orchestrator call (40+ spans, 5 services, includes flights + currency)
- "shallow": direct sub-agent call bypassing orchestrator (5-8 spans, 1-2 services)
- "deep": multi-destination comparison via sequential orchestrator calls (100+ spans)

Every travel-planner call carries a session id (gen_ai.conversation.id), so Agent Traces groups
the turns of a conversation into one session:
- "normal" turns belong to multi-turn conversations: short (2-3 turns), medium (4-6) and long
  (10-14), plus long-running ones whose turns are minutes apart, so a session can start before
  the dashboard's time range. Conversations run interleaved, one turn per invocation.
- Some conversations fail on a middle turn (a tool error, a rate limit or a partial failure), so
  sessions with errors include longer conversations, not only single failed requests.
- Most conversations carry a user id (user.id), so Agent Traces shows the User ID column.
- A "deep" comparison sends all of its destinations to the planner in quick succession in one
  session, and every planner turn hands off to the weather and events sub-agents.
"""

import json
import os
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime

import requests


TRAVEL_PLANNER_URL = os.getenv("TRAVEL_PLANNER_URL", "http://travel-planner:8000")
WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://weather-agent:8000")
EVENTS_AGENT_URL = os.getenv("EVENTS_AGENT_URL", "http://events-agent:8002")
FAULT_PANEL_URL = os.getenv("FAULT_PANEL_URL", "http://fault-panel:8085")
CANARY_INTERVAL = int(os.getenv("CANARY_INTERVAL", "30"))

DESTINATIONS = ["Paris", "Tokyo", "London", "Berlin", "Sydney", "New York", "Mumbai", "Seattle"]
ORIGINS = ["Portland", "Seattle", "San Francisco", "New York", "Chicago", "Denver", "Austin", "Boston"]

# Defaults (used when fault panel is unreachable)
DEFAULT_FAULT_WEIGHTS = {
    "none": 0.50,
    "weather_error": 0.10,
    "weather_rate_limited": 0.08,
    "weather_high_latency": 0.07,
    "events_error": 0.08,
    "events_rate_limited": 0.07,
    "partial_failure": 0.10,
}

# Conversations: (turns, seconds between turns) per kind, and how often each kind starts.
SESSION_KINDS = {
    "short": {"weight": 0.55, "turns": (2, 3), "gap_s": (20, 60)},
    "medium": {"weight": 0.25, "turns": (4, 6), "gap_s": (20, 60)},
    "long": {"weight": 0.15, "turns": (10, 14), "gap_s": (20, 60)},
    # Turns minutes apart, so the session spans one to two hours
    "long_running": {"weight": 0.05, "turns": (8, 12), "gap_s": (300, 600)},
}
MAX_LONG_RUNNING = 2  # long-running conversations open at once; one is started at boot
MID_TURN_FAILURE_RATE = 0.35  # conversations of 3+ turns where a middle turn fails
MID_TURN_FAULTS = ["weather_error", "events_error", "weather_rate_limited", "partial_failure"]
USER_ID_RATE = 0.7  # conversations with a signed-in user
USERS = [f"user-{name}" for name in ("ava", "ben", "chen", "dara", "eli", "fatima", "gus", "hana")]

FOLLOW_UPS = [
    "What will the weather be like in {dest} while I'm there?",
    "Any events in {dest} this weekend?",
    "Can you find cheaper flights to {dest} from {origin}?",
    "What currency do I need in {dest}, and what's the rate?",
    "Actually, how about {dest} instead?",
    "Compare that with a trip to {dest}.",
    "Keep {dest}, but plan it for a family with kids.",
]

DEFAULT_TRACE_SHAPE_WEIGHTS = {
    "normal": 0.60,
    "shallow": 0.25,
    "deep": 0.15,
}

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


def fetch_config():
    """Poll fault panel for current config. Returns None if unreachable."""
    try:
        resp = requests.get(f"{FAULT_PANEL_URL}/config", timeout=2)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


def get_config():
    """Get active config from panel or fall back to defaults."""
    panel_config = fetch_config()
    if panel_config:
        return {
            "enabled": panel_config.get("enabled", True),
            "fault_weights": panel_config.get("fault_weights", DEFAULT_FAULT_WEIGHTS),
            "trace_shape_weights": panel_config.get("trace_shape_weights", DEFAULT_TRACE_SHAPE_WEIGHTS),
            "canary_interval": panel_config.get("canary_interval", CANARY_INTERVAL),
        }
    return {
        "enabled": True,
        "fault_weights": json.loads(os.getenv("FAULT_WEIGHTS", json.dumps(DEFAULT_FAULT_WEIGHTS))),
        "trace_shape_weights": json.loads(os.getenv("TRACE_SHAPE_WEIGHTS", json.dumps(DEFAULT_TRACE_SHAPE_WEIGHTS))),
        "canary_interval": CANARY_INTERVAL,
    }


def select_fault(fault_weights):
    selected = weighted_choice(fault_weights)
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


def new_session_id():
    return f"canary_{uuid.uuid4().hex[:12]}"


@dataclass
class Conversation:
    """A multi-turn session: one session id across consecutive travel-planner requests."""

    kind: str
    session_id: str
    origin: str
    destination: str
    turns: int
    gap_s: tuple
    user_id: str | None = None
    fail_turn: int | None = None  # 0-based index of the middle turn that fails
    done: int = 0
    next_at: float = field(default_factory=time.time)

    def next_turn(self):
        """(message, destination) of the next turn."""
        if self.done == 0:
            return f"Plan a trip to {self.destination} from {self.origin}", self.destination
        template = random.choice(FOLLOW_UPS)
        if "instead" in template or "Compare" in template:
            self.destination = random.choice([d for d in DESTINATIONS if d != self.destination])
        return template.format(dest=self.destination, origin=self.origin), self.destination


def new_conversation(kind=None):
    kind = kind or weighted_choice({k: v["weight"] for k, v in SESSION_KINDS.items()})
    spec = SESSION_KINDS[kind]
    turns = random.randint(*spec["turns"])
    fail_turn = None
    if turns >= 3 and random.random() < MID_TURN_FAILURE_RATE:
        fail_turn = random.randint(1, turns - 2)
    return Conversation(
        kind=kind,
        session_id=new_session_id(),
        origin=random.choice(ORIGINS),
        destination=random.choice(DESTINATIONS),
        turns=turns,
        gap_s=spec["gap_s"],
        user_id=random.choice(USERS) if random.random() < USER_ID_RATE else None,
        fail_turn=fail_turn,
    )


def invoke_turn(conv, fault_weights):
    """One turn of a conversation: a travel-planner call in the conversation's session."""
    message, destination = conv.next_turn()
    if conv.fail_turn == conv.done:
        fault_name = random.choice(MID_TURN_FAULTS)
        fault_config = FAULT_CONFIGS[fault_name]
    else:
        fault_name, fault_config = select_fault(fault_weights)
    payload = {
        "destination": destination,
        "origin": conv.origin,
        "session_id": conv.session_id,
        "message": message,
    }
    if conv.user_id:
        payload["user_id"] = conv.user_id
    if fault_config:
        payload["fault"] = fault_config
    conv.done += 1
    conv.next_at = time.time() + random.uniform(*conv.gap_s)
    print(
        f"  [{conv.kind} {conv.done}/{conv.turns}] {conv.session_id}"
        f"{' ' + conv.user_id if conv.user_id else ''}: {message!r} (fault: {fault_name})"
    )
    return post_plan(payload)


def post_plan(payload):
    try:
        response = requests.post(f"{TRAVEL_PLANNER_URL}/plan", json=payload, timeout=60)
    except requests.RequestException as e:
        print(f"           → request failed: {e}")
        return False
    data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}

    if response.status_code == 200:
        status = "partial" if data.get("partial") else "ok"
        has_flights = "flights" in data and data["flights"]
        has_currency = "currency" in data and data["currency"]
        extras = []
        if has_flights:
            extras.append("flights")
        if has_currency:
            extras.append("currency")
        extra_str = f" +{','.join(extras)}" if extras else ""
        print(f"           → {status}{extra_str}")
        return True
    print(f"           → error: {response.status_code}")
    return False


def invoke_shallow(destination):
    """Direct sub-agent call — produces shallow traces (no orchestrator)."""
    agent = random.choice(["weather", "events"])

    if agent == "weather":
        url = f"{WEATHER_AGENT_URL}/invoke"
        payload = {"message": f"What is the weather in {destination}?", "conversation_id": new_session_id()}
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
    origin = random.choice(ORIGINS)
    session_id = new_session_id()
    print(f"  [deep] session {session_id}: comparing {len(destinations)} destinations from {origin}: {', '.join(destinations)}")
    results = 0
    for dest in destinations:
        payload = {"destination": dest, "origin": origin, "session_id": session_id}
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
    print(f"Fault Panel: {FAULT_PANEL_URL}")
    print(f"Default Interval: {CANARY_INTERVAL}s")
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
    conversations = [new_conversation("long_running")]  # open conversations, interleaved

    while True:
        try:
            config = get_config()

            if not config["enabled"]:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] paused (disabled via panel)")
                time.sleep(config["canary_interval"])
                continue

            count += 1
            timestamp = datetime.now().strftime("%H:%M:%S")
            shape = weighted_choice(config["trace_shape_weights"])
            destination = random.choice(DESTINATIONS)

            print(f"[{timestamp}] invocation #{count}")

            # A conversation whose next turn is due goes first; otherwise start something new.
            due = [c for c in conversations if c.next_at <= time.time()]
            if due:
                conv = min(due, key=lambda c: c.next_at)
                ok = invoke_turn(conv, config["fault_weights"])
                if conv.done >= conv.turns:
                    conversations.remove(conv)
            elif shape == "shallow":
                ok = invoke_shallow(destination)
            elif shape == "deep":
                dests = random.sample(DESTINATIONS, k=random.randint(2, 4))
                ok = invoke_deep(dests)
            else:
                conv = new_conversation()
                running = sum(1 for c in conversations if c.kind == "long_running")
                if conv.kind == "long_running" and running >= MAX_LONG_RUNNING:
                    conv = new_conversation("long")
                conversations.append(conv)
                ok = invoke_turn(conv, config["fault_weights"])

            if ok:
                success += 1

            print(f"         Success: {success}/{count} ({100*success/count:.0f}%)\n")

            time.sleep(config["canary_interval"])

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(config.get("canary_interval", CANARY_INTERVAL))


if __name__ == "__main__":
    main()
