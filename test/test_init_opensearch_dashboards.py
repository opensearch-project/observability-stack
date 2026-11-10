import importlib.util
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

    def setUp(self):
        self.initializer = load_initializer(self.COMPOSE_INITIALIZER)
        self.initializer.EVALUATION_FILES_DIR = str(REPOSITORY_ROOT / "docker-compose/data-prepper")
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
        policy = self.initializer.requests.put.call_args_list[0].kwargs["json"]
        self.assertNotIn('"delete"', str(policy).replace("'", '"'))
        self.assertEqual(
            {"aliases": {"otel-v1-genai-evaluation": {"is_write_index": True}}},
            self.initializer.requests.put.call_args_list[2].kwargs["json"],
        )

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


if __name__ == "__main__":
    unittest.main()
