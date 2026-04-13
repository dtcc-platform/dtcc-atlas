"""Tests for main app API endpoints (with dtcc_core mocked)."""

from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from server.main import app


@pytest.fixture
def app_client():
    """TestClient for the full app (dtcc_core already mocked in conftest)."""
    return TestClient(app, raise_server_exceptions=False)


class TestMainEndpoints:
    def test_list_datasets_returns_200(self, app_client):
        resp = app_client.get("/api/v1/datasets/list")
        assert resp.status_code == 200
        data = resp.json()
        assert "datasets" in data

    def test_get_args_nonexistent_returns_404(self, app_client):
        resp = app_client.get("/api/v1/datasets/get_args/nonexistent")
        assert resp.status_code == 404

    def test_download_unknown_dataset_returns_404(self, app_client):
        resp = app_client.post(
            "/api/v1/datasets/download",
            json={
                "dataset": "nonexistent",
                "bounds": [0, 0, 1, 1],
                "parameters": {},
            },
        )
        assert resp.status_code == 404

    def test_download_missing_fields_returns_422(self, app_client):
        # Missing required 'bounds' and 'parameters' fields
        resp = app_client.post(
            "/api/v1/datasets/download",
            json={"dataset": "test"},
        )
        assert resp.status_code == 422

    def test_datasets_list_contains_datasets_key(self, app_client):
        resp = app_client.get("/api/v1/datasets/list")
        data = resp.json()
        assert isinstance(data["datasets"], list)

    def test_list_datasets_preserves_dtcc_sim_grouping(self, app_client):
        class FakeSimDataset:
            def show_options(self):
                return {"properties": {"format": {"enum": ["geojson"]}}}

        class FakeCoreDataset:
            def show_options(self):
                return {"properties": {"format": {"enum": ["geojson"]}}}

        FakeSimDataset.__module__ = "dtcc_sim.datasets.mock"
        FakeCoreDataset.__module__ = "dtcc_core.datasets.mock"

        with (
            patch("server.main.available_dataset_names", ["sim_data", "core_data"]),
            patch(
                "server.main.available_datasets",
                {
                    "sim_data": FakeSimDataset(),
                    "core_data": FakeCoreDataset(),
                },
            ),
        ):
            resp = app_client.get("/api/v1/datasets/list")

        assert resp.status_code == 200
        datasets = {item["name"]: item for item in resp.json()["datasets"]}

        assert datasets["sim_data"]["source_group"] == "dtcc-sim"
        assert datasets["sim_data"]["source_label"] == "DTCC Sim"
        assert datasets["core_data"]["source_group"] == "dtcc-core"
