---
title: "CLI Reference"
description: "Command-line interface reference for Agent Health"
sidebar:
  order: 9
---

Agent Health provides a CLI for running evaluations, managing benchmarks, and generating reports.

## Installation

```bash
npm install -g @opensearch-project/agent-health   # Global install
npx @opensearch-project/agent-health <command>    # No install required
```

## Commands

### serve (default)

Start the web server. This is the default action when no subcommand is specified.

```bash
agent-health [serve] [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <n>` | Server port | `4001` |
| `-e, --env-file <path>` | Load env file | `.env` |
| `--no-browser` | Skip auto-open browser | — |

```bash
agent-health --port 8080 --env-file prod.env
agent-health serve -p 8080 --no-browser
```

---

### list

List available resources.

```bash
agent-health list <resource> [-o table|json]
```

| Resource | Aliases | Description |
|----------|---------|-------------|
| `agents` | | Configured agents |
| `connectors` | | Available connectors |
| `models` | | Available models |
| `test-cases` | `testcases`, `tc` | Stored test cases |
| `benchmarks` | `bench` | Stored benchmarks |

```bash
agent-health list agents
agent-health list tc -o json
agent-health list bench
```

---

### run

Run a single test case evaluation.

```bash
agent-health run -t <test-case> [options]
```

| Option | Description |
|--------|-------------|
| `-t, --test-case <id>` | Test case ID or name **(required)** |
| `-a, --agent <key>` | Agent key (repeatable for comparison) |
| `-m, --model <id>` | Model override |
| `-o, --output <fmt>` | Output: `table`, `json` |
| `-v, --verbose` | Show full trajectory |

```bash
agent-health run -t demo-otel-001 -a ml-commons -v
agent-health run -t demo-otel-001 -a ml-commons -a claude-code  # compare agents
```

---

### benchmark

Run a benchmark (batch of test cases) against one or more agents.

```bash
agent-health benchmark [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Benchmark name or ID | — |
| `-f, --file <path>` | JSON file of test cases to import and benchmark | — |
| `-a, --agent <key>` | Agent key (repeatable) | First enabled agent |
| `-m, --model <id>` | Model override | Agent default |
| `-o, --output <fmt>` | Output: `table`, `json` | `table` |
| `--export <path>` | Export results to file | — |
| `--format <type>` | Report format for `--export`: `json`, `html`, `pdf` | `json` |
| `-v, --verbose` | Show per-test-case results and errors | — |
| `--stop-server` | Stop the server after benchmark completes | Keep running |

**Modes:**
- **Quick mode** (no `-n`, no `-f`): Auto-creates a benchmark from all stored test cases
- **Named mode** (`-n <name>`): Runs a specific existing benchmark
- **File mode** (`-f <path>`): Imports test cases from a JSON file, creates a benchmark, and runs it

```bash
agent-health benchmark                                            # quick mode
agent-health benchmark -n "Baseline" -a ml-commons                # named mode
agent-health benchmark -f ./test-cases.json -a my-agent -v        # file mode
agent-health benchmark -f ./test-cases.json -n "My Run" --export results.json
```

---

### export

Export benchmark test cases as import-compatible JSON.

```bash
agent-health export -b <benchmark> [options]
```

| Option | Description |
|--------|-------------|
| `-b, --benchmark <id-or-name>` | Benchmark ID or name **(required)** |
| `-o, --output <file>` | Output file path (default: `<benchmark-name>.json`) |
| `--stdout` | Write to stdout instead of file |

```bash
agent-health export -b "Baseline" -o test-cases.json
agent-health export -b bench-123 --stdout | jq '.[] | .name'
```

---

### report

Generate a downloadable report for benchmark runs.

```bash
agent-health report -b <benchmark> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-b, --benchmark <id>` | Benchmark name or ID **(required)** | — |
| `-r, --runs <ids>` | Comma-separated run IDs | All runs |
| `-f, --format <type>` | Report format: `json`, `html`, `pdf` | `html` |
| `-o, --output <file>` | Output file path | Auto-generated |
| `--stdout` | Write to stdout (JSON format only) | — |

```bash
agent-health report -b "Baseline"                          # HTML report (all runs)
agent-health report -b "Baseline" -f pdf -o report.pdf     # PDF report
agent-health report -b "Baseline" -r run-123,run-456       # Specific runs
agent-health report -b "Baseline" -f json --stdout         # JSON to stdout
```

---

### doctor

Check system configuration and connectivity.

```bash
agent-health doctor [-o text|json]
```

Checks:
- Config file (`agent-health.config.ts`)
- Environment file (`.env`)
- AWS credentials (for Bedrock judge)
- Claude Code CLI
- Configured agents
- Available connectors
- OpenSearch Storage (test cases, benchmarks)
- OpenSearch Observability (traces, logs)

```text
$ agent-health doctor

✓ Config File: Found: agent-health.config.ts
✓ AWS Credentials: Profile: Bedrock
✓ Agents: 3 agents configured
⚠ OpenSearch Storage: Not configured
⚠ OpenSearch Observability: Not configured
```

---

### init

Initialize project configuration files.

```bash
agent-health init [options]
```

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing files |
| `--with-examples` | Include sample test case |

Creates `agent-health.config.ts` and `.env.example`.

```bash
agent-health init
agent-health init --force --with-examples
```

---

### migrate

One-time migration to add stats to existing benchmark runs. Only needed if you have benchmarks created before stats tracking was added.

```bash
agent-health migrate [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be migrated without making changes |
| `-v, --verbose` | Show detailed progress |

```bash
agent-health migrate --dry-run     # Preview changes
agent-health migrate -v            # Run migration with details
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `AWS_PROFILE` | AWS profile for Bedrock judge |
| `AWS_REGION` | AWS region |
| `DEBUG` | Enable verbose debug logging (`true`/`false`) |
| `OPENSEARCH_STORAGE_ENDPOINT` | Storage cluster URL |
| `OPENSEARCH_STORAGE_USERNAME` | Storage auth user |
| `OPENSEARCH_STORAGE_PASSWORD` | Storage auth password |
| `OPENSEARCH_LOGS_ENDPOINT` | Logs cluster URL |
| `OPENSEARCH_LOGS_USERNAME` | Logs auth user |
| `OPENSEARCH_LOGS_PASSWORD` | Logs auth password |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error |

## Output formats

Most commands support `-o, --output`:

| Format | Use case |
|--------|----------|
| `table` | Human-readable (default) |
| `json` | Machine-readable, scripting |
