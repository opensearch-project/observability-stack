#!/usr/bin/env python3
"""Create OpenSearch alerting monitors that watch the observability stack itself.

Runs whether or not the otel-demo overlay is enabled. Monitors are idempotent
by name — existing monitors with the same `name` are skipped on re-run.
"""

import os
import sys
import time
import requests

OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "https://opensearch:9200")
USERNAME = os.getenv("OPENSEARCH_USER", "admin")
PASSWORD = os.getenv("OPENSEARCH_PASSWORD")
if not PASSWORD:
    # Fail closed rather than silently falling back to a publicly-known
    # default. K8s sources OPENSEARCH_PASSWORD from the opensearch-credentials
    # Secret; compose sources it from .env. Both must be set.
    print("ERROR: OPENSEARCH_PASSWORD env var is not set. "
          "In Kubernetes, the secret 'opensearch-credentials' must be present. "
          "In Docker Compose, ensure .env is loaded.", file=sys.stderr)
    sys.exit(1)


def wait_for_opensearch():
    print("Waiting for OpenSearch...")
    while True:
        try:
            response = requests.get(
                f"{OPENSEARCH_URL}/_cluster/health",
                auth=(USERNAME, PASSWORD),
                verify=False,
                timeout=5,
            )
            if response.status_code == 200:
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(5)
    print("OpenSearch is ready")


def get_existing_monitor(monitor_name):
    try:
        response = requests.post(
            f"{OPENSEARCH_URL}/_plugins/_alerting/monitors/_search",
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json"},
            json={
                "size": 1,
                "query": {"term": {"monitor.name.keyword": monitor_name}}
            },
            verify=False,
            timeout=10,
        )
        if response.status_code == 200:
            hits = response.json().get("hits", {}).get("hits", [])
            if hits:
                return hits[0].get("_id")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  Error checking monitor '{monitor_name}': {e}")
        return None


# Cluster health GREEN is necessary but not sufficient: the alerting plugin's
# internal indices (.opendistro-alerting-*, .opensearch-alerting-*) finish
# allocating ~30-60s later. Until they do, POST /_plugins/_alerting/monitors
# returns 500 with "all shards failed"/"alerting_exception". Retry on those.
MONITOR_CREATE_MAX_ATTEMPTS = 12
MONITOR_CREATE_RETRY_SLEEP_SECONDS = 5


def create_monitor(monitor_payload):
    monitor_name = monitor_payload.get("name", "unknown")
    existing_id = get_existing_monitor(monitor_name)
    if existing_id:
        print(f"  Monitor already exists: {monitor_name}")
        return existing_id

    last_detail = ""
    for attempt in range(1, MONITOR_CREATE_MAX_ATTEMPTS + 1):
        try:
            response = requests.post(
                f"{OPENSEARCH_URL}/_plugins/_alerting/monitors",
                auth=(USERNAME, PASSWORD),
                headers={"Content-Type": "application/json"},
                json=monitor_payload,
                verify=False,
                timeout=10,
            )
            if response.status_code in (200, 201):
                monitor_id = response.json().get("_id")
                print(f"  Created monitor: {monitor_name}")
                return monitor_id

            body = response.text or ""
            last_detail = f"HTTP {response.status_code}: {body[:200]}"
            transient = (
                500 <= response.status_code < 600
                or "all shards failed" in body
                or "alerting_exception" in body
            )
            if transient and attempt < MONITOR_CREATE_MAX_ATTEMPTS:
                print(
                    f"  Monitor create attempt {attempt}/{MONITOR_CREATE_MAX_ATTEMPTS} "
                    f"for '{monitor_name}' got {last_detail} — retrying in "
                    f"{MONITOR_CREATE_RETRY_SLEEP_SECONDS}s"
                )
                time.sleep(MONITOR_CREATE_RETRY_SLEEP_SECONDS)
                continue
            print(f"  Monitor creation failed ({response.status_code}): {body[:200]}")
            return None
        except requests.exceptions.RequestException as e:
            last_detail = f"RequestException: {e}"
            if attempt < MONITOR_CREATE_MAX_ATTEMPTS:
                print(
                    f"  Monitor create attempt {attempt}/{MONITOR_CREATE_MAX_ATTEMPTS} "
                    f"for '{monitor_name}' hit {last_detail} — retrying in "
                    f"{MONITOR_CREATE_RETRY_SLEEP_SECONDS}s"
                )
                time.sleep(MONITOR_CREATE_RETRY_SLEEP_SECONDS)
                continue
            print(f"  Error creating monitor '{monitor_name}': {e}")
            return None

    print(
        f"  Monitor creation for '{monitor_name}' exhausted "
        f"{MONITOR_CREATE_MAX_ATTEMPTS} attempts; last detail: {last_detail}"
    )
    return None


def create_stack_monitors():
    """Create alerting monitors for the observability stack itself.

    Targets the local OpenSearch cluster (the stack's own trace/log/metric
    store). Lives here instead of in the otel-demo overlay so that stack
    health is watched whether or not demo workloads are running.
    """
    print("Creating Observability Stack health monitors...")

    monitors = [
        # Fires when the OpenSearch cluster health transitions to red, which
        # means at least one primary shard is unassigned — traces/logs writes
        # for that index will fail until the shard recovers.
        # Only red is checked (not yellow): single-node dev clusters are
        # always yellow because replicas can't be assigned, so triggering on
        # yellow would be a permanent false positive.
        {
            "type": "monitor",
            "name": "Observability Stack - Cluster Health Red",
            "monitor_type": "cluster_metrics_monitor",
            "enabled": True,
            "schedule": {"period": {"interval": 1, "unit": "MINUTES"}},
            "inputs": [{
                "uri": {
                    "api_type": "CLUSTER_HEALTH",
                    "path": "/_cluster/health",
                    "path_params": "",
                    "url": ""
                }
            }],
            "triggers": [{
                "query_level_trigger": {
                    "name": "Cluster health is red",
                    "severity": "1",
                    "condition": {
                        "script": {
                            "source": "ctx.results != null && ctx.results.length > 0 && ctx.results[0].status == 'red'",
                            "lang": "painless"
                        }
                    },
                    "actions": []
                }
            }]
        },
    ]

    created = 0
    for monitor_payload in monitors:
        result = create_monitor(monitor_payload)
        if result:
            created += 1

    print(f"Processed {created}/{len(monitors)} stack monitors")
    return created


def main():
    wait_for_opensearch()
    create_stack_monitors()
    print("Stack monitors initialization complete")


if __name__ == "__main__":
    main()
