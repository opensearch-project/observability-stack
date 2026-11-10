#!/usr/bin/env python3
"""Create demo anomaly detectors, forecasters and anomaly alerting monitors.

Usage:
    init-anomaly-detectors.py examples    # multi-agent travel planner examples
    init-anomaly-detectors.py otel-demo   # OpenTelemetry Demo (astronomy shop)

Runs as a one-shot init container next to the demo alerting monitors. For the
chosen demo it:
  1. creates anomaly detectors over the demo's spans and starts them,
  2. creates forecasters over request volume / token usage and starts them,
  3. creates one alerting monitor per detector that fires on high-grade
     anomalies. The monitor uses the same query and trigger the Anomaly
     Detection "Set up alerts" flow builds, so Alerting shows it as an
     anomaly detector monitor and links it back to the detector.

Each setup is chosen so the demo's fault injection produces a visible anomaly
(fault panel presets for the examples, flagd flags for the OTel Demo).

The plugins refuse to create a detector or forecaster until its source index
holds documents and the fields it uses are mapped, so on a fresh stack the
script waits (up to AD_DATA_WAIT_SECONDS) for the first spans.

A model trains from the source index history when its job starts. On a fresh
stack that history is only a minute or two old, so the first training attempt
fails, and the plugins then wait at least 60 intervals before trying again. To
avoid that hour-long gap, the script stays up until the source data covers
AD_REINIT_AFTER_MINUTES (default 40) and then restarts any job it started that
still hasn't trained. With 1-minute intervals, expect the first results about
40 minutes after bring-up. Set AD_REINIT_AFTER_MINUTES=0 to exit right after
setup. (Don't count on the plugins' own retry: it only resets during their
periodic cache maintenance, which can take well over an hour.) This
workaround can go once https://github.com/opensearch-project/anomaly-detection/issues/1801
is fixed.

Everything is idempotent by name: existing detectors, forecasters and monitors
are left as they are (a stopped one is started again).
"""

import os
import sys
import time

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
# Flush each line so `docker logs` / `kubectl logs` show progress while the
# script waits for data (stdout is block-buffered when it isn't a terminal).
sys.stdout.reconfigure(line_buffering=True)

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

AD_API = "/_plugins/_anomaly_detection/detectors"
FORECAST_API = "/_plugins/_forecast/forecasters"
ALERTING_API = "/_plugins/_alerting/monitors"
# Default result index pattern the Anomaly Detection plugin writes to; the
# Alerting UI uses the same default for anomaly detector monitors.
AD_RESULT_INDEX = ".opendistro-anomaly-results*"

# Creating a detector or forecaster fails until its source index holds
# documents and the fields it uses are mapped (Data Prepper creates the index
# before the first span arrives, and attributes such as gen_ai.tool.name are
# mapped dynamically by the first span that carries them). Keep retrying for
# up to this long. The wait is shared across all setups, not per setup.
DATA_WAIT_SECONDS = int(os.getenv("AD_DATA_WAIT_SECONDS", "600"))
RETRY_SLEEP_SECONDS = 10
# Re-initialize jobs that still haven't trained once their source data covers
# this many minutes (see the module docstring). 0 disables it. Workaround for
# https://github.com/opensearch-project/anomaly-detection/issues/1801.
REINIT_AFTER_MINUTES = int(os.getenv("AD_REINIT_AFTER_MINUTES", "40"))
REINIT_CHECK_SECONDS = 60
# Error text the plugins return while the data isn't there yet.
DATA_NOT_READY = (
    "no document is found",
    "can't find the categorical field",
    "not found in index mapping",
    "no field found",
    "invalid query causing a runtime exception",
)
# The plugins' system indices allocate a little after cluster GREEN, so the
# first writes can return 5xx; retry those.
MAX_TRANSIENT_ATTEMPTS = 12


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def call(method, path, body=None):
    """Send a request, retrying 5xx and connection errors. Returns the response
    (or None when every attempt failed with a connection error)."""
    last_error = None
    for attempt in range(1, MAX_TRANSIENT_ATTEMPTS + 1):
        try:
            response = requests.request(
                method,
                f"{OPENSEARCH_URL}{path}",
                auth=(USERNAME, PASSWORD),
                headers={"Content-Type": "application/json"},
                json=body,
                verify=False,
                timeout=30,
            )
        except requests.exceptions.RequestException as e:
            last_error = str(e)
        else:
            if response.status_code < 500 or data_not_ready(response):
                return response
            last_error = f"HTTP {response.status_code}: {response.text[:200]}"
            if attempt == MAX_TRANSIENT_ATTEMPTS:
                return response
        print(f"    {method} {path} attempt {attempt}/{MAX_TRANSIENT_ATTEMPTS} "
              f"failed ({last_error}); retrying in 5s")
        time.sleep(5)
    print(f"    {method} {path} failed: {last_error}")
    return None


def data_not_ready(response):
    text = response.text.lower() if response is not None else ""
    return any(marker in text for marker in DATA_NOT_READY)


def error_text(response):
    if response is None:
        return "no response"
    return f"HTTP {response.status_code}: {response.text[:300]}"


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


def find_id_by_name(api, name):
    """Return the id of the config (detector, forecaster or monitor) with this
    exact name, or None. The config index doesn't exist until the first one is
    created, so a 404 means "none yet"."""
    if api == ALERTING_API:
        query = {"size": 1, "query": {"term": {"monitor.name.keyword": name}}}
    else:
        query = {"size": 1, "query": {"term": {"name.keyword": name}}}
    response = call("POST", f"{api}/_search", query)
    if response is None or response.status_code == 404:
        return None
    if response.status_code != 200:
        print(f"    Could not search for '{name}': {error_text(response)}")
        return None
    hits = response.json().get("hits", {}).get("hits", [])
    return hits[0]["_id"] if hits else None


# ---------------------------------------------------------------------------
# Detector / forecaster lifecycle
# ---------------------------------------------------------------------------

def report_model_advice(api, config):
    """Print the plugin's advisory checks (sparse data, interval suggestions).
    They never block creation; they help explain an empty results page."""
    # Validate under a throwaway name: the real name is taken by the config
    # we just created, and the name check would be the only finding.
    probe = dict(config, name=config["name"] + "-check")
    response = call("POST", f"{api}/_validate/model", probe)
    if response is None or response.status_code != 200:
        return
    advice = response.json()
    if advice:
        print(f"    Advisory: {advice}")


def ensure_config(api, kind, config, deadline):
    """Create the detector or forecaster unless one with the same name exists,
    retrying while its data isn't there yet. Returns (id, created)."""
    name = config["name"]
    existing = find_id_by_name(api, name)
    if existing:
        print(f"  {kind} already exists: {name}")
        return existing, False
    while True:
        response = call("POST", api, config)
        if response is not None and response.status_code in (200, 201):
            config_id = response.json().get("_id")
            print(f"  Created {kind}: {name} ({config_id})")
            return config_id, True
        if not data_not_ready(response) or time.time() >= deadline:
            print(f"  {kind} creation failed for {name}: {error_text(response)}")
            return None, False
        print(f"    Waiting for data for {kind} {name} "
              f"({error_text(response)[:160]}); retrying in {RETRY_SLEEP_SECONDS}s")
        time.sleep(RETRY_SLEEP_SECONDS)


def job_enabled(api, config_id):
    """True when the config's real-time job is already enabled."""
    response = call("GET", f"{api}/{config_id}?job=true")
    if response is None or response.status_code != 200:
        return False
    body = response.json()
    job = body.get("anomaly_detector_job") or body.get("forecaster_job") or {}
    return bool(job.get("enabled"))


def start_job(api, kind, name, config_id, deadline):
    """Start the real-time job unless it is already running, retrying
    transient refusals until the deadline. Returns "started", "running" or
    None on failure."""
    if job_enabled(api, config_id):
        print(f"  {kind} already running: {name}")
        return "running"
    while True:
        response = call("POST", f"{api}/{config_id}/_start")
        text = response.text if response is not None else ""
        if response is not None and response.status_code == 200:
            print(f"  Started {kind}: {name}")
            return "started"
        if "already" in text.lower() and "running" in text.lower():
            print(f"  {kind} already running: {name}")
            return "running"
        if time.time() >= deadline:
            print(f"  Could not start {kind} {name}: {error_text(response)}")
            return None
        print(f"    {kind} {name} not started yet ({error_text(response)[:160]}); "
              f"retrying in {RETRY_SLEEP_SECONDS}s")
        time.sleep(RETRY_SLEEP_SECONDS)


def history_minutes(config):
    """Minutes between the oldest document in the config's source indices and
    now (0 when there is no data)."""
    indices = ",".join(config["indices"])
    response = call("POST", f"/{indices}/_search", {
        "size": 0,
        "aggs": {"oldest": {"min": {"field": config["time_field"]}}},
    })
    if response is None or response.status_code != 200:
        return 0
    oldest = response.json().get("aggregations", {}).get("oldest", {}).get("value")
    if oldest is None:
        return 0
    return (time.time() * 1000 - oldest) / 60000


def untrained(api, config_id):
    """True while the job is still initializing without a trained model."""
    if api == AD_API:
        response = call("GET", f"{api}/{config_id}/_profile/state,init_progress")
    else:
        response = call("GET", f"{api}/{config_id}/_profile")
    if response is None or response.status_code != 200:
        return False
    profile = response.json()
    if profile.get("state") != "INIT":
        return False
    progress = profile.get("init_progress", {}).get("percentage")
    return progress in (None, "0%")


def reinit_untrained(jobs):
    """Wait until each job's source data covers REINIT_AFTER_MINUTES, then
    restart it if it still hasn't trained. jobs: [(api, kind, name, id, config)]."""
    pending = list(jobs)
    deadline = time.time() + (REINIT_AFTER_MINUTES + 30) * 60
    print(f"Waiting for {REINIT_AFTER_MINUTES} minutes of source data to "
          f"re-initialize {len(pending)} jobs that haven't trained yet...")
    while pending and time.time() < deadline:
        still_pending = []
        for job in pending:
            api, kind, name, config_id, config = job
            if not untrained(api, config_id):
                print(f"  {kind} trained: {name}")
                continue
            if history_minutes(config) < REINIT_AFTER_MINUTES:
                still_pending.append(job)
                continue
            call("POST", f"{api}/{config_id}/_stop")
            response = call("POST", f"{api}/{config_id}/_start")
            if response is not None and response.status_code == 200:
                print(f"  Re-initialized {kind}: {name}")
            else:
                print(f"  Could not re-initialize {kind} {name}: {error_text(response)}")
        pending = still_pending
        if pending:
            time.sleep(REINIT_CHECK_SECONDS)
    for _, kind, name, _, _ in pending:
        print(f"  {kind} not re-initialized (not enough data in time): {name}")


# ---------------------------------------------------------------------------
# Anomaly alerting monitor (same shape as the AD "Set up alerts" flow)
# ---------------------------------------------------------------------------

# Anomaly monitor thresholds. The grade threshold matches the Anomaly
# Detection UI default. Confidence starts near 0 after training and climbs
# slowly with 1-minute intervals (about 0.6 an hour after training), so the
# demo uses 0.5 instead of the UI's 0.7; otherwise no alert could fire for
# the first ~2 hours. In testing, quiet periods produced no anomalies at all,
# and fault onsets scored 0.8-1.0.
ANOMALY_GRADE_THRESHOLD = 0.7
ANOMALY_CONFIDENCE_THRESHOLD = 0.5


def anomaly_monitor(name, detector_id, trigger_name, severity,
                    grade=ANOMALY_GRADE_THRESHOLD,
                    confidence=ANOMALY_CONFIDENCE_THRESHOLD, interval_minutes=2):
    """Query-level monitor over the AD result index for one detector.

    Matches what the Alerting UI builds for "Defining method: Anomaly
    detector" (formikToAdQuery + getADCondition): the detector id must sit in
    filter[1] and ui_metadata.search.searchType must be "ad" for the UI to
    show it as an anomaly detector monitor.
    """
    results = "ctx.results[0]"
    condition = (
        f"return ctx.results != null && ctx.results.length > 0 && "
        f"{results}.aggregations != null && {results}.aggregations.max_anomaly_grade != null && "
        f"{results}.hits.total.value > 0 && {results}.hits.hits[0]._source != null && "
        f"{results}.hits.hits[0]._source.confidence != null && "
        f"{results}.aggregations.max_anomaly_grade.value != null && "
        f"{results}.aggregations.max_anomaly_grade.value > {grade} && "
        f"{results}.hits.hits[0]._source.confidence > {confidence}"
    )
    return {
        "type": "monitor",
        "name": name,
        "monitor_type": "query_level_monitor",
        "enabled": True,
        "schedule": {"period": {"interval": interval_minutes, "unit": "MINUTES"}},
        "inputs": [{
            "search": {
                "indices": [AD_RESULT_INDEX],
                "query": {
                    "size": 1,
                    "sort": [{"anomaly_grade": "desc"}, {"confidence": "desc"}],
                    "query": {
                        "bool": {
                            "filter": [
                                {"range": {"execution_end_time": {
                                    "from": f"{{{{period_end}}}}||-{interval_minutes}m",
                                    "to": "{{period_end}}",
                                    "include_lower": True,
                                    "include_upper": True,
                                }}},
                                {"term": {"detector_id": {"value": detector_id}}},
                            ]
                        }
                    },
                    "aggregations": {"max_anomaly_grade": {"max": {"field": "anomaly_grade"}}},
                }
            }
        }],
        "triggers": [{
            "query_level_trigger": {
                "name": trigger_name,
                "severity": severity,
                "condition": {"script": {"source": condition, "lang": "painless"}},
                "actions": [],
            }
        }],
        "ui_metadata": {
            # Full schedule shape the Alerting UI reads (it renders "-" for
            # the schedule when any of these keys is missing).
            "schedule": {
                "timezone": None,
                "frequency": "interval",
                "period": {"interval": interval_minutes, "unit": "MINUTES"},
                "daily": 0,
                "weekly": {"mon": False, "tue": False, "wed": False, "thur": False,
                           "fri": False, "sat": False, "sun": False},
                "monthly": {"type": "day", "day": 1},
                "cronExpression": "0 */1 * * *",
            },
            "monitor_type": "query_level_monitor",
            "search": {"searchType": "ad"},
            "triggers": {
                trigger_name: {
                    "value": 10000,
                    "enum": "ABOVE",
                    "adTriggerMetadata": {
                        "triggerType": "anomaly_detector_trigger",
                        "anomalyGrade": {"value": grade, "enum": "ABOVE"},
                        "anomalyConfidence": {"value": confidence, "enum": "ABOVE"},
                    },
                }
            },
        },
    }


def ensure_monitor(payload):
    name = payload["name"]
    if find_id_by_name(ALERTING_API, name):
        print(f"  Monitor already exists: {name}")
        return True
    response = call("POST", ALERTING_API, payload)
    if response is not None and response.status_code in (200, 201):
        print(f"  Created monitor: {name}")
        return True
    print(f"  Monitor creation failed for {name}: {error_text(response)}")
    return False


# ---------------------------------------------------------------------------
# Feature building blocks
# ---------------------------------------------------------------------------

SPAN_INDEX = ["otel-v1-apm-span*"]

# AD and forecasting features must be single-value metric aggregations (a
# `filter` aggregation is rejected), so conditional counts use a scripted sum.
ERROR_SPAN_COUNT = {"sum": {"script": {
    "lang": "painless",
    "source": "doc['status.code'].size() > 0 && doc['status.code'].value == 2 ? 1 : 0",
}}}
AVG_LATENCY_MS = {"avg": {"script": {
    "lang": "painless",
    "source": "doc['durationInNanos'].size() == 0 ? 0 : doc['durationInNanos'].value / 1000000.0",
}}}
SPAN_COUNT = {"value_count": {"field": "spanId"}}
TOTAL_TOKENS = {"sum": {"script": {
    "lang": "painless",
    "source": (
        "long t = 0;"
        " if (doc['attributes.gen_ai.usage.input_tokens'].size() > 0) t += doc['attributes.gen_ai.usage.input_tokens'].value;"
        " if (doc['attributes.gen_ai.usage.output_tokens'].size() > 0) t += doc['attributes.gen_ai.usage.output_tokens'].value;"
        " return t;"
    ),
}}}


def feature(name, aggregation):
    return {"feature_name": name, "feature_enabled": True,
            "aggregation_query": {name: aggregation}}


def interval(minutes):
    return {"period": {"interval": minutes, "unit": "Minutes"}}


def suppression_rules(features, spike_only, min_increase=None):
    """AD suppression rules for a detector.

    Setting `rules` replaces AD's default rule, which ignores anomalies whose
    actual value is within 20% of the expected value (in either direction),
    so that rule is added back for every feature. Features in `spike_only`
    also ignore anomalies where the actual value is below the expected one:
    a drop in latency, errors or tokens is good news, and without this rule a
    fault is flagged a second time when it stops. AD applies the directional
    rule only to the feature(s) that drove the anomaly, so a latency spike is
    not suppressed because errors happen to be below expected.
    (ACTUAL_IS_* conditions must not carry operator/value.)
    `min_increase` maps a feature to an absolute margin: increases up to that
    much over the expected value are ignored (for example, a sub-millisecond
    service going from 0.3 ms to 0.8 ms is a big relative change but not a
    problem).
    """
    rules = []
    for f in features:
        name = f["feature_name"]
        rules.append({"action": "IGNORE_ANOMALY", "conditions": [
            {"feature_name": name, "threshold_type": "ACTUAL_OVER_EXPECTED_RATIO",
             "operator": "LTE", "value": 0.2},
            {"feature_name": name, "threshold_type": "EXPECTED_OVER_ACTUAL_RATIO",
             "operator": "LTE", "value": 0.2},
        ]})
        if name in spike_only:
            rules.append({"action": "IGNORE_ANOMALY", "conditions": [
                {"feature_name": name, "threshold_type": "ACTUAL_IS_BELOW_EXPECTED"},
            ]})
        if min_increase and name in min_increase:
            rules.append({"action": "IGNORE_ANOMALY", "conditions": [
                {"feature_name": name, "threshold_type": "ACTUAL_OVER_EXPECTED_MARGIN",
                 "operator": "LTE", "value": min_increase[name]},
            ]})
    return rules


def detector(name, description, indices, time_field, features, filter_query=None,
             category=None, minutes=1, spike_only=(), min_increase=None):
    config = {
        "name": name,
        "description": description,
        "time_field": time_field,
        "indices": indices,
        "feature_attributes": features,
        "detection_interval": interval(minutes),
        # Spans and logs land within seconds; one interval of delay is plenty.
        "window_delay": interval(1),
        # A shorter shingle than the default 8 scores a fault's onset higher
        # (grade 1.0 vs 0.8 for the latency spike in testing). AD flags the
        # change, not the whole period a fault stays on.
        "shingle_size": 4,
        "rules": suppression_rules(features, spike_only, min_increase),
    }
    if filter_query:
        config["filter_query"] = filter_query
    if category:
        config["category_field"] = [category]
    return config


def forecaster(name, description, indices, time_field, features, filter_query=None,
               category=None, minutes=1, horizon=30):
    config = {
        "name": name,
        "description": description,
        "time_field": time_field,
        "indices": indices,
        "feature_attributes": features,
        "forecast_interval": interval(minutes),
        "window_delay": interval(1),
        "shingle_size": 8,
        "horizon": horizon,
    }
    if filter_query:
        config["filter_query"] = filter_query
    if category:
        config["category_field"] = [category]
    return config


def bool_filter(*clauses):
    return {"bool": {"filter": list(clauses)}}


# ---------------------------------------------------------------------------
# Demo setups
# ---------------------------------------------------------------------------
# Each detector entry: (detector config, monitor name, trigger name, severity).

def examples_setup():
    """Multi-agent travel planner. The fault panel (http://localhost:8085)
    presets drive these. In testing, latency_spike gave grade 1.0 on the
    weather agent and tool, chaos flagged token usage, and chaos and
    cascading_failure pushed request volume above the forecast band. The
    agents absorb most injected faults (few spans end in error status), so
    error counts move less than latency."""
    # One span per agent run; the planner's CLIENT copies of the sub-agent
    # calls are skipped so each run counts once.
    agent_spans = bool_filter(
        {"term": {"attributes.gen_ai.operation.name": "invoke_agent"}},
        {"term": {"kind": "SPAN_KIND_INTERNAL"}})
    tool_spans = bool_filter({"term": {"attributes.gen_ai.operation.name": "execute_tool"}})
    token_spans = bool_filter({"exists": {"field": "attributes.gen_ai.usage.input_tokens"}})
    server_spans = bool_filter({"term": {"kind": "SPAN_KIND_SERVER"}})

    detectors = [
        (detector(
            "agent-invocation-latency-errors",
            "Per-agent anomalies in agent run latency and error count "
            "(gen_ai invoke_agent spans). The fault panel's latency_spike "
            "preset fires it on the weather agent.",
            SPAN_INDEX, "endTime",
            [feature("avg_latency_ms", AVG_LATENCY_MS),
             feature("error_count", ERROR_SPAN_COUNT)],
            filter_query=agent_spans, category="attributes.gen_ai.agent.name",
            spike_only=("avg_latency_ms", "error_count")),
         "Agent Demo - Agent Latency/Error Anomaly", "Agent anomaly detected", "2"),
        (detector(
            "agent-tool-errors-latency",
            "Per-tool anomalies in tool-call latency and error count "
            "(gen_ai execute_tool spans). The weather tool faults "
            "(high latency, errors) show up here.",
            SPAN_INDEX, "endTime",
            [feature("avg_latency_ms", AVG_LATENCY_MS),
             feature("error_count", ERROR_SPAN_COUNT)],
            filter_query=tool_spans, category="attributes.gen_ai.tool.name",
            spike_only=("avg_latency_ms", "error_count")),
         "Agent Demo - Tool Call Anomaly", "Tool anomaly detected", "2"),
        (detector(
            "agent-llm-token-usage",
            "Per-agent anomalies in LLM token usage and call count (gen_ai "
            "chat spans). More agent loops (chaos) spend more tokens.",
            SPAN_INDEX, "endTime",
            [feature("total_tokens", TOTAL_TOKENS),
             feature("llm_calls", SPAN_COUNT)],
            filter_query=token_spans, category="serviceName",
            spike_only=("total_tokens", "llm_calls")),
         "Agent Demo - LLM Token Usage Anomaly", "Token usage anomaly detected", "3"),
    ]
    forecasters = [
        forecaster(
            "agent-request-volume-forecast",
            "Forecast of requests per minute for each example agent service "
            "(server spans), 30 minutes ahead.",
            SPAN_INDEX, "endTime", [feature("request_count", SPAN_COUNT)],
            filter_query=server_spans, category="serviceName"),
        forecaster(
            "agent-llm-token-forecast",
            "Forecast of total LLM tokens per minute across the example "
            "agents, 30 minutes ahead (cost planning).",
            SPAN_INDEX, "endTime", [feature("total_tokens", TOTAL_TOKENS)],
            filter_query=token_spans),
    ]
    return detectors, forecasters


def otel_demo_setup():
    """OpenTelemetry Demo (astronomy shop). flagd flags drive these (feature
    flag UI at http://localhost:8080/feature): paymentFailure and cartFailure
    (errors), kafkaQueueProblems (fraud-detection latency) and
    loadGeneratorFloodHomepage (traffic, ~18x above the forecast band). The
    demo writes no ERROR-severity logs for these faults, so there is no log
    detector."""
    # Requests and Kafka messages each service handles. flagd's EventStream
    # RPCs are long-lived streams (open for minutes), not requests, and would
    # show up as huge latency outliers on the flagd service.
    entry_spans = {"bool": {
        "filter": [{"terms": {"kind": ["SPAN_KIND_SERVER", "SPAN_KIND_CONSUMER"]}}],
        "must_not": [{"terms": {"name": [
            "flagd.evaluation.v1.Service/EventStream",
            "/flagd.evaluation.v1.Service/EventStream",
        ]}}],
    }}
    # Traffic/errors and latency are separate detectors: average latency is the
    # noisiest per-service signal, and sharing a model with it makes smaller
    # error spikes harder to catch.
    detectors = [
        (detector(
            "otel-demo-service-traffic-errors",
            "Per-service anomalies in request count and error count for the "
            "OpenTelemetry Demo (server and consumer spans). Fires on the "
            "paymentFailure and cartFailure flags (errors) and on "
            "loadGeneratorFloodHomepage (traffic). A traffic drop is flagged "
            "too, since it can mean an outage.",
            SPAN_INDEX, "endTime",
            [feature("request_count", SPAN_COUNT),
             feature("error_count", ERROR_SPAN_COUNT)],
            filter_query=entry_spans, category="serviceName",
            spike_only=("error_count",)),
         "OTel Demo - Service Traffic/Error Anomaly", "Service traffic or error anomaly detected", "2"),
        (detector(
            "otel-demo-service-latency",
            "Per-service anomalies in average request latency for the "
            "OpenTelemetry Demo (server and consumer spans). Fires on the "
            "kafkaQueueProblems flag (fraud-detection) and other slowdowns.",
            SPAN_INDEX, "endTime",
            [feature("avg_latency_ms", AVG_LATENCY_MS)],
            filter_query=entry_spans, category="serviceName",
            spike_only=("avg_latency_ms",),
            # Several demo services answer in about a millisecond; in testing,
            # increases of up to ~6 ms were noise and every fault added 12 ms
            # or more.
            min_increase={"avg_latency_ms": 10}),
         "OTel Demo - Service Latency Anomaly", "Service latency anomaly detected", "2"),
    ]
    forecasters = [
        forecaster(
            "otel-demo-frontend-traffic-forecast",
            "Forecast of frontend requests per minute, 30 minutes ahead. "
            "loadGeneratorFloodHomepage pushes traffic far above the band.",
            SPAN_INDEX, "endTime", [feature("request_count", SPAN_COUNT)],
            filter_query=bool_filter({"term": {"serviceName": "frontend"}},
                                     {"term": {"kind": "SPAN_KIND_SERVER"}})),
    ]
    return detectors, forecasters


SETUPS = {"examples": examples_setup, "otel-demo": otel_demo_setup}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in SETUPS:
        print(f"usage: {sys.argv[0]} {'|'.join(SETUPS)}", file=sys.stderr)
        sys.exit(2)
    demo = sys.argv[1]
    detectors, forecasters = SETUPS[demo]()
    wait_for_opensearch()
    deadline = time.time() + DATA_WAIT_SECONDS
    total = 2 * len(detectors) + len(forecasters)
    succeeded = 0
    started = []  # jobs started by this run: candidates for re-initialization

    print(f"Creating anomaly detectors ({demo})...")
    for config, monitor_name, trigger_name, severity in detectors:
        name = config["name"]
        detector_id, created = ensure_config(AD_API, "Detector", config, deadline)
        if not detector_id:
            continue
        if created:
            report_model_advice(AD_API, config)
        status = start_job(AD_API, "Detector", name, detector_id, deadline)
        if status:
            succeeded += 1
        if status == "started":
            started.append((AD_API, "Detector", name, detector_id, config))
        if ensure_monitor(anomaly_monitor(monitor_name, detector_id,
                                          trigger_name, severity)):
            succeeded += 1

    print(f"Creating forecasters ({demo})...")
    for config in forecasters:
        name = config["name"]
        forecaster_id, created = ensure_config(FORECAST_API, "Forecaster", config, deadline)
        if not forecaster_id:
            continue
        if created:
            report_model_advice(FORECAST_API, config)
        status = start_job(FORECAST_API, "Forecaster", name, forecaster_id, deadline)
        if status:
            succeeded += 1
        if status == "started":
            started.append((FORECAST_API, "Forecaster", name, forecaster_id, config))

    print(f"Processed {succeeded}/{total} anomaly detection setups ({demo}): "
          f"{len(detectors)} detectors, {len(detectors)} anomaly monitors, "
          f"{len(forecasters)} forecasters")
    # Re-initialize whatever this run started, even if another setup failed.
    if REINIT_AFTER_MINUTES > 0 and started:
        reinit_untrained(started)
    if succeeded == total:
        print("Anomaly detection initialization complete")
        sys.exit(0)
    print("Anomaly detection initialization finished with failures")
    sys.exit(1)


if __name__ == "__main__":
    main()
