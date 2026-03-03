"""Tests for vector API endpoints via TestClient."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from server.vector.routes import create_vector_router


@pytest.fixture
def vector_app(published_dataset_dir):
    """Create a FastAPI app with just the vector router, patching the published dir."""
    app = FastAPI()

    with patch("server.vector.discovery.PUBLISHED_DATASETS_DIR", published_dataset_dir):
        router = create_vector_router()
        app.include_router(router, prefix="/api/v1")

    # Also patch discovery at request time
    with patch("server.vector.routes.discover_published_datasets") as mock_discover, \
         patch("server.vector.routes.get_dataset_metadata") as mock_meta, \
         patch("server.vector.routes.get_dataset_geojson_path") as mock_geojson:

        # Set up mock responses based on published_dataset_dir content
        meta_path = published_dataset_dir / "test-dataset" / "metadata.json"
        metadata = json.loads(meta_path.read_text())

        mock_discover.return_value = [
            {"name": "test-dataset", "title": "Test Dataset", "type": "vector", "source": "test"}
        ]
        mock_meta.side_effect = lambda name: metadata if name == "test-dataset" else None
        mock_geojson.side_effect = lambda name: (
            published_dataset_dir / "test-dataset" / "data.geojson"
            if name == "test-dataset"
            else None
        )

        yield TestClient(app)


class TestVectorEndpoints:
    def test_list_datasets(self, vector_app):
        resp = vector_app.get("/api/v1/vector/datasets")
        assert resp.status_code == 200
        data = resp.json()
        assert "datasets" in data
        assert len(data["datasets"]) == 1

    def test_list_empty(self, tmp_path):
        app = FastAPI()
        with patch("server.vector.discovery.PUBLISHED_DATASETS_DIR", tmp_path):
            router = create_vector_router()
            app.include_router(router, prefix="/api/v1")
        with patch("server.vector.routes.discover_published_datasets", return_value=[]):
            client = TestClient(app)
            resp = client.get("/api/v1/vector/datasets")
            assert resp.status_code == 200
            assert resp.json()["datasets"] == []

    def test_get_schema_found(self, vector_app):
        resp = vector_app.get("/api/v1/vector/datasets/test-dataset/schema")
        assert resp.status_code == 200
        schema = resp.json()
        assert "properties" in schema

    def test_get_schema_not_found(self, vector_app):
        resp = vector_app.get("/api/v1/vector/datasets/nonexistent/schema")
        assert resp.status_code == 404

    def test_get_metadata_found(self, vector_app):
        resp = vector_app.get("/api/v1/vector/datasets/test-dataset/metadata")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "test-dataset"

    def test_get_metadata_not_found(self, vector_app):
        resp = vector_app.get("/api/v1/vector/datasets/nonexistent/metadata")
        assert resp.status_code == 404

    def test_post_data_returns_geojson(self, vector_app):
        resp = vector_app.post(
            "/api/v1/vector/datasets/test-dataset",
            json={"bounds": [11, 57, 12, 58]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"
        # Point at [11.97, 57.71] is inside, point at [15, 60] is outside
        assert len(data["features"]) == 1

    def test_post_data_not_found(self, vector_app):
        resp = vector_app.post(
            "/api/v1/vector/datasets/nonexistent",
            json={"bounds": [0, 0, 1, 1]},
        )
        assert resp.status_code == 404
