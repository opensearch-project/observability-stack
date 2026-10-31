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


if __name__ == "__main__":
    unittest.main()
