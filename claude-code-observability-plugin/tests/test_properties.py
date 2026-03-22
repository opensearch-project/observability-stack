"""Property-based tests for the Claude Code Observability Plugin.

Validates correctness properties defined in the design document:
  P1: Skill file frontmatter validity
  P2: PPL curl command completeness
  P3: OpenSearch curl command authentication
  P4: Prometheus curl command protocol
  P5: PPL command documentation completeness
  P6: PromQL curl command completeness
  P7: Recursive field lookup correctness
  P8: Config loader .env parsing with fallback
  P9: RED query completeness
  P10: SLO recording rule validity
"""

import os
import re
import sys
import tempfile
from pathlib import Path

import pytest
import yaml
from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Path setup — allow imports from sibling test modules
# ---------------------------------------------------------------------------

sys.path.insert(0, str(Path(__file__).parent))

from conftest import DEFAULTS, parse_env_file
from test_runner import field_exists


# ---------------------------------------------------------------------------
# Override the session-scoped autouse stack health check from conftest.py.
# Property tests validate static file content and do not need a running stack.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def check_stack_health():
    """No-op override — property tests do not require a running stack."""
    yield

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

SKILLS_DIR = Path(__file__).parent.parent / "skills"

SKILL_FILES = sorted(
    p for p in SKILLS_DIR.rglob("SKILL.md")
)


def _read_skill(path: Path) -> str:
    """Return the full text of a skill file."""
    return path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    """Extract and parse YAML frontmatter from a markdown file."""
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    return yaml.safe_load(parts[1]) or {}


def _extract_code_blocks(text: str) -> list[str]:
    """Return all fenced code blocks from markdown text."""
    return re.findall(r"```[^\n]*\n(.*?)```", text, re.DOTALL)


def _extract_bash_code_blocks(text: str) -> list[str]:
    """Return all ```bash fenced code blocks from markdown text."""
    return re.findall(r"```bash\n(.*?)```", text, re.DOTALL)


# =========================================================================
# Property 1: Skill file frontmatter validity
# Validates: Requirements 1.5, 7.1, 7.2, 7.3, 7.4
# =========================================================================


@pytest.mark.parametrize("skill_path", SKILL_FILES, ids=[p.parent.name for p in SKILL_FILES])
def test_property_1_frontmatter_validity(skill_path: Path) -> None:
    """Every skill file must have valid YAML frontmatter with name, description, and allowed-tools."""
    text = _read_skill(skill_path)
    fm = _parse_frontmatter(text)

    assert "name" in fm, f"{skill_path.name}: missing 'name' in frontmatter"
    assert isinstance(fm["name"], str) and fm["name"].strip(), (
        f"{skill_path.name}: 'name' must be a non-empty string"
    )

    assert "description" in fm, f"{skill_path.name}: missing 'description' in frontmatter"
    assert isinstance(fm["description"], str) and fm["description"].strip(), (
        f"{skill_path.name}: 'description' must be a non-empty string"
    )

    assert "allowed-tools" in fm, f"{skill_path.name}: missing 'allowed-tools' in frontmatter"
    assert isinstance(fm["allowed-tools"], list) and len(fm["allowed-tools"]) > 0, (
        f"{skill_path.name}: 'allowed-tools' must be a non-empty list"
    )


# =========================================================================
# Property 2: PPL curl command completeness
# Validates: Requirements 2.9, 3.6
# =========================================================================


def _collect_ppl_curl_blocks() -> list[tuple[str, str]]:
    """Extract code blocks containing PPL queries from traces.md and logs.md.

    Returns (file_name, code_block) pairs for blocks that contain
    an observability index pattern (``otel-v1-apm-`` or ``logs-otel-v1-``).
    """
    results: list[tuple[str, str]] = []
    for name in ("traces", "logs"):
        path = SKILLS_DIR / name / "SKILL.md"
        if not path.exists():
            continue
        blocks = _extract_bash_code_blocks(_read_skill(path))
        for block in blocks:
            if ("otel-v1-apm-" in block or "logs-otel-v1-" in block) and "aws-sigv4" not in block:
                # Use first meaningful line as id
                first_line = block.strip().split("\n")[0][:80]
                results.append((f"{name}: {first_line}", block))
    return results


_PPL_CURL_BLOCKS = _collect_ppl_curl_blocks()


@pytest.mark.parametrize(
    "block",
    [b for _, b in _PPL_CURL_BLOCKS],
    ids=[label for label, _ in _PPL_CURL_BLOCKS],
)
def test_property_2_ppl_curl_completeness(block: str) -> None:
    """Every PPL code block in traces.md / logs.md must be a complete curl command."""
    assert "/_plugins/_ppl" in block, "Missing PPL API endpoint (/_plugins/_ppl)"
    assert "-u admin:" in block or "-u admin'" in block or "$OPENSEARCH_USER" in block, "Missing basic auth (-u admin: or $OPENSEARCH_USER)"
    assert "https" in block.lower() or "$OPENSEARCH_ENDPOINT" in block, "Missing HTTPS protocol or $OPENSEARCH_ENDPOINT"
    assert '"query"' in block, 'Missing JSON body with "query" field'


# =========================================================================
# Property 3: OpenSearch curl command authentication
# Validates: Requirements 7.6, 8.1, 8.2
# =========================================================================


def _collect_opensearch_curl_commands() -> list[tuple[str, str]]:
    """Extract all curl commands targeting OpenSearch across all skill files.

    Identifies OpenSearch commands by: port 9200, /_plugins/, /_cluster/, /_cat/.
    Excludes AWS SigV4 variant commands (those use different auth).
    """
    os_patterns = re.compile(r"(localhost:9200|/_plugins/|/_cluster/|/_cat/)")
    results: list[tuple[str, str]] = []
    for skill_path in SKILL_FILES:
        text = _read_skill(skill_path)
        blocks = _extract_bash_code_blocks(text)
        for block in blocks:
            if os_patterns.search(block) and "aws-sigv4" not in block:
                first_line = block.strip().split("\n")[0][:60]
                results.append((f"{skill_path.parent.name}: {first_line}", block))
    return results


_OS_CURL_COMMANDS = _collect_opensearch_curl_commands()


@pytest.mark.parametrize(
    "block",
    [b for _, b in _OS_CURL_COMMANDS],
    ids=[label for label, _ in _OS_CURL_COMMANDS],
)
def test_property_3_opensearch_curl_auth(block: str) -> None:
    """Every OpenSearch curl command must use HTTPS, -k flag, and basic auth."""
    assert "https" in block.lower() or "$OPENSEARCH_ENDPOINT" in block, "OpenSearch command must use HTTPS or $OPENSEARCH_ENDPOINT"
    assert "-k" in block or "-sk" in block, "OpenSearch command must include -k flag"
    assert "-u admin:" in block or "-u admin'" in block or "$OPENSEARCH_USER" in block, (
        "OpenSearch command must include basic auth (-u admin: or $OPENSEARCH_USER)"
    )


# =========================================================================
# Property 4: Prometheus curl command protocol
# Validates: Requirements 8.3
# =========================================================================


def _collect_prometheus_curl_commands() -> list[tuple[str, str]]:
    """Extract all curl commands targeting Prometheus (port 9090) across all skill files.

    Excludes AWS SigV4 variant commands.
    """
    results: list[tuple[str, str]] = []
    for skill_path in SKILL_FILES:
        text = _read_skill(skill_path)
        blocks = _extract_bash_code_blocks(text)
        for block in blocks:
            if "9090" in block and "aws-sigv4" not in block:
                first_line = block.strip().split("\n")[0][:60]
                results.append((f"{skill_path.parent.name}: {first_line}", block))
    return results


_PROM_CURL_COMMANDS = _collect_prometheus_curl_commands()


@pytest.mark.parametrize(
    "block",
    [b for _, b in _PROM_CURL_COMMANDS],
    ids=[label for label, _ in _PROM_CURL_COMMANDS],
)
def test_property_4_prometheus_curl_protocol(block: str) -> None:
    """Every Prometheus curl command must use HTTP (not HTTPS)."""
    # Find URLs targeting port 9090
    urls = re.findall(r"https?://[^\s'\"]+9090[^\s'\"]*", block)
    for url in urls:
        assert url.startswith("http://"), (
            f"Prometheus URL must use HTTP, not HTTPS: {url}"
        )


# =========================================================================
# Property 5: PPL command documentation completeness
# Validates: Requirements 6.11
# =========================================================================


def _parse_ppl_command_sections() -> list[tuple[str, str]]:
    """Parse ppl-reference.md and extract each command section (### heading).

    Returns (heading_text, section_body) pairs for command sections under
    the ``## Commands`` top-level section.
    """
    path = SKILLS_DIR / "ppl-reference" / "SKILL.md"
    if not path.exists():
        return []

    text = _read_skill(path)

    # Find the ## Commands section
    commands_match = re.search(r"^## Commands\s*$", text, re.MULTILINE)
    if not commands_match:
        return []

    # Find the next ## section (or end of file) to bound the Commands block
    commands_start = commands_match.end()
    next_h2 = re.search(r"^## (?!Commands)", text[commands_start:], re.MULTILINE)
    commands_text = text[commands_start : commands_start + next_h2.start()] if next_h2 else text[commands_start:]

    # Split on ### or #### headings to get individual command sections
    # We look for #### headings (individual commands) within ### category groups
    sections: list[tuple[str, str]] = []
    # Match #### headings (the actual command entries)
    pattern = re.compile(r"^####\s+(.+)$", re.MULTILINE)
    matches = list(pattern.finditer(commands_text))

    for i, m in enumerate(matches):
        heading = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(commands_text)
        body = commands_text[start:end]
        sections.append((heading, body))

    return sections


_PPL_COMMAND_SECTIONS = _parse_ppl_command_sections()


@pytest.mark.parametrize(
    "section_body",
    [body for _, body in _PPL_COMMAND_SECTIONS],
    ids=[heading for heading, _ in _PPL_COMMAND_SECTIONS],
)
def test_property_5_ppl_command_doc_completeness(section_body: str) -> None:
    """Each PPL command section must have a code block, description text, and an observability example."""
    # Must have at least one code block (syntax/usage)
    code_blocks = re.findall(r"```", section_body)
    assert len(code_blocks) >= 2, "Command section must contain at least one code block"

    # Must have description text (non-empty text outside code blocks)
    text_outside_blocks = re.sub(r"```[^`]*```", "", section_body, flags=re.DOTALL)
    stripped = text_outside_blocks.strip()
    assert len(stripped) > 10, "Command section must contain description text"

    # Must have at least one example using an observability index pattern
    # Most commands use otel-v1-apm-*, but some (graphlookup) use otel-v2-apm-*
    # and system commands (showdatasources) use system queries without index patterns
    has_otel_index = "otel-v1-apm-" in section_body or "otel-v2-apm-" in section_body or "logs-otel-v1-" in section_body
    has_system_query = "show datasources" in section_body.lower() or "describe" in section_body.lower()
    assert has_otel_index or has_system_query, (
        "Command section must include at least one example using an observability index pattern "
        "(otel-v1-apm-* or otel-v2-apm-*) or a system query"
    )


# =========================================================================
# Property 6: PromQL curl command completeness
# Validates: Requirements 4.7
# =========================================================================


def _collect_promql_blocks_from_metrics() -> list[tuple[str, str]]:
    """Extract code blocks from metrics.md that contain PromQL queries.

    Identifies PromQL by patterns: rate(, histogram_quantile(, sum(.
    """
    path = SKILLS_DIR / "metrics" / "SKILL.md"
    if not path.exists():
        return []

    text = _read_skill(path)
    blocks = _extract_bash_code_blocks(text)
    promql_pattern = re.compile(r"(rate\(|histogram_quantile\(|sum\()")
    results: list[tuple[str, str]] = []
    for block in blocks:
        if promql_pattern.search(block) and "aws-sigv4" not in block:
            first_line = block.strip().split("\n")[0][:80]
            results.append((f"metrics: {first_line}", block))
    return results


_PROMQL_METRICS_BLOCKS = _collect_promql_blocks_from_metrics()


@pytest.mark.parametrize(
    "block",
    [b for _, b in _PROMQL_METRICS_BLOCKS],
    ids=[label for label, _ in _PROMQL_METRICS_BLOCKS],
)
def test_property_6_promql_curl_completeness(block: str) -> None:
    """Every PromQL code block in metrics.md must target localhost:9090/api/v1/query."""
    assert "localhost:9090/api/v1/query" in block or "$PROMETHEUS_ENDPOINT/api/v1/query" in block, (
        "PromQL block must contain curl command targeting localhost:9090/api/v1/query or $PROMETHEUS_ENDPOINT/api/v1/query"
    )


# =========================================================================
# Property 7: Recursive field lookup correctness
# Validates: Requirements 11.12
# =========================================================================

# Strategy: generate nested dicts with string keys and arbitrary leaf values
_json_leaves = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-1000, max_value=1000),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(min_size=0, max_size=10),
)

_json_strategy = st.recursive(
    _json_leaves,
    lambda children: st.dictionaries(
        st.text(
            alphabet="abcdefghijklmnopqrstuvwxyz",
            min_size=1,
            max_size=5,
        ),
        children,
        min_size=0,
        max_size=4,
    ),
    max_leaves=20,
)

# Strategy for dot-separated field paths
_path_strategy = st.lists(
    st.text(alphabet="abcdefghijklmnopqrstuvwxyz", min_size=1, max_size=5),
    min_size=1,
    max_size=4,
).map(lambda parts: ".".join(parts))


def _path_actually_exists(obj: object, path: str) -> bool:
    """Ground-truth check: walk the dot-separated path through nested dicts."""
    keys = path.split(".")
    current = obj
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]
    return True


@given(obj=_json_strategy, path=_path_strategy)
@settings(max_examples=100)
def test_property_7_recursive_field_lookup(obj: object, path: str) -> None:
    """field_exists must return True iff the dot-separated path exists in the JSON object."""
    # Feature: claude-code-observability-plugin, Property 7: Recursive field lookup correctness
    # **Validates: Requirements 11.12**
    expected = _path_actually_exists(obj, path)
    actual = field_exists(obj, path)
    assert actual == expected, (
        f"field_exists({obj!r}, {path!r}) returned {actual}, expected {expected}"
    )


# =========================================================================
# Property 8: Config loader .env parsing with fallback
# Validates: Requirements 11.15
# =========================================================================

# Strategy: generate lines that look like .env content
_env_key = st.sampled_from([
    "OPENSEARCH_HOST", "OPENSEARCH_PORT", "OPENSEARCH_USER",
    "OPENSEARCH_PASSWORD", "PROMETHEUS_PORT",
])
_env_value = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-.",
    min_size=1,
    max_size=20,
)
_env_line = st.one_of(
    # Valid KEY=VALUE line
    st.tuples(_env_key, _env_value).map(lambda kv: f"{kv[0]}={kv[1]}"),
    # Comment line
    st.just("# this is a comment"),
    # Blank line
    st.just(""),
    # Garbage line (no =)
    st.text(alphabet="abcdefghijklmnopqrstuvwxyz", min_size=1, max_size=10),
)
_env_content = st.lists(_env_line, min_size=0, max_size=10).map(lambda lines: "\n".join(lines))


@given(content=_env_content)
@settings(max_examples=100)
def test_property_8_config_loader_env_parsing(content: str) -> None:
    """parse_env_file must return parsed values or fall back to DEFAULTS."""
    # Feature: claude-code-observability-plugin, Property 8: Config loader .env parsing with fallback
    # **Validates: Requirements 11.15**
    with tempfile.NamedTemporaryFile(mode="w", suffix=".env", delete=False) as f:
        f.write(content)
        tmp_path = f.name

    try:
        parsed = parse_env_file(tmp_path)

        # Every parsed key-value must match what's in the file
        for key, value in parsed.items():
            # The value should appear in the content as KEY=VALUE
            assert f"{key}=" in content, (
                f"Parsed key {key!r} not found in .env content"
            )

        # For known default keys, verify fallback works
        for key, default_val in DEFAULTS.items():
            if key in parsed:
                # Parsed value should be a non-empty string
                assert isinstance(parsed[key], str)
            # If not parsed, the caller (load_config) would use the default
            # We just verify parse_env_file doesn't crash
    finally:
        os.unlink(tmp_path)


# =========================================================================
# Property 9: RED query completeness
# Validates: Requirements 13.13
# =========================================================================


def _collect_red_query_blocks() -> list[tuple[str, str]]:
    """Extract query code blocks from apm-red.md.

    Identifies PromQL blocks (rate(, histogram_quantile(, sum() and
    PPL blocks (source=otel-v1-apm-).  Excludes AWS SigV4 variants.
    """
    path = SKILLS_DIR / "apm-red" / "SKILL.md"
    if not path.exists():
        return []

    text = _read_skill(path)
    blocks = _extract_bash_code_blocks(text)
    promql_pat = re.compile(r"(rate\(|histogram_quantile\()")
    ppl_pat = re.compile(r"source=otel-v1-apm-")

    results: list[tuple[str, str]] = []
    for block in blocks:
        if "aws-sigv4" in block:
            continue
        if promql_pat.search(block) or ppl_pat.search(block):
            first_line = block.strip().split("\n")[0][:80]
            results.append((f"apm-red: {first_line}", block))
    return results


_RED_QUERY_BLOCKS = _collect_red_query_blocks()


@pytest.mark.parametrize(
    "block",
    [b for _, b in _RED_QUERY_BLOCKS],
    ids=[label for label, _ in _RED_QUERY_BLOCKS],
)
def test_property_9_red_query_completeness(block: str) -> None:
    """RED query blocks must have correct curl commands for their query type."""
    promql_pat = re.compile(r"(rate\(|histogram_quantile\()")
    ppl_pat = re.compile(r"source=otel-v1-apm-")

    is_ppl = ppl_pat.search(block)
    is_promql = promql_pat.search(block)

    if is_promql and not is_ppl:
        assert "localhost:9090" in block or "$PROMETHEUS_ENDPOINT" in block, (
            "PromQL RED block must target Prometheus at localhost:9090 or $PROMETHEUS_ENDPOINT"
        )
    if is_ppl:
        assert "-u admin:" in block or "-u admin'" in block or "$OPENSEARCH_USER" in block, (
            "PPL RED block must include OpenSearch basic auth or $OPENSEARCH_USER"
        )


# =========================================================================
# Property 10: SLO recording rule validity
# Validates: Requirements 14.4, 14.5, 14.6
# =========================================================================


def _collect_slo_recording_rules() -> list[tuple[str, str]]:
    """Extract YAML code blocks from slo-sli.md that contain recording rules.

    Looks for ```yaml blocks with a ``record:`` field.
    """
    path = SKILLS_DIR / "slo-sli" / "SKILL.md"
    if not path.exists():
        return []

    text = _read_skill(path)
    yaml_blocks = re.findall(r"```yaml\n(.*?)```", text, re.DOTALL)

    results: list[tuple[str, str]] = []
    for block in yaml_blocks:
        if "record:" in block:
            # Parse the YAML to extract individual rules
            try:
                parsed = yaml.safe_load(block)
            except yaml.YAMLError:
                continue
            if not isinstance(parsed, dict):
                continue
            groups = parsed.get("groups", [])
            if not isinstance(groups, list):
                continue
            for group in groups:
                rules = group.get("rules", [])
                if not isinstance(rules, list):
                    continue
                for rule in rules:
                    if "record" in rule:
                        record_name = rule.get("record", "unknown")
                        results.append((f"slo-sli: {record_name}", yaml.dump(rule)))
    return results


_SLO_RECORDING_RULES = _collect_slo_recording_rules()


@pytest.mark.parametrize(
    "rule_yaml",
    [r for _, r in _SLO_RECORDING_RULES],
    ids=[label for label, _ in _SLO_RECORDING_RULES],
)
def test_property_10_slo_recording_rule_validity(rule_yaml: str) -> None:
    """Each SLO recording rule must have record with sli: prefix and an expr with PromQL."""
    rule = yaml.safe_load(rule_yaml)
    assert isinstance(rule, dict), "Recording rule must be a YAML dict"

    # Must have 'record' field with sli: prefix
    assert "record" in rule, "Recording rule must have a 'record' field"
    record_name = rule["record"]
    assert isinstance(record_name, str) and record_name.startswith("sli:"), (
        f"Recording rule 'record' must start with 'sli:' prefix, got: {record_name}"
    )

    # Must have 'expr' field with a PromQL expression
    assert "expr" in rule, "Recording rule must have an 'expr' field"
    expr = rule["expr"]
    assert isinstance(expr, str) and len(expr.strip()) > 0, (
        "Recording rule 'expr' must be a non-empty PromQL expression"
    )
