"""Tests for quality-check API endpoints wired into the upload router."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import server.upload.service as _svc_mod
from server.upload.catalog import UploadCatalog
from server.upload.routes import create_upload_router


@pytest.fixture()
def app_client(tmp_path: Path):
    """Create a FastAPI TestClient with isolated catalog and a seeded batch.

    - Patches catalog paths (CATALOG_DB_PATH, CATALOG_DATASETS_DIR, UPLOAD_RAW_DIR)
      to use tmp_path so the real filesystem is untouched.
    - Resets the ``_catalog_singleton`` so a fresh catalog is created.
    - Creates a batch with one candidate already in the DB.
    - Yields a ``TestClient`` for the app that includes the upload router.
    """
    db_path = tmp_path / "catalog.db"
    datasets_dir = tmp_path / "datasets"
    datasets_dir.mkdir()
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()

    # Reset singleton so the patched path takes effect
    _svc_mod._catalog_singleton = None

    with (
        patch("server.upload.service.CATALOG_DB_PATH", db_path),
        patch("server.upload.routes.CATALOG_DATASETS_DIR", str(datasets_dir)),
        patch("server.upload.routes.UPLOAD_RAW_DIR", str(raw_dir)),
    ):
        # Force singleton creation with the patched path
        catalog = _svc_mod.get_catalog()

        # Seed a batch
        batch_id = "test-batch-qc"
        batch_root = raw_dir / batch_id
        batch_root.mkdir(parents=True, exist_ok=True)

        catalog.create_batch(
            batch_id=batch_id,
            name="QC API Test Batch",
            root_dir=str(batch_root),
            file_count=1,
            total_bytes=300,
            status="scanned",
        )

        # Seed batch files (needed for duplicate-detection in quality gate)
        catalog.add_batch_files(
            batch_id,
            [
                {
                    "id": "f-api-1",
                    "rel_path": "buildings.geojson",
                    "abs_path": str(batch_root / "buildings.geojson"),
                    "ext": ".geojson",
                    "size": 300,
                    "sha256": "deadbeef",
                }
            ],
        )

        # Seed a candidate
        catalog.replace_candidates(
            batch_id,
            [
                {
                    "id": "cand-api-1",
                    "candidate_key": "buildings",
                    "name": "buildings",
                    "title": "Buildings",
                    "inferred_type": "vector",
                    "role": "building",
                    "confidence": "high",
                    "primary_rel_path": "buildings.geojson",
                    "group_rel_paths": ["buildings.geojson"],
                    "warnings": [],
                    "metadata": {"crs": "EPSG:3006"},
                    "detected_format": "geojson",
                }
            ],
        )

        app = FastAPI()
        app.include_router(create_upload_router())
        client = TestClient(app)

        yield client

    # Clean up singleton after the test
    _svc_mod._catalog_singleton = None


def test_quality_check_endpoint_returns_result(app_client: TestClient):
    """POST quality-check should call run_quality_gate and return the result."""
    mock_claude_result = {
        "candidates": [
            {
                "name": "buildings",
                "verdict": "pass",
                "issues": [],
                "metadata": {"crs": "EPSG:3006", "bounds": [11, 57, 12, 58]},
                "thumbnail_path": None,
                "summary": "Looks good.",
            }
        ]
    }

    with patch(
        "server.upload.quality_gate.run_claude_quality_check",
        return_value=mock_claude_result,
    ):
        resp = app_client.post("/uploads/batches/test-batch-qc/quality-check")

    assert resp.status_code == 200
    data = resp.json()
    assert data["batch_id"] == "test-batch-qc"
    assert data["status"] == "completed"
    assert data["result"] is not None
    assert data["result"]["candidates"][0]["verdict"] == "pass"


def test_quality_check_endpoint_404_for_missing_batch(app_client: TestClient):
    """POST quality-check with a nonexistent batch_id should return 404."""
    resp = app_client.post("/uploads/batches/no-such-batch/quality-check")
    assert resp.status_code == 404
