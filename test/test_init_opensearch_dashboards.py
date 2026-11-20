import importlib.util
import json
import shutil
import subprocess
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
INITIALIZER_PATHS = (
    REPOSITORY_ROOT
    / "docker-compose/opensearch-dashboards/init/init-opensearch-dashboards.py",
    REPOSITORY_ROOT
    / "charts/observability-stack/files/init-opensearch-dashboards.py",
)


def load_initializer(path):
    """Load an initializer without requiring its container dependencies."""
    requests = types.ModuleType("requests")
    requests.exceptions = types.SimpleNamespace(RequestException=Exception)
    requests.get = Mock()
    requests.post = Mock()
    requests.put = Mock()

    yaml = types.ModuleType("yaml")
    module_name = f"initializer_{path.parent.parent.name}_{id(path)}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"requests": requests, "yaml": yaml}):
        spec.loader.exec_module(module)
    return module


class CreateIndexPatternTests(unittest.TestCase):
    def test_updates_supplied_metadata_for_existing_workspace_pattern(self):
        for path in INITIALIZER_PATHS:
            with self.subTest(path=path):
                initializer = load_initializer(path)
                initializer.get_existing_index_pattern = Mock(return_value="pattern-id")
                initializer.requests.put.return_value.status_code = 200

                result = initializer.create_index_pattern(
                    "workspace-id",
                    "logs-*",
                    time_field="@timestamp",
                    signal_type="logs",
                    schema_mappings={"timestamp": {"name": "@timestamp"}},
                    display_name="Application logs",
                )

                self.assertEqual("pattern-id", result)
                initializer.requests.put.assert_called_once_with(
                    f"{initializer.BASE_URL}/w/workspace-id/api/saved_objects/"
                    "index-pattern/pattern-id",
                    auth=(initializer.USERNAME, initializer.PASSWORD),
                    headers={
                        "Content-Type": "application/json",
                        "osd-xsrf": "true",
                    },
                    json={
                        "attributes": {
                            "timeFieldName": "@timestamp",
                            "signalType": "logs",
                            "schemaMappings": {
                                "timestamp": {"name": "@timestamp"}
                            },
                            "displayName": "Application logs",
                        }
                    },
                    verify=False,
                    timeout=10,
                )
                initializer.requests.post.assert_not_called()

    def test_updates_explicit_empty_metadata_in_default_workspace(self):
        for path in INITIALIZER_PATHS:
            with self.subTest(path=path):
                initializer = load_initializer(path)
                initializer.get_existing_index_pattern = Mock(return_value="pattern-id")
                initializer.requests.put.return_value.status_code = 200

                result = initializer.create_index_pattern(
                    "default",
                    "logs-*",
                    schema_mappings={},
                    display_name="",
                )

                self.assertEqual("pattern-id", result)
                initializer.requests.put.assert_called_once_with(
                    f"{initializer.BASE_URL}/api/saved_objects/index-pattern/pattern-id",
                    auth=(initializer.USERNAME, initializer.PASSWORD),
                    headers={
                        "Content-Type": "application/json",
                        "osd-xsrf": "true",
                    },
                    json={
                        "attributes": {
                            "schemaMappings": {},
                            "displayName": "",
                        }
                    },
                    verify=False,
                    timeout=10,
                )

    def test_skips_update_when_no_metadata_is_supplied(self):
        for path in INITIALIZER_PATHS:
            with self.subTest(path=path):
                initializer = load_initializer(path)
                initializer.get_existing_index_pattern = Mock(return_value="pattern-id")

                result = initializer.create_index_pattern(
                    "workspace-id",
                    "logs-*",
                )

                self.assertEqual("pattern-id", result)
                initializer.requests.put.assert_not_called()
                initializer.requests.post.assert_not_called()

    def test_creates_new_pattern_with_supplied_metadata(self):
        for path in INITIALIZER_PATHS:
            with self.subTest(path=path):
                initializer = load_initializer(path)
                initializer.get_existing_index_pattern = Mock(return_value=None)
                initializer.requests.post.return_value.status_code = 200
                initializer.requests.post.return_value.json.return_value = {
                    "id": "new-pattern-id"
                }

                result = initializer.create_index_pattern(
                    "workspace-id",
                    "logs-*",
                    time_field="@timestamp",
                    signal_type="logs",
                )

                self.assertEqual("new-pattern-id", result)
                initializer.requests.post.assert_called_once_with(
                    f"{initializer.BASE_URL}/w/workspace-id/api/saved_objects/"
                    "index-pattern",
                    auth=(initializer.USERNAME, initializer.PASSWORD),
                    headers={
                        "Content-Type": "application/json",
                        "osd-xsrf": "true",
                    },
                    json={
                        "attributes": {
                            "title": "logs-*",
                            "timeFieldName": "@timestamp",
                            "signalType": "logs",
                        }
                    },
                    verify=False,
                    timeout=10,
                )
                initializer.requests.put.assert_not_called()


class EnsureEvaluationIndexTests(unittest.TestCase):
    COMPOSE_INITIALIZER = INITIALIZER_PATHS[0]
    EVALUATION_FILES_DIR = REPOSITORY_ROOT / "docker-compose/data-prepper"

    def setUp(self):
        self.initializer = load_initializer(self.COMPOSE_INITIALIZER)
        self.initializer.EVALUATION_FILES_DIR = str(self.EVALUATION_FILES_DIR)
        self.endpoint = self.initializer.OPENSEARCH_ENDPOINT

    def _routes(self, routes):
        def respond(method):
            def call(url, **kwargs):
                status, body = routes.get((method, url.replace(self.endpoint, "")), (404, {}))
                return Mock(status_code=status, text=str(body), json=Mock(return_value=body))
            return call
        self.initializer.requests.get.side_effect = respond("GET")
        self.initializer.requests.put.side_effect = respond("PUT")

    def test_creates_policy_template_and_write_index_in_order(self):
        self._routes({
            ("PUT", "/_plugins/_ism/policies/otel-v1-genai-evaluation-policy"): (201, {}),
            ("PUT", "/_index_template/otel-v1-genai-evaluation-index-template"): (200, {}),
            ("PUT", "/otel-v1-genai-evaluation-000001"): (200, {}),
        })
        self.assertTrue(self.initializer.ensure_evaluation_index())
        puts = [c.args[0].replace(self.endpoint, "") for c in self.initializer.requests.put.call_args_list]
        self.assertEqual(puts, [
            "/_plugins/_ism/policies/otel-v1-genai-evaluation-policy",
            "/_index_template/otel-v1-genai-evaluation-index-template",
            "/otel-v1-genai-evaluation-000001",
        ])
        policy = self.initializer.requests.put.call_args_list[0].kwargs["json"]["policy"]
        # ISM_RETENTION_DAYS (default 7) applies to evaluations like the other indices
        self.assertEqual(policy["states"][-1], {"name": "delete", "actions": [{"delete": {}}], "transitions": []})
        self.assertEqual(policy["states"][0]["transitions"],
                         [{"state_name": "delete", "conditions": {"min_index_age": f"{self.initializer.ISM_RETENTION_DAYS}d"}}])
        self.assertEqual(
            {"aliases": {"otel-v1-genai-evaluation": {"is_write_index": True}}},
            self.initializer.requests.put.call_args_list[2].kwargs["json"],
        )

    def test_retention_zero_keeps_the_rollover_only_policy(self):
        base = json.loads((REPOSITORY_ROOT / "docker-compose/data-prepper/otel-v1-genai-evaluation-policy.json").read_text())
        self.assertEqual(self.initializer.evaluation_policy(base, 0), base)
        self.assertNotIn("delete", json.dumps(base))  # the shared file is not changed

    def test_matches_the_aws_installer_policy(self):
        node = shutil.which("node")
        cli = REPOSITORY_ROOT / "aws/cli-installer/src/evaluation-index.mjs"
        if not node or not cli.exists():
            self.skipTest("node or the CLI installer is not available")
        base = json.loads((REPOSITORY_ROOT / "docker-compose/data-prepper/otel-v1-genai-evaluation-policy.json").read_text())
        for days in (0, 7, 30):
            out = subprocess.run(
                [node, "--input-type=module", "-e",
                 f"import {{ evaluationPolicy }} from {json.dumps(cli.as_uri())}; console.log(JSON.stringify(evaluationPolicy({days})))"],
                capture_output=True, text=True, check=True,
            ).stdout
            self.assertEqual(self.initializer.evaluation_policy(base, days), json.loads(out), f"{days} days")

    def test_skips_existing_objects(self):
        self._routes({
            ("GET", "/_plugins/_ism/policies/otel-v1-genai-evaluation-policy"): (200, {}),
            ("GET", "/_index_template/otel-v1-genai-evaluation-index-template"): (
                200, {"index_templates": [{"index_template": {"version": 1}}]}),
            ("GET", "/_alias/otel-v1-genai-evaluation"): (200, {}),
        })
        self.assertTrue(self.initializer.ensure_evaluation_index())
        self.initializer.requests.put.assert_not_called()

    def test_leaves_a_concrete_index_with_the_alias_name(self):
        self._routes({
            ("GET", "/_plugins/_ism/policies/otel-v1-genai-evaluation-policy"): (200, {}),
            ("GET", "/_index_template/otel-v1-genai-evaluation-index-template"): (
                200, {"index_templates": [{"index_template": {"version": 1}}]}),
            ("GET", "/otel-v1-genai-evaluation"): (200, {}),
        })
        self.assertFalse(self.initializer.ensure_evaluation_index())
        self.initializer.requests.put.assert_not_called()

    def test_evaluation_index_mode_retries_until_ready(self):
        self.initializer.time.sleep = Mock()
        self.initializer.ensure_evaluation_index = Mock(side_effect=[False, False, True])
        self._routes({})
        self.assertTrue(self.initializer.run_evaluation_index_init(attempts=5, delay_seconds=0))
        self.assertEqual(3, self.initializer.ensure_evaluation_index.call_count)

    def test_evaluation_index_mode_accepts_a_concrete_index(self):
        self.initializer.time.sleep = Mock()
        self.initializer.ensure_evaluation_index = Mock(return_value=False)
        self._routes({("GET", "/otel-v1-genai-evaluation"): (200, {})})
        self.assertTrue(self.initializer.run_evaluation_index_init(attempts=5, delay_seconds=0))
        self.assertEqual(1, self.initializer.ensure_evaluation_index.call_count)

    def test_evaluation_index_mode_gives_up(self):
        self.initializer.time.sleep = Mock()
        self.initializer.ensure_evaluation_index = Mock(return_value=False)
        self._routes({})
        self.assertFalse(self.initializer.run_evaluation_index_init(attempts=3, delay_seconds=0))


class ChartEnsureEvaluationIndexTests(EnsureEvaluationIndexTests):
    """The Helm chart runs the same evaluation index setup from its own copy of the files."""

    COMPOSE_INITIALIZER = INITIALIZER_PATHS[1]
    EVALUATION_FILES_DIR = REPOSITORY_ROOT / "charts/observability-stack/files/genai-evaluation"


class ChartEvaluationSyncTests(unittest.TestCase):
    """The chart's init script and evaluation files must not drift from docker compose."""

    COMPOSE_FILES = REPOSITORY_ROOT / "docker-compose/data-prepper"
    CHART_FILES = REPOSITORY_ROOT / "charts/observability-stack/files/genai-evaluation"

    @staticmethod
    def _evaluation_block(path):
        text = path.read_text()
        start = text.index("# GenAI evaluation results (Agent Evaluations)")
        return text[start:text.index("def wait_for_dashboards():", start)]

    def test_evaluation_code_is_identical(self):
        compose, chart = INITIALIZER_PATHS
        self.assertEqual(self._evaluation_block(compose), self._evaluation_block(chart))
        for path in INITIALIZER_PATHS:
            text = path.read_text()
            with self.subTest(path=path.name, parent=path.parent.name):
                self.assertIn('elif mode == "evaluation-index":', text)
                self.assertIn("    ensure_evaluation_index()\n", text)

    def test_evaluation_files_are_identical(self):
        for name in ("otel-v1-genai-evaluation-index-template.json", "otel-v1-genai-evaluation-policy.json"):
            with self.subTest(file=name):
                self.assertEqual((self.COMPOSE_FILES / name).read_text(), (self.CHART_FILES / name).read_text())


class DataPrepperEvaluationTemplateTests(unittest.TestCase):
    """The local pipeline inlines the same template the init job and the AWS installer install."""

    def test_inlined_template_matches_the_template_file(self):
        directory = REPOSITORY_ROOT / "docker-compose/data-prepper"
        lines = (directory / "pipelines.template.yaml").read_text().splitlines()
        start = next(i for i, line in enumerate(lines) if line.strip() == "template_content: |")
        indent = len(lines[start]) - len(lines[start].lstrip()) + 2
        block = []
        for line in lines[start + 1:]:
            if line.strip() and len(line) - len(line.lstrip()) < indent:
                break
            block.append(line[indent:])
        inlined = json.loads("\n".join(block))
        expected = json.loads((directory / "otel-v1-genai-evaluation-index-template.json").read_text())
        expected.pop("index_patterns")
        self.assertEqual(expected, inlined)
        for target in ("aws/cli-installer/src", "aws/cdk/lib"):
            path = REPOSITORY_ROOT / target / "genai-evaluation/otel-v1-genai-evaluation-index-template.json"
            if path.exists():
                with self.subTest(target=target):
                    aws = json.loads(path.read_text())
                    aws.pop("index_patterns", None)
                    self.assertEqual(expected, aws)


if __name__ == "__main__":
    unittest.main()
