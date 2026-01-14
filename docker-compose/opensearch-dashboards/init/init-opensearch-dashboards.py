#!/usr/bin/env python3

import os
import time
import requests

BASE_URL = "http://opensearch-dashboards:5601"
USERNAME = os.getenv("OPENSEARCH_USER", "admin")
PASSWORD = os.getenv("OPENSEARCH_PASSWORD", "admin")
PROMETHEUS_HOST = os.getenv("PROMETHEUS_HOST", "prometheus")
PROMETHEUS_PORT = os.getenv("PROMETHEUS_PORT", "9090")

def wait_for_dashboards():
    """Wait for OpenSearch Dashboards to be ready"""
    print("🔄 Initializing OpenSearch workspace...")

    while True:
        try:
            response = requests.get(
                f"{BASE_URL}/api/status", auth=(USERNAME, PASSWORD), timeout=5
            )
            if response.status_code == 200:
                break
        except requests.exceptions.RequestException:
            pass

        print("⏳ Waiting for OpenSearch Dashboards...")
        time.sleep(5)

def get_existing_workspace():
    """Check if ATLAS workspace already exists"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/workspaces/_list",
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json", "osd-xsrf": "true"},
            json={},
            verify=False,
            timeout=10,
        )
        print(f"Workspace list response: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                workspaces = result.get("result", {}).get("workspaces", [])
                for workspace in workspaces:
                    if workspace.get("name") == "ATLAS Observability":
                        return workspace.get("id")
        elif response.status_code == 404:
            print("⚠️  Workspace API not available - workspaces may not be supported in this version")
            return None
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error checking workspaces: {e}")
    return None

def create_workspace():
    """Create new ATLAS workspace"""
    print("🏗️  Creating ATLAS workspace...")

    payload = {
        "attributes": {
            "name": "ATLAS Observability",
            "description": "AI Agent observability workspace with logs, traces, and metrics",
            "features": ["use-case-observability"]
        }
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/workspaces",
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json", "osd-xsrf": "true"},
            json=payload,
            verify=False,
            timeout=10,
        )

        print(f"Create workspace response: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                workspace_id = result.get("result", {}).get("id")
                if workspace_id:
                    print(f"✅ Created workspace: {workspace_id}")
                    return workspace_id
        elif response.status_code == 404:
            print("⚠️  Workspace API not available - using default dashboard")
            return "default"
        else:
            print(f"⚠️  Workspace creation failed: {response.text}")
            return "default"
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error creating workspace: {e}")
        return "default"

def create_index_pattern(workspace_id, title, time_field=None):
    """Create index pattern in workspace and return its ID"""
    payload = {
        "attributes": {
            "title": title
        }
    }

    # Only add timeFieldName if time_field is provided
    if time_field:
        payload["attributes"]["timeFieldName"] = time_field

    # Use workspace-specific URL if workspace exists, otherwise use default
    if workspace_id and workspace_id != "default":
        url = f"{BASE_URL}/w/{workspace_id}/api/saved_objects/index-pattern"
    else:
        url = f"{BASE_URL}/api/saved_objects/index-pattern"

    try:
        response = requests.post(
            url,
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json", "osd-xsrf": "true"},
            json=payload,
            verify=False,
            timeout=10,
        )
        print(f"Index pattern {title} creation: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            pattern_id = result.get("id")
            if pattern_id:
                return pattern_id
        return None
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error creating index pattern {title}: {e}")
        return None


def create_prometheus_datasource(workspace_id):
    """Create Prometheus datasource"""
    print("🔧 Creating Prometheus datasource...")

    prometheus_endpoint = f"http://{PROMETHEUS_HOST}:{PROMETHEUS_PORT}"

    payload = {
        "attributes": {
            "dataSourceEngineType": "Prometheus",
            "title": "ATLAS Prometheus",
            "endpoint": prometheus_endpoint,
            "auth": {"type": "no_auth"},
        }
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/saved_objects/data-source",
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json", "osd-xsrf": "true"},
            json=payload,
            verify=False,
            timeout=10,
        )

        print(f"Prometheus datasource creation: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            datasource_id = result.get("id")
            if datasource_id:
                print(f"✅ Created Prometheus datasource: {datasource_id}")

                # Associate with workspace if provided
                if workspace_id and workspace_id != "default":
                    associate_datasource_with_workspace(workspace_id, datasource_id)
                return datasource_id
        else:
            print(f"⚠️  Prometheus datasource creation failed: {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error creating Prometheus datasource: {e}")
        return None


def associate_datasource_with_workspace(workspace_id, datasource_id):
    """Associate datasource with workspace"""
    print(f"🔗 Associating datasource with workspace {workspace_id}...")

    payload = {
        "workspaceId": workspace_id,
        "savedObjects": [{"type": "data-source", "id": datasource_id}],
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/workspaces/_associate",
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json", "osd-xsrf": "true"},
            json=payload,
            verify=False,
            timeout=10,
        )

        print(f"Datasource association: {response.status_code}")

        if response.status_code == 200:
            print("✅ Datasource associated with workspace")
        else:
            print(f"⚠️  Association failed: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error associating datasource: {e}")


def set_default_index_pattern(workspace_id, pattern_id):
    """Set the default index pattern"""
    print(f"⭐ Setting default index pattern: {pattern_id}")

    # Use workspace-specific URL if workspace exists, otherwise use default
    if workspace_id and workspace_id != "default":
        url = f"{BASE_URL}/w/{workspace_id}/api/opensearch-dashboards/settings/defaultIndex"
    else:
        url = f"{BASE_URL}/api/opensearch-dashboards/settings/defaultIndex"

    payload = {"value": pattern_id}

    try:
        response = requests.post(
            url,
            auth=(USERNAME, PASSWORD),
            headers={"Content-Type": "application/json", "osd-xsrf": "true"},
            json=payload,
            verify=False,
            timeout=10,
        )

        print(f"Set default index pattern: {response.status_code}")

        if response.status_code == 200:
            print("✅ Default index pattern set to logs-otel-v1-*")
        else:
            print(f"⚠️  Setting default failed: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error setting default index pattern: {e}")


def main():
    """Initialize OpenSearch Dashboards with workspace and datasources"""
    wait_for_dashboards()

    # Check for existing workspace
    workspace_id = get_existing_workspace()

    if workspace_id:
        print("✅ ATLAS workspace already exists")
    else:
        workspace_id = create_workspace()

        # Create index patterns
        logs_pattern_id = create_index_pattern(workspace_id, "logs-otel-v1-*", "time")
        create_index_pattern(workspace_id, "otel-v1-apm-span-*", "startTime")
        create_index_pattern(workspace_id, "otel-v1-apm-service-map")

        print("📊 Created index patterns for spans, logs, and service map")

        # Set logs as the default index pattern
        if logs_pattern_id:
            set_default_index_pattern(workspace_id, logs_pattern_id)

    # Create Prometheus datasource
    create_prometheus_datasource(workspace_id)

    # Output summary
    print()
    print("🎉 ATLAS Stack Ready!")
    print(f"👤 Username: {USERNAME}")
    print(f"🔑 Password: {PASSWORD}")

    # Generate appropriate dashboard URL
    if workspace_id and workspace_id != "default":
        dashboard_url = f"http://localhost:5601/w/{workspace_id}/app/explore/logs"
    else:
        dashboard_url = "http://localhost:5601/app/home"

    print(f"\033[1m📊 OpenSearch Dashboards: {dashboard_url}\033[0m")
    print(f"📈 Prometheus: http://localhost:{PROMETHEUS_PORT}")
    print()

if __name__ == "__main__":
    main()
