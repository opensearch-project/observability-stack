#!/usr/bin/env python3
"""Create OpenSearch alerting monitors for the OpenTelemetry Demo application.

This script runs as an init container when the otel-demo compose file is enabled.
It creates monitors targeting demo service traces and logs in OpenSearch.

Monitors are idempotent — existing monitors are skipped on re-run.
"""

import os
import sys
import time
import requests

OPENSEARCH_URL = "https://opensearch:9200"
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
    """Wait for OpenSearch to be ready"""
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
    """Check if an alerting monitor with the given name already exists"""
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
    """Create an alerting monitor in OpenSearch (idempotent)"""
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


def create_otel_demo_monitors():
    """Create alerting monitors for the OpenTelemetry Demo services.

    These monitors target traces and logs produced by the demo's microservices.
    They detect issues in the checkout flow, payment processing, and general
    service health. All monitors are safe to keep even if demo services restart.
    """
    print("Creating OTel Demo alerting monitors...")

    # These are PPL (Piped Processing Language) monitors (monitor_type
    # "ppl_monitor"): they run a PPL query via `ppl_input` instead of query DSL,
    # and evaluate `ppl_trigger` conditions rather than Painless scripts.
    #
    # Each base query aggregates matching spans/logs from the last 10 minutes
    # into a single `cnt` row with `stats count()`. The trigger uses a custom
    # condition (`where cnt > 0`) rather than a `number_of_results` condition:
    # the base query always returns exactly one row (the aggregate), so counting
    # rows would always be 1. The custom `where` re-runs the base query with the
    # clause appended and fires only when it still returns a row — i.e. cnt > 0.
    # This is the faithful equivalent of the previous DSL `size:0` +
    # `hits.total.value > 0` monitors. The load generator drives continuous
    # traffic, so under normal operation these fire every interval.
    #
    # "OTel Demo - Payment Failures" is intentionally kept as a DSL
    # `query_level_monitor` (Painless-script trigger) so the stack seeds an
    # example of both monitor styles side by side.
    def span_service_ppl(service):
        return (
            f"source=otel-v1-apm-span* | where serviceName='{service}' "
            "and endTime >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) "
            "| stats count() as cnt"
        )

    def ppl_monitor(name, query, trigger_name, severity):
        return {
            "type": "monitor",
            "name": name,
            "monitor_type": "ppl_monitor",
            "enabled": True,
            "schedule": {"period": {"interval": 1, "unit": "MINUTES"}},
            "inputs": [{
                "ppl_input": {
                    "query": query,
                    "query_language": "ppl",
                }
            }],
            "triggers": [{
                "ppl_trigger": {
                    "name": trigger_name,
                    "severity": severity,
                    "type": "custom",
                    "custom_condition": "where cnt > 0",
                    "actions": [],
                }
            }],
        }

    monitors = [
        # Checkout flow — fires when ANY checkout spans exist in the last 10 min.
        ppl_monitor(
            "OTel Demo - Checkout Errors",
            span_service_ppl("checkout"),
            "Checkout traces detected",
            "1",
        ),
        # Payment service — fires when ANY payment spans exist (always under
        # load). Kept as a DSL query_level_monitor (see note above).
        {
            "type": "monitor",
            "name": "OTel Demo - Payment Failures",
            "monitor_type": "query_level_monitor",
            "enabled": True,
            "schedule": {"period": {"interval": 1, "unit": "MINUTES"}},
            "inputs": [{
                "search": {
                    "indices": ["otel-v1-apm-span*"],
                    "query": {
                        "size": 0,
                        "query": {
                            "bool": {
                                "filter": [
                                    {"range": {"endTime": {"gte": "now-10m"}}},
                                    {"term": {"serviceName": "payment"}}
                                ]
                            }
                        }
                    }
                }
            }],
            "triggers": [{
                "query_level_trigger": {
                    "name": "Payment traces detected",
                    "severity": "1",
                    "condition": {
                        "script": {
                            "source": "ctx.results[0].hits.total.value > 0",
                            "lang": "painless"
                        }
                    },
                    "actions": []
                }
            }]
        },
        # Frontend logs — fires when ANY logs exist in the last 10 min.
        ppl_monitor(
            "OTel Demo - Frontend Error Logs",
            "source=logs-otel-v1* "
            "| where time >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) "
            "| stats count() as cnt",
            "Log volume exceeds threshold",
            "2",
        ),
        # Slow API responses — fires when ANY frontend spans exist (always under load).
        ppl_monitor(
            "OTel Demo - Slow Frontend Responses",
            span_service_ppl("frontend"),
            "Frontend request volume detected",
            "3",
        ),
        # Cart service — fires when ANY cart spans exist (always under load).
        ppl_monitor(
            "OTel Demo - Cart Service Errors",
            span_service_ppl("cart"),
            "Cart traces detected",
            "2",
        ),
    ]

    created = 0
    for monitor_payload in monitors:
        result = create_monitor(monitor_payload)
        if result:
            created += 1

    print(f"Processed {created}/{len(monitors)} OTel Demo monitors")
    return created


def main():
    wait_for_opensearch()
    create_otel_demo_monitors()
    print("OTel Demo monitors initialization complete")


if __name__ == "__main__":
    main()
