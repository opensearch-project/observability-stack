#!/usr/bin/env python3
"""Load Prometheus alerting/recording rules into Cortex via the Ruler API.

This script runs as an init container. It scans /rules/ for subdirectories,
treating each subdirectory name as a Cortex ruler namespace. Every *.yml file
in the subdirectory is parsed and each rule group is POSTed individually.

Directory layout expected:
  /rules/
    stack/                      ← namespace "stack"
      alerts.yml                ← contains groups: stack_health, otel_collector_health, …
    otel_demo/                  ← namespace "otel_demo" (mounted by otel-demo compose)
      otel-demo-alerts.yml      ← contains groups: otel_demo_frontend, otel_demo_checkout, …

The main docker-compose.yml mounts only /rules/stack/.
The otel-demo compose override adds /rules/otel_demo/.
"""

import glob
import os
import sys
import time

import requests
import yaml

CORTEX_URL = os.getenv("CORTEX_URL", "http://prometheus:9090")

# Fixed 2s poll × 60 attempts = ~2 min to come up. Cortex's single-binary
# startup is consistent, so exponential backoff just slows recovery.
READY_POLL_INTERVAL_SECONDS = 2
READY_POLL_MAX_ATTEMPTS = 60


def wait_for_cortex():
    """Wait for Cortex to report ready, or exit non-zero on timeout."""
    print("⏳ Waiting for Cortex...")
    for _ in range(READY_POLL_MAX_ATTEMPTS):
        try:
            r = requests.get(f"{CORTEX_URL}/ready", timeout=5)
            if r.status_code == 200:
                print("✅ Cortex is ready")
                return
        except requests.exceptions.RequestException:
            pass
        time.sleep(READY_POLL_INTERVAL_SECONDS)
    print(
        f"❌ Cortex did not become ready at {CORTEX_URL} within "
        f"{READY_POLL_INTERVAL_SECONDS * READY_POLL_MAX_ATTEMPTS}s"
    )
    sys.exit(1)


def load_rules_file(filepath, namespace):
    """Upsert every rule group from a YAML file into Cortex.

    Cortex's POST /api/v1/rules/{namespace} is an upsert (HTTP 202 on both
    create and replace), so always POST — no existence check, no skip path.
    Returns (loaded, failed) counts for this file.
    """
    print(f"\n📂 {filepath} → namespace '{namespace}'")

    with open(filepath) as f:
        data = yaml.safe_load(f)

    if not data or "groups" not in data:
        print("   (no groups found — skipping)")
        return 0, 0

    loaded = 0
    failed = 0

    for group in data["groups"]:
        group_name = group.get("name", "unknown")
        rule_count = len(group.get("rules", []))

        group_yaml = yaml.dump(group, default_flow_style=False)

        try:
            r = requests.post(
                f"{CORTEX_URL}/api/v1/rules/{namespace}",
                headers={"Content-Type": "application/yaml"},
                data=group_yaml,
                timeout=10,
            )
            if r.status_code == 202:
                print(f"   ✅ {group_name} ({rule_count} rules) — loaded")
                loaded += 1
            else:
                print(f"   ⚠️  {group_name}: HTTP {r.status_code} — {r.text[:200]}")
                failed += 1
        except requests.exceptions.RequestException as e:
            print(f"   ❌ {group_name}: {e}")
            failed += 1

    return loaded, failed


def main():
    wait_for_cortex()

    rules_root = "/rules"
    if not os.path.isdir(rules_root):
        print(f"No rules directory at {rules_root}")
        sys.exit(0)

    total_loaded = 0
    total_failed = 0
    for namespace_dir in sorted(glob.glob(f"{rules_root}/*")):
        if not os.path.isdir(namespace_dir):
            continue
        namespace = os.path.basename(namespace_dir)

        for rules_file in sorted(glob.glob(f"{namespace_dir}/*.yml")):
            loaded, failed = load_rules_file(rules_file, namespace)
            total_loaded += loaded
            total_failed += failed

    print(
        f"\n📊 Summary — loaded: {total_loaded}, failed: {total_failed}"
    )

    if total_failed > 0:
        sys.exit(1)

    if total_loaded == 0:
        print("⚠️  No rule groups loaded")


if __name__ == "__main__":
    main()
