"""YAML-driven test execution for observability plugin skill commands.

Loads YAML fixture files from tests/fixtures/, validates each against the
Pydantic TestFixture model, and executes commands via subprocess with
configurable timeout.  Uses pytest.mark.parametrize to generate one test
case per fixture and applies pytest markers based on fixture tags.
"""

import json
import os
import subprocess
from pathlib import Path

import pytest
import yaml

from models import TestFixture

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).parent / "fixtures"
DEFAULT_TIMEOUT = 30  # seconds

# Tag string → pytest marker mapping
TAG_MARKER_MAP = {
    "traces": "traces",
    "logs": "logs",
    "metrics": "metrics",
    "stack-health": "stack_health",
    "stack_health": "stack_health",
    "ppl": "ppl",
    "correlation": "correlation",
    "apm_red": "apm_red",
    "slo_sli": "slo_sli",
    "topology": "topology",
    "osd_config": "osd_config",
    "osd_dashboards": "osd_dashboards",
}

# ---------------------------------------------------------------------------
# Fixture loading helpers
# ---------------------------------------------------------------------------


def _load_fixtures() -> list[TestFixture]:
    """Load and validate all YAML fixture files from the fixtures directory."""
    fixtures: list[TestFixture] = []
    if not FIXTURES_DIR.is_dir():
        return fixtures

    for yaml_path in sorted(FIXTURES_DIR.glob("*.yaml")):
        with open(yaml_path, encoding="utf-8") as fh:
            raw = yaml.safe_load(fh)
        if raw is None:
            continue
        if not isinstance(raw, list):
            raw = [raw]
        for entry in raw:
            fixtures.append(TestFixture(**entry))
    return fixtures


def _fixture_ids(fixtures: list[TestFixture]) -> list[str]:
    """Return human-readable test IDs from fixture names."""
    return [f.name for f in fixtures]


# ---------------------------------------------------------------------------
# Recursive field lookup
# ---------------------------------------------------------------------------


def field_exists(obj: object, path: str) -> bool:
    """Check whether a dot-separated *path* exists in a nested dict.

    >>> field_exists({"data": {"result": [1]}}, "data.result")
    True
    >>> field_exists({"data": {"result": [1]}}, "data.missing")
    False
    """
    keys = path.split(".")
    current = obj
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]
    return True


# ---------------------------------------------------------------------------
# Marker application
# ---------------------------------------------------------------------------


def _apply_markers(fixture: TestFixture) -> list[pytest.MarkDecorator]:
    """Derive pytest markers from fixture tags."""
    markers: list[pytest.MarkDecorator] = []
    for tag in fixture.tags:
        marker_name = TAG_MARKER_MAP.get(tag)
        if marker_name is not None:
            markers.append(getattr(pytest.mark, marker_name))
    return markers


# ---------------------------------------------------------------------------
# Parametrized test
# ---------------------------------------------------------------------------

_ALL_FIXTURES = _load_fixtures()


@pytest.mark.parametrize(
    "fixture",
    _ALL_FIXTURES,
    ids=_fixture_ids(_ALL_FIXTURES),
)
def test_fixture(fixture: TestFixture) -> None:
    """Execute a single YAML-defined test fixture.

    Steps:
    1. Run ``before_test`` hook (if present).
    2. Execute the main command.
    3. Run ``after_test`` hook (if present).
    4. Assert exit code is 0.
    5. Parse stdout as JSON.
    6. Assert all ``expected_fields`` exist in the response.
    """
    timeout = int(os.environ.get("TEST_TIMEOUT", DEFAULT_TIMEOUT))

    # --- before_test hook ----------------------------------------------------
    if fixture.before_test:
        before = subprocess.run(
            fixture.before_test,
            shell=True,
            capture_output=True,
            timeout=timeout,
        )
        assert before.returncode == 0, (
            f"before_test hook failed (rc={before.returncode}): "
            f"{before.stderr.decode()}"
        )

    # --- Main command --------------------------------------------------------
    result = subprocess.run(
        fixture.command,
        shell=True,
        capture_output=True,
        timeout=timeout,
    )
    assert result.returncode == 0, (
        f"Command failed (rc={result.returncode}): {result.stderr.decode()}"
    )

    # --- after_test hook -----------------------------------------------------
    if fixture.after_test:
        after = subprocess.run(
            fixture.after_test,
            shell=True,
            capture_output=True,
            timeout=timeout,
        )
        assert after.returncode == 0, (
            f"after_test hook failed (rc={after.returncode}): "
            f"{after.stderr.decode()}"
        )

    # --- Parse and validate JSON response ------------------------------------
    stdout = result.stdout.decode()
    try:
        response = json.loads(stdout)
    except json.JSONDecodeError as exc:
        pytest.fail(f"Response is not valid JSON: {exc}\nstdout: {stdout[:500]}")

    # --- Assert expected fields exist ----------------------------------------
    missing = [f for f in fixture.expected_fields if not field_exists(response, f)]
    assert not missing, (
        f"Missing expected fields in response: {missing}\n"
        f"Response keys: {list(response.keys()) if isinstance(response, dict) else type(response)}"
    )

    # --- Assert minimum result count (if specified) -------------------------
    if fixture.expected_min_results is not None:
        # Generic list-type responses (e.g., _cat/indices JSON array)
        if isinstance(response, list):
            actual = len(response)
            assert actual >= fixture.expected_min_results, (
                f"Expected at least {fixture.expected_min_results} items in "
                f"response array, got {actual}"
            )
        # PPL responses: {"schema": [...], "datarows": [[...], ...], "total": N}
        elif "datarows" in response:
            actual = len(response["datarows"])
            assert actual >= fixture.expected_min_results, (
                f"Expected at least {fixture.expected_min_results} datarows, "
                f"got {actual}"
            )
        # Prometheus responses: {"status": "success", "data": {"result": [...]}}
        elif (
            isinstance(response.get("data"), dict)
            and "result" in response["data"]
        ):
            actual = len(response["data"]["result"])
            assert actual >= fixture.expected_min_results, (
                f"Expected at least {fixture.expected_min_results} results in "
                f"data.result, got {actual}"
            )


# ---------------------------------------------------------------------------
# Dynamic marker application via pytest_collection_modifyitems
# ---------------------------------------------------------------------------


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Apply pytest markers to parametrized test items based on fixture tags."""
    for item in items:
        # The fixture is stored in callspec params by parametrize
        fixture = getattr(item, "callspec", None)
        if fixture is None:
            continue
        fixture_obj = fixture.params.get("fixture")
        if not isinstance(fixture_obj, TestFixture):
            continue
        for marker in _apply_markers(fixture_obj):
            item.add_marker(marker)
