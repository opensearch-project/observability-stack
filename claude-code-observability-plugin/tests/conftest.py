"""Pytest configuration and session-scoped fixtures for observability stack tests."""

import os

import pytest
import requests
import urllib3

# Suppress InsecureRequestWarning for self-signed certs in dev stack
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --------------------------------------------------------------------------- #
# .env parsing and config loading
# --------------------------------------------------------------------------- #

ENV_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".env")

DEFAULTS = {
    "OPENSEARCH_HOST": "localhost",
    "OPENSEARCH_PORT": "9200",
    "OPENSEARCH_USER": "admin",
    "OPENSEARCH_PASSWORD": "My_password_123!@#",
    "PROMETHEUS_PORT": "9090",
}


def parse_env_file(path: str) -> dict[str, str]:
    """Read a .env file and return a dict of key-value pairs.

    Handles comments, blank lines, and optional quoting of values.
    Returns an empty dict if the file does not exist.
    """
    env_vars: dict[str, str] = {}
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                # Strip surrounding quotes (single or double)
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                    value = value[1:-1]
                env_vars[key] = value
    except FileNotFoundError:
        pass
    return env_vars


def load_config() -> dict[str, str]:
    """Build a config dict from the .env file with fallback defaults."""
    env = parse_env_file(ENV_FILE_PATH)

    opensearch_host = env.get("OPENSEARCH_HOST", DEFAULTS["OPENSEARCH_HOST"])
    opensearch_port = env.get("OPENSEARCH_PORT", DEFAULTS["OPENSEARCH_PORT"])
    opensearch_user = env.get("OPENSEARCH_USER", DEFAULTS["OPENSEARCH_USER"])
    opensearch_password = env.get("OPENSEARCH_PASSWORD", DEFAULTS["OPENSEARCH_PASSWORD"])
    prometheus_port = env.get("PROMETHEUS_PORT", DEFAULTS["PROMETHEUS_PORT"])

    return {
        "opensearch_host": opensearch_host,
        "opensearch_port": opensearch_port,
        "opensearch_user": opensearch_user,
        "opensearch_password": opensearch_password,
        "prometheus_host": "localhost",
        "prometheus_port": prometheus_port,
        "opensearch_url": f"https://{opensearch_host}:{opensearch_port}",
        "prometheus_url": f"http://localhost:{prometheus_port}",
    }


# --------------------------------------------------------------------------- #
# Pytest markers
# --------------------------------------------------------------------------- #

def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers for tag-based test filtering."""
    config.addinivalue_line("markers", "traces: trace query tests")
    config.addinivalue_line("markers", "logs: log query tests")
    config.addinivalue_line("markers", "metrics: metrics query tests")
    config.addinivalue_line("markers", "stack_health: stack health check tests")
    config.addinivalue_line("markers", "ppl: PPL system command tests")
    config.addinivalue_line("markers", "correlation: cross-signal correlation tests")
    config.addinivalue_line("markers", "apm_red: APM RED metrics tests")
    config.addinivalue_line("markers", "slo_sli: SLO/SLI query tests")


# --------------------------------------------------------------------------- #
# Session-scoped fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture(scope="session")
def stack_config() -> dict[str, str]:
    """Return the resolved stack configuration dict."""
    return load_config()


@pytest.fixture(scope="session", autouse=True)
def check_stack_health(stack_config: dict[str, str]) -> None:
    """Verify the observability stack is reachable before running tests.

    Checks OpenSearch cluster health and Prometheus health endpoints.
    Skips the entire test session if either service is unavailable.
    """
    opensearch_url = stack_config["opensearch_url"]
    prometheus_url = stack_config["prometheus_url"]
    auth = (stack_config["opensearch_user"], stack_config["opensearch_password"])

    # Check OpenSearch
    try:
        resp = requests.get(
            f"{opensearch_url}/_cluster/health",
            auth=auth,
            verify=False,
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as exc:
        pytest.skip(
            f"Observability stack is not running — OpenSearch unreachable at "
            f"{opensearch_url}: {exc}"
        )

    # Check Prometheus
    try:
        resp = requests.get(
            f"{prometheus_url}/-/healthy",
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as exc:
        pytest.skip(
            f"Observability stack is not running — Prometheus unreachable at "
            f"{prometheus_url}: {exc}"
        )
