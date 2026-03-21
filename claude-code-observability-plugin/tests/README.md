# Tests

Integration and property-based tests for the Claude Code Observability Plugin.

## Prerequisites

- Python 3.10+
- Install dependencies:
  ```bash
  pip install -r requirements.txt
  ```

## Running Tests

### All tests (requires running observability stack)

```bash
cd claude-code-observability-plugin/tests
pytest
```

Integration tests execute real curl commands against OpenSearch and Prometheus. If the stack is not running, tests are skipped automatically with a message.

### Property tests only (no stack needed)

```bash
pytest test_properties.py
```

Property tests validate skill file content (frontmatter, curl commands, PPL syntax, etc.) without requiring a running stack.

### Filter by tag

```bash
pytest -m traces
pytest -m logs
pytest -m metrics
pytest -m stack_health
pytest -m ppl
pytest -m correlation
pytest -m apm_red
pytest -m slo_sli
```

### Verbose output

```bash
pytest -v --tb=short
```

## Test Structure

| File | Description |
|---|---|
| `test_runner.py` | YAML-driven integration tests. Loads fixtures from `fixtures/`, validates each against the Pydantic `TestFixture` model, executes commands via subprocess, and asserts expected JSON fields in responses. |
| `test_properties.py` | Property-based correctness tests (Hypothesis). Validates 10 properties: skill frontmatter validity, curl command auth/protocol, PPL/PromQL completeness, field lookup correctness, config parsing, RED queries, and SLO recording rules. |
| `conftest.py` | Session-scoped fixtures: `.env` config loading with fallback defaults, stack health check (auto-skip if stack is down), and custom pytest markers. |
| `models.py` | Pydantic `TestFixture` model with strict validation (`extra="forbid"`). |

## Adding New Test Cases

1. Create a YAML file in `fixtures/` (or add entries to an existing one).
2. Each entry must match the `TestFixture` schema:

```yaml
- name: "descriptive test name"
  description: "what this test validates"
  command: "curl -sk -u admin:'My_password_123!@#' https://localhost:9200/..."
  expected_status_code: 200
  expected_fields:
    - "schema"
    - "datarows"
  tags:
    - "traces"
```

3. Supported fields:
   - `name` (str) — unique test identifier
   - `description` (str) — what the test validates
   - `command` (str) — shell command to execute
   - `expected_status_code` (int) — expected exit code
   - `expected_fields` (list[str]) — dot-separated JSON paths that must exist in the response
   - `tags` (list[str]) — categories for marker-based filtering
   - `before_test` (str, optional) — setup command run before the main command
   - `after_test` (str, optional) — teardown command run after the main command

4. Run `pytest` to verify the new fixture loads and passes.
